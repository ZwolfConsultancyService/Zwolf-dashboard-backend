import Attendance from '../models/Attendance.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const checkIn = asyncHandler(async (req, res) => {
  const today = startOfDay();
  let attendance = await Attendance.findOne({ employee: req.user._id, date: today });

  if (attendance && attendance.loginTime) {
    throw new ApiError(400, 'You have already checked in today');
  }

  if (attendance) {
    attendance.loginTime = new Date();
    await attendance.save();
  } else {
    attendance = await Attendance.create({
      employee: req.user._id, date: today, loginTime: new Date(), status: 'Present',
    });
  }

  res.json({ success: true, data: attendance });
});

export const checkOut = asyncHandler(async (req, res) => {
  const today = startOfDay();
  const attendance = await Attendance.findOne({ employee: req.user._id, date: today });

  if (!attendance || !attendance.loginTime) {
    throw new ApiError(400, 'You have not checked in today');
  }
  if (attendance.logoutTime) {
    throw new ApiError(400, 'You have already checked out today');
  }

  attendance.logoutTime = new Date();
  attendance.workingMinutes = Math.round(
    (attendance.logoutTime - attendance.loginTime) / 60000
  );
  if (attendance.workingMinutes < 240) attendance.status = 'Half Day';
  await attendance.save();

  await logActivity({
    user: req.user._id, action: 'CHECKOUT', module: 'Attendance',
    description: `${req.user.name} checked out`, referenceId: attendance._id,
  });

  res.json({ success: true, data: attendance });
});

export const getMyAttendance = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { employee: req.user._id };

  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.date.$lte = new Date(req.query.endDate);
  }

  const [data, total] = await Promise.all([
    Attendance.find(filter).sort('-date').skip(skip).limit(limit),
    Attendance.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

export const getAllAttendance = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.date) filter.date = startOfDay(req.query.date);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
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

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

export const updateAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findById(req.params.id);
  if (!attendance) throw new ApiError(404, 'Attendance record not found');

  const { loginTime, logoutTime, status, notes } = req.body;
  if (loginTime) attendance.loginTime = new Date(loginTime);
  if (logoutTime) attendance.logoutTime = new Date(logoutTime);
  if (status) attendance.status = status;
  if (notes !== undefined) attendance.notes = notes;

  if (attendance.loginTime && attendance.logoutTime) {
    attendance.workingMinutes = Math.round(
      (attendance.logoutTime - attendance.loginTime) / 60000
    );
  }
  await attendance.save();

  await logActivity({
    user: req.user._id, action: 'UPDATE', module: 'Attendance',
    description: `Manually updated attendance`, referenceId: attendance._id,
  });

  res.json({ success: true, data: attendance });
});

/* =========================================================
   🆕 DELETE SINGLE ATTENDANCE
========================================================= */

export const deleteAttendance = asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id);

  if (!record) {
    throw new ApiError(404, 'Attendance record not found');
  }

  await record.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Attendance',
    description: `Deleted attendance record for ${record.date}`,
    referenceId: record._id,
  });

  res.json({ success: true, message: 'Attendance deleted' });
});

/* =========================================================
   🆕 DELETE ALL ATTENDANCE (with filters)
========================================================= */

export const deleteAllAttendance = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.date) {
    filter.date = startOfDay(req.query.date);
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

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