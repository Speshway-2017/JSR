import mongoose from 'mongoose';

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/agriTrades';

  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => {
    console.error('MongoDB disconnected — will retry on next request');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err.message);
  });

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error on ${uri}:`, error.message);

    if (uri.includes(':27018')) {
      const fallbackUri = uri.replace(':27018', ':27017');
      console.log(`Attempting fallback to ${fallbackUri}…`);
      try {
        const conn = await mongoose.connect(fallbackUri, {
          serverSelectionTimeoutMS: 15000,
          connectTimeoutMS: 15000,
          socketTimeoutMS: 45000,
          maxPoolSize: 10,
        });
        console.log(`MongoDB connected (fallback): ${conn.connection.host}`);
        return;
      } catch (fallbackError) {
        console.error('MongoDB fallback connection error:', fallbackError.message);
      }
    }
    process.exit(1);
  }
};

export function isDbReady() {
  return mongoose.connection.readyState === 1;
}

export async function waitForDb(timeoutMs = 4000) {
  if (mongoose.connection.readyState === 1) return true;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (mongoose.connection.readyState === 1) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return mongoose.connection.readyState === 1;
}

export default connectDB;

