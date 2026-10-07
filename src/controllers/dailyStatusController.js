import DailyStatus from '../models/DailyStatus.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';
import { notifyManager } from '../services/notificationService.js';
const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const createOrUpdateDailyStatus = asyncHandler(async (req, res) => {
  const today = startOfDay();
  const {
    completedWork, workInProgress, pendingWork, blockers, nextPlan, date,
  } = req.body;

  const targetDate = date ? startOfDay(date) : today;

  let status = await DailyStatus.findOne({ employee: req.user._id, date: targetDate });

  if (status) {
    Object.assign(status, {
      completedWork, workInProgress, pendingWork, blockers, nextPlan,
    });
    await status.save();
  } else {
    status = await DailyStatus.create({
      employee: req.user._id, date: targetDate,
      completedWork, workInProgress, pendingWork, blockers, nextPlan,
    });
  }
/* 🔔 Notify manager about daily status update */
try {
  await notifyManager({
    employeeId: req.user._id,
    type: 'daily-status',
    title: 'Daily Status Updated',
    message: `${req.user.name} submitted today's status`,
    referenceId: status._id,
  });
} catch (e) {
  console.error('daily-status notify err:', e);
}
  res.json({ success: true, data: status });
});

export const getMyDailyStatus = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { employee: req.user._id };

  const [data, total] = await Promise.all([
    DailyStatus.find(filter).sort('-date').skip(skip).limit(limit),
    DailyStatus.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

export const getAllDailyStatus = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.date) filter.date = startOfDay(req.query.date);

  const [data, total] = await Promise.all([
    DailyStatus.find(filter)
      .populate('employee', 'name email role')
      .sort('-date')
      .skip(skip)
      .limit(limit),
    DailyStatus.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

export const updateDailyStatus = asyncHandler(async (req, res) => {
  const status = await DailyStatus.findById(req.params.id);
  if (!status) throw new ApiError(404, 'Daily status not found');
  if (!status.employee.equals(req.user._id) && req.user.role !== 'manager') {
    throw new ApiError(403, 'Not authorized');
  }

  Object.assign(status, req.body);
  await status.save();
  res.json({ success: true, data: status });
});

/* =========================================================
   🆕 DELETE DAILY STATUS
========================================================= */

export const deleteDailyStatus = asyncHandler(async (req, res) => {
  const status = await DailyStatus.findById(req.params.id);

  if (!status) {
    throw new ApiError(404, 'Daily status not found');
  }

  /* ✅ Only own report can delete (or manager) */
  if (
    !status.employee.equals(req.user._id) &&
    req.user.role !== 'manager'
  ) {
    throw new ApiError(403, 'You can only delete your own reports');
  }

  await status.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'DailyStatus',
    description: `Deleted daily status report`,
    referenceId: status._id,
  });

  res.json({
    success: true,
    message: 'Daily status deleted successfully',
  });
});
