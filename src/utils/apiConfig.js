// src/utils/apiConfig.js

/**
 * Mendapatkan URL asas untuk sambungan backend Express.
 * Fungsi ini mengutamakan VITE_BACKEND_URL (contoh: untuk VPS).
 * Jika tiada, ia akan semak persekitaran semasa (localhost vs Vercel).
 */
export const getBackendBaseUrl = () => {
  // 1. Utamakan Environment Variable jika diset di Vercel atau .env.local
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, ''); // Buang trailing slash jika ada
  }

  // 2. Fallback kepada logik asal
  const hostname = window.location.hostname;
  const port = window.location.port;
  
  // Jika akses dari PC sendiri atau Local Network
  const isLocalDev = port && port !== '5000' && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.'));
  
  // Jika isLocalDev, sambung ke port 5000. Jika tidak, guna domain semasa (ini yang menjadi isu Vercel sebelum ini)
  return isLocalDev ? `http://${hostname}:5000` : window.location.origin;
};
