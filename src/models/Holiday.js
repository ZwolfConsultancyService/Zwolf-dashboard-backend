import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema(
  {
    /* =====================================================
       BASIC INFO
    ===================================================== */

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    /* =====================================================
       DATE
    ===================================================== */

    date: {
      type: Date,
      required: true,
      index: true,
    },

    /* Optional: if multi-day holiday */
    endDate: {
      type: Date,
      default: null,
    },

    /* =====================================================
       TYPE
    ===================================================== */

    type: {
      type: String,
      enum: [
        'National',
        'Festival',
        'Optional',
        'Restricted',
        'Company',
        'Weekend',
      ],
      default: 'Festival',
    },

    /* =====================================================
       PAID / UNPAID
    ===================================================== */

    isPaid: {
      type: Boolean,
      default: true,
    },

    /* =====================================================
       APPLICABLE TO
    ===================================================== */

    applicableTo: {
      type: String,
      enum: ['All', 'Manager', 'Sales', 'Developer', 'Specific'],
      default: 'All',
    },

    /* If "Specific" — list of user IDs */
    specificEmployees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    /* =====================================================
       STATUS
    ===================================================== */

    isActive: {
      type: Boolean,
      default: true,
      index: true,
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

holidaySchema.index({ date: 1, isActive: 1 });
holidaySchema.index({ type: 1 });
holidaySchema.index({ applicableTo: 1 });

/* =========================================================
   VIRTUAL: IS MULTI-DAY
========================================================= */

holidaySchema.virtual('isMultiDay').get(function () {
  return !!(this.endDate && this.endDate > this.date);
});

export default mongoose.model('Holiday', holidaySchema);