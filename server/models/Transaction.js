import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    type: {
      type: String,
      required: true,
      enum: ['customer_credit', 'customer_payment', 'vendor_credit', 'vendor_payment'],
    },
    amount: { type: Number, required: true },
    lessAmount: { type: Number, default: 0, min: 0 },
    cashSide: { type: String, enum: ['credit', 'debit'] },
    paymentType: { type: String, default: 'Cash', trim: true },
    entryDate: { type: Date, default: Date.now },
    source: { type: String, default: '', trim: true },
    description: { type: String, required: true },
    load: { type: mongoose.Schema.Types.ObjectId, ref: 'Load' },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    balanceAfter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ vendor: 1, createdAt: -1 });
transactionSchema.index({ customer: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });

export default mongoose.model('Transaction', transactionSchema);
