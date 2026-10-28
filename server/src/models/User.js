import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, lowercase: true, trim: true, sparse: true, unique: true },
  phone: { type: String, trim: true, sparse: true, unique: true },
  passwordHash: { type: String, select: false },
  role: { type: String, enum: ['passenger', 'driver', 'admin'], default: 'passenger' },
  accountStatus: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active', index: true },
  accountStatusReason: { type: String, maxlength: 500, default: '' },
  accountStatusChangedAt: Date,
  accountStatusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  googleSub: { type: String, sparse: true, unique: true },
  emailVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean, default: false },
  driverStatus: { type: String, enum: ['not_applicable', 'pending', 'approved', 'rejected'], default: 'not_applicable' },
  driverReviewNote: { type: String, maxlength: 500 }, driverReviewedAt: Date, driverReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  currentLocation: { lat: Number, lng: Number, accuracy: Number, updatedAt: Date },
  driverOnline: { type: Boolean, default: false, index: true },
  walletBalance: { type: Number, default: 0, min: 0 },
  rideCoins: { type: Number, default: 0, min: 0 },
  driverDocuments: [{ kind: { type: String, enum: ['identity', 'licence', 'vehicle_registration', 'insurance', 'roadworthiness'] }, publicId: String, secureUrl: String, resourceType: { type: String, enum: ['image', 'raw'], default: 'image' }, format: String, mimeType: String, originalName: { type: String, maxlength: 200 }, bytes: Number, status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }, uploadedAt: { type: Date, default: Date.now }, reviewedAt: Date, reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, reviewNote: String }],
  vehicle: {
    make: { type: String, trim: true, maxlength: 60 },
    model: { type: String, trim: true, maxlength: 60 },
    year: { type: Number, min: 1980, max: 2100 },
    color: { type: String, trim: true, maxlength: 40 },
    plateNumber: { type: String, trim: true, uppercase: true, maxlength: 20 },
    vehicleType: { type: String, enum: ['sedan', 'suv', 'hatchback', 'minivan', 'pickup', 'other'] },
    seats: { type: Number, min: 1, max: 20 },
    category: { type: String, enum: ['economy', 'comfort', 'xl'] }
  },
  rating: { type: Number, default: 5 },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
