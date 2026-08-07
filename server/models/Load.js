import mongoose from 'mongoose';

/** Incoming stock from vendor — material + total weight; handling entered per load */
const loadMaterialSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
    materialName: { type: String, required: true, trim: true },
    totalKg: { type: Number, required: true, min: 0.1 },
  },
  { _id: true }
);

const loadSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    materials: [loadMaterialSchema],
    totalWeight: { type: Number, required: true, min: 0.1 },
    handlingCharges: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
    /** Locked price-settings rates used when bill was first generated */
    billSnapshot: {
      labour: { type: Number, default: 0 },
      aaseelu: { type: Number, default: 0 },
      bill: { type: Number, default: 0 },
      unionCharges: { type: Number, default: 0 },
      commissionPercent: { type: Number, default: 0 },
    },
    billGeneratedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Load', loadSchema);
