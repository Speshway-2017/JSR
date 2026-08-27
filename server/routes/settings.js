import express from 'express';
import PriceSettings from '../models/PriceSettings.js';
import { auth, requireRole } from '../middleware/auth.js';
import {
  DEDUCTION_FIELDS,
  emptyRatesFromSettings,
  migrateLegacySettings,
} from '../utils/deductionFields.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

async function getOrCreateSettings() {
  let settings = await PriceSettings.findOne();
  if (!settings) {
    settings = await PriceSettings.create({});
  }
  return settings;
}

function settingsResponse(doc) {
  const migrated = migrateLegacySettings(doc);
  return emptyRatesFromSettings(migrated);
}

router.get('/', async (_req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settingsResponse(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const settings = await getOrCreateSettings();

    for (const field of DEDUCTION_FIELDS) {
      if (req.body[field.key] !== undefined) {
        let val = Math.max(0, Number(req.body[field.key]) || 0);
        if (field.isCommission && req.body[`${field.key}PerBag`] !== true) {
          val = Math.min(100, val);
        }
        settings[field.key] = val;
      }
      const flag = `${field.key}PerBag`;
      if (req.body[flag] !== undefined) {
        settings[flag] = !!req.body[flag];
      }
    }

    if (req.body.bagLessUnder50 !== undefined) {
      settings.bagLessUnder50 = Math.max(0, Number(req.body.bagLessUnder50) || 0);
    }
    if (req.body.bagLessOver50 !== undefined) {
      settings.bagLessOver50 = Math.max(0, Number(req.body.bagLessOver50) || 0);
    }

    await settings.save();
    res.json(settingsResponse(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
