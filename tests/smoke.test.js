import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 18000 + Math.floor(Math.random() * 12000);
const origin = 'http://localhost:' + port;
let child;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error('Server stopped before it was ready');
    try {
      const res = await fetch(origin + '/');
      if (res.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('Server did not start');
}

test('API smoke checks (no real database or payment activity)', async t => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: 'postgres://plusstore:invalid@127.0.0.1:1/plusstore_test',
      SESSION_SECRET: 'local-test-session-secret-is-at-least-32-chars',
      PUBLIC_ORIGIN: origin,
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => { if (child && child.exitCode === null) child.kill('SIGTERM'); });
  await waitForServer();

  await t.test('storefront and account page are delivered', async () => {
    const home = await fetch(origin + '/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Plus Store/);
    const account = await fetch(origin + '/account');
    assert.equal(account.status, 200);
    assert.match(await account.text(), /تسجيل الدخول/);
  });

  await t.test('health reports disconnected database instead of false success', async () => {
    const res = await fetch(origin + '/api/health');
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.database, 'disconnected');
    assert.equal(body.payments, false);
    assert.equal(body.signing, false);
  });

  await t.test('POST from unknown origin is rejected', async () => {
    const res = await fetch(origin + '/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://not-our-site.example' },
      body: JSON.stringify({ email: 'test@example.com', password: 'never-a-real-password' })
    });
    assert.equal(res.status, 403);
  });

  await t.test('unauthenticated order access is denied', async () => {
    const res = await fetch(origin + '/api/orders');
    assert.equal(res.status, 401);
  });

  await t.test('server source and SQL are not exposed as static content', async () => {
    const [js, sql] = await Promise.all([
      fetch(origin + '/server.js'),
      fetch(origin + '/database/schema.sql')
    ]);
    assert.equal(js.status, 404);
    assert.equal(sql.status, 404);
  });
});
