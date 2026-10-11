import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createStorage } from '../lib/storage.mjs';
import { clientHash } from '../lib/client-identity.mjs';

async function fixture(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('Cloud storage rejects publishable and anon keys instead of accessing private data', async () => {
  const anonJwt = 'header.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.signature';
  for (const key of ['sb_publishable_test', anonJwt, 'invalid', '']) {
    const storage = createStorage({ url: 'https://example.supabase.co', key, cloud: true });
    assert.equal(storage.configured, false);
    await assert.rejects(storage.getRecords(), { status: 503 });
    await assert.rejects(storage.saveRecord({}, 'hash'), { status: 503 });
  }
});

test('Private storage reads every capped page in descending order', async t => {
  const rows = Array.from({ length: 1005 }, (_, i) => ({ id: String(2000 - i), created_at: new Date(1791700000000 - i * 1000).toISOString(), answers: { level: 'THCS' } }));
  let calls = 0;
  const url = await fixture(t, (req, res) => {
    const query = new URL(req.url, 'http://localhost').searchParams;
    assert.equal(query.get('order'), 'created_at.desc,id.desc');
    const filter = query.get('or');
    const date = filter?.match(/created_at.lt.([^,]+)/)?.[1];
    const page = rows.filter(row => !date || row.created_at < date).slice(0, 200);
    calls++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(page));
  });
  const result = await createStorage({ url, key: 'sb_secret_test', cloud: true }).getRecords();
  assert.equal(result.length, 1005);
  assert.equal(new Set(result.map(row => row.id)).size, 1005);
  assert.equal(result[0].id, '2000');
  assert.equal(result.at(-1).id, '996');
  assert.equal(calls, 7, 'Continue until an empty page even when the API cap is below the requested page size');
});

test('Submission uses the atomic service RPC and maps cooldown to HTTP 429', async t => {
  let body;
  const url = await fixture(t, async (req, res) => {
    assert.equal(req.url, '/rest/v1/rpc/submit_survey');
    assert.equal(req.headers.apikey, 'sb_secret_test');
    assert.equal(req.headers.authorization, undefined);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    body = JSON.parse(raw);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'P0001', message: 'SURVEY_RATE_LIMITED' }));
  });
  const entry = { id: 'test-id', createdAt: '2026-10-11T00:00:00Z', answers: { level: 'THCS' } };
  await assert.rejects(createStorage({ url, key: 'sb_secret_test', cloud: true }).saveRecord(entry, 'a'.repeat(64)), { status: 429 });
  assert.deepEqual(body, { p_id: 'test-id', p_created_at: entry.createdAt, p_answers: entry.answers, p_client_hash: 'a'.repeat(64) });
});

test('Pagination preserves records sharing the same timestamp across page boundaries', async t => {
  const date = '2026-10-11T00:00:00+00:00';
  const rows = ['c', 'b', 'a'].map(id => ({ id, created_at: date, answers: {} }));
  const url = await fixture(t, (req,res) => {
    const filter = new URL(req.url,'http://localhost').searchParams.get('or');
    const cursor = filter ? JSON.parse(filter.match(/id.lt.("[^"]*")/)[1]) : undefined;
    if (filter) assert.equal(filter, `(created_at.lt.${date},and(created_at.eq.${date},id.lt.${JSON.stringify(cursor)}))`);
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(rows.filter(row => !cursor || row.id < cursor).slice(0,2)));
  });
  assert.deepEqual((await createStorage({ url, key:'sb_secret_test', cloud:true }).getRecords()).map(row=>row.id), ['c','b','a']);
});

test('Cloud identity uses the Vercel client header and ignores caller forwarded headers/socket', () => {
  const options = { cloud: true, secret: 'server-test-secret' };
  const a = clientHash({ headers: { 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': 'fake' }, socket: { remoteAddress: '127.0.0.1' } }, options);
  const b = clientHash({ headers: { 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': 'different' }, socket: { remoteAddress: '127.0.0.2' } }, options);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, clientHash({ headers: { 'x-vercel-forwarded-for': '203.0.113.8' } }, options));
  assert.throws(() => clientHash({ headers: { 'x-forwarded-for': '203.0.113.7' } }, options), { status: 503 });
  assert.throws(() => clientHash({ headers: { 'x-vercel-forwarded-for': '203.0.113.7' } }, { cloud: true, secret: '' }), { status: 503 });
});
