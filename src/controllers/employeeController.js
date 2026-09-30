import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

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