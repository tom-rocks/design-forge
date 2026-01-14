/**
 * Design Forge Bridge
 * Connects to Design Forge backend and proxies item search requests
 * using the authenticated AP session
 */

const DESIGN_FORGE_WS = process.env.DESIGN_FORGE_WS || "wss://design-forge-production.up.railway.app/ws/bridge";
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || "dev-secret-change-me";
const API_BASE = "/api";

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;

/**
 * Search items using AP's internal API
 * Uses GetItemsRequest with disp_name and disp_id filters
 */
const searchItems = async ({ query, category, limit = 20, offset = 0 }) => {
    const trimmedQuery = query?.trim() || "";
    
    // No query = browse mode
    if (!trimmedQuery) {
        const filters = [];
        if (category && category !== "all") {
            filters.push(["category", category]);
        }
        
        const payload = {
            _type: "GetItemsRequest",
            limit,
            offset,
            filters,
            sorts: [["created_at", -1]],
        };
        
        console.log("[Bridge] Browse:", JSON.stringify(payload));
        const response = await fetch(API_BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Browse failed: ${response.status}`);
        return response.json();
    }
    
    // Search by disp_name
    const namePayload = {
        _type: "GetItemsRequest",
        limit: 20,
        offset,
        filters: [["disp_name", trimmedQuery]],
        sorts: [["created_at", -1]],
    };
    
    console.log("[Bridge] Search disp_name:", JSON.stringify(namePayload));
    const nameRes = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(namePayload),
    });
    if (!nameRes.ok) throw new Error(`Name search failed: ${nameRes.status}`);
    const nameData = await nameRes.json();
    
    // Search by disp_id
    const idPayload = {
        _type: "GetItemsRequest",
        limit: 20,
        offset,
        filters: [["disp_id", trimmedQuery]],
        sorts: [["created_at", -1]],
    };
    
    console.log("[Bridge] Search disp_id:", JSON.stringify(idPayload));
    const idRes = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(idPayload),
    });
    if (!idRes.ok) throw new Error(`ID search failed: ${idRes.status}`);
    const idData = await idRes.json();
    
    // Merge and dedupe by _id
    const seen = new Set();
    const items = [];
    for (const item of [...(nameData.items || []), ...(idData.items || [])]) {
        if (!seen.has(item._id)) {
            seen.add(item._id);
            items.push(item);
        }
    }
    
    return {
        items,
        pages: Math.max(nameData.pages || 0, idData.pages || 0),
    };
};

/**
 * Get single item by disp_id
 */
const getItem = async (dispId) => {
    const payload = {
        _type: "GetItemsRequest",
        limit: 1,
        offset: 0,
        filters: [["disp_id", dispId]],
        sorts: [],
    };

    const response = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Get item failed: ${response.status}`);
    }

    const data = await response.json();
    return { item: data.items?.[0] || null };
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
        
        // Send handshake with secret
        ws.send(JSON.stringify({ 
            type: "handshake", 
            client: "ap-bridge",
            secret: BRIDGE_SECRET,
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
