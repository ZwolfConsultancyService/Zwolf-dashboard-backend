import Payment from '../models/Payment.js';
import Client from '../models/Client.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';
import { recalculateClientTotals } from '../services/financialService.js';

export const getPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.user.role === 'sales') {
    const clients = await Client.find({ assignedSales: req.user._id }).select('_id');
    filter.client = { $in: clients.map((c) => c._id) };
  } else if (req.query.client) {
    filter.client = req.query.client;
  }

  if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;
  if (req.query.startDate || req.query.endDate) {
    filter.paymentDate = {};
    if (req.query.startDate) filter.paymentDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.paymentDate.$lte = new Date(req.query.endDate);
  }

  const [data, total] = await Promise.all([
    Payment.find(filter)
      .populate('client', 'clientName companyName')
      .populate('project', 'projectName')
      .populate('createdBy', 'name')
      .sort('-paymentDate')
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

export const createPayment = asyncHandler(async (req, res) => {
  const { client: clientId, amount, paymentMethod, project, transactionId, notes, paymentDate } = req.body;

  const client = await Client.findById(clientId);
  if (!client) throw new ApiError(404, 'Client not found');

  if (req.user.role === 'sales' && !client.assignedSales.equals(req.user._id)) {
    throw new ApiError(403, 'You can only add payments for your clients');
  }

  if (amount <= 0) throw new ApiError(400, 'Payment amount must be greater than 0');

  const currentPaid = client.totalPaid || 0;
  if (currentPaid + amount > client.totalAmount) {
    throw new ApiError(400, 'Payment amount exceeds remaining amount');
  }

  const payment = await Payment.create({
    client: clientId,
    project,
    amount,
    paymentMethod,
    transactionId,
    notes,
    paymentDate: paymentDate || new Date(),
    createdBy: req.user._id,
  });

  await recalculateClientTotals(clientId);

  await logActivity({
    user: req.user._id, action: 'CREATE', module: 'Payment',
    description: `Added payment ₹${amount} for client ${client.clientName}`,
    referenceId: payment._id,
  });

  res.status(201).json({ success: true, data: payment });
});

export const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('client', 'clientName companyName')
    .populate('project', 'projectName')
    .populate('createdBy', 'name');

  if (!payment) throw new ApiError(404, 'Payment not found');
  res.json({ success: true, data: payment });
});

export const getClientPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ client: req.params.clientId })
    .populate('project', 'projectName')
    .populate('createdBy', 'name')
    .sort('-paymentDate');

  res.json({ success: true, data: payments });
});

export const deletePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new ApiError(404, 'Payment not found');

  const clientId = payment.client;
  await payment.deleteOne();
  await recalculateClientTotals(clientId);

  await logActivity({
    user: req.user._id, action: 'DELETE', module: 'Payment',
    description: `Deleted payment of ₹${payment.amount}`, referenceId: payment._id,
  });

  res.json({ success: true, message: 'Payment deleted' });
});