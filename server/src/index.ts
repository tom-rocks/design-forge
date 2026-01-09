import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import generateRouter from './routes/generate.js';
import highriseRouter from './routes/highrise.js';
import generationsRouter from './routes/generations.js';
import { initBridgeServer, isBridgeConnected } from './bridge.js';
import { initDatabase } from './db.js';
import { initStorage } from './storage.js';

// Load environment variables
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize database and storage
async function init() {
  // Only init DB if DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    try {
      await initDatabase();
      await initStorage();
      console.log('✅ Database and storage initialized');
    } catch (err) {
      console.error('❌ Failed to initialize database/storage:', err);
      // Continue without DB - generation will work but no persistence
    }
  } else {
    console.log('⚠️ No DATABASE_URL - running without persistence');
  }
}

// Initialize WebSocket bridge for AP connection
initBridgeServer(server);

// CORS - allow Railway frontend, local dev, and Highrise AP
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    /\.railway\.app$/,
    /design-forge.*\.railway\.app$/,
    /\.highrise\.game$/,
    /highrise\.game$/,
  ],
  credentials: true,
}));

// Increase JSON body limit for base64 images
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api', generateRouter);
app.use('/api/highrise', highriseRouter);
app.use('/api/generations', generationsRouter);

// Health check with bridge status
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasDatabase: !!process.env.DATABASE_URL,
    bridgeConnected: isBridgeConnected(),
  });
});

// Bridge status endpoint
app.get('/api/bridge/status', (_req, res) => {
  res.json({
    connected: isBridgeConnected(),
    timestamp: new Date().toISOString(),
  });
});

// Serve static files only if they exist (for Railway full deploy)
const clientPath = join(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (existsSync(clientPath)) {
  app.use(express.static(clientPath));
  app.get('*', (_req, res) => {
    res.sendFile(join(clientPath, 'index.html'));
  });
  console.log('📁 Serving static files from client/dist');
} else {
  console.log('⚡ API-only mode (no static files)');
}

// Start server after initialization
init().then(() => {
  server.listen(PORT, () => {
    console.log(`🔥 Design Forge server running on http://localhost:${PORT}`);
    console.log(`🌉 WebSocket bridge available at ws://localhost:${PORT}/ws/bridge`);
  });
});
