import React, { useEffect, useRef, useCallback } from "react";

/**
 * Design Forge Microapp - Deploy once, never touch again
 * 
 * This microapp does two things:
 * 1. Displays Design Forge from Railway in an iframe (always gets latest)
 * 2. Proxies API requests from the iframe to AP's /api
 * 
 * The iframe (Design Forge) sends postMessage requests, this proxies them
 * to /api with AP's authenticated session, and returns results.
 */

const FORGE_URL = "https://design-forge-production.up.railway.app";
const ALLOWED_ORIGINS = [
  "https://design-forge-production.up.railway.app",
  "http://localhost:5173", // local dev
];

// Hide AP's sidebar and header for fullscreen experience
function enterFullscreen() {
  // Add a style tag to hide AP chrome
  const style = document.createElement("style");
  style.id = "forge-fullscreen-style";
  style.textContent = `
    /* Hide AP Mantine sidebar and header */
    .mantine-Navbar-root,
    [class*="mantine-Navbar"],
    .mantine-Header-root,
    [class*="mantine-Header"] {
      display: none !important;
    }
    
    /* Make content area fullscreen */
    .mantine-AppShell-main,
    [class*="mantine-AppShell-main"],
    main {
      padding: 0 !important;
      margin: 0 !important;
    }
    
    #single-spa-application\\:\\@pw\\/app,
    [id*="single-spa-application"] {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      z-index: 9999 !important;
    }
  `;
  document.head.appendChild(style);
}

function exitFullscreen() {
  const style = document.getElementById("forge-fullscreen-style");
  if (style) style.remove();
}

export default function Root() {
  const iframeRef = useRef(null);
  
  // Enter fullscreen on mount, exit on unmount
  useEffect(() => {
    enterFullscreen();
    return () => exitFullscreen();
  }, []);

  // Send ready signal to iframe
  const sendReady = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      ALLOWED_ORIGINS.forEach(origin => {
        try {
          iframeRef.current.contentWindow.postMessage(
            { type: "ap-ready", timestamp: Date.now() },
            origin
          );
        } catch (e) {
          // Ignore cross-origin errors
        }
      });
    }
  }, []);

  useEffect(() => {
    const handleMessage = async (event) => {
      // Security: only accept messages from Design Forge
      if (!ALLOWED_ORIGINS.includes(event.origin)) {
        return;
      }

      const { id, type, endpoint, method, body } = event.data;

      // Respond to ping with ready signal
      if (type === "ping") {
        event.source?.postMessage(
          { id, type: "ap-ready", success: true, data: { pong: true, timestamp: Date.now() } },
          event.origin
        );
        return;
      }

      // Ignore messages without an id (not our protocol)
      if (!id) return;

      try {
        let result;

        if (type === "api") {
          // Generic API proxy - forward to AP's /api
          const response = await fetch(endpoint || "/api", {
            method: method || "POST",
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          });

          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }

          result = await response.json();
        } else if (type === "image-proxy") {
          // Image proxy - fetch image with AP's authenticated session
          const { url } = event.data;
          if (!url) {
            throw new Error("No URL provided for image proxy");
          }

          const response = await fetch(url, {
            credentials: "include", // Include AP cookies
          });

          if (!response.ok) {
            throw new Error(`Image fetch failed: ${response.status}`);
          }

          const blob = await response.blob();
          
          // Convert to base64 data URL
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          result = { dataUrl };
        } else {
          throw new Error(`Unknown message type: ${type}`);
        }

        // Send result back to iframe
        event.source?.postMessage(
          { id, success: true, data: result },
          event.origin
        );
      } catch (error) {
        // Send error back to iframe
        event.source?.postMessage(
          { id, success: false, error: error.message },
          event.origin
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Handle iframe load - send ready signal
  const handleIframeLoad = useCallback(() => {
    // Small delay to ensure iframe is fully ready
    setTimeout(sendReady, 100);
  }, [sendReady]);

  return (
    <div style={{ 
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      margin: 0,
      padding: 0,
      overflow: "hidden",
      zIndex: 9999,
      background: "#1a1918",
    }}>
      <iframe
        ref={iframeRef}
        src={FORGE_URL}
        onLoad={handleIframeLoad}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
        }}
        allow="clipboard-write"
        title="Design Forge"
      />
    </div>
  );
}
