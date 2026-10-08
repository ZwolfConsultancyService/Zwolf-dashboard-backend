import mongoose from 'mongoose';
import crypto from 'crypto';

const kioskSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      type: String,
      trim: true,
      default: 'Office Entrance',
    },

    /* 🆕 SECRET KEY — URL me use hoga */
    secretKey: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    /* Kya kiosk active hai? */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /* Last time koi check-in hua */
    lastUsedAt: {
      type: Date,
      default: null,
    },

    /* Kitne check-ins is device se hue */
    totalScans: {
      type: Number,
      default: 0,
    },

    /* Kaun banaya */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

/* =========================================================
   🆕 GENERATE SECRET KEY (static method)
========================================================= */

kioskSchema.statics.generateSecretKey = () => {
  return `zwolf-kiosk-${crypto.randomBytes(12).toString('hex')}`;
};

export default mongoose.model('Kiosk', kioskSchema);