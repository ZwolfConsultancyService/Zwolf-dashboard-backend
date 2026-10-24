import Meeting from '../models/Meeting.js';
import Client from '../models/Client.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';
import { notify } from '../services/notificationService.js';
import {
  parseTimeToMinutes,
  minutesToTime,
  startOfDay,
  endOfDay,
  isOverlapping,
  generateSuggestedSlots,
} from '../utils/meetingHelpers.js';

/* =========================================================
   CHECK CONFLICT (internal helper)
========================================================= */

const checkMeetingConflict = async ({
  salesPersonId,
  clientId,
  date,
  startMinutes,
  endMinutes,
  excludeId = null,
  bufferMinutes = 5,
}) => {
  const baseFilter = {
    date: startOfDay(date),
    status: 'Scheduled',
    startMinutes: { $lt: endMinutes + bufferMinutes },
    endMinutes: { $gt: startMinutes - bufferMinutes },
  };

  if (excludeId) baseFilter._id = { $ne: excludeId };

  const orConds = [{ salesPerson: salesPersonId }];
  if (clientId) orConds.push({ client: clientId });

  const myConflicts = await Meeting.find({
    ...baseFilter,
    $or: orConds,
  })
    .populate('client', 'clientName companyName')
    .populate('salesPerson', 'name role')
    .lean();

  const teamConflicts = await Meeting.find({
    ...baseFilter,
    salesPerson: { $ne: salesPersonId },
  })
    .populate('client', 'clientName companyName')
    .populate('salesPerson', 'name role')
    .lean();

  return { myConflicts, teamConflicts };
};

/* =========================================================
   CHECK CONFLICT API
========================================================= */

export const checkConflict = asyncHandler(async (req, res) => {
  const { date, startTime, duration, excludeId } = req.query;

  if (!date || !startTime || !duration) {
    throw new ApiError(400, 'date, startTime, duration are required');
  }

  const startMin = parseTimeToMinutes(startTime);
  const endMin = startMin + Number(duration);

  const { myConflicts, teamConflicts } = await checkMeetingConflict({
    salesPersonId: req.user._id,
    clientId: null,
    date: date,
    startMinutes: startMin,
    endMinutes: endMin,
    excludeId: excludeId || null,
  });

  const suggestedSlots =
    myConflicts.length > 0
      ? generateSuggestedSlots({
          startTime,
          duration: Number(duration),
          conflicts: myConflicts,
        })
      : [];

  res.json({
    success: true,
    data: {
      hasConflict: myConflicts.length > 0,
      conflicts: myConflicts.map((c) => ({
        _id: c._id,
        clientName: c.client?.clientName || c.clientName || 'Unknown',
        startTime: c.startTime,
        endTime: c.endTime,
        meetingType: c.meetingType,
        salesPerson: c.salesPerson?.name || '',
      })),
      teamBusy: teamConflicts.map((c) => ({
        _id: c._id,
        salesPersonName: c.salesPerson?.name || 'Team',
        clientName: c.client?.clientName || c.clientName || '',
        startTime: c.startTime,
        endTime: c.endTime,
        meetingType: c.meetingType,
      })),
      suggestedSlots,
    },
  });
});

/* =========================================================
   CREATE MEETING
========================================================= */

export const createMeeting = asyncHandler(async (req, res) => {
  const {
    client,
    meetingType,
    date,
    startTime,
    duration,
    purpose,
    notes,
    location,
    participants,
  } = req.body;

  if (!client) throw new ApiError(400, 'Client is required');
  if (!date) throw new ApiError(400, 'Date is required');
  if (!startTime) throw new ApiError(400, 'Start time is required');
  if (!duration) throw new ApiError(400, 'Duration is required');

  const clientDoc = await Client.findById(client);
  if (!clientDoc) throw new ApiError(404, 'Client not found');

  if (req.user.role === 'sales') {
    if (!clientDoc.assignedSales?.equals(req.user._id)) {
      throw new ApiError(403, 'You can only schedule meetings for your assigned clients');
    }
  }

  const startMin = parseTimeToMinutes(startTime);
  const endMin = startMin + Number(duration);

  if (startMin < 9 * 60) throw new ApiError(400, 'Meeting cannot start before 9:00 AM');
  if (endMin > 18 * 60) throw new ApiError(400, 'Meeting must end by 6:00 PM');

  const { myConflicts } = await checkMeetingConflict({
    salesPersonId: req.user._id,
    clientId: client,
    date: date,
    startMinutes: startMin,
    endMinutes: endMin,
  });

  if (myConflicts.length > 0) {
    const suggestedSlots = generateSuggestedSlots({
      startTime,
      duration: Number(duration),
      conflicts: myConflicts,
    });

    return res.status(409).json({
      success: false,
      message: 'Time slot not available',
      conflicts: myConflicts.map((c) => ({
        _id: c._id,
        clientName: c.client?.clientName || 'Unknown',
        startTime: c.startTime,
        endTime: c.endTime,
        meetingType: c.meetingType,
      })),
      suggestedSlots,
    });
  }

  const meeting = await Meeting.create({
    client,
    clientName: clientDoc.clientName,
    clientPhone: clientDoc.phone,
    meetingType: meetingType || 'Doctor',
    date: startOfDay(date),
    startTime,
    endTime: minutesToTime(endMin),
    startMinutes: startMin,
    endMinutes: endMin,
    duration: Number(duration),
    purpose: purpose?.trim() || '',
    notes: notes?.trim() || '',
    location: location?.trim() || '',
    salesPerson: req.user._id,
    participants: participants || [],
    status: 'Scheduled',
    createdBy: req.user._id,
  });

  const populated = await Meeting.findById(meeting._id)
    .populate('client', 'clientName companyName email phone city state address') // 🆕 ADDED
    .populate('salesPerson', 'name role email');

  if (req.user.role === 'sales' && req.user.reportingManager) {
    try {
      await notify({
        from: req.user._id,
        to: req.user.reportingManager,
        type: 'meeting',
        title: '📅 New Meeting Scheduled',
        message: `${req.user.name} scheduled a meeting with ${clientDoc.clientName} on ${new Date(date).toLocaleDateString('en-IN')} at ${startTime}`,
        referenceId: meeting._id,
        url: '/manager/meetings',
      });
    } catch (err) {
      console.error('meeting notify err:', err);
    }
  }

  await logActivity({
    user: req.user._id,
    action: 'CREATE',
    module: 'Meeting',
    description: `Scheduled meeting with ${clientDoc.clientName}`,
    referenceId: meeting._id,
  });

  res.status(201).json({
    success: true,
    message: 'Meeting scheduled successfully',
    data: populated,
  });
});

/* =========================================================
   GET MY MEETINGS
========================================================= */

export const getMyMeetings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = { salesPerson: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate) filter.date.$gte = startOfDay(req.query.startDate);
    if (req.query.endDate) filter.date.$lte = endOfDay(req.query.endDate);
  }

  const [data, total] = await Promise.all([
    Meeting.find(filter)
      .populate('client', 'clientName companyName email phone city state address') // 🆕 ADDED
      .populate('salesPerson', 'name role')
      .sort({ date: -1, startMinutes: -1 })
      .skip(skip)
      .limit(limit),
    Meeting.countDocuments(filter),
  ]);

  res.json({ success: true, ...paginatedResponse(data, total, page, limit) });
});

/* =========================================================
   GET ALL MEETINGS  ⬅️ YAHAN UPDATE HUA
========================================================= */

export const getAllMeetings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};
  if (req.query.salesPerson) filter.salesPerson = req.query.salesPerson;
  if (req.query.client) filter.client = req.query.client;
  if (req.query.status) filter.status = req.query.status;

  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate) filter.date.$gte = startOfDay(req.query.startDate);
    if (req.query.endDate) filter.date.$lte = endOfDay(req.query.endDate);
  }

  const [data, total] = await Promise.all([
    Meeting.find(filter)
      .populate('client', 'clientName companyName email phone city state address') // 🆕 ADDED
      .populate('salesPerson', 'name role email department')
      .populate('participants', 'name role')
      .sort({ date: -1, startMinutes: -1 })
      .skip(skip)
      .limit(limit),
    Meeting.countDocuments(filter),
  ]);

  const today = startOfDay();
  const tomorrow = endOfDay();

  const stats = {
    today: await Meeting.countDocuments({
      ...filter,
      date: { $gte: today, $lte: tomorrow },
      status: 'Scheduled',
    }),
    upcoming: await Meeting.countDocuments({
      ...filter,
      date: { $gte: today },
      status: 'Scheduled',
    }),
    completed: await Meeting.countDocuments({ ...filter, status: 'Completed' }),
    cancelled: await Meeting.countDocuments({ ...filter, status: 'Cancelled' }),
  };

  res.json({ success: true, stats, ...paginatedResponse(data, total, page, limit) });
});

/* =========================================================
   GET CALENDAR DATA  ⬅️ YAHAN UPDATE HUA
========================================================= */

export const getCalendarData = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = Number(req.query.month) || new Date().getMonth() + 1;

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);

  const filter = {
    date: { $gte: monthStart, $lte: monthEnd },
    status: { $ne: 'Cancelled' },
  };

  if (req.query.salesPerson) filter.salesPerson = req.query.salesPerson;

  const meetings = await Meeting.find(filter)
    .populate('client', 'clientName companyName city state address') // 🆕 ADDED city, state, address
    .populate('salesPerson', 'name role')
    .populate('participants', 'name role')
    .sort({ date: 1, startMinutes: 1 })
    .lean();

  const byDate = {};
  meetings.forEach((m) => {
    const d = new Date(m.date);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${mo}-${day}`;

    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(m);
  });

  res.json({
    success: true,
    data: { year, month, totalMeetings: meetings.length, byDate },
  });
});

/* =========================================================
   GET TODAY
========================================================= */

export const getTodayMeetings = asyncHandler(async (req, res) => {
  const filter = { date: startOfDay(), status: 'Scheduled' };
  if (req.user.role === 'sales') filter.salesPerson = req.user._id;

  const meetings = await Meeting.find(filter)
    .populate('client', 'clientName companyName phone city state address') // 🆕 ADDED
    .populate('salesPerson', 'name role')
    .sort({ startMinutes: 1 })
    .lean();

  res.json({ success: true, count: meetings.length, data: meetings });
});

/* =========================================================
   GET SINGLE
========================================================= */

export const getMeeting = asyncHandler(async (req, res) => {
  const meeting = await Meeting.findById(req.params.id)
    .populate('client', 'clientName companyName email phone address city state') // 🆕 ADDED city, state
    .populate('salesPerson', 'name role email department phone');

  if (!meeting) throw new ApiError(404, 'Meeting not found');
  res.json({ success: true, data: meeting });
});

/* =========================================================
   UPDATE MEETING
========================================================= */

export const updateMeeting = asyncHandler(async (req, res) => {
  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) throw new ApiError(404, 'Meeting not found');

  if (req.user.role === 'sales' && !meeting.salesPerson.equals(req.user._id)) {
    throw new ApiError(403, 'Not authorized');
  }

  if (meeting.status !== 'Scheduled') {
    throw new ApiError(400, 'Only scheduled meetings can be edited');
  }

  const { date, startTime, duration, meetingType, purpose, notes, location, participants } = req.body;

  if (date || startTime || duration) {
    const newDate = date ? date : meeting.date;
    const newStartTime = startTime || meeting.startTime;
    const newDuration = duration || meeting.duration;

    const startMin = parseTimeToMinutes(newStartTime);
    const endMin = startMin + Number(newDuration);

    if (startMin < 9 * 60) throw new ApiError(400, 'Meeting cannot start before 9:00 AM');
    if (endMin > 18 * 60) throw new ApiError(400, 'Meeting must end by 6:00 PM');

    const { myConflicts } = await checkMeetingConflict({
      salesPersonId: meeting.salesPerson,
      clientId: meeting.client,
      date: newDate,
      startMinutes: startMin,
      endMinutes: endMin,
      excludeId: meeting._id,
    });

    if (myConflicts.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Time slot not available',
        conflicts: myConflicts.map((c) => ({
          _id: c._id,
          clientName: c.client?.clientName || 'Unknown',
          startTime: c.startTime,
          endTime: c.endTime,
        })),
        suggestedSlots: generateSuggestedSlots({
          startTime: newStartTime,
          duration: newDuration,
          conflicts: myConflicts,
        }),
      });
    }

    meeting.date = startOfDay(newDate);
    meeting.startTime = newStartTime;
    meeting.startMinutes = startMin;
    meeting.endMinutes = endMin;
    meeting.endTime = minutesToTime(endMin);
    meeting.duration = Number(newDuration);
  }

  if (meetingType) meeting.meetingType = meetingType;
  if (purpose !== undefined) meeting.purpose = purpose?.trim() || '';
  if (notes !== undefined) meeting.notes = notes?.trim() || '';
  if (location !== undefined) meeting.location = location?.trim() || '';
  if (participants !== undefined) {
    meeting.participants = participants;
  }

  await meeting.save();

  const populated = await Meeting.findById(meeting._id)
    .populate('client', 'clientName companyName email phone city state address') // 🆕 ADDED
    .populate('salesPerson', 'name role email');

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Meeting',
    description: `Updated meeting with ${meeting.clientName || 'client'}`,
    referenceId: meeting._id,
  });

  res.json({ success: true, message: 'Meeting updated', data: populated });
});

/* =========================================================
   UPDATE STATUS
========================================================= */

export const updateMeetingStatus = asyncHandler(async (req, res) => {
  const { status, cancelReason } = req.body;

  if (!['Scheduled', 'Completed', 'Cancelled', 'NoShow'].includes(status)) {
    throw new ApiError(400, 'Invalid status');
  }

  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) throw new ApiError(404, 'Meeting not found');

  if (req.user.role === 'sales' && !meeting.salesPerson.equals(req.user._id)) {
    throw new ApiError(403, 'Not authorized');
  }

  if (meeting.status === 'Cancelled' && status === 'Scheduled') {
    throw new ApiError(400, 'Cancelled meeting ko reschedule karo — direct Scheduled nahi kar sakte');
  }

  meeting.status = status;
  if (status === 'Completed') meeting.completedAt = new Date();
  if (status === 'Cancelled') {
    meeting.cancelledAt = new Date();
    meeting.cancelReason = cancelReason?.trim() || '';
  }

  await meeting.save();
  res.json({ success: true, message: `Meeting ${status.toLowerCase()}`, data: meeting });
});

/* =========================================================
   DELETE MEETING
========================================================= */

export const deleteMeeting = asyncHandler(async (req, res) => {
  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) throw new ApiError(404, 'Meeting not found');

  await meeting.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Meeting',
    description: `Deleted meeting with ${meeting.clientName}`,
    referenceId: meeting._id,
  });

  res.json({ success: true, message: 'Meeting deleted' });
});