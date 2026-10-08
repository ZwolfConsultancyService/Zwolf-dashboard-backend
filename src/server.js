import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import { initSocket } from '../socket.js';
import { startAutoLogoutJob } from './jobs/autoLogoutJob.js';

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();

  // ✅ HTTP server banao
  const server = http.createServer(app);

  // ✅ Socket.io attach karo
  initSocket(server);

  // ✅ server.listen use karo, app.listen NAHI
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  });
};

start();
// Server start hone ke baad:
startAutoLogoutJob();