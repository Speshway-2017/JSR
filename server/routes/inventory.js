import express from 'express';
import Load from '../models/Load.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

const parseDate = (dateStr, endOfDay = false) => {
  const d = new Date(dateStr);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
};

router.get('/history', async (req, res) => {
  try {
    const { startDate, endDate, vendorId, materialId } = req.query;

    const today = new Date().toISOString().slice(0, 10);
    const start = parseDate(startDate || today);
    const end = parseDate(endDate || startDate || today, true);

    if (start > end) {
      return res.status(400).json({ message: 'Start date must be before or equal to end date' });
    }

    const filter = { createdAt: { $gte: start, $lte: end } };
    if (vendorId) filter.vendor = vendorId;

    const loads = await Load.find(filter)
      .populate('vendor', 'name city')
      .populate('materials.material', 'name')
      .sort({ createdAt: -1 });

    const rows = [];

    for (const load of loads) {
      for (const mat of load.materials) {
        const matId = mat.material?._id?.toString() || mat.material?.toString();
        if (materialId && matId !== materialId) continue;

        rows.push({
          id: `${load._id}-${mat._id}`,
          date: load.createdAt,
          materialName: mat.materialName,
          materialId: mat.material?._id || mat.material,
          vendorName: load.vendor?.name || 'Unknown',
          vendorId: load.vendor?._id || load.vendor,
          totalWeight: mat.totalKg,
          handlingCharges: load.handlingCharges || 0,
          loadId: load._id,
        });
      }
    }

    const summary = rows.reduce(
      (acc, row) => ({
        totalWeight: acc.totalWeight + row.totalWeight,
      }),
      { totalWeight: 0 }
    );

    res.json({ startDate: start, endDate: end, rows, summary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
