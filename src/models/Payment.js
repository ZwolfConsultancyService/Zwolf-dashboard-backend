import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    amount: { type: Number, required: true, min: 0.01 },
    paymentDate: { type: Date, default: Date.now },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Other'],
      required: true,
    },
    transactionId: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

paymentSchema.index({ client: 1 });
paymentSchema.index({ project: 1 });
paymentSchema.index({ paymentDate: -1 });

export default mongoose.model('Payment', paymentSchema);