import express from 'express';
import PriceSettings from '../models/PriceSettings.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

async function getOrCreateSettings() {
  let settings = await PriceSettings.findOne();
  if (!settings) {
    settings = await PriceSettings.create({});
  }
  return settings;
}

router.get('/', async (_req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { labour, aaseelu, bill, unionCharges, commissionPercent } = req.body;
    const settings = await getOrCreateSettings();

    if (labour !== undefined) settings.labour = Math.max(0, Number(labour) || 0);
    if (aaseelu !== undefined) settings.aaseelu = Math.max(0, Number(aaseelu) || 0);
    if (bill !== undefined) settings.bill = Math.max(0, Number(bill) || 0);
    if (unionCharges !== undefined) settings.unionCharges = Math.max(0, Number(unionCharges) || 0);
    if (commissionPercent !== undefined) {
      settings.commissionPercent = Math.min(100, Math.max(0, Number(commissionPercent) || 0));
    }

    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
