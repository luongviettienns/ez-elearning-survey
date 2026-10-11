import { timingSafeEqual, randomUUID } from 'node:crypto';
import { createStorage } from '../lib/storage.mjs';
import { clientHash } from '../lib/client-identity.mjs';

const SECRET = process.env.ADMIN_KEY || '';
const IS_VERCEL = process.env.VERCEL === '1';
const storage = createStorage({
  url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  key: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '',
  cloud: IS_VERCEL, dataDir: process.env.DATA_DIR || './data'
});

const allowedFields = ['level','subject','aiExperience','aiNeeds','imageTroubles','imageRetries','imageTypes','imageValue','monthlyUses','payPerImage','monthlyBudget','paymentModel','features','suggestion','contact'];

function sanitizeText(value, max = 250) {
  return typeof value === 'string' ? value.trim().slice(0, max).replace(/[\u0000-\u001f\u007f]/g, ' ') : '';
}

function cleanAnswers(obj) {
  const result = {};
  for (const key of allowedFields) {
    const val = obj[key];
    result[key] = Array.isArray(val)
      ? val.slice(0, 12).filter(x => typeof x === 'string').map(x => sanitizeText(x, 160))
      : sanitizeText(val, key === 'suggestion' ? 1600 : 250);
  }
  if (!result.level || !result.aiExperience || !result.payPerImage || !result.monthlyBudget || !Array.isArray(result.features) || !result.features.length) {
    throw Object.assign(new Error('Vui lòng hoàn tất các câu hỏi bắt buộc.'), { status: 400 });
  }
  return result;
}

function authorized(req) {
  if (SECRET.length < 12) return false;
  const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(SECRET), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

function csvEscape(v) {
  let s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

function writeCsv(rows) {
  return '\ufeff' + ['id', 'createdAt', ...allowedFields].join(',') + '\r\n' + rows.map(r =>
    ['id', 'createdAt', ...allowedFields].map(k => csvEscape(k === 'createdAt' ? r.createdAt : r.answers?.[k] ?? r[k])).join(',')
  ).join('\r\n') + '\r\n';
}

function group(rows, field) {
  const out = {};
  for (const r of rows) {
    const value = r.answers?.[field];
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v) out[v] = (out[v] || 0) + 1;
    }
  }
  return out;
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  res.setHeader('Cache-Control', 'no-store, must-revalidate');

  try {
    if (pathname === '/api/health') {
      const ready = !IS_VERCEL || (storage.configured && SECRET.length >= 12);
      return res.status(ready ? 200 : 503).json({
        ok: ready,
        storage: storage.configured ? 'supabase' : (IS_VERCEL ? 'unconfigured' : 'local-file'),
        supabaseConfigured: storage.configured
      });
    }

    if (pathname === '/api/survey' && req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
      }

      if (body.website) {
        return res.status(200).json({ ok: true }); // Honeypot
      }

      if (body.consent !== true) {
        return res.status(400).json({ error: 'Cần đồng ý với mục đích thu thập phản hồi.' });
      }

      const answers = cleanAnswers(body.answers || {});
      const entry = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        answers
      };

      await storage.saveRecord(entry, clientHash(req, { cloud: IS_VERCEL, secret: SECRET }));
      return res.status(201).json({ ok: true, id: entry.id.slice(0, 8).toUpperCase() });
    }

    if (pathname.startsWith('/api/admin/')) {
      if (!authorized(req)) {
        return res.status(401).json({ error: 'Mật khẩu quản trị không hợp lệ hoặc chưa thiết lập ADMIN_KEY.' });
      }

      const rows = await storage.getRecords();

      if (pathname === '/api/admin/overview' && req.method === 'GET') {
        return res.status(200).json({
          count: rows.length,
          latest: rows.slice(0, 10).map(r => ({
            id: r.id.slice(0, 8),
            date: r.createdAt,
            subject: r.answers?.subject,
            level: r.answers?.level
          })),
          groups: Object.fromEntries(
            ['level','aiExperience','imageTroubles','imageValue','imageRetries','payPerImage','monthlyBudget','paymentModel','features']
              .map(f => [f, group(rows, f)])
          )
        });
      }

      if (pathname === '/api/admin/export.csv' && req.method === 'GET') {
        const csv = writeCsv(rows);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="ez-elearning-khao-sat.csv"');
        return res.status(200).send(csv);
      }

      if (pathname === '/api/admin/export.json' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="ez-elearning-khao-sat.json"');
        return res.status(200).json(rows);
      }

      return res.status(404).json({ error: 'Không tìm thấy API admin này.' });
    }

    return res.status(404).json({ error: 'Không tìm thấy API.' });
  } catch (err) {
    console.error('[API Error]', err);
    if (err.status === 429) res.setHeader('Retry-After', '15');
    return res.status(err.status || 500).json({ error: err.message || 'Lỗi xử lý máy chủ.' });
  }
}
