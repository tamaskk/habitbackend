import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Habit from '../../../models/Habit';
import { verifyToken } from '../../../lib/jwt';

type Data = {
  success: boolean;
  message?: string;
  habits?: any[];
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

  if (req.method !== 'GET') {
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

    const habits = await Habit.find({ userId: payload.userId })
      .sort({ createdAt: -1 })
      .lean();

    console.log('=== BACKEND: LIST HABITS ===');
    console.log('Found ${habits.length} habits for user');
    
    const mappedHabits = habits.map(habit => {
      console.log(`Habit: ${habit.name} (ID: ${(habit._id as any)})`);
      console.log(`  Completions count: ${habit.completions.length}`);
      habit.completions.forEach((c: any, index: number) => {
        console.log(`    [${index}] Date: ${c.date}, Completed: ${c.completed}, Progress: ${c.progress || 0}`);
      });
      
      console.log(`  ScheduledHour: ${habit.scheduledHour} (type: ${typeof habit.scheduledHour})`);
      
      return {
        id: (habit._id as any).toString(),
        name: habit.name,
        description: habit.description,
        color: habit.color,
        icon: habit.icon,
        type: habit.type,
        repeat: habit.repeat,
        goal: habit.goal,
        goalUnit: habit.goalUnit,
        activeDays: habit.activeDays,
        startDate: habit.startDate.toISOString(),
        endDate: habit.endDate?.toISOString(),
        scheduledHour: habit.scheduledHour ?? null,
        completions: habit.completions.map((c: any) => {
          const progress = c.progress !== undefined && c.progress !== null ? c.progress : 0;
          // For quantifiable habits (goal > 1), always calculate completed based on progress >= goal
          // This fixes any inconsistencies where completed flag doesn't match progress
          let completed = c.completed;
          if (habit.goal > 1) {
            completed = progress >= habit.goal;
          }
          return {
            date: c.date.toISOString(),
            completed: completed,
            progress: progress,
          };
        }),
      };
    });
    
    console.log('=== BACKEND: LIST HABITS END ===');

    return res.status(200).json({
      success: true,
      habits: mappedHabits,
    });
  } catch (error: any) {
    console.error('List habits error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
