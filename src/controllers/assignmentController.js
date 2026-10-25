import Assignment from '../models/Assignment.js';
import Category from '../models/Category.js';
import CategoryLocation from '../models/CategoryLocation.js';
import User from '../models/User.js';
import Lead from '../models/Lead.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/* =====================================================
   CREATE ASSIGNMENT (Manager only — manual override)
===================================================== */
export const createAssignment = asyncHandler(async (req, res) => {
  const { category, location, salesPerson, notes } = req.body;

  if (!category || !location || !salesPerson) {
    throw new ApiError(400, 'Category, location, and salesPerson are required');
  }

  const [catDoc, locDoc, spDoc] = await Promise.all([
    Category.findById(category),
    CategoryLocation.findById(location),
    User.findById(salesPerson),
  ]);
  if (!catDoc || !catDoc.isActive) throw new ApiError(404, 'Category not found or inactive');
  if (!locDoc || !locDoc.isActive) throw new ApiError(404, 'Location not found or inactive');
  if (!spDoc) throw new ApiError(404, 'Sales person not found');

  if (locDoc.category.toString() !== category.toString()) {
    throw new ApiError(400, 'Location belongs to a different category');
  }

  const existing = await Assignment.findOne({
    category,
    location,
    isActive: true,
  }).populate('salesPerson', 'name');

  if (existing) {
    throw new ApiError(
      409,
      `Already assigned to ${existing.salesPerson?.name || 'another sales person'}`
    );
  }

  let assignment;
  try {
    assignment = await Assignment.create({
      category,
      location,
      salesPerson,
      notes: notes?.trim() || '',
      assignedBy: req.user._id,
      status: 'Pending',
    });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'This combo is already assigned');
    throw err;
  }

  const populated = await Assignment.findById(assignment._id)
    .populate('category', 'name')
    .populate({
      path: 'location',
      select: 'name level parent',
      populate: { path: 'parent', select: 'name level' },
    })
    .populate('salesPerson', 'name email phone');

  res.status(201).json({ success: true, data: populated });
});

/* =====================================================
   GET ASSIGNMENTS (Manager — read only)
===================================================== */
export const getAssignments = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.salesPerson) filter.salesPerson = req.query.salesPerson;
  if (req.query.category) filter.category = req.query.category;

  if (req.query.status && ['Pending', 'Done'].includes(req.query.status)) {
    filter.status = req.query.status;
  }

  const assignments = await Assignment.find(filter)
    .populate('category', 'name isActive')
    .populate({
      path: 'location',
      select: 'name level parent isActive',
      populate: { path: 'parent', select: 'name level' },
    })
    .populate('salesPerson', 'name email phone role')
    .sort({ createdAt: -1 });

  const filtered = assignments.filter((a) => {
    if (!a.category || !a.category.isActive) return false;
    if (!a.location || !a.location.isActive) return false;
    return true;
  });

  res.json({ success: true, data: filtered });
});

/* =====================================================
   GET MY ASSIGNMENTS (Sales person)
===================================================== */
export const getMyAssignments = asyncHandler(async (req, res) => {
  const assignments = await Assignment.find({
    salesPerson: req.user._id,
    isActive: true,
  })
    .populate('category', 'name isActive')
    .populate({
      path: 'location',
      select: 'name level parent isActive',
      populate: { path: 'parent', select: 'name level' },
    })
    .sort({ createdAt: -1 });

  const filtered = assignments.filter((a) => {
    if (!a.category || !a.category.isActive) return false;
    if (!a.location || !a.location.isActive) return false;
    return true;
  });

  const withStatus = filtered.map((a) => {
    const obj = a.toObject();
    if (!obj.status) obj.status = 'Pending';
    return obj;
  });

  res.json({ success: true, data: withStatus });
});

/* =====================================================
   GET ALL COMBOS — with assignment status + lead stats
===================================================== */
export const getAllCombos = asyncHandler(async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [allCategories, allLocations, assignments, leadStats] = await Promise.all([
    Category.find({ isActive: true }).lean(),
    CategoryLocation.find({ isActive: true }).lean(),
    Assignment.find({ isActive: true })
      .populate('salesPerson', 'name')
      .populate('category', 'isActive')
      .populate('location', 'isActive')
      .lean(),
    // 🆕 Lead aggregation — per category+location
    Lead.aggregate([
      {
        $group: {
          _id: { category: '$category', location: '$location' },
          today: {
            $sum: { $cond: [{ $gte: ['$leadDate', todayStart] }, 1, 0] },
          },
          total: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Active sets
  const activeCategoryIds = new Set(allCategories.map((c) => c._id.toString()));
  const activeLocationIds = new Set(allLocations.map((l) => l._id.toString()));

  // 🆕 Lead stats map: `${catId}_${locId}` → { today, total }
  const leadStatsMap = new Map();
  leadStats.forEach((s) => {
    const key = `${s._id.category}_${s._id.location}`;
    leadStatsMap.set(key, { today: s.today, total: s.total });
  });

  // Taken map
  const takenMap = new Map();
  assignments.forEach((a) => {
    if (!a.category || !a.category.isActive) return;
    if (!a.location || !a.location.isActive) return;
    if (!activeCategoryIds.has(a.category._id.toString())) return;
    if (!activeLocationIds.has(a.location._id.toString())) return;

    const key = `${a.category._id}_${a.location._id}`;
    takenMap.set(key, {
      assignmentId: a._id,
      salesPersonId: a.salesPerson?._id,
      salesPersonName: a.salesPerson?.name || 'Unknown',
      status: a.status || 'Pending',
      doneAt: a.doneAt || null,
    });
  });

  const locationsByCategory = {};
  allLocations.forEach((loc) => {
    const catId = loc.category.toString();
    if (!activeCategoryIds.has(catId)) return;
    if (!locationsByCategory[catId]) locationsByCategory[catId] = [];
    locationsByCategory[catId].push(loc);
  });

  const buildTree = (locations) => {
    const map = {};
    locations.forEach((l) => (map[l._id] = { ...l, children: [] }));
    const roots = [];
    locations.forEach((l) => {
      if (l.parent && map[l.parent]) map[l.parent].children.push(map[l._id]);
      else roots.push(map[l._id]);
    });
    return roots;
  };

  const result = allCategories.map((cat) => {
    const catLocations = locationsByCategory[cat._id.toString()] || [];
    const tree = buildTree(catLocations);

    const attachStatus = (node) => {
      const key = `${cat._id}_${node._id}`;
      const taken = takenMap.get(key);
      const leads = leadStatsMap.get(key) || { today: 0, total: 0 }; // 🆕

      return {
        _id: node._id,
        name: node.name,
        level: node.level,
        parent: node.parent,
        available: !taken,
        takenBy: taken
          ? {
              _id: taken.salesPersonId,
              name: taken.salesPersonName,
              status: taken.status,
              doneAt: taken.doneAt,
              assignmentId: taken.assignmentId,
            }
          : null,
        leadStats: leads, // 🆕 { today, total }
        children: node.children.map(attachStatus),
      };
    };

    return {
      _id: cat._id,
      name: cat.name,
      description: cat.description,
      locations: tree.map(attachStatus),
    };
  });

  res.json({ success: true, data: result });
});

/* =====================================================
   UPDATE ASSIGNMENT (Manager)
===================================================== */
export const updateAssignment = asyncHandler(async (req, res) => {
  const { salesPerson, notes, status } = req.body;

  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) throw new ApiError(404, 'Assignment not found');

  if (salesPerson) {
    const conflict = await Assignment.findOne({
      category: assignment.category,
      location: assignment.location,
      isActive: true,
      salesPerson,
      _id: { $ne: assignment._id },
    });
    if (conflict) throw new ApiError(409, 'This sales person already has this combo');
    assignment.salesPerson = salesPerson;
  }

  if (notes !== undefined) assignment.notes = notes?.trim() || '';

  if (status && ['Pending', 'Done'].includes(status)) {
    assignment.status = status;
    assignment.doneAt = status === 'Done' ? new Date() : null;
  }

  await assignment.save();

  const populated = await Assignment.findById(assignment._id)
    .populate('category', 'name')
    .populate('location', 'name level')
    .populate('salesPerson', 'name email phone');

  res.json({ success: true, data: populated });
});

/* =====================================================
   DELETE ASSIGNMENT (Manager — soft unassign)
===================================================== */
export const deleteAssignment = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!assignment) throw new ApiError(404, 'Assignment not found');
  res.json({ success: true, message: 'Unassigned successfully' });
});

/* =====================================================
   CLAIM COMBO (Sales Person self-assign)
===================================================== */
export const claimCombo = asyncHandler(async (req, res) => {
  const { category, location } = req.body;

  if (!category || !location) {
    throw new ApiError(400, 'Category and location are required');
  }

  if (req.user.role !== 'sales') {
    throw new ApiError(403, 'Only sales persons can claim combos');
  }

  const [catDoc, locDoc] = await Promise.all([
    Category.findById(category),
    CategoryLocation.findById(location),
  ]);
  if (!catDoc || !catDoc.isActive) throw new ApiError(404, 'Category not found or inactive');
  if (!locDoc || !locDoc.isActive) throw new ApiError(404, 'Location not found or inactive');

  if (locDoc.category.toString() !== category.toString()) {
    throw new ApiError(400, 'Location belongs to a different category');
  }

  const existing = await Assignment.findOne({
    category,
    location,
    isActive: true,
  }).populate('salesPerson', 'name');

  if (existing) {
    if (existing.salesPerson._id.toString() === req.user._id.toString()) {
      return res.json({
        success: true,
        message: 'Already yours',
        data: existing,
      });
    }
    throw new ApiError(
      409,
      `Already taken by ${existing.salesPerson?.name || 'another sales person'}`
    );
  }

  let assignment;
  try {
    assignment = await Assignment.create({
      category,
      location,
      salesPerson: req.user._id,
      assignedBy: req.user._id,
      status: 'Pending',
    });
  } catch (err) {
    if (err.code === 11000) {
      const other = await Assignment.findOne({
        category,
        location,
        isActive: true,
      }).populate('salesPerson', 'name');
      throw new ApiError(
        409,
        `Already taken by ${other?.salesPerson?.name || 'another sales person'}`
      );
    }
    throw err;
  }

  const populated = await Assignment.findById(assignment._id)
    .populate('category', 'name')
    .populate({
      path: 'location',
      select: 'name level parent',
      populate: { path: 'parent', select: 'name level' },
    })
    .populate('salesPerson', 'name email');

  res.status(201).json({
    success: true,
    message: 'Combo claimed successfully',
    data: populated,
  });
});

/* =====================================================
   MARK AS DONE
===================================================== */
export const markAsDone = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) throw new ApiError(404, 'Assignment not found');

  if (req.user.role === 'sales') {
    if (assignment.salesPerson.toString() !== req.user._id.toString()) {
      throw new ApiError(403, 'Not your assignment');
    }
  }

  assignment.status = 'Done';
  assignment.doneAt = new Date();
  await assignment.save();

  const populated = await Assignment.findById(assignment._id)
    .populate('category', 'name')
    .populate({
      path: 'location',
      select: 'name level parent',
      populate: { path: 'parent', select: 'name level' },
    })
    .populate('salesPerson', 'name email');

  res.json({
    success: true,
    message: 'Marked as done ✅',
    data: populated,
  });
});

/* =====================================================
   MARK AS PENDING (re-open)
===================================================== */
export const markAsPending = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) throw new ApiError(404, 'Assignment not found');

  if (req.user.role === 'sales') {
    if (assignment.salesPerson.toString() !== req.user._id.toString()) {
      throw new ApiError(403, 'Not your assignment');
    }
  }

  assignment.status = 'Pending';
  assignment.doneAt = null;
  assignment.lastReminderSentAt = null;
  await assignment.save();

  const populated = await Assignment.findById(assignment._id)
    .populate('category', 'name')
    .populate({
      path: 'location',
      select: 'name level parent',
      populate: { path: 'parent', select: 'name level' },
    })
    .populate('salesPerson', 'name email');

  res.json({
    success: true,
    message: 'Marked as pending',
    data: populated,
  });
});

/* =====================================================
   SEND REMINDER NOW (manual trigger — Manager)
===================================================== */
export const sendReminderNow = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id)
    .populate('salesPerson', 'name phone')
    .populate('category', 'name')
    .populate({
      path: 'location',
      select: 'name parent',
      populate: { path: 'parent', select: 'name' },
    });

  if (!assignment) throw new ApiError(404, 'Assignment not found');

  if (assignment.status === 'Done') {
    throw new ApiError(400, 'Assignment already done — no reminder needed');
  }

  const { sendPendingReminder } = await import('../services/whatsappService.js');
  const result = await sendPendingReminder({
    assignment,
    salesPerson: assignment.salesPerson,
    category: assignment.category,
    location: assignment.location,
  });

  if (!result.success) {
    throw new ApiError(500, `Reminder failed: ${result.reason || result.error || 'unknown'}`);
  }

  assignment.lastReminderSentAt = new Date();
  assignment.reminderCount = (assignment.reminderCount || 0) + 1;
  await assignment.save();

  res.json({
    success: true,
    message: 'Reminder sent via WhatsApp ✅',
    data: {
      _id: assignment._id,
      lastReminderSentAt: assignment.lastReminderSentAt,
      reminderCount: assignment.reminderCount,
    },
  });
});

/* =====================================================
   GET PENDING SUMMARY (Manager stats)
===================================================== */
export const getPendingSummary = asyncHandler(async (req, res) => {
  const baseFilter = { isActive: true };

  const [totalPending, totalDone, bySalesPerson] = await Promise.all([
    Assignment.countDocuments({ ...baseFilter, status: 'Pending' }),
    Assignment.countDocuments({ ...baseFilter, status: 'Done' }),
    Assignment.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: { salesPerson: '$salesPerson', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.salesPerson',
          pending: {
            $sum: {
              $cond: [{ $eq: ['$_id.status', 'Pending'] }, '$count', 0],
            },
          },
          done: {
            $sum: {
              $cond: [{ $eq: ['$_id.status', 'Done'] }, '$count', 0],
            },
          },
          total: { $sum: '$count' },
        },
      },
    ]),
  ]);

  const userIds = bySalesPerson.map((s) => s._id).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } }).select('name email').lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const enriched = bySalesPerson.map((s) => ({
    salesPerson: userMap.get(s._id?.toString()) || { _id: s._id, name: 'Unknown' },
    pending: s.pending,
    done: s.done,
    total: s.total,
  }));

  res.json({
    success: true,
    data: {
      totalPending,
      totalDone,
      bySalesPerson: enriched,
    },
  });
});