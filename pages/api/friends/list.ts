import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Friend from '../../../models/Friend';
import User from '../../../models/User';
import { verifyToken } from '../../../lib/jwt';

type Data = {
  success: boolean;
  message?: string;
  friends?: any[];
  pendingRequests?: any[];
  sentRequests?: any[];
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

    // Get accepted friends
    const friendships = await Friend.find({
      userId: payload.userId,
      status: 'accepted',
    }).lean();

    // Get friend user details
    const friendIds = friendships.map(f => f.friendId);
    const friendUsers = await User.find({
      _id: { $in: friendIds.map(id => id) },
    }).lean();

    const friends = friendships.map(friendship => {
      const friendUser = friendUsers.find(u => (u._id as any).toString() === friendship.friendId);
      const friendshipId = (friendship._id as any).toString();
      return {
        id: friendship.friendId,
        firstName: friendUser?.firstName || '',
        lastName: friendUser?.lastName || '',
        email: friendUser?.email || '',
        friendshipId,
      };
    });

    // Get pending requests (requests sent TO the current user - incoming)
    const incomingRequests = await Friend.find({
      friendId: payload.userId,
      status: 'pending',
      requestedBy: { $ne: payload.userId },
    }).lean();

    // Get pending requests (requests sent BY the current user - outgoing)
    const outgoingRequests = await Friend.find({
      userId: payload.userId,
      status: 'pending',
      requestedBy: payload.userId,
    }).lean();

    // Get user details for incoming requests
    const incomingUserIds = incomingRequests.map(r => r.userId);
    const incomingUsers = await User.find({
      _id: { $in: incomingUserIds.map(id => id) },
    }).lean();

    const incomingRequestsWithUsers = incomingRequests.map(request => {
      const requestUser = incomingUsers.find(u => (u._id as any).toString() === request.userId);
      return {
        id: (request._id as any).toString(),
        userId: request.userId,
        firstName: requestUser?.firstName || '',
        lastName: requestUser?.lastName || '',
        email: requestUser?.email || '',
        createdAt: request.createdAt,
        type: 'incoming',
      };
    });

    // Get user details for outgoing requests
    const outgoingUserIds = outgoingRequests.map(r => r.friendId);
    const outgoingUsers = await User.find({
      _id: { $in: outgoingUserIds.map(id => id) },
    }).lean();

    const outgoingRequestsWithUsers = outgoingRequests.map(request => {
      const requestUser = outgoingUsers.find(u => (u._id as any).toString() === request.friendId);
      return {
        id: (request._id as any).toString(),
        userId: request.friendId,
        firstName: requestUser?.firstName || '',
        lastName: requestUser?.lastName || '',
        email: requestUser?.email || '',
        createdAt: request.createdAt,
        type: 'outgoing',
      };
    });

    return res.status(200).json({
      success: true,
      friends,
      pendingRequests: incomingRequestsWithUsers,
      sentRequests: outgoingRequestsWithUsers,
    });
  } catch (error: any) {
    console.error('List friends error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
