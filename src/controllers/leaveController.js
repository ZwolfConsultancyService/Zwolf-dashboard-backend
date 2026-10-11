import Leave from '../models/Leave.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getPagination,
  paginatedResponse,
} from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';
import { notify, notifyManager } from '../services/notificationService.js';
import { startOfDay, endOfDay } from '../utils/attendanceHelpers.js';

/* =========================================================
   CALCULATE TOTAL DAYS (from → to)
========================================================= */

const calculateTotalDays = (fromDate, toDate) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (to < from) return 0;

  /* Inclusive of both days */
  const diffMs = to - from;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

  return days;
};

/* =========================================================
   APPLY LEAVE (Employee)
   
   POST /api/leaves
   Body: { type, fromDate, toDate, reason }
========================================================= */

export const applyLeave = asyncHandler(async (req, res) => {
  const { type = 'Casual', fromDate, toDate, reason } = req.body;

  if (!fromDate || !toDate) {
    throw new ApiError(400, 'fromDate and toDate are required');
  }

  if (!reason || !reason.trim()) {
    throw new ApiError(400, 'Reason is required');
  }

  const from = startOfDay(fromDate);
  const to = endOfDay(toDate);

  if (to < from) {
    throw new ApiError(400, 'toDate must be after fromDate');
  }

  const totalDays = calculateTotalDays(from, to);

  /* Check for overlapping leaves */
  const existing = await Leave.findOne({
    employee: req.user._id,
    status: { $in: ['Pending', 'Approved'] },
    $or: [
      { fromDate: { $lte: to }, toDate: { $gte: from } },
    ],
  });

  if (existing) {
    throw new ApiError(
      400,
      'You already have a leave request in this date range'
    );
  }

  const isPaid = type !== 'Unpaid';

  const leave = await Leave.create({
    employee: req.user._id,
    type,
    fromDate: from,
    toDate: to,
    totalDays,
    reason: reason.trim(),
    status: 'Pending',
    isPaid,
    appliedAt: new Date(),
  });

  /* =====================================================
     🔔 NOTIFY MANAGER
  ===================================================== */

  try {
    await notifyManager({
      employeeId: req.user._id,
      type: 'leave',
      title: '🏖️ New Leave Request',
      message: `${req.user.name} applied for ${type} leave from ${from.toLocaleDateString(
        'en-IN'
      )} to ${to.toLocaleDateString('en-IN')} (${totalDays} day${
        totalDays > 1 ? 's' : ''
      })`,
      referenceId: leave._id,
      url: '/manager/leaves',
    });
  } catch (err) {
    console.error('leave notify err:', err);
  }

  await logActivity({
    user: req.user._id,
    action: 'CREATE',
    module: 'Leave',
    description: `${req.user.name} applied for ${type} leave`,
    referenceId: leave._id,
  });

  res.status(201).json({
    success: true,
    message: 'Leave application submitted',
    data: leave,
  });
});

/* =========================================================
   GET MY LEAVES (Employee)
   
   GET /api/leaves/my
========================================================= */

export const getMyLeaves = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = { employee: req.user._id };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const [data, total] = await Promise.all([
    Leave.find(filter)
      .populate('reviewedBy', 'name role')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Leave.countDocuments(filter),
  ]);

  /* Stats */
  const stats = {
    pending: await Leave.countDocuments({
      employee: req.user._id,
      status: 'Pending',
    }),
    approved: await Leave.countDocuments({
      employee: req.user._id,
      status: 'Approved',
    }),
    rejected: await Leave.countDocuments({
      employee: req.user._id,
      status: 'Rejected',
    }),
    totalDaysTaken: await Leave.aggregate([
      {
        $match: {
          employee: req.user._id,
          status: 'Approved',
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalDays' },
        },
      },
    ]).then((r) => r[0]?.total || 0),
  };

  res.json({
    success: true,
    stats,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   GET ALL LEAVES (Manager)
   
   GET /api/leaves
   Query: status, employee, fromDate, toDate
========================================================= */

export const getAllLeaves = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.type) filter.type = req.query.type;

  if (req.query.fromDate || req.query.toDate) {
    filter.fromDate = {};
    if (req.query.fromDate)
      filter.fromDate.$gte = new Date(req.query.fromDate);
    if (req.query.toDate)
      filter.fromDate.$lte = new Date(req.query.toDate);
  }

  const [data, total] = await Promise.all([
    Leave.find(filter)
      .populate('employee', 'name email role department')
      .populate('reviewedBy', 'name role')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Leave.countDocuments(filter),
  ]);

  /* Stats */
  const stats = {
    pending: await Leave.countDocuments({ status: 'Pending' }),
    approved: await Leave.countDocuments({ status: 'Approved' }),
    rejected: await Leave.countDocuments({ status: 'Rejected' }),
    todayApproved: await Leave.countDocuments({
      status: 'Approved',
      fromDate: { $lte: new Date() },
      toDate: { $gte: new Date() },
    }),
  };

  res.json({
    success: true,
    stats,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   GET SINGLE LEAVE
   
   GET /api/leaves/:id
========================================================= */

export const getLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id)
    .populate('employee', 'name email role department')
    .populate('reviewedBy', 'name role');

  if (!leave) {
    throw new ApiError(404, 'Leave not found');
  }

  /* Employee can only see own leave */
  if (
    req.user.role !== 'manager' &&
    String(leave.employee._id) !== String(req.user._id)
  ) {
    throw new ApiError(403, 'Not authorized');
  }

  res.json({ success: true, data: leave });
});

/* =========================================================
   APPROVE / REJECT LEAVE (Manager)
   
   PATCH /api/leaves/:id/review
   Body: { status: 'Approved' | 'Rejected', reviewNote }
========================================================= */

export const reviewLeave = asyncHandler(async (req, res) => {
  const { status, reviewNote = '' } = req.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    throw new ApiError(400, 'status must be "Approved" or "Rejected"');
  }

  const leave = await Leave.findById(req.params.id).populate(
    'employee',
    'name email role'
  );

  if (!leave) {
    throw new ApiError(404, 'Leave not found');
  }

  if (leave.status !== 'Pending') {
    throw new ApiError(
      400,
      `Leave already ${leave.status.toLowerCase()}`
    );
  }

  leave.status = status;
  leave.reviewedBy = req.user._id;
  leave.reviewedAt = new Date();
  leave.reviewNote = reviewNote.trim();

  await leave.save();

  /* =====================================================
     🆕 IF APPROVED — MARK ATTENDANCE AS "LEAVE"
  ===================================================== */

  if (status === 'Approved') {
    const from = startOfDay(leave.fromDate);
    const to = endOfDay(leave.toDate);

    /* Loop through each day */
    const current = new Date(from);
    while (current <= to) {
      const dayStart = startOfDay(current);

      /* Check if attendance exists */
      let attendance = await Attendance.findOne({
        employee: leave.employee._id,
        date: dayStart,
      });

      if (attendance && attendance.loginTime) {
        /* Employee actually came — don't override */
        current.setDate(current.getDate() + 1);
        continue;
      }

      if (attendance) {
        /* Update */
        attendance.status = 'Leave';
        attendance.notes = `Leave approved: ${leave.type}`;
        await attendance.save();
      } else {
        /* Create */
        await Attendance.create({
          employee: leave.employee._id,
          date: dayStart,
          status: 'Leave',
          workingMinutes: 0,
          captureMethod: 'system',
          notes: `Leave approved: ${leave.type}`,
        });
      }

      current.setDate(current.getDate() + 1);
    }
  }

  /* =====================================================
     🔔 NOTIFY EMPLOYEE
  ===================================================== */

  try {
    const emoji = status === 'Approved' ? '✅' : '❌';
    const title = `${emoji} Leave ${status}`;
    const message =
      status === 'Approved'
        ? `Your ${leave.type} leave from ${new Date(
            leave.fromDate
          ).toLocaleDateString('en-IN')} to ${new Date(
            leave.toDate
          ).toLocaleDateString('en-IN')} has been approved.`
        : `Your ${leave.type} leave request has been rejected.${
            reviewNote ? ` Reason: ${reviewNote}` : ''
          }`;

    await notify({
      from: req.user._id,
      to: leave.employee._id,
      type: 'leave',
      title,
      message,
      referenceId: leave._id,
      url: '/attendance',
    });
  } catch (err) {
    console.error('leave notify employee err:', err);
  }

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Leave',
    description: `${status} leave for ${leave.employee.name}`,
    referenceId: leave._id,
  });

  res.json({
    success: true,
    message: `Leave ${status.toLowerCase()}`,
    data: leave,
  });
});

/* =========================================================
   CANCEL LEAVE (Employee — only if pending)
   
   PATCH /api/leaves/:id/cancel
========================================================= */

export const cancelLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    throw new ApiError(404, 'Leave not found');
  }

  if (String(leave.employee) !== String(req.user._id)) {
    throw new ApiError(403, 'Not authorized');
  }

  if (leave.status !== 'Pending') {
    throw new ApiError(
      400,
      'Only pending leaves can be cancelled'
    );
  }

  leave.status = 'Cancelled';
  await leave.save();

  res.json({
    success: true,
    message: 'Leave cancelled',
    data: leave,
  });
});

/* =========================================================
   DELETE LEAVE (Manager)
   
   DELETE /api/leaves/:id
========================================================= */

export const deleteLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);

  if (!leave) {
    throw new ApiError(404, 'Leave not found');
  }

  await leave.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Leave',
    description: `Deleted leave request`,
    referenceId: leave._id,
  });

  res.json({
    success: true,
    message: 'Leave deleted',
  });
});

/* =========================================================
   LEAVE BALANCE (Employee)
   
   GET /api/leaves/balance
========================================================= */

export const getLeaveBalance = asyncHandler(async (req, res) => {
  const year = new Date().getFullYear();

  const approved = await Leave.find({
    employee: req.user._id,
    status: 'Approved',
    fromDate: {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31T23:59:59`),
    },
  });

  /* Per-type breakdown */
  const usedByType = {
    Casual: 0,
    Sick: 0,
    Earned: 0,
    Unpaid: 0,
    Other: 0,
  };

  approved.forEach((l) => {
    if (usedByType[l.type] !== undefined) {
      usedByType[l.type] += l.totalDays;
    } else {
      usedByType.Other += l.totalDays;
    }
  });

  /* Default quota (can be configured per employee) */
  const quota = {
    Casual: 12,
    Sick: 10,
    Earned: 15,
    Unpaid: 0,
    Other: 0,
  };

  const balance = {
    Casual: quota.Casual - usedByType.Casual,
    Sick: quota.Sick - usedByType.Sick,
    Earned: quota.Earned - usedByType.Earned,
    Unpaid: 0,
    Other: 0,
  };

  res.json({
    success: true,
    data: {
      year,
      quota,
      used: usedByType,
      balance,
      totalUsed:
        usedByType.Casual +
        usedByType.Sick +
        usedByType.Earned +
        usedByType.Other,
    },
  });
});