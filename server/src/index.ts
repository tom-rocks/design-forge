import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import { createServer } from 'http';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import generateRouter from './routes/generate.js';
import highriseRouter from './routes/highrise.js';
import generationsRouter from './routes/generations.js';
import authRouter, { setupPassport } from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import favoritesRouter from './routes/favorites.js';
import alloysRouter from './routes/alloys.js';
import assetsRouter from './routes/assets.js';
import migrateThumbnailsRouter from './routes/migrate-thumbnails.js';
import { initBridgeServer, isBridgeConnected } from './bridge.js';
import pool, { initDatabase } from './db.js';
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

// Security headers (relaxed for our use case - embedded in AP iframe)
app.use(helmet({
  contentSecurityPolicy: false, // We load from various origins
  crossOriginEmbedderPolicy: false, // Allow embedding
  crossOriginOpenerPolicy: false, // Allow cross-origin
  crossOriginResourcePolicy: false, // Allow images to load
  frameguard: false, // Allow embedding in AP iframe
}));

// Gzip/Brotli compression for responses (~70% smaller)
// Skip compression for images (already compressed)
app.use(compression({
  filter: (req, res) => {
    const contentType = res.getHeader('Content-Type');
    if (typeof contentType === 'string' && contentType.startsWith('image/')) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

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

// Trust proxy for Railway (needed for secure cookies)
const isProduction = process.env.RAILWAY_ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production';
if (isProduction) {
  app.set('trust proxy', 1);
}

// Session configuration with PostgreSQL store for persistence across restarts
const PgSession = connectPgSimple(session);
const sessionConfig: session.SessionOptions = {
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: isProduction ? 'none' : 'lax',
  },
};

// Use PostgreSQL session store in production if database is available
if (process.env.DATABASE_URL) {
  sessionConfig.store = new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  });
  console.log('🔐 Using PostgreSQL session store');
} else {
  console.log('⚠️ Using in-memory session store (no DATABASE_URL)');
}

app.use(session(sessionConfig));

console.log(`🔐 Session config: secure=${isProduction}, sameSite=${isProduction ? 'none' : 'lax'}`);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Setup Google OAuth if configured
setupPassport();

// Rate limiting for generation endpoint (prevent abuse)
const generateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: { error: 'Too many generation requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API routes
app.use('/api/generate', generateLimiter, generateRouter);
app.use('/api', generateRouter); // Keep old route for backwards compat
app.use('/api/highrise', highriseRouter);
app.use('/api/generations', generationsRouter);
app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/alloys', alloysRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/admin', migrateThumbnailsRouter);

// Health check with bridge status
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasDatabase: !!process.env.DATABASE_URL,
    hasGoogleAuth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
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
