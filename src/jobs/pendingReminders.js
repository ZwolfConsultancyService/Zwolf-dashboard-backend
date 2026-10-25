import cron from 'node-cron';
import Assignment from '../models/Assignment.js';
import { sendPendingReminder } from '../services/whatsappService.js';

export const checkPendingAssignments = async () => {
  try {
    // Sirf wahi assignments jinka status Pending hai
    const pending = await Assignment.find({
      isActive: true,
      status: 'Pending',
    })
      .populate('salesPerson', 'name email phone')
      .populate('category', 'name')
      .populate({
        path: 'location',
        select: 'name level parent',
        populate: { path: 'parent', select: 'name' },
      });

    console.log(`[Reminders] Found ${pending.length} pending assignments`);

    let sent = 0;
    for (const a of pending) {
      if (!a.salesPerson || !a.category || !a.location) continue;

      const result = await sendPendingReminder({
        assignment: a,
        salesPerson: a.salesPerson,
        category: a.category,
        location: a.location,
      });

      if (result.success) {
        a.lastReminderSentAt = new Date();
        a.reminderCount = (a.reminderCount || 0) + 1;
        await a.save();
        sent++;
      }
    }

    console.log(`[Reminders] Sent ${sent}/${pending.length} messages`);
    return { sent, total: pending.length };
  } catch (err) {
    console.error('[Reminders] Error:', err);
    return { sent: 0, error: err.message };
  }
};

export const startReminderCron = () => {



  // ⏰ Roz subah 10:00 AM per message jayega
  cron.schedule('0 10 * * *', async () => {
    console.log('[Cron] Running daily 10:00 AM pending assignments check...');
    await checkPendingAssignments();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // 🇮🇳 Indian Time (IST) ke hisaab se 10 baje
  });

  console.log('✅ Daily Pending Reminder cron started (Everyday at 10:00 AM IST)');
};


// export const startReminderCron = () => {
//   // 🧪 TESTING: Har 1 minute baad chalega (baad mein isko wapas '0 10 * * *' kar dena)
//   cron.schedule('*/1 * * * *', async () => {
//     console.log('[Cron Test] Running 1-minute check...');
//     await checkPendingAssignments();
//   }, {
//     scheduled: true,
//     timezone: "Asia/Kolkata" 
//   });

//   console.log('✅ TEST Cron started (Runs every 1 minute)');
// };