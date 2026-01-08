import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import generateRouter from './routes/generate.js';

// Load environment variables
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', generateRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
const clientPath = join(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.static(clientPath));
app.get('*', (_req, res) => {
  res.sendFile(join(clientPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🔥 Design Forge server running on http://localhost:${PORT}`);
});
