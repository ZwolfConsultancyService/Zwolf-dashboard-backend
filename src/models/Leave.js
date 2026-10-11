import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema(
  {
    /* =====================================================
       EMPLOYEE
    ===================================================== */

    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /* =====================================================
       LEAVE TYPE
    ===================================================== */

    type: {
      type: String,
      enum: ['Casual', 'Sick', 'Earned', 'Unpaid', 'Other'],
      default: 'Casual',
      index: true,
    },

    /* =====================================================
       DATES
    ===================================================== */

    fromDate: {
      type: Date,
      required: true,
      index: true,
    },

    toDate: {
      type: Date,
      required: true,
      index: true,
    },

    totalDays: {
      type: Number,
      required: true,
      min: 0.5,
    },

    /* =====================================================
       REASON
    ===================================================== */

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    /* =====================================================
       STATUS
    ===================================================== */

    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
      index: true,
    },

    /* =====================================================
       IS PAID
    ===================================================== */

    isPaid: {
      type: Boolean,
      default: true,
    },

    /* =====================================================
       MANAGER ACTION
    ===================================================== */

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

    /* =====================================================
       APPLIED AT
    ===================================================== */

    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

/* =========================================================
   INDEXES
========================================================= */

leaveSchema.index({ employee: 1, status: 1 });
leaveSchema.index({ fromDate: 1, toDate: 1 });
leaveSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Leave', leaveSchema);