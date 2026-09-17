import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {
  /* ignore */
}
import connectDB, { isDbReady, waitForDb } from './config/db.js';
import { ensureDefaultUsers } from './utils/ensureAdmin.js';
import { initSocket, notifyDataChange } from './utils/socket.js';
import authRoutes from './routes/auth.js';
import vendorRoutes from './routes/vendors.js';
import materialRoutes from './routes/materials.js';
import loadRoutes from './routes/loads.js';
import saleRoutes from './routes/sales.js';
import transactionRoutes from './routes/transactions.js';
import inventoryRoutes from './routes/inventory.js';
import customerRoutes from './routes/customers.js';
import settingsRoutes from './routes/settings.js';
import salesBagReportRoutes from './routes/salesBagReports.js';
import salesMaterialRoutes from './routes/salesMaterials.js';
import scheduleRoutes from './routes/schedules.js';
import transliterateRoutes from './routes/transliterate.js';
import purchaseRoutes from './routes/purchases.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import utilRoutes from './routes/util.js';
import licenseRoutes from './routes/license.js';
import whatsappRoutes from './routes/whatsapp.js';
import { licenseLockMiddleware, refreshLicense } from './utils/license.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env'), override: true });
dotenv.config({ path: path.join(__dirname, 'atlas.env'), override: true });
const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.join(__dirname, '../client/dist');
const STARTUP_TOKEN = process.env.JSR_STARTUP_TOKEN || '';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Automatic real-time socket notification on successful data mutations
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (body) {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && res.statusCode >= 200 && res.statusCode < 300) {
      const parts = (req.baseUrl || req.path).split('/').filter(Boolean);
      const entity = parts[1] || parts[0] || 'general';
      notifyDataChange(entity, req.method.toLowerCase(), body);
    }
    return originalJson.call(this, body);
  };
  next();
});

app.get('/api/health', async (_, res) => {
  const dbOk = await waitForDb(1500);
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    message: 'JSR API running',
    db: dbOk ? 'connected' : 'disconnected',
    token: STARTUP_TOKEN || undefined,
  });
});

// Fail fast with a clear message when embedded MongoDB is down (waiting briefly if connecting)
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
  const dbReady = await waitForDb(4000);
  if (!dbReady) {
    return res.status(503).json({
      message:
        'Database is not ready. Close JSR completely from the system tray/taskbar, wait a few seconds, and open it again.',
    });
  }
  next();
});

app.use('/api', licenseLockMiddleware);
app.use('/api/license', licenseRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/transliterate', transliterateRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/loads', loadRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/sales-bag-reports', salesBagReportRoutes);
app.use('/api/sales-materials', salesMaterialRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/util', utilRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Serve React build for Electron / production desktop
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Convert raw Mongo connection errors into a clear API response
app.use((err, _req, res, next) => {
  if (!err) return next();
  const msg = err.message || String(err);
  if (
    err.name === 'MongoServerSelectionError' ||
    err.name === 'MongoNetworkError' ||
    /ECONNREFUSED.*27018|buffering timed out|topology was destroyed/i.test(msg)
  ) {
    if (res.headersSent) return next(err);
    return res.status(503).json({
      message:
        'Database connection lost. Close JSR fully, wait a few seconds, then open it again.',
    });
  }
  console.error('[API Error]:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || err.statusCode || 500).json({ message: msg || 'Server error' });
});

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  await ensureDefaultUsers();
  refreshLicense().catch((err) => console.error('License check:', err.message));
  const httpServer = createServer(app);
  initSocket(httpServer);
  httpServer.listen(PORT, '0.0.0.0', () => console.log(`Server running with Socket.io on port ${PORT}`));
  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other process or reuse it with: npm run electron:open`);
      process.exit(1);
    }
    throw err;
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

