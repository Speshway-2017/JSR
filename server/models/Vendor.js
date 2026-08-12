import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameTelugu: { type: String, default: '', trim: true },
    mobile: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    /** Amount payable to vendor (from sales of their stock, before/after settlement) */
    creditBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Vendor', vendorSchema);
