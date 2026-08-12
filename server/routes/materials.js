import express from 'express';
import Material from '../models/Material.js';
import { auth, requireRole } from '../middleware/auth.js';
import { getAvailableKg, getMaterialStockMap } from '../utils/stock.js';

const router = express.Router();

router.use(auth);
router.use(requireRole('admin'));

function parseRate(value) {
  if (value === undefined || value === null || value === '') return 10;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

router.get('/', async (req, res) => {
  try {
    const [materials, stockMap] = await Promise.all([
      Material.find().sort({ name: 1 }),
      getMaterialStockMap(),
    ]);
    res.json(
      materials.map((material) => ({
        ...material.toObject(),
        availableKg: getAvailableKg(stockMap, material._id),
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, nameTelugu, sellingPricePerKg, ratePerKg } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Product name is required' });
    }

    const rate = parseRate(
      sellingPricePerKg !== undefined ? sellingPricePerKg : ratePerKg
    );

    let material = await Material.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (material) {
      return res.status(400).json({ message: 'Product already exists' });
    }

    material = await Material.create({
      name: name.trim(),
      nameTelugu: String(nameTelugu || '').trim(),
      sellingPricePerKg: rate,
    });
    res.status(201).json(material);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Product already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, nameTelugu, sellingPricePerKg, ratePerKg } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (nameTelugu !== undefined) updates.nameTelugu = String(nameTelugu || '').trim();
    if (sellingPricePerKg !== undefined || ratePerKg !== undefined) {
      updates.sellingPricePerKg = parseRate(
        sellingPricePerKg !== undefined ? sellingPricePerKg : ratePerKg
      );
    }

    const material = await Material.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!material) return res.status(404).json({ message: 'Product not found' });
    res.json(material);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Product already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const material = await Material.findByIdAndDelete(req.params.id);
    if (!material) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
