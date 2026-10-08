import Holiday from '../models/Holiday.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getPagination,
  paginatedResponse,
} from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

/* =========================================================
   GET ALL HOLIDAYS
   
   GET /api/holidays
   Query: year, month, type, applicableTo
========================================================= */

export const getHolidays = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = { isActive: true };

  /* Filter by year */
  if (req.query.year) {
    const year = Number(req.query.year);
    filter.date = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31T23:59:59`),
    };
  }

  /* Filter by month (needs year) */
  if (req.query.year && req.query.month) {
    const year = Number(req.query.year);
    const month = Number(req.query.month) - 1; // JS months 0-indexed

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59);

    filter.date = { $gte: start, $lte: end };
  }

  /* Filter by type */
  if (req.query.type) {
    filter.type = req.query.type;
  }

  /* Filter by applicableTo */
  if (req.query.applicableTo) {
    filter.applicableTo = req.query.applicableTo;
  }

  /* Upcoming only */
  if (req.query.upcoming === 'true') {
    filter.date = {
      ...(filter.date || {}),
      $gte: startOfDay(new Date()),
    };
  }

  const [data, total] = await Promise.all([
    Holiday.find(filter)
      .populate('createdBy', 'name role')
      .populate('specificEmployees', 'name email')
      .sort('date')
      .skip(skip)
      .limit(limit),
    Holiday.countDocuments(filter),
  ]);

  res.json({
    success: true,
    ...paginatedResponse(data, total, page, limit),
  });
});

/* =========================================================
   GET MY HOLIDAYS (for employees)
   
   GET /api/holidays/my
   Returns holidays applicable to current user
========================================================= */

export const getMyHolidays = asyncHandler(async (req, res) => {
  const filter = {
    isActive: true,
    $or: [
      { applicableTo: 'All' },
      { applicableTo: req.user.role },
      {
        applicableTo: 'Specific',
        specificEmployees: req.user._id,
      },
    ],
  };

  /* Year filter */
  if (req.query.year) {
    const year = Number(req.query.year);
    filter.date = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31T23:59:59`),
    };
  }

  /* Upcoming */
  if (req.query.upcoming === 'true') {
    filter.date = {
      ...(filter.date || {}),
      $gte: startOfDay(new Date()),
    };
  }

  const holidays = await Holiday.find(filter)
    .select('name description date endDate type isPaid')
    .sort('date');

  res.json({
    success: true,
    data: holidays,
  });
});

/* =========================================================
   GET SINGLE HOLIDAY
   
   GET /api/holidays/:id
========================================================= */

export const getHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.findById(req.params.id)
    .populate('createdBy', 'name role')
    .populate('specificEmployees', 'name email');

  if (!holiday) {
    throw new ApiError(404, 'Holiday not found');
  }

  res.json({
    success: true,
    data: holiday,
  });
});

/* =========================================================
   CREATE HOLIDAY (Manager only)
   
   POST /api/holidays
========================================================= */

export const createHoliday = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    date,
    endDate,
    type,
    isPaid,
    applicableTo,
    specificEmployees,
  } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, 'Holiday name is required');
  }

  if (!date) {
    throw new ApiError(400, 'Date is required');
  }

  const payload = {
    name: name.trim(),
    description: description?.trim() || '',
    date: startOfDay(date),
    endDate: endDate ? endOfDay(endDate) : null,
    type: type || 'Festival',
    isPaid: isPaid ?? true,
    applicableTo: applicableTo || 'All',
    specificEmployees:
      applicableTo === 'Specific' && Array.isArray(specificEmployees)
        ? specificEmployees
        : [],
    createdBy: req.user._id,
  };

  /* Validate specific employees */
  if (payload.applicableTo === 'Specific') {
    if (!payload.specificEmployees.length) {
      throw new ApiError(
        400,
        'Please select at least one employee for specific holiday'
      );
    }
  }

  const holiday = await Holiday.create(payload);

  const populated = await holiday.populate([
    { path: 'createdBy', select: 'name role' },
    { path: 'specificEmployees', select: 'name email' },
  ]);

  await logActivity({
    user: req.user._id,
    action: 'CREATE',
    module: 'Holiday',
    description: `Created holiday "${holiday.name}" on ${holiday.date.toDateString()}`,
    referenceId: holiday._id,
  });

  res.status(201).json({
    success: true,
    data: populated,
  });
});

/* =========================================================
   UPDATE HOLIDAY (Manager only)
   
   PUT /api/holidays/:id
========================================================= */

export const updateHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.findById(req.params.id);

  if (!holiday) {
    throw new ApiError(404, 'Holiday not found');
  }

  const allowed = [
    'name',
    'description',
    'type',
    'isPaid',
    'applicableTo',
    'specificEmployees',
  ];

  allowed.forEach((field) => {
    if (req.body[field] !== undefined) {
      holiday[field] = req.body[field];
    }
  });

  /* Dates handled specially */
  if (req.body.date) {
    holiday.date = startOfDay(req.body.date);
  }

  if (req.body.endDate !== undefined) {
    holiday.endDate = req.body.endDate
      ? endOfDay(req.body.endDate)
      : null;
  }

  /* Clean specific employees if not "Specific" */
  if (holiday.applicableTo !== 'Specific') {
    holiday.specificEmployees = [];
  }

  await holiday.save();

  const populated = await holiday.populate([
    { path: 'createdBy', select: 'name role' },
    { path: 'specificEmployees', select: 'name email' },
  ]);

  await logActivity({
    user: req.user._id,
    action: 'UPDATE',
    module: 'Holiday',
    description: `Updated holiday "${holiday.name}"`,
    referenceId: holiday._id,
  });

  res.json({
    success: true,
    data: populated,
  });
});

/* =========================================================
   DELETE HOLIDAY (Manager only)
   
   DELETE /api/holidays/:id
========================================================= */

export const deleteHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.findById(req.params.id);

  if (!holiday) {
    throw new ApiError(404, 'Holiday not found');
  }

  await holiday.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Holiday',
    description: `Deleted holiday "${holiday.name}"`,
    referenceId: holiday._id,
  });

  res.json({
    success: true,
    message: 'Holiday deleted successfully',
  });
});

/* =========================================================
   GET CALENDAR VIEW
   
   GET /api/holidays/calendar/:year/:month
   
   Returns all holidays of that month + weekends
========================================================= */

export const getCalendar = asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month) - 1; // 0-indexed

  if (isNaN(year) || isNaN(month)) {
    throw new ApiError(400, 'Invalid year or month');
  }

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);

  const holidays = await Holiday.find({
    isActive: true,
    date: { $gte: start, $lte: end },
  }).select('name date endDate type isPaid description');

  /* Build calendar days */
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendar = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(year, month, day);
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    /* Find holiday for this date */
    const matchingHoliday = holidays.find((h) => {
      const hDate = new Date(h.date);
      const hStart = startOfDay(hDate);
      const hEnd = h.endDate ? endOfDay(new Date(h.endDate)) : hStart;
      return currentDate >= hStart && currentDate <= hEnd;
    });

    calendar.push({
      day,
      date: currentDate,
      dayOfWeek,
      isWeekend,
      isHoliday: !!matchingHoliday,
      holiday: matchingHoliday
        ? {
            _id: matchingHoliday._id,
            name: matchingHoliday.name,
            type: matchingHoliday.type,
            isPaid: matchingHoliday.isPaid,
          }
        : null,
    });
  }

  res.json({
    success: true,
    data: {
      year,
      month: month + 1,
      days: calendar,
      holidays,
    },
  });
});