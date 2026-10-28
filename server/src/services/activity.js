import Activity from '../models/Activity.js';
import { notifyAdminChanged } from '../realtime.js';
export async function recordActivity({ user, action, entityType='system', entityId='', details='' }) {
  try {
    await Activity.create({ actor: user?._id, actorName: user?.name || 'System', actorRole: user?.role || 'system', action, entityType, entityId: String(entityId || ''), details: String(details || '').slice(0,500) });
    notifyAdminChanged('activity');
  } catch (e) { console.error('Activity log write failed:', e.message); }
}
