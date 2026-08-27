import { atlasMongoUri, isAtlasNetworkError } from './atlasSync.js';
import mongoose from 'mongoose';
import { getOrCreateCompany } from './bankBalance.js';
import dns from 'dns';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {
  /* ignore */
}

const { MongoClient } = mongoose.mongo;

const COLLECTION = 'app_license';
const DOC_ID = 'jsr';
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

export const MSG_OFFLINE_FIRST_LAUNCH =
  'Unable to verify your license. Please connect to the internet or contact the administrator.';
export const MSG_OFFLINE_VALIDATION_DUE =
  'Please connect to the internet to verify your license.';
export const MSG_LICENSE_INVALID =
  'Your license has expired or is no longer valid. Please contact the administrator.';
export const MSG_EXPIRED_SUPPORT = MSG_LICENSE_INVALID;
export const MSG_EXPIRED_OFFLINE = MSG_OFFLINE_VALIDATION_DUE;

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

const DIRECT_ATLAS_URI =
  'mongodb://pcharan214_db_user:qOLV8MIpPentmdhI@ac-yesfnsx-shard-00-00.imzyidq.mongodb.net:27017,ac-yesfnsx-shard-00-01.imzyidq.mongodb.net:27017,ac-yesfnsx-shard-00-02.imzyidq.mongodb.net:27017/agriTrades?ssl=true&replicaSet=atlas-13bvev-shard-0&authSource=admin&retryWrites=true&w=majority';

async function withAtlasDb(fn) {
  const primaryUri = atlasMongoUri();
  let client = new MongoClient(primaryUri, {
    serverSelectionTimeoutMS: 6000,
    connectTimeoutMS: 6000,
  });
  try {
    await client.connect();
    return await fn(client.db());
  } catch (primaryError) {
    // If SRV lookup failed (e.g. querySrv ECONNREFUSED), try fallback direct connection string
    if (primaryUri.startsWith('mongodb+srv://') && /querySrv|ECONNREFUSED/i.test(primaryError.message)) {
      try {
        console.log('[license] SRV DNS failed, trying direct cluster seedlist connection...');
        client = new MongoClient(DIRECT_ATLAS_URI, {
          serverSelectionTimeoutMS: 6000,
          connectTimeoutMS: 6000,
        });
        await client.connect();
        return await fn(client.db());
      } catch (fallbackError) {
        if (isAtlasNetworkError(fallbackError)) {
          const err = new Error('offline');
          err.code = 'ATLAS_OFFLINE';
          throw err;
        }
        throw fallbackError;
      }
    }

    if (isAtlasNetworkError(primaryError)) {
      const err = new Error('offline');
      err.code = 'ATLAS_OFFLINE';
      throw err;
    }
    throw primaryError;
  } finally {
    try {
      if (client) await client.close();
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
 * License validation workflow:
 * 1. If local `licenseUnlocked` is true or mode is 'LIFETIME' → unlock permanently.
 * 2. If within valid 10-day period (based on `lastSuccessfulValidationAt`) and clock not rolled back and not forced → unlock locally without network call.
 * 3. If validation is due (or 1st launch or forced or clock rolled back) → connect to Atlas cloud DB.
 *    a) Atlas `lifetime: true` → activate lifetime mode permanently, unlock locally.
 *    b) Atlas `lifetime: false` → update local `lastSuccessfulValidationAt = now`, update Atlas `firstReadAt` & `updatedAt`, unlock locally for next 10 days.
 *    c) Atlas offline & never validated (1st launch) → lock app with MSG_OFFLINE_FIRST_LAUNCH.
 *    d) Atlas offline & validation due → lock app with MSG_OFFLINE_VALIDATION_DUE.
 *    e) Atlas license revoked/disabled → lock app with MSG_LICENSE_INVALID.
 */
export async function refreshLicense(options = {}) {
  const { force = false } = options;
  const company = await getOrCreateCompany();

  // 1. Lifetime Mode check
  if (company.licenseUnlocked || company.licenseMode === 'LIFETIME') {
    return setState({ unlocked: true, locked: false, message: '' });
  }

  // 2. Check local validation state & clock tamper
  const now = Date.now();
  const lastValidTime = company.lastSuccessfulValidationAt
    ? new Date(company.lastSuccessfulValidationAt).getTime()
    : null;

  const clockRolledBack = lastValidTime && now < lastValidTime;
  const isValidationDue =
    force ||
    clockRolledBack ||
    !lastValidTime ||
    now - lastValidTime >= TEN_DAYS_MS;

  // If validation is NOT due, app is still within valid 10-day window
  if (!isValidationDue) {
    return setState({ unlocked: false, locked: false, message: '' });
  }

  // 3. Validation IS due — perform online validation with MongoDB Atlas
  try {
    return await withAtlasDb(async (db) => {
      const { col, doc } = await loadAtlasLicense(db);

      // Check if license is explicitly revoked or disabled in Atlas
      if (doc.disabled === true || doc.status === 'revoked') {
        company.licenseRevoked = true;
        await company.save();
        console.log('[license] License validation failed: license revoked or disabled');
        return setState({ unlocked: false, locked: true, message: MSG_LICENSE_INVALID });
      }

      // Check Lifetime Flag in Atlas
      if (doc.lifetime === true) {
        company.licenseUnlocked = true;
        company.licenseMode = 'LIFETIME';
        company.licenseRevoked = false;
        company.lastSuccessfulValidationAt = new Date();
        await company.save();
        console.log('[license] License switched to lifetime mode');
        return setState({ unlocked: true, locked: false, message: '' });
      }

      // Non-Lifetime Periodic Mode (lifetime: false)
      let firstReadAt = doc.firstReadAt ? new Date(doc.firstReadAt) : null;
      const updatedAt = new Date();
      if (!firstReadAt) {
        firstReadAt = new Date();
        await col.updateOne(
          { _id: DOC_ID },
          { $set: { firstReadAt, updatedAt, lifetime: false } }
        );
      } else {
        await col.updateOne(
          { _id: DOC_ID },
          { $set: { updatedAt } }
        );
      }

      company.licenseMode = 'PERIODIC';
      company.licenseFirstReadAt = firstReadAt;
      company.lastSuccessfulValidationAt = new Date();
      company.lastServerTime = updatedAt;
      company.licenseRevoked = false;
      await company.save();

      console.log('[license] License validation successful. Next check due in 10 days.');
      return setState({ unlocked: false, locked: false, message: '' });
    });
  } catch (error) {
    const isOffline = error.code === 'ATLAS_OFFLINE' || isAtlasNetworkError(error);

    if (isOffline) {
      console.log('[license] License validation required but network unavailable.');
      if (!lastValidTime) {
        return setState({ unlocked: false, locked: true, message: MSG_OFFLINE_FIRST_LAUNCH });
      }
      return setState({ unlocked: false, locked: true, message: MSG_OFFLINE_VALIDATION_DUE });
    }

    console.error('[license] License check error:', error.message);
    if (!lastValidTime) {
      return setState({ unlocked: false, locked: true, message: MSG_OFFLINE_FIRST_LAUNCH });
    }
    return setState({ unlocked: false, locked: true, message: MSG_OFFLINE_VALIDATION_DUE });
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
      message: state.message || MSG_OFFLINE_VALIDATION_DUE,
    });
  }
  next();
}
