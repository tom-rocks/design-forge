/**
 * AP Bridge - Client-side communication with Admin Panel
 * 
 * When Design Forge runs inside the AP microapp (iframe), this handles
 * postMessage communication for Highrise API calls.
 * 
 * When running standalone, falls back to server-side bridge.
 */

const AP_ORIGINS = [
  'https://production-ap.highrise.game',
  'https://staging-ap.highrise.game',
  'http://localhost:9000', // local dev
];

let isInAPFrame: boolean | null = null;
let pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}>();
let requestCounter = 0;
let apReady = false;

/**
 * Check if we're running inside the AP iframe
 */
export function checkAPContext(): boolean {
  if (isInAPFrame !== null) return isInAPFrame;
  
  try {
    // Are we in an iframe?
    if (window.self === window.top) {
      isInAPFrame = false;
      return false;
    }
    
    // We're in an iframe - assume AP context
    // (actual origin check happens on message receipt)
    isInAPFrame = true;
    initMessageHandler();
    return true;
  } catch (e) {
    // Cross-origin frame access error = we're in a frame
    isInAPFrame = true;
    initMessageHandler();
    return true;
  }
}

/**
 * Initialize message handler for AP communication
 */
function initMessageHandler() {
  window.addEventListener('message', (event) => {
    // Only accept messages from AP origins
    if (!AP_ORIGINS.includes(event.origin)) {
      return;
    }
    
    const { id, success, data, error, type } = event.data;
    
    // Handle ready signal from parent
    if (type === 'ap-ready') {
      console.log('[AP Bridge] Parent ready');
      apReady = true;
      return;
    }
    
    // Handle response to our request
    if (id && pendingRequests.has(id)) {
      const pending = pendingRequests.get(id)!;
      pendingRequests.delete(id);
      
      if (success) {
        pending.resolve(data);
      } else {
        pending.reject(new Error(error || 'AP request failed'));
      }
    }
  });
  
  // Ping parent to check if ready
  pingParent();
}

/**
 * Ping parent to establish connection
 */
function pingParent() {
  if (!window.parent || window.parent === window) return;
  
  // Send to all possible AP origins
  AP_ORIGINS.forEach(origin => {
    try {
      window.parent.postMessage({ type: 'ping', id: 'init' }, origin);
    } catch (e) {
      // Ignore cross-origin errors
    }
  });
}

/**
 * Check if AP parent is ready
 */
export function isAPReady(): boolean {
  return isInAPFrame === true && apReady;
}

/**
 * Wait for AP parent to be ready
 */
export async function waitForAP(timeout = 5000): Promise<boolean> {
  if (!checkAPContext()) return false;
  if (apReady) return true;
  
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (apReady) {
        resolve(true);
      } else if (Date.now() - start > timeout) {
        resolve(false);
      } else {
        pingParent();
        setTimeout(check, 200);
      }
    };
    check();
  });
}

/**
 * Send API request through AP parent
 */
export async function apRequest<T>(
  endpoint: string,
  method: string = 'POST',
  body?: unknown
): Promise<T> {
  if (!checkAPContext() || !window.parent) {
    throw new Error('Not in AP context');
  }
  
  const id = `req-${++requestCounter}-${Date.now()}`;
  
  return new Promise((resolve, reject) => {
    // Set timeout
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('AP request timeout'));
    }, 30000);
    
    pendingRequests.set(id, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value as T);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    });
    
    // Send request to parent
    const message = {
      id,
      type: 'api',
      endpoint,
      method,
      body
    };
    
    // Try all AP origins (only the correct one will respond)
    AP_ORIGINS.forEach(origin => {
      try {
        window.parent.postMessage(message, origin);
      } catch (e) {
        // Ignore
      }
    });
  });
}

/**
 * Search Highrise items via AP
 */
export async function searchItemsViaAP(params: {
  query?: string;
  category?: string;
  limit?: number;
  offset?: number;
}) {
  const body = {
    _type: 'GetItemsRequest',
    limit: params.limit || 40,
    offset: params.offset || 0,
    filters: [] as [string, unknown][],
    sorts: [['created_at', -1]],
  };
  
  if (params.query?.trim()) {
    body.filters.push(['disp_name', params.query.trim()]);
  }
  if (params.category && params.category !== 'all') {
    body.filters.push(['category', params.category]);
  }
  
  return apRequest<{ items: unknown[]; pages: number }>('/api', 'POST', body);
}

/**
 * Get single item via AP
 */
export async function getItemViaAP(dispId: string) {
  const body = {
    _type: 'GetItemsRequest',
    limit: 1,
    offset: 0,
    filters: [['disp_id', dispId]],
    sorts: [],
  };
  
  return apRequest<{ items: unknown[] }>('/api', 'POST', body);
}
