import mongoose from 'mongoose';

const categoryLocationSchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'CategoryLocation', default: null },
    level: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

categoryLocationSchema.index({ name: 1, parent: 1, category: 1 }, { unique: true });

export default mongoose.model('CategoryLocation', categoryLocationSchema);