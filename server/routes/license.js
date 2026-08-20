import express from 'express';
import { getLicenseState, refreshLicense } from '../utils/license.js';
import { apiErrorMessage } from '../utils/apiError.js';

const router = express.Router();

router.get('/status', async (_req, res) => {
  try {
    const status = await refreshLicense();
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
