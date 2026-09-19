import mongoose from 'mongoose';

const dailyStatusSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: { type: Date, required: true },
    completedWork: { type: String, trim: true },
    workInProgress: { type: String, trim: true },
    pendingWork: { type: String, trim: true },
    blockers: { type: String, trim: true },
    nextPlan: { type: String, trim: true },
    status: {
      type: String,
      enum: ['Submitted', 'Reviewed'],
      default: 'Submitted',
    },
  },
  { timestamps: true }
);

dailyStatusSchema.index({ employee: 1, date: 1 }, { unique: true });

export default mongoose.model('DailyStatus', dailyStatusSchema);