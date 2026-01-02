import mongoose, { Schema, Document } from 'mongoose';

export interface IFriend extends Document {
  userId: string; // User who sent/received the request
  friendId: string; // The other user
  status: 'pending' | 'accepted' | 'rejected';
  requestedBy: string; // userId of the person who sent the request
  createdAt: Date;
  updatedAt: Date;
}

const FriendSchema: Schema = new Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  friendId: {
    type: String,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
    required: true,
  },
  requestedBy: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index to ensure unique friendship pairs
FriendSchema.index({ userId: 1, friendId: 1 }, { unique: true });

export default mongoose.models.Friend || mongoose.model<IFriend>('Friend', FriendSchema);
