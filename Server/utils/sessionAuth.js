import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_LIFETIME = process.env.ACCESS_TOKEN_LIFETIME || '15m';
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
export const createRefreshToken = () => crypto.randomBytes(48).toString('base64url');
export const createSessionId = () => crypto.randomUUID();
export const createOneTimeToken = () => crypto.randomBytes(32).toString('base64url');

const encryptionKey = () => crypto.createHash('sha256').update(process.env.JWT_SECRET || '').digest();
export const encryptSecret = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
};
export const decryptSecret = (value) => {
  const [ivValue, tagValue, encryptedValue] = value.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
};

export const createAccessToken = (userId, sessionId) => jwt.sign(
  { userId, sessionId },
  process.env.JWT_SECRET,
  { expiresIn: ACCESS_TOKEN_LIFETIME }
);

export const getClientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim()
  || req.ip
  || req.socket.remoteAddress
  || '';

export const getDeviceName = (userAgent = '') => {
  if (/android/i.test(userAgent)) return 'Android device';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS device';
  if (/windows/i.test(userAgent)) return 'Windows device';
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac device';
  if (/linux/i.test(userAgent)) return 'Linux device';
  return 'Unknown device';
};

export const getRefreshExpiry = () => new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

export const readRefreshToken = (req) => {
  const cookieValue = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('refreshToken='))
    ?.split('=')[1];
  return req.body?.refreshToken || (cookieValue ? decodeURIComponent(cookieValue) : null);
};

export const setRefreshCookie = (res, token) => res.cookie('refreshToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  path: '/api/user'
});

export const clearRefreshCookie = (res) => res.clearCookie('refreshToken', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/user'
});
