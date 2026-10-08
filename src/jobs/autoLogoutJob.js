import cron from 'node-cron';
import Attendance from '../models/Attendance.js';
import AttendanceSettings from '../models/AttendanceSettings.js';
import {
  startOfDay,
  parseTimeToDate,
  buildAttendanceData,
} from '../utils/attendanceHelpers.js';

/* =========================================================
   AUTO-LOGOUT JOB
   
   Runs every 5 minutes
   Checks if current time >= officeEndTime
   Auto-logs out anyone who hasn't logged out
========================================================= */

export const startAutoLogoutJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const settings = await AttendanceSettings.getSettings();

      if (!settings.autoLogoutEnabled) return;

      const now = new Date();
      const today = startOfDay();

      const officeEnd = parseTimeToDate(
        settings.officeEndTime,
        today
      );

      /* Only run if we've passed office end time */
      if (now < officeEnd) return;

      const pending = await Attendance.find({
        date: today,
        loginTime: { $ne: null },
        logoutTime: null,
      });

      if (pending.length === 0) return;

      let count = 0;

      for (const att of pending) {
        const computed = buildAttendanceData({
          loginTime: att.loginTime,
          logoutTime: officeEnd,
          settings,
          captureMethod: 'system',
          faceMatchScore: att.faceMatchScore,
          faceImage: att.faceImage,
        });

        Object.assign(att, computed, { autoLoggedOut: true });
        await att.save();
        count++;
      }

      console.log(`⏰ Auto-logged out ${count} employees`);
    } catch (err) {
      console.error('Auto-logout error:', err);
    }
  });

  console.log('✅ Auto-logout cron started (every 5 min)');
};