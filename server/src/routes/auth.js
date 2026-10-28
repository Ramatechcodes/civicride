import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import { sendOtpEmail } from '../services/email.js';
import { sendSmsOtp } from '../services/sms.js';
import { requireAuth } from '../middleware/auth.js';
import { recordActivity } from '../services/activity.js';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const tokenFor = user => jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
const safeUser = user => ({ id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, driverStatus: user.driverStatus, driverReviewNote: user.driverReviewNote || '', driverOnline: Boolean(user.driverOnline), vehicle: user.vehicle || {}, walletBalance: Number(user.walletBalance || 0), rideCoins: Number(user.rideCoins || 0), rating: user.rating });

router.post('/otp/request', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const purpose = req.body.purpose === 'reset' ? 'reset' : 'register';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
    await Otp.deleteMany({ email, purpose });
    const code = String(crypto.randomInt(100000, 1000000));
    await Otp.create({ email, purpose, codeHash: hash(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    try { await sendOtpEmail(email, code); }
    catch (e) { await Otp.deleteMany({ email, purpose }); throw e; }
    res.json({ message: 'Verification code sent if the email is deliverable. Check inbox and spam.' });
  } catch (e) { next(e); }
});

router.post('/register/verify', async (req, res, next) => {
  try {
    const { name, email: rawEmail, phone, password, role, code } = req.body;
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!name || !email || !password || !code || !['passenger', 'driver'].includes(role)) return res.status(400).json({ message: 'Name, email, password, role and OTP are required' });
    if (String(password).length < 10) return res.status(400).json({ message: 'Use a password of at least 10 characters' });
    const otp = await Otp.findOne({ email, purpose: 'register' }).sort({ createdAt: -1 });
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= 5) return res.status(400).json({ message: 'Code expired or unavailable. Request a new code.' });
    if (otp.codeHash !== hash(String(code))) {
      otp.attempts += 1; await otp.save();
      return res.status(400).json({ message: 'Incorrect verification code' });
    }
    if (await User.findOne({ email })) return res.status(409).json({ message: 'An account with this email already exists' });
    const user = await User.create({
      name: String(name).trim(), email, phone: phone || undefined, role,
      passwordHash: await bcrypt.hash(password, 12), emailVerified: true,
      driverStatus: role === 'driver' ? 'pending' : 'not_applicable'
    });
    await Otp.deleteMany({ email });
    await recordActivity({user,action:'account_registered',entityType:'user',entityId:user._id,details:`New ${role} account registered`});
    res.status(201).json({ token: tokenFor(user), user: safeUser(user), message: role === 'driver' ? 'Account created. Driver approval is pending.' : 'Account created.' });
  } catch (e) { next(e); }
});

router.post('/google', async (req, res, next) => {
  try {
    const { credential, role } = req.body;
    if (!credential || !['passenger', 'driver'].includes(role)) return res.status(400).json({ message: 'Google credential and role are required' });
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.email || !p.email_verified) return res.status(401).json({ message: 'Google email is not verified' });
    let user = await User.findOne({ email: p.email.toLowerCase() });
    if (!user) user = await User.create({
      name: p.name || 'CivicRide user', email: p.email.toLowerCase(), googleSub: p.sub,
      emailVerified: true, role, driverStatus: role === 'driver' ? 'pending' : 'not_applicable'
    });
    res.json({ token: tokenFor(user), user: safeUser(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user?.passwordHash || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
      return res.status(401).json({ message: 'Email or password is incorrect' });
    }
    await recordActivity({user,action:'user_login',entityType:'user',entityId:user._id,details:`${user.role} signed in`});
    res.json({ token: tokenFor(user), user: safeUser(user) });
  } catch (e) { next(e); }
});

router.patch('/change-password', requireAuth, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 10) return res.status(400).json({ message: 'Use a new password of at least 10 characters.' });
    if (currentPassword === newPassword) return res.status(400).json({ message: 'Your new password must be different from your current password.' });
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ message: 'Your current password is incorrect or this account uses an external sign-in provider.' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    await recordActivity({ user, action: 'password_changed', entityType: 'user', entityId: user._id, details: 'User changed account password' });
    res.json({ message: 'Password updated successfully. Use the new password next time you sign in.' });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: safeUser(req.user) }));

// SMS endpoint deliberately refuses until a real provider adapter is configured.
router.post('/otp/sms', async (req, res, next) => {
  try {
    const phone = String(req.body.phone || '').trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return res.status(400).json({ message: 'Use international phone format, e.g. +2348012345678' });
    const code = String(crypto.randomInt(100000, 1000000));
    await sendSmsOtp(phone, code);
    res.json({ message: 'SMS OTP request accepted' });
  } catch (e) { next(e); }
});

export default router;
