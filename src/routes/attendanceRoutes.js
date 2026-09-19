import express from 'express';
import {
  checkIn, checkOut, getMyAttendance, getAllAttendance, updateAttendance,
} from '../controllers/attendanceController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/my', getMyAttendance);
router.get('/', authorize('manager'), getAllAttendance);
router.put('/:id', authorize('manager'), updateAttendance);

export default router;