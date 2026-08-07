import mongoose from 'mongoose';

/** Singleton-style settings for per-bag deductions on vendor bills */
const priceSettingsSchema = new mongoose.Schema(
  {
    labour: { type: Number, default: 0, min: 0 },
    aaseelu: { type: Number, default: 0, min: 0 },
    bill: { type: Number, default: 0, min: 0 },
    unionCharges: { type: Number, default: 0, min: 0 },
    /** Deducted from sale value on vendor load bill */
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

export default mongoose.model('PriceSettings', priceSettingsSchema);
