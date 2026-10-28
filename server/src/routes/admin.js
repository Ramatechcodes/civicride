import { Router } from 'express';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Incident from '../models/Incident.js';
import mongoose from 'mongoose';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { notifyAdminChanged, notifyUser } from '../realtime.js';
import { cloudinaryReady } from '../config/cloudinary.js';
import { REQUIRED_DRIVER_DOCS } from '../config/driverDocs.js';
import { fetchDocumentFile } from '../services/documents.js';
import Activity from '../models/Activity.js';
import { recordActivity } from '../services/activity.js';

const router = Router();
const DRIVER_FIELDS = 'name email phone role driverStatus driverReviewNote driverReviewedAt driverDocuments vehicle rating createdAt currentLocation';
const KIND_LABEL = k => k.replaceAll('_', ' ');

// Shape a driver for the admin console: always includes `role`, never exposes storage ids/URLs,
// and says exactly what is still missing before the driver can be approved.
function shapeDriver(d) {
  const obj = typeof d.toObject === 'function' ? d.toObject() : d;
  const docs = (obj.driverDocuments || []).map(x => ({
    _id: x._id, kind: x.kind, status: x.status, resourceType: x.resourceType, format: x.format, mimeType: x.mimeType,
    originalName: x.originalName, bytes: x.bytes, uploadedAt: x.uploadedAt, reviewedAt: x.reviewedAt, reviewNote: x.reviewNote
  }));
  const v = obj.vehicle || {};
  const vehicleComplete = Boolean(v.make && v.model && v.plateNumber);
  const missingDocuments = REQUIRED_DRIVER_DOCS.filter(k => !docs.some(x => x.kind === k));
  const unapprovedDocuments = REQUIRED_DRIVER_DOCS.filter(k => !docs.some(x => x.kind === k && x.status === 'approved'));
  return { ...obj, role: 'driver', driverDocuments: docs, missingDocuments, unapprovedDocuments, vehicleComplete, readyForApproval: unapprovedDocuments.length === 0 && vehicleComplete };
}

router.use(requireAuth, allowRoles('admin'));

router.get('/overview', async (_req, res, next) => {
  try {
    const [users, driversPending, driversApproved, rides, activeRides, completedRides, revenue] = await Promise.all([
      User.countDocuments(), User.countDocuments({ role: 'driver', driverStatus: 'pending' }),
      User.countDocuments({ role: 'driver', driverStatus: 'approved' }), Ride.countDocuments(),
      Ride.countDocuments({ status: { $in: ['accepted', 'arriving', 'in_progress'] } }),
      Ride.countDocuments({ status: 'completed' }),
      Ride.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: { $ifNull: ['$finalFare', '$estimatedFare'] } } } }])
    ]);
    res.json({ stats: { users, driversPending, driversApproved, rides, activeRides, completedRides, grossCompletedFare: revenue[0]?.total || 0 } });
  } catch (e) { next(e); }
});

// One dashboard request keeps live admin updates efficient and avoids exhausting the API rate limit.
router.get('/dashboard', async (_req, res, next) => {
  try {
    const [users, driversPending, driversApproved, driversOnline, rideCount, activeRides, completedRides, revenue, drivers, rides, incidents, allUsers, activity] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'driver', driverStatus: 'pending' }),
      User.countDocuments({ role: 'driver', driverStatus: 'approved' }),
      User.countDocuments({ role: 'driver', driverStatus: 'approved', driverOnline: true, 'currentLocation.updatedAt': { $gte: new Date(Date.now() - 120000) } }),
      Ride.countDocuments(),
      Ride.countDocuments({ status: { $in: ['accepted', 'arriving', 'in_progress'] } }),
      Ride.countDocuments({ status: 'completed' }),
      Ride.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: { $ifNull: ['$finalFare', '$estimatedFare'] } } } }]),
      User.find({ role: 'driver' }).select(DRIVER_FIELDS).sort({ createdAt: -1 }).limit(300).lean(),
      Ride.find().sort({ createdAt: -1 }).limit(500).populate('passenger', 'name email phone').populate('driver', 'name email phone driverStatus').lean(),
      Incident.find().sort({ createdAt: -1 }).limit(500).populate('reporter', 'name email phone').populate({ path: 'ride', select: 'status pickup destination passenger driver' }).lean(),
      User.find().select('name email phone role driverStatus driverOnline walletBalance rideCoins accountStatus accountStatusReason emailVerified phoneVerified createdAt').sort({ createdAt: -1 }).limit(500).lean(),
      Activity.find().sort({ createdAt: -1 }).limit(200).lean()
    ]);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({
      stats: { users, driversPending, driversApproved, driversOnline, rides: rideCount, activeRides, completedRides, grossCompletedFare: revenue[0]?.total || 0 },
      drivers: drivers.map(shapeDriver), rides, incidents, users: allUsers, activity, serverTime: new Date().toISOString()
    });
  } catch (e) { next(e); }
});


router.get('/activity', async (_req,res,next)=>{ try { const activity=await Activity.find().sort({createdAt:-1}).limit(500).lean(); res.set('Cache-Control','no-store'); res.json({activity}); } catch(e){next(e);} });

router.get('/drivers', async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : undefined;
    const filter = { role: 'driver', ...(status ? { driverStatus: status } : {}) };
    res.json({ drivers: (await User.find(filter).select(DRIVER_FIELDS).sort({ createdAt: -1 }).limit(300).lean()).map(shapeDriver) });
  } catch (e) { next(e); }
});


router.patch('/drivers/:id/decision', async (req, res, next) => {
  try {
    const { decision, note = '' } = req.body || {};
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid driver ID.' });
    if (!['approved', 'rejected', 'pending'].includes(decision)) return res.status(400).json({ message: 'Decision must be approved, rejected or pending.' });
    const driver = await User.findOne({ _id: req.params.id, role: 'driver' });
    if (!driver) return res.status(404).json({ message: 'Driver not found. Confirm that this account exists and has the driver role.' });

    if (decision === 'approved') {
      const shaped = shapeDriver(driver);
      if (shaped.unapprovedDocuments.length) {
        return res.status(409).json({
          message: `Driver cannot be approved yet. Documents not approved: ${shaped.unapprovedDocuments.map(KIND_LABEL).join(', ')}.`,
          missingDocuments: shaped.unapprovedDocuments
        });
      }
      if (!shaped.vehicleComplete) return res.status(409).json({ message: 'Driver cannot be approved yet. The driver has not saved vehicle details (make, model and plate number).' });
    }

    driver.driverStatus = decision;
    driver.driverReviewNote = String(note).trim().slice(0, 500);
    driver.driverReviewedAt = new Date();
    driver.driverReviewedBy = req.user._id;
    await driver.save();
    await recordActivity({user:req.user,action:`driver_review_${decision}`,entityType:'document',entityId:driver._id,details:`Admin reviewed driver ${driver.name}: ${decision}${driver.driverReviewNote?` — ${driver.driverReviewNote}`:''}`});

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ message: `Driver status updated to ${decision}.`, driver: { _id: driver._id, name: driver.name, email: driver.email, phone: driver.phone, driverStatus: driver.driverStatus, driverReviewNote: driver.driverReviewNote, driverReviewedAt: driver.driverReviewedAt } });
    notifyAdminChanged('driver-review-updated');
    notifyUser(driver._id, 'driver:updated', { reason: 'decision', driverStatus: decision });
  } catch (error) { next(error); }
});

// Stream a private document to an authenticated admin. The browser never receives a Cloudinary URL.
router.get('/drivers/:id/documents/:documentId/file', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.documentId)) return res.status(400).json({ message: 'Invalid driver or document ID' });
    const driver = await User.findOne({ _id: req.params.id, role: 'driver' });
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    const doc = driver.driverDocuments.id(req.params.documentId);
    if (!doc) return res.status(404).json({ message: 'Document not found. The driver may have replaced it — refresh the page.' });
    if (!cloudinaryReady()) return res.status(503).json({ message: 'Cloudinary credentials are not configured on the server' });
    let file;
    try { file = await fetchDocumentFile(doc); }
    catch (e) {
      console.error(`Document fetch failed for driver ${driver._id} doc ${doc._id}:`, e.message);
      return res.status(502).json({ message: 'The document could not be retrieved from private storage. Ask the driver to upload it again.' });
    }
    const safeName = String(doc.originalName || `${doc.kind}.${file.ext || 'bin'}`).replace(/[^\w.\- ]/g, '_');
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': file.mime, 'Content-Disposition': `inline; filename="${safeName}"`, 'X-Content-Type-Options': 'nosniff' });
    res.send(file.buffer);
  } catch (e) { next(e); }
});

router.patch('/drivers/:id/documents/:documentId', async (req, res, next) => {
  try {
    const { status, note = '' } = req.body || {};
    if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ message: 'Document status must be approved, rejected or pending' });
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.documentId)) return res.status(400).json({ message: 'Invalid driver or document ID' });
    const driver = await User.findOne({ _id: req.params.id, role: 'driver' });
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    const doc = driver.driverDocuments.id(req.params.documentId);
    if (!doc) return res.status(404).json({ message: 'Document not found. The driver may have replaced it — refresh the page.' });
    doc.status = status;
    doc.reviewNote = String(note).trim().slice(0, 500);
    doc.reviewedAt = new Date();
    doc.reviewedBy = req.user._id;
    // An already-approved driver whose document is later rejected/reset must be re-reviewed.
    let driverReverted = false;
    if (status !== 'approved' && driver.driverStatus === 'approved') {
      driver.driverStatus = 'pending';
      driver.driverReviewNote = `Re-review needed: ${KIND_LABEL(doc.kind)} document ${status}.`;
      driver.driverReviewedAt = new Date();
      driver.driverReviewedBy = req.user._id;
      driverReverted = true;
    }
    await driver.save();
    res.set('Cache-Control', 'no-store');
    res.json({ message: `Document marked ${status}${driverReverted ? '. Driver moved back to pending review.' : ''}`, document: { id: doc._id, kind: doc.kind, status: doc.status, reviewNote: doc.reviewNote }, driverReverted });
    notifyAdminChanged('document-review-updated');
    notifyUser(driver._id, 'driver:updated', { reason: 'document', kind: doc.kind, status });
  } catch (e) { next(e); }
});

router.get('/rides', async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const filter = ['requested','accepted','arriving','in_progress','completed','cancelled'].includes(status) ? { status } : {};
    res.json({ rides: await Ride.find(filter).sort({ createdAt: -1 }).limit(500).populate('passenger', 'name email phone').populate('driver', 'name email phone driverStatus') });
  } catch (e) { next(e); }
});

router.get('/users', async (_req, res, next) => {
  try {
    const users = await User.find()
      .select('name email phone role driverStatus accountStatus accountStatusReason emailVerified phoneVerified createdAt')
      .sort({ createdAt: -1 }).limit(500).lean();
    res.set('Cache-Control', 'no-store');
    res.json({ users });
  } catch (e) { next(e); }
});

// Suspend, ban, or restore any non-admin account. Admin accounts are protected
// from user-management actions so a compromised admin cannot silently lock out peers.
router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const { status, reason = '' } = req.body || {};
    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({ message: 'Status must be active, suspended or banned' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target.role === 'admin') return res.status(403).json({ message: 'Admin accounts cannot be suspended or banned from this screen' });
    target.accountStatus = status;
    target.accountStatusReason = String(reason).trim().slice(0, 500);
    target.accountStatusChangedAt = new Date();
    target.accountStatusChangedBy = req.user._id;
    await target.save();
    await recordActivity({user:req.user,action:`account_${status}`,entityType:'user',entityId:target._id,details:`Admin changed ${target.name} account status to ${status}`});
    res.set('Cache-Control', 'no-store');
    res.json({ message: `Account ${status === 'active' ? 'restored' : status}`, user: { _id: target._id, name: target.name, role: target.role, accountStatus: target.accountStatus, accountStatusReason: target.accountStatusReason } });
  } catch (e) { next(e); }
});

// Permanent account deletion is restricted to non-admin accounts and requires
// explicit confirmation in the client. Ride/incident history is retained for audit.
router.delete('/users/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (String(target._id) === String(req.user._id)) return res.status(403).json({ message: 'You cannot delete your own admin account' });
    if (target.role === 'admin') return res.status(403).json({ message: 'Admin accounts cannot be deleted from user management' });
    await User.deleteOne({ _id: target._id });
    await recordActivity({user:req.user,action:'account_deleted',entityType:'user',entityId:target._id,details:`Admin deleted non-admin account ${target.name}`});
    // Cancel active trips involving the deleted account; preserve completed history.
    const activeStatuses = ['requested', 'accepted', 'arriving', 'in_progress'];
    await Ride.updateMany({ passenger: target._id, status: { $in: activeStatuses } }, { $set: { status: 'cancelled' } });
    await Ride.updateMany({ driver: target._id, status: { $in: activeStatuses } }, { $set: { driver: null, status: 'cancelled' } });
    res.set('Cache-Control', 'no-store');
    res.json({ message: 'User account deleted. Historical ride and incident records were retained.' });
  } catch (e) { next(e); }
});


// List SOS and safety incidents for the admin console.
router.get('/incidents', async (_req, res, next) => {
  try {
    const incidents = await Incident.find()
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('reporter', 'name email phone')
      .populate({ path: 'ride', select: 'status pickup destination passenger driver' });
    res.set('Cache-Control', 'no-store');
    res.json({ incidents });
  } catch (e) { next(e); }
});

// Allow admins to acknowledge or resolve an incident, with an audit timestamp/user.
router.patch('/incidents/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!['open', 'acknowledged', 'resolved'].includes(status)) {
      return res.status(400).json({ message: 'Status must be open, acknowledged or resolved' });
    }
    const update = {
      status,
      ...(status === 'resolved' ? { resolvedAt: new Date(), resolvedBy: req.user._id } : {})
    };
    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).populate('reporter', 'name email phone');
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    res.set('Cache-Control', 'no-store');
    res.json({ incident, message: `Incident marked ${status}` });
  } catch (e) { next(e); }
});

export default router;
