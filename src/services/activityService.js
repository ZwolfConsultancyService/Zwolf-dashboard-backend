// src/services/activityService.js
// Activity logging DISABLED — no-op implementation.
// This keeps all logActivity(...) calls in controllers working
// without writing anything to MongoDB.

export const logActivity = async () => {
  // Intentionally empty. No database writes.
  return null;
};

export default { logActivity };
