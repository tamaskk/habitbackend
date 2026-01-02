import mongoose, { Schema, Document } from 'mongoose';

export interface IHabit extends Document {
  userId: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  type: 'Good' | 'Bad' | 'To-Do';
  repeat: string;
  goal: number; // Target value (e.g., 8 glasses, 3 miles)
  goalUnit?: string; // Optional unit (e.g., "glasses", "miles", "times")
  activeDays: number[]; // Array of day numbers (1=Monday, 7=Sunday)
  startDate: Date;
  endDate?: Date;
  completions: Array<{
    date: Date;
    completed: boolean;
    progress?: number; // Progress toward goal (e.g., 3 out of 8 glasses)
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const HabitSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  color: {
    type: String,
    required: true,
    default: '#6C5CE7',
  },
  icon: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['Good', 'Bad', 'To-Do'],
    required: true,
  },
  repeat: {
    type: String,
    default: 'Every day',
  },
  goal: {
    type: Number,
    default: 1,
  },
  goalUnit: {
    type: String,
    trim: true,
  },
  activeDays: {
    type: [Number],
    required: true,
    default: [1, 2, 3, 4, 5], // Monday-Friday
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  endDate: {
    type: Date,
  },
  completions: [{
    date: {
      type: Date,
      required: true,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    progress: {
      type: Number,
      default: 0,
      required: false, // Allow undefined, but default to 0
    },
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.Habit || mongoose.model<IHabit>('Habit', HabitSchema);
