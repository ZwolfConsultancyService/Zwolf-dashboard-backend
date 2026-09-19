import express from 'express';
import {
  getTasks, createTask, getTask, updateTask, updateTaskStatus, deleteTask,
} from '../controllers/taskController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect, authorize('manager', 'developer'));

router.route('/').get(getTasks).post(createTask);
router.route('/:id').get(getTask).put(updateTask).delete(authorize('manager'), deleteTask);
router.patch('/:id/status', updateTaskStatus);

export default router;