import Project from '../models/Project.js';
import Payment from '../models/Payment.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paginatedResponse } from '../utils/pagination.js';

// ---------------------------------------------
// GET CLIENT PROJECTS
// GET /api/client-portal/projects
// ---------------------------------------------
export const getClientProjects = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const filter = {
    client: req.client._id,
  };

  const [data, total] = await Promise.all([
    Project.find(filter)
      .populate(
        'salesEmployee',
        'name email phone profileImage'
      )
      .populate(
        'developers',
        'name email profileImage'
      )
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),

    Project.countDocuments(filter),
  ]);

  res.json({
    success: true,
    ...paginatedResponse(data, total, page, limit),
  });
});

// ---------------------------------------------
// GET SINGLE CLIENT PROJECT
// GET /api/client-portal/projects/:id
// ---------------------------------------------
export const getClientProject = asyncHandler(async (req, res) => {
  const project = await Project.findOne({
    _id: req.params.id,
    client: req.client._id,
  })
    .populate(
      'salesEmployee',
      'name email phone profileImage'
    )
    .populate(
      'developers',
      'name email profileImage'
    );

  if (!project) {
    throw new ApiError(404, 'Project not found');
  }

  res.json({
    success: true,
    data: project,
  });
});

// ---------------------------------------------
// CLIENT PROJECT DASHBOARD SUMMARY
// GET /api/client-portal/projects/summary
// ---------------------------------------------
export const getClientProjectSummary = asyncHandler(async (req, res) => {
  const projects = await Project.find({
    client: req.client._id,
  }).select(
    'projectName status progress startDate deadline priority'
  );

  const totalProjects = projects.length;

  const activeProjects = projects.filter(
    (project) =>
      !['Completed', 'Cancelled'].includes(project.status)
  ).length;

  const completedProjects = projects.filter(
    (project) => project.status === 'Completed'
  ).length;

  const cancelledProjects = projects.filter(
    (project) => project.status === 'Cancelled'
  ).length;

  const averageProgress =
    totalProjects > 0
      ? Math.round(
          projects.reduce(
            (sum, project) =>
              sum + Number(project.progress || 0),
            0
          ) / totalProjects
        )
      : 0;

  const currentProject =
    projects
      .filter(
        (project) =>
          !['Completed', 'Cancelled'].includes(project.status)
      )
      .sort(
        (a, b) =>
          Number(b.progress || 0) - Number(a.progress || 0)
      )[0] || null;

  res.json({
    success: true,
    data: {
      totalProjects,
      activeProjects,
      completedProjects,
      cancelledProjects,
      averageProgress,
      currentProject,
    },
  });
});

// ---------------------------------------------
// CLIENT PAYMENTS BREAKDOWN
// GET /api/client-portal/projects/payments/breakdown
// ---------------------------------------------
// ---------------------------------------------
// CLIENT PAYMENTS BREAKDOWN
// GET /api/client-portal/projects/payments/breakdown
// ---------------------------------------------
export const getClientPaymentsBreakdown = async (req, res) => {
  try {
    const clientId = req.client._id;

    /* =====================================================
       GET ALL PROJECTS OF THIS CLIENT
    ===================================================== */

    const projects = await Project.find({
      client: clientId,
    })
      .select(
        'projectName technology status priority totalAmount deadline progress'
      )
      .sort({ createdAt: -1 })
      .lean();

    /* =====================================================
       GET ALL PAYMENTS OF THIS CLIENT
    ===================================================== */

    const payments = await Payment.find({
      client: clientId,
    })
      .populate('project', 'projectName')
      .sort({ paymentDate: -1 })
      .lean();

    /* =====================================================
       DEBUG LOGS
    ===================================================== */

    console.log('========== PAYMENTS BREAKDOWN DEBUG ==========');
    console.log('Client ID:', String(clientId));
    console.log('Projects Count:', projects.length);
    console.log(
      'Projects:',
      projects.map((p) => ({
        name: p.projectName,
        totalAmount: p.totalAmount,
        _id: String(p._id),
      }))
    );
    console.log('Payments Count:', payments.length);
    console.log(
      'Payments:',
      payments.map((p) => ({
        amount: p.amount,
        projectId: p.project?._id
          ? String(p.project._id)
          : null,
        projectName: p.project?.projectName || null,
        _id: String(p._id),
      }))
    );
    console.log('==============================================');

    /* =====================================================
       GROUP PAYMENTS BY PROJECT
    ===================================================== */

    const paymentsByProject = {};

    payments.forEach((p) => {
      /* Payments project ID — object ya string dono handle karo */
      let projId = 'unassigned';

      if (p.project) {
        if (typeof p.project === 'object' && p.project._id) {
          projId = String(p.project._id);
        } else {
          projId = String(p.project);
        }
      }

      if (!paymentsByProject[projId]) {
        paymentsByProject[projId] = {
          paid: 0,
          paymentCount: 0,
        };
      }

      paymentsByProject[projId].paid += Number(p.amount || 0);
      paymentsByProject[projId].paymentCount += 1;
    });

    console.log(
      'PAYMENTS BY PROJECT:',
      paymentsByProject
    );

    /* =====================================================
       BUILD PER-PROJECT BREAKDOWN
    ===================================================== */

    let totalAmount = 0;
    let totalPaid = 0;

    const projectBreakdown = projects.map((proj) => {
      const projId = String(proj._id);

      /* Project ka total — 0 ya number dono handle karo */
      const projTotal = Number(proj.totalAmount || 0);

      /* Is project ke saare payments ka sum */
      const projPaid =
        paymentsByProject[projId]?.paid || 0;

      const projRemaining = Math.max(
        projTotal - projPaid,
        0
      );

      const projProgress =
        projTotal > 0
          ? Math.min(
              100,
              Math.round((projPaid / projTotal) * 100)
            )
          : 0;

      totalAmount += projTotal;
      totalPaid += projPaid;

      return {
        _id: proj._id,
        projectName: proj.projectName,
        technology: proj.technology,
        status: proj.status,
        priority: proj.priority,
        deadline: proj.deadline,
        projectProgress: proj.progress,
        totalAmount: projTotal,
        paidAmount: projPaid,
        remainingAmount: projRemaining,
        paymentProgress: projProgress,
        paymentCount:
          paymentsByProject[projId]?.paymentCount || 0,
      };
    });

    /* =====================================================
       UNASSIGNED PAYMENTS
    ===================================================== */

    const unassignedPaid =
      paymentsByProject['unassigned']?.paid || 0;

    totalPaid += unassignedPaid;

    const totalRemaining = Math.max(
      totalAmount - totalPaid,
      0
    );

    /* =====================================================
       PAYMENT HISTORY
    ===================================================== */

    const paymentHistory = payments.slice(0, 50).map((p) => ({
      _id: p._id,
      amount: p.amount,
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
      transactionId: p.transactionId,
      notes: p.notes,
      projectName: p.project?.projectName || 'Unassigned',
      projectId: p.project?._id || null,
    }));

    /* =====================================================
       FINAL SUMMARY LOG
    ===================================================== */

    console.log('FINAL SUMMARY:', {
      totalAmount,
      totalPaid,
      remainingAmount: totalRemaining,
      totalProjects: projects.length,
      totalPayments: payments.length,
    });

    console.log('==============================================');

    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.json({
      success: true,
      data: {
        summary: {
          totalAmount,
          totalPaid,
          remainingAmount: totalRemaining,
          totalProjects: projects.length,
          totalPayments: payments.length,
          overallProgress:
            totalAmount > 0
              ? Math.min(
                  100,
                  Math.round((totalPaid / totalAmount) * 100)
                )
              : 0,
        },
        projects: projectBreakdown,
        paymentHistory,
      },
    });
  } catch (error) {
    console.error(
      'getClientPaymentsBreakdown error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payments breakdown',
      error: error.message,
    });
  }
};