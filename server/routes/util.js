import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import { apiErrorMessage } from '../utils/apiError.js';
import { backupToAtlas, restoreFromAtlas, isAtlasNetworkError } from '../utils/atlasSync.js';
import { ensureDefaultUsers } from '../utils/ensureAdmin.js';
import { refreshLicense } from '../utils/license.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

function atlasErrorResponse(error, res) {
  if (error.code === 'ATLAS_OFFLINE' || isAtlasNetworkError(error)) {
    return res.status(503).json({
      message: error.message || 'No internet connection. Connect to the internet to continue.',
    });
  }
  return res.status(error.status || 500).json({ message: apiErrorMessage(error) });
}

router.post('/backup', async (_req, res) => {
  try {
    const stats = await backupToAtlas();
    res.json({
      message: 'Backup saved to MongoDB Atlas',
      collections: stats.collections,
      documents: stats.documents,
    });
  } catch (error) {
    atlasErrorResponse(error, res);
  }
});

router.post('/restore', async (_req, res) => {
  try {
    const stats = await restoreFromAtlas();
    await ensureDefaultUsers();
    await refreshLicense();
    res.json({
      message: 'Local database restored from Atlas',
      collections: stats.collections,
      documents: stats.documents,
    });
  } catch (error) {
    atlasErrorResponse(error, res);
  }
});

export default router;
