/**
 * Design Forge Bridge
 * Connects to Design Forge backend and proxies item search requests
 * using the authenticated AP session
 */

const DESIGN_FORGE_WS = process.env.DESIGN_FORGE_WS || "wss://design-forge-production.up.railway.app/ws/bridge";
const API_BASE = "/api";

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;

/**
 * Search items using AP's internal API
 */
const searchItems = async ({ query, type, page = 0, limit = 40, rarity = [], sort = "relevance_descending" }) => {
    const payload = {
        _type: "GetNextjsItemsRequest",
        page,
        limit,
        sort,
        query: query || "",
        type: type || "all",
        rarity: rarity || [],
    };

    const response = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
    }

    return response.json();
};

/**
 * Get single item details
 */
const getItem = async (dispId) => {
    const payload = {
        _type: "GetItemRequest",
        disp_id: dispId,
    };

    const response = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Get item failed: ${response.status}`);
    }

    return response.json();
};

/**
 * Handle incoming requests from Design Forge
 */
const handleRequest = async (request) => {
    const { id, type, params } = request;

    try {
        let result;

        switch (type) {
            case "search":
                result = await searchItems(params);
                break;
            case "getItem":
                result = await getItem(params.dispId);
                break;
            case "ping":
                result = { pong: true, timestamp: Date.now() };
                break;
            default:
                throw new Error(`Unknown request type: ${type}`);
        }

        return { id, success: true, data: result };
    } catch (error) {
        return { id, success: false, error: error.message };
    }
};

/**
 * Connect to Design Forge WebSocket
 */
const connect = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        return;
    }

    console.log("[Bridge] Connecting to Design Forge...");

    ws = new WebSocket(DESIGN_FORGE_WS);

    ws.onopen = () => {
        console.log("[Bridge] Connected to Design Forge");
        reconnectAttempts = 0;
        
        // Send handshake
        ws.send(JSON.stringify({ 
            type: "handshake", 
            client: "ap-bridge",
            timestamp: Date.now() 
        }));
    };

    ws.onmessage = async (event) => {
        try {
            const request = JSON.parse(event.data);
            console.log("[Bridge] Received request:", request.type);
            
            const response = await handleRequest(request);
            ws.send(JSON.stringify(response));
        } catch (error) {
            console.error("[Bridge] Error handling message:", error);
        }
    };

    ws.onclose = () => {
        console.log("[Bridge] Disconnected from Design Forge");
        scheduleReconnect();
    };

    ws.onerror = (error) => {
        console.error("[Bridge] WebSocket error:", error);
    };
};

/**
 * Schedule reconnection
 */
const scheduleReconnect = () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error("[Bridge] Max reconnection attempts reached");
        return;
    }

    reconnectAttempts++;
    const delay = RECONNECT_DELAY * Math.min(reconnectAttempts, 5);
    console.log(`[Bridge] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
    
    setTimeout(connect, delay);
};

/**
 * Initialize the bridge
 */
export const initBridge = () => {
    console.log("[Bridge] Initializing Design Forge bridge...");
    connect();

    // Keep alive ping every 30 seconds
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
        }
    }, 30000);
};

/**
 * Check if bridge is connected
 */
export const isConnected = () => {
    return ws && ws.readyState === WebSocket.OPEN;
};

export default { initBridge, isConnected };
