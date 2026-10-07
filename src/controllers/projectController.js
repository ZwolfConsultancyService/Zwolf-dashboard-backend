import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Client from '../models/Client.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';
import { notifyMany } from '../services/notificationService.js';
const buildProjectFilter = (req) => {
  const filter = {};
  const { search, status, developer, sales, priority } = req.query;

  if (req.user.role === 'sales') filter.salesEmployee = req.user._id;
  else if (req.user.role === 'developer') filter.developers = req.user._id;
  else {
    if (sales) filter.salesEmployee = sales;
    if (developer) filter.developers = developer;
  }

  if (search) filter.projectName = { $regex: search, $options: 'i' };
  if (status) filter.status = status;
  if (priority) filter.priority = priority;

  return filter;
};

export const getProjects = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = buildProjectFilter(req);

  const [data, total] = await Promise.all([
    Project.find(filter)
      .populate(
        'client',
        'clientName companyName email clientId'
      )
      .populate(
        'salesEmployee',
        'name email'
      )
      .populate(
        'developers',
        'name email'
      )
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),

    Project.countDocuments(filter),
  ]);

  console.log(
    '========== PROJECT CLIENT DATA =========='
  );

  console.log(
    data.map((p) => ({
      projectId: p._id,
      projectName: p.projectName,

      // Actual client ObjectId stored in Project
      clientObjectId: p.client?._id,

      // If your Client model has custom clientId
      clientId: p.client?.clientId,

      clientName: p.client?.clientName,

      salesEmployee: p.salesEmployee?._id,
    }))
  );

  console.log(
    '=========================================='
  );

  res.json({
    success: true,
    ...paginatedResponse(
      data,
      total,
      page,
      limit
    ),
  });
});

export const createProject = asyncHandler(async (req, res) => {
  const payload = { ...req.body, createdBy: req.user._id };

  if (payload.totalAmount !== undefined) {
    const parsed = Number(payload.totalAmount);
    payload.totalAmount = isNaN(parsed) || parsed < 0 ? 0 : parsed;
  } else {
    payload.totalAmount = 0;
  }
  const client = await Client.findById(payload.client);
  if (!client) throw new ApiError(404, 'Client not found');

  if (req.user.role === 'sales') {
    if (!client.assignedSales.equals(req.user._id)) {
      throw new ApiError(403, 'You can only create projects for your clients');
    }
    payload.salesEmployee = req.user._id;
  } else if (!payload.salesEmployee) {
    payload.salesEmployee = client.assignedSales;
  }

  const project = await Project.create(payload);
  const populated = await Project.findById(project._id)
    .populate('client', 'clientName companyName')
    .populate('salesEmployee', 'name email')
    .populate('developers', 'name email');

  await logActivity({
    user: req.user._id, action: 'CREATE', module: 'Project',
    description: `Created project ${project.projectName}`, referenceId: project._id,
  });

  /* 🔔 Notify assigned developers */
if (project.developers && project.developers.length > 0) {
  await notifyMany({
    from: req.user._id,
    to: project.developers,
    type: 'project',
    title: 'New Project Assigned',
    message: `"${project.projectName}" assigned to you`,
    referenceId: project._id,
  });
}

  res.status(201).json({ success: true, data: populated });
});

export const getProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id)
    .populate('client', 'clientName companyName phone email')
    .populate('salesEmployee', 'name email')
    .populate('developers', 'name email');

  if (!project) throw new ApiError(404, 'Project not found');

  if (req.user.role === 'developer') {
    const isAssigned = project.developers.some((d) => d._id.equals(req.user._id));
    if (!isAssigned) throw new ApiError(403, 'Not authorized to view this project');
  }
  if (req.user.role === 'sales' && !project.salesEmployee._id.equals(req.user._id)) {
    throw new ApiError(403, 'Not authorized to view this project');
  }

  res.json({ success: true, data: project });
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');

  const isManager = req.user.role === 'manager';
  const isAssignedDev = project.developers.some((d) => d.equals(req.user._id));
  const isSales = project.salesEmployee.equals(req.user._id);

  if (!isManager && !isAssignedDev && !isSales) {
    throw new ApiError(403, 'Not authorized to update this project');
  }

  const devAllowed = ['status', 'progress', 'notes'];
  const salesAllowed = ['status', 'progress', 'notes', 'priority', 'deadline'];
  const managerAllowed = [
    'projectName', 'client', 'salesEmployee', 'developers', 'description',
    'technology', 'startDate', 'deadline', 'priority', 'status', 'progress',
    'requirements','totalAmount',
  ];

  const allowed = isManager ? managerAllowed : isAssignedDev ? devAllowed : salesAllowed;

allowed.forEach((f) => {
  if (req.body[f] !== undefined) {
    /* 🆕 Ensure totalAmount is a valid number */
    if (f === 'totalAmount') {
      const parsed = Number(req.body[f]);
      project[f] = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    } else {
      project[f] = req.body[f];
    }
  }
});
  await project.save();

  await logActivity({
    user: req.user._id, action: 'UPDATE', module: 'Project',
    description: `Updated project ${project.projectName}`, referenceId: project._id,
  });
/* 🔔 Notify developers if updated by manager */
if (req.user.role === 'manager' && project.developers?.length > 0) {
  await notifyMany({
    from: req.user._id,
    to: project.developers,
    type: 'project',
    title: 'Project Updated',
    message: `"${project.projectName}" details updated`,
    referenceId: project._id,
  });
}
  res.json({ success: true, data: project });
});

export const updateProjectStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const project = await Project.findById(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');

  const oldStatus = project.status;
  project.status = status;
  if (status === 'Completed') project.progress = 100;
  await project.save();

  await logActivity({
    user: req.user._id, action: 'STATUS_CHANGE', module: 'Project',
    description: `Project status changed from ${oldStatus} to ${status}`,
    referenceId: project._id, metadata: { oldStatus, newStatus: status },
  });

  res.json({ success: true, data: project });
});

export const updateProjectProgress = asyncHandler(async (req, res) => {
  const { progress } = req.body;
  if (progress < 0 || progress > 100) throw new ApiError(400, 'Progress must be 0-100');

  const project = await Project.findById(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');

  project.progress = progress;
  if (progress === 100) project.status = 'Completed';
  await project.save();

  res.json({ success: true, data: project });
});

export const deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');

  await Task.deleteMany({ project: project._id });
  await project.deleteOne();

  await logActivity({
    user: req.user._id, action: 'DELETE', module: 'Project',
    description: `Deleted project ${project.projectName}`, referenceId: project._id,
  });

  res.json({ success: true, message: 'Project deleted' });
});