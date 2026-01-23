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
    
    // Favorite folders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS favorite_folders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_favorite_folders_user_id ON favorite_folders(user_id);
    `);
    console.log('[DB] Favorite folders table ready');
    
    // Favorites table (items, works, or dropped images)
    await client.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        item_data JSONB NOT NULL,
        folder_id UUID REFERENCES favorite_folders(id) ON DELETE SET NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_favorites_folder_id ON favorites(folder_id);
    `);
    console.log('[DB] Favorites table ready');
    
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
    numImages?: number;
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

// ============================================
// FAVORITES
// ============================================

export interface FavoriteFolder {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: Date;
}

export interface Favorite {
  id: string;
  user_id: string;
  type: 'item' | 'work' | 'image';
  item_data: {
    imageUrl: string;
    name?: string;
    category?: string;
    rarity?: string;
    prompt?: string;
    generationId?: string;
    itemId?: string;  // dispId for items (e.g., "shirt-cool-jacket")
  };
  folder_id: string | null;
  sort_order: number;
  created_at: Date;
}

// Get all favorites and folders for a user
export async function getFavorites(userId: string): Promise<{ favorites: Favorite[]; folders: FavoriteFolder[] }> {
  const foldersResult = await pool.query<FavoriteFolder>(
    'SELECT * FROM favorite_folders WHERE user_id = $1 ORDER BY sort_order ASC',
    [userId]
  );
  
  const favoritesResult = await pool.query<Favorite>(
    'SELECT * FROM favorites WHERE user_id = $1 ORDER BY sort_order ASC',
    [userId]
  );
  
  return {
    folders: foldersResult.rows,
    favorites: favoritesResult.rows,
  };
}

// Add a favorite
export async function addFavorite(params: {
  userId: string;
  type: Favorite['type'];
  itemData: Favorite['item_data'];
  folderId?: string;
}): Promise<Favorite> {
  const { userId, type, itemData, folderId } = params;
  
  // Get max sort_order for this user
  const maxResult = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM favorites WHERE user_id = $1',
    [userId]
  );
  const sortOrder = maxResult.rows[0].next_order;
  
  const result = await pool.query<Favorite>(
    `INSERT INTO favorites (user_id, type, item_data, folder_id, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, type, itemData, folderId || null, sortOrder]
  );
  
  return result.rows[0];
}

// Update a favorite (move to folder, update sort_order)
export async function updateFavorite(id: string, userId: string, updates: {
  folderId?: string | null;
  sortOrder?: number;
}): Promise<Favorite | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  if (updates.folderId !== undefined) {
    setClauses.push(`folder_id = $${paramIndex++}`);
    values.push(updates.folderId);
  }
  if (updates.sortOrder !== undefined) {
    setClauses.push(`sort_order = $${paramIndex++}`);
    values.push(updates.sortOrder);
  }
  
  if (setClauses.length === 0) return null;
  
  values.push(id, userId);
  const result = await pool.query<Favorite>(
    `UPDATE favorites SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex} RETURNING *`,
    values
  );
  
  return result.rows[0] || null;
}

// Delete a favorite
export async function deleteFavorite(id: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM favorites WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

// Batch reorder favorites
export async function reorderFavorites(userId: string, items: { id: string; sortOrder: number; folderId?: string | null }[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        'UPDATE favorites SET sort_order = $1, folder_id = $2 WHERE id = $3 AND user_id = $4',
        [item.sortOrder, item.folderId ?? null, item.id, userId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Create a folder
export async function createFavoriteFolder(userId: string, name: string): Promise<FavoriteFolder> {
  // Get max sort_order
  const maxResult = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM favorite_folders WHERE user_id = $1',
    [userId]
  );
  const sortOrder = maxResult.rows[0].next_order;
  
  const result = await pool.query<FavoriteFolder>(
    `INSERT INTO favorite_folders (user_id, name, sort_order)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, name, sortOrder]
  );
  
  return result.rows[0];
}

// Rename a folder
export async function renameFavoriteFolder(id: string, userId: string, name: string): Promise<FavoriteFolder | null> {
  const result = await pool.query<FavoriteFolder>(
    'UPDATE favorite_folders SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [name, id, userId]
  );
  return result.rows[0] || null;
}

// Delete a folder (favorites in it will have folder_id set to NULL)
export async function deleteFavoriteFolder(id: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM favorite_folders WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

// Batch reorder folders
export async function reorderFavoriteFolders(userId: string, folders: { id: string; sortOrder: number }[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const folder of folders) {
      await client.query(
        'UPDATE favorite_folders SET sort_order = $1 WHERE id = $2 AND user_id = $3',
        [folder.sortOrder, folder.id, userId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Check if an item is favorited (by imageUrl)
export async function isFavorited(userId: string, imageUrl: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM favorites WHERE user_id = $1 AND item_data->>'imageUrl' = $2 LIMIT 1`,
    [userId, imageUrl]
  );
  return result.rows.length > 0;
}

// Get favorited image URLs and item IDs for a user (for quick lookup)
export async function getFavoritedUrls(userId: string): Promise<{ urls: Set<string>; itemIds: Set<string> }> {
  const result = await pool.query(
    `SELECT item_data->>'imageUrl' as url, item_data->>'itemId' as item_id FROM favorites WHERE user_id = $1`,
    [userId]
  );
  return {
    urls: new Set(result.rows.map(r => r.url).filter(Boolean)),
    itemIds: new Set(result.rows.map(r => r.item_id).filter(Boolean)),
  };
}

// Helper to check if a string looks like a MongoDB ObjectId (24 hex chars)
function isMongoId(str: string): boolean {
  return /^[a-f0-9]{24}$/i.test(str);
}

// Helper to extract dispId from a URL
function extractDispIdFromUrl(url: string): string | null {
  // Skip data URLs - can't extract dispId
  if (url.startsWith('data:')) {
    return null;
  }
  
  // Try various URL patterns:
  // https://production-ap.highrise.game/avataritem/front/shirt-cool-jacket.png
  // https://cdn.highrisegame.com/avatar/shirt-cool-jacket.png
  // https://cdn.highrisegame.com/background/bg-something/full
  // https://cdn.highrisegame.com/container/cn-something/full
  // /api/highrise/proxy/shirt-cool-jacket.png
  
  // Server proxy pattern: /api/highrise/proxy/{dispId}.png
  const proxyMatch = url.match(/\/api\/highrise\/proxy\/([^/.?]+)\.png/);
  if (proxyMatch) return proxyMatch[1];
  
  // AP URL pattern: /avataritem/front/{dispId}.png
  const apMatch = url.match(/\/avataritem\/front\/([^/.?]+)\.png/);
  if (apMatch) return apMatch[1];
  
  // CDN avatar pattern: /avatar/{dispId}.png
  const cdnAvatarMatch = url.match(/cdn\.highrisegame\.com\/avatar\/([^/.?]+)\.png/);
  if (cdnAvatarMatch) return cdnAvatarMatch[1];
  
  // CDN background pattern: /background/{dispId}/full
  const cdnBgMatch = url.match(/cdn\.highrisegame\.com\/background\/([^/?]+)\/full/);
  if (cdnBgMatch) return cdnBgMatch[1];
  
  // CDN container pattern: /container/{dispId}/full
  const cdnContainerMatch = url.match(/cdn\.highrisegame\.com\/container\/([^/?]+)\/full/);
  if (cdnContainerMatch) return cdnContainerMatch[1];
  
  return null;
}

// Repair favorites that have MongoDB ObjectId instead of dispId
export async function repairFavoriteItemIds(userId: string): Promise<{ fixed: number; failed: number; total: number }> {
  // Get all item favorites for this user
  const result = await pool.query<Favorite>(
    `SELECT * FROM favorites WHERE user_id = $1 AND type = 'item'`,
    [userId]
  );
  
  let fixed = 0;
  let failed = 0;
  
  for (const fav of result.rows) {
    const currentItemId = fav.item_data.itemId;
    
    // Skip if no itemId or if it doesn't look like a MongoDB ID
    if (!currentItemId || !isMongoId(currentItemId)) {
      continue;
    }
    
    // Try to extract the correct dispId from the stored imageUrl
    const imageUrl = fav.item_data.imageUrl;
    const extractedDispId = extractDispIdFromUrl(imageUrl);
    
    if (extractedDispId && !isMongoId(extractedDispId)) {
      // Found a valid dispId - update the favorite
      const updatedItemData = { ...fav.item_data, itemId: extractedDispId };
      await pool.query(
        `UPDATE favorites SET item_data = $1 WHERE id = $2`,
        [updatedItemData, fav.id]
      );
      fixed++;
      console.log(`[Repair] Fixed favorite ${fav.id}: ${currentItemId} -> ${extractedDispId}`);
    } else {
      // Couldn't extract dispId - mark as failed but keep the favorite
      failed++;
      console.log(`[Repair] Could not fix favorite ${fav.id}: no dispId found in URL ${imageUrl}`);
    }
  }
  
  return { fixed, failed, total: result.rows.length };
}

export default pool;
