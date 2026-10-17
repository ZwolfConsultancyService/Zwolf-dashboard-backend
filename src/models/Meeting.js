import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema(
  {
    /* =====================================================
       CLIENT
    ===================================================== */

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },

    clientName: {
      type: String,
      trim: true,
    },

    clientPhone: {
      type: String,
      trim: true,
    },

    /* =====================================================
       MEETING TYPE
    ===================================================== */

    meetingType: {
      type: String,
      enum: [
        'Doctor',
        'Hospital',
        'Pharmacy',
        'Clinic',
        'Diagnostic',
        'Other',
      ],
      default: 'Doctor',
      index: true,
    },

    /* =====================================================
       SCHEDULE
    ===================================================== */

    date: {
      type: Date,
      required: true,
      index: true,
    },

    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    startMinutes: {
      type: Number,
      required: true,
      index: true,
    },

    endMinutes: {
      type: Number,
      required: true,
      index: true,
    },

    duration: {
      type: Number,
      required: true,
      default: 30,
      min: 15,
    },

    /* =====================================================
       DETAILS
    ===================================================== */

    purpose: {
      type: String,
      trim: true,
      default: '',
    },

    notes: {
      type: String,
      trim: true,
      default: '',
    },

    location: {
      type: String,
      trim: true,
      default: '',
    },

    /* =====================================================
       SALES PERSON
    ===================================================== */

    salesPerson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
      participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    /* =====================================================
       STATUS
    ===================================================== */

    status: {
      type: String,
      enum: ['Scheduled', 'Completed', 'Cancelled', 'NoShow'],
      default: 'Scheduled',
      index: true,
    },

    /* =====================================================
       REMINDER
    ===================================================== */

    reminderSent: {
      type: Boolean,
      default: false,
    },

    reminderSentAt: {
      type: Date,
      default: null,
    },

    /* =====================================================
       METADATA
    ===================================================== */

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelReason: {
      type: String,
      trim: true,
      default: '',
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* =========================================================
   INDEXES
========================================================= */

meetingSchema.index({ date: 1, salesPerson: 1, status: 1 });
meetingSchema.index({ date: 1, startMinutes: 1 });
meetingSchema.index({ client: 1, date: 1 });
meetingSchema.index({ status: 1, date: 1 });

export default mongoose.model('Meeting', meetingSchema);