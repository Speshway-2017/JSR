import express from 'express';
import SalesMaterial from '../models/SalesMaterial.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(auth);
router.use(requireRole('sales'));

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive exact name match (works without relying on collation indexes). */
async function findByNameCI(name, excludeId = null) {
  const query = {
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return SalesMaterial.findOne(query);
}

/** Drop case-insensitive duplicates, keeping the oldest document for each name. */
async function dedupeSalesMaterials() {
  const all = await SalesMaterial.find().sort({ createdAt: 1 });
  const seen = new Map();
  const removeIds = [];
  for (const mat of all) {
    const key = String(mat.name || '').trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      removeIds.push(mat._id);
    } else {
      seen.set(key, mat);
    }
  }
  if (removeIds.length > 0) {
    await SalesMaterial.deleteMany({ _id: { $in: removeIds } });
  }
  return Array.from(seen.values()).sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
}

router.get('/', async (_req, res) => {
  try {
    const materials = await dedupeSalesMaterials();
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

    const existing = await findByNameCI(name);
    if (existing) {
      return res.json(existing);
    }

    const material = await SalesMaterial.create({ name });
    res.status(201).json(material);
  } catch (error) {
    if (error.code === 11000) {
      const existing = await findByNameCI(String(req.body.name || '').trim());
      if (existing) return res.json(existing);
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

    const duplicate = await findByNameCI(name, req.params.id);
    if (duplicate) {
      return res.status(400).json({ message: 'Material already exists (same name, different capitalization)' });
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
