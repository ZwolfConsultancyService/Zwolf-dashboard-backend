
import jwt from 'jsonwebtoken';

import Client from '../models/Client.js';

import { ApiError } from '../utils/ApiError.js';

import { asyncHandler } from '../utils/asyncHandler.js';

const generateClientToken = (clientId) => {
  return jwt.sign(
    {
      id: clientId,
      role: 'client',
      type: 'client',
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '7d',
    }
  );
};

export const clientLogin = asyncHandler(async (req, res) => {
  const { email, portalId, password } = req.body;

  console.log('================ CLIENT LOGIN ================');
  console.log('Email:', email);
  console.log('Portal ID:', portalId);
  console.log('Password received:', !!password);

  /*
   * =========================================================
   * VALIDATION
   * =========================================================
   *
   * Client login:
   *
   * Email + Password
   * OR
   * Portal ID + Password
   */
  if ((!email && !portalId) || !password) {
    throw new ApiError(
      400,
      'Email or Client ID and password are required'
    );
  }

  let client;

  /*
   * =========================================================
   * LOGIN WITH EMAIL
   * =========================================================
   */
  if (email) {
    const normalizedEmail = String(email)
      .trim()
      .toLowerCase();

    console.log('LOGIN METHOD: EMAIL');
    console.log('Normalized Email:', normalizedEmail);

    client = await Client.findOne({
      email: normalizedEmail,
    })
      .select('+password')
      .populate(
        'assignedSales',
        'name email role'
      );
  }

  /*
   * =========================================================
   * LOGIN WITH CLIENT ID
   * =========================================================
   */
  else {
    const normalizedPortalId = String(portalId)
      .trim()
      .toUpperCase();

    console.log('LOGIN METHOD: CLIENT ID');
    console.log(
      'Normalized Portal ID:',
      normalizedPortalId
    );

    client = await Client.findOne({
      portalId: normalizedPortalId,
    })
      .select('+password')
      .populate(
        'assignedSales',
        'name email role'
      );
  }

  /*
   * =========================================================
   * CLIENT NOT FOUND
   * =========================================================
   */
  console.log(
    'Client found:',
    client ? 'YES' : 'NO'
  );

  if (!client) {
    throw new ApiError(
      401,
      'Invalid email/client ID or password'
    );
  }

  /*
   * =========================================================
   * PORTAL STATUS
   * =========================================================
   */
  console.log(
    'Portal active:',
    client.isPortalActive
  );

  if (!client.isPortalActive) {
    throw new ApiError(
      403,
      'Client portal access is disabled'
    );
  }

  /*
   * =========================================================
   * PASSWORD CHECK
   * =========================================================
   */
  console.log(
    'Password exists:',
    !!client.password
  );

  if (!client.password) {
    throw new ApiError(
      401,
      'Client portal password is not set'
    );
  }

  const isMatch = await client.matchPassword(
    password
  );

  console.log(
    'Password match:',
    isMatch
  );

  if (!isMatch) {
    throw new ApiError(
      401,
      'Invalid email/client ID or password'
    );
  }

  /*
   * =========================================================
   * GENERATE TOKEN
   * =========================================================
   */
  const token = generateClientToken(
    client._id
  );

  /*
   * =========================================================
   * REMOVE PASSWORD FROM RESPONSE
   * =========================================================
   */
  const clientObject = client.toObject();

  delete clientObject.password;

  /*
   * =========================================================
   * RESPONSE
   * =========================================================
   */
  res.json({
    success: true,
    token,
    user: {
      ...clientObject,

      role: 'client',

      name: client.clientName,

      clientId: client._id,

      portalId: client.portalId,
    },
  });
});


export const getClientDashboard = async (req, res) => {
  try {
    const client = req.client;

    if (!client) {
      return res.status(401).json({
        success: false,
        message: 'Client not authenticated',
      });
    }

    const totalAmount = Number(client.totalAmount || 0);
    const totalPaid = Number(client.totalPaid || 0);

    const remainingAmount =
      client.remainingAmount !== undefined
        ? Number(client.remainingAmount)
        : Math.max(totalAmount - totalPaid, 0);

    return res.status(200).json({
      success: true,

      data: {
        client: {
          id: client._id,
          clientId: client.clientId,
          name: client.clientName || client.name,
          companyName: client.companyName,
          email: client.email,
          phone: client.phone,
          city: client.city,
          state: client.state,
          serviceRequired: client.serviceRequired,
          description: client.description,
          clientStatus: client.clientStatus,
          followUpDate: client.followUpDate,
        },

        financials: {
          totalAmount,
          totalPaid,
          remainingAmount,
        },

        projects: {
          total: 0,
          active: 0,
          completed: 0,
        },

        tasks: {
          total: 0,
          active: 0,
          completed: 0,
        },
      },
    });
  } catch (error) {
    console.error(
      'GET CLIENT DASHBOARD ERROR:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to load client dashboard',
    });
  }
};