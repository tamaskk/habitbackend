import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import { verifyToken } from '../../../lib/jwt';
import { checkAchievements } from '../../../lib/achievementChecker';
import { getAchievementById } from '../../../lib/achievements';

type Data = {
  success: boolean;
  message?: string;
  unlocked?: any[];
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

    // Check and unlock achievements
    const result = await checkAchievements(payload.userId);

    // Get achievement details for unlocked ones
    const unlockedAchievements = result.unlocked.map(id => {
      const achievement = getAchievementById(id);
      return achievement ? {
        ...achievement,
        unlockedAt: new Date().toISOString(),
      } : null;
    }).filter(Boolean);

    return res.status(200).json({
      success: true,
      message: unlockedAchievements.length > 0 
        ? `Unlocked ${unlockedAchievements.length} achievement(s)!`
        : 'No new achievements unlocked',
      unlocked: unlockedAchievements,
    });
  } catch (error: any) {
    console.error('Check achievements error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
