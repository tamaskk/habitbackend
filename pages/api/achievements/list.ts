import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Achievement from '../../../models/Achievement';
import { verifyToken } from '../../../lib/jwt';
import { getAllAchievements } from '../../../lib/achievements';

type Data = {
  success: boolean;
  message?: string;
  achievements?: any[];
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

    // Check for new achievements before listing
    const { checkAchievements } = await import('../../../lib/achievementChecker');
    await checkAchievements(payload.userId).catch((err: any) => {
      console.error('Error checking achievements:', err);
    });

    // Get all unlocked achievements for user
    const unlockedAchievements = await Achievement.find({ userId: payload.userId }).lean();
    const unlockedIds = new Set(unlockedAchievements.map(a => a.achievementId));

    // Get all achievement definitions
    const allAchievements = getAllAchievements();

    // Combine definitions with unlock status
    const achievements = allAchievements.map(achievement => {
      const unlocked = unlockedAchievements.find(a => a.achievementId === achievement.id);
      return {
        ...achievement,
        unlocked: !!unlocked,
        unlockedAt: unlocked?.unlockedAt?.toISOString(),
        progress: unlocked?.progress || 0,
      };
    });

    return res.status(200).json({
      success: true,
      achievements,
    });
  } catch (error: any) {
    console.error('List achievements error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
