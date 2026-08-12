import mongoose from 'mongoose';

const materialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    nameTelugu: { type: String, default: '', trim: true },
    sellingPricePerKg: { type: Number, default: 10, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Material', materialSchema);
