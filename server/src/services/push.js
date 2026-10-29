import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
let configured = false;
function configure() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true; return true;
}
export async function sendPushToUser(userId, payload) {
  if (!configure() || !userId) return { sent: 0, skipped: true };
  const docs = await PushSubscription.find({ user: userId }).lean(); let sent = 0;
  for (const doc of docs) {
    try {
      await webpush.sendNotification(doc.subscription, JSON.stringify(payload), { TTL: 3600 });
      sent++; await PushSubscription.updateOne({ _id: doc._id }, { $set: { lastSuccessAt: new Date() } });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) await PushSubscription.deleteOne({ _id: doc._id });
      else console.error('Web push delivery failed:', error.statusCode || error.message);
    }
  }
  return { sent, skipped: false };
}
