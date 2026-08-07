import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import { ensureAdminUser } from './utils/ensureAdmin.js';
import authRoutes from './routes/auth.js';
import vendorRoutes from './routes/vendors.js';
import materialRoutes from './routes/materials.js';
import loadRoutes from './routes/loads.js';
import saleRoutes from './routes/sales.js';
import transactionRoutes from './routes/transactions.js';
import inventoryRoutes from './routes/inventory.js';
import customerRoutes from './routes/customers.js';
import settingsRoutes from './routes/settings.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.join(__dirname, '../client/dist');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_, res) => res.json({ status: 'ok', message: 'AgriTrades API running' }));

app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/loads', loadRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/settings', settingsRoutes);

// Serve React build for Electron / production desktop
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  await ensureAdminUser();
  const server = app.listen(PORT, '127.0.0.1', () => console.log(`Server running on port ${PORT}`));
  server.on('error', (err) => {
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
