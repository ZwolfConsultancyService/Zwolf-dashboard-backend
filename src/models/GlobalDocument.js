import mongoose from 'mongoose';

const globalDocumentSchema = new mongoose.Schema(
  {
    title: { type: String, default: 'Company Document' },
    fileUrl: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('GlobalDocument', globalDocumentSchema);