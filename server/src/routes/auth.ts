import { Router, Request, Response } from 'express';
import { getUserById, User } from '../db.js';
import pool from '../db.js';

const router = Router();

// Extend Express types
declare global {
  namespace Express {
    interface User {
      id: string;
      google_id: string;
      email: string;
      name: string | null;
      avatar_url: string | null;
    }
  }
}

// No-op for backwards compatibility (called from index.ts)
export function setupPassport() {
  console.log('🔐 Password-based auth configured (Google OAuth removed)');
  return true;
}

// The known user's Google ID (used to find the account in the DB)
const OWNER_GOOGLE_ID = '113838337580596527498';
const AUTH_PASSWORD = process.env.FORGE_PASSWORD || 'forgemaster';

// Password login - finds the owner account and creates a session
router.post('/login', async (req: Request, res: Response) => {
  const { password } = req.body;
  
  if (!password || password !== AUTH_PASSWORD) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  
  try {
    // Find the existing user account by google_id
    const result = await pool.query<User>(
      'SELECT * FROM users WHERE google_id = $1',
      [OWNER_GOOGLE_ID]
    );
    
    const user = result.rows[0];
    if (!user) {
      res.status(404).json({ error: 'User account not found' });
      return;
    }
    
    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );
    
    // Set session manually (no passport needed)
    (req.session as any).userId = user.id;
    
    // Also set req.user for immediate use
    (req as any).user = user;
    
    console.log(`[Auth] Password login success for user: ${user.email} (${user.id})`);
    
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user (checks session)
router.get('/me', async (req: Request, res: Response) => {
  const userId = (req.session as any)?.userId;
  
  if (!userId) {
    res.json({ authenticated: false, user: null });
    return;
  }
  
  try {
    const user = await getUserById(userId);
    if (!user) {
      res.json({ authenticated: false, user: null });
      return;
    }
    
    // Populate req.user for downstream middleware
    (req as any).user = user;
    
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
      },
    });
  } catch (err) {
    console.error('[Auth] Me check error:', err);
    res.json({ authenticated: false, user: null });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

export default router;
