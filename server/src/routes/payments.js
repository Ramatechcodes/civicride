import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import Ride from '../models/Ride.js';
import User from '../models/User.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { recordActivity } from '../services/activity.js';
import { notifyAdminChanged } from '../realtime.js';

const router = Router();
const base = () => process.env.FLW_BASE_URL || 'https://api.flutterwave.com/v3';
const webhookHash = () => process.env.FLW_WEBHOOK_SECRET_HASH || process.env.FLW_SECRET_HASH || '';
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
// tx_ref is "CR-<rideId>-<uuid>", so the ride can always be recovered from it.
const rideIdFromRef = ref => String(ref || '').match(/^CR-([a-f0-9]{24})-/i)?.[1];

async function verifyWithFlutterwave(transactionId) {
  const response = await fetch(`${base()}/transactions/${encodeURIComponent(transactionId)}/verify`, { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status !== 'success' || data.data?.status !== 'successful') return null;
  return data.data;
}

// Mark a ride paid only if the provider-confirmed transaction matches the ride exactly.
async function applyVerifiedPayment(tx, { passengerId } = {}) {
  const rideId = tx.meta?.rideId || rideIdFromRef(tx.tx_ref);
  if (!rideId) return { ok: false, message: 'Payment reference does not belong to a ride.' };
  const ride = await Ride.findOne({ _id: rideId, ...(passengerId ? { passenger: passengerId } : {}) });
  if (!ride) return { ok: false, message: 'Verified payment does not match this ride' };
  if (ride.paymentTxRef && ride.paymentTxRef !== tx.tx_ref) return { ok: false, message: 'Payment reference does not match this ride' };
  if (Number(tx.amount) < Number(ride.estimatedFare) || tx.currency !== 'NGN') return { ok: false, message: 'Verified payment does not match this ride' };
  if (ride.paymentStatus !== 'paid') {
    ride.paymentStatus = 'paid';
    ride.paymentTransactionId = String(tx.id);
    ride.paymentTxRef = tx.tx_ref;
    await ride.save();
    await recordActivity({user: await User.findById(ride.passenger),action:'ride_payment_success',entityType:'payment',entityId:ride._id,details:`Flutterwave ride payment NGN ${ride.estimatedFare}`});
    notifyAdminChanged('ride-payment');
  }
  return { ok: true, ride };
}


async function applyWalletTopup(tx, userId) {
  const ref=String(tx.tx_ref||'');
  if(!ref.startsWith('CRW-') || tx.currency!=='NGN' || !Number.isFinite(Number(tx.amount)) || Number(tx.amount)<500) return {ok:false,message:'Verified transaction does not match a valid wallet top-up.'};
  const existing=await WalletTransaction.findOne({reference:ref});
  if(!existing) return {ok:false,message:'Wallet top-up reference was not found.'};
  if(userId && String(existing.user)!==String(userId)) return {ok:false,message:'Wallet transaction does not belong to this account.'};
  if(existing.status==='success') return {ok:true,balanceAfter:existing.balanceAfter,alreadyApplied:true};
  if(Number(tx.amount)<Number(existing.amount)) return {ok:false,message:'Verified amount is less than the requested top-up.'};
  const user=await User.findById(existing.user); if(!user) return {ok:false,message:'Wallet owner no longer exists.'};
  // Claim first so duplicate browser redirects/webhooks cannot credit the same reference twice.
  const claimed=await WalletTransaction.findOneAndUpdate({_id:existing._id,status:'pending'},{ $set:{status:'processing',providerTransactionId:String(tx.id)}},{new:true});
  if(!claimed) { const latest=await WalletTransaction.findById(existing._id); if(latest?.status==='success')return {ok:true,balanceAfter:latest.balanceAfter,alreadyApplied:true}; return {ok:false,message:'This wallet top-up is already being processed. If your balance does not update, contact CivicRide support with the transaction reference.'}; }
  user.walletBalance=Number((Number(user.walletBalance||0)+Number(existing.amount)).toFixed(2)); await user.save();
  claimed.balanceAfter=user.walletBalance; claimed.status='success'; await claimed.save();
  await recordActivity({user,action:'wallet_topup_success',entityType:'payment',entityId:claimed._id,details:`Flutterwave wallet top-up NGN ${existing.amount}`});
  notifyAdminChanged('wallet-topup');
  return {ok:true,balanceAfter:user.walletBalance};
}

router.get('/wallet/history', requireAuth, async(req,res,next)=>{try{const transactions=await WalletTransaction.find({user:req.user._id}).sort({createdAt:-1}).limit(100).select('type amount currency status reference balanceAfter createdAt').lean();res.set('Cache-Control','no-store');res.json({transactions});}catch(e){next(e)}});

router.post('/wallet/initialize', requireAuth, async (req,res,next)=>{
  try {
    if(!process.env.FLW_SECRET_KEY) return res.status(503).json({message:'Flutterwave is not configured.'});
    const amount=Number(req.body?.amount);
    if(!Number.isFinite(amount)||amount<500||amount>1000000) return res.status(400).json({message:'Enter a wallet top-up amount between ₦500 and ₦1,000,000.'});
    if(!req.user.email) return res.status(400).json({message:'Add an email address to your account before wallet top-up.'});
    const reference=`CRW-${req.user._id}-${crypto.randomUUID()}`;
    await WalletTransaction.create({user:req.user._id,type:'topup',amount,currency:'NGN',status:'pending',reference,meta:{purpose:'wallet_topup'}});
    const redirectBase=(process.env.PUBLIC_APP_URL||process.env.CLIENT_URL||'http://localhost:5172').split(',')[0].trim();
    const response=await fetch(`${base()}/payments`,{method:'POST',headers:{Authorization:`Bearer ${process.env.FLW_SECRET_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({tx_ref:reference,amount,currency:'NGN',redirect_url:`${redirectBase}/wallet-result`,customer:{email:req.user.email,name:req.user.name},meta:{kind:'wallet_topup',userId:String(req.user._id)},customizations:{title:'CivicRide Wallet',description:'Wallet balance top-up'}})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.status!=='success'||!data.data?.link){await WalletTransaction.updateOne({reference},{ $set:{status:'failed'} });return res.status(502).json({message:'Flutterwave could not initialize this wallet top-up.'});}
    res.json({paymentUrl:data.data.link,reference});
  } catch(e){next(e);}
});

router.get('/wallet/verify/:transactionId', requireAuth, async(req,res,next)=>{
  try {
    if(!process.env.FLW_SECRET_KEY) return res.status(503).json({message:'Flutterwave is not configured.'});
    const tx=await verifyWithFlutterwave(req.params.transactionId); if(!tx) return res.status(400).json({message:'Flutterwave has not confirmed this top-up as successful.'});
    const result=await applyWalletTopup(tx,req.user._id); if(!result.ok) return res.status(400).json({message:result.message});
    res.json({message:result.alreadyApplied?'Wallet top-up was already credited.':'Wallet credited successfully.',balance:result.balanceAfter});
  } catch(e){next(e);}
});


router.post('/initialize', requireAuth, async (req, res, next) => {
  try {
    const { rideId } = req.body;
    if (!process.env.FLW_SECRET_KEY) return res.status(503).json({ message: 'Flutterwave is not configured' });
    const ride = await Ride.findOne({ _id: rideId, passenger: req.user._id });
    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    if (ride.paymentMethod !== 'flutterwave') return res.status(400).json({ message: 'This ride uses cash payment' });
    if (ride.paymentStatus === 'paid') return res.status(409).json({ message: 'Ride is already paid' });
    const txRef = `CR-${ride._id}-${crypto.randomUUID()}`;
    const redirectBase = (process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || 'http://localhost:5172').split(',')[0].trim();
    const response = await fetch(`${base()}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_ref: txRef, amount: ride.estimatedFare, currency: 'NGN',
        redirect_url: `${redirectBase}/payment-result`,
        customer: { email: req.user.email, name: req.user.name },
        meta: { rideId: ride._id.toString(), userId: req.user._id.toString() },
        customizations: { title: 'CivicRide', description: `Payment for ride ${ride._id}` }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== 'success' || !data.data?.link) return res.status(502).json({ message: 'Payment provider could not initialize payment' });
    ride.paymentStatus = 'pending';
    ride.paymentTxRef = txRef;
    await ride.save();
    res.json({ paymentUrl: data.data.link, txRef });
  } catch (e) { next(e); }
});

// Called by the app after Flutterwave redirects the passenger back.
router.get('/verify/:transactionId', requireAuth, async (req, res, next) => {
  try {
    if (!process.env.FLW_SECRET_KEY) return res.status(503).json({ message: 'Flutterwave is not configured' });
    const tx = await verifyWithFlutterwave(req.params.transactionId);
    if (!tx) return res.status(400).json({ message: 'Payment has not been verified as successful' });
    const result = await applyVerifiedPayment(tx, { passengerId: req.user._id });
    if (!result.ok) return res.status(400).json({ message: result.message });
    res.json({ message: 'Payment verified', paymentStatus: result.ride.paymentStatus });
  } catch (e) { next(e); }
});

// Server-to-server notification from Flutterwave. Never trusted on its own: we re-verify with the provider.
router.post('/webhook', async (req, res, next) => {
  try {
    const expected = webhookHash();
    if (!expected) return res.status(503).json({ message: 'Webhook secret hash is not configured' });
    if (!safeEqual(req.headers['verif-hash'] || '', expected)) return res.status(401).json({ message: 'Invalid signature' });
    const txId = req.body?.data?.id;
    if (req.body?.event === 'charge.completed' && txId && process.env.FLW_SECRET_KEY) {
      const tx = await verifyWithFlutterwave(txId);
      if (tx?.meta?.kind === 'wallet_topup') await applyWalletTopup(tx);
      else if (tx) await applyVerifiedPayment(tx);
    }
    res.sendStatus(200);
  } catch (e) { next(e); }
});

export default router;
