import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['sos', 'safety_report'], default: 'sos' },
  note: { type: String, maxlength: 1000, default: '' },
  location: { lat: Number, lng: Number },
  status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open', index: true },
  createdAt: { type: Date, default: Date.now }, resolvedAt: Date, resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
export default mongoose.model('Incident', schema);
