import Client from '../models/Client.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

const buildClientFilter = (req) => {
  const filter = {};
  const { search, status, assignedSales, paymentStatus } = req.query;

  if (req.user.role === 'sales') filter.assignedSales = req.user._id;
  else if (assignedSales) filter.assignedSales = assignedSales;

  if (search) filter.$or = [
    { clientName: { $regex: search, $options: 'i' } },
    { companyName: { $regex: search, $options: 'i' } },
    { phone: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
  ];
  if (status) filter.clientStatus = status;
  if (paymentStatus === 'pending') filter.remainingAmount = { $gt: 0 };
  if (paymentStatus === 'paid') filter.remainingAmount = 0;

  return filter;
};

export const getClients = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = buildClientFilter(req);

  const [data, total] = await Promise.all([
    Client.find(filter)
      .populate('assignedSales', 'name email role')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Client.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

export const createClient = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (req.user.role === 'sales') payload.assignedSales = req.user._id;
  if (!payload.assignedSales) throw new ApiError(400, 'assignedSales is required');

  payload.totalPaid = 0;
  payload.totalAmount = payload.totalAmount || 0;
  payload.remainingAmount = payload.totalAmount;

  const client = await Client.create(payload);
  const populated = await client.populate('assignedSales', 'name email');

  await logActivity({
    user: req.user._id, action: 'CREATE', module: 'Client',
    description: `Created client ${client.clientName}`, referenceId: client._id,
  });

  res.status(201).json({ success: true, data: populated });
});

export const getClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id).populate(
    'assignedSales', 'name email role'
  );
  if (!client) throw new ApiError(404, 'Client not found');

  if (req.user.role === 'sales' && !client.assignedSales._id.equals(req.user._id)) {
    throw new ApiError(403, 'You are not authorized to view this client');
  }

  res.json({ success: true, data: client });
});

export const updateClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) throw new ApiError(404, 'Client not found');

  if (req.user.role === 'sales' && !client.assignedSales.equals(req.user._id)) {
    throw new ApiError(403, 'You are not authorized to edit this client');
  }

  const allowed = [
    'clientName', 'companyName', 'email', 'phone', 'alternatePhone',
    'address', 'city', 'state', 'serviceRequired', 'description',
    'clientStatus', 'followUpDate', 'totalAmount',
  ];

  allowed.forEach((f) => { if (req.body[f] !== undefined) client[f] = req.body[f]; });

  if (req.user.role === 'manager' && req.body.assignedSales) {
    client.assignedSales = req.body.assignedSales;
  }

  client.remainingAmount = Math.max(0, client.totalAmount - client.totalPaid);
  await client.save();

  await logActivity({
    user: req.user._id, action: 'UPDATE', module: 'Client',
    description: `Updated client ${client.clientName}`, referenceId: client._id,
  });

  res.json({ success: true, data: client });
});

export const deleteClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) throw new ApiError(404, 'Client not found');

  await client.deleteOne();

  await logActivity({
    user: req.user._id, action: 'DELETE', module: 'Client',
    description: `Deleted client ${client.clientName}`, referenceId: client._id,
  });

  res.json({ success: true, message: 'Client deleted' });
});

export const addClientNote = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) throw new ApiError(404, 'Client not found');
  if (!req.body.text) throw new ApiError(400, 'Note text is required');

  if (req.user.role === 'sales' && !client.assignedSales.equals(req.user._id)) {
    throw new ApiError(403, 'Not authorized');
  }

  client.notes.push({ text: req.body.text, addedBy: req.user._id });
  await client.save();

  res.json({ success: true, data: client });
});