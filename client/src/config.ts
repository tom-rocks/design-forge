// API configuration - uses env var in production, proxy in dev
export const API_URL = import.meta.env.VITE_API_URL || '';
