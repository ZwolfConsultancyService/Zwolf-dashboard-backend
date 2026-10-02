import mongoose from "mongoose";

const seoPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    durationInDays: {
      type: Number,
      required: true,
      min: 1,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    keywords: {
      type: Number,
      default: 0,
      min: 0,
    },

    backlinks: {
      type: Number,
      default: 0,
      min: 0,
    },

    blogs: {
      type: Number,
      default: 0,
      min: 0,
    },

    onPageSEO: {
      type: Number,
      default: 0,
      min: 0,
    },

    technicalSEO: {
      type: Number,
      default: 0,
      min: 0,
    },

    localSEO: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

seoPlanSchema.index({ isActive: 1 });

const SEOPlan = mongoose.model("SEOPlan", seoPlanSchema);

export default SEOPlan;