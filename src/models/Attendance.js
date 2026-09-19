import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: { type: Date, required: true },
    loginTime: { type: Date },
    logoutTime: { type: Date },
    workingMinutes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Half Day', 'Leave'],
      default: 'Present',
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);