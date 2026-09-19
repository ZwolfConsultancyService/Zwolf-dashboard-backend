import mongoose from 'mongoose';

const detailSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      type: String,
      required: true,
      trim: true,
    },
    // 🆕 Project reference (optional)
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetType: {
      type: String,
      enum: ['everyone', 'sales', 'developers', 'specific'],
      default: 'developers',
    },
    specificRecipients: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

detailSchema.index({ targetType: 1 });
detailSchema.index({ specificRecipients: 1 });
detailSchema.index({ project: 1 });
detailSchema.index({ createdAt: -1 });

export default mongoose.model('Detail', detailSchema);