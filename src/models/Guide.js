import mongoose from 'mongoose';

const guideSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetRole: {
      type: String,
      enum: ['developer', 'sales', 'everyone'],
      default: 'developer',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

guideSchema.index({ targetRole: 1 });
guideSchema.index({ createdAt: -1 });

export default mongoose.model('Guide', guideSchema);