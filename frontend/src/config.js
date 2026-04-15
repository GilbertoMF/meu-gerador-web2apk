const FALLBACK_API_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : 'https://Web2APK-api-xodz.onrender.com'

export const API_URL = (import.meta.env.VITE_API_BASE_URL || FALLBACK_API_URL).replace(/\/$/, '')
