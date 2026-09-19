import { ApiError } from '../utils/ApiError.js';

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'Not authenticated'));
  }
  if (!roles.includes(req.user.role)) {
    return next(
      new ApiError(403, 'You are not authorized to perform this action')
    );
  }
  next();
};