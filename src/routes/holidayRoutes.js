import express from 'express';
import {
  getHolidays,
  getMyHolidays,
  getHoliday,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getCalendar,
} from '../controllers/holidayController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect);

/* =========================================================
   PUBLIC (for all logged-in users)
========================================================= */

router.get('/', getHolidays);
router.get('/my', getMyHolidays);
router.get('/calendar/:year/:month', getCalendar);

/* =========================================================
   MANAGER ONLY
========================================================= */

router.post('/', authorize('manager'), createHoliday);

/* =========================================================
   SINGLE (must be LAST so it doesn't shadow other routes)
========================================================= */

router.get('/:id', getHoliday);
router.put('/:id', authorize('manager'), updateHoliday);
router.delete('/:id', authorize('manager'), deleteHoliday);

export default router;