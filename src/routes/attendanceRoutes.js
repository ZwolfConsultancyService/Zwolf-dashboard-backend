import express from 'express';
import {
  getSettings,
  updateSettings,
  checkIn,
  checkOut,
  autoLogout,
  getMyAttendance,
  getAllAttendance,
  updateAttendance,
  deleteAttendance,
  deleteAllAttendance,
  /* 🆕 FACE */
  registerEmployeeFace,
  faceCheckIn,
  removeEmployeeFace,
  mlHealthCheck,
} from '../controllers/attendanceController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import faceUpload from '../middleware/faceUploadMiddleware.js';

const router = express.Router();
router.use(protect);

/* =========================================================
   SETTINGS
========================================================= */

router.get('/settings', getSettings);
router.put('/settings', authorize('manager'), updateSettings);

/* =========================================================
   FACE RECOGNITION
========================================================= */

/* Health check */
router.get('/ml-health', mlHealthCheck);

/* Employee face check-in (camera) */
router.post(
  '/face-check-in',
  faceUpload.single('image'),
  faceCheckIn
);

/* Manager: register employee face */
router.post(
  '/face/register/:employeeId',
  authorize('manager'),
  faceUpload.single('image'),
  registerEmployeeFace
);

/* Manager: remove employee face */
router.delete(
  '/face/:employeeId',
  authorize('manager'),
  removeEmployeeFace
);

/* =========================================================
   EMPLOYEE CHECK-IN / OUT
========================================================= */

router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/my', getMyAttendance);

/* =========================================================
   MANAGER ROUTES
========================================================= */

router.get('/', authorize('manager'), getAllAttendance);
router.post('/auto-logout', authorize('manager'), autoLogout);

router.delete(
  '/delete-all',
  authorize('manager'),
  deleteAllAttendance
);

router.delete(
  '/:id',
  authorize('manager'),
  deleteAttendance
);

router.put('/:id', authorize('manager'), updateAttendance);

export default router;