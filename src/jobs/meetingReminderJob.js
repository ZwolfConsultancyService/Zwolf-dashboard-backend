import cron from 'node-cron';
import Meeting from '../models/Meeting.js';
import { notify } from '../services/notificationService.js';
import {
  parseTimeToMinutes,
  startOfDay,
} from '../utils/meetingHelpers.js';

/* =========================================================
   MEETING REMINDER — runs every 5 minutes
   
   Har meeting ke 15 min pehle reminder bhejta hai
========================================================= */

export const startMeetingReminderJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const today = startOfDay(now);

      const currentMinutes =
        now.getHours() * 60 + now.getMinutes();

      /* Find meetings starting in next 15-20 min */
      const upcoming = await Meeting.find({
        date: today,
        status: 'Scheduled',
        reminderSent: false,
        startMinutes: {
          $gte: currentMinutes + 15,
          $lte: currentMinutes + 20,
        },
      })
        .populate('client', 'clientName')
        .populate('salesPerson', 'name reportingManager');

      for (const meeting of upcoming) {
        const clientName =
          meeting.client?.clientName ||
          meeting.clientName ||
          'Client';

        const notifPayload = {
          type: 'meeting',
          title: '⏰ Meeting Reminder',
          message: `Meeting with ${clientName} in 15 minutes at ${meeting.startTime}`,
          referenceId: meeting._id,
          url: '/manager/meetings',
        };

        /* Notify sales person */
        try {
          await notify({
            from: meeting.salesPerson._id,
            to: meeting.salesPerson._id,
            ...notifPayload,
          });
        } catch (err) {
          console.error('reminder sales err:', err);
        }

        /* Notify reporting manager */
        if (meeting.salesPerson?.reportingManager) {
          try {
            await notify({
              from: meeting.salesPerson._id,
              to: meeting.salesPerson.reportingManager,
              ...notifPayload,
            });
          } catch (err) {
            console.error('reminder manager err:', err);
          }
        }

        /* Mark reminder sent */
        meeting.reminderSent = true;
        meeting.reminderSentAt = new Date();
        await meeting.save();
      }

      if (upcoming.length > 0) {
        console.log(
          `⏰ Sent ${upcoming.length} meeting reminders`
        );
      }
    } catch (err) {
      console.error('Meeting reminder error:', err);
    }
  });

  console.log(
    '✅ Meeting reminder cron started (every 5 min, 15-min advance)'
  );
};