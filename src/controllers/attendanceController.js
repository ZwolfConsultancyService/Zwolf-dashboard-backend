import Attendance from '../models/Attendance.js';
import AttendanceSettings from '../models/AttendanceSettings.js';
import Holiday from '../models/Holiday.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getPagination,
  paginatedResponse,
} from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';
import {
  startOfDay,
  endOfDay,
  parseTimeToDate,
  isWeekend,
  buildAttendanceData,
} from '../utils/attendanceHelpers.js';
import {
  registerFaceWithML,
  recognizeFaceWithML,
  deleteFaceWithML,
  checkMLHealth,
} from '../services/mlService.js';
/* =========================================================
   GET SETTINGS
========================================================= */

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await AttendanceSettings.getSettings();
  res.json({ success: true, data: settings });
});

/* =========================================================
   UPDATE SETTINGS (Manager only)
========================================================= */

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await AttendanceSettings.getSettings();

  const allowed = [
    'officeStartTime',
    'officeEndTime',
    'lunchStartTime',
    'lunchEndTime',
    'lateGraceMinutes',
    'halfDayMinutes',
    'fullDayMinutes',
    'weekendDays',
    'autoLogoutEnabled',
    'faceRecognitionEnabled',
    'faceMatchThreshold',
  ];

  allowed.forEach((f) => {
    if (req.body[f] !== undefined) {
      settings[f] = req.body[f];
    }
  });

  settings.updatedBy = req.user._id;
  await settings.save();

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'AttendanceSettings',
    description: 'Updated attendance settings',
  });

  res.json({ success: true, data: settings });
});

/* =========================================================
   CHECK-IN (Face-based / Manual)
   
   POST /api/attendance/check-in
   Body: { captureMethod, faceMatchScore, faceImage }
========================================================= */

export const checkIn = asyncHandler(async (req, res) => {
  const today = startOfDay();
  const settings = await AttendanceSettings.getSettings();

  /* Already checked in? */
  let attendance = await Attendance.findOne({
    employee: req.user._id,
    date: today,
  });

  if (attendance && attendance.loginTime) {
    throw new ApiError(400, 'You have already checked in today');
  }

  /* Holiday check */
  const holiday = await Holiday.findOne({
    isActive: true,
    $or: [
      { applicableTo: 'All' },
      { applicableTo: req.user.role },
      { applicableTo: 'Specific', specificEmployees: req.user._id },
    ],
    $and: [
      { date: { $lte: today } },
      {
        $or: [
          { endDate: null, date: { $gte: today } },
          { endDate: { $gte: today } },
        ],
      },
    ],
  });

  const isHol = !!holiday;
  const isWknd = isWeekend(today, settings.weekendDays);

  /* Build computed data */
  const now = new Date();
  const computed = buildAttendanceData({
    loginTime: now,
    logoutTime: null,
    settings,
    captureMethod: req.body.captureMethod || 'manual',
    faceMatchScore: req.body.faceMatchScore ?? null,
    faceImage: req.body.faceImage || '',
  });

  const payload = {
    employee: req.user._id,
    date: today,
    ...computed,
    isHoliday: isHol,
    holidayId: holiday?._id || null,
    status: isHol
      ? 'Holiday'
      : isWknd
      ? 'Weekend'
      : computed.status || 'Present',
  };

  if (attendance) {
    Object.assign(attendance, payload);
    await attendance.save();
  } else {
    attendance = await Attendance.create(payload);
  }

  await logActivity({
    user: req.user._id,
    action: 'CHECKIN',
    module: 'Attendance',
    description: `${req.user.name} checked in via ${computed.captureMethod}`,
    referenceId: attendance._id,
  });

  res.json({ success: true, data: attendance });
});

/* =========================================================
   CHECK-OUT (usually from camera or auto-logout)
   
   POST /api/attendance/check-out
========================================================= */

export const checkOut = asyncHandler(async (req, res) => {
  const today = startOfDay();
  const settings = await AttendanceSettings.getSettings();

  const attendance = await Attendance.findOne({
    employee: req.user._id,
    date: today,
  });

  if (!attendance || !attendance.loginTime) {
    throw new ApiError(400, 'You have not checked in today');
  }

  if (attendance.logoutTime) {
    throw new ApiError(400, 'You have already checked out today');
  }

  const now = new Date();
  const computed = buildAttendanceData({
    loginTime: attendance.loginTime,
    logoutTime: now,
    settings,
    captureMethod: req.body.captureMethod || attendance.captureMethod,
    faceMatchScore: attendance.faceMatchScore,
    faceImage: attendance.faceImage,
  });

  Object.assign(attendance, computed);
  await attendance.save();

  await logActivity({
    user: req.user._id,
    action: 'CHECKOUT',
    module: 'Attendance',
    description: `${req.user.name} checked out`,
    referenceId: attendance._id,
  });

  res.json({ success: true, data: attendance });
});

/* =========================================================
   AUTO LOGOUT (called by cron at 6 PM)
   
   POST /api/attendance/auto-logout
========================================================= */

export const autoLogout = asyncHandler(async (req, res) => {
  const today = startOfDay();
  const settings = await AttendanceSettings.getSettings();

  const officeEnd = parseTimeToDate(settings.officeEndTime, today);

  /* Find all who haven't logged out today */
  const pending = await Attendance.find({
    date: today,
    loginTime: { $ne: null },
    logoutTime: null,
  }).populate('employee', 'name email role');

  let count = 0;

  for (const att of pending) {
    const computed = buildAttendanceData({
      loginTime: att.loginTime,
      logoutTime: officeEnd,
      settings,
      captureMethod: att.captureMethod,
      faceMatchScore: att.faceMatchScore,
      faceImage: att.faceImage,
    });

    Object.assign(att, computed, { autoLoggedOut: true });
    await att.save();
    count++;
  }

  res.json({
    success: true,
    message: `${count} employees auto-logged out`,
    count,
  });
});

/* =========================================================
   GET MY ATTENDANCE
========================================================= */

export const getMyAttendance = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { employee: req.user._id };

  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate)
      filter.date.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.date.$lte = new Date(req.query.endDate);
  }

  const [data, total] = await Promise.all([
    Attendance.find(filter).sort('-date').skip(skip).limit(limit),
    Attendance.countDocuments(filter),
  ]);

  res.json({
    success: true,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   GET ALL ATTENDANCE (Manager)
========================================================= */

export const getAllAttendance = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.date) filter.date = startOfDay(req.query.date);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.isLate === 'true') filter.isLate = true;

  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate)
      filter.date.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.date.$lte = new Date(req.query.endDate);
  }

  const [data, total] = await Promise.all([
    Attendance.find(filter)
      .populate('employee', 'name email role')
      .sort('-date')
      .skip(skip)
      .limit(limit),
    Attendance.countDocuments(filter),
  ]);

  res.json({
    success: true,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   UPDATE ATTENDANCE (Manager manual override)
========================================================= */

export const updateAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findById(req.params.id);
  if (!attendance) throw new ApiError(404, 'Attendance record not found');

  const settings = await AttendanceSettings.getSettings();

  const { loginTime, logoutTime, status, notes, remarks } = req.body;

  if (loginTime) attendance.loginTime = new Date(loginTime);
  if (logoutTime) attendance.logoutTime = new Date(logoutTime);
  if (status) attendance.status = status;
  if (notes !== undefined) attendance.notes = notes;
  if (remarks !== undefined) attendance.remarks = remarks;

  /* Recompute */
  if (attendance.loginTime && attendance.logoutTime) {
    const computed = buildAttendanceData({
      loginTime: attendance.loginTime,
      logoutTime: attendance.logoutTime,
      settings,
      captureMethod: attendance.captureMethod,
      faceMatchScore: attendance.faceMatchScore,
      faceImage: attendance.faceImage,
    });
    Object.assign(attendance, computed);
  }

  await attendance.save();

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Attendance',
    description: 'Manually updated attendance',
    referenceId: attendance._id,
  });

  res.json({ success: true, data: attendance });
});

/* =========================================================
   DELETE SINGLE
========================================================= */

export const deleteAttendance = asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id);
  if (!record) throw new ApiError(404, 'Attendance record not found');

  await record.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Attendance',
    description: `Deleted attendance for ${record.date}`,
    referenceId: record._id,
  });

  res.json({ success: true, message: 'Attendance deleted' });
});

/* =========================================================
   DELETE ALL (with filters)
========================================================= */

export const deleteAllAttendance = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.date) filter.date = startOfDay(req.query.date);
  if (req.query.status) filter.status = req.query.status;

  const result = await Attendance.deleteMany(filter);

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Attendance',
    description: `Deleted ${result.deletedCount} attendance records`,
    metadata: { filters: filter, count: result.deletedCount },
  });

  res.json({
    success: true,
    message: `${result.deletedCount} records deleted`,
    deletedCount: result.deletedCount,
  });
});

/* =========================================================
   REGISTER FACE FOR EMPLOYEE (Manager only)
   
   POST /api/attendance/face/register/:employeeId
   Body: form-data with "image" file
========================================================= */

export const registerEmployeeFace = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;

  if (!employeeId) {
    throw new ApiError(400, 'employeeId is required');
  }

  if (!req.file) {
    throw new ApiError(400, 'Image file is required');
  }

  /* Check employee exists */
  const employee = await User.findById(employeeId);
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  /* Send to ML server */
  const result = await registerFaceWithML(
    employeeId,
    req.file.buffer,
    req.file.originalname
  );

  if (!result.success) {
    throw new ApiError(400, result.error || 'Face registration failed');
  }

  /* Update employee */
  employee.faceRegistered = true;
  employee.faceRegisteredAt = new Date();
  await employee.save();

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Attendance',
    description: `Registered face for ${employee.name}`,
    referenceId: employee._id,
  });

  res.json({
    success: true,
    message: 'Face registered successfully',
    data: {
      employeeId,
      employeeName: employee.name,
      samplesUsed: result.data?.samples_used,
    },
  });
});
/* =========================================================
   FACE CHECK-IN
   
   POST /api/attendance/face-check-in
   Body: form-data with "image" file
   
   Flow:
   1. Node receives image
   2. Node → ML Server /recognize
   3. ML Server returns employeeId + confidence
   4. Node marks attendance (rules apply)
========================================================= */

export const faceCheckIn = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Image is required');
  }

  /* Send to ML server */
  const mlResult = await recognizeFaceWithML(
    req.file.buffer,
    req.file.originalname
  );

  if (!mlResult.success) {
    throw new ApiError(
      500,
      mlResult.error || 'Face recognition failed'
    );
  }

  const { matched, employeeId, confidence, distance, reason } =
    mlResult.data || {};

  if (!matched) {
    return res.status(400).json({
      success: false,
      message: reason || 'Face not recognized',
      data: {
        matched: false,
        confidence,
        distance,
      },
    });
  }

  /* Fetch employee */
  const employee = await User.findById(employeeId);
  if (!employee) {
    throw new ApiError(
      404,
      'Employee not found in database'
    );
  }

  /* =====================================================
     MARK ATTENDANCE (reuse logic from `checkIn`)
  ===================================================== */

  const today = startOfDay();
  const settings = await AttendanceSettings.getSettings();

  let attendance = await Attendance.findOne({
    employee: employee._id,
    date: today,
  });

  if (attendance && attendance.loginTime) {
    throw new ApiError(
      400,
      `${employee.name} has already checked in today`
    );
  }

  /* Holiday check */
  const holiday = await Holiday.findOne({
    isActive: true,
    $or: [
      { applicableTo: 'All' },
      { applicableTo: employee.role },
      {
        applicableTo: 'Specific',
        specificEmployees: employee._id,
      },
    ],
    $and: [
      { date: { $lte: today } },
      {
        $or: [
          { endDate: null, date: { $gte: today } },
          { endDate: { $gte: today } },
        ],
      },
    ],
  });

  const isHol = !!holiday;
  const isWknd = isWeekend(today, settings.weekendDays);

  const now = new Date();
  const computed = buildAttendanceData({
    loginTime: now,
    logoutTime: null,
    settings,
    captureMethod: 'face',
    faceMatchScore: confidence,
    faceImage: '',
  });

  const payload = {
    employee: employee._id,
    date: today,
    ...computed,
    isHoliday: isHol,
    holidayId: holiday?._id || null,
    status: isHol
      ? 'Holiday'
      : isWknd
      ? 'Weekend'
      : computed.status || 'Present',
  };

  if (attendance) {
    Object.assign(attendance, payload);
    await attendance.save();
  } else {
    attendance = await Attendance.create(payload);
  }

  await logActivity({
    user: employee._id,
    action: 'CHECKIN',
    module: 'Attendance',
    description: `${employee.name} checked in via Face ID (${Math.round(
      confidence * 100
    )}%)`,
    referenceId: attendance._id,
  });

  res.json({
    success: true,
    message: `Welcome ${employee.name}!`,
    data: {
      attendance,
      employee: {
        _id: employee._id,
        name: employee.name,
        role: employee.role,
        email: employee.email,
      },
      confidence: Math.round(confidence * 100),
    },
  });
});
/* =========================================================
   REMOVE FACE (Manager only)
========================================================= */

export const removeEmployeeFace = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;

  const employee = await User.findById(employeeId);
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  await deleteFaceWithML(employeeId);

  employee.faceRegistered = false;
  employee.faceRegisteredAt = null;
  await employee.save();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Attendance',
    description: `Removed face for ${employee.name}`,
    referenceId: employee._id,
  });

  res.json({
    success: true,
    message: 'Face removed successfully',
  });
});
/* =========================================================
   ML SERVER HEALTH CHECK
========================================================= */

export const mlHealthCheck = asyncHandler(async (req, res) => {
  const result = await checkMLHealth();

  res.json({
    success: result.success,
    mlServer: result.success ? 'online' : 'offline',
    data: result.data,
    error: result.error,
  });
});
/* =========================================================
   MANUAL: MARK ABSENT (Manager)
   
   POST /api/attendance/mark-absent
   Body: { date: 'YYYY-MM-DD' } (optional — default today)
========================================================= */

export const manualMarkAbsent = asyncHandler(async (req, res) => {
  const { markAbsentForDate } = await import(
    '../jobs/absentMarkJob.js'
  );

  const targetDate = req.body.date
    ? new Date(req.body.date)
    : new Date();

  const result = await markAbsentForDate(targetDate);

  if (result.skipped) {
    return res.json({
      success: true,
      message: `Skipped: ${result.reason}`,
      data: result,
    });
  }

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Attendance',
    description: `Manually marked ${result.markedCount} employees as absent`,
    metadata: {
      date: result.date,
      count: result.markedCount,
    },
  });

  res.json({
    success: true,
    message: `Marked ${result.markedCount} employees as absent`,
    data: result,
  });
});
/* =========================================================
   🆕 GET MY SALARY HISTORY (Employee)
   
   GET /api/attendance/my-salary-history?year=2026
   
   Employee apni month-wise salary dekh sake
========================================================= */

export const getMySalaryHistory = asyncHandler(async (req, res) => {
  const year =
    Number(req.query.year) || new Date().getFullYear();

  const employee = await User.findById(req.user._id).select(
    'name email role monthlySalary joiningDate'
  );

  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  const monthlySalary = Number(employee.monthlySalary || 0);

  /* Joining date */
  const joiningDate = employee.joiningDate
    ? new Date(employee.joiningDate)
    : null;

  /* Current date */
  const now = new Date();

  /* Settings */
  const settings = await AttendanceSettings.getSettings();

  const months = [];

  /* YTD totals */
  let totalEarned = 0;
  let totalDeducted = 0;
  let monthsWorked = 0;

  /* Loop from January to December */
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(year, m, 1);
    const monthEnd = new Date(year, m + 1, 0, 23, 59, 59);

    /* Skip if month is in future */
    if (monthStart > now) {
      break;
    }

    /* Skip if employee hadn't joined yet */
    if (joiningDate && monthStart < joiningDate) {
      continue;
    }

    /* Get attendance for this month */
    const attendance = await Attendance.find({
      employee: employee._id,
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

    /* Working days count */
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    let workingDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, m, d);

      /* Skip if before joining */
      if (joiningDate && date < joiningDate) {
        continue;
      }

      /* Weekend */
      if (isWeekend(date, settings.weekendDays)) {
        continue;
      }

      /* Holiday */
      const isHol = holidays.find((h) => {
        const hStart = startOfDay(h.date);
        const hEnd = h.endDate ? endOfDay(h.endDate) : hStart;
        return date >= hStart && date <= hEnd;
      });

      if (isHol) continue;

      workingDays++;
    }

    /* Stats */
    const stats = {
      present: 0,
      absent: 0,
      halfDay: 0,
      leavePaid: 0,
      leaveUnpaid: 0,
      holiday: 0,
      weekend: 0,
      late: 0,
      totalWorkingMinutes: 0,
    };

    attendance.forEach((a) => {
      if (a.status === 'Present') stats.present++;
      else if (a.status === 'Absent') stats.absent++;
      else if (a.status === 'Half Day') stats.halfDay++;
      else if (a.status === 'Leave') {
        if (a.notes?.toLowerCase().includes('unpaid')) {
          stats.leaveUnpaid++;
        } else {
          stats.leavePaid++;
        }
      } else if (a.status === 'Holiday') stats.holiday++;
      else if (a.status === 'Weekend') stats.weekend++;

      if (a.isLate) stats.late++;
      stats.totalWorkingMinutes += a.workingMinutes || 0;
    });

    /* Calculate salary */
    const perDay = workingDays > 0 ? monthlySalary / workingDays : 0;

    const effectiveDays =
      stats.present +
      stats.halfDay * 0.5 +
      stats.leavePaid;

    const earned = Math.round(perDay * effectiveDays);
    const deducted = monthlySalary - earned;

    totalEarned += earned;
    totalDeducted += deducted;
    monthsWorked++;

    months.push({
      month: m + 1,
      monthName: new Date(year, m, 1).toLocaleString('en-IN', {
        month: 'long',
      }),
      year,
      monthlySalary,
      workingDays,
      perDaySalary: Math.round(perDay),
      stats,
      effectiveDays,
      earned,
      deducted,
      finalSalary: earned,
    });
  }

  res.json({
    success: true,
    data: {
      year,
      employee: {
        name: employee.name,
        role: employee.role,
        monthlySalary,
        joiningDate: employee.joiningDate,
      },
      ytd: {
        totalEarned,
        totalDeducted,
        totalNetSalary: totalEarned,
        monthsWorked,
      },
      months,
    },
  });
});