import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@praveen.cloud',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Send push to a specific employee
 */
export const sendPushToEmployee = async (userId, payload) => {
  try {
    const subs = await PushSubscription.find({
      userType: 'employee',
      userId,
    });

    if (!subs.length) return;

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          JSON.stringify(payload)
        )
      )
    );

    // Remove expired subscriptions
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected') {
        const status = r.reason?.statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: subs[i]._id });
        }
      }
    }
  } catch (err) {
    console.error('sendPushToEmployee error:', err);
  }
};

/**
 * Send push to a specific client
 */
export const sendPushToClient = async (clientId, payload) => {
  try {
    const subs = await PushSubscription.find({
      userType: 'client',
      userId: clientId,
    });

    if (!subs.length) return;

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          JSON.stringify(payload)
        )
      )
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected') {
        const status = r.reason?.statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: subs[i]._id });
        }
      }
    }
  } catch (err) {
    console.error('sendPushToClient error:', err);
  }
};