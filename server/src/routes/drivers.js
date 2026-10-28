import { Router } from 'express';
import multer from 'multer';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { notifyAdminChanged, getIO } from '../realtime.js';
import Ride from '../models/Ride.js';
import { recordActivity } from '../services/activity.js';
import { cloudinaryReady } from '../config/cloudinary.js';
import { REQUIRED_DRIVER_DOCS, MAX_DOCUMENT_BYTES } from '../config/driverDocs.js';
import { sniffFile, uploadDocument, deleteDocument } from '../services/documents.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } });

// Run multer ourselves so size/format problems come back as clear 4xx messages instead of "Server error".
const receiveFile = (req, res, next) => upload.single('file')(req, res, err => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'File is too large. The maximum size is 8 MB.' });
  return res.status(400).json({ message: `Upload failed: ${err.message}` });
});

const publicDocs = user => (user.driverDocuments || []).map(d => ({
  id: d._id, kind: d.kind, status: d.status, uploadedAt: d.uploadedAt, reviewNote: d.reviewNote || '',
  originalName: d.originalName || '', bytes: d.bytes || null
}));

router.use(requireAuth, allowRoles('driver'));

router.get('/documents', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ documents: publicDocs(req.user), required: REQUIRED_DRIVER_DOCS });
});

router.get('/profile', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ vehicle: req.user.vehicle || {} });
});

router.patch('/profile', async (req, res, next) => {
  try {
    const input = req.body?.vehicle || {};
    const text = (v, max) => String(v ?? '').trim().slice(0, max);
    const make = text(input.make, 60), model = text(input.model, 60), color = text(input.color, 40), plateNumber = text(input.plateNumber, 20).toUpperCase();
    const vehicleType = String(input.vehicleType || '');
    const category = String(input.category || '');
    const year = input.year === '' || input.year == null ? undefined : Number(input.year);
    const seats = input.seats === '' || input.seats == null ? undefined : Number(input.seats);
    if (!make || !model || !color || !plateNumber || !['sedan', 'suv', 'hatchback', 'minivan', 'pickup', 'other'].includes(vehicleType) || !['economy', 'comfort', 'xl'].includes(category)) {
      return res.status(400).json({ message: 'Enter make, model, colour, plate number, vehicle type and ride category.' });
    }
    if (year !== undefined && (!Number.isInteger(year) || year < 1980 || year > new Date().getFullYear() + 1)) return res.status(400).json({ message: 'Enter a valid vehicle year.' });
    if (seats !== undefined && (!Number.isInteger(seats) || seats < 1 || seats > 20)) return res.status(400).json({ message: 'Seats must be between 1 and 20.' });
    req.user.vehicle = { make, model, color, plateNumber, vehicleType, category, ...(year !== undefined ? { year } : {}), ...(seats !== undefined ? { seats } : {}) };
    await req.user.save();
    res.set('Cache-Control', 'no-store');
    res.json({ message: 'Vehicle details saved. Admin can review them with your documents.', vehicle: req.user.vehicle });
    await recordActivity({user:req.user,action:'driver_vehicle_updated',entityType:'user',entityId:req.user._id,details:`Vehicle ${make} ${model}, plate ${plateNumber}`});
    notifyAdminChanged('driver-vehicle-updated');
  } catch (e) { next(e); }
});

router.post('/documents', receiveFile, async (req, res, next) => {
  try {
    const kind = String(req.body?.kind || '');
    if (!REQUIRED_DRIVER_DOCS.includes(kind)) return res.status(400).json({ message: 'Choose a valid document type.' });
    if (!req.file) return res.status(400).json({ message: 'Choose a JPG, PNG or PDF file (max 8 MB).' });
    const type = sniffFile(req.file.buffer);
    if (!type) return res.status(400).json({ message: 'That file is not a valid JPG, PNG or PDF. Please upload a clear photo or scan.' });
    if (!cloudinaryReady()) return res.status(503).json({ message: 'Private document storage is not configured. Set the three Cloudinary variables on the server and restart it.' });

    let result;
    try {
      result = await uploadDocument({ buffer: req.file.buffer, userId: req.user._id, kind, type });
    } catch (e) {
      console.error('Cloudinary upload failed:', e?.message || e);
      const detail = process.env.NODE_ENV === 'production' ? '' : ` (${e?.message || 'unknown error'})`;
      return res.status(502).json({ message: `Secure document upload failed. Please try again.${detail}` });
    }

    // One document per type: a new upload replaces the previous one and goes back to "pending".
    const replaced = req.user.driverDocuments.filter(d => d.kind === kind);
    req.user.driverDocuments = req.user.driverDocuments.filter(d => d.kind !== kind);
    req.user.driverDocuments.push({
      kind, publicId: result.public_id, secureUrl: result.secure_url, resourceType: type.resourceType,
      format: result.format || type.ext, mimeType: type.mime, originalName: String(req.file.originalname || '').slice(0, 200),
      bytes: req.file.size, status: 'pending', uploadedAt: new Date()
    });
    await req.user.save();
    replaced.forEach(d => deleteDocument(d));

    res.status(201).json({ message: 'Document uploaded. An admin will review it shortly.', documents: publicDocs(req.user), required: REQUIRED_DRIVER_DOCS });
    await recordActivity({user:req.user,action:'driver_document_uploaded',entityType:'document',entityId:req.user._id,details:`Uploaded ${kind} document for review`});
    notifyAdminChanged('driver-document-uploaded');
  } catch (e) { next(e); }
});


// Explicit availability toggle; drivers are discoverable only after approval and while online.
router.patch('/availability', async (req, res, next) => {
  try {
    if (req.user.driverStatus !== 'approved') return res.status(403).json({ message: 'Your driver account must be approved first.' });
    const online = req.body?.online;
    if (typeof online !== 'boolean') return res.status(400).json({ message: 'online must be true or false.' });
    req.user.driverOnline = online;
    if (!online) req.user.currentLocation = { ...(req.user.currentLocation?.toObject?.() || req.user.currentLocation || {}), updatedAt: new Date() };
    await req.user.save();
    res.set('Cache-Control', 'no-store');
    res.json({ message: online ? 'You are online and can receive nearby requests.' : 'You are offline and will not receive new requests.', driverOnline: req.user.driverOnline });
    await recordActivity({user:req.user,action:online?'driver_went_online':'driver_went_offline',entityType:'user',entityId:req.user._id,details:online?'Driver enabled location sharing':'Driver disabled location sharing'});
    notifyAdminChanged('driver-availability');
  } catch (e) { next(e); }
});

router.patch('/location', async (req, res, next) => {
  try {
    if (req.user.driverStatus !== 'approved' || !req.user.driverOnline) return res.status(403).json({ message: 'Go online with an approved driver account to share location.' });
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng), accuracy = Number(req.body?.accuracy);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ message: 'Valid coordinates are required.' });
    req.user.currentLocation = { lat, lng, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? Math.min(accuracy, 10000) : undefined, updatedAt: new Date() };
    await req.user.save();
    const activeRide=await Ride.findOne({driver:req.user._id,status:{$in:['accepted','arriving','in_progress']}}).select('_id');
    if(activeRide) getIO()?.to(`ride:${activeRide._id}`).emit('ride:location',{rideId:String(activeRide._id),driverId:String(req.user._id),lat,lng,at:new Date().toISOString()});
    res.json({ message: 'Location updated.' });
    getIO()?.to('admins').emit('driver:location',{driverId:String(req.user._id),lat,lng,updatedAt:new Date().toISOString()});
  } catch (e) { next(e); }
});

export default router;
