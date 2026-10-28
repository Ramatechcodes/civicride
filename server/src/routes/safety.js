import { Router } from 'express';
import crypto from 'node:crypto';
import Ride from '../models/Ride.js';
import Incident from '../models/Incident.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { recordActivity } from '../services/activity.js';
import { notifyAdminChanged } from '../realtime.js';
const router = Router();
router.post('/sos', requireAuth, async (req, res, next) => {
  try {
    const { rideId, note = '', lat, lng } = req.body;
    if (!rideId) return res.status(400).json({ message: 'rideId is required' });
    const ride = await Ride.findById(rideId);
    if (!ride || ![String(ride.passenger), String(ride.driver)].includes(String(req.user._id)) || !['accepted','arriving','in_progress'].includes(ride.status)) return res.status(404).json({ message: 'Active ride not found for this account' });
    const location = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Number(lat) >= -90 && Number(lat) <= 90 && Number(lng) >= -180 && Number(lng) <= 180 ? { lat: Number(lat), lng: Number(lng) } : undefined;
    const incident = await Incident.create({ ride: ride._id, reporter: req.user._id, kind: 'sos', note: String(note).slice(0,1000), location });
    ride.sosEvents.push({ note: String(note).slice(0,500), ...(location || {}) }); await ride.save();
    await recordActivity({user:req.user,action:'sos_triggered',entityType:'safety',entityId:incident._id,details:`SOS triggered for ride ${ride._id}`}); notifyAdminChanged('sos');
    res.status(201).json({ message: 'SOS recorded and visible to CivicRide administrators. This app does not automatically contact emergency services; call local emergency services directly if you are in immediate danger.', incidentId: incident._id });
  } catch(e) { next(e); }
});
router.get('/share/:token', async (req, res, next) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(String(req.params.token)).digest('hex');
    const ride = await Ride.findOne({ shareTokenHash: tokenHash, shareEnabled: true }).populate('driver','name vehicle currentLocation rating');
    if (!ride || !['accepted','arriving','in_progress'].includes(ride.status)) return res.status(404).json({ message: 'Trip share link is invalid or expired' });
    res.set('Cache-Control','no-store');
    res.json({ status: ride.status, pickup: ride.pickup.address, destination: ride.destination.address, pickupPoint: ride.pickup, destinationPoint: ride.destination, driver: ride.driver ? { name: ride.driver.name, vehicle: ride.driver.vehicle, rating: ride.driver.rating, location: ride.driver.currentLocation?.updatedAt && Date.now() - new Date(ride.driver.currentLocation.updatedAt).getTime() < 120000 ? ride.driver.currentLocation : null } : null, updatedAt: ride.updatedAt });
  } catch(e) { next(e); }
});
router.post('/share/:rideId/disable', requireAuth, allowRoles('passenger'), async (req,res,next) => {
 try { const ride = await Ride.findOneAndUpdate({ _id:req.params.rideId, passenger:req.user._id },{$set:{shareEnabled:false,shareTokenHash:null}},{new:true}); if(!ride) return res.status(404).json({message:'Ride not found'}); res.json({message:'Trip sharing disabled'}); } catch(e){next(e)}
});
export default router;
