import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    // Employee ya Client dono store honge
    userType: {
      type: String,
      enum: ['employee', 'client'],
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    endpoint: {
      type: String,
      required: true,
      unique: true,
    },

    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },

    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ userId: 1, userType: 1 });

export default mongoose.model('PushSubscription', pushSubscriptionSchema);