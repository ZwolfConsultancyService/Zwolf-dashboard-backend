import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';
import { notify } from '../services/notificationService.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Holiday from '../models/Holiday.js';
import AttendanceSettings from '../models/AttendanceSettings.js';
import { startOfDay, isWeekend } from '../utils/attendanceHelpers.js';


export const getEmployees = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { search, role, department, isActive } = req.query;

  const filter = {};
  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
  ];
  if (role) filter.role = role;
  if (department) filter.department = department;
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const [data, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

export const createEmployee = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone, department, designation, joiningDate } = req.body;

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) throw new ApiError(400, 'Email already exists');

  const user = await User.create({
    name, email, password, role, phone, department, designation, joiningDate,
  });

  await logActivity({
    user: req.user._id, action: 'CREATE', module: 'Employee',
    description: `Created employee ${user.name} (${user.role})`, referenceId: user._id,
  });
/* 🔔 Welcome notification to new employee */
try {
  await notify({
    from: req.user._id,
    to: user._id,
    type: 'welcome',
    title: 'Welcome to Zwolf',
    message: `Your account has been created. Welcome ${user.name}!`,
    url: '/notifications',
  });
} catch (e) {
  console.error('welcome notify err:', e);
}
  res.status(201).json({ success: true, data: user });
});

export const getEmployee = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Employee not found');
  res.json({ success: true, data: user });
});

export const updateEmployee = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Employee not found');

  const allowed = ['name', 'phone', 'role', 'department', 'designation', 'joiningDate', 'profileImage'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) user[f] = req.body[f]; });

  if (req.body.password) user.password = req.body.password;

  await user.save();

  await logActivity({
    user: req.user._id, action: 'UPDATE', module: 'Employee',
    description: `Updated employee ${user.name}`, referenceId: user._id,
  });

  res.json({ success: true, data: user });
});

export const toggleEmployeeStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Employee not found');
  if (user._id.equals(req.user._id)) throw new ApiError(400, 'You cannot disable yourself');

  user.isActive = !user.isActive;
  await user.save();

  await logActivity({
    user: req.user._id, action: 'UPDATE', module: 'Employee',
    description: `${user.isActive ? 'Enabled' : 'Disabled'} employee ${user.name}`,
    referenceId: user._id,
  });

  res.json({ success: true, data: user });
});

export const deleteEmployee = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, 'Employee not found');
  }

  if (user._id.equals(req.user._id)) {
    throw new ApiError(400, 'You cannot delete yourself');
  }

  await User.findByIdAndDelete(req.params.id);

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Employee',
    description: `Deleted employee ${user.name}`,
    referenceId: user._id,
  });

  res.json({
    success: true,
    message: 'Employee deleted successfully',
  });
});

/* =========================================================
   🆕 GET EMPLOYEE DETAIL
   
   GET /api/employees/:id/detail?month=10&year=2026
========================================================= */

export const getEmployeeDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const year = Number(req.query.year) || new Date().getFullYear();

  /* Get employee */
  const employee = await User.findById(id)
    .populate('reportingManager', 'name email role');

  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  /* Month range */
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);

  /* Get attendance */
  const attendance = await Attendance.find({
    employee: id,
    date: { $gte: monthStart, $lte: monthEnd },
  }).sort('date');

  /* Get leaves */
  const leaves = await Leave.find({
    employee: id,
    status: 'Approved',
    $or: [
      {
        fromDate: { $lte: monthEnd },
        toDate: { $gte: monthStart },
      },
    ],
  });

  /* Get holidays */
  const holidays = await Holiday.find({
    isActive: true,
    date: { $gte: monthStart, $lte: monthEnd },
    $or: [
      { applicableTo: 'All' },
      { applicableTo: employee.role },
      {
        applicableTo: 'Specific',
        specificEmployees: employee._id,
      },
    ],
  });

  /* Count stats */
  const stats = {
    present: 0,
    absent: 0,
    halfDay: 0,
    leave: 0,
    holiday: 0,
    weekend: 0,
    late: 0,
    totalWorkingMinutes: 0,
    totalOvertimeMinutes: 0,
  };

  attendance.forEach((a) => {
    if (a.status === 'Present') stats.present++;
    else if (a.status === 'Absent') stats.absent++;
    else if (a.status === 'Half Day') stats.halfDay++;
    else if (a.status === 'Leave') stats.leave++;
    else if (a.status === 'Holiday') stats.holiday++;
    else if (a.status === 'Weekend') stats.weekend++;

    if (a.isLate) stats.late++;
    stats.totalWorkingMinutes += a.workingMinutes || 0;
    stats.totalOvertimeMinutes += a.overtimeMinutes || 0;
  });

  res.json({
    success: true,
    data: {
      employee,
      month,
      year,
      attendance,
      leaves,
      holidays,
      stats,
    },
  });
});

/* =========================================================
   🆕 GET EMPLOYEE SALARY BREAKDOWN
   
   GET /api/employees/:id/salary?month=10&year=2026
========================================================= */

/* =========================================================
   GET EMPLOYEE SALARY BREAKDOWN (Simple)
   
   GET /api/employees/:id/salary?month=10&year=2026
========================================================= */

export const getEmployeeSalary = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const year = Number(req.query.year) || new Date().getFullYear();

  const employee = await User.findById(id);
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  const monthlySalary = Number(employee.monthlySalary || 0);

  /* Month range */
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);

  /* Get attendance */
  const attendance = await Attendance.find({
    employee: id,
    date: { $gte: monthStart, $lte: monthEnd },
  });

  /* Get holidays */
  const holidays = await Holiday.find({
    isActive: true,
    date: { $gte: monthStart, $lte: monthEnd },
    $or: [
      { applicableTo: 'All' },
      { applicableTo: employee.role },
      {
        applicableTo: 'Specific',
        specificEmployees: employee._id,
      },
    ],
  });

  /* Settings */
  const settings = await AttendanceSettings.getSettings();

  /* =====================================================
     STEP 1: WORKING DAYS
  ===================================================== */

  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);

    /* Skip weekend */
    if (isWeekend(date, settings.weekendDays)) continue;

    /* Skip holiday */
    const isHol = holidays.find((h) => {
      const hStart = startOfDay(h.date);
      const hEnd = h.endDate ? endOfDay(h.endDate) : hStart;
      return date >= hStart && date <= hEnd;
    });

    if (isHol) continue;

    workingDays++;
  }

  /* =====================================================
     STEP 2: ATTENDANCE COUNT
  ===================================================== */

  const stats = {
    present: 0,
    absent: 0,
    halfDay: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    holiday: 0,
    weekend: 0,
  };

  attendance.forEach((a) => {
    if (a.status === 'Present') stats.present++;
    else if (a.status === 'Absent') stats.absent++;
    else if (a.status === 'Half Day') stats.halfDay++;
    else if (a.status === 'Leave') {
      if (a.notes?.toLowerCase().includes('unpaid')) {
        stats.unpaidLeave++;
      } else {
        stats.paidLeave++;
      }
    } else if (a.status === 'Holiday') stats.holiday++;
    else if (a.status === 'Weekend') stats.weekend++;
  });

  /* =====================================================
     STEP 3: CALCULATE
  ===================================================== */

  const perDay =
    workingDays > 0 ? monthlySalary / workingDays : 0;

  /* Effective Days */
  const presentDays = stats.present;
  const halfDayDays = stats.halfDay * 0.5;
  const paidLeaveDays = stats.paidLeave;

  const effectiveDays = presentDays + halfDayDays + paidLeaveDays;

  /* Final */
  const finalSalary = Math.round(effectiveDays * perDay);
  const deductions = Math.round(monthlySalary - finalSalary);

  /* =====================================================
     RESPONSE
  ===================================================== */

  res.json({
    success: true,
    data: {
      employee: {
        _id: employee._id,
        name: employee.name,
        role: employee.role,
        department: employee.department,
        designation: employee.designation,
      },
      month,
      year,
      monthlySalary,
      workingDays,
      perDaySalary: Math.round(perDay),
       stats,  

      /* Simple breakdown */
      earn: {
        present: {
          days: stats.present,
          amount: Math.round(presentDays * perDay),
        },
        halfDay: {
          days: stats.halfDay,
          amount: Math.round(halfDayDays * perDay),
        },
        paidLeave: {
          days: stats.paidLeave,
          amount: Math.round(paidLeaveDays * perDay),
        },
        totalDays: effectiveDays,
        totalAmount: finalSalary,
      },

      /* Cuts */
      cut: {
        absent: {
          days: stats.absent,
          amount: Math.round(stats.absent * perDay),
        },
        halfDay: {
          days: stats.halfDay,
          amount: Math.round(halfDayDays * perDay),
        },
        unpaidLeave: {
          days: stats.unpaidLeave,
          amount: Math.round(stats.unpaidLeave * perDay),
        },
        totalAmount: deductions,
      },

      /* No effect */
      noEffect: {
        holiday: stats.holiday,
        weekend: stats.weekend,
      },

      finalSalary,
      deductions,
    },
  });
});

/* =========================================================
   🆕 SET EMPLOYEE SALARY (Manager only)
   
   PUT /api/employees/:id/salary
   Body: { monthlySalary, salaryType }
========================================================= */

export const setEmployeeSalary = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { monthlySalary, salaryType = 'Monthly' } = req.body;

  const employee = await User.findById(id);

  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  const parsed = Number(monthlySalary);

  if (isNaN(parsed) || parsed < 0) {
    throw new ApiError(400, 'Invalid salary amount');
  }

  employee.monthlySalary = parsed;
  employee.salaryType = salaryType;
  employee.salaryUpdatedAt = new Date();

  await employee.save();

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Employee',
    description: `Set salary ₹${parsed} for ${employee.name}`,
    referenceId: employee._id,
  });

  res.json({
    success: true,
    message: 'Salary updated successfully',
    data: {
      _id: employee._id,
      name: employee.name,
      monthlySalary: employee.monthlySalary,
      salaryType: employee.salaryType,
      salaryUpdatedAt: employee.salaryUpdatedAt,
    },
  });
});