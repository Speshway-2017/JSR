import mongoose from 'mongoose';

/**
 * Singleton settings for రైతుపట్టి deductions.
 * Each charge has a value + perBag flag (× bags when true; flat when false).
 * Commission: when perBag=false, value is % of gross; when true, ₹ per bag.
 */
const priceSettingsSchema = new mongoose.Schema(
  {
    kirayi: { type: Number, default: 0, min: 0 },
    kirayiPerBag: { type: Boolean, default: true },

    riksha: { type: Number, default: 0, min: 0 },
    rikshaPerBag: { type: Boolean, default: true },

    cooly: { type: Number, default: 0, min: 0 },
    coolyPerBag: { type: Boolean, default: true },

    aaseelu: { type: Number, default: 0, min: 0 },
    aaseeluPerBag: { type: Boolean, default: true },

    commission: { type: Number, default: 0, min: 0 },
    commissionPerBag: { type: Boolean, default: false },

    vadakam: { type: Number, default: 0, min: 0 },
    vadakamPerBag: { type: Boolean, default: true },

    rusumu: { type: Number, default: 0, min: 0 },
    rusumuPerBag: { type: Boolean, default: true },

    union: { type: Number, default: 0, min: 0 },
    unionPerBag: { type: Boolean, default: true },

    bagLessUnder50: { type: Number, default: 1, min: 0 },
    bagLessOver50: { type: Number, default: 2, min: 0 },
    salesCoolyRate: { type: Number, default: 10, min: 0 },
    salesCoolyRateByWeight: { type: Number, default: 17, min: 0 },
    salesCoolyRateByBag: { type: Number, default: 10, min: 0 },

    // Legacy fields (kept for old documents; migrated on read)
    labour: { type: Number, default: 0, min: 0 },
    bill: { type: Number, default: 0, min: 0 },
    unionCharges: { type: Number, default: 0, min: 0 },
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

export default mongoose.model('PriceSettings', priceSettingsSchema);
