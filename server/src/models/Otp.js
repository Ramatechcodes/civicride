import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true },
  codeHash: { type: String, required: true },
  purpose: { type: String, enum: ['register', 'login', 'reset'], default: 'register' },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });
export default mongoose.model('Otp', schema);
