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

let bridgeClient: WebSocket | null = null;
const pendingRequests = new Map<string, PendingRequest>();
let requestCounter = 0;

/**
 * Initialize WebSocket server for AP bridge
 */
export function initBridgeServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/bridge' });

  wss.on('connection', (ws) => {
    console.log('[Bridge] Client connected');

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'handshake' && message.client === 'ap-bridge') {
          console.log('[Bridge] AP bridge authenticated');
          bridgeClient = ws;
          ws.send(JSON.stringify({ type: 'handshake-ack' }));
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
  type?: string;
  page?: number;
  limit?: number;
  rarity?: string[];
  sort?: string;
}) {
  return bridgeRequest('search', options);
}

/**
 * Get item via bridge
 */
export async function getItemViaBridge(dispId: string) {
  return bridgeRequest('getItem', { dispId });
}
