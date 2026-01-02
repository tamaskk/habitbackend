import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Habit from '../../../models/Habit';
import { verifyToken } from '../../../lib/jwt';
import mongoose from 'mongoose';

type Data = {
  success: boolean;
  message?: string;
  habit?: any;
};

function setCorsHeaders(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    await connectDB();

    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    const { habitId, date, progress, increment } = req.body;

    if (!habitId || date === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide habitId and date',
      });
    }

    // Use lean() to get raw MongoDB data - Mongoose documents don't properly read progress field
    const habit = await Habit.findOne({
      _id: habitId,
      userId: payload.userId,
    }).lean();

    if (!habit) {
      return res.status(404).json({
        success: false,
        message: 'Habit not found',
      });
    }
    
    // Convert to typed object for easier access
    const habitData = habit as any;

    // Parse and normalize the date to UTC midnight
    const targetDate = new Date(date);
    const targetDateUTC = new Date(Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate()
    ));
    
    // Check if date is in the future
    const today = new Date();
    const todayUTC = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate()
    ));

    if (targetDateUTC > todayUTC) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update progress for future dates',
      });
    }

    // Find existing completion entry
    const dateStringUTC = targetDateUTC.toISOString().split('T')[0];
    console.log('=== BACKEND: UPDATE PROGRESS ===');
    console.log('HabitId:', habitId);
    console.log('Target date:', dateStringUTC);
    console.log('Increment:', increment, 'Progress:', progress);
    console.log('Goal:', habitData.goal);
    console.log('Current completions count:', (habitData.completions || []).length);
    
    const completions = habitData.completions || [];
    const existingIndex = completions.findIndex((c: any) => {
      const completionDate = new Date(c.date);
      const completionDateUTC = new Date(Date.UTC(
        completionDate.getUTCFullYear(),
        completionDate.getUTCMonth(),
        completionDate.getUTCDate()
      ));
      return completionDateUTC.toISOString().split('T')[0] === dateStringUTC;
    });

    console.log('Existing completion index:', existingIndex);
    if (existingIndex >= 0) {
      console.log('Existing completion:', {
        date: completions[existingIndex].date,
        progress: completions[existingIndex].progress,
        completed: completions[existingIndex].completed,
      });
    }

    let newProgress: number;
    
    if (increment !== undefined) {
      // Increment/decrement mode
      // Explicitly check for undefined/null, preserve 0 as valid value
      let currentProgress = 0;
      if (existingIndex >= 0) {
        const existingProgress = completions[existingIndex].progress;
        currentProgress = (existingProgress !== undefined && existingProgress !== null) 
          ? Number(existingProgress) 
          : 0;
      }
      console.log('Current progress:', currentProgress, 'Increment:', increment);
      newProgress = Math.max(0, Math.min(habitData.goal, currentProgress + Number(increment))); // Clamp to goal
      console.log('New progress:', newProgress);
    } else if (progress !== undefined) {
      // Set absolute value
      newProgress = Math.max(0, Math.min(habitData.goal, Number(progress))); // Clamp to goal
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide either progress or increment',
      });
    }

    // Ensure newProgress is a valid number (never NaN or undefined)
    if (isNaN(newProgress) || newProgress === undefined || newProgress === null) {
      console.error(`ERROR: newProgress is invalid: ${newProgress} (type: ${typeof newProgress})`);
      return res.status(400).json({
        success: false,
        message: 'Invalid progress value calculated',
      });
    }
    
    // Check if goal is reached - always calculate based on NEW progress value
    // This ensures that when decrementing from goal, completed is set to false immediately
    const isCompleted = newProgress >= habitData.goal;
    console.log(`Is completed: ${isCompleted} (newProgress: ${newProgress}, goal: ${habitData.goal})`);
    
    // Log the current state for debugging
    if (existingIndex >= 0) {
      const oldProgress = completions[existingIndex].progress;
      const oldCompleted = completions[existingIndex].completed;
      console.log(`Current state - Old progress: ${oldProgress}, Old completed: ${oldCompleted}`);
      console.log(`New state - New progress: ${newProgress}, New completed: ${isCompleted}`);
    }
    console.log('Final newProgress value:', newProgress, 'type:', typeof newProgress);

    // Note: We don't update in-memory habit since we're using lean() - we'll reload after save

    // Use MongoDB's update operators to explicitly save progress
    // Use date range query to match the date (start of day to end of day)
    const startOfDay = new Date(targetDateUTC);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDateUTC);
    endOfDay.setUTCHours(23, 59, 59, 999);
    
    console.log('MongoDB date range query:');
    console.log('  Start:', startOfDay.toISOString());
    console.log('  End:', endOfDay.toISOString());
    
    let mongoUpdateSucceeded = false;
    
    if (existingIndex >= 0) {
      // Replace the entire completion object - MongoDB's $set with positional operator
      // doesn't create fields that don't exist, so we need to replace the whole object
      console.log('Replacing entire completion object using arrayFilters...');
      const progressValue = Number(newProgress);
      const completedValue = Boolean(isCompleted);
      
      console.log(`About to update MongoDB - progressValue: ${progressValue} (type: ${typeof progressValue}), completedValue: ${completedValue}, newProgress: ${newProgress}`);
      
      // Use arrayFilters to replace the entire completion object
      const replaceResult = await Habit.updateOne(
        {
          _id: habitId,
          userId: payload.userId,
        },
        {
          $set: {
            'completions.$[elem].progress': progressValue,
            'completions.$[elem].completed': completedValue,
            'completions.$[elem].date': targetDateUTC, // Ensure date is set
          },
        },
        {
          arrayFilters: [
            {
              'elem.date': {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            },
          ],
        }
      );
      
      console.log(`ArrayFilters replace - Matched: ${replaceResult.matchedCount}, Modified: ${replaceResult.modifiedCount}`);
      console.log(`Update operation attempted to set progress to: ${progressValue}`);
      
      if (replaceResult.matchedCount > 0 && replaceResult.modifiedCount > 0) {
        // Verify the update worked - add a small delay to ensure MongoDB has committed
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay for MongoDB commit
        
        const verifyHabit = await Habit.findOne({
          _id: habitId,
          userId: payload.userId,
        }).lean();
        
        if (verifyHabit) {
          const verifyCompletion = (verifyHabit as any).completions.find((c: any) => {
            const compDate = new Date(c.date);
            const compDateUTC = new Date(Date.UTC(
              compDate.getUTCFullYear(),
              compDate.getUTCMonth(),
              compDate.getUTCDate()
            ));
            return compDateUTC.getTime() >= startOfDay.getTime() && compDateUTC.getTime() <= endOfDay.getTime();
          });
          
          if (verifyCompletion) {
            console.log(`Verification - Found completion: progress=${verifyCompletion.progress}, completed=${verifyCompletion.completed}, expected progress=${progressValue}`);
            
            if (verifyCompletion.progress !== undefined && verifyCompletion.progress !== null) {
              // Check if the progress matches what we tried to set
              if (verifyCompletion.progress === progressValue) {
                mongoUpdateSucceeded = true;
                console.log(`MongoDB arrayFilters successful - Progress saved: ${verifyCompletion.progress}`);
              } else {
                console.log(`MongoDB arrayFilters WARNING - Progress mismatch! Expected: ${progressValue}, Got: ${verifyCompletion.progress}`);
                console.log(`MongoDB arrayFilters failed verification - will use Mongoose save() backup`);
                // Don't mark as succeeded - let it fall through to Mongoose save() backup
                mongoUpdateSucceeded = false;
              }
            } else {
              console.log(`MongoDB arrayFilters matched but progress still undefined in verification - will use Mongoose save() backup`);
              mongoUpdateSucceeded = false;
            }
          } else {
            console.log(`MongoDB arrayFilters matched but could not find completion in verification - will use Mongoose save() backup`);
            mongoUpdateSucceeded = false;
          }
        }
      }
      
      // If arrayFilters didn't work, try findOneAndUpdate with positional $ operator
      if (!mongoUpdateSucceeded) {
        console.log('MongoDB arrayFilters failed verification, trying findOneAndUpdate with positional $ operator...');
        
        // Try using findOneAndUpdate with positional $ operator (more reliable than arrayFilters)
        const progressValue = Number(newProgress);
        const completedValue = Boolean(isCompleted);
        
        const findAndUpdateResult = await Habit.findOneAndUpdate(
          {
            _id: habitId,
            userId: payload.userId,
            'completions.date': {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          },
          {
            $set: {
              'completions.$.progress': progressValue,
              'completions.$.completed': completedValue,
              'completions.$.date': targetDateUTC,
            },
          },
          {
            new: true, // Return updated document
          }
        );
        
        if (findAndUpdateResult) {
          // Verify it worked
          await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for MongoDB commit
          const verifyHabit = await Habit.findById(habitId).lean();
          
          if (verifyHabit) {
            const verifyCompletion = (verifyHabit as any).completions.find((c: any) => {
              const compDate = new Date(c.date);
              const compDateUTC = new Date(Date.UTC(
                compDate.getUTCFullYear(),
                compDate.getUTCMonth(),
                compDate.getUTCDate()
              ));
              return compDateUTC.getTime() >= startOfDay.getTime() && compDateUTC.getTime() <= endOfDay.getTime();
            });
            
            if (verifyCompletion && verifyCompletion.progress === progressValue) {
              mongoUpdateSucceeded = true;
              console.log(`findOneAndUpdate successful - Progress saved: ${verifyCompletion.progress}`);
            } else {
              console.log(`findOneAndUpdate verification failed - Expected: ${progressValue}, Got: ${verifyCompletion?.progress}`);
            }
          }
        } else {
          console.log('findOneAndUpdate did not find matching document');
        }
        
        if (!mongoUpdateSucceeded) {
          console.log('findOneAndUpdate failed, will use Mongoose save() as backup');
        }
      }
    } else {
      // Add new completion
      const progressToPush = Number(newProgress);
      console.log(`Pushing new completion to MongoDB - newProgress: ${newProgress}, progressToPush: ${progressToPush}, type: ${typeof progressToPush}`);
      const pushResult = await Habit.updateOne(
        {
          _id: habitId,
          userId: payload.userId,
        },
        {
          $push: {
            completions: {
              date: targetDateUTC,
              completed: Boolean(isCompleted), // Explicitly convert to boolean
              progress: progressToPush, // Use explicitly converted number
            },
          },
        }
      );
      console.log(`Added new completion using $push - Matched: ${pushResult.matchedCount}, Modified: ${pushResult.modifiedCount}`);
      if (pushResult.matchedCount > 0 && pushResult.modifiedCount > 0) {
        mongoUpdateSucceeded = true;
        console.log(`MongoDB $push succeeded - progress value pushed: ${progressToPush}`);
      }
    }
    
    // Only use Mongoose save() as backup if MongoDB update didn't work
    if (!mongoUpdateSucceeded) {
      console.log('MongoDB update failed, using Mongoose updateOne with exact path as backup...');
      
      // Try using Mongoose updateOne with the exact subdocument path
      const progressValue = Number(newProgress);
      const pathUpdateResult = await Habit.updateOne(
        {
          _id: habitId,
          userId: payload.userId,
          'completions.date': {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        },
        {
          $set: {
            'completions.$[elem].progress': progressValue,
            'completions.$[elem].completed': Boolean(isCompleted),
          },
        },
        {
          arrayFilters: [
            {
              'elem.date': {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            },
          ],
        }
      );
      
      console.log(`Mongoose updateOne with arrayFilters - Matched: ${pathUpdateResult.matchedCount}, Modified: ${pathUpdateResult.modifiedCount}`);
      
      if (pathUpdateResult.matchedCount > 0 && pathUpdateResult.modifiedCount > 0) {
        // Verify it worked
        const verifyHabit = await Habit.findById(habitId).lean();
        if (verifyHabit) {
          const verifyCompletion = (verifyHabit as any).completions.find((c: any) => {
            const compDate = new Date(c.date);
            const compDateUTC = new Date(Date.UTC(
              compDate.getUTCFullYear(),
              compDate.getUTCMonth(),
              compDate.getUTCDate()
            ));
            return compDateUTC.getTime() >= startOfDay.getTime() && compDateUTC.getTime() <= endOfDay.getTime();
          });
          
          if (verifyCompletion && verifyCompletion.progress !== undefined && verifyCompletion.progress !== null) {
            mongoUpdateSucceeded = true;
            console.log(`Mongoose updateOne successful - Progress saved: ${verifyCompletion.progress}`);
          }
        }
      }
      
      if (!mongoUpdateSucceeded) {
        console.log('Mongoose updateOne failed, using MongoDB native collection update as final backup...');
        
        // Use MongoDB's native collection methods directly to bypass Mongoose subdocument issues
        const progressValue = Number(newProgress);
        const mongoose = await import('mongoose');
        const ObjectId = mongoose.default.Types.ObjectId;
        
        // Access the native MongoDB collection through Mongoose
        const collection = Habit.collection;
        
        const nativeUpdateResult = await collection.updateOne(
          {
            _id: new ObjectId(habitId),
            userId: payload.userId,
            'completions.date': {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          },
          {
            $set: {
              'completions.$[elem].progress': progressValue,
              'completions.$[elem].completed': Boolean(isCompleted), // Always set based on newProgress >= goal
            },
          },
          {
            arrayFilters: [
              {
                'elem.date': {
                  $gte: startOfDay,
                  $lte: endOfDay,
                },
              },
            ],
          }
        );
        
        console.log(`MongoDB native update - Matched: ${nativeUpdateResult.matchedCount}, Modified: ${nativeUpdateResult.modifiedCount}`);
        
        if (nativeUpdateResult.matchedCount > 0 && nativeUpdateResult.modifiedCount > 0) {
          // Verify it worked
          const verifyHabit = await Habit.findById(habitId).lean();
          if (verifyHabit) {
            const verifyCompletion = (verifyHabit as any).completions.find((c: any) => {
              const compDate = new Date(c.date);
              const compDateUTC = new Date(Date.UTC(
                compDate.getUTCFullYear(),
                compDate.getUTCMonth(),
                compDate.getUTCDate()
              ));
              return compDateUTC.getTime() >= startOfDay.getTime() && compDateUTC.getTime() <= endOfDay.getTime();
            });
            
            if (verifyCompletion && verifyCompletion.progress !== undefined && verifyCompletion.progress !== null) {
              mongoUpdateSucceeded = true;
              console.log(`MongoDB native update successful - Progress saved: ${verifyCompletion.progress}`);
            } else {
              console.log(`MongoDB native update matched but progress still undefined in verification`);
            }
          }
        }
        
        if (!mongoUpdateSucceeded) {
          console.log('MongoDB native update failed, using Mongoose save() as final fallback...');
          // Reload the habit first to get fresh data, then update and save
          const habitForSave = await Habit.findOne({
            _id: habitId,
            userId: payload.userId,
          });
          
          if (habitForSave) {
            // Find the completion by date and update it
            const saveCompletionIndex = habitForSave.completions.findIndex((c: any) => {
          const completionDate = new Date(c.date);
              const completionDateUTC = new Date(Date.UTC(
                completionDate.getUTCFullYear(),
                completionDate.getUTCMonth(),
                completionDate.getUTCDate()
              ));
              return completionDateUTC.getTime() === targetDateUTC.getTime();
            });
            
                if (saveCompletionIndex >= 0) {
              // Get the existing completion subdocument
              const existingCompletion = habitForSave.completions[saveCompletionIndex];
              const existingId = existingCompletion._id;
              console.log(`Mongoose save() - Existing completion ID: ${existingId}`);
              console.log(`Mongoose save() - Existing completion:`, JSON.stringify(existingCompletion.toObject ? existingCompletion.toObject() : existingCompletion));
              
              // Use Mongoose's subdocument methods to update fields
              const progressValue = Number(newProgress);
              const completedValue = Boolean(isCompleted);
              
              console.log(`Mongoose save() - Setting progress: ${progressValue}, completed: ${completedValue}`);
              
              // Get the subdocument
              const subdoc = habitForSave.completions[saveCompletionIndex];
              
              // Directly assign to the subdocument properties
              // This should work better than set() for new fields
              (subdoc as any).progress = progressValue;
              (subdoc as any).completed = completedValue;
              
              // Mark the subdocument fields as modified
              subdoc.markModified('progress');
              subdoc.markModified('completed');
              
              console.log(`Mongoose save() - After assignment, progress: ${(subdoc as any).progress}, type: ${typeof (subdoc as any).progress}`);
              console.log(`Mongoose save() - Subdoc isModified('progress'): ${subdoc.isModified('progress')}`);
              console.log(`Mongoose save() - Subdoc isModified('completed'): ${subdoc.isModified('completed')}`);
              
              // Mark the parent array as modified - this is crucial
              habitForSave.markModified('completions');
              
              // Save and verify
              await habitForSave.save();
              console.log(`Mongoose save() - Save completed`);
              
              // Reload to verify
              const verifyHabit = await Habit.findById(habitId).lean();
              if (verifyHabit) {
                // Find by date to get the correct completion
                const verifyCompletion = (verifyHabit as any).completions.find((c: any) => {
                  const compDate = new Date(c.date);
                  const compDateUTC = new Date(Date.UTC(
                    compDate.getUTCFullYear(),
                    compDate.getUTCMonth(),
                    compDate.getUTCDate()
                  ));
                  return compDateUTC.getTime() === targetDateUTC.getTime();
                });
                
                if (verifyCompletion) {
                  console.log(`Mongoose save() completed - Verification from DB:`, JSON.stringify(verifyCompletion));
                  console.log(`  Progress saved: ${verifyCompletion.progress} (type: ${typeof verifyCompletion.progress})`);
                  console.log(`  Completion ID: ${verifyCompletion._id} (original was ${existingId})`);
                  
                  if (verifyCompletion.progress === undefined || verifyCompletion.progress === null) {
                    console.error(`  ERROR: Progress still undefined after save!`);
                  }
                } else {
                  console.log(`Mongoose save() - Could not find completion in verification`);
                }
              }
            } else {
              console.log('Could not find completion for Mongoose save()');
            }
          }
        }
      }
    } else {
      console.log('MongoDB update succeeded, skipping Mongoose save() backup');
    }
    
    // Reload from database AFTER all updates complete to get the latest saved values
    // Use findOne with lean() to get raw MongoDB data without Mongoose transformations
    const savedHabit = await Habit.findOne({
      _id: habitId,
      userId: payload.userId,
    }).lean();
    
    console.log('Habit saved. Verifying saved completions (using lean() to get raw MongoDB data):');
    if (savedHabit) {
      const completions = (savedHabit as any).completions || [];
      completions.forEach((c: any, index: number) => {
        const compDate = new Date(c.date);
        const compDateUTC = new Date(Date.UTC(
          compDate.getUTCFullYear(),
          compDate.getUTCMonth(),
          compDate.getUTCDate()
        ));
        const compDateStr = compDateUTC.toISOString().split('T')[0];
        const matches = compDateStr === dateStringUTC;
        const progressValue = c.progress;
        const progressType = typeof progressValue;
        console.log(`  [${index}] Date: ${c.date} (${compDateStr}), Progress: ${progressValue} (type: ${progressType}, isNaN: ${isNaN(progressValue)}), Completed: ${c.completed}, Matches target: ${matches}`);
        
        // If progress is undefined/null for the target date, log a warning
        if (matches && (progressValue === undefined || progressValue === null || isNaN(progressValue))) {
          console.error(`  WARNING: Progress is ${progressValue} for target date ${dateStringUTC}! Expected: ${newProgress}`);
          console.error(`  Raw completion object:`, JSON.stringify(c));
        }
      });
    } else {
      console.log('ERROR: Could not reload habit after save!');
    }
    
    // Also reload with Mongoose to see if there's a difference
    const savedHabitMongoose = await Habit.findOne({
      _id: habitId,
      userId: payload.userId,
    });
    
    if (savedHabitMongoose) {
      console.log('Mongoose reload (with schema transformations):');
      savedHabitMongoose.completions.forEach((c: any, index: number) => {
        const compDate = new Date(c.date);
        const compDateUTC = new Date(Date.UTC(
          compDate.getUTCFullYear(),
          compDate.getUTCMonth(),
          compDate.getUTCDate()
        ));
        const compDateStr = compDateUTC.toISOString().split('T')[0];
        const matches = compDateStr === dateStringUTC;
        console.log(`  [${index}] Date: ${c.date} (${compDateStr}), Progress: ${c.progress} (type: ${typeof c.progress}), Completed: ${c.completed}, Matches target: ${matches}`);
      });
    }
    console.log('=== BACKEND: UPDATE PROGRESS END ===');

    // ALWAYS reload the habit AFTER the update to get the latest values
    // Don't use savedHabit from before the update - it has stale data
    const habitForResponse = await Habit.findOne({
      _id: habitId,
      userId: payload.userId,
    }).lean();
    
    if (!habitForResponse) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save habit progress',
      });
    }
    
    console.log('Returning response with completions from habit (using lean data):');
    const responseCompletions = (habitForResponse as any).completions || [];
    responseCompletions.forEach((c: any, index: number) => {
      console.log(`  [${index}] Date: ${c.date}, Progress: ${c.progress}, Completed: ${c.completed}`);
    });
    
    // Check for achievements if completion status changed to completed
    // Check if the target date completion is now completed
    const achievementCheckDateUTC = new Date(date);
    achievementCheckDateUTC.setUTCHours(0, 0, 0, 0);
    const achievementCheckDateStr = achievementCheckDateUTC.toISOString().split('T')[0];
    
    const targetCompletion = responseCompletions.find((c: any) => {
      const compDate = new Date(c.date);
      compDate.setUTCHours(0, 0, 0, 0);
      const compDateStr = compDate.toISOString().split('T')[0];
      return compDateStr === achievementCheckDateStr;
    });
    
    if (targetCompletion) {
      const habitGoal = (habitForResponse as any).goal || 1;
      const progressValue = targetCompletion.progress !== undefined && targetCompletion.progress !== null
        ? Number(targetCompletion.progress)
        : 0;
      const isCompleted = habitGoal > 1 
        ? progressValue >= habitGoal 
        : targetCompletion.completed;
      
      if (isCompleted) {
        // Check for achievements (async, don't wait)
        import('../../../lib/achievementChecker').then((module) => {
          module.checkAchievements(payload.userId).catch((err: any) => {
            console.error('Error checking achievements:', err);
          });
        });
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Habit progress updated',
      habit: {
        id: (habitForResponse as any)._id.toString(),
        completions: responseCompletions.map((c: any) => {
          // Ensure progress is always included, even if 0
          // Explicitly check - don't use || 0 as it treats 0 as falsy
          let progressValue = 0;
          if (c.progress !== undefined && c.progress !== null) {
            progressValue = Number(c.progress);
          }
          
          // For quantifiable habits (goal > 1), always calculate completed based on progress >= goal
          // This fixes any inconsistencies where completed flag doesn't match progress
          let completedValue = c.completed;
          const habitGoal = (habitForResponse as any).goal || 1;
          if (habitGoal > 1) {
            completedValue = progressValue >= habitGoal;
          }
          
          console.log(`    Mapping completion: Date=${c.date}, Progress=${c.progress} -> ${progressValue}, Completed=${c.completed} -> ${completedValue} (goal: ${habitGoal})`);
          return {
            date: c.date.toISOString(),
            completed: completedValue,
            progress: progressValue,
          };
        }),
      },
    });
  } catch (error: any) {
    console.error('Update progress error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
