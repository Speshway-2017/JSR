import express from 'express';
import { auth } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

/**
 * English/phonetic → Telugu via Google Input Tools (same idea as legacy Account form).
 * GET /api/transliterate/telugu?text=Ramesh
 */
router.get('/telugu', async (req, res) => {
  try {
    const text = String(req.query.text || '').trim();
    if (!text) {
      return res.json({ telugu: '' });
    }

    const url =
      'https://inputtools.google.com/request?' +
      new URLSearchParams({
        text,
        itc: 'te-t-i0-und',
        num: '1',
        cp: '0',
        cs: '1',
        ie: 'utf-8',
        oe: 'utf-8',
        app: 'jsr',
      }).toString();

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ message: 'Transliteration service unavailable', telugu: '' });
    }

    const data = await response.json();
    const telugu =
      Array.isArray(data) && data[0] === 'SUCCESS' ? data[1]?.[0]?.[1]?.[0] || '' : '';

    res.json({ telugu });
  } catch (error) {
    res.status(500).json({ message: error.message, telugu: '' });
  }
});

export default router;
