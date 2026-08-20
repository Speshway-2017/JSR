import mongoose from 'mongoose';

/** Singleton — shop / admin bank opening. */
const companySettingsSchema = new mongoose.Schema(
  {
    openingBalance: { type: Number, default: 0 },
    openingDate: { type: Date, default: null },
    openingSet: { type: Boolean, default: false },
    /** Atlas lifetime=true was seen — never check license again. */
    licenseUnlocked: { type: Boolean, default: false },
    /** First time Atlas lifetime=false was read (start of 10-day window). */
    licenseFirstReadAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('CompanySettings', companySettingsSchema);
