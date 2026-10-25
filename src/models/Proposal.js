import mongoose from 'mongoose';

const proposalSchema = new mongoose.Schema(
  {
    proposalNumber: {
      type: String,
      unique: true,
      index: true,
    },

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    projectName: {
      type: String,
      required: true,
      trim: true,
    },

    // 🆕 PDF Document URL
    documentPdf: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      trim: true,
    },

    scopeOfWork: [
      {
        type: String,
        trim: true,
      },
    ],

    technologies: [
      {
        type: String,
        trim: true,
      },
    ],

    startDate: {
      type: Date,
      default: null,
    },

    endDate: {
      type: Date,
      default: null,
    },

    // Total amount ko optional kar diya (default 0)
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentTerms: {
      type: String,
      trim: true,
      default: '50% advance, 50% on delivery',
    },

    termsAndConditions: [
      {
        type: String,
        trim: true,
      },
    ],

    validUntil: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ['Draft', 'Approved', 'Archived'],
      default: 'Approved', // Form submit hote hi direct Approved ho jayega
      index: true,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

proposalSchema.index({ client: 1, status: 1 });
proposalSchema.index({ createdBy: 1, status: 1 });
proposalSchema.index({ status: 1, createdAt: -1 });

/* AUTO PROPOSAL NUMBER */
proposalSchema.pre('save', async function (next) {
  if (this.isNew && !this.proposalNumber) {
    const count = await mongoose.model('Proposal').countDocuments();
    const year = new Date().getFullYear();
    this.proposalNumber = `PROP-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

export default mongoose.model('Proposal', proposalSchema);