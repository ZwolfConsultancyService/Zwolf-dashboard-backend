import Kiosk from '../models/Kiosk.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import AttendanceSettings from '../models/AttendanceSettings.js';
import Holiday from '../models/Holiday.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityService.js';
import { recognizeFaceWithML } from '../services/mlService.js';
import {
  startOfDay,
  isWeekend,
  buildAttendanceData,
} from '../utils/attendanceHelpers.js';

/* =========================================================
   🆕 PUBLIC FACE CHECK-IN (Kiosk — no login required)
   
   POST /api/kiosk/face-check-in
   Body: form-data
     - kioskKey: string
     - image: file
========================================================= */

export const kioskFaceCheckIn = asyncHandler(async (req, res) => {
  const { kioskKey } = req.body;

  /* =====================================================
     VALIDATE KIOSK KEY
  ===================================================== */

  if (!kioskKey) {
    throw new ApiError(400, 'Kiosk key is required');
  }

  const kiosk = await Kiosk.findOne({
    secretKey: kioskKey,
    isActive: true,
  });

  if (!kiosk) {
    throw new ApiError(401, 'Invalid or inactive kiosk');
  }

  /* =====================================================
     VALIDATE IMAGE
  ===================================================== */

  if (!req.file) {
    throw new ApiError(400, 'Image is required');
  }

  /* =====================================================
     RECOGNIZE FACE (ML Server)
  ===================================================== */

  const mlResult = await recognizeFaceWithML(
    req.file.buffer,
    req.file.originalname
  );

  if (!mlResult.success) {
    throw new ApiError(
      500,
      mlResult.error || 'Face recognition failed'
    );
  }

  const { matched, employeeId, confidence, distance, reason } =
    mlResult.data || {};

  if (!matched) {
    return res.status(200).json({
      success: false,
      action: 'no-match',
      message: reason || 'Face not recognized',
      data: {
        matched: false,
        confidence: confidence || 0,
      },
    });
  }

  /* =====================================================
     FIND EMPLOYEE
  ===================================================== */

  const employee = await User.findById(employeeId);

  if (!employee) {
    return res.status(200).json({
      success: false,
      action: 'no-match',
      message: 'Employee not found in database',
      data: {
        matched: false,
      },
    });
  }

  if (!employee.isActive) {
    return res.status(200).json({
      success: false,
      action: 'inactive',
      message: `${employee.name} is inactive`,
      data: {
        matched: true,
        employee: {
          _id: employee._id,
          name: employee.name,
        },
      },
    });
  }

  /* =====================================================
     SETTINGS + HOLIDAY CHECK
  ===================================================== */

  const today = startOfDay();
  const settings = await AttendanceSettings.getSettings();

  const holiday = await Holiday.findOne({
    isActive: true,
    $or: [
      { applicableTo: 'All' },
      { applicableTo: employee.role },
      {
        applicableTo: 'Specific',
        specificEmployees: employee._id,
      },
    ],
    $and: [
      { date: { $lte: today } },
      {
        $or: [
          { endDate: null, date: { $gte: today } },
          { endDate: { $gte: today } },
        ],
      },
    ],
  });

  const isHol = !!holiday;
  const isWknd = isWeekend(today, settings.weekendDays);

  if (isHol) {
    return res.status(200).json({
      success: false,
      action: 'holiday',
      message: `Today is a holiday — ${holiday.name}`,
      data: {
        matched: true,
        employee: {
          _id: employee._id,
          name: employee.name,
        },
        holiday: {
          name: holiday.name,
          type: holiday.type,
        },
      },
    });
  }

  if (isWknd) {
    return res.status(200).json({
      success: false,
      action: 'weekend',
      message: `Today is a weekend`,
      data: {
        matched: true,
        employee: {
          _id: employee._id,
          name: employee.name,
        },
      },
    });
  }

  /* =====================================================
     ATTENDANCE — AUTO DETECT CHECK-IN / CHECK-OUT
  ===================================================== */

  let attendance = await Attendance.findOne({
    employee: employee._id,
    date: today,
  });

  const now = new Date();

  /* =====================================================
     CASE 1: No record yet → CHECK-IN
  ===================================================== */

  if (!attendance || !attendance.loginTime) {
    const computed = buildAttendanceData({
      loginTime: now,
      logoutTime: null,
      settings,
      captureMethod: 'face',
      faceMatchScore: confidence,
      faceImage: '',
    });

    const payload = {
      employee: employee._id,
      date: today,
      ...computed,
      isHoliday: false,
      holidayId: null,
      status: computed.status || 'Present',
    };

    if (attendance) {
      Object.assign(attendance, payload);
      await attendance.save();
    } else {
      attendance = await Attendance.create(payload);
    }

    /* Update kiosk stats */
    kiosk.lastUsedAt = now;
    kiosk.totalScans = (kiosk.totalScans || 0) + 1;
    await kiosk.save();

    await logActivity({
      user: employee._id,
      action: 'CHECKIN',
      module: 'Attendance',
      description: `${employee.name} checked in via Kiosk (${Math.round(
        confidence * 100
      )}%)`,
      referenceId: attendance._id,
    });

    return res.json({
      success: true,
      action: 'check-in',
      message: `Welcome ${employee.name}!`,
      data: {
        attendance: {
          _id: attendance._id,
          loginTime: attendance.loginTime,
          isLate: attendance.isLate,
          lateMinutes: attendance.lateMinutes,
          status: attendance.status,
        },
        employee: {
          _id: employee._id,
          name: employee.name,
          role: employee.role,
          profileImage: employee.profileImage || '',
        },
        confidence: Math.round(confidence * 100),
      },
    });
  }

  /* =====================================================
     CASE 2: Already checked in → CHECK-OUT
  ===================================================== */

  if (attendance.loginTime && !attendance.logoutTime) {
    const computed = buildAttendanceData({
      loginTime: attendance.loginTime,
      logoutTime: now,
      settings,
      captureMethod: 'face',
      faceMatchScore: confidence,
      faceImage: attendance.faceImage,
    });

    Object.assign(attendance, computed);
    await attendance.save();

    kiosk.lastUsedAt = now;
    kiosk.totalScans = (kiosk.totalScans || 0) + 1;
    await kiosk.save();

    await logActivity({
      user: employee._id,
      action: 'CHECKOUT',
      module: 'Attendance',
      description: `${employee.name} checked out via Kiosk`,
      referenceId: attendance._id,
    });

    return res.json({
      success: true,
      action: 'check-out',
      message: `Goodbye ${employee.name}!`,
      data: {
        attendance: {
          _id: attendance._id,
          loginTime: attendance.loginTime,
          logoutTime: attendance.logoutTime,
          workingMinutes: attendance.workingMinutes,
          status: attendance.status,
        },
        employee: {
          _id: employee._id,
          name: employee.name,
          role: employee.role,
          profileImage: employee.profileImage || '',
        },
        confidence: Math.round(confidence * 100),
      },
    });
  }

  /* =====================================================
     CASE 3: Already checked in + out → "Already done"
  ===================================================== */

  return res.json({
    success: false,
    action: 'already-done',
    message: `${employee.name} already checked in and out today`,
    data: {
      matched: true,
      employee: {
        _id: employee._id,
        name: employee.name,
      },
      attendance: {
        loginTime: attendance.loginTime,
        logoutTime: attendance.logoutTime,
        workingMinutes: attendance.workingMinutes,
      },
    },
  });
});

/* =========================================================
   GET KIOSK INFO (public — validate key)
   
   GET /api/kiosk/info?key=xxx
========================================================= */

export const getKioskInfo = asyncHandler(async (req, res) => {
  const { key } = req.query;

  if (!key) {
    throw new ApiError(400, 'Kiosk key is required');
  }

  const kiosk = await Kiosk.findOne({
    secretKey: key,
    isActive: true,
  }).select('name location isActive');

  if (!kiosk) {
    throw new ApiError(401, 'Invalid or inactive kiosk');
  }

  res.json({
    success: true,
    data: kiosk,
  });
});

/* =========================================================
   LIST ALL KIOSKS (Manager)
   
   GET /api/kiosk
========================================================= */

export const listKiosks = asyncHandler(async (req, res) => {
  const kiosks = await Kiosk.find()
    .populate('createdBy', 'name email')
    .sort('-createdAt');

  res.json({
    success: true,
    data: kiosks,
  });
});

/* =========================================================
   CREATE KIOSK (Manager)
   
   POST /api/kiosk
========================================================= */

export const createKiosk = asyncHandler(async (req, res) => {
  const { name, location } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, 'Kiosk name is required');
  }

  /* Ensure unique key */
  let secretKey;
  let attempts = 0;

  do {
    secretKey = Kiosk.generateSecretKey();
    attempts++;

    const exists = await Kiosk.findOne({ secretKey });
    if (!exists) break;
  } while (attempts < 5);

  const kiosk = await Kiosk.create({
    name: name.trim(),
    location: location?.trim() || 'Office Entrance',
    secretKey,
    createdBy: req.user._id,
  });

  await logActivity({
    user: req.user._id,
    action: 'CREATE',
    module: 'Kiosk',
    description: `Created kiosk "${kiosk.name}"`,
    referenceId: kiosk._id,
  });

  res.status(201).json({
    success: true,
    data: kiosk,
  });
});

/* =========================================================
   UPDATE KIOSK (Manager)
   
   PUT /api/kiosk/:id
========================================================= */

export const updateKiosk = asyncHandler(async (req, res) => {
  const kiosk = await Kiosk.findById(req.params.id);

  if (!kiosk) {
    throw new ApiError(404, 'Kiosk not found');
  }

  if (req.body.name !== undefined) kiosk.name = req.body.name;
  if (req.body.location !== undefined)
    kiosk.location = req.body.location;
  if (req.body.isActive !== undefined)
    kiosk.isActive = req.body.isActive;

  await kiosk.save();

  res.json({
    success: true,
    data: kiosk,
  });
});

/* =========================================================
   REGENERATE KEY (Manager)
   
   PATCH /api/kiosk/:id/regenerate
========================================================= */

export const regenerateKioskKey = asyncHandler(async (req, res) => {
  const kiosk = await Kiosk.findById(req.params.id);

  if (!kiosk) {
    throw new ApiError(404, 'Kiosk not found');
  }

  kiosk.secretKey = Kiosk.generateSecretKey();
  await kiosk.save();

  res.json({
    success: true,
    message: 'Kiosk key regenerated',
    data: kiosk,
  });
});

/* =========================================================
   DELETE KIOSK (Manager)
========================================================= */

export const deleteKiosk = asyncHandler(async (req, res) => {
  const kiosk = await Kiosk.findById(req.params.id);

  if (!kiosk) {
    throw new ApiError(404, 'Kiosk not found');
  }

  await kiosk.deleteOne();

  await logActivity({
    user: req.user._id,
    action: 'DELETE',
    module: 'Kiosk',
    description: `Deleted kiosk "${kiosk.name}"`,
    referenceId: kiosk._id,
  });

  res.json({
    success: true,
    message: 'Kiosk deleted',
  });
});