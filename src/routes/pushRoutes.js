import express from 'express';
import PushSubscription from '../models/PushSubscription.js';
import { protect } from '../middleware/authMiddleware.js';
import { protectClient } from '../middleware/clientAuthMiddleware.js';

const router = express.Router();

/**
 * POST /api/push/subscribe
 * Employee subscription save
 */
router.post('/subscribe', protect, async (req, res) => {
  try {
    const { endpoint, keys, userAgent } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription',
      });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        userType: 'employee',
        userId: req.user._id,
        endpoint,
        keys,
        userAgent: userAgent || req.headers['user-agent'] || '',
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('subscribe error:', err);
    return res.status(500).json({ success: false });
  }
});

/**
 * POST /api/push/subscribe-client
 * Client subscription save
 */
router.post('/subscribe-client', protectClient, async (req, res) => {
  try {
    const { endpoint, keys, userAgent } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription',
      });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        userType: 'client',
        userId: req.client._id,
        endpoint,
        keys,
        userAgent: userAgent || req.headers['user-agent'] || '',
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('subscribe-client error:', err);
    return res.status(500).json({ success: false });
  }
});

/**
 * POST /api/push/unsubscribe
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await PushSubscription.deleteOne({ endpoint });
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false });
  }
});

export default router;