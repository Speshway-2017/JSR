import express from 'express';
import { getLicenseState, refreshLicense } from '../utils/license.js';
import { apiErrorMessage } from '../utils/apiError.js';

const router = express.Router();

router.get('/status', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const status = await refreshLicense({ force });
    res.json(status);
  } catch (error) {
    const fallback = getLicenseState();
    res.status(fallback.locked ? 200 : 500).json(
      fallback.locked
        ? fallback
        : { unlocked: false, locked: false, message: apiErrorMessage(error) }
    );
  }
});

router.post('/check', async (_req, res) => {
  try {
    const status = await refreshLicense({ force: true });
    res.json(status);
  } catch (error) {
    const fallback = getLicenseState();
    res.status(fallback.locked ? 200 : 500).json(
      fallback.locked
        ? fallback
        : { unlocked: false, locked: false, message: apiErrorMessage(error) }
    );
  }
});

export default router;
