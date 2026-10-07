import express from 'express';
import {
  createOrUpdateDailyStatus,
  getMyDailyStatus,
  getAllDailyStatus,
  updateDailyStatus,
  deleteDailyStatus,          // 🆕 Import
} from '../controllers/dailyStatusController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.post('/', createOrUpdateDailyStatus);
router.get('/my', getMyDailyStatus);
router.get('/', authorize('manager'), getAllDailyStatus);
router.put('/:id', updateDailyStatus);

/* 🆕 DELETE */
router.delete('/:id', deleteDailyStatus);

export default router;