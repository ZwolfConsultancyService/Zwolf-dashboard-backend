/* =========================================================
   PARSE TIME "14:30" → 870 minutes
========================================================= */

export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;

  const [hours, minutes] = String(timeStr)
    .split(':')
    .map(Number);

  return (hours || 0) * 60 + (minutes || 0);
};

/* =========================================================
   FORMAT 870 minutes → "14:30"
========================================================= */

export const minutesToTime = (totalMinutes) => {
  const safe = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59));
  const h = Math.floor(safe / 60);
  const m = safe % 60;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(
    2,
    '0'
  )}`;
};

/* =========================================================
   START OF DAY (Timezone Safe - IST Fix)
========================================================= */

export const startOfDay = (d = new Date()) => {
  // Agar frontend se 'YYYY-MM-DD' string aa rahi hai
  if (typeof d === 'string' && d.length >= 10) {
    const datePart = d.slice(0, 10); // '2026-10-17'
    const [y, m, day] = datePart.split('-').map(Number);
    // Direct local date create karo taaki UTC shift na ho
    return new Date(y, m - 1, day, 0, 0, 0, 0);
  }

  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const endOfDay = (d = new Date()) => {
  if (typeof d === 'string' && d.length >= 10) {
    const datePart = d.slice(0, 10);
    const [y, m, day] = datePart.split('-').map(Number);
    return new Date(y, m - 1, day, 23, 59, 59, 999);
  }

  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

/* =========================================================
   CHECK MEETING OVERLAP
========================================================= */

export const isOverlapping = (m1Start, m1End, m2Start, m2End) => {
  return m1Start < m2End && m1End > m2Start;
};

/* =========================================================
   GENERATE SUGGESTED SLOTS
========================================================= */

export const generateSuggestedSlots = ({
  startTime,
  duration,
  conflicts,
  bufferMinutes = 5,
  workingEndMinutes = 18 * 60, // 6 PM
}) => {
  const slots = [];
  let current = parseTimeToMinutes(startTime);
  const dur = Number(duration) || 30;

  for (let i = 0; i < 8; i++) {
    current += 30;

    const slotStart = current;
    const slotEnd = slotStart + dur;

    if (slotEnd > workingEndMinutes) break;

    const hasConflict = conflicts.some((c) =>
      isOverlapping(
        slotStart - bufferMinutes,
        slotEnd + bufferMinutes,
        c.startMinutes,
        c.endMinutes
      )
    );

    if (!hasConflict) {
      slots.push(minutesToTime(slotStart));
      if (slots.length >= 3) break;
    }
  }

  return slots;
};