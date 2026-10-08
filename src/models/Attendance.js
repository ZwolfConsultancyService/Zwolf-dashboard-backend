import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    /* =====================================================
       BASIC
    ===================================================== */

    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    /* =====================================================
       LOGIN / LOGOUT
    ===================================================== */

    loginTime: {
      type: Date,
      default: null,
    },

    logoutTime: {
      type: Date,
      default: null,
    },

    workingMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    overtimeMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* =====================================================
       LATE MARK
    ===================================================== */

    isLate: {
      type: Boolean,
      default: false,
    },

    lateMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* =====================================================
       HALF DAY / STATUS
    ===================================================== */

    isHalfDay: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: [
        'Present',
        'Absent',
        'Half Day',
        'Leave',
        'Holiday',
        'Weekend',
      ],
      default: 'Present',
      index: true,
    },

    /* =====================================================
       HOLIDAY REFERENCE
    ===================================================== */

    isHoliday: {
      type: Boolean,
      default: false,
    },

    holidayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Holiday',
      default: null,
    },

    /* =====================================================
       CAPTURE METHOD
    ===================================================== */

    captureMethod: {
      type: String,
      enum: ['face', 'manual', 'auto', 'system'],
      default: 'manual',
    },

    /* =====================================================
       FACE RECOGNITION
    ===================================================== */

    faceMatchScore: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },

    faceImage: {
      type: String,
      default: '',
    },

    /* =====================================================
       AUTO LOGOUT
    ===================================================== */

    autoLoggedOut: {
      type: Boolean,
      default: false,
    },

    /* =====================================================
       NOTES
    ===================================================== */

    notes: {
      type: String,
      trim: true,
    },

    remarks: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

/* =========================================================
   INDEXES
========================================================= */

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ isLate: 1 });

export default mongoose.model('Attendance', attendanceSchema);