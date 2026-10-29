import { Router } from 'express';
import Ride from '../models/Ride.js';
import User from '../models/User.js';
import crypto from 'node:crypto';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { getIO, notifyAdminChanged } from '../realtime.js';
import { recordActivity } from '../services/activity.js';

const router = Router();
router.use(requireAuth);

router.post('/', allowRoles('passenger'), async (req, res, next) => {
  try {
    const { pickup, destination, category = 'economy', paymentMethod = 'cash' } = req.body;
    const preferredDriverId = req.body?.preferredDriverId ? String(req.body.preferredDriverId) : '';
    if (preferredDriverId && !/^[a-f0-9]{24}$/i.test(preferredDriverId)) return res.status(400).json({ message: 'Selected driver is invalid. Refresh the nearby driver list.' });
    if (!pickup?.address || !destination?.address) return res.status(400).json({ message: 'Pickup and destination are required' });
    if (!['economy', 'comfort', 'xl'].includes(category)) return res.status(400).json({ message: 'Invalid ride category' });
    if (!['cash', 'flutterwave'].includes(paymentMethod)) return res.status(400).json({ message: 'Invalid payment method' });
    const validPoint = p => Number.isFinite(Number(p?.lat)) && Number(p.lat) >= -90 && Number(p.lat) <= 90 && Number.isFinite(Number(p?.lng)) && Number(p.lng) >= -180 && Number(p.lng) <= 180;
    if (!validPoint(pickup) || !validPoint(destination)) return res.status(400).json({ message: 'Select both pickup and destination from map search so CivicRide can calculate the route.' });
    const rad = x => x * Math.PI / 180;
    const dLat = rad(destination.lat - pickup.lat), dLng = rad(destination.lng - pickup.lng);
    const a = Math.sin(dLat/2)**2 + Math.cos(rad(pickup.lat))*Math.cos(rad(destination.lat))*Math.sin(dLng/2)**2;
    const straightKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    let distanceKm = Math.max(1, straightKm * 1.3);
    let durationMin = Math.max(4, Math.round(distanceKm / 25 * 60));
    // Use OSRM road routing for a better estimate; fall back if the service is unavailable.
    try {
      const routeUrl = `https://router.project-osrm.org/route/v1/driving/${Number(pickup.lng)},${Number(pickup.lat)};${Number(destination.lng)},${Number(destination.lat)}?overview=false&alternatives=false&steps=false`;
      const routeResponse = await fetch(routeUrl, { signal: AbortSignal.timeout(4500) });
      const routeData = await routeResponse.json();
      const route = routeData?.code === 'Ok' ? routeData.routes?.[0] : null;
      if (route && Number.isFinite(route.distance) && route.distance > 0) { distanceKm = Math.max(1, route.distance / 1000); durationMin = Math.max(1, Math.round(route.duration / 60)); }
    } catch { /* fallback estimate remains available when public routing is unavailable */ }
    const rates = { economy: { base: 500, perKm: 180 }, comfort: { base: 800, perKm: 250 }, xl: { base: 1200, perKm: 320 } }[category];
    const estimatedFare = Math.round((rates.base + distanceKm * rates.perKm) / 50) * 50;
    let preferredDriver = null;
    if (preferredDriverId) {
      preferredDriver = await User.findOne({ _id: preferredDriverId, role: 'driver', driverStatus: 'approved', driverOnline: true, 'vehicle.category': category, 'currentLocation.updatedAt': { $gte: new Date(Date.now() - 2 * 60 * 1000) } }).select('_id currentLocation').lean();
      if (!preferredDriver) return res.status(409).json({ message: 'That driver is no longer available. Please select another nearby driver.' });
      const p=preferredDriver.currentLocation; if(!Number.isFinite(p?.lat)||!Number.isFinite(p?.lng)) return res.status(409).json({message:'The selected driver location is no longer available.'});
      const dlat=rad(p.lat-pickup.lat),dlng=rad(p.lng-pickup.lng),x=Math.sin(dlat/2)**2+Math.cos(rad(pickup.lat))*Math.cos(rad(p.lat))*Math.sin(dlng/2)**2;
      if (6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)) > 15) return res.status(409).json({message:'That driver is now outside the pickup search radius.'});
    }
    const ride = await Ride.create({ passenger: req.user._id, preferredDriver: preferredDriver?._id || null, pickup, destination, category, paymentMethod, estimatedFare, distanceKm: Number(distanceKm.toFixed(2)), durationMin, activity: [{ action: 'ride_requested', actor: req.user._id, note: 'Passenger requested a ride' }] });
    await recordActivity({ user: req.user, action: 'ride_requested', entityType: 'ride', entityId: ride._id, details: `${pickup.address} to ${destination.address}` });
    // Notify only approved, online drivers in the same category with a fresh location near pickup.
    const drivers = await User.find({ role: 'driver', driverStatus: 'approved', driverOnline: true, 'vehicle.category': category, 'currentLocation.updatedAt': { $gte: new Date(Date.now() - 2 * 60 * 1000) }, currentLocation: { $exists: true } }).select('_id currentLocation').limit(500).lean();
    let nearby = drivers.filter(d => { const p=d.currentLocation; if(!Number.isFinite(p?.lat)||!Number.isFinite(p?.lng)) return false; const dl=rad(p.lat-pickup.lat), dn=rad(p.lng-pickup.lng); const x=Math.sin(dl/2)**2+Math.cos(rad(pickup.lat))*Math.cos(rad(p.lat))*Math.sin(dn/2)**2; return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)) <= 15; });
    if (preferredDriver) nearby = nearby.filter(d => String(d._id) === String(preferredDriver._id));
    const io = getIO(); for (const d of nearby) io?.to(`user:${d._id}`).emit('ride:request', { rideId: String(ride._id), category, pickup: { address: pickup.address, lat: pickup.lat, lng: pickup.lng }, estimatedFare, distanceKm: ride.distanceKm, preferred: Boolean(preferredDriver) });
    notifyAdminChanged('ride-requested');
    res.status(201).json({ ride, nearbyDrivers: nearby.length, message: nearby.length ? 'Ride requested. Nearby drivers have been notified.' : 'Ride requested. We will keep looking for an available driver.' });
  } catch (e) { next(e); }
});


router.patch('/location', allowRoles('driver'), async (req, res, next) => {
  try {
    if (req.user.driverStatus !== 'approved') return res.status(403).json({ message: 'Only approved drivers can share trip location' });
    const lat = Number(req.body.lat), lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return res.status(400).json({ message: 'Valid latitude and longitude are required' });
    const activeRide = await Ride.exists({ driver: req.user._id, status: { $in: ['accepted', 'arriving', 'in_progress'] } });
    if (!activeRide) return res.status(403).json({ message: 'Location sharing is enabled only during an active trip' });
    const accuracy = Number(req.body.accuracy);
    await User.findByIdAndUpdate(req.user._id, { $set: { currentLocation: { lat, lng, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? Math.min(accuracy, 10000) : undefined, updatedAt: new Date() } } });
    const ride = await Ride.findOne({ driver: req.user._id, status: { $in: ['accepted', 'arriving', 'in_progress'] } })
      .select('_id passenger status pickup destination distanceKm progressMilestoneNotified');
    if (ride) {
      getIO()?.to(`ride:${ride._id}`).emit('ride:location', { rideId: String(ride._id), driverId: String(req.user._id), lat, lng, at: new Date().toISOString() });
      // Send only milestone push updates so a subscribed passenger can see progress
      // while the browser/app is in the background without receiving a notification
      // on every GPS ping.
      if (ride.status === 'in_progress' && ride.passenger) {
        const rad = n => n * Math.PI / 180;
        const p = ride.destination || {};
        if (Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))) {
          const dLat = rad(Number(p.lat) - lat), dLng = rad(Number(p.lng) - lng);
          const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(Number(p.lat))) * Math.sin(dLng / 2) ** 2;
          const remainingKm = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
          const totalKm = Number(ride.distanceKm);
          if (Number.isFinite(totalKm) && totalKm > 0) {
            const progress = Math.max(0, Math.min(99, Math.round(((totalKm - remainingKm) / totalKm) * 100)));
            const milestone = progress >= 90 ? 90 : progress >= 75 ? 75 : progress >= 50 ? 50 : progress >= 25 ? 25 : 0;
            if (milestone > Number(ride.progressMilestoneNotified || 0)) {
              const claimed = await Ride.findOneAndUpdate(
                { _id: ride._id, $or: [{ progressMilestoneNotified: { $lt: milestone } }, { progressMilestoneNotified: { $exists: false } }] },
                { $set: { progressMilestoneNotified: milestone } },
                { new: true }
              ).select('_id passenger');
              if (claimed) {
                const { sendPushToUser } = await import('../services/push.js');
                const visualBar = `${'█'.repeat(Math.round(milestone / 10))}${'░'.repeat(10 - Math.round(milestone / 10))}`;
                const body = remainingKm < 0.1
                  ? `Trip progress ${visualBar} ${milestone}% · Your driver is very close to your destination.`
                  : `Trip progress ${visualBar} ${milestone}% · About ${remainingKm.toFixed(1)} km remaining (straight-line GPS estimate).`;
                await sendPushToUser(ride.passenger, {
                  title: 'CivicRide live trip progress',
                  body,
                  url: '/',
                  tag: `civicride-trip-progress-${ride._id}`,
                  renotify: false
                }).catch(() => {});
              }
            }
          }
        }
      }
    }
    getIO()?.to('admins').emit('driver:location',{driverId:String(req.user._id),lat,lng,updatedAt:new Date().toISOString()});
    res.json({ message: 'Location updated' });
  } catch (e) { next(e); }
});

router.patch('/passenger-location', allowRoles('passenger'), async(req,res,next)=>{
  try {
    const lat=Number(req.body?.lat),lng=Number(req.body?.lng),accuracy=Number(req.body?.accuracy);
    if(!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lng)||lng < -180||lng > 180)return res.status(400).json({message:'Valid coordinates are required.'});
    const ride=await Ride.findOne({passenger:req.user._id,status:{$in:['accepted','arriving','in_progress']}}).sort({updatedAt:-1});
    if(!ride)return res.status(403).json({message:'Passenger location is shared only during an active assigned ride.'});
    ride.passengerLocation={lat,lng,accuracy:Number.isFinite(accuracy)&&accuracy>=0?Math.min(accuracy,10000):undefined,updatedAt:new Date()};
    await ride.save();getIO()?.to(`ride:${ride._id}`).emit('ride:passenger-location',{rideId:String(ride._id),lat,lng,at:new Date().toISOString()});
    res.json({message:'Location shared with your assigned driver.'});
  }catch(e){next(e)}
});

router.get('/nearby-drivers', allowRoles('passenger'), async (req, res, next) => {
  try {
    const lat=Number(req.query.lat), lng=Number(req.query.lng), category=String(req.query.category||'economy');
    if(!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lng)||lng < -180||lng > 180) return res.status(400).json({message:'Valid pickup coordinates are required.'});
    if(!['economy','comfort','xl'].includes(category)) return res.status(400).json({message:'Invalid vehicle category.'});
    const drivers=await User.find({role:'driver',driverStatus:'approved',driverOnline:true,'vehicle.category':category,'currentLocation.updatedAt':{$gte:new Date(Date.now()-2*60*1000)}}).select('name rating vehicle currentLocation').limit(500).lean();
    const rad=x=>x*Math.PI/180; const result=drivers.map(d=>{const p=d.currentLocation||{};const dl=rad((p.lat||0)-lat),dn=rad((p.lng||0)-lng);const a=Math.sin(dl/2)**2+Math.cos(rad(lat))*Math.cos(rad(p.lat||0))*Math.sin(dn/2)**2;const km=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));return {...d,distanceKm:Number(km.toFixed(1))};}).filter(d=>Number.isFinite(d.currentLocation?.lat)&&Number.isFinite(d.currentLocation?.lng)&&d.distanceKm<=15).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,30).map(d=>({_id:d._id,name:d.name,rating:d.rating,vehicle:d.vehicle,distanceKm:d.distanceKm,location:d.currentLocation}));
    res.set('Cache-Control','no-store');res.json({drivers:result,updatedAt:new Date().toISOString()});
  } catch(e){next(e);}
});

router.get('/mine', async (req, res, next) => {
  try {
    const filter = req.user.role === 'driver' ? { driver: req.user._id } : { passenger: req.user._id };
    res.json({ rides: await Ride.find(filter).sort({ createdAt: -1 }).limit(100).populate('driver', 'name rating vehicle').populate('passenger', 'name') });
  } catch (e) { next(e); }
});

router.get('/available', allowRoles('driver'), async (req, res, next) => {
  try {
    if(req.user.driverStatus !== 'approved') return res.json({rides:[]});
    const filter={ status:'requested', driver:null, category:req.user.vehicle?.category || 'economy', $or:[{preferredDriver:null},{preferredDriver:{$exists:false}},{preferredDriver:req.user._id}] };
    let rides=await Ride.find(filter).sort({createdAt:1}).limit(100).populate('passenger','name rating').lean();
    const loc=req.user.currentLocation; if(req.user.driverOnline && Number.isFinite(loc?.lat)&&Number.isFinite(loc?.lng)) { const rad=x=>x*Math.PI/180; rides=rides.filter(r=>{const p=r.pickup||{};if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng))return false;const dl=rad(p.lat-loc.lat),dn=rad(p.lng-loc.lng),a=Math.sin(dl/2)**2+Math.cos(rad(loc.lat))*Math.cos(rad(p.lat))*Math.sin(dn/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))<=15;}); }
    res.set('Cache-Control','no-store'); res.json({ rides });
  } catch (e) { next(e); }
});

router.patch('/:id/accept', allowRoles('driver'), async (req, res, next) => {
  try {
    if (req.user.driverStatus !== 'approved') return res.status(403).json({ message: 'Driver account must be approved before accepting rides' });
    const ride = await Ride.findOneAndUpdate(
      { _id: req.params.id, status: 'requested', driver: null },
      { $set: { driver: req.user._id, status: 'accepted', acceptedAt: new Date() } },
      { new: true }
    );
    if (!ride) return res.status(409).json({ message: 'Ride is no longer available' });
    await recordActivity({ user: req.user, action: 'ride_accepted', entityType: 'ride', entityId: ride._id, details: `Driver accepted ride ${ride._id}` });
    getIO()?.to(`ride:${ride._id}`).emit('ride:updated', { rideId: String(ride._id), status: ride.status });
    notifyAdminChanged('ride-accepted');
    const { sendPushToUser } = await import('../services/push.js');
    await sendPushToUser(ride.passenger, { title: 'Your driver accepted the ride', body: 'Your CivicRide driver accepted your request.', url: '/', tag: `ride-${ride._id}-accepted` }).catch(() => {});
    res.json({ ride });
  } catch (e) { next(e); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = {
      driver: { accepted: ['arriving', 'cancelled'], arriving: ['in_progress', 'cancelled'], in_progress: ['completed'] },
      passenger: { requested: ['cancelled'], accepted: ['cancelled'], arriving: ['cancelled'] }
    };
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    const owner = (req.user.role === 'driver' && String(ride.driver) === String(req.user._id)) ||
      (req.user.role === 'passenger' && String(ride.passenger) === String(req.user._id));
    if (!owner) return res.status(403).json({ message: 'This ride does not belong to your account' });
    if (!(allowed[req.user.role]?.[ride.status] || []).includes(status)) return res.status(400).json({ message: 'Invalid status transition' });
    ride.status = status;
    if (status === 'in_progress') ride.startedAt = new Date();
    if (status === 'completed') { ride.completedAt = new Date(); ride.finalFare = ride.estimatedFare; ride.coinsAwarded = Math.max(1, Math.floor(Number(ride.finalFare || ride.estimatedFare) / 1000)); ride.passengerLocation = undefined; await User.findByIdAndUpdate(ride.passenger, { $inc: { rideCoins: ride.coinsAwarded } }); }
    if (status === 'cancelled') ride.passengerLocation = undefined;
    ride.activity.push({ action: `ride_${status}`, actor: req.user._id, note: `Ride status changed to ${status}`, at: new Date() });
    await ride.save();
    await recordActivity({ user: req.user, action: `ride_${status}`, entityType: 'ride', entityId: ride._id, details: `${ride.pickup.address} to ${ride.destination.address}` });
    getIO()?.to(`ride:${ride._id}`).emit('ride:updated', { rideId: String(ride._id), status: ride.status, driver: ride.driver });
    notifyAdminChanged(`ride-${status}`);
    const { sendPushToUser } = await import('../services/push.js');
    const recipientId = String(ride.passenger) === String(req.user._id) ? ride.driver : ride.passenger;
    const titles = { arriving: 'Your driver is approaching', in_progress: 'Your CivicRide trip has started', completed: 'Your CivicRide trip is complete', cancelled: 'CivicRide trip cancelled' };
    if (recipientId && titles[status]) await sendPushToUser(recipientId, { title: titles[status], body: `${ride.pickup.address} to ${ride.destination.address}`, url: '/', tag: `ride-${ride._id}-${status}` }).catch(() => {});
    res.json({ ride, coinsAwarded: ride.coinsAwarded || 0 });
  } catch (e) { next(e); }
});

router.post('/:id/share', allowRoles('passenger'), async (req, res, next) => {
  try {
    const ride = await Ride.findOne({ _id: req.params.id, passenger: req.user._id, status: { $in: ['accepted', 'arriving', 'in_progress'] } });
    if (!ride) return res.status(404).json({ message: 'Active ride not found' });
    const raw = crypto.randomBytes(32).toString('hex');
    ride.shareTokenHash = crypto.createHash('sha256').update(raw).digest('hex'); ride.shareEnabled = true; await ride.save();
    res.json({ shareUrl: `${process.env.PUBLIC_APP_URL || process.env.CLIENT_URL?.split(',')[0] || 'http://localhost:5173'}/share/${raw}`, message: 'Share link created. Anyone with this link can see limited trip status; share it only with a trusted contact.' });
  } catch (e) { next(e); }
});

router.post('/:id/rating', allowRoles('passenger'), async (req, res, next) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be from 1 to 5' });
    const ride = await Ride.findOne({ _id: req.params.id, passenger: req.user._id, status: 'completed' });
    if (!ride) return res.status(404).json({ message: 'Completed ride not found' });
    ride.rating = rating; ride.review = String(req.body.review || '').slice(0, 500);
    await ride.save();
    res.json({ ride });
  } catch (e) { next(e); }
});
export default router;
