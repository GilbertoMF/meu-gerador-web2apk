const DEFAULT_API_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : 'https://appforge-api-xodz.onrender.com'

const configuredApiUrl = import.meta.env.VITE_API_BASE_URL

export const API_CANDIDATES = [...new Set([
  configuredApiUrl,
  DEFAULT_API_URL,
  'https://appforge-api-xodz.onrender.com',
].filter(Boolean).map(url => url.replace(/\/$/, '')))]

export const API_URL = API_CANDIDATES[0]
