import { useEffect, useState } from "react";
import { initBridge, isConnected } from "./bridge.js";

/**
 * Root Component - Headless bridge
 * No UI, just initializes the WebSocket bridge to Design Forge
 */
export default function Root() {
    const [status, setStatus] = useState("initializing");

    useEffect(() => {
        initBridge();
        
        // Check connection status periodically
        const interval = setInterval(() => {
            setStatus(isConnected() ? "connected" : "disconnected");
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Minimal hidden indicator (can be removed entirely if needed)
    return (
        <div 
            style={{ 
                position: "fixed", 
                bottom: 4, 
                right: 4, 
                padding: "2px 6px",
                fontSize: "10px",
                background: status === "connected" ? "#22c55e20" : "#ef444420",
                color: status === "connected" ? "#22c55e" : "#ef4444",
                borderRadius: 4,
                opacity: 0.5,
                pointerEvents: "none",
                zIndex: 9999,
            }}
        >
            DF {status === "connected" ? "●" : "○"}
        </div>
    );
}
