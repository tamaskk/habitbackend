import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Friend from '../../../models/Friend';
import Habit from '../../../models/Habit';
import { verifyToken } from '../../../lib/jwt';

type Data = {
  success: boolean;
  message?: string;
  stats?: any;
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
    const habits = await Habit.find({ userId: friendId }).lean();

    // Calculate statistics
    let totalCompletions = 0;
    const completionDates = new Set<string>();
    let currentStreak = 0;
    let bestStreak = 0;

    for (const habit of habits) {
      const goal = habit.goal || 1;
      for (const completion of habit.completions || []) {
        const isCompleted = goal > 1
          ? ((completion.progress || 0) >= goal)
          : (completion.completed === true);

        if (isCompleted) {
          const date = new Date(completion.date);
          const dateStr = date.toISOString().split('T')[0];
          completionDates.add(dateStr);
          totalCompletions++;
        }
      }
    }

    // Calculate streaks
    const sortedDates = Array.from(completionDates).sort();
    let tempStreak = 0;

    if (sortedDates.length > 0) {
      let prevDate: Date | null = null;
      for (const dateStr of sortedDates) {
        const currentDate = new Date(dateStr + 'T00:00:00Z');
        
        if (prevDate) {
          const daysDiff = Math.floor(
            (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          if (daysDiff === 1) {
            tempStreak++;
          } else {
            bestStreak = Math.max(bestStreak, tempStreak);
            tempStreak = 1;
          }
        } else {
          tempStreak = 1;
        }
        
        prevDate = currentDate;
      }
      bestStreak = Math.max(bestStreak, tempStreak);
      currentStreak = tempStreak;
    }

    return res.status(200).json({
      success: true,
      stats: {
        totalHabits: habits.length,
        totalCompletions,
        currentStreak,
        bestStreak,
      },
    });
  } catch (error: any) {
    console.error('Get friend stats error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
