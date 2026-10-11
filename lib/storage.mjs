import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

function privateKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  try {
    const parts = key.split('.');
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'service_role';
  } catch { return false; }
}

const error = (message, status) => Object.assign(new Error(message), { status });

export function createStorage({ url = '', key = '', cloud = false, dataDir = './data' } = {}) {
  url = url.replace(/\/+$/, '');
  const configured = Boolean(url && privateKey(key));
  const directory = resolve(dataDir);
  const store = join(directory, 'submissions.jsonl');
  const localCooldown = new Map();
  const headers = { apikey: key, ...(!key.startsWith('sb_') ? { Authorization: `Bearer ${key}` } : {}) };

  function requireStorage() {
    if (!configured && (cloud || url || key)) {
      throw error('Cần thiết lập SUPABASE_URL và SUPABASE_SECRET_KEY (khóa server sb_secret hoặc service_role).', 503);
    }
  }

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(url + '/rest/v1/' + path, {
        ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(10000)
      });
    } catch { throw error('Không thể kết nối Supabase. Vui lòng thử lại sau.', 502); }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (body.code === 'P0001' && body.message === 'SURVEY_RATE_LIMITED') {
        throw error('Bạn gửi quá nhanh. Vui lòng thử lại sau 15 giây.', 429);
      }
      throw error('Không thể xử lý dữ liệu trên Supabase. Vui lòng kiểm tra khóa server và migration SQL.', 502);
    }
    return response;
  }

  async function getRecords() {
    requireStorage();
    if (!configured) {
      try {
        const raw = await readFile(store, 'utf8');
        return raw.split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      } catch (err) { if (err.code === 'ENOENT') return []; throw err; }
    }
    const rows = [];
    let cursor;
    for (;;) {
      const query = new URLSearchParams({ select: 'id,created_at,answers', order: 'created_at.desc,id.desc', limit: '500' });
      if (cursor) query.set('or', `(created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${JSON.stringify(cursor.id)}))`);
      const response = await request('submissions?' + query);
      const page = await response.json().catch(() => null);
      if (!Array.isArray(page)) throw error('Dữ liệu Supabase không hợp lệ.', 502);
      if (!page.length) return rows;
      const last = page.at(-1);
      if (typeof last?.created_at !== 'string' || typeof last?.id !== 'string' || (cursor && last.id === cursor.id && last.created_at === cursor.created_at)) {
        throw error('Không thể phân trang dữ liệu Supabase.', 502);
      }
      rows.push(...page.map(row => ({ id: row.id, createdAt: row.created_at, answers: row.answers })));
      cursor = last;
    }
  }

  async function saveRecord(entry, hash) {
    requireStorage();
    if (configured) {
      await request('rpc/submit_survey', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_id: entry.id, p_created_at: entry.createdAt, p_answers: entry.answers, p_client_hash: hash })
      });
      return;
    }
    const now = Date.now();
    if (now - (localCooldown.get(hash) || 0) < 15000) throw error('Bạn gửi quá nhanh. Vui lòng thử lại sau 15 giây.', 429);
    // Reserve before awaiting disk I/O so concurrent local requests cannot both pass.
    localCooldown.set(hash, now);
    try {
      await mkdir(directory, { recursive: true });
      await appendFile(store, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
    } catch (err) { localCooldown.delete(hash); throw err; }
    if (localCooldown.size > 2000) for (const [k, time] of localCooldown) if (now - time > 3600000) localCooldown.delete(k);
  }

  return { configured, getRecords, saveRecord };
}
