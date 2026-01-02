import mongoose, { Schema, Document } from 'mongoose';

export interface IAchievement extends Document {
  userId: string;
  achievementId: string; // Unique identifier for the achievement type
  unlockedAt: Date;
  progress?: number; // Current progress toward achievement (for progress tracking)
}

const AchievementSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  achievementId: {
    type: String,
    required: true,
  },
  unlockedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  progress: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

// Compound index to ensure one achievement per user
AchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

export default mongoose.models.Achievement || mongoose.model<IAchievement>('Achievement', AchievementSchema);
