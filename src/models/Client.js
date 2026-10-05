
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const clientSchema = new mongoose.Schema(
  {
    // -----------------------------------------
    // BASIC CLIENT INFORMATION
    // -----------------------------------------
    clientName: {
      type: String,
      required: true,
      trim: true,
    },

    companyName: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    alternatePhone: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    // -----------------------------------------
    // CLIENT PORTAL LOGIN
    // -----------------------------------------
    portalId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      select: false,
    },

    isPortalActive: {
      type: Boolean,
      default: true,
    },

    // -----------------------------------------
    // SERVICE INFORMATION
    // -----------------------------------------
    serviceRequired: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    // -----------------------------------------
    // SALES PERSON
    // -----------------------------------------
    assignedSales: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // -----------------------------------------
    // CLIENT STATUS
    // -----------------------------------------
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

    followUpDate: {
      type: Date,
    },

    // -----------------------------------------
    // PAYMENT INFORMATION
    // -----------------------------------------
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // -----------------------------------------
    // NOTES
    // -----------------------------------------
    notes: [
      {
        text: {
          type: String,
          required: true,
        },

        addedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },

  {
    timestamps: true,
  }
);

// -----------------------------------------
// INDEXES
// -----------------------------------------

clientSchema.index({
  assignedSales: 1,
});

clientSchema.index({
  clientStatus: 1,
});

clientSchema.index({
  clientName: 'text',
  companyName: 'text',
});

// -----------------------------------------
// HASH CLIENT PASSWORD
// -----------------------------------------

clientSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);

  this.password = await bcrypt.hash(
    this.password,
    salt
  );

  next();
});

// -----------------------------------------
// CHECK CLIENT PASSWORD
// -----------------------------------------

clientSchema.methods.matchPassword = async function (
  enteredPassword
) {
  return bcrypt.compare(
    enteredPassword,
    this.password
  );
};

export default mongoose.model(
  'Client',
  clientSchema
);
