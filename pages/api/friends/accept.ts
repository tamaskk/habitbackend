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

    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide requestId',
      });
    }

    // Find the pending request
    const request = await Friend.findOne({
      _id: requestId,
      friendId: payload.userId,
      status: 'pending',
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found',
      });
    }

    // Update both friendship entries to accepted
    await Friend.updateMany(
      {
        $or: [
          { userId: payload.userId, friendId: request.userId },
          { userId: request.userId, friendId: payload.userId },
        ],
      },
      {
        $set: {
          status: 'accepted',
          updatedAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Friend request accepted',
    });
  } catch (error: any) {
    console.error('Accept friend request error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
