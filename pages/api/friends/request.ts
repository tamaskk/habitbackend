import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Friend from '../../../models/Friend';
import User from '../../../models/User';
import { verifyToken } from '../../../lib/jwt';

type Data = {
  success: boolean;
  message?: string;
  friendRequest?: any;
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

    const { friendName } = req.body;

    if (!friendName || typeof friendName !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a friend name',
      });
    }

    // Find user by name (first name or last name match)
    const friendUser = await User.findOne({
      $or: [
        { firstName: { $regex: new RegExp(`^${friendName}$`, 'i') } },
        { lastName: { $regex: new RegExp(`^${friendName}$`, 'i') } },
        { email: friendName.toLowerCase() },
      ],
    });

    if (!friendUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const friendUserId = friendUser._id.toString();
    const currentUserId = payload.userId;

    if (friendUserId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send friend request to yourself',
      });
    }

    // Check if friendship already exists
    const existingFriendship = await Friend.findOne({
      $or: [
        { userId: currentUserId, friendId: friendUserId },
        { userId: friendUserId, friendId: currentUserId },
      ],
    });

    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        return res.status(400).json({
          success: false,
          message: 'You are already friends',
        });
      }
      if (existingFriendship.status === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Friend request already pending',
        });
      }
    }

    // Create friend request (bidirectional)
    const friendRequest = await Friend.create({
      userId: currentUserId,
      friendId: friendUserId,
      status: 'pending',
      requestedBy: currentUserId,
    });

    // Also create reverse entry for the friend
    await Friend.create({
      userId: friendUserId,
      friendId: currentUserId,
      status: 'pending',
      requestedBy: currentUserId,
    });

    return res.status(201).json({
      success: true,
      message: 'Friend request sent',
      friendRequest: {
        id: friendRequest._id.toString(),
        userId: friendRequest.userId,
        friendId: friendRequest.friendId,
        status: friendRequest.status,
        requestedBy: friendRequest.requestedBy,
      },
    });
  } catch (error: any) {
    console.error('Send friend request error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Friend request already exists',
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
