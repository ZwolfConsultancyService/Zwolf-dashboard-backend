import Resignation from '../models/Resignation.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getPagination,
  paginatedResponse,
} from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';
import {
  notify,
  notifyManager,
} from '../services/notificationService.js';

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/* =========================================================
   APPLY RESIGNATION (Employee)
   
   POST /api/resignations
   Body: { reason, noticePeriodDays, lastWorkingDay }
========================================================= */

export const applyResignation = asyncHandler(async (req, res) => {
  const {
    reason,
    noticePeriodDays = 30,
    lastWorkingDay,
  } = req.body;

  if (!reason || !reason.trim()) {
    throw new ApiError(400, 'Reason is required');
  }

  if (!lastWorkingDay) {
    throw new ApiError(400, 'Last working day is required');
  }

  const lwd = startOfDay(lastWorkingDay);

  if (lwd <= new Date()) {
    throw new ApiError(
      400,
      'Last working day must be in the future'
    );
  }

  /* Check if already applied */
  const existing = await Resignation.findOne({
    employee: req.user._id,
    status: { $in: ['Pending', 'Approved'] },
  });

  if (existing) {
    throw new ApiError(
      400,
      'You already have an active resignation request'
    );
  }

  const resignation = await Resignation.create({
    employee: req.user._id,
    reason: reason.trim(),
    noticePeriodDays: Number(noticePeriodDays) || 30,
    lastWorkingDay: lwd,
    status: 'Pending',
    appliedAt: new Date(),
  });

  /* =====================================================
     🔔 NOTIFY MANAGER
  ===================================================== */

  try {
    await notifyManager({
      employeeId: req.user._id,
      type: 'resignation',
      title: '📋 Resignation Request',
      message: `${req.user.name} has submitted a resignation. Last working day: ${lwd.toLocaleDateString(
        'en-IN'
      )}`,
      referenceId: resignation._id,
      url: '/manager/resignations',
    });
  } catch (err) {
    console.error('resignation notify err:', err);
  }

  await logActivity({
    user: req.user._id,
    action: 'CREATE',
    module: 'Resignation',
    description: `${req.user.name} applied for resignation`,
    referenceId: resignation._id,
  });

  res.status(201).json({
    success: true,
    message: 'Resignation submitted successfully',
    data: resignation,
  });
});

/* =========================================================
   GET MY RESIGNATION (Employee)
   
   GET /api/resignations/my
========================================================= */

export const getMyResignation = asyncHandler(async (req, res) => {
  const resignation = await Resignation.findOne({
    employee: req.user._id,
  })
    .populate('reviewedBy', 'name role')
    .sort('-createdAt');

  res.json({
    success: true,
    data: resignation || null,
  });
});

/* =========================================================
   GET ALL RESIGNATIONS (Manager)
   
   GET /api/resignations
   Query: status, employee
========================================================= */

export const getAllResignations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.employee) filter.employee = req.query.employee;

  const [data, total] = await Promise.all([
    Resignation.find(filter)
      .populate(
        'employee',
        'name email role department designation profileImage joiningDate'
      )
      .populate('reviewedBy', 'name role')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Resignation.countDocuments(filter),
  ]);

  /* Stats */
  const stats = {
    pending: await Resignation.countDocuments({
      status: 'Pending',
    }),
    approved: await Resignation.countDocuments({
      status: 'Approved',
    }),
    rejected: await Resignation.countDocuments({
      status: 'Rejected',
    }),
  };

  res.json({
    success: true,
    stats,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   GET SINGLE RESIGNATION
   
   GET /api/resignations/:id
========================================================= */

export const getResignation = asyncHandler(async (req, res) => {
  const resignation = await Resignation.findById(req.params.id)
    .populate(
      'employee',
      'name email role department designation profileImage joiningDate phone'
    )
    .populate('reviewedBy', 'name role');

  if (!resignation) {
    throw new ApiError(404, 'Resignation not found');
  }

  /* Employee can only see own */
  if (
    req.user.role !== 'manager' &&
    String(resignation.employee._id) !== String(req.user._id)
  ) {
    throw new ApiError(403, 'Not authorized');
  }

  res.json({ success: true, data: resignation });
});

/* =========================================================
   REVIEW RESIGNATION (Manager approve/reject)
   
   PATCH /api/resignations/:id/review
   Body: { status: 'Approved' | 'Rejected', reviewNote }
========================================================= */

export const reviewResignation = asyncHandler(async (req, res) => {
  const { status, reviewNote = '' } = req.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    throw new ApiError(
      400,
      'status must be "Approved" or "Rejected"'
    );
  }

  const resignation = await Resignation.findById(
    req.params.id
  ).populate('employee', 'name email role');

  if (!resignation) {
    throw new ApiError(404, 'Resignation not found');
  }

  if (resignation.status !== 'Pending') {
    throw new ApiError(
      400,
      `Resignation already ${resignation.status.toLowerCase()}`
    );
  }

  resignation.status = status;
  resignation.reviewedBy = req.user._id;
  resignation.reviewedAt = new Date();
  resignation.reviewNote = reviewNote.trim();

  /* If approved, set resignedAt */
  if (status === 'Approved') {
    resignation.resignedAt = new Date();
  }

  await resignation.save();

  /* =====================================================
     🔔 NOTIFY EMPLOYEE
  ===================================================== */

  try {
    const emoji = status === 'Approved' ? '✅' : '❌';
    const title = `${emoji} Resignation ${status}`;
    const message =
      status === 'Approved'
        ? `Your resignation has been approved. Last working day: ${resignation.lastWorkingDay.toLocaleDateString(
            'en-IN'
          )}`
        : `Your resignation has been rejected.${
            reviewNote ? ` Reason: ${reviewNote}` : ''
          }`;

    await notify({
      from: req.user._id,
      to: resignation.employee._id,
      type: 'resignation',
      title,
      message,
      referenceId: resignation._id,
      url: '/attendance',
    });
  } catch (err) {
    console.error('resignation review notify err:', err);
  }

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Resignation',
    description: `${status} resignation for ${resignation.employee.name}`,
    referenceId: resignation._id,
  });

  res.json({
    success: true,
    message: `Resignation ${status.toLowerCase()}`,
    data: resignation,
  });
});

/* =========================================================
   WITHDRAW RESIGNATION (Employee)
   
   PATCH /api/resignations/:id/withdraw
========================================================= */

export const withdrawResignation = asyncHandler(async (req, res) => {
  const resignation = await Resignation.findById(
    req.params.id
  );

  if (!resignation) {
    throw new ApiError(404, 'Resignation not found');
  }

  if (String(resignation.employee) !== String(req.user._id)) {
    throw new ApiError(403, 'Not authorized');
  }

  if (resignation.status !== 'Pending') {
    throw new ApiError(
      400,
      'Only pending resignations can be withdrawn'
    );
  }

  resignation.status = 'Withdrawn';
  await resignation.save();

  res.json({
    success: true,
    message: 'Resignation withdrawn',
    data: resignation,
  });
});

/* =========================================================
   DELETE RESIGNATION (Manager)
   
   DELETE /api/resignations/:id
========================================================= */

export const deleteResignation = asyncHandler(async (req, res) => {
  const resignation = await Resignation.findById(
    req.params.id
  );

  if (!resignation) {
    throw new ApiError(404, 'Resignation not found');
  }

  await resignation.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Resignation',
    description: `Deleted resignation request`,
    referenceId: resignation._id,
  });

  res.json({
    success: true,
    message: 'Resignation deleted',
  });
});