let ioInstance;
export const setIO = io => { ioInstance = io; };
export const getIO = () => ioInstance;
export const notifyAdminChanged = (reason = 'updated') => ioInstance?.to('admins').emit('admin:changed', { reason, at: new Date().toISOString() });
// Tell one signed-in user (for example a driver) that something about their account changed.
export const notifyUser = (userId, event = 'driver:updated', payload = {}) => ioInstance?.to(`user:${userId}`).emit(event, { ...payload, at: new Date().toISOString() });
