import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from './src/models/User.js';
import Client from './src/models/Client.js';

let io;
const onlineUsers = new Map();     // userId -> socketCount
const onlineClients = new Map();   // clientId -> socketCount

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'https://zwolf-dashboard.onrender.com',
        'https://www.praveen.cloud',
        'https://praveen.cloud',
      ],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      let user = await User.findById(decoded.id).select('-password');
      if (user) {
        socket.userId = String(user._id);
        socket.userType = 'employee';
        socket.userRole = user.role;
        return next();
      }

      let client = await Client.findById(decoded.id).select('-password');
      if (client) {
        socket.clientId = String(client._id);
        socket.userType = 'client';
        socket.userRole = 'client';
        return next();
      }

      return next(new Error('User not found'));
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.userType === 'employee') {
      socket.join(`user:${socket.userId}`);

      const c = onlineUsers.get(socket.userId) || 0;
      onlineUsers.set(socket.userId, c + 1);

      socket.on('disconnect', () => {
        const n = (onlineUsers.get(socket.userId) || 1) - 1;
        if (n <= 0) onlineUsers.delete(socket.userId);
        else onlineUsers.set(socket.userId, n);
      });
    } else {
      socket.join(`client:${socket.clientId}`);

      const c = onlineClients.get(socket.clientId) || 0;
      onlineClients.set(socket.clientId, c + 1);

      socket.on('disconnect', () => {
        const n = (onlineClients.get(socket.clientId) || 1) - 1;
        if (n <= 0) onlineClients.delete(socket.clientId);
        else onlineClients.set(socket.clientId, n);
      });
    }
  });

  return io;
};

export const getIO = () => io;

export const isUserOnline = (userId) => onlineUsers.has(String(userId));
export const isClientOnline = (clientId) => onlineClients.has(String(clientId));

export const emitToUser = (userId, event, data) => {
  if (io) io.to(`user:${userId}`).emit(event, data);
};

export const emitToClient = (clientId, event, data) => {
  if (io) io.to(`client:${clientId}`).emit(event, data);
};