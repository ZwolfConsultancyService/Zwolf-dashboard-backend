import mongoose from 'mongoose';

const attendanceSettingsSchema = new mongoose.Schema(
  {
    /* =====================================================
       OFFICE TIMINGS
    ===================================================== */

    officeStartTime: {
      type: String,
      default: '10:00', // HH:MM (24hr)
    },

    officeEndTime: {
      type: String,
      default: '18:00', // 6 PM
    },

    lunchStartTime: {
      type: String,
      default: '13:00',
    },

    lunchEndTime: {
      type: String,
      default: '14:00',
    },

    /* =====================================================
       LATE / HALF DAY RULES
    ===================================================== */

    lateGraceMinutes: {
      type: Number,
      default: 15, // 10:15 AM tak allowed
    },

    halfDayMinutes: {
      type: Number,
      default: 240, // 4 hours
    },

    fullDayMinutes: {
      type: Number,
      default: 480, // 8 hours
    },

    /* =====================================================
       WEEKEND
    ===================================================== */

    weekendDays: {
      type: [Number],
      default: [0, 6], // 0=Sunday, 6=Saturday
    },

    /* =====================================================
       AUTO LOGOUT
    ===================================================== */

    autoLogoutEnabled: {
      type: Boolean,
      default: true,
    },

    /* =====================================================
       FACE RECOGNITION
    ===================================================== */

    faceRecognitionEnabled: {
      type: Boolean,
      default: true,
    },

    faceMatchThreshold: {
      type: Number,
      default: 0.6, // 0.6 = 60% confidence minimum
    },

    /* =====================================================
       UPDATED BY
    ===================================================== */

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

/* =========================================================
   SINGLETON — only 1 settings doc
========================================================= */

attendanceSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export default mongoose.model(
  'AttendanceSettings',
  attendanceSettingsSchema
);