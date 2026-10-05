import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import clientMessageRoutes from './routes/clientMessageRoutes.js';
import clientAuthRoutes from './routes/clientAuthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import dailyStatusRoutes from './routes/dailyStatusRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import guideRoutes from './routes/guideRoutes.js';
import detailRoutes from './routes/detailRoutes.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import seoRoutes from "./routes/seoRoutes.js";
import "./jobs/seoExpiryJob.js";
import clientProjectRoutes from './routes/clientProjectRoutes.js';
import pushRoutes from './routes/pushRoutes.js';
import clientRequestRoutes from './routes/clientRequestRoutes.js';
const app = express();

app.use(helmet());
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://zwolf-dashboard.onrender.com",
  "https://www.praveen.cloud",
  "https://praveen.cloud",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Postman/server-to-server requests ke liye
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'API is healthy', timestamp: new Date() });
});

app.use('/api/auth', authRoutes);
app.use(
  '/api/client-auth',
  clientAuthRoutes
);
app.use(
  '/api/client-portal/projects',
  clientProjectRoutes
);
app.use('/api/employees', employeeRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/daily-status', dailyStatusRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/client-messages', clientMessageRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/client-requests', clientRequestRoutes);

// app.use('/api/activity-logs', activityRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/guides', guideRoutes);
app.use('/api/details', detailRoutes);
app.use(
  "/api/seo",
  seoRoutes
);
app.use(notFound);
app.use(errorHandler);

export default app;

