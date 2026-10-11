import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const answers = { level: 'THCS', aiExperience: 'Đã thử', payPerImage: '1000', monthlyBudget: '50000', features: ['Tạo ảnh'] };
const adminKey = 'test-admin-password';
const permissionFlag = Number(process.versions.node.split('.')[0]) >= 24 ? '--permission' : '--experimental-permission';

async function startApp(t, { cloud = true, supabaseUrl = '', supabaseKey = 'sb_secret_test' } = {}) {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const dataDir = await mkdtemp(join(tmpdir(), 'ez-survey-test-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const child = spawn(process.execPath, [
    ...(cloud ? [permissionFlag, '--allow-fs-read=*'] : []), 'server.mjs'
  ], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, VERCEL: cloud ? '1' : '', PORT: String(port), DATA_DIR: dataDir,
      ADMIN_KEY: adminKey, SUPABASE_URL: supabaseUrl, SUPABASE_KEY: supabaseUrl ? supabaseKey : '',
      SUPABASE_SECRET_KEY: '',
      NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start: ' + errors)), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)); });
    child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  });
  return { url: `http://127.0.0.1:${port}`, dataDir };
}

async function supabaseFixture(t, status = 201) {
  const entries = [];
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push({ headers: req.headers, method: req.method });
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST') {
      assert.equal(url.pathname, '/rest/v1/rpc/submit_survey');
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      if (entries.some(entry => entry.clientHash === input.p_client_hash)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ code: 'P0001', message: 'SURVEY_RATE_LIMITED' }));
      }
      const entry = { id: input.p_id, created_at: input.p_created_at, answers: input.p_answers, clientHash: input.p_client_hash };
      if (status < 300) entries.push(entry);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(status < 300 ? '' : JSON.stringify({ message: 'Database unavailable' }));
    } else {
      assert.equal(url.pathname, '/rest/v1/submissions');
      const date = url.searchParams.get('or')?.match(/created_at.lt.([^,]+)/)?.[1];
      const page = [...entries].sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
        .filter(row => !date || row.created_at < date).slice(0, 200);
      res.writeHead(status < 300 ? 200 : status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status < 300 ? page : { message: 'Database unavailable' }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { url: `http://127.0.0.1:${server.address().port}`, entries, requests };
}

async function submit(url, ip = '203.0.113.7') {
  return fetch(url + '/api/survey', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': ip },
    body: JSON.stringify({ consent: true, answers }) });
}

test('Vercel starts and serves the survey without filesystem write permission', async t => {
  const app = await startApp(t);
  const page = await fetch(app.url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<!doctype html>/i);
  assert.equal((await fetch(app.url + '/admin')).status, 200);
  const health = await fetch(app.url + '/api/health');
  assert.equal(health.status, 503);
  assert.equal((await health.json()).supabaseConfigured, false);
});

test('Vercel saves to Supabase and admin reads it without a local file', async t => {
  const db = await supabaseFixture(t);
  const app = await startApp(t, { supabaseUrl: db.url });
  const health = await fetch(app.url + '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).storage, 'supabase');
  const result = await submit(app.url);
  assert.equal(result.status, 201);
  assert.equal((await result.json()).ok, true);
  assert.equal(db.entries.length, 1);
  assert.equal(db.entries[0].answers.level, 'THCS');
  assert.match(db.entries[0].id, /^[0-9a-f-]{36}$/);
  const overview = await fetch(app.url + '/api/admin/overview', { headers: { Authorization: `Bearer ${adminKey}` } });
  assert.equal(overview.status, 200);
  assert.equal((await overview.json()).count, 1);
  for (const request of db.requests) {
    assert.equal(request.headers.apikey, 'sb_secret_test');
    assert.equal(request.headers.authorization, undefined, 'A secret key must not be sent as a JWT');
  }
  await assert.rejects(readFile(join(app.dataDir, 'submissions.jsonl')), { code: 'ENOENT' });
});

test('Vercel refuses submission when Supabase is missing', async t => {
  const app = await startApp(t);
  const result = await submit(app.url);
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /SUPABASE/);
});

test('Supabase failure returns an error instead of reporting success or empty admin data', async t => {
  const db = await supabaseFixture(t, 503);
  const app = await startApp(t, { supabaseUrl: db.url });
  const result = await submit(app.url);
  assert.equal(result.status, 502);
  assert.match((await result.json()).error, /Supabase/);
  const overview = await fetch(app.url + '/api/admin/overview', { headers: { Authorization: `Bearer ${adminKey}` } });
  assert.equal(overview.status, 502);
  assert.match((await overview.json()).error, /Supabase/);
  await assert.rejects(readFile(join(app.dataDir, 'submissions.jsonl')), { code: 'ENOENT' });
});

test('Local mode still persists responses to JSONL', async t => {
  const app = await startApp(t, { cloud: false });
  const result = await submit(app.url);
  assert.equal(result.status, 201);
  const entry = JSON.parse(await readFile(join(app.dataDir, 'submissions.jsonl'), 'utf8'));
  assert.equal(entry.answers.level, 'THCS');
});

test('Legacy Supabase JWT keys still use Bearer authorization', async t => {
  const db = await supabaseFixture(t);
  const key = 'header.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.signature';
  const app = await startApp(t, { supabaseUrl: db.url, supabaseKey: key });
  assert.equal((await submit(app.url)).status, 201);
  assert.equal(db.requests[0].headers.authorization, 'Bearer ' + key);
});

test('Standalone API handler refuses cloud storage fallback when Supabase is absent', async t => {
  const script = `
    const { default: handler } = await import('./api/index.js');
    const responses = [];
    for (const url of ['/api/health', '/api/survey']) {
      const req = { url, method: url.endsWith('survey') ? 'POST' : 'GET', headers: { host: 'localhost' },
        body: ${JSON.stringify({ consent: true, answers })} };
      const res = { setHeader() {}, status(code) { this.code = code; return this; },
        json(body) { responses.push({ code: this.code, body }); } };
      await handler(req, res);
    }
    console.log(JSON.stringify(responses));
  `;
  const child = spawn(process.execPath, [permissionFlag, '--allow-fs-read=*', '--input-type=module', '-e', script], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, VERCEL: '1', SUPABASE_URL: '', SUPABASE_KEY: '',
      SUPABASE_SECRET_KEY: '',
      NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  const responses = JSON.parse(output);
  assert.equal(responses[0].code, 503);
  assert.equal(responses[1].code, 503);
});

test('Cloud cooldown applies across two server instances and returns Retry-After', async t => {
  const db = await supabaseFixture(t);
  const first = await startApp(t, { supabaseUrl: db.url });
  const second = await startApp(t, { supabaseUrl: db.url });
  assert.equal((await submit(first.url)).status, 201);
  const rejected = await submit(second.url);
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get('retry-after'), '15');
  assert.equal((await submit(second.url, '203.0.113.8')).status, 201);
  assert.equal(db.entries.length, 2);
  assert.match(db.entries[0].clientHash, /^[a-f0-9]{64}$/);
});

test('Admin count, newest responses and both exports include over 1000 rows', async t => {
  const db = await supabaseFixture(t);
  db.entries.push(...Array.from({ length: 1005 }, (_, i) => ({ id: `response-${String(i).padStart(4,'0')}`, created_at: new Date(1791700000000 + i * 1000).toISOString(), answers })));
  const app = await startApp(t, { supabaseUrl: db.url });
  const headers = { Authorization: `Bearer ${adminKey}` };
  const overview = await (await fetch(app.url + '/api/admin/overview', { headers })).json();
  assert.equal(overview.count, 1005);
  assert.equal(overview.latest[0].date, db.entries[1004].created_at);
  const exported = await (await fetch(app.url + '/api/admin/export.json', { headers })).json();
  assert.equal(exported.length, 1005);
  const csv = await (await fetch(app.url + '/api/admin/export.csv', { headers })).text();
  assert.equal(csv.trim().split('\r\n').length, 1006);
});
