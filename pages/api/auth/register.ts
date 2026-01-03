import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '../../../lib/mongodb';
import User from '../../../models/User';
import { generateToken } from '../../../lib/jwt';

type Data = {
  success: boolean;
  message?: string;
  token?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    dayStartHour: number;
    dayStartMinute: number;
  };
};

// CORS handler
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    await connectDB();

    const { firstName, lastName, email, password } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all fields: firstName, lastName, email, and password',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Create new user - use create() to ensure all fields are saved
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      dayStartHour: 0,
      dayStartMinute: 0,
    });

    // Explicitly ensure fields are set and save again if needed
    if (user.dayStartHour === undefined || user.dayStartHour === null) {
      user.dayStartHour = 0;
    }
    if (user.dayStartMinute === undefined || user.dayStartMinute === null) {
      user.dayStartMinute = 0;
    }
    await user.save();

    // Reload from database to ensure all fields are present
    const savedUser = await User.findById(user._id);
    if (!savedUser) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve saved user',
      });
    }

    // Convert to plain object to ensure all fields are included
    const userObj = savedUser.toObject();
    
    // Ensure dayStartHour and dayStartMinute are always present (use defaults if not saved)
    const dayStartHour = userObj.dayStartHour !== undefined && userObj.dayStartHour !== null ? userObj.dayStartHour : 0;
    const dayStartMinute = userObj.dayStartMinute !== undefined && userObj.dayStartMinute !== null ? userObj.dayStartMinute : 0;
    
    console.log(`Saved user:`, JSON.stringify({ ...userObj, dayStartHour, dayStartMinute }));

    // Generate token
    const token = generateToken({
      userId: savedUser._id.toString(),
      email: savedUser.email,
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: userObj._id.toString(),
        firstName: userObj.firstName,
        lastName: userObj.lastName,
        email: userObj.email,
        dayStartHour,
        dayStartMinute,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
}
