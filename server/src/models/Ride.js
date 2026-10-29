import mongoose from 'mongoose';
const pointSchema = new mongoose.Schema({ address: { type: String, required: true }, lat: Number, lng: Number }, { _id: false });
const schema = new mongoose.Schema({
  passenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  preferredDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  pickup: { type: pointSchema, required: true },
  destination: { type: pointSchema, required: true },
  category: { type: String, enum: ['economy', 'comfort', 'xl'], default: 'economy' },
  estimatedFare: { type: Number, required: true, min: 0 },
  distanceKm: { type: Number, min: 0 },
  durationMin: { type: Number, min: 0 },
  progressMilestoneNotified: { type: Number, default: 0, min: 0, max: 100 },
  passengerLocation: { lat: Number, lng: Number, accuracy: Number, updatedAt: Date },
  activity: [{ action: { type: String, maxlength: 80 }, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, note: { type: String, maxlength: 300 }, at: { type: Date, default: Date.now } }],
  coinsAwarded: { type: Number, default: 0, min: 0 },
  finalFare: { type: Number, min: 0 },
  paymentMethod: { type: String, enum: ['cash', 'flutterwave'], default: 'cash' },
  paymentStatus: { type: String, enum: ['unpaid', 'pending', 'paid', 'failed'], default: 'unpaid' },
  status: { type: String, enum: ['requested', 'accepted', 'arriving', 'in_progress', 'completed', 'cancelled'], default: 'requested', index: true },
  requestedAt: { type: Date, default: Date.now },
  acceptedAt: Date, startedAt: Date, completedAt: Date,
  shareTokenHash: String, shareEnabled: { type: Boolean, default: false },
  sosEvents: [{ createdAt: { type: Date, default: Date.now }, note: { type: String, maxlength: 500 }, lat: Number, lng: Number, resolvedAt: Date }],
  paymentTxRef: String, paymentTransactionId: String,
  rating: { type: Number, min: 1, max: 5 },
  review: { type: String, maxlength: 500 }
}, { timestamps: true });
export default mongoose.model('Ride', schema);
