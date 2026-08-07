import mongoose from 'mongoose';

const bagSchema = new mongoose.Schema(
  {
    kgs: { type: Number, required: true, min: 0.1 },
  },
  { _id: true }
);

/** One rate line — bags sold at the same price for a material */
const saleLineSchema = new mongoose.Schema(
  {
    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
    materialName: { type: String, required: true, trim: true },
    ratePerKg: { type: Number, required: true, min: 0 },
    bags: [bagSchema],
    bagCount: { type: Number, required: true, min: 1 },
    totalKg: { type: Number, required: true, min: 0.1 },
    totalAmount: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const saleSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    load: { type: mongoose.Schema.Types.ObjectId, ref: 'Load', required: true },
    lines: [saleLineSchema],
    handlingCharges: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true },
    totalBags: { type: Number, default: 0 },
    totalWeight: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Sale', saleSchema);
