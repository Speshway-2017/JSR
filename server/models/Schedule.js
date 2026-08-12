import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model('Schedule', scheduleSchema);
