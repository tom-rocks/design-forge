# Design Forge — Technical Onboarding Guide

A comprehensive guide for AI agents and developers to understand and work on the Design Forge project.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Environment Setup](#environment-setup)
5. [Git & Deployment Workflow](#git--deployment-workflow)
6. [Railway Deployment](#railway-deployment)
7. [The Bridge System](#the-bridge-system)
8. [Gemini API Integration](#gemini-api-integration)
9. [Database & Storage](#database--storage)
10. [API Reference](#api-reference)
11. [Client-Server Communication](#client-server-communication)
12. [Troubleshooting](#troubleshooting)

---

## Project Overview

**Design Forge** is an AI-powered image generation tool designed for creating digital art assets with a specific aesthetic (no outlines, soft gradient shading, 3/4 perspective). It integrates with:

- **Google Gemini** for AI image generation
- **Highrise** game platform for fetching item references via a WebSocket bridge
- **Railway** for hosting and PostgreSQL database

### Key Features

- **Forge Mode**: Generate new images from text prompts
- **Refine Mode**: Edit existing images with AI
- **Style References**: Use Highrise items or previous generations as style guides
- **Multiple Models**: Flash (fast, limited) and Pro (full features, up to 4K)

---

## Architecture

```
design-forge/
├── client/               # React frontend (Vite)
│   ├── src/
│   │   ├── App.tsx       # Main application component
│   │   ├── components/   # UI components
│   │   ├── config.ts     # API URL configuration
│   │   └── index.css     # Global styles
│   └── dist/             # Built frontend (served by server)
│
├── server/               # Express.js backend
│   ├── src/
│   │   ├── index.ts      # Server entry, Express setup
│   │   ├── bridge.ts     # WebSocket bridge to Highrise AP
│   │   ├── db.ts         # PostgreSQL database layer
│   │   ├── storage.ts    # Image file storage
│   │   └── routes/
│   │       ├── generate.ts     # Gemini image generation
│   │       ├── generations.ts  # History/saved images API
│   │       └── highrise.ts     # Highrise item search
│   └── dist/             # Compiled TypeScript
│
├── single-spa/           # Microapp for Highrise Admin Panel
│   └── src/
│       └── bridge.js     # WebSocket client connecting to our server
│
├── nixpacks.toml         # Railway build configuration
├── railway.json          # Railway deployment settings
└── package.json          # Root scripts for monorepo
```

### Data Flow

```
┌─────────────┐     HTTPS      ┌─────────────────┐
│   Browser   │ ◄────────────► │  Express Server │
│  (React)    │                │   (Railway)     │
└─────────────┘                └────────┬────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 │                      │                      │
                 ▼                      ▼                      ▼
         ┌─────────────┐       ┌──────────────┐       ┌────────────────┐
         │  Gemini API │       │  PostgreSQL  │       │ WebSocket      │
         │  (Google)   │       │  (Railway)   │       │ Bridge         │
         └─────────────┘       └──────────────┘       └────────┬───────┘
                                                               │
                                                               ▼
                                                      ┌────────────────┐
                                                      │ Highrise AP    │
                                                      │ (single-spa)   │
                                                      └────────────────┘
```

---

## Tech Stack

### Frontend (client/)

| Package | Version | Purpose |
|---------|---------|---------|
| React | 18.3.1 | UI framework |
| Vite | 6.0.3 | Build tool & dev server |
| TypeScript | 5.6.3 | Type safety |
| Framer Motion | 11.15.0 | Animations |
| Lucide React | 0.468.0 | Icons |
| Tailwind CSS | 3.4.16 | Utility CSS |

### Backend (server/)

| Package | Version | Purpose |
|---------|---------|---------|
| Express | 4.21.2 | HTTP server |
| TypeScript | 5.6.3 | Type safety |
| ws | 8.19.0 | WebSocket server |
| pg | 8.16.3 | PostgreSQL client |
| sharp | 0.34.0 | Image processing |
| dotenv | 16.4.7 | Environment variables |

### Infrastructure

| Service | Purpose |
|---------|---------|
| Railway | Hosting, PostgreSQL, volumes |
| Nixpacks | Build system |
| Node.js 20 | Runtime |

---

## Environment Setup

### Required Environment Variables

```bash
# .env file in root directory

# Required for image generation
GEMINI_API_KEY=your_gemini_api_key_here

# Required for persistence (Railway provides this)
DATABASE_URL=postgresql://user:pass@host:port/db

# Required for Highrise bridge security
BRIDGE_SECRET=your_secret_here

# Optional: image storage path (Railway volume)
STORAGE_PATH=/data/storage
```

### Local Development

```bash
# 1. Install all dependencies
npm run install:all

# 2. Create .env file with at minimum:
echo "GEMINI_API_KEY=your_key" > .env

# 3. Start development servers (client + server concurrently)
npm run dev

# Client runs on: http://localhost:5173
# Server runs on: http://localhost:3001
# API proxy: /api/* -> localhost:3001
```

### Without Database

The app can run without a database—generations won't be saved to history but will still work. You'll see:

```
⚠️ No DATABASE_URL - running without persistence
```

---

## Git & Deployment Workflow

### Branch Strategy

- **Main Branch**: Production code, deployed to Railway
- **Feature Branches**: For development work

### Commit Guidelines

1. **Test TypeScript before committing**:
   ```bash
   cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit
   ```

2. **Commit with descriptive messages**:
   ```bash
   git add -A
   git commit -m "feat: add cancel button during generation"
   ```

3. **Push triggers Railway deployment**:
   ```bash
   git push origin main
   ```

### Railway Auto-Deploy

Railway is connected to the repository and automatically deploys when:
- Commits are pushed to `main`
- PRs are merged to `main`

---

## Railway Deployment

### Configuration Files

**nixpacks.toml** — Defines the build process:

```toml
[phases.setup]
nixPkgs = ["nodejs_20"]

[phases.install]
cmds = ["npm run install:all"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npm start"
```

**railway.json** — Deployment settings:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Environment Variables on Railway

Set these in Railway dashboard → Variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `DATABASE_URL` | Auto | Provided by Railway PostgreSQL addon |
| `BRIDGE_SECRET` | Yes | Shared secret for WebSocket auth |
| `STORAGE_PATH` | No | Path to Railway volume mount |

### Common Deployment Issues

#### Issue: "Failed to create code snapshot" / Timeout

**Cause**: Upload too large or Railway infrastructure issues.

**Solutions**:

1. Create `.railwayignore` file:
   ```
   node_modules
   .git
   *.log
   .env
   client/node_modules
   server/node_modules
   single-spa/node_modules
   ```

2. Check Railway status: https://status.railway.app

3. Re-trigger deploy from Railway dashboard.

#### Issue: Build fails on TypeScript errors

**Cause**: Type errors in client or server code.

**Solution**: Always run before pushing:
```bash
cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit
```

#### Issue: 503 errors after deploy

**Cause**: Server didn't start properly.

**Solution**: Check Railway logs for startup errors. Common issues:
- Missing environment variables
- Database connection failed
- Port binding issues (use `process.env.PORT`)

---

## The Bridge System

The bridge enables Design Forge to search Highrise's internal item database through a microapp running in the Highrise Admin Panel.

### Architecture

```
┌─────────────────────┐         WebSocket          ┌─────────────────────┐
│   Design Forge      │ ◄──────────────────────► │   Highrise AP       │
│   (Railway Server)  │                            │   (single-spa app)  │
│                     │                            │                     │
│   - bridge.ts       │   Authenticated session    │   - bridge.js       │
│   - /ws/bridge      │   for item queries         │   - Uses AP's /api  │
└─────────────────────┘                            └─────────────────────┘
```

### How It Works

1. **single-spa microapp** runs inside Highrise Admin Panel
2. Microapp connects via WebSocket to our server at `/ws/bridge`
3. Authenticates with `BRIDGE_SECRET`
4. Server sends search requests → microapp queries AP's internal API → returns results

### Server-Side (server/src/bridge.ts)

```typescript
// Security configuration
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || 'dev-secret-change-me';
const ALLOWED_ORIGINS = [
  'https://production-ap.highrise.game',
  'https://staging-ap.highrise.game',
  'http://localhost:9000',
];

// Rate limiting
const RATE_LIMIT = 60;  // requests per minute

// Connection handshake
ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.type === 'handshake' && message.secret === BRIDGE_SECRET) {
    // Authenticated!
  }
});
```

### Client-Side (single-spa/src/bridge.js)

```javascript
// Connect to Design Forge server
const ws = new WebSocket(DESIGN_FORGE_WS);

ws.onopen = () => {
  // Send authentication handshake
  ws.send(JSON.stringify({ 
    type: 'handshake', 
    client: 'ap-bridge',
    secret: BRIDGE_SECRET,
  }));
};

// Handle search requests
ws.onmessage = async (event) => {
  const request = JSON.parse(event.data);
  const result = await searchItems(request.params);
  ws.send(JSON.stringify({ id: request.id, success: true, data: result }));
};
```

### Bridge Request Types

| Type | Parameters | Description |
|------|------------|-------------|
| `search` | `{ query, category, limit, offset }` | Search items |
| `getItem` | `{ dispId }` | Get single item |
| `ping` | none | Keep-alive |

### AP Internal API Payloads

**Text Search** (GetNextjsItemsRequest):
```json
{
  "_type": "GetNextjsItemsRequest",
  "page": 0,
  "limit": 40,
  "sort": "relevance_descending",
  "query": "blue dress",
  "type": "clothing",
  "rarity": []
}
```

**Browse Items** (GetItemsRequest):
```json
{
  "_type": "GetItemsRequest",
  "limit": 40,
  "offset": 0,
  "filters": [["category", "hat"]],
  "sorts": [["created_at", -1]]
}
```

### Checking Bridge Status

```bash
# Check if bridge is connected
curl https://your-app.railway.app/api/bridge/status

# Response
{ "connected": true, "timestamp": "2026-01-15T..." }
```

---

## Gemini API Integration

### Available Models

| Model | ID | Max Refs | Resolutions | Speed |
|-------|-----|----------|-------------|-------|
| Flash | `gemini-2.5-flash-image` | 3 | 1K only | Fast |
| Pro | `gemini-3-pro-image-preview` | 14 | 1K, 2K, 4K | Slower |

### Generation Endpoint

**POST /api/generate**

Request body:
```typescript
interface GenerateRequest {
  prompt: string;              // Required, min 3 chars
  model?: 'flash' | 'pro';     // Default: 'pro'
  resolution?: '1K' | '2K' | '4K';  // Default: '1K'
  aspectRatio?: string;        // e.g., '1:1', '16:9'
  numImages?: number;          // 1-4 variations
  styleImages?: StyleImage[];  // Reference images
  negativePrompt?: string;     // What to avoid
  mode?: 'create' | 'edit';    // Default: 'create'
  editImage?: string;          // Base64 data URL for edit mode
}

interface StyleImage {
  url: string;      // Image URL
  strength: number; // 0-1 (currently unused by Gemini)
  name?: string;    // Optional label
}
```

Response (Server-Sent Events):
```
event: progress
data: {"status":"uploading","message":"UPLOADING 3 STYLE REFERENCES...","progress":10}

event: progress
data: {"status":"generating","message":"GENERATING IMAGE...","progress":30}

event: complete
data: {"success":true,"imageUrl":"data:image/png;base64,...","generationId":"uuid"}

event: error
data: {"error":"Rate limit exceeded"}
```

### Image Upload Flow

1. **Style images** are fetched from URL and uploaded to Gemini Files API
2. **Edit images** are base64-decoded and uploaded to Gemini Files API
3. Both use resumable upload protocol with file_uri references

```typescript
// Upload to Gemini Files API
const startResponse = await fetch(`${GEMINI_UPLOAD_BASE}/files`, {
  method: 'POST',
  headers: {
    'x-goog-api-key': apiKey,
    'X-Goog-Upload-Protocol': 'resumable',
    'X-Goog-Upload-Command': 'start',
    'X-Goog-Upload-Header-Content-Length': String(numBytes),
    'X-Goog-Upload-Header-Content-Type': mimeType,
  },
  body: JSON.stringify({ file: { display_name: 'ref-123' } }),
});

// Get upload URL from header
const uploadUrl = startResponse.headers.get('x-goog-upload-url');

// Upload bytes
await fetch(uploadUrl, {
  method: 'POST',
  headers: {
    'X-Goog-Upload-Offset': '0',
    'X-Goog-Upload-Command': 'upload, finalize',
  },
  body: imageBytes,
});
```

### Request Payload to Gemini

```json
{
  "contents": [{
    "parts": [
      { "text": "Create: a blue dress..." },
      { "file_data": { "mime_type": "image/png", "file_uri": "..." } }
    ]
  }],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "1:1",
      "imageSize": "2K"
    }
  }
}
```

### Image Processing

All images are processed through Sharp before upload:

```typescript
// Flatten transparency to grey background
const processedBuffer = await sharp(buffer)
  .flatten({ background: { r: 88, g: 89, b: 91 } })
  .png()
  .toBuffer();
```

---

## Database & Storage

### PostgreSQL Schema

```sql
CREATE TABLE generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  model VARCHAR(50),
  resolution VARCHAR(10),
  aspect_ratio VARCHAR(10),
  mode VARCHAR(10) DEFAULT 'create',
  parent_id UUID REFERENCES generations(id),  -- For edit chains
  image_paths TEXT[] NOT NULL DEFAULT '{}',
  thumbnail_path TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### File Storage

Images are stored on Railway volumes:

```
/data/storage/           # STORAGE_PATH
├── images/              # Full resolution images
│   ├── gen-abc-0.png
│   └── gen-abc-1.png
└── thumbnails/          # 200x200 JPEG thumbnails
    └── gen-abc-thumb.jpg
```

### Image URLs

- Full image: `/api/generations/{id}/image/{index}`
- Thumbnail: `/api/generations/{id}/thumbnail`
- Base64 (for editing): `/api/generations/{id}/image/{index}/base64`

---

## API Reference

### Generation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Generate images (SSE) |
| GET | `/api/capabilities` | Get model info |
| GET | `/api/debug/logs` | View generation logs |

### History Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/generations` | List all generations |
| GET | `/api/generations/:id` | Get single generation |
| GET | `/api/generations/:id/image/:index` | Serve image file |
| GET | `/api/generations/:id/thumbnail` | Serve thumbnail |
| GET | `/api/generations/:id/image/:index/base64` | Get as base64 |
| GET | `/api/generations/:id/chain` | Get edit chain |
| DELETE | `/api/generations/:id` | Delete generation |
| POST | `/api/generations/cleanup` | Remove orphan records |

### Highrise Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/highrise/items` | Search items |
| GET | `/api/highrise/items/:id` | Get single item |
| GET | `/api/highrise/types` | Get item types |
| GET | `/api/highrise/proxy/:id.png` | Proxy item image |

### System Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/bridge/status` | Bridge connection status |

---

## Client-Server Communication

### API URL Configuration

```typescript
// client/src/config.ts
export const API_URL = import.meta.env.VITE_API_URL || '';
```

- **Development**: Empty string, Vite proxy handles `/api/*`
- **Production**: Empty string, same-origin requests

### Vite Proxy (Development)

```typescript
// client/vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
    },
  },
}
```

### SSE (Server-Sent Events) for Generation

```typescript
// Client-side consumption
const eventSource = new EventSource('/api/generate', { ... });
// Note: Actually using fetch with streaming response

const response = await fetch(`${API_URL}/api/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  // Parse SSE format: "event: progress\ndata: {...}\n\n"
}
```

---

## Troubleshooting

### Common Issues

#### "Bridge not connected" on Highrise search

**Cause**: The single-spa microapp isn't running or can't connect.

**Solutions**:
1. Check if microapp is deployed to Highrise AP
2. Verify `BRIDGE_SECRET` matches on both ends
3. Check WebSocket connection in browser devtools
4. Verify `DESIGN_FORGE_WS` URL is correct

#### "Rate limit exceeded" 

**Cause**: Too many requests to bridge (60/min limit).

**Solution**: Wait a minute, or implement client-side caching.

#### Images not loading from Highrise

**Cause**: CORS issues with direct CDN access.

**Solution**: Use the proxy endpoint: `/api/highrise/proxy/{item_id}.png`

#### Generation stuck at "GENERATING..."

**Cause**: Gemini API timeout or overload.

**Solutions**:
1. Check `/api/debug/logs` for error details
2. Gemini returns 503 when overloaded—we retry 3 times automatically
3. Try using Flash model for faster results

#### "Failed to upload edit image"

**Cause**: Invalid base64 data URL or image too large.

**Solutions**:
1. Ensure image is a valid data URL: `data:image/png;base64,...`
2. Check image size (Gemini has limits)
3. Verify image isn't corrupted

### Debug Endpoints

```bash
# View recent generation logs
curl https://your-app.railway.app/api/debug/logs

# Clear logs
curl -X DELETE https://your-app.railway.app/api/debug/logs

# Check system health
curl https://your-app.railway.app/api/health
```

### Log Patterns

```bash
# Successful generation
[Gen gen-123] Generated 1 image(s) from 1 variation(s) in 12s
[DB] Saved generation uuid-456
[Storage] Saved image: gen-xyz-0.png (2048576 bytes)

# Bridge activity
[Bridge] Connection attempt from: https://production-ap.highrise.game
[Bridge] AP bridge authenticated successfully
[Highrise] Using bridge for search: blue dress

# Errors
[Gen gen-123] 503 overloaded, retry 1/3 in 5s
[Gemini Files] Failed to fetch: 404
```

---

## Quick Reference

### Essential Commands

```bash
# Install everything
npm run install:all

# Development
npm run dev

# Build for production
npm run build

# Type check (run before committing!)
cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit

# Start production server
npm start
```

### Key Files to Know

| File | Purpose |
|------|---------|
| `server/src/routes/generate.ts` | All Gemini generation logic |
| `server/src/bridge.ts` | WebSocket bridge server |
| `client/src/App.tsx` | Main UI component |
| `client/src/index.css` | All styles (see STYLING.md) |
| `nixpacks.toml` | Railway build config |

### Environment Quick Check

```bash
# Required for generation
GEMINI_API_KEY=✓

# Required for history
DATABASE_URL=✓

# Required for Highrise search
BRIDGE_SECRET=✓
```

---

## Self-Assessment

After reading this guide, you should be able to:

- [ ] Understand the monorepo structure and data flow
- [ ] Set up local development environment
- [ ] Know how Railway deployment works and common issues
- [ ] Understand the WebSocket bridge architecture
- [ ] Know the Gemini API payload structure and models
- [ ] Navigate the database schema and storage system
- [ ] Debug common issues using logs and endpoints
- [ ] Make code changes without breaking TypeScript

If you can check all boxes, you're **fully onboarded and ready to work on Design Forge!**

---

*Last updated: January 2026*
