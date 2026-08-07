import mongoose from 'mongoose';

const materialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    sellingPricePerKg: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Material', materialSchema);
