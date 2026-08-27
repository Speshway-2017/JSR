import mongoose from 'mongoose';

/** Singleton — shop / admin bank opening. */
const companySettingsSchema = new mongoose.Schema(
  {
    openingBalance: { type: Number, default: 0 },
    openingDate: { type: Date, default: null },
    openingSet: { type: Boolean, default: false },
    /** Atlas lifetime=true was seen — never check license again. */
    licenseUnlocked: { type: Boolean, default: false },
    licenseMode: { type: String, enum: ['PERIODIC', 'LIFETIME'], default: 'PERIODIC' },
    /** First time Atlas lifetime=false was read. */
    licenseFirstReadAt: { type: Date, default: null },
    /** Timestamp of last successful online license validation. */
    lastSuccessfulValidationAt: { type: Date, default: null },
    /** Server timestamp returned during last validation. */
    lastServerTime: { type: Date, default: null },
    /** Flag indicating whether cloud license was explicitly revoked or invalid. */
    licenseRevoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('CompanySettings', companySettingsSchema);
