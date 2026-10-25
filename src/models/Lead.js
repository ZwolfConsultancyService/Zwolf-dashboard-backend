import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'CategoryLocation', required: true },
    salesPerson: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Optional: client reference (agar client bhi add hua ho)
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },

    // Optional: clientName string (agar client register nahi hua, sirf baat hui)
    clientName: { type: String, default: '' },
    clientPhone: { type: String, default: '' },

    notes: { type: String, default: '' },
    leadDate: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

leadSchema.index({ salesPerson: 1, leadDate: -1 });
leadSchema.index({ category: 1, location: 1, leadDate: -1 });

export default mongoose.model('Lead', leadSchema);