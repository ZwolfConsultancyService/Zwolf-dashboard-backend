import express from 'express';
import {
  checkConflict,
  createMeeting,
  getMyMeetings,
  getAllMeetings,
  getCalendarData,
  getTodayMeetings,
  getMeeting,
  updateMeeting,
  updateMeetingStatus,
  deleteMeeting,
} from '../controllers/meetingController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect);

/* =========================================================
   SPECIFIC ROUTES (must be before /:id)
========================================================= */

router.get('/check-conflict', checkConflict);
router.get('/my', getMyMeetings);
router.get('/today', getTodayMeetings);
router.get('/calendar', getCalendarData);

router.post(
  '/',
  authorize('manager', 'sales'),
  createMeeting
);

router.get(
  '/',
  authorize('manager', 'sales'),
  getAllMeetings
);

/* =========================================================
   ID-BASED ROUTES
========================================================= */

router.put(
  '/:id',
  authorize('manager', 'sales'),
  updateMeeting
);

router.patch(
  '/:id/status',
  authorize('manager', 'sales'),
  updateMeetingStatus
);
// ✅ Naya Code:             
router.delete(
  '/:id',
  authorize('manager', 'sales'), // 'sales' add kiya
  deleteMeeting
);

/* =========================================================
   SINGLE — must be LAST
========================================================= */

router.get('/:id', getMeeting);

export default router;