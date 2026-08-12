import mongoose from 'mongoose';

/** Incoming arrival from vendor — materials optional (sales drive the bill) */
const loadMaterialSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
    materialName: { type: String, trim: true },
    totalKg: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const loadSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    /** Calendar day the vendor brought the load */
    loadDate: { type: Date, required: true },
    materials: { type: [loadMaterialSchema], default: [] },
    totalWeight: { type: Number, default: 0, min: 0 },
    handlingCharges: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
    /** Saved deduction rates used when generating/modifying the vendor bill */
    billSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    billGeneratedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

loadSchema.index({ vendor: 1, loadDate: 1 });

export default mongoose.model('Load', loadSchema);
