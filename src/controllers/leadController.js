import Lead from '../models/Lead.js';
import Assignment from '../models/Assignment.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/* =====================================================
   CREATE LEAD (Manual — sales person button se)
===================================================== */
export const createLead = asyncHandler(async (req, res) => {
  const { category, location, clientName, clientPhone, notes } = req.body;

  if (!category || !location) {
    throw new ApiError(400, 'Category and location are required');
  }

  // Verify assignment belongs to this sales person
  const assignment = await Assignment.findOne({
    category,
    location,
    salesPerson: req.user._id,
    isActive: true,
  });

  if (!assignment) {
    throw new ApiError(
      403,
      'You can only log leads for your claimed category/location'
    );
  }

  const lead = await Lead.create({
    category,
    location,
    salesPerson: req.user._id,
    clientName: clientName?.trim() || '',
    clientPhone: clientPhone?.trim() || '',
    notes: notes?.trim() || '',
    leadDate: new Date(),
  });

  res.status(201).json({
    success: true,
    message: 'Lead logged! 🎯',
    data: lead,
  });
});

/* =====================================================
   GET LEAD STATS (per location)
===================================================== */
export const getLeadStats = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.user.role === 'sales') {
    filter.salesPerson = req.user._id;
  } else if (req.query.salesPerson) {
    filter.salesPerson = req.query.salesPerson;
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const stats = await Lead.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { category: '$category', location: '$location' },
        today: {
          $sum: { $cond: [{ $gte: ['$leadDate', todayStart] }, 1, 0] },
        },
        week: {
          $sum: { $cond: [{ $gte: ['$leadDate', weekStart] }, 1, 0] },
        },
        month: {
          $sum: { $cond: [{ $gte: ['$leadDate', monthStart] }, 1, 0] },
        },
        total: { $sum: 1 },
      },
    },
  ]);

  const map = {};
  stats.forEach((s) => {
    const key = `${s._id.category}_${s._id.location}`;
    map[key] = { today: s.today, week: s.week, month: s.month, total: s.total };
  });

  res.json({ success: true, data: map });
});

/* =====================================================
   GET MY LEAD COUNT (sales person summary)
===================================================== */
export const getMyLeadCount = asyncHandler(async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // 🆕 Sirf wahi leads count karo jinki category/location active ho
  const filter = { salesPerson: req.user._id };

  // Hum query mein hi deleted categories/locations ko filter kar sakte hain
  // Par sabse aasan tarika yeh hai ki hum Lead ko populate karein aur phir check karein
  
  const allLeads = await Lead.find(filter)
    .populate('category', 'isActive')
    .populate('location', 'isActive')
    .lean();

  // 🆕 Filter out those leads whose category or location is deleted/inactive
  const validLeads = allLeads.filter((lead) => {
    return (
      lead.category && 
      lead.category.isActive !== false && 
      lead.location && 
      lead.location.isActive !== false
    );
  });

  // Ab in valid leads ko date ke hisaab se count karo
  const today = validLeads.filter((l) => new Date(l.leadDate) >= todayStart).length;
  const week = validLeads.filter((l) => new Date(l.leadDate) >= weekStart).length;
  const month = validLeads.filter((l) => new Date(l.leadDate) >= monthStart).length;
  const total = validLeads.length;

  res.json({ success: true, data: { today, week, month, total } });
});

/* =====================================================
   GET LEADS LIST (for a location or all)
===================================================== */
export const getLeads = asyncHandler(async (req, res) => {
  const { category, location, range = 'today' } = req.query;
  const filter = {};

  if (req.user.role === 'sales') {
    filter.salesPerson = req.user._id;
  }

  if (category) filter.category = category;
  if (location) filter.location = location;

  const now = new Date();
  let start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === 'week') {
    start.setDate(now.getDate() - 7);
  } else if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range === 'all') {
    start = new Date(0);
  }

  filter.leadDate = { $gte: start };

  const leads = await Lead.find(filter)
    .populate('category', 'name')
    .populate({
      path: 'location',
      select: 'name parent',
      populate: { path: 'parent', select: 'name' },
    })
    .sort({ leadDate: -1 })
    .limit(200);

  res.json({ success: true, data: leads, count: leads.length });
});