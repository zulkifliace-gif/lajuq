// src/utils/apiConfig.js

/**
 * Mendapatkan URL asas untuk sambungan backend Express.
 * Fungsi ini mengutamakan VITE_BACKEND_URL (contoh: untuk VPS).
 * Jika tiada, ia akan semak persekitaran semasa (localhost vs Vercel).
 */
export const getBackendBaseUrl = () => {
  // 1. Utamakan Environment Variable jika diset di Vercel atau .env.local
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, '');
  }

  // 2. Semak persekitaran semasa (localhost vs Production VPS)
  const hostname = window.location.hostname;
  const port = window.location.port;
  
  // Jika akses dari PC sendiri atau Local Network (Localhost / 192.168.x.x)
  const isLocalDev = port && port !== '5000' && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.'));
  
  // Jika pembangunan tempatan, guna port 5000. Jika produksi (Vercel/Domain luar), SENTIASA guna VPS https://api.lajuq.my
  return isLocalDev ? `http://${hostname}:5000` : 'https://api.lajuq.my';
};

/**
 * Menghalakan mana-mana path gambar (/uploads/...) ke URL Backend VPS yang betul
 * serta menaik taraf HTTP kepada HTTPS untuk mengelak ralat Mixed Content di Vercel.
 */
export const resolveImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  let trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';

  // Fail base64 atau blob kekal seperti biasa
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('blob:')) return trimmed;

  // Jika terdapat path /uploads/, gabungkan terus dengan getBackendBaseUrl()
  if (trimmed.includes('/uploads/')) {
    const uploadPath = trimmed.substring(trimmed.indexOf('/uploads/'));
    const baseUrl = getBackendBaseUrl();
    return `${baseUrl}${uploadPath}`;
  }

  // Tukar http:// ke https:// jika menggunakan domain luar (bukan localhost/LAN IP)
  if (trimmed.startsWith('http://') && !trimmed.includes('localhost') && !trimmed.includes('127.0.0.1') && !trimmed.includes('192.168.') && !trimmed.includes('10.')) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }

  return trimmed;
};

