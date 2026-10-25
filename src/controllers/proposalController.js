import Proposal from '../models/Proposal.js';
import Client from '../models/Client.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';
import ImageKit from '@imagekit/nodejs';
import { Readable } from 'stream'; // 🆕 Buffer ko stream banane ke liye

// 🆕 ImageKit Setup
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

/* =========================================================
   CREATE PROPOSAL — PDF Upload (ImageKit Fixed)
========================================================= */
export const createProposal = asyncHandler(async (req, res) => {
  const { client, projectName } = req.body;

  if (!client) throw new ApiError(400, 'Client is required');
  if (!projectName?.trim()) throw new ApiError(400, 'Project name is required');
  if (!req.file) throw new ApiError(400, 'PDF document is required');

  const clientDoc = await Client.findById(client);
  if (!clientDoc) throw new ApiError(404, 'Client not found');

  if (req.user.role === 'sales' && !clientDoc.assignedSales?.equals(req.user._id)) {
    throw new ApiError(403, 'You can only create proposals for your assigned clients');
  }

  // 🆕 ImageKit par PDF upload karo (Naya Tarika)
  let pdfUrl = '';
  try {
    const uploadResponse = await imagekit.files.upload({
      file: Readable.from(req.file.buffer), // Buffer ko stream banaya
      fileName: `proposal-${Date.now()}.pdf`,
      folder: 'proposals', 
    });
    pdfUrl = uploadResponse.url;
  } catch (uploadError) {
    console.error('ImageKit Upload Error:', uploadError);
    throw new ApiError(500, 'Failed to upload PDF to cloud');
  }

  const proposal = await Proposal.create({
    client,
    createdBy: req.user._id,
    projectName: projectName.trim(),
    documentPdf: pdfUrl,
    status: 'Approved',
    approvedAt: new Date(),
    approvedBy: req.user._id,
  });

  const populated = await Proposal.findById(proposal._id)
    .populate('client', 'clientName companyName email phone')
    .populate('createdBy', 'name role');

  await logActivity({
    user: req.user._id,
    action: 'CREATE',
    module: 'Proposal',
    description: `Uploaded PDF proposal for ${clientDoc.clientName}`,
    referenceId: proposal._id,
  });

  res.status(201).json({
    success: true,
    message: 'Proposal PDF uploaded successfully',
    data: populated,
  });
});

/* =========================================================
   GET PROPOSALS (List)
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
    draft: await Proposal.countDocuments({ ...filter, status: 'Draft' }),
    approved: await Proposal.countDocuments({ ...filter, status: 'Approved' }),
    archived: await Proposal.countDocuments({ ...filter, status: 'Archived' }),
  };

  res.json({
    success: true,
    stats,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   GET SINGLE PROPOSAL
========================================================= */
export const getProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id)
    .populate('client', 'clientName companyName email phone address city state')
    .populate('createdBy', 'name role email');

  if (!proposal) throw new ApiError(404, 'Proposal not found');

  if (req.user.role === 'sales' && !proposal.createdBy._id.equals(req.user._id)) {
    throw new ApiError(403, 'Not authorized');
  }

  res.json({ success: true, data: proposal });
});

/* =========================================================
   UPDATE PROPOSAL — ImageKit Fixed
========================================================= */
export const updateProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id);
  if (!proposal) throw new ApiError(404, 'Proposal not found');

  if (req.user.role === 'sales' && !proposal.createdBy.equals(req.user._id)) {
    throw new ApiError(403, 'Not authorized');
  }

  if (req.body.projectName) proposal.projectName = req.body.projectName;

  // 🆕 Agar nayi PDF aayi hai toh upload karo
  if (req.file) {
    try {
      const uploadResponse = await imagekit.files.upload({
        file: Readable.from(req.file.buffer), // Buffer ko stream banaya
        fileName: `proposal-${Date.now()}.pdf`,
        folder: 'proposals',
      });
      proposal.documentPdf = uploadResponse.url;
    } catch (uploadError) {
      console.error('ImageKit Upload Error:', uploadError);
      throw new ApiError(500, 'Failed to upload new PDF');
    }
  }

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

  res.json({ success: true, message: 'Proposal updated', data: populated });
});

/* =========================================================
   APPROVE PROPOSAL
========================================================= */
export const approveProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id)
    .populate('client', 'clientName companyName email')
    .populate('createdBy', 'name role');

  if (!proposal) throw new ApiError(404, 'Proposal not found');

  if (proposal.status === 'Approved') {
    throw new ApiError(400, 'Proposal already approved');
  }

  if (req.user.role === 'sales' && !proposal.createdBy._id.equals(req.user._id)) {
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
   DELETE PROPOSAL
========================================================= */
export const deleteProposal = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id);

  if (!proposal) throw new ApiError(404, 'Proposal not found');

  if (req.user.role === 'sales' && !proposal.createdBy.equals(req.user._id)) {
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

  res.json({ success: true, message: 'Proposal deleted' });
});

/* =========================================================
   CLIENT — GET MY PROPOSALS (Only Approved)
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