import express from 'express';
import Material from '../models/Material.js';
import { auth } from '../middleware/auth.js';
import { getAvailableKg, getMaterialStockMap } from '../utils/stock.js';

const router = express.Router();

router.use(auth);

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
    const { name, sellingPricePerKg } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Material name is required' });
    }

    let material = await Material.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (material) {
      if (sellingPricePerKg !== undefined) {
        material.sellingPricePerKg = sellingPricePerKg;
        await material.save();
      }
      return res.json(material);
    }

    material = await Material.create({
      name: name.trim(),
      sellingPricePerKg: sellingPricePerKg || 0,
    });
    res.status(201).json(material);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Material already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const material = await Material.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!material) return res.status(404).json({ message: 'Material not found' });
    res.json(material);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const material = await Material.findByIdAndDelete(req.params.id);
    if (!material) return res.status(404).json({ message: 'Material not found' });
    res.json({ message: 'Material deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
