import express from 'express';
import {
  checkIn,
  checkOut,
  getMyAttendance,
  getAllAttendance,
  updateAttendance,
  deleteAttendance,
  deleteAllAttendance,
} from '../controllers/attendanceController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

/* =========================================================
   EMPLOYEE ROUTES
========================================================= */

router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/my', getMyAttendance);

/* =========================================================
   MANAGER ROUTES
========================================================= */

router.get('/', authorize('manager'), getAllAttendance);

/* 🆕 DELETE ALL — MUST be BEFORE /:id */
router.delete(
  '/delete-all',
  authorize('manager'),
  deleteAllAttendance
);

/* 🆕 DELETE SINGLE */
router.delete(
  '/:id',
  authorize('manager'),
  deleteAttendance
);

/* UPDATE */
router.put('/:id', authorize('manager'), updateAttendance);

export default router;