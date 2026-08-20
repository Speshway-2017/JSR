import { atlasMongoUri, isAtlasNetworkError } from './atlasSync.js';
import mongoose from 'mongoose';
import { getOrCreateCompany } from './bankBalance.js';

const { MongoClient } = mongoose.mongo;

const COLLECTION = 'app_license';
const DOC_ID = 'jsr';
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

export const MSG_EXPIRED_SUPPORT =
  'License expired. Contact Support team from Speshway to reactivate the license.';
export const MSG_EXPIRED_OFFLINE =
  'License is expired. Connect to the internet to check the license status.';

let state = {
  unlocked: false,
  locked: false,
  message: '',
};

export function getLicenseState() {
  return { ...state };
}

function setState(next) {
  state = { unlocked: !!next.unlocked, locked: !!next.locked, message: next.message || '' };
  return getLicenseState();
}

function daysElapsed(from) {
  if (!from) return 0;
  return Date.now() - new Date(from).getTime();
}

async function withAtlasDb(fn) {
  const client = new MongoClient(atlasMongoUri(), {
    serverSelectionTimeoutMS: 12000,
    connectTimeoutMS: 12000,
  });
  try {
    await client.connect();
    return await fn(client.db());
  } catch (error) {
    if (isAtlasNetworkError(error)) {
      const err = new Error('offline');
      err.code = 'ATLAS_OFFLINE';
      throw err;
    }
    throw error;
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }
}

async function loadAtlasLicense(db) {
  const col = db.collection(COLLECTION);
  let doc = await col.findOne({ _id: DOC_ID });
  if (!doc) {
    doc = { _id: DOC_ID, lifetime: false, firstReadAt: null, updatedAt: new Date() };
    await col.insertOne(doc);
  }
  return { col, doc };
}

/**
 * Check Atlas `lifetime`. Clock starts on first online read while lifetime is false.
 * After 10 days: still false → lock (support message); offline → lock (connect message).
 * lifetime true → unlock locally and never check again.
 */
export async function refreshLicense() {
  const company = await getOrCreateCompany();

  if (company.licenseUnlocked) {
    return setState({ unlocked: true, locked: false, message: '' });
  }

  const localFirst = company.licenseFirstReadAt;
  const pastGrace = localFirst && daysElapsed(localFirst) >= TEN_DAYS_MS;

  try {
    return await withAtlasDb(async (db) => {
      const { col, doc } = await loadAtlasLicense(db);

      if (doc.lifetime === true) {
        company.licenseUnlocked = true;
        await company.save();
        return setState({ unlocked: true, locked: false, message: '' });
      }

      let firstReadAt = doc.firstReadAt ? new Date(doc.firstReadAt) : null;
      if (!firstReadAt) {
        firstReadAt = new Date();
        await col.updateOne(
          { _id: DOC_ID },
          { $set: { firstReadAt, updatedAt: new Date(), lifetime: false } }
        );
      }
      if (!company.licenseFirstReadAt) {
        company.licenseFirstReadAt = firstReadAt;
        await company.save();
      }

      const start = company.licenseFirstReadAt || firstReadAt;
      if (daysElapsed(start) >= TEN_DAYS_MS) {
        return setState({ unlocked: false, locked: true, message: MSG_EXPIRED_SUPPORT });
      }

      return setState({ unlocked: false, locked: false, message: '' });
    });
  } catch (error) {
    if (error.code === 'ATLAS_OFFLINE' || isAtlasNetworkError(error)) {
      if (pastGrace) {
        return setState({ unlocked: false, locked: true, message: MSG_EXPIRED_OFFLINE });
      }
      return setState({ unlocked: false, locked: false, message: '' });
    }
    console.error('License check failed:', error.message);
    if (pastGrace) {
      return setState({ unlocked: false, locked: true, message: MSG_EXPIRED_OFFLINE });
    }
    return setState({ unlocked: false, locked: false, message: '' });
  }
}

export function licenseLockMiddleware(req, res, next) {
  const p = req.path || '';
  if (
    p === '/health' ||
    p.startsWith('/license') ||
    p.startsWith('/auth')
  ) {
    return next();
  }
  if (state.locked) {
    return res.status(403).json({
      code: 'LICENSE_EXPIRED',
      message: state.message || MSG_EXPIRED_SUPPORT,
    });
  }
  next();
}
