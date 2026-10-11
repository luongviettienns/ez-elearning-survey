import { timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const SECRET = process.env.ADMIN_KEY || '';
const IS_VERCEL = process.env.VERCEL === '1';
const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);
const SUPABASE_HEADERS = { apikey: SUPABASE_KEY,
  ...(!SUPABASE_KEY.startsWith('sb_') ? { Authorization: `Bearer ${SUPABASE_KEY}` } : {}) };
const DATA_DIR = resolve(process.env.DATA_DIR || './data');
const STORE = join(DATA_DIR, 'submissions.jsonl');

function requireCloudStorage() {
  if (IS_VERCEL && !SUPABASE_CONFIGURED) {
    throw Object.assign(new Error('Cần thiết lập SUPABASE_URL và SUPABASE_KEY trên Vercel để lưu phản hồi.'), { status: 503 });
  }
}

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
    throw new Error('Vui lòng hoàn tất các câu hỏi bắt buộc.');
  }
  return result;
}

function authorized(req) {
  if (SECRET.length < 12) return false;
  const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(SECRET), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getRecords() {
  requireCloudStorage();
  if (SUPABASE_URL && SUPABASE_KEY) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/submissions?select=*&order=created_at.desc`, {
      headers: SUPABASE_HEADERS
    });
    if (!response.ok) {
      const err = await response.text();
      console.error('[Supabase Fetch Error]', err);
      throw new Error('Không thể lấy dữ liệu từ Supabase (mã ' + response.status + '). Hãy chắc chắn bạn đã chạy file supabase.sql để tạo bảng.');
    }
    const data = await response.json();
    return data.map(r => ({
      id: r.id,
      createdAt: r.created_at,
      answers: r.answers
    }));
  }

  // Fallback sang local file nếu không có Supabase
  try {
    const raw = await readFile(STORE, 'utf8');
    return raw.split('\n').filter(Boolean).map(s => {
      try { return JSON.parse(s); } catch { return null; }
    }).filter(Boolean);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function saveRecord(entry) {
  requireCloudStorage();
  if (SUPABASE_URL && SUPABASE_KEY) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
      method: 'POST',
      headers: {
        ...SUPABASE_HEADERS,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        id: entry.id,
        created_at: entry.createdAt,
        answers: entry.answers
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('[Supabase Save Error]', errText);
      throw new Error('Không thể lưu phản hồi vào Supabase (mã ' + response.status + '). Vui lòng kiểm tra đã chạy supabase.sql chưa.');
    }
    return;
  }

  // Fallback local file
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(STORE, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
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
      const ready = !IS_VERCEL || SUPABASE_CONFIGURED;
      return res.status(ready ? 200 : 503).json({
        ok: ready,
        storage: SUPABASE_CONFIGURED ? 'supabase' : (IS_VERCEL ? 'unconfigured' : 'local-file'),
        supabaseConfigured: SUPABASE_CONFIGURED
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

      await saveRecord(entry);
      return res.status(201).json({ ok: true, id: entry.id.slice(0, 8).toUpperCase() });
    }

    if (pathname.startsWith('/api/admin/')) {
      if (!authorized(req)) {
        return res.status(401).json({ error: 'Mật khẩu quản trị không hợp lệ hoặc chưa thiết lập ADMIN_KEY.' });
      }

      const rows = await getRecords();

      if (pathname === '/api/admin/overview' && req.method === 'GET') {
        return res.status(200).json({
          count: rows.length,
          latest: rows.slice(-10).reverse().map(r => ({
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
    return res.status(err.status || 500).json({ error: err.message || 'Lỗi xử lý máy chủ.' });
  }
}
