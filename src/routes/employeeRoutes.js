import express from 'express';
import {
  getEmployees, createEmployee, getEmployee, updateEmployee,
  toggleEmployeeStatus, deleteEmployee,
} from '../controllers/employeeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect, authorize('manager'));

router.route('/').get(getEmployees).post(createEmployee);
router.route('/:id').get(getEmployee).put(updateEmployee).delete(deleteEmployee);
router.patch('/:id/status', toggleEmployeeStatus);

export default router;