import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import generateRouter from './routes/generate.js';

// Load environment variables
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// CORS - allow Railway frontend and local dev
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    /\.railway\.app$/,
    /design-forge.*\.railway\.app$/,
  ],
  credentials: true,
}));

app.use(express.json());

// API routes
app.use('/api', generateRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.KREA_API_KEY,
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

app.listen(PORT, () => {
  console.log(`🔥 Design Forge server running on http://localhost:${PORT}`);
});
