
import express from 'express';
import {
  getEmployees,
  createEmployee,
  getEmployee,
  updateEmployee,
  toggleEmployeeStatus,
  deleteEmployee,
  getEmployeeDetail,
  getEmployeeSalary,
  setEmployeeSalary,
} from '../controllers/employeeController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// All employee routes require authentication.
router.use(protect);

// Employee list: Manager and Sales can access it for meetings.
router.get(
  '/',
  authorize('manager', 'sales'),
  getEmployees
);

// Employee creation: Manager only.
router.post(
  '/',
  authorize('manager'),
  createEmployee
);

// Employee detail: Manager and Sales can view basic employee information.
router.get(
  '/:id',
  authorize('manager', 'sales'),
  getEmployee
);

// Employee updates: Manager only.
router.put(
  '/:id',
  authorize('manager'),
  updateEmployee
);

// Employee activation/deactivation: Manager only.
router.patch(
  '/:id/status',
  authorize('manager'),
  toggleEmployeeStatus
);

// Employee deletion: Manager only.
router.delete(
  '/:id',
  authorize('manager'),
  deleteEmployee
);

// Sensitive employee details and salary: Manager only.
router.get(
  '/:id/detail',
  authorize('manager'),
  getEmployeeDetail
);

router.get(
  '/:id/salary',
  authorize('manager'),
  getEmployeeSalary
);

router.put(
  '/:id/salary',
  authorize('manager'),
  setEmployeeSalary
);

export default router;
