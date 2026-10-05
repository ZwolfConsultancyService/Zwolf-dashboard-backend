import jwt from 'jsonwebtoken';

import Client from '../models/Client.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const protectClient = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new ApiError(401, 'Client authentication required');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'client') {
      throw new ApiError(401, 'Invalid client token');
    }

    const client = await Client.findById(decoded.id);

    if (!client) {
      throw new ApiError(401, 'Client not found');
    }

    if (!client.isPortalActive) {
      throw new ApiError(403, 'Client portal account has been disabled');
    }

    req.client = client;

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(401, 'Client token failed');
  }
});