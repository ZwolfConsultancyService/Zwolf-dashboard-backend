import express from 'express';
import {
  kioskFaceCheckIn,
  getKioskInfo,
  listKiosks,
  createKiosk,
  updateKiosk,
  regenerateKioskKey,
  deleteKiosk,
} from '../controllers/kioskController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import faceUpload from '../middleware/faceUploadMiddleware.js';

const router = express.Router();

/* =========================================================
   🆕 PUBLIC ROUTES (no login required — Kiosk uses these)
========================================================= */

router.get('/info', getKioskInfo);

router.post(
  '/face-check-in',
  faceUpload.single('image'),
  kioskFaceCheckIn
);

/* =========================================================
   MANAGER ROUTES (login required)
========================================================= */

router.get('/', protect, authorize('manager'), listKiosks);
router.post('/', protect, authorize('manager'), createKiosk);
router.put('/:id', protect, authorize('manager'), updateKiosk);
router.patch(
  '/:id/regenerate',
  protect,
  authorize('manager'),
  regenerateKioskKey
);
router.delete('/:id', protect, authorize('manager'), deleteKiosk);

export default router;