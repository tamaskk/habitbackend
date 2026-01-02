import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Friend from '../../../models/Friend';
import { verifyToken } from '../../../lib/jwt';

type Data = {
  success: boolean;
  message?: string;
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

  if (req.method !== 'POST' && req.method !== 'DELETE') {
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

    const { friendId } = req.body;

    if (!friendId) {
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
      return res.status(404).json({
        success: false,
        message: 'Friendship not found',
      });
    }

    // Delete both friendship entries (bidirectional)
    await Friend.deleteMany({
      $or: [
        { userId: payload.userId, friendId: friendId },
        { userId: friendId, friendId: payload.userId },
      ],
    });

    return res.status(200).json({
      success: true,
      message: 'Friendship deleted',
    });
  } catch (error: any) {
    console.error('Unfriend error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
