import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import User from '../../../models/User';
import { verifyToken } from '../../../lib/jwt';

type Data = {
  success: boolean;
  message?: string;
  user?: any;
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  if (req.method !== 'PUT') {
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

    const { dayStartHour, dayStartMinute } = req.body;

    // Validate inputs
    const updateData: any = {};
    
    if (dayStartHour !== undefined && dayStartHour !== null) {
      const hour = parseInt(dayStartHour.toString());
      console.log(`Updating user ${payload.userId} dayStartHour to ${hour} (parsed from ${dayStartHour})`);
      if (hour >= 0 && hour <= 23) {
        updateData.dayStartHour = hour;
      } else {
        return res.status(400).json({
          success: false,
          message: 'dayStartHour must be between 0 and 23',
        });
      }
    }

    if (dayStartMinute !== undefined && dayStartMinute !== null) {
      const minute = parseInt(dayStartMinute.toString());
      console.log(`Updating user ${payload.userId} dayStartMinute to ${minute} (parsed from ${dayStartMinute})`);
      if (minute >= 0 && minute <= 59) {
        updateData.dayStartMinute = minute;
      } else {
        return res.status(400).json({
          success: false,
          message: 'dayStartMinute must be between 0 and 59',
        });
      }
    }

    console.log(`Update data:`, JSON.stringify(updateData));

    // Check if updateData is empty
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update',
      });
    }

    // Use findByIdAndUpdate instead of updateOne for better reliability
    const user = await User.findByIdAndUpdate(
      payload.userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log(`User after update (raw):`, JSON.stringify(user.toObject ? user.toObject() : user));
    
    const savedHour = (user as any).dayStartHour;
    const savedMinute = (user as any).dayStartMinute;
    console.log(`Saved user ${payload.userId} with dayStartHour: ${savedHour}, dayStartMinute: ${savedMinute}`);

    return res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      user: {
        id: (user as any)._id.toString(),
        dayStartHour: savedHour,
        dayStartMinute: savedMinute,
      },
    });
  } catch (error: any) {
    console.error('Update settings error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}