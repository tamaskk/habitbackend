import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import Habit from '../../../models/Habit';
import { verifyToken } from '../../../lib/jwt';

type Data = {
  success: boolean;
  message?: string;
  habit?: any;
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

    const { habitId, scheduledHour } = req.body;

    // Validation
    if (!habitId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide habitId',
      });
    }

    // Find habit
    const habit = await Habit.findOne({
      _id: habitId,
      userId: payload.userId,
    });

    if (!habit) {
      return res.status(404).json({
        success: false,
        message: 'Habit not found',
      });
    }

    // Update scheduledHour
    if (scheduledHour !== undefined && scheduledHour !== null) {
      const hour = parseInt(scheduledHour.toString());
      console.log(`Updating habit ${habitId} scheduledHour to ${hour} (parsed from ${scheduledHour})`);
      if (hour >= 0 && hour <= 23) {
        habit.scheduledHour = hour;
      } else {
        return res.status(400).json({
          success: false,
          message: 'scheduledHour must be between 0 and 23',
        });
      }
    } else {
      console.log(`Clearing scheduledHour for habit ${habitId}`);
      habit.scheduledHour = undefined;
    }

    habit.updatedAt = new Date();
    await habit.save();
    console.log(`Saved habit ${habitId} with scheduledHour: ${habit.scheduledHour}`);

    return res.status(200).json({
      success: true,
      message: 'Habit updated successfully',
      habit: {
        id: habit._id.toString(),
        scheduledHour: habit.scheduledHour,
      },
    });
  } catch (error: any) {
    console.error('Update habit error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
