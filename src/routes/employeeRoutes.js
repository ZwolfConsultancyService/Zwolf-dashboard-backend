import express from 'express';
import {
  getEmployees, createEmployee, getEmployee, updateEmployee,
  toggleEmployeeStatus, deleteEmployee,   getEmployeeDetail,
  getEmployeeSalary,
  setEmployeeSalary,
} from '../controllers/employeeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect, authorize('manager'));

router.route('/').get(getEmployees).post(createEmployee);
router.route('/:id').get(getEmployee).put(updateEmployee).delete(deleteEmployee);
router.patch('/:id/status', toggleEmployeeStatus);
/* =========================================================
   🆕 EMPLOYEE DETAIL + SALARY (Manager only)
========================================================= */

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

/* =========================================================
   SINGLE EMPLOYEE (must be LAST)
========================================================= */

router.get('/:id', getEmployee);
export default router;