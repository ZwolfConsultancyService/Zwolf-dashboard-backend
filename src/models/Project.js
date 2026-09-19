import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    projectName: { type: String, required: true, trim: true },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    salesEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    developers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    description: { type: String, trim: true },
    technology: { type: String, trim: true },
    startDate: { type: Date },
    deadline: { type: Date },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: [
        'Not Started',
        'Planning',
        'In Progress',
        'On Hold',
        'Testing',
        'Completed',
        'Cancelled',
      ],
      default: 'Not Started',
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    requirements: { type: String, trim: true },
    notes: [
      {
        text: { type: String, required: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

projectSchema.index({ client: 1 });
projectSchema.index({ salesEmployee: 1 });
projectSchema.index({ developers: 1 });
projectSchema.index({ status: 1 });

export default mongoose.model('Project', projectSchema);