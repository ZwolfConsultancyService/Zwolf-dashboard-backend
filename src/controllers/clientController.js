import Client from '../models/Client.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getPagination,
  paginatedResponse,
} from '../utils/pagination.js';
import { logActivity } from '../services/activityService.js';

/*
|--------------------------------------------------------------------------
| Generate Unique Client Portal ID
|--------------------------------------------------------------------------
*/

const generatePortalId = async () => {
  let portalId;
  let exists = true;

  while (exists) {
    const randomPart = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    portalId = `ZWOLF-CL-${randomPart}`;

    exists = await Client.exists({
      portalId,
    });
  }

  return portalId;
};

/*
|--------------------------------------------------------------------------
| Build Client Filter
|--------------------------------------------------------------------------
*/

const buildClientFilter = (req) => {
  const filter = {};

  const {
    search,
    status,
    assignedSales,
    paymentStatus,
  } = req.query;

  /*
   * Sales can only see their own clients.
   */

  if (req.user.role === 'sales') {
    filter.assignedSales = req.user._id;
  } else if (assignedSales) {
    filter.assignedSales = assignedSales;
  }

  /*
   * Search
   */

  if (search) {
    filter.$or = [
      {
        clientName: {
          $regex: search,
          $options: 'i',
        },
      },
      {
        companyName: {
          $regex: search,
          $options: 'i',
        },
      },
      {
        phone: {
          $regex: search,
          $options: 'i',
        },
      },
      {
        email: {
          $regex: search,
          $options: 'i',
        },
      },
      {
        portalId: {
          $regex: search,
          $options: 'i',
        },
      },
    ];
  }

  /*
   * Status filter
   */

  if (status) {
    filter.clientStatus = status;
  }

  /*
   * Payment filter
   */

  if (paymentStatus === 'pending') {
    filter.remainingAmount = {
      $gt: 0,
    };
  }

  if (paymentStatus === 'paid') {
    filter.remainingAmount = 0;
  }

  return filter;
};

/*
|--------------------------------------------------------------------------
| Get All Clients
|--------------------------------------------------------------------------
|
| GET /api/clients
|
*/

export const getClients = asyncHandler(
  async (req, res) => {
    const {
      page,
      limit,
      skip,
    } = getPagination(req.query);

    const filter = buildClientFilter(req);

    const [data, total] = await Promise.all([
      Client.find(filter)
        .populate(
          'assignedSales',
          'name email role'
        )
        .select('-password')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),

      Client.countDocuments(filter),
    ]);

    res.json({
      success: true,
      ...paginatedResponse(
        data,
        total,
        page,
        limit
      ),
    });
  }
);

/*
|--------------------------------------------------------------------------
| Create Client
|--------------------------------------------------------------------------
|
| POST /api/clients
|
*/

export const createClient = asyncHandler(
  async (req, res) => {
    const payload = {
      ...req.body,
    };

    /*
     * --------------------------------------------------
     * CLIENT PORTAL ID
     * --------------------------------------------------
     *
     * Example:
     * ZWOLF-CL-A8K92P
     */

    if (!payload.portalId) {
      payload.portalId =
        await generatePortalId();
    }

    /*
     * --------------------------------------------------
     * CLIENT PORTAL PASSWORD
     * --------------------------------------------------
     */

    if (
      !payload.password ||
      !String(payload.password).trim()
    ) {
      throw new ApiError(
        400,
        'Client portal password is required'
      );
    }

    payload.password =
      String(payload.password).trim();

    /*
     * Basic password length validation
     */

    if (payload.password.length < 6) {
      throw new ApiError(
        400,
        'Client portal password must be at least 6 characters'
      );
    }

    /*
     * Portal active by default
     */

    payload.isPortalActive = true;

    /*
     * --------------------------------------------------
     * SALES ASSIGNMENT
     * --------------------------------------------------
     *
     * Sales user automatically becomes assigned sales.
     *
     * Manager can select sales from frontend.
     */

    if (req.user.role === 'sales') {
      payload.assignedSales =
        req.user._id;
    }

    if (!payload.assignedSales) {
      throw new ApiError(
        400,
        'assignedSales is required'
      );
    }

    /*
     * --------------------------------------------------
     * PAYMENT CALCULATION
     * --------------------------------------------------
     */

    payload.totalPaid = 0;

    payload.totalAmount =
      Number(payload.totalAmount) || 0;

    payload.remainingAmount =
      payload.totalAmount;

    /*
     * --------------------------------------------------
     * CREATE CLIENT
     * --------------------------------------------------
     *
     * Client model pre-save hook will hash password.
     */

    const client =
      await Client.create(payload);

    /*
     * --------------------------------------------------
     * SAFE RESPONSE
     * --------------------------------------------------
     *
     * Never return password.
     */

    const populated =
      await Client.findById(client._id)
        .populate(
          'assignedSales',
          'name email role'
        )
        .select('-password');

    /*
     * --------------------------------------------------
     * ACTIVITY LOG
     * --------------------------------------------------
     */

    await logActivity({
      user: req.user._id,
      action: 'CREATE',
      module: 'Client',
      description:
        `Created client ${client.clientName}`,
      referenceId: client._id,
    });

    res.status(201).json({
      success: true,
      data: populated,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Single Client
|--------------------------------------------------------------------------
|
| GET /api/clients/:id
|
*/

export const getClient = asyncHandler(
  async (req, res) => {
    const client =
      await Client.findById(req.params.id)
        .populate(
          'assignedSales',
          'name email role'
        )
        .select('-password');

    if (!client) {
      throw new ApiError(
        404,
        'Client not found'
      );
    }

    /*
     * Sales can only see their own clients.
     */

    if (
      req.user.role === 'sales' &&
      (
        !client.assignedSales ||
        !client.assignedSales._id.equals(
          req.user._id
        )
      )
    ) {
      throw new ApiError(
        403,
        'You are not authorized to view this client'
      );
    }

    res.json({
      success: true,
      data: client,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Update Client
|--------------------------------------------------------------------------
|
| PUT /api/clients/:id
|
*/

export const updateClient = asyncHandler(
  async (req, res) => {
    const client =
      await Client.findById(req.params.id);

    if (!client) {
      throw new ApiError(
        404,
        'Client not found'
      );
    }

    /*
     * --------------------------------------------------
     * SALES AUTHORIZATION
     * --------------------------------------------------
     */

    if (
      req.user.role === 'sales' &&
      (
        !client.assignedSales ||
        !client.assignedSales.equals(
          req.user._id
        )
      )
    ) {
      throw new ApiError(
        403,
        'You are not authorized to edit this client'
      );
    }

    /*
     * --------------------------------------------------
     * ALLOWED CLIENT FIELDS
     * --------------------------------------------------
     */

    const allowed = [
      'clientName',
      'companyName',
      'email',
      'phone',
      'alternatePhone',
      'address',
      'city',
      'state',
      'serviceRequired',
      'description',
      'clientStatus',
      'followUpDate',
      'totalAmount',
    ];

    allowed.forEach((field) => {
      if (
        req.body[field] !== undefined
      ) {
        client[field] =
          req.body[field];
      }
    });

    /*
     * --------------------------------------------------
     * MANAGER CAN CHANGE SALES PERSON
     * --------------------------------------------------
     */

    if (
      req.user.role === 'manager' &&
      req.body.assignedSales
    ) {
      client.assignedSales =
        req.body.assignedSales;
    }

    /*
     * --------------------------------------------------
     * CLIENT PORTAL ACTIVE STATUS
     * --------------------------------------------------
     *
     * Only manager can manually enable/disable portal.
     */

    if (
      req.user.role === 'manager' &&
      req.body.isPortalActive !== undefined
    ) {
      client.isPortalActive =
        Boolean(
          req.body.isPortalActive
        );
    }

    /*
     * --------------------------------------------------
     * CLIENT PORTAL PASSWORD
     * --------------------------------------------------
     *
     * Password is NOT returned anywhere.
     *
     * Client model pre-save hook will hash it.
     */

    if (
      req.body.password !== undefined
    ) {
      const password =
        String(
          req.body.password
        ).trim();

      /*
       * Blank password means:
       * Keep old password.
       */

      if (password) {
        if (password.length < 6) {
          throw new ApiError(
            400,
            'Client portal password must be at least 6 characters'
          );
        }

        client.password =
          password;

        /*
         * If a new password is assigned,
         * portal automatically becomes active.
         */

        client.isPortalActive =
          true;
      }
    }

    /*
     * --------------------------------------------------
     * PAYMENT CALCULATION
     * --------------------------------------------------
     */

    client.totalAmount =
      Number(client.totalAmount) || 0;

    client.totalPaid =
      Number(client.totalPaid) || 0;

    client.remainingAmount =
      Math.max(
        0,
        client.totalAmount -
          client.totalPaid
      );

    /*
     * --------------------------------------------------
     * SAVE
     * --------------------------------------------------
     */

    await client.save();

    /*
     * --------------------------------------------------
     * SAFE RESPONSE
     * --------------------------------------------------
     */

    const populated =
      await Client.findById(client._id)
        .populate(
          'assignedSales',
          'name email role'
        )
        .select('-password');

    /*
     * --------------------------------------------------
     * ACTIVITY LOG
     * --------------------------------------------------
     */

    await logActivity({
      user: req.user._id,
      action: 'UPDATE',
      module: 'Client',
      description:
        `Updated client ${client.clientName}`,
      referenceId: client._id,
    });

    res.json({
      success: true,
      data: populated,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Delete Client
|--------------------------------------------------------------------------
|
| DELETE /api/clients/:id
|
*/

export const deleteClient = asyncHandler(
  async (req, res) => {
    const client =
      await Client.findById(req.params.id);

    if (!client) {
      throw new ApiError(
        404,
        'Client not found'
      );
    }

    /*
     * Sales can only delete their own clients.
     */

    if (
      req.user.role === 'sales' &&
      (
        !client.assignedSales ||
        !client.assignedSales.equals(
          req.user._id
        )
      )
    ) {
      throw new ApiError(
        403,
        'You are not authorized to delete this client'
      );
    }

    await client.deleteOne();

    /*
     * Activity log
     */

    await logActivity({
      user: req.user._id,
      action: 'DELETE',
      module: 'Client',
      description:
        `Deleted client ${client.clientName}`,
      referenceId: client._id,
    });

    res.json({
      success: true,
      message: 'Client deleted',
    });
  }
);

/*
|--------------------------------------------------------------------------
| Add Client Note
|--------------------------------------------------------------------------
|
| POST /api/clients/:id/notes
|
*/

export const addClientNote =
  asyncHandler(
    async (req, res) => {
      const client =
        await Client.findById(
          req.params.id
        );

      if (!client) {
        throw new ApiError(
          404,
          'Client not found'
        );
      }

      if (
        !req.body.text ||
        !String(req.body.text).trim()
      ) {
        throw new ApiError(
          400,
          'Note text is required'
        );
      }

      /*
       * Sales can only add notes
       * to their own clients.
       */

      if (
        req.user.role === 'sales' &&
        (
          !client.assignedSales ||
          !client.assignedSales.equals(
            req.user._id
          )
        )
      ) {
        throw new ApiError(
          403,
          'Not authorized'
        );
      }

      client.notes.push({
        text:
          String(
            req.body.text
          ).trim(),
        addedBy:
          req.user._id,
      });

      await client.save();

      /*
       * Safe populated response
       */

      const populated =
        await Client.findById(
          client._id
        )
          .populate(
            'assignedSales',
            'name email role'
          )
          .populate(
            'notes.addedBy',
            'name email role'
          )
          .select('-password');

      res.json({
        success: true,
        data: populated,
      });
    }
  );