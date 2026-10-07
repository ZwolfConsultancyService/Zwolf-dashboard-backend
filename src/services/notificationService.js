import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { emitToUser, isUserOnline } from '../../socket.js';
import { sendPushToEmployee } from '../utils/pushNotification.js';

/* =========================================================
   NOTIFY — Universal Notification Sender
========================================================= */

export const notify = async ({
  from,
  to,
  type,
  title,
  message,
  referenceId = null,
  url = null,
}) => {
  try {
    const recipients = Array.isArray(to)
      ? to.filter(Boolean)
      : to
      ? [to]
      : [];

    if (recipients.length === 0) return;

    const uniqueRecipients = [
      ...new Set(
        recipients
          .map((r) => String(r))
          .filter((r) => r !== String(from))
      ),
    ];

    if (uniqueRecipients.length === 0) return;

    const notification = await Notification.create({
      title,
      message,
      sender: from,
      recipientType: 'Specific',
      recipients: uniqueRecipients,
      readBy: [],
    });

    let targetUrl = url;

    if (!targetUrl) {
      switch (type) {
        case 'task':
          targetUrl = referenceId
            ? `/developer/tasks?id=${referenceId}`
            : '/developer/tasks';
          break;
        case 'project':
          targetUrl = referenceId
            ? `/developer/projects/${referenceId}`
            : '/developer/projects';
          break;
        case 'client':
          targetUrl = referenceId
            ? `/manager/clients/${referenceId}`
            : '/manager/clients';
          break;
        case 'payment':
          targetUrl = '/manager/payments';
          break;
        case 'detail':
          targetUrl = '/developer/details';
          break;
        case 'guide':
          targetUrl = '/developer/guide';
          break;
        case 'daily-status':
          targetUrl = '/manager/daily-status';
          break;
        case 'attendance':
          targetUrl = '/manager/attendance';
          break;
        case 'message':
          targetUrl = referenceId
            ? `/messages?c=${referenceId}`
            : '/messages';
          break;
        default:
          targetUrl = '/notifications';
      }
    }

    await Promise.allSettled(
      uniqueRecipients.map(async (userId) => {
        const online = isUserOnline(userId);

        emitToUser(userId, 'new-notification', {
          _id: notification._id,
          title,
          message,
          type,
          url: targetUrl,
          referenceId,
          createdAt: notification.createdAt,
          sender: from,
        });

        if (!online) {
          await sendPushToEmployee(userId, {
            title,
            body: message,
            url: targetUrl,
            tag: `notif-${type}-${referenceId || notification._id}`,
          }).catch((e) =>
            console.error('notify push err:', e)
          );
        }
      })
    );

    return notification;
  } catch (err) {
    console.error('notify error:', err);
    return null;
  }
};

/* =========================================================
   NOTIFY MANAGER — Employee → Manager
========================================================= */

export const notifyManager = async ({
  employeeId,
  type,
  title,
  message,
  referenceId = null,
  url = null,
}) => {
  try {
    const employee = await User.findById(employeeId).select(
      'name reportingManager role'
    );

    if (!employee || !employee.reportingManager) {
      console.warn('notifyManager: no reporting manager');
      return null;
    }

    return await notify({
      from: employeeId,
      to: employee.reportingManager,
      type,
      title,
      message,
      referenceId,
      url,
    });
  } catch (err) {
    console.error('notifyManager error:', err);
    return null;
  }
};

/* =========================================================
   NOTIFY MANY — Multiple recipients
========================================================= */

export const notifyMany = async ({
  from,
  to,
  type,
  title,
  message,
  referenceId = null,
  url = null,
}) => {
  return await notify({
    from,
    to: Array.isArray(to) ? to : [to],
    type,
    title,
    message,
    referenceId,
    url,
  });
};