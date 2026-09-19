import Task from '../models/Task.js';
import Project from '../models/Project.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

export const getTasks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.user.role === 'developer') filter.assignedDeveloper = req.user._id;

  if (req.query.project) filter.project = req.query.project;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.search) filter.title = { $regex: req.query.search, $options: 'i' };

  if (req.user.role === 'manager' && req.query.developer) {
    filter.assignedDeveloper = req.query.developer;
  }

  const [data, total] = await Promise.all([
    Task.find(filter)
      .populate('project', 'projectName')
      .populate('assignedDeveloper', 'name email')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Task.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

export const createTask = asyncHandler(async (req, res) => {
  const { project: projectId, assignedDeveloper } = req.body;

  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found');

  if (req.user.role === 'developer') {
    const isAssigned = project.developers.some((d) => d.equals(req.user._id));
    if (!isAssigned) throw new ApiError(403, 'You can only add tasks to your projects');
  }

  const devId = req.user.role === 'developer' ? req.user._id : assignedDeveloper;
  if (!devId) throw new ApiError(400, 'assignedDeveloper is required');

  const task = await Task.create({ ...req.body, assignedDeveloper: devId, createdBy: req.user._id });

  await logActivity({
    user: req.user._id, action: 'CREATE', module: 'Task',
    description: `Created task ${task.title}`, referenceId: task._id,
  });

  res.status(201).json({ success: true, data: task });
});

export const getTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id)
    .populate('project', 'projectName')
    .populate('assignedDeveloper', 'name email')
    .populate('createdBy', 'name');

  if (!task) throw new ApiError(404, 'Task not found');

  if (
    req.user.role === 'developer' &&
    !task.assignedDeveloper._id.equals(req.user._id)
  ) {
    throw new ApiError(403, 'Not authorized to view this task');
  }

  res.json({ success: true, data: task });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw new ApiError(404, 'Task not found');

  if (req.user.role === 'developer' && !task.assignedDeveloper.equals(req.user._id)) {
    throw new ApiError(403, 'Not authorized to update this task');
  }

  const allowed = [
    'title', 'description', 'priority', 'status', 'dueDate',
    'estimatedHours', 'actualHours', 'notes',
  ];
  if (req.user.role === 'manager') allowed.push('assignedDeveloper');

  allowed.forEach((f) => { if (req.body[f] !== undefined) task[f] = req.body[f]; });
  await task.save();

  await logActivity({
    user: req.user._id, action: 'UPDATE', module: 'Task',
    description: `Updated task ${task.title}`, referenceId: task._id,
  });

  res.json({ success: true, data: task });
});

export const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const task = await Task.findById(req.params.id);
  if (!task) throw new ApiError(404, 'Task not found');

  if (req.user.role === 'developer' && !task.assignedDeveloper.equals(req.user._id)) {
    throw new ApiError(403, 'Not authorized');
  }

  const oldStatus = task.status;
  task.status = status;
  await task.save();

  await logActivity({
    user: req.user._id, action: 'STATUS_CHANGE', module: 'Task',
    description: `Task "${task.title}" moved from ${oldStatus} to ${status}`,
    referenceId: task._id,
  });

  res.json({ success: true, data: task });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw new ApiError(404, 'Task not found');

  await task.deleteOne();

  await logActivity({
    user: req.user._id, action: 'DELETE', module: 'Task',
    description: `Deleted task ${task.title}`, referenceId: task._id,
  });

  res.json({ success: true, message: 'Task deleted' });
});