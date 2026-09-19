import express from 'express';
import {
  getProjects, createProject, getProject, updateProject,
  updateProjectStatus, updateProjectProgress, deleteProject,
} from '../controllers/projectController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.route('/').get(getProjects).post(authorize('manager', 'sales'), createProject);
router.route('/:id').get(getProject).put(updateProject).delete(authorize('manager'), deleteProject);
router.patch('/:id/status', updateProjectStatus);
router.patch('/:id/progress', updateProjectProgress);

export default router;