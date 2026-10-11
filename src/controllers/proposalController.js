import Proposal from '../models/Proposal.js';
import Client from '../models/Client.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getPagination,
  paginatedResponse,
} from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

/* =========================================================
   CREATE PROPOSAL (Manager/Sales)
   POST /api/proposals
========================================================= */

export const createProposal = asyncHandler(async (req, res) => {
  const {
    client,
    projectName,
    description,
    scopeOfWork,
    technologies,
    startDate,
    endDate,
    totalAmount,
    paymentTerms,
    termsAndConditions,
    validUntil,
  } = req.body;

  if (!client) throw new ApiError(400, 'Client is required');
  if (!projectName?.trim())
    throw new ApiError(400, 'Project name is required');
  if (!totalAmount || Number(totalAmount) <= 0)
    throw new ApiError(400, 'Valid total amount is required');

  const clientDoc = await Client.findById(client);
  if (!clientDoc) throw new ApiError(404, 'Client not found');

  /* Sales can only create for assigned clients */
  if (
    req.user.role === 'sales' &&
    !clientDoc.assignedSales?.equals(req.user._id)
  ) {
    throw new ApiError(
      403,
      'You can only create proposals for your assigned clients'
    );
  }

  const proposal = await Proposal.create({
    client,
    createdBy: req.user._id,
    projectName: projectName.trim(),
    description: description?.trim() || '',
    scopeOfWork: Array.isArray(scopeOfWork)
      ? scopeOfWork.filter((s) => s?.trim())
      : [],
    technologies: Array.isArray(technologies)
      ? technologies.filter((t) => t?.trim())
      : [],
    startDate: startDate || null,
    endDate: endDate || null,
    totalAmount: Number(totalAmount),
    paymentTerms:
      paymentTerms?.trim() || '50% advance, 50% on delivery',
    termsAndConditions: Array.isArray(termsAndConditions)
      ? termsAndConditions.filter((t) => t?.trim())
      : [
          'Proposal valid for 30 days',
          'Payment as per agreed terms',
          'Scope changes may affect pricing',
        ],
    validUntil: validUntil || null,
    status: 'Draft',
  });

  const populated = await Proposal.findById(proposal._id)
    .populate('client', 'clientName companyName email phone')
    .populate('createdBy', 'name role');

  await logActivity({
    user: req.user._id,
    action: 'CREATE',
    module: 'Proposal',
    description: `Created proposal for ${clientDoc.clientName}`,
    referenceId: proposal._id,
  });

  res.status(201).json({
    success: true,
    message: 'Proposal created',
    data: populated,
  });
});

/* =========================================================
   GET PROPOSALS (Manager/Sales)
   GET /api/proposals
========================================================= */

export const getProposals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};

  if (req.user.role === 'sales') {
    filter.createdBy = req.user._id;
  }

  if (req.query.status) filter.status = req.query.status;
  if (req.query.client) filter.client = req.query.client;

  const [data, total] = await Promise.all([
    Proposal.find(filter)
      .populate('client', 'clientName companyName email phone')
      .populate('createdBy', 'name role')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Proposal.countDocuments(filter),
  ]);

  const stats = {
    draft: await Proposal.countDocuments({
      ...filter,
      status: 'Draft',
    }),
    approved: await Proposal.countDocuments({
      ...filter,
      status: 'Approved',
    }),
    archived: await Proposal.countDocuments({
      ...filter,
      status: 'Archived',
    }),
  };

  res.json({
    success: true,
    stats,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   GET SINGLE PROPOSAL
   GET /api/proposals/:id
========================================================= */

export const getProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id)
    .populate(
      'client',
      'clientName companyName email phone address city state'
    )
    .populate('createdBy', 'name role email');

  if (!proposal) throw new ApiError(404, 'Proposal not found');

  if (
    req.user.role === 'sales' &&
    !proposal.createdBy._id.equals(req.user._id)
  ) {
    throw new ApiError(403, 'Not authorized');
  }

  res.json({ success: true, data: proposal });
});

/* =========================================================
   UPDATE PROPOSAL (Manager/Sales)
   PUT /api/proposals/:id
========================================================= */

export const updateProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id);

  if (!proposal) throw new ApiError(404, 'Proposal not found');

  if (
    req.user.role === 'sales' &&
    !proposal.createdBy.equals(req.user._id)
  ) {
    throw new ApiError(403, 'Not authorized');
  }

  const allowed = [
    'projectName',
    'description',
    'scopeOfWork',
    'technologies',
    'startDate',
    'endDate',
    'totalAmount',
    'paymentTerms',
    'termsAndConditions',
    'validUntil',
  ];

  allowed.forEach((field) => {
    if (req.body[field] !== undefined) {
      proposal[field] = req.body[field];
    }
  });

  await proposal.save();

  const populated = await Proposal.findById(proposal._id)
    .populate('client', 'clientName companyName email phone')
    .populate('createdBy', 'name role');

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Proposal',
    description: `Updated proposal ${proposal.proposalNumber}`,
    referenceId: proposal._id,
  });

  res.json({
    success: true,
    message: 'Proposal updated',
    data: populated,
  });
});

/* =========================================================
   APPROVE PROPOSAL (Manager/Sales)
   PATCH /api/proposals/:id/approve
========================================================= */

export const approveProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id)
    .populate('client', 'clientName companyName email')
    .populate('createdBy', 'name role');

  if (!proposal) throw new ApiError(404, 'Proposal not found');

  if (proposal.status === 'Approved') {
    throw new ApiError(400, 'Proposal already approved');
  }

  if (
    req.user.role === 'sales' &&
    !proposal.createdBy._id.equals(req.user._id)
  ) {
    throw new ApiError(403, 'Not authorized');
  }

  proposal.status = 'Approved';
  proposal.approvedAt = new Date();
  proposal.approvedBy = req.user._id;

  await proposal.save();

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Proposal',
    description: `Approved proposal ${proposal.proposalNumber}`,
    referenceId: proposal._id,
  });

  res.json({
    success: true,
    message: 'Proposal approved — now visible to client',
    data: proposal,
  });
});

/* =========================================================
   DELETE PROPOSAL (Manager/Sales)
   DELETE /api/proposals/:id
========================================================= */

export const deleteProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id);

  if (!proposal) throw new ApiError(404, 'Proposal not found');

  if (
    req.user.role === 'sales' &&
    !proposal.createdBy.equals(req.user._id)
  ) {
    throw new ApiError(403, 'Not authorized');
  }

  await proposal.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Proposal',
    description: `Deleted proposal ${proposal.proposalNumber}`,
    referenceId: proposal._id,
  });

  res.json({
    success: true,
    message: 'Proposal deleted',
  });
});

/* =========================================================
   CLIENT — GET MY PROPOSALS (Only Approved)
   GET /api/client-portal/proposals
========================================================= */

export const getClientProposals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {
    client: req.client._id,
    status: 'Approved',
  };

  const [data, total] = await Promise.all([
    Proposal.find(filter)
      .populate('createdBy', 'name role email')
      .sort('-approvedAt')
      .skip(skip)
      .limit(limit),
    Proposal.countDocuments(filter),
  ]);

  res.json({
    success: true,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   CLIENT — GET SINGLE PROPOSAL (Only Approved)
   GET /api/client-portal/proposals/:id
========================================================= */

export const getClientProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findOne({
    _id: req.params.id,
    client: req.client._id,
    status: 'Approved',
  }).populate('createdBy', 'name role email');

  if (!proposal) throw new ApiError(404, 'Proposal not found');

  res.json({ success: true, data: proposal });
});