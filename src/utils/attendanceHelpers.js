/* =========================================================
   ATTENDANCE HELPERS
========================================================= */

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

/* Parse "HH:MM" → today's Date object */
export const parseTimeToDate = (timeStr, baseDate = new Date()) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

/* Check if a date is a weekend */
export const isWeekend = (date, weekendDays = [0, 6]) => {
  const d = new Date(date);
  return weekendDays.includes(d.getDay());
};

/* Calculate late minutes (loginTime vs officeStartTime + grace) */
export const calculateLateMinutes = (
  loginTime,
  officeStartTime,
  graceMinutes = 15
) => {
  const login = new Date(loginTime);
  const expectedStart = parseTimeToDate(officeStartTime, login);
  const graceEnd = new Date(
    expectedStart.getTime() + graceMinutes * 60000
  );

  if (login <= graceEnd) return 0;

  const lateMs = login - expectedStart;
  return Math.round(lateMs / 60000);
};

/* Calculate working minutes (excluding lunch) */
export const calculateWorkingMinutes = (
  loginTime,
  logoutTime,
  lunchStartTime,
  lunchEndTime
) => {
  if (!loginTime || !logoutTime) return 0;

  const login = new Date(loginTime);
  const logout = new Date(logoutTime);

  if (logout <= login) return 0;

  let totalMs = logout - login;

  /* Deduct lunch if overlap */
  const lunchStart = parseTimeToDate(lunchStartTime, login);
  const lunchEnd = parseTimeToDate(lunchEndTime, login);

  const lunchOverlapStart = Math.max(login, lunchStart);
  const lunchOverlapEnd = Math.min(logout, lunchEnd);

  if (lunchOverlapEnd > lunchOverlapStart) {
    totalMs -= lunchOverlapEnd - lunchOverlapStart;
  }

  return Math.max(0, Math.round(totalMs / 60000));
};

/* Calculate overtime (after officeEndTime) */
export const calculateOvertimeMinutes = (
  logoutTime,
  officeEndTime
) => {
  if (!logoutTime) return 0;

  const logout = new Date(logoutTime);
  const expectedEnd = parseTimeToDate(officeEndTime, logout);

  if (logout <= expectedEnd) return 0;

  return Math.round((logout - expectedEnd) / 60000);
};

/* Build a full attendance record with computed fields */
export const buildAttendanceData = ({
  loginTime,
  logoutTime,
  settings,
  captureMethod = 'face',
  faceMatchScore = null,
  faceImage = '',
}) => {
  const data = {
    loginTime,
    logoutTime: logoutTime || null,
    captureMethod,
    faceMatchScore,
    faceImage,
  };

  if (loginTime) {
    /* Late */
    const lateMinutes = calculateLateMinutes(
      loginTime,
      settings.officeStartTime,
      settings.lateGraceMinutes
    );
    data.lateMinutes = lateMinutes;
    data.isLate = lateMinutes > 0;
  }

  if (loginTime && logoutTime) {
    /* Working */
    const workingMinutes = calculateWorkingMinutes(
      loginTime,
      logoutTime,
      settings.lunchStartTime,
      settings.lunchEndTime
    );
    data.workingMinutes = workingMinutes;

    /* Overtime */
    data.overtimeMinutes = calculateOvertimeMinutes(
      logoutTime,
      settings.officeEndTime
    );

    /* Status */
    if (workingMinutes < settings.halfDayMinutes) {
      data.status = 'Half Day';
      data.isHalfDay = true;
    } else {
      data.status = 'Present';
      data.isHalfDay = false;
    }
  }

  return data;
};