import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Sign in required' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Account not found' });
    if (user.accountStatus && user.accountStatus !== 'active') {
      const message = user.accountStatus === 'banned' ? 'This account has been banned. Contact CivicRide support.' : 'This account is suspended. Contact CivicRide support.';
      return res.status(403).json({ message, code: 'ACCOUNT_' + user.accountStatus.toUpperCase() });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired session' });
  }
}

export const allowRoles = (...roles) => (req, res, next) => {
  return roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({
        message: 'Not allowed for this account role',
        actualRole: req.user?.role,
        allowedRoles: roles,
      });
};
