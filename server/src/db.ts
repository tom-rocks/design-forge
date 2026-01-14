import pg from 'pg';

const { Pool } = pg;

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Initialize database schema
export async function initDatabase() {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        google_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        avatar_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    console.log('[DB] Users table ready');
    
    // Generations table (base)
    await client.query(`
      CREATE TABLE IF NOT EXISTS generations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt TEXT NOT NULL,
        model VARCHAR(50),
        resolution VARCHAR(10),
        aspect_ratio VARCHAR(10),
        mode VARCHAR(10) DEFAULT 'create',
        parent_id UUID,
        image_paths TEXT[] NOT NULL DEFAULT '{}',
        thumbnail_path TEXT,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // Add user_id column if it doesn't exist (migration for existing tables)
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'generations' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE generations ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    console.log('[DB] Generations table ready');
    
    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_generations_parent_id ON generations(parent_id);
      CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
    `);
    
    console.log('[DB] Database schema initialized');
  } catch (err) {
    console.error('[DB] Failed to initialize schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

export interface User {
  id: string;
  google_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: Date;
  last_login: Date;
}

export interface Generation {
  id: string;
  user_id: string | null;
  prompt: string;
  model: string;
  resolution: string;
  aspect_ratio: string;
  mode: 'create' | 'edit';
  parent_id: string | null;
  image_paths: string[];
  thumbnail_path: string | null;
  settings: {
    styleImages?: { url: string; name?: string }[];
    negativePrompt?: string;
  };
  created_at: Date;
}

export interface SaveGenerationParams {
  userId?: string;
  prompt: string;
  model: string;
  resolution: string;
  aspectRatio: string;
  mode: 'create' | 'edit';
  parentId?: string;
  imagePaths: string[];
  thumbnailPath?: string;
  settings?: Generation['settings'];
}

// Find or create user by Google profile
export async function findOrCreateUser(profile: {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}): Promise<User> {
  const { googleId, email, name, avatarUrl } = profile;
  
  // Try to find existing user
  const existing = await pool.query<User>(
    'SELECT * FROM users WHERE google_id = $1',
    [googleId]
  );
  
  if (existing.rows[0]) {
    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW(), name = COALESCE($2, name), avatar_url = COALESCE($3, avatar_url) WHERE id = $1',
      [existing.rows[0].id, name, avatarUrl]
    );
    return existing.rows[0];
  }
  
  // Create new user
  const result = await pool.query<User>(
    `INSERT INTO users (google_id, email, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [googleId, email, name || null, avatarUrl || null]
  );
  
  console.log(`[DB] Created new user: ${result.rows[0].email}`);
  return result.rows[0];
}

// Get user by ID
export async function getUserById(id: string): Promise<User | null> {
  const result = await pool.query<User>(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

// Save a new generation
export async function saveGeneration(params: SaveGenerationParams): Promise<Generation> {
  const { userId, prompt, model, resolution, aspectRatio, mode, parentId, imagePaths, thumbnailPath, settings } = params;
  
  const result = await pool.query<Generation>(
    `INSERT INTO generations (user_id, prompt, model, resolution, aspect_ratio, mode, parent_id, image_paths, thumbnail_path, settings)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [userId || null, prompt, model, resolution, aspectRatio, mode, parentId || null, imagePaths, thumbnailPath || null, settings || {}]
  );
  
  console.log(`[DB] Saved generation ${result.rows[0].id} for user ${userId || 'anonymous'}`);
  return result.rows[0];
}

// Get all generations (paginated, newest first)
export async function getGenerations(limit = 50, offset = 0): Promise<{ generations: Generation[]; total: number }> {
  const countResult = await pool.query('SELECT COUNT(*) FROM generations');
  const total = parseInt(countResult.rows[0].count, 10);
  
  const result = await pool.query<Generation>(
    `SELECT * FROM generations ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  
  return { generations: result.rows, total };
}

// Get generations by user ID (paginated, newest first)
export async function getGenerationsByUser(userId: string, limit = 50, offset = 0): Promise<{ generations: Generation[]; total: number }> {
  const countResult = await pool.query('SELECT COUNT(*) FROM generations WHERE user_id = $1', [userId]);
  const total = parseInt(countResult.rows[0].count, 10);
  
  const result = await pool.query<Generation>(
    `SELECT * FROM generations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  
  return { generations: result.rows, total };
}

// Get a single generation by ID
export async function getGeneration(id: string): Promise<Generation | null> {
  const result = await pool.query<Generation>(
    'SELECT * FROM generations WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

// Delete a generation
export async function deleteGeneration(id: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM generations WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

// Get edit chain (all ancestors of a generation)
export async function getEditChain(id: string): Promise<Generation[]> {
  const result = await pool.query<Generation>(
    `WITH RECURSIVE chain AS (
      SELECT * FROM generations WHERE id = $1
      UNION ALL
      SELECT g.* FROM generations g
      JOIN chain c ON g.id = c.parent_id
    )
    SELECT * FROM chain ORDER BY created_at ASC`,
    [id]
  );
  return result.rows;
}

export default pool;
