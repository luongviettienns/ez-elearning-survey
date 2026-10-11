import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export function clientHash(req, { cloud = false, secret = '' } = {}) {
  const ip = cloud ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
  if (typeof ip !== 'string' || !isIP(ip.trim()) || (cloud && secret.length < 12)) {
    throw Object.assign(new Error('Chưa cấu hình nhận diện người gửi hoặc ADMIN_KEY trên máy chủ.'), { status: 503 });
  }
  return createHmac('sha256', secret || 'local-survey').update(ip.trim()).digest('hex');
}
