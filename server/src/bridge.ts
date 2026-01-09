import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface BridgeRequest {
  id: string;
  type: 'search' | 'getItem' | 'ping';
  params?: Record<string, unknown>;
}

interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}

// Bridge secret - must match in microapp
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || 'dev-secret-change-me';

// Allowed origins (Highrise admin panel domains)
const ALLOWED_ORIGINS = [
  'https://production-ap.highrise.game',
  'https://staging-ap.highrise.game',
  'http://localhost:9000', // local dev
];

// Rate limiting: max 60 requests per minute
const RATE_LIMIT = 60;
const RATE_WINDOW = 60000; // 1 minute
let requestsThisWindow = 0;
let windowStart = Date.now();

let bridgeClient: WebSocket | null = null;
const pendingRequests = new Map<string, PendingRequest>();
let requestCounter = 0;

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - windowStart > RATE_WINDOW) {
    windowStart = now;
    requestsThisWindow = 0;
  }
  if (requestsThisWindow >= RATE_LIMIT) {
    return false;
  }
  requestsThisWindow++;
  return true;
}

/**
 * Initialize WebSocket server for AP bridge
 */
export function initBridgeServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/bridge' });

  wss.on('connection', (ws, req) => {
    const origin = req.headers.origin || '';
    console.log('[Bridge] Connection attempt from:', origin);

    // Validate origin (skip in dev if no origin)
    if (origin && !ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
      console.log('[Bridge] Rejected - invalid origin:', origin);
      ws.close(4002, 'Invalid origin');
      return;
    }

    // Track if this connection is authenticated
    let isAuthenticated = false;

    // Auto-close if not authenticated within 10 seconds
    const authTimeout = setTimeout(() => {
      if (!isAuthenticated) {
        console.log('[Bridge] Connection timeout - no valid handshake');
        ws.close(4001, 'Authentication timeout');
      }
    }, 10000);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handshake with secret validation
        if (message.type === 'handshake' && message.client === 'ap-bridge') {
          if (message.secret !== BRIDGE_SECRET) {
            console.log('[Bridge] Invalid secret provided');
            ws.close(4003, 'Invalid credentials');
            return;
          }
          
          console.log('[Bridge] AP bridge authenticated successfully');
          isAuthenticated = true;
          clearTimeout(authTimeout);
          bridgeClient = ws;
          ws.send(JSON.stringify({ type: 'handshake-ack' }));
          return;
        }
        
        // Reject all other messages if not authenticated
        if (!isAuthenticated) {
          console.log('[Bridge] Rejecting message - not authenticated');
          ws.close(4003, 'Not authenticated');
          return;
        }

        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        // Handle response from bridge
        if (message.id && pendingRequests.has(message.id)) {
          const pending = pendingRequests.get(message.id)!;
          clearTimeout(pending.timeout);
          pendingRequests.delete(message.id);

          if (message.success) {
            pending.resolve(message.data);
          } else {
            pending.reject(new Error(message.error || 'Bridge request failed'));
          }
        }
      } catch (e) {
        console.error('[Bridge] Error parsing message:', e);
      }
    });

    ws.on('close', () => {
      console.log('[Bridge] Client disconnected');
      if (bridgeClient === ws) {
        bridgeClient = null;
      }
    });

    ws.on('error', (error) => {
      console.error('[Bridge] WebSocket error:', error);
    });
  });

  console.log('[Bridge] WebSocket server initialized on /ws/bridge');
}

/**
 * Check if bridge is connected
 */
export function isBridgeConnected(): boolean {
  return bridgeClient !== null && bridgeClient.readyState === WebSocket.OPEN;
}

/**
 * Send request to AP bridge and wait for response
 */
export async function bridgeRequest<T>(type: string, params?: Record<string, unknown>): Promise<T> {
  if (!isBridgeConnected()) {
    throw new Error('Bridge not connected');
  }

  if (!checkRateLimit()) {
    throw new Error('Rate limit exceeded');
  }

  const id = `req-${++requestCounter}-${Date.now()}`;
  const request: BridgeRequest = { id, type: type as BridgeRequest['type'], params };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Bridge request timeout'));
    }, 30000);

    pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });
    bridgeClient!.send(JSON.stringify(request));
  });
}

/**
 * Search items via bridge
 */
export async function searchItemsViaBridge(options: {
  query?: string;
  category?: string;
  limit?: number;
  offset?: number;
}) {
  return bridgeRequest('search', options);
}

/**
 * Get item via bridge
 */
export async function getItemViaBridge(dispId: string) {
  return bridgeRequest('getItem', { dispId });
}
