import mongoose from 'mongoose';

const attendanceSettingsSchema = new mongoose.Schema(
  {
    /* =====================================================
       OFFICE TIMINGS
    ===================================================== */

    officeStartTime: {
      type: String,
      default: '10:00',
    },

    officeEndTime: {
      type: String,
      default: '18:00',
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
       🆕 CUTOFF TIMES (NEW)
    ===================================================== */

    /* After this time → Half Day (12:00 PM) */
    halfDayCutoffTime: {
      type: String,
      default: '12:00',
    },

    /* After this time → Absent (1:00 PM) */
    absentCutoffTime: {
      type: String,
      default: '13:00',
    },

    /* =====================================================
       LATE / HALF DAY RULES
    ===================================================== */

    lateGraceMinutes: {
      type: Number,
      default: 15,
    },

    halfDayMinutes: {
      type: Number,
      default: 240,
    },

    fullDayMinutes: {
      type: Number,
      default: 480,
    },

    /* =====================================================
       WEEKEND
    ===================================================== */

    weekendDays: {
      type: [Number],
      default: [0],
    },

    /* =====================================================
       AUTO LOGOUT
    ===================================================== */

    autoLogoutEnabled: {
      type: Boolean,
      default: true,
    },

    /* =====================================================
       AUTO ABSENT (NEW)
    ===================================================== */

    autoAbsentEnabled: {
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
      default: 0.6,
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