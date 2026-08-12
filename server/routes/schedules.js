import express from 'express';
import Schedule from '../models/Schedule.js';
import Customer from '../models/Customer.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

router.get('/', async (req, res) => {
  try {
    const schedules = await Schedule.find().sort({ name: 1 });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Schedule name is required' });
    }

    const existing = await Schedule.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ message: 'Schedule already exists' });
    }

    const schedule = await Schedule.create({ name });
    res.status(201).json(schedule);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Schedule already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Schedule name is required' });
    }

    const duplicate = await Schedule.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${name}$`, 'i') },
    });
    if (duplicate) {
      return res.status(400).json({ message: 'Schedule already exists' });
    }

    const schedule = await Schedule.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true, runValidators: true }
    );
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    res.json(schedule);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Schedule already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const inUse = await Customer.exists({ schedule: req.params.id });
    if (inUse) {
      return res.status(400).json({ message: 'Schedule is used by customers and cannot be deleted' });
    }

    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    res.json({ message: 'Schedule deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
