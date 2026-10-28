import mongoose from 'mongoose';
const schema = new mongoose.Schema({ ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, index: true }, sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, text: { type: String, required: true, maxlength: 2000, trim: true } }, { timestamps: true });
schema.index({ ride: 1, createdAt: 1 });
export default mongoose.model('ChatMessage', schema);
