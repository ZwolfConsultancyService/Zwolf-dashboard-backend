import express from 'express';
import {
  createOrUpdateDailyStatus, getMyDailyStatus, getAllDailyStatus, updateDailyStatus,
} from '../controllers/dailyStatusController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.route('/').post(createOrUpdateDailyStatus).get(authorize('manager'), getAllDailyStatus);
router.get('/my', getMyDailyStatus);
router.put('/:id', updateDailyStatus);

export default router;