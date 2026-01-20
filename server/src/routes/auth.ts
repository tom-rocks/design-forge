import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { findOrCreateUser, getUserById, User } from '../db.js';

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

// Configure Google OAuth strategy
export function setupPassport() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback';

  if (!clientID || !clientSecret) {
    console.warn('⚠️ Google OAuth not configured - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required');
    return false;
  }

  passport.use(new GoogleStrategy({
    clientID,
    clientSecret,
    callbackURL,
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('No email found in Google profile'), undefined);
      }

      const user = await findOrCreateUser({
        googleId: profile.id,
        email,
        name: profile.displayName,
        avatarUrl: profile.photos?.[0]?.value,
      });

      done(null, user);
    } catch (err) {
      done(err as Error, undefined);
    }
  }));

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await getUserById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });

  console.log('✅ Google OAuth configured');
  return true;
}

// Start Google OAuth flow
router.get('/google', (req, res, next) => {
  const isPopup = req.query.popup === 'true';
  
  // Use state parameter to pass popup flag through OAuth flow
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: isPopup ? 'popup' : undefined,
  })(req, res, next);
});

// Google OAuth callback
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', {
    failureRedirect: '/?auth=failed',
  })(req, res, (err) => {
    if (err) return next(err);
    
    // Successful authentication
    console.log(`[Auth] OAuth callback success for user: ${req.user?.email}`);
    console.log(`[Auth] Session ID: ${req.sessionID}`);
    console.log(`[Auth] State: ${req.query.state}`);
    
    const isPopup = req.query.state === 'popup';
    
    if (isPopup) {
      // For popup: send message to opener and close
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Login Complete</title></head>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'auth-complete', success: true }, '*');
            }
            window.close();
          </script>
          <p>Login successful! This window should close automatically.</p>
          <p>If it doesn't, you can close it manually.</p>
        </body>
        </html>
      `);
    } else {
      // For direct navigation: redirect as before
      res.redirect('/?auth=success');
    }
  });
});

// Get current user
router.get('/me', (req, res) => {
  console.log(`[Auth] /me check - isAuthenticated: ${req.isAuthenticated()}, hasUser: ${!!req.user}, sessionID: ${req.sessionID}`);
  if (req.isAuthenticated() && req.user) {
    console.log(`[Auth] /me returning user: ${req.user.email}`);
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        avatarUrl: req.user.avatar_url,
      },
    });
  } else {
    console.log(`[Auth] /me returning not authenticated`);
    res.json({ authenticated: false, user: null });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

export default router;
