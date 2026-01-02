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

    const {
      name,
      description,
      color,
      icon,
      type,
      repeat,
      goal,
      goalUnit,
      activeDays,
      startDate,
      endDate,
    } = req.body;

    // Validation
    if (!name || !color || !icon || !type || !activeDays || !Array.isArray(activeDays)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, color, icon, type, activeDays',
      });
    }

    // Create new habit
    const habit = new Habit({
      userId: payload.userId,
      name,
      description: description || '',
      color,
      icon,
      type,
      repeat: repeat || 'Every day',
      goal: goal || 1,
      goalUnit: goalUnit || undefined,
      activeDays,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : undefined,
      completions: [],
    });

    await habit.save();

    return res.status(201).json({
      success: true,
      message: 'Habit created successfully',
      habit: {
        id: habit._id.toString(),
        name: habit.name,
        description: habit.description,
        color: habit.color,
        icon: habit.icon,
        type: habit.type,
        repeat: habit.repeat,
        goal: habit.goal,
        goalUnit: habit.goalUnit,
        activeDays: habit.activeDays,
        startDate: habit.startDate,
        endDate: habit.endDate,
      },
    });
  } catch (error: any) {
    console.error('Create habit error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
