import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  actorName: { type: String, maxlength: 100, default: 'System' },
  actorRole: { type: String, enum: ['passenger','driver','admin','system'], default: 'system' },
  action: { type: String, required: true, maxlength: 100, index: true },
  entityType: { type: String, enum: ['user','ride','payment','document','safety','location','system'], default: 'system' },
  entityId: { type: String, maxlength: 100 },
  details: { type: String, maxlength: 500, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
schema.index({ createdAt: -1 });
export default mongoose.model('Activity', schema);
