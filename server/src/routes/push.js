import { Router } from 'express';
import PushSubscription from '../models/PushSubscription.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPushToUser } from '../services/push.js';
const router = Router();
router.get('/public-key', (_req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) return res.status(503).json({ message: 'Push notifications are not configured on the server yet.' });
  res.set('Cache-Control', 'no-store'); res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});
router.use(requireAuth);
router.post('/subscribe', async (req, res, next) => {
  try {
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return res.status(400).json({ message: 'A valid browser push subscription is required.' });
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) return res.status(503).json({ message: 'Push notifications are not configured on the server.' });
    await PushSubscription.findOneAndUpdate({ 'subscription.endpoint': sub.endpoint },
      { $set: { user: req.user._id, subscription: { endpoint: sub.endpoint, expirationTime: sub.expirationTime || null, keys: sub.keys }, userAgent: String(req.headers['user-agent'] || '').slice(0, 500) } },
      { upsert: true, new: true, runValidators: true });
    res.status(201).json({ message: 'This device is registered for CivicRide push notifications.' });
  } catch (e) { next(e); }
});
router.delete('/subscribe', async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || '');
    if (!endpoint) return res.status(400).json({ message: 'Subscription endpoint is required.' });
    await PushSubscription.deleteOne({ user: req.user._id, 'subscription.endpoint': endpoint });
    res.json({ message: 'This device has been unsubscribed.' });
  } catch (e) { next(e); }
});
router.post('/test', async (req, res, next) => {
  try {
    const result = await sendPushToUser(req.user._id, { title: 'CivicRide test notification', body: 'Push notifications are connected on this device.', url: '/', tag: 'civicride-test' });
    if (result.skipped) return res.status(503).json({ message: 'Push is not configured. Check VAPID settings on Render.' });
    if (!result.sent) return res.status(404).json({ message: 'No registered device subscription found for this account. Enable notifications on this device first.' });
    res.json({ message: 'Test notification sent to registered device(s). Delivery depends on browser and device settings.' });
  } catch (e) { next(e); }
});
export default router;
