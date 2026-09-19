import express from 'express';
import {
  getPayments, createPayment, getPayment, getClientPayments, deletePayment,
} from '../controllers/paymentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect, authorize('manager', 'sales'));

router.route('/').get(getPayments).post(createPayment);
router.get('/client/:clientId', getClientPayments);
router.route('/:id').get(getPayment).delete(authorize('manager'), deletePayment);

export default router;