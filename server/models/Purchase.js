import mongoose from 'mongoose';

const purchaseLineSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
    materialName: { type: String, required: true, trim: true },
    purchaseType: { type: String, enum: ['by_weight', 'by_bag', 'by_box'], default: 'by_weight' },
    bags: { type: Number, default: 0, min: 0 },
    boxes: { type: Number, default: 0, min: 0 },
    weightPerBox: { type: Number, default: 0, min: 0 },
    totalKg: { type: Number, default: 0, min: 0 },
    ratePerKg: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

/** Admin purchase from a vendor (different from Add Load arrival) */
const purchaseSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    purchaseDate: { type: Date, required: true },
    lines: { type: [purchaseLineSchema], default: [] },
    totalBags: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    totalWeight: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Purchase', purchaseSchema);
