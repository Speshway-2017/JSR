import express from 'express';
import SalesMaterial from '../models/SalesMaterial.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(auth);
router.use(requireRole('sales', 'admin'));

router.get('/', async (_req, res) => {
  try {
    const materials = await SalesMaterial.find().sort({ name: 1 });
    res.json(materials);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Material name is required' });
    }

    const existing = await SalesMaterial.findOne({
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (existing) {
      return res.json(existing);
    }

    const material = await SalesMaterial.create({ name });
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
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Material name is required' });
    }

    const duplicate = await SalesMaterial.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (duplicate) {
      return res.status(400).json({ message: 'Material already exists' });
    }

    const material = await SalesMaterial.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true, runValidators: true }
    );
    if (!material) return res.status(404).json({ message: 'Material not found' });
    res.json(material);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Material already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const material = await SalesMaterial.findByIdAndDelete(req.params.id);
    if (!material) return res.status(404).json({ message: 'Material not found' });
    res.json({ message: 'Material deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
