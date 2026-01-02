import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Friend from '../../../models/Friend';
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

    const { friendId } = req.query;

    if (!friendId || typeof friendId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide friendId',
      });
    }

    // Verify friendship exists
    const friendship = await Friend.findOne({
      userId: payload.userId,
      friendId: friendId,
      status: 'accepted',
    });

    if (!friendship) {
      return res.status(403).json({
        success: false,
        message: 'You are not friends with this user',
      });
    }

    // Get friend's habits
    const habits = await Habit.find({ userId: friendId })
      .sort({ createdAt: -1 })
      .lean();

    const mappedHabits = habits.map((habit: any) => {
      const completions = (habit.completions || []).map((c: any) => {
        const goal = habit.goal || 1;
        let progressValue = 0;
        if (c.progress !== undefined && c.progress !== null) {
          progressValue = Number(c.progress);
        }
        
        // For quantifiable habits, calculate completed based on progress >= goal
        let completedValue = c.completed;
        if (goal > 1) {
          completedValue = progressValue >= goal;
        }
        
        return {
          date: c.date.toISOString(),
          completed: completedValue,
          progress: progressValue,
        };
      });

      return {
        id: habit._id.toString(),
        name: habit.name,
        description: habit.description || '',
        color: habit.color || '#6C5CE7',
        icon: habit.icon || '📝',
        type: habit.type,
        repeat: habit.repeat || 'Every day',
        goal: habit.goal || 1,
        goalUnit: habit.goalUnit || '',
        activeDays: habit.activeDays || [1, 2, 3, 4, 5, 6, 7],
        startDate: habit.startDate.toISOString(),
        endDate: habit.endDate ? habit.endDate.toISOString() : null,
        completions: completions,
        createdAt: habit.createdAt.toISOString(),
        updatedAt: habit.updatedAt.toISOString(),
      };
    });

    return res.status(200).json({
      success: true,
      habits: mappedHabits,
    });
  } catch (error: any) {
    console.error('Get friend habits error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
