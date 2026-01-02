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
      
      // Filter out completions matching the target date
      // Use the same comparison logic as the complete endpoint
      habit.completions = habit.completions.filter((c: any, index: number) => {
        if (!c.date) {
          console.log(`  [${index}] Keeping entry without date`);
          return true; // Keep entries without dates
        }
        
        // Handle MongoDB date objects - they might be Date objects or strings
        let completionDate: Date;
        if (c.date instanceof Date) {
          completionDate = c.date;
        } else if (typeof c.date === 'string') {
          completionDate = new Date(c.date);
        } else {
          // Handle MongoDB extended JSON format
          completionDate = new Date(c.date);
        }
        
        console.log(`  [${index}] Original completion date:`, c.date);
        console.log(`  [${index}] Parsed completion date:`, completionDate);
        
        const completionDateUTC = new Date(Date.UTC(
          completionDate.getUTCFullYear(),
          completionDate.getUTCMonth(),
          completionDate.getUTCDate()
        ));
        const completionDateString = completionDateUTC.toISOString().split('T')[0];
        
        console.log(`  [${index}] CompletionDateUTC:`, completionDateUTC);
        console.log(`  [${index}] CompletionDateString:`, completionDateString);
        console.log(`  [${index}] TargetDateString:`, dateStringUTC);
        console.log(`  [${index}] Matches target?`, completionDateString === dateStringUTC);
        
        // Keep entries that don't match the target date
        const shouldKeep = completionDateString !== dateStringUTC;
        console.log(`  [${index}] Should keep:`, shouldKeep);
        
        return shouldKeep;
      });
      
      const removedCount = originalLength - habit.completions.length;
      console.log('Removed completions count:', removedCount);
      console.log('Final completions count:', habit.completions.length);
      console.log('Final completions:');
      habit.completions.forEach((c: any, index: number) => {
        console.log(`  [${index}] Date: ${c.date}, Completed: ${c.completed}, Progress: ${c.progress}`);
      });
      
      // Mark the completions array as modified so Mongoose saves it
      habit.markModified('completions');
      await habit.save();
      
      // Verify the save by reloading the habit
      const savedHabit = await Habit.findOne({
        _id: habitId,
        userId: payload.userId,
      });
      console.log('Verification - Saved habit completions count:', savedHabit?.completions.length);
      console.log('Verification - Saved completions:');
      savedHabit?.completions.forEach((c: any, index: number) => {
        console.log(`  [${index}] Date: ${c.date}, Completed: ${c.completed}, Progress: ${c.progress}`);
      });
      console.log('Habit saved to database');
      
      const responseMessage = removedCount > 0 
        ? `Habit completion deleted for ${dateStringUTC}` 
        : `No completion found for ${dateStringUTC}`;
      console.log('Response message:', responseMessage);
      console.log('=== BACKEND: DELETE COMPLETION END ===');
      
      // Return the updated habit so frontend can verify
      return res.status(200).json({
        success: true,
        message: responseMessage,
        habit: {
          id: habit._id.toString(),
          completions: habit.completions.map((c: any) => ({
            date: c.date instanceof Date ? c.date.toISOString() : c.date,
            completed: c.completed,
            progress: c.progress || 0,
          })),
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
