import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    clientName: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    alternatePhone: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    serviceRequired: { type: String, trim: true },
    description: { type: String, trim: true },
    assignedSales: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    clientStatus: {
      type: String,
      enum: [
        'New Lead',
        'Contacted',
        'Discussion',
        'Proposal Sent',
        'Negotiation',
        'Confirmed',
        'Project Started',
        'Completed',
        'Lost',
      ],
      default: 'New Lead',
    },
    followUpDate: { type: Date },
    totalAmount: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },
    notes: [
      {
        text: { type: String, required: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

clientSchema.index({ assignedSales: 1 });
clientSchema.index({ clientStatus: 1 });
clientSchema.index({ clientName: 'text', companyName: 'text' });

export default mongoose.model('Client', clientSchema);