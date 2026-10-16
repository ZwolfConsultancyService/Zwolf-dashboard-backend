import mongoose from "mongoose";

/*
 * ================================
 * MONTHLY TRACKING SCHEMA
 * ================================
 */

const monthlyTrackingSchema = new mongoose.Schema(
    {
        month: {
            type: String,
            required: true,
            trim: true,
        },

        year: {
            type: Number,
            required: true,
        },

        // ================================
        // WORK METRICS
        // ================================

        keywordsTarget: {
            type: Number,
            default: 0,
            min: 0,
        },

        keywordsCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        backlinksTarget: {
            type: Number,
            default: 0,
            min: 0,
        },

        backlinksCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        blogsTarget: {
            type: Number,
            default: 0,
            min: 0,
        },

        blogsCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        onPageTarget: {
            type: Number,
            default: 0,
            min: 0,
        },

        onPageCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        technicalTarget: {
            type: Number,
            default: 0,
            min: 0,
        },

        technicalCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        rankingImproved: {
            type: Number,
            default: 0,
            min: 0,
        },

        // ================================
        // NEW FIELDS
        // ================================

        caseStudiesTarget: {
            type: Number,
            default: 0,
            min: 0,
        },

        caseStudiesCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        gmbTarget: {
            type: Number,
            default: 0,
            min: 0,
        },

        gmbCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        rankingTarget: {
            type: Number,
            default: 0,
            min: 0,
        },

        // ================================
        // PAYMENT
        // ================================

        paymentAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        paidAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        paymentStatus: {
            type: String,
            enum: ["pending", "partial", "paid"],
            default: "pending",
        },

        workStatus: {
            type: String,
            enum: ["pending", "in-progress", "completed"],
            default: "pending",
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    {
        timestamps: true,
    }
);


/*
 * ================================
 * DAILY TRACKING SCHEMA
 * ================================
 */

const dailyTrackingSchema = new mongoose.Schema(
    {
        date: {
            type: Date,
            required: true,
        },

        keywordsCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        backlinksCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        blogsCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        onPageCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        technicalCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        // NEW
        caseStudiesCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        gmbCompleted: {
            type: Number,
            default: 0,
            min: 0,
        },

        workStatus: {
            type: String,
            enum: ["pending", "in-progress", "completed"],
            default: "pending",
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    {
        timestamps: true,
    }
);


/*
 * ================================
 * SEO SCHEMA
 * ================================
 */

const seoSchema = new mongoose.Schema(
    {
        client: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Client",
            required: true,
            index: true,
        },

        plan: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SEOPlan",
            required: true,
        },

        planName: {
            type: String,
            required: true,
            trim: true,
        },

        durationInDays: {
            type: Number,
            required: true,
        },

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        startDate: {
            type: Date,
            required: true,
        },

        endDate: {
            type: Date,
            required: true,
            index: true,
        },

        status: {
            type: String,
            enum: ["active", "expired", "cancelled"],
            default: "active",
            index: true,
        },

        monthlyTracking: {
            type: [monthlyTrackingSchema],
            default: [],
        },

        dailyTracking: {
            type: [dailyTrackingSchema],
            default: [],
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        renewalReminderSent: {
            type: Boolean,
            default: false,
        },

        renewalReminderSentAt: {
            type: Date,
            default: null,
        },

        expiryEmailSent: {
            type: Boolean,
            default: false,
        },

        expiryEmailSentAt: {
            type: Date,
            default: null,
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


/*
 * ================================
 * INDEXES
 * ================================
 */

seoSchema.index({
    client: 1,
    status: 1,
});

seoSchema.index({
    endDate: 1,
    status: 1,
});

seoSchema.index({
    "monthlyTracking.month": 1,
    "monthlyTracking.year": 1,
});

seoSchema.index({
    "dailyTracking.date": 1,
});


/*
 * ================================
 * MODEL
 * ================================
 */

const SEO = mongoose.model("SEO", seoSchema);

export default SEO;