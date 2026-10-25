import express from 'express';
import {
  createAssignment, getAssignments, getMyAssignments,
  updateAssignment, deleteAssignment, getAllCombos,
  claimCombo, markAsDone, markAsPending, sendReminderNow,
  getPendingSummary,
} from '../controllers/assignmentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

// Manager
router.get('/', authorize('admin', 'manager'), getAssignments);
router.post('/', authorize('admin', 'manager'), createAssignment);
router.put('/:id', authorize('admin', 'manager'), updateAssignment);
router.delete('/:id', authorize('admin', 'manager'), deleteAssignment);
router.post('/:id/send-reminder', authorize('admin', 'manager'), sendReminderNow);
router.get('/pending-summary', authorize('admin', 'manager'), getPendingSummary);

// Shared (manager + sales)
router.get('/all-combos', getAllCombos);

// Sales
router.get('/my', authorize('sales'), getMyAssignments);
router.post('/claim', authorize('sales'), claimCombo);
router.patch('/:id/done', markAsDone);
router.patch('/:id/pending', markAsPending);

export default router;