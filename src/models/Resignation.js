import mongoose from 'mongoose';

const resignationSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    appliedAt: {
      type: Date,
      default: Date.now,
    },

    noticePeriodDays: {
      type: Number,
      default: 30,
      min: 0,
    },

    lastWorkingDay: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Withdrawn'],
      default: 'Pending',
      index: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewNote: {
      type: String,
      trim: true,
      default: '',
    },

    resignedAt: {
      type: Date,
      default: null,
    },

    letterGenerated: {
      type: Boolean,
      default: false,
    },

    letterGeneratedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

resignationSchema.index({ employee: 1, status: 1 });
resignationSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Resignation', resignationSchema);