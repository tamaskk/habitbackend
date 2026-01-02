import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Habit from '../../../models/Habit';
import { verifyToken } from '../../../lib/jwt';

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

    const { habitId, date, completed, progress } = req.body;

    if (!habitId || date === undefined || completed === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide habitId, date, and completed status',
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

    // Parse and normalize the date to UTC midnight
    const targetDate = new Date(date);
    const targetDateUTC = new Date(Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      targetDate.getUTCDate()
    ));
    
    // Check if date is in the future (compare UTC dates)
    const today = new Date();
    const todayUTC = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate()
    ));

    if (targetDateUTC > todayUTC) {
      return res.status(400).json({
        success: false,
        message: 'Cannot mark habit as done for future dates',
      });
    }

    // Update or add completion - use UTC date string for comparison
    const dateStringUTC = targetDateUTC.toISOString().split('T')[0];
    console.log('=== BACKEND: COMPLETE HABIT ===');
    console.log('HabitId:', habitId);
    console.log('Target date UTC:', targetDateUTC);
    console.log('Date string UTC:', dateStringUTC);
    console.log('Completed:', completed);
    console.log('Progress:', progress);
    console.log('Original completions count:', habit.completions.length);
    
    const existingIndex = habit.completions.findIndex((c: any) => {
      const completionDate = new Date(c.date);
      const completionDateUTC = new Date(Date.UTC(
        completionDate.getUTCFullYear(),
        completionDate.getUTCMonth(),
        completionDate.getUTCDate()
      ));
      const completionDateString = completionDateUTC.toISOString().split('T')[0];
      const matches = completionDateString === dateStringUTC;
      console.log(`  Comparing: ${completionDateString} === ${dateStringUTC} -> ${matches}`);
      return matches;
    });

    if (existingIndex >= 0) {
      console.log(`Updating existing completion at index ${existingIndex}`);
      habit.completions[existingIndex].completed = completed;
      // Update progress if provided
      if (progress !== undefined) {
        habit.completions[existingIndex].progress = Math.max(0, Number(progress));
        // Auto-complete if progress reaches or exceeds goal
        if (habit.completions[existingIndex].progress >= habit.goal) {
          habit.completions[existingIndex].completed = true;
        }
      }
      console.log(`Updated completion: Date=${habit.completions[existingIndex].date}, Completed=${habit.completions[existingIndex].completed}, Progress=${habit.completions[existingIndex].progress}`);
    } else {
      console.log('Adding new completion');
      const newProgress = progress !== undefined ? Math.max(0, Number(progress)) : 0;
      const newCompletion = {
        date: targetDateUTC, // Use normalized UTC date
        completed: completed || (newProgress >= habit.goal),
        progress: newProgress,
      };
      habit.completions.push(newCompletion);
      console.log(`Added completion: Date=${newCompletion.date}, Completed=${newCompletion.completed}, Progress=${newCompletion.progress}`);
    }

    await habit.save();
    console.log('Habit saved. Final completions count:', habit.completions.length);
    console.log('Final completions:');
    habit.completions.forEach((c: any, index: number) => {
      console.log(`  [${index}] Date: ${c.date}, Completed: ${c.completed}, Progress: ${c.progress}`);
    });
    console.log('=== BACKEND: COMPLETE HABIT END ===');

    // Check for achievements (async, don't wait)
    import('../../../lib/achievementChecker').then((module) => {
      module.checkAchievements(payload.userId).catch((err: any) => {
        console.error('Error checking achievements:', err);
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Habit completion updated',
      habit: {
        id: habit._id.toString(),
        completions: habit.completions,
      },
    });
  } catch (error: any) {
    console.error('Complete habit error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
