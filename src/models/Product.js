import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    /* =====================================================
       BASIC INFO
    ===================================================== */

    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    category: {
      type: String,
      enum: [
        'Custom Software',
        'Web Application',
        'Mobile App',
        'CRM',
        'ERP',
        'E-commerce',
        'SaaS',
        'Website',
        'UI/UX Design',
        'Digital Marketing',
        'SEO',
        'Other',
      ],
      default: 'Custom Software',
    },

    shortDescription: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
    },

    /* =====================================================
       PRICING
    ===================================================== */

    startingPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    priceType: {
      type: String,
      enum: ['Fixed', 'Hourly', 'Monthly', 'Custom'],
      default: 'Custom',
    },

    /* =====================================================
       FEATURES
    ===================================================== */

    features: [
      {
        type: String,
        trim: true,
      },
    ],

    technology: [
      {
        type: String,
        trim: true,
      },
    ],

    /* =====================================================
       MEDIA
    ===================================================== */

    image: {
      type: String,
      default: '',
    },

    thumbnail: {
      type: String,
      default: '',
    },

    /* =====================================================
       DELIVERY / TIMELINE
    ===================================================== */

    deliveryTime: {
      type: String,
      trim: true,
    },

    /* =====================================================
       VISIBILITY
    ===================================================== */

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /* =====================================================
       ORDER (for display sorting)
    ===================================================== */

    order: {
      type: Number,
      default: 0,
    },

    /* =====================================================
       CREATED BY
    ===================================================== */

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

/* =========================================================
   INDEXES
========================================================= */

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ order: 1, createdAt: -1 });
productSchema.index({ name: 'text', shortDescription: 'text', description: 'text' });

export default mongoose.model('Product', productSchema);