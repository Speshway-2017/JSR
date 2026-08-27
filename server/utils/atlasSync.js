import mongoose from 'mongoose';
import dns from 'dns';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {
  /* ignore */
}

const { MongoClient } = mongoose.mongo;

export function atlasMongoUri() {
  let uri = (process.env.ATLAS_MONGODB_URI || '').trim();
  if (!uri) {
    const err = new Error('Atlas connection is not configured');
    err.status = 500;
    throw err;
  }
  if (!/mongodb\.net\/[^/?]+/.test(uri)) {
    uri = uri.replace(/\.mongodb\.net\/?/, '.mongodb.net/agriTrades');
  }
  if (!/[?&]retryWrites=/.test(uri)) {
    uri += (uri.includes('?') ? '&' : '?') + 'retryWrites=true&w=majority';
  }
  return uri;
}

export function isAtlasNetworkError(error) {
  const msg = error?.message || String(error || '');
  const name = error?.name || '';
  return (
    name === 'MongoServerSelectionError' ||
    name === 'MongoNetworkError' ||
    name === 'MongoTimeoutError' ||
    /ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|querySrv|getaddrinfo|socket disconnected|failed to connect|timed out/i.test(
      msg
    )
  );
}

function atlasOfflineError(action) {
  const err = new Error(
    `No internet connection. Connect to the internet to ${action}.`
  );
  err.status = 503;
  err.code = 'ATLAS_OFFLINE';
  return err;
}

function localDb() {
  const db = mongoose.connection?.db;
  if (!db) {
    const err = new Error('Local database is not connected');
    err.status = 503;
    throw err;
  }
  return db;
}

const ATLAS_ONLY = new Set(['app_license']);

async function collectionNames(db) {
  const cols = await db.listCollections().toArray();
  return cols.map((c) => c.name).filter((n) => !n.startsWith('system.') && !ATLAS_ONLY.has(n));
}

async function copyAll(fromDb, toDb) {
  const names = await collectionNames(fromDb);
  for (const name of names) {
    const docs = await fromDb.collection(name).find({}).toArray();
    await toDb.collection(name).deleteMany({});
    if (docs.length) {
      await toDb.collection(name).insertMany(docs, { ordered: false });
    }
  }
  const destNames = await collectionNames(toDb);
  for (const name of destNames) {
    if (!names.includes(name)) {
      await toDb.collection(name).drop();
    }
  }
}

const DIRECT_ATLAS_URI =
  'mongodb://pcharan214_db_user:qOLV8MIpPentmdhI@ac-yesfnsx-shard-00-00.imzyidq.mongodb.net:27017,ac-yesfnsx-shard-00-01.imzyidq.mongodb.net:27017,ac-yesfnsx-shard-00-02.imzyidq.mongodb.net:27017/agriTrades?ssl=true&replicaSet=atlas-13bvev-shard-0&authSource=admin&retryWrites=true&w=majority';

async function withAtlas(fn, action) {
  const primaryUri = atlasMongoUri();
  let client = new MongoClient(primaryUri, {
    serverSelectionTimeoutMS: 12000,
    connectTimeoutMS: 12000,
  });
  try {
    await client.connect();
    return await fn(client.db());
  } catch (primaryError) {
    if (primaryUri.startsWith('mongodb+srv://') && /querySrv|ECONNREFUSED/i.test(primaryError.message)) {
      try {
        console.log(`[atlasSync] SRV DNS failed for ${action}, trying direct cluster seedlist...`);
        client = new MongoClient(DIRECT_ATLAS_URI, {
          serverSelectionTimeoutMS: 12000,
          connectTimeoutMS: 12000,
        });
        await client.connect();
        return await fn(client.db());
      } catch (fallbackError) {
        if (isAtlasNetworkError(fallbackError)) throw atlasOfflineError(action);
        throw fallbackError;
      }
    }

    if (isAtlasNetworkError(primaryError)) throw atlasOfflineError(action);
    throw primaryError;
  } finally {
    try {
      if (client) await client.close();
    } catch {
      /* ignore */
    }
  }
}

/** Local Mongo → Atlas */
export async function backupToAtlas() {
  const fromDb = localDb();
  let stats = { collections: 0, documents: 0 };
  await withAtlas(async (atlasDb) => {
    const names = await collectionNames(fromDb);
    stats.collections = names.length;
    for (const name of names) {
      stats.documents += await fromDb.collection(name).countDocuments();
    }
    await copyAll(fromDb, atlasDb);
  }, 'backup');
  return stats;
}

/** Atlas → local Mongo */
export async function restoreFromAtlas() {
  let stats = { collections: 0, documents: 0 };
  await withAtlas(async (atlasDb) => {
    const names = await collectionNames(atlasDb);
    stats.collections = names.length;
    for (const name of names) {
      stats.documents += await atlasDb.collection(name).countDocuments();
    }
    await copyAll(atlasDb, localDb());
  }, 'restore');
  return stats;
}
