import mongoose from 'mongoose';

/** Catalog of material names for sales bag orders (separate from inventory Materials). */
const salesMaterialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true }
);

export default mongoose.model('SalesMaterial', salesMaterialSchema);
