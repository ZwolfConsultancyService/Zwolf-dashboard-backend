import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateToken } from '../utils/generateToken.js';
import { logActivity } from '../services/activityService.js';

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// @desc    Login user
// @route   POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    '+password'
  );

  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Your account has been disabled');
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const today = startOfDay();
  let attendance = await Attendance.findOne({
    employee: user._id,
    date: today,
  });

  if (!attendance) {
    attendance = await Attendance.create({
      employee: user._id,
      date: today,
      loginTime: new Date(),
      status: 'Present',
    });
  } else if (!attendance.loginTime) {
    attendance.loginTime = new Date();
    await attendance.save();
  }

  await logActivity({
    user: user._id,
    action: 'LOGIN',
    module: 'Auth',
    description: `${user.name} logged in`,
  });

  const token = generateToken(user._id, user.role);
  const userObj = user.toObject();
  delete userObj.password;

  res.json({
    success: true,
    token,
    user: userObj,
  });
});

// @desc    Logout user
// @route   POST /api/auth/logout
export const logout = asyncHandler(async (req, res) => {
  const today = startOfDay();
  const attendance = await Attendance.findOne({
    employee: req.user._id,
    date: today,
  });

  if (attendance && attendance.loginTime && !attendance.logoutTime) {
    attendance.logoutTime = new Date();
    attendance.workingMinutes = Math.round(
      (attendance.logoutTime - attendance.loginTime) / 60000
    );
    if (attendance.workingMinutes < 240) attendance.status = 'Half Day';
    await attendance.save();
  }

  await logActivity({
    user: req.user._id,
    action: 'LOGOUT',
    module: 'Auth',
    description: `${req.user.name} logged out`,
  });

  res.json({ success: true, message: 'Logged out successfully' });
});

// @desc    Get current user
// @route   GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});