import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameTelugu: { type: String, default: '', trim: true },
    mobile: { type: String, default: '', trim: true },
    schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule', default: null },
    address: { type: String, default: '', trim: true },
    handlingCharges: { type: Boolean, default: false },
    openingDebit: { type: Number, default: 0 },
    openingCredit: { type: Number, default: 0 },
    creditBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Customer', customerSchema);
