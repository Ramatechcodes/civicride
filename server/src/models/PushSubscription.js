import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subscription: { endpoint: { type: String, required: true }, expirationTime: { type: Number, default: null }, keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } } },
  userAgent: { type: String, maxlength: 500, default: '' },
  lastSuccessAt: Date
}, { timestamps: true });
schema.index({ 'subscription.endpoint': 1 }, { unique: true });
export default mongoose.model('PushSubscription', schema);
