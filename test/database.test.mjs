import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../supabase.sql', import.meta.url), 'utf8');
async function database(t, { legacyNull = false } = {}) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    CREATE TABLE public.submissions (id text PRIMARY KEY, created_at timestamptz DEFAULT now(), answers jsonb NOT NULL);
    INSERT INTO public.submissions (id,answers) VALUES ('prior', '{"level":"THCS"}');`);
  if (legacyNull) await db.exec("INSERT INTO public.submissions(id,created_at,answers) VALUES ('null-date',NULL,'{\"level\":\"THPT\"}')");
  await db.exec(sql);
  return db;
}
const submit = (db, id, hash = 'a'.repeat(64)) => db.query('SELECT public.submit_survey($1,now(),$2::jsonb,$3)', [id, JSON.stringify({ level: 'THCS' }), hash]);

test('Anonymous and authenticated callers cannot read, write, or invoke the service RPC', async t => {
  const db = await database(t);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT answers FROM public.submissions'), { code: '42501' });
    await assert.rejects(db.query("INSERT INTO public.submissions(id,answers) VALUES ('blocked','{}')"), { code: '42501' });
    await assert.rejects(submit(db, 'blocked-rpc'), { code: '42501' });
    await db.exec('RESET ROLE');
  }
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.submissions')).rows[0].count, 1);
});

test('Migration is repeatable and retains existing submissions', async t => {
  const db = await database(t);
  await db.exec(sql);
  await db.exec('SET ROLE service_role');
  assert.equal((await db.query('SELECT id FROM public.submissions')).rows[0].id, 'prior');
});

test('Database cooldown blocks a second submission and permits another client or expired cooldown', async t => {
  const db = await database(t);
  await db.exec('SET ROLE service_role');
  await submit(db, 'first');
  await assert.rejects(submit(db, 'too-soon'), err => err.code === 'P0001' && err.message === 'SURVEY_RATE_LIMITED');
  await submit(db, 'different-client', 'b'.repeat(64));
  await db.query("UPDATE private.survey_rate_limits SET last_submitted_at = now() - interval '16 seconds'");
  await submit(db, 'after-cooldown');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.submissions')).rows[0].count, 4);
});

test('Failed insertion rolls back the cooldown reservation', async t => {
  const db = await database(t);
  await db.exec('SET ROLE service_role');
  await assert.rejects(submit(db, 'prior'), { code: '23505' });
  await submit(db, 'valid-after-failure');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM private.survey_rate_limits')).rows[0].count, 1);
});

test('Legacy null timestamps are backfilled without losing answers and future nulls are rejected', async t => {
  const db = await database(t, { legacyNull: true });
  const record = (await db.query("SELECT created_at::text,answers FROM public.submissions WHERE id='null-date'")).rows[0];
  assert.equal(typeof record.created_at, 'string');
  assert.equal(record.answers.level, 'THPT');
  await assert.rejects(db.query("INSERT INTO public.submissions(id,created_at,answers) VALUES ('future-null',NULL,'{}')"), { code: '23502' });
});
