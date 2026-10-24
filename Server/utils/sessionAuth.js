import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_LIFETIME = process.env.ACCESS_TOKEN_LIFETIME || '15m';
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);

export const hashToken = (token) => {
  if (!token) return '';
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

export const createRefreshToken = () => crypto.randomBytes(48).toString('base64url');
export const createSessionId = () => crypto.randomUUID();
export const createOneTimeToken = () => crypto.randomBytes(32).toString('base64url');

const encryptionKey = () => {
  const secret = process.env.JWT_SECRET || 'default-fallback-encryption-key-for-security';
  return crypto.createHash('sha256').update(secret).digest();
};

export const encryptSecret = (value) => {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
};

export const decryptSecret = (value) => {
  try {
    if (!value || typeof value !== 'string') return '';
    const parts = value.split('.');
    if (parts.length !== 3) return '';
    const [ivValue, tagValue, encryptedValue] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
  } catch (error) {
    console.error('Failed to decrypt secret:', error.message);
    return '';
  }
};

export const createAccessToken = (userId, sessionId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(
    { userId, sessionId },
    secret,
    { expiresIn: ACCESS_TOKEN_LIFETIME }
  );
};

export const getClientIp = (req) => {
  if (!req) return '';
  return req.headers['x-forwarded-for']?.split(',')[0].trim()
    || req.ip
    || req.socket?.remoteAddress
    || '';
};

export const getDeviceName = (userAgent = '') => {
  if (!userAgent) return 'Unknown device';
  if (/android/i.test(userAgent)) return 'Android device';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS device';
  if (/windows/i.test(userAgent)) return 'Windows PC';
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac device';
  if (/linux/i.test(userAgent)) return 'Linux device';
  return 'Web Browser';
};

export const getRefreshExpiry = () => new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

export const readRefreshToken = (req) => {
  if (!req) return null;
  if (req.cookies && req.cookies.refreshToken) {
    return req.cookies.refreshToken;
  }
  const cookieHeader = req.headers?.cookie;
  if (cookieHeader) {
    const cookieValue = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('refreshToken='))
      ?.split('=')[1];
    if (cookieValue) {
      return decodeURIComponent(cookieValue);
    }
  }
  return req.body?.refreshToken || req.headers?.['x-refresh-token'] || null;
};

export const setRefreshCookie = (res, token) => {
  const isProduction = process.env.NODE_ENV === 'production';
  return res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/user'
  });
};

export const clearRefreshCookie = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  return res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/user'
  });
};
