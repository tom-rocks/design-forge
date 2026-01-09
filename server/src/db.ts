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
    await client.query(`
      CREATE TABLE IF NOT EXISTS generations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt TEXT NOT NULL,
        model VARCHAR(50),
        resolution VARCHAR(10),
        aspect_ratio VARCHAR(10),
        mode VARCHAR(10) DEFAULT 'create',
        parent_id UUID REFERENCES generations(id) ON DELETE SET NULL,
        image_paths TEXT[] NOT NULL DEFAULT '{}',
        thumbnail_path TEXT,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_generations_parent_id ON generations(parent_id);
    `);
    console.log('[DB] Database schema initialized');
  } catch (err) {
    console.error('[DB] Failed to initialize schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

export interface Generation {
  id: string;
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

// Save a new generation
export async function saveGeneration(params: SaveGenerationParams): Promise<Generation> {
  const { prompt, model, resolution, aspectRatio, mode, parentId, imagePaths, thumbnailPath, settings } = params;
  
  const result = await pool.query<Generation>(
    `INSERT INTO generations (prompt, model, resolution, aspect_ratio, mode, parent_id, image_paths, thumbnail_path, settings)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [prompt, model, resolution, aspectRatio, mode, parentId || null, imagePaths, thumbnailPath || null, settings || {}]
  );
  
  console.log(`[DB] Saved generation ${result.rows[0].id}`);
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
