import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import rideRoutes from './routes/rides.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
import safetyRoutes from './routes/safety.js';
import driverRoutes from './routes/drivers.js';
import chatRoutes from './routes/chat.js';
import http from 'node:http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from './models/User.js';
import Ride from './models/Ride.js';
import { setIO } from './realtime.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5172').split(',').map(x => x.trim()).filter(Boolean);
// In development also accept localhost and private-network origins so the app can be tested from a phone on the same Wi-Fi.
const devOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
const originAllowed = origin => !origin || allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && devOrigin.test(origin));
const originCheck = (origin, cb) => originAllowed(origin) ? cb(null, true) : cb(new Error('Origin not allowed by CORS'));
app.use(cors({ origin: originCheck, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 1000, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests. Please wait briefly and try again.' } }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'CivicRide API' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many authentication requests. Try again later.' } }), authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/chat', chatRoutes);
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err?.name === 'CastError') return res.status(400).json({ message: 'Invalid identifier supplied.' });
  if (err?.name === 'ValidationError') return res.status(400).json({ message: Object.values(err.errors || {}).map(e => e.message).join(' ') || 'Invalid data supplied.' });
  if (err?.code === 11000) return res.status(409).json({ message: 'That value is already in use by another account.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed request body.' });
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Server error' });
});

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) { console.error('JWT_SECRET must be set to a random secret of at least 32 characters'); process.exit(1); }
const port = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: originCheck, methods: ['GET','POST'], credentials: false } });
setIO(io);
io.use(async (socket, next) => { try { const token = String(socket.handshake.auth?.token || ''); const payload = jwt.verify(token, process.env.JWT_SECRET); const user = await User.findById(payload.sub); if (!user || (user.accountStatus && user.accountStatus !== 'active')) return next(new Error('Unauthorized')); socket.user = user; next(); } catch { next(new Error('Unauthorized')); } });
io.on('connection', socket => { if(socket.user.role === 'admin') socket.join('admins'); socket.on('ride:join', async ({rideId}={}) => { try { if(!rideId || !mongoose.isValidObjectId(rideId)) return; const ride=await Ride.findById(rideId).select('passenger driver'); if(ride && [String(ride.passenger),String(ride.driver)].includes(String(socket.user._id))) socket.join(`ride:${rideId}`); } catch {} }); socket.on('call:signal', async ({rideId, signal, targetUserId}={}) => { try { if(!rideId || !signal || !mongoose.isValidObjectId(rideId)) return; const ride=await Ride.findById(rideId).select('passenger driver'); if(!ride || ![String(ride.passenger),String(ride.driver)].includes(String(socket.user._id))) return; const target = String(targetUserId || (String(ride.passenger) === String(socket.user._id) ? ride.driver : ride.passenger)); if(![String(ride.passenger),String(ride.driver)].includes(target) || target===String(socket.user._id)) return; io.to(`user:${target}`).emit('call:signal',{rideId,from:{id:String(socket.user._id),name:socket.user.name},signal}); } catch {} }); socket.join(`user:${socket.user._id}`); });
try {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');
  server.listen(port, () => console.log(`CivicRide API listening on ${port}`));
} catch (e) {
  console.error('Startup failed. Check MONGODB_URI.', e.message);
  process.exit(1);
}
