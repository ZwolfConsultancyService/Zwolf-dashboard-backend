import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'CategoryLocation', required: true },
    salesPerson: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // 🆕 STATUS FIELD
    status: {
      type: String,
      enum: ['Pending', 'Done'],
      default: 'Pending',
    },
    doneAt: { type: Date, default: null },

    // 🆕 REMINDER TRACKING
    lastReminderSentAt: { type: Date, default: null },
    reminderCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

assignmentSchema.index(
  { category: 1, location: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

export default mongoose.model('Assignment', assignmentSchema);