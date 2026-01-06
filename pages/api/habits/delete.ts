import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Habit from '../../../models/Habit';
import { verifyToken } from '../../../lib/jwt';

type Data = {
  success: boolean;
  message?: string;
  habit?: {
    id: string;
    completions: Array<{
      date: string;
      completed: boolean;
      progress: number;
    }>;
  };
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

  if (req.method !== 'DELETE' && req.method !== 'POST') {
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

    const { habitId, date } = req.body;

    if (!habitId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide habitId',
      });
    }

    const habit = await Habit.findOne({
      _id: habitId,
      userId: payload.userId,
    });

    if (!habit) {
      return res.status(404).json({
        success: false,
        message: 'Habit not found',
      });
    }

    if (date) {
      console.log('=== BACKEND: DELETE COMPLETION FOR DATE ===');
      console.log('HabitId:', habitId);
      console.log('Date received:', date);
      console.log('Date type:', typeof date);
      
      // Delete completion for specific date only
      const targetDate = new Date(date);
      console.log('Parsed targetDate:', targetDate);
      console.log('TargetDate UTC year:', targetDate.getUTCFullYear());
      console.log('TargetDate UTC month:', targetDate.getUTCMonth());
      console.log('TargetDate UTC date:', targetDate.getUTCDate());
      
      const targetDateUTC = new Date(Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate()
      ));
      console.log('TargetDateUTC:', targetDateUTC);
      
      const dateStringUTC = targetDateUTC.toISOString().split('T')[0];
      console.log('DateStringUTC:', dateStringUTC);
      
      // Store original length for logging
      const originalLength = habit.completions.length;
      console.log('Original completions count:', originalLength);
      console.log('Original completions:');
      habit.completions.forEach((c: any, index: number) => {
        console.log(`  [${index}] Date: ${c.date}, Completed: ${c.completed}, Progress: ${c.progress}`);
      });
      
      // Calculate the start and end of the target date in UTC for MongoDB query
      const startOfDay = new Date(Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        0, 0, 0, 0
      ));
      const endOfDay = new Date(Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        23, 59, 59, 999
      ));
      
      console.log('Start of day (UTC):', startOfDay);
      console.log('End of day (UTC):', endOfDay);
      
      // Step 1: Remove any completions for this date
      const pullResult = await Habit.updateOne(
        {
          _id: habitId,
          userId: payload.userId,
        },
        {
          $pull: {
            completions: {
              date: {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            },
          },
        }
      );
      
      console.log('MongoDB $pull completions result - Matched:', pullResult.matchedCount, 'Modified:', pullResult.modifiedCount);
      
      // Step 2: Add the date to deletedDates array (if not already there)
      const addToSetResult = await Habit.updateOne(
        {
          _id: habitId,
          userId: payload.userId,
        },
        {
          $addToSet: {
            deletedDates: targetDateUTC,
          },
        }
      );
      
      console.log('MongoDB $addToSet deletedDates result - Matched:', addToSetResult.matchedCount, 'Modified:', addToSetResult.modifiedCount);
      
      // Reload the habit to get the updated completions
      const savedHabit = await Habit.findOne({
        _id: habitId,
        userId: payload.userId,
      });
      
      if (!savedHabit) {
        console.error('ERROR: Failed to reload habit after deletion');
        return res.status(500).json({
          success: false,
          message: 'Failed to verify deletion',
        });
      }
      
      const removedCount = originalLength - savedHabit.completions.length;
      console.log('Removed completions count:', removedCount);
      console.log('Final completions count:', savedHabit.completions.length);
      console.log('Final completions:');
      savedHabit.completions.forEach((c: any, index: number) => {
        console.log(`  [${index}] Date: ${c.date}, Completed: ${c.completed}, Progress: ${c.progress}`);
      });
      
      
      const responseMessage = removedCount > 0 
        ? `Habit completion deleted for ${dateStringUTC}` 
        : `No completion found for ${dateStringUTC}`;
      console.log('Response message:', responseMessage);
      console.log('=== BACKEND: DELETE COMPLETION END ===');
      
      // Return the updated habit from database (not the in-memory object) so frontend can verify
      return res.status(200).json({
        success: true,
        message: responseMessage,
        habit: {
          id: savedHabit._id.toString(),
          completions: savedHabit.completions.map((c: any) => ({
            date: c.date instanceof Date ? c.date.toISOString() : (typeof c.date === 'string' ? c.date : new Date(c.date).toISOString()),
            completed: c.completed,
            progress: c.progress || 0,
          })),
          deletedDates: (savedHabit.deletedDates || []).map((d: any) => 
            d instanceof Date ? d.toISOString() : (typeof d === 'string' ? d : new Date(d).toISOString())
          ),
        },
      });
    } else {
      // Delete entire habit
      await Habit.deleteOne({
        _id: habitId,
        userId: payload.userId,
      });
      
      return res.status(200).json({
        success: true,
        message: 'Habit deleted successfully',
      });
    }
  } catch (error: any) {
    console.error('Delete habit error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
