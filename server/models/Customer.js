import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, default: '', trim: true },
    state: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    address: { type: String, default: '', trim: true },
    handlingCharges: { type: Boolean, default: false },
    creditBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Customer', customerSchema);
