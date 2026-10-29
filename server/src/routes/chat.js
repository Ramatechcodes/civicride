import { Router } from 'express';
import mongoose from 'mongoose';
import Ride from '../models/Ride.js';
import ChatMessage from '../models/ChatMessage.js';
import { requireAuth } from '../middleware/auth.js';
import { recordActivity } from '../services/activity.js';
const router = Router();
router.use(requireAuth);
const membership = (ride, user) => String(ride.passenger) === String(user._id) || String(ride.driver) === String(user._id);
router.get('/rides', async (req,res,next) => { try {
 const filter = req.user.role === 'driver' ? { driver:req.user._id } : req.user.role === 'passenger' ? { passenger:req.user._id } : {};
 const rides = await Ride.find(filter).sort({updatedAt:-1}).limit(100).populate('passenger','name phone').populate('driver','name phone').lean();
 res.set('Cache-Control','no-store'); res.json({rides:rides.filter(r=>r.driver && ['accepted','arriving','in_progress','completed'].includes(r.status))});
 } catch(e){next(e)} });
router.get('/:rideId/messages', async (req,res,next) => { try {
 if(!mongoose.isValidObjectId(req.params.rideId)) return res.status(400).json({message:'Invalid ride ID'});
 const ride=await Ride.findById(req.params.rideId).select('passenger driver'); if(!ride || !membership(ride,req.user)) return res.status(403).json({message:'Only this ride passenger and assigned driver can access its chat'});
 const messages=await ChatMessage.find({ride:ride._id}).sort({createdAt:1}).limit(300).populate('sender','name role').lean(); res.set('Cache-Control','no-store'); res.json({messages});
 } catch(e){next(e)} });
router.post('/:rideId/messages', async (req,res,next) => { try {
 const text=String(req.body?.text||'').trim(); if(!text || text.length>2000) return res.status(400).json({message:'Message must contain 1–2000 characters'});
 if(!mongoose.isValidObjectId(req.params.rideId)) return res.status(400).json({message:'Invalid ride ID'});
 const ride=await Ride.findById(req.params.rideId).select('passenger driver'); if(!ride || !membership(ride,req.user)) return res.status(403).json({message:'Only this ride passenger and assigned driver can send messages'});
 const message=await ChatMessage.create({ride:ride._id,sender:req.user._id,text}); const populated=await message.populate('sender','name role');
 const {getIO}=await import('../realtime.js'); getIO()?.to(`ride:${ride._id}`).emit('chat:message', populated.toObject()); const {sendPushToUser}=await import('../services/push.js'); const recipientId=String(ride.passenger)===String(req.user._id)?ride.driver:ride.passenger; if(recipientId) await sendPushToUser(recipientId,{title:`New message from ${req.user.name || 'your ride contact'}`,body:text.slice(0,140),url:'/',tag:`civicride-chat-${ride._id}`}).catch(()=>{}); await recordActivity({user:req.user,action:'ride_chat_message_sent',entityType:'ride',entityId:ride._id,details:'Ride participant sent a chat message (message content is not copied to admin activity logs)'}); res.status(201).json({message:populated});
 } catch(e){next(e)} });
export default router;
