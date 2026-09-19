import User from '../models/User.js';
import Client from '../models/Client.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Payment from '../models/Payment.js';
import Attendance from '../models/Attendance.js';
import Notification from '../models/Notification.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const getManagerDashboard = asyncHandler(async (req, res) => {
  const today = startOfDay();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    totalEmployees, salesEmployees, developers,
    totalClients, activeProjects, completedProjects,
    paymentsAll, todayAttendance, recentActivity,
  ] = await Promise.all([
    User.countDocuments({ isActive: true }),
    User.countDocuments({ role: 'sales', isActive: true }),
    User.countDocuments({ role: 'developer', isActive: true }),
    Client.countDocuments(),
    Project.countDocuments({ status: { $in: ['Planning', 'In Progress', 'Testing'] } }),
    Project.countDocuments({ status: 'Completed' }),
    Payment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    Attendance.find({ date: today }).populate('employee', 'name role'),
    Payment.find().sort('-createdAt').limit(5).populate('client', 'clientName'),
  ]);

  const totalReceived = paymentsAll[0]?.total || 0;

  const clientsAgg = await Client.aggregate([
    { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, totalPaid: { $sum: '$totalPaid' }, remaining: { $sum: '$remainingAmount' } } },
  ]);
  const clientTotals = clientsAgg[0] || { totalAmount: 0, totalPaid: 0, remaining: 0 };

  const monthlyRevenue = await Payment.aggregate([
    { $match: { paymentDate: { $gte: new Date(today.getFullYear(), 0, 1) } } },
    { $group: { _id: { $month: '$paymentDate' }, total: { $sum: '$amount' } } },
    { $sort: { _id: 1 } },
  ]);

  const projectStatusDistribution = await Project.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const presentToday = todayAttendance.filter((a) => a.status === 'Present').length;
  const onLeave = todayAttendance.filter((a) => a.status === 'Leave').length;
  const currentlyOnline = todayAttendance.filter((a) => a.loginTime && !a.logoutTime).length;

  res.json({
    success: true,
    data: {
      cards: {
        totalEmployees, salesEmployees, developers,
        totalClients, activeProjects, completedProjects,
        totalRevenue: clientTotals.totalAmount,
        totalReceived: clientTotals.totalPaid,
        totalPending: clientTotals.remaining,
      },
      attendance: {
        present: presentToday,
        absent: totalEmployees - presentToday - onLeave,
        onLeave,
        currentlyOnline,
      },
      charts: {
        monthlyRevenue: monthlyRevenue.map((m) => ({
          month: new Date(2024, m._id - 1, 1).toLocaleString('en', { month: 'short' }),
          revenue: m.total,
        })),
        projectStatus: projectStatusDistribution.map((p) => ({ status: p._id, count: p.count })),
      },
      recentPayments: recentActivity,
    },
  });
});

export const getSalesDashboard = asyncHandler(async (req, res) => {
  const today = startOfDay();
  const salesId = req.user._id;

  const [myClients, confirmedClients, projects] = await Promise.all([
    Client.find({ assignedSales: salesId }),
    Client.countDocuments({ assignedSales: salesId, clientStatus: 'Confirmed' }),
    Project.find({ salesEmployee: salesId }),
  ]);

  const newLeads = myClients.filter((c) => c.clientStatus === 'New Lead').length;
  const followUpsToday = myClients.filter((c) => c.followUpDate && startOfDay(c.followUpDate).getTime() === today.getTime()).length;
  const totalSalesValue = myClients.reduce((s, c) => s + (c.totalAmount || 0), 0);
  const totalReceived = myClients.reduce((s, c) => s + (c.totalPaid || 0), 0);
  const totalPending = myClients.reduce((s, c) => s + (c.remainingAmount || 0), 0);

  const recentClients = await Client.find({ assignedSales: salesId }).sort('-createdAt').limit(5);
  const recentPayments = await Payment.find({ client: { $in: myClients.map((c) => c._id) } })
    .sort('-createdAt').limit(5).populate('client', 'clientName');

  const unreadCount = await Notification.countDocuments({ recipients: salesId, readBy: { $ne: salesId } });

  res.json({
    success: true,
    data: {
      cards: {
        myClients: myClients.length,
        newLeads,
        followUpsToday,
        confirmedClients,
        activeProjects: projects.length,
        totalSalesValue,
        totalReceived,
        totalPending,
      },
      recentClients,
      recentPayments,
      unreadNotifications: unreadCount,
    },
  });
});

export const getDeveloperDashboard = asyncHandler(async (req, res) => {
  const devId = req.user._id;
  const today = startOfDay();

  const [projects, tasks] = await Promise.all([
    Project.find({ developers: devId }).populate('client', 'clientName'),
    Task.find({ assignedDeveloper: devId }),
  ]);

  const completedTasks = tasks.filter((t) => t.status === 'Completed').length;
  const pendingTasks = tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Blocked').length;
  const blockedTasks = tasks.filter((t) => t.status === 'Blocked').length;

  const attendance = await Attendance.findOne({ employee: devId, date: today });
  const dailyStatus = await (await import('../models/DailyStatus.js')).default.findOne({ employee: devId, date: today });
  const unreadCount = await Notification.countDocuments({ recipients: devId, readBy: { $ne: devId } });

  const upcomingDeadlines = await Task.find({
    assignedDeveloper: devId,
    status: { $ne: 'Completed' },
    dueDate: { $gte: today },
  }).sort('dueDate').limit(5).populate('project', 'projectName');

  res.json({
    success: true,
    data: {
      cards: {
        myProjects: projects.length,
        myTasks: tasks.length,
        completedTasks,
        pendingTasks,
        blockedTasks,
      },
      attendance,
      dailyStatus,
      upcomingDeadlines,
      projects,
      unreadNotifications: unreadCount,
    },
  });
});