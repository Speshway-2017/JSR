import express from 'express';
import SalesBagReport from '../models/SalesBagReport.js';
import { auth, requireRole } from '../middleware/auth.js';
import { apiErrorMessage } from '../utils/apiError.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('sales'));

function normalizeEntries(entries = []) {
  return entries
    .map((e) => ({
      customerName: String(e.customerName || '').trim(),
      materialName: String(e.materialName || '').trim(),
      bags: Number(e.bags) || 0,
    }))
    .filter((e) => e.customerName && e.materialName && e.bags > 0);
}

router.get('/', async (req, res) => {
  try {
    const reports = await SalesBagReport.find()
      .sort({ createdAt: 1, updatedAt: 1 })
      .populate('createdBy', 'name email role')
      .lean();
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

router.get('/suggestions', async (_req, res) => {
  try {
    const reports = await SalesBagReport.find().select('entries').lean();
    const names = new Set();
    const materials = new Set();
    for (const report of reports) {
      for (const e of report.entries || []) {
        if (e.customerName) names.add(e.customerName);
        if (e.materialName) materials.add(e.materialName);
      }
    }
    res.json({
      names: Array.from(names).sort((a, b) => a.localeCompare(b)),
      materials: Array.from(materials).sort((a, b) => a.localeCompare(b)),
    });
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const report = await SalesBagReport.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .lean();
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

router.post('/', async (req, res) => {
  try {
    const entries = normalizeEntries(req.body.entries);
    if (entries.length === 0) {
      return res.status(400).json({ message: 'Add at least one entry before saving' });
    }
    const title =
      (req.body.title || '').trim() ||
      `Bag Orders — ${new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`;

    const report = await SalesBagReport.create({
      title,
      entries,
      createdBy: req.user?.id || null,
    });
    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const entries = normalizeEntries(req.body.entries);
    if (entries.length === 0) {
      return res.status(400).json({ message: 'Add at least one entry before saving' });
    }
    const updates = { entries };
    if (req.body.title !== undefined) {
      updates.title = String(req.body.title || '').trim();
    }

    const report = await SalesBagReport.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const report = await SalesBagReport.findByIdAndDelete(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json({ message: 'Report deleted' });
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

export default router;
