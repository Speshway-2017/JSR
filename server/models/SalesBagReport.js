import mongoose from 'mongoose';

const entrySchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true },
    materialName: { type: String, required: true, trim: true },
    bags: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const salesBagReportSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: '' },
    entries: {
      type: [entrySchema],
      validate: [(v) => Array.isArray(v) && v.length > 0, 'At least one entry is required'],
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('SalesBagReport', salesBagReportSchema);
