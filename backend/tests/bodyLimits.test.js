// Request-body size limits (middlewares/bodyLimits.js).
//
// Runs the REAL middleware in a small Express app over real HTTP, mirroring server.js:
//   jsonBodyParser -> rawBodyParser -> payloadTooLargeHandler -> routes -> app error handler
// and asserts: normal CRUD stays normal, oversized bodies get a friendly 413, the bulk-import
// routes keep their larger limit, uploads / exports / GETs are unaffected, and every other
// error still reaches the application's own handler. Also guards server.js wiring and that no
// new `/bulk-import` route is added without being allowlisted.
// Usage: node --test tests/bodyLimits.test.js
process.env.AWS_REGION ||= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ||= 'x';
process.env.AWS_SECRET_ACCESS_KEY ||= 'x';
process.env.AWS_BUCKET_NAME ||= 'test-bucket';
process.env.CLOUDFRONT_DOMAIN ||= 'example.test';
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET ||= 'dummy';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const {
  jsonBodyParser, rawBodyParser, payloadTooLargeHandler, KINDS, LARGE_BODY_ROUTES, BULK_IMPORT_PATHS,
} = require('../middlewares/bodyLimits');

const MB = 1024 * 1024;
const FORBIDDEN_LEAKS = [/PayloadTooLargeError/i, /request entity too large/i, /body-parser/i, /node_modules/, /\bat .*\.js:\d+/, /stack/i, /raw-body/i];

// ---- the app under test (same order as server.js) ----
let downstreamErrors = [];
function buildApp({ limitsMiddleware = true } = {}) {
  const app = express();
  if (limitsMiddleware) {
    app.use(jsonBodyParser);
    app.use(rawBodyParser);
    app.use(payloadTooLargeHandler);
  } else {
    app.use(express.json({ limit: '50mb' })); // what server.js used before this change
  }
  // any route: echo how big the parsed body was
  app.all(/.*/, (req, res) => {
    if (req.query.big) return res.type('text/plain').send('x'.repeat(5 * MB)); // a large RESPONSE (export/download)
    res.json({ ok: true, method: req.method, parsedBytes: req.body ? JSON.stringify(req.body).length : 0, contentType: req.headers['content-type'] || null });
  });
  // stand-in for the application's own error handler (server.js:323)
  app.use((err, req, res, next) => { downstreamErrors.push(err); res.status(err.status || 500).json({ error: 'APP-HANDLER', type: err.type }); });
  return app;
}

let server; let baseUrl;
async function listen(app) {
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}
test.afterEach(() => { downstreamErrors = []; });
test.after(() => server && server.close());

// JSON body of ~`bytes` bytes. `chunked` sends it with no Content-Length.
function send(method, pathAndQuery, { bytes = 0, body, chunked = false, contentType = 'application/json' } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? body : JSON.stringify({ blob: 'a'.repeat(Math.max(0, bytes - 12)) });
    const headers = method === 'GET' ? {} : { 'Content-Type': contentType };
    if (!chunked && method !== 'GET') headers['Content-Length'] = Buffer.byteLength(payload);
    const req = http.request(`${baseUrl}${pathAndQuery}`, { method, headers }, (res) => {
      let data = ''; res.on('data', (d) => (data += d));
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch (e) { /* not json */ } resolve({ status: res.statusCode, json, raw: data, length: data.length }); });
    });
    req.on('error', reject);
    if (method === 'GET') return req.end();
    if (chunked) { const buf = Buffer.from(payload); for (let i = 0; i < buf.length; i += 64 * 1024) req.write(buf.subarray(i, i + 64 * 1024)); req.end(); } else req.end(payload);
  });
}
const noLeak = (res) => { for (const re of FORBIDDEN_LEAKS) assert.ok(!re.test(res.raw), `response leaks ${re}: ${res.raw.slice(0, 200)}`); };

// ============ baseline: how the server behaved BEFORE ============
test('BASELINE (old config, express.json 50mb): a 20MB body on an ordinary route is accepted', async () => {
  const s = http.createServer(buildApp({ limitsMiddleware: false }));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const prev = baseUrl; baseUrl = `http://127.0.0.1:${s.address().port}`;
  const res = await send('POST', '/api/contacts', { bytes: 20 * MB });
  assert.equal(res.status, 200, 'the old config should accept 20MB - that is the exposure being closed');
  baseUrl = prev; s.close();
});

test.before(async () => { await listen(buildApp()); });

// ============ normal requests ============
test('normal CRUD: a small JSON body is parsed and passes through unchanged', async () => {
  const res = await send('POST', '/api/contacts', { body: JSON.stringify({ name: 'Asha', email: 'a@b.test' }) });
  assert.equal(res.status, 200);
  assert.equal(res.json.parsedBytes, JSON.stringify({ name: 'Asha', email: 'a@b.test' }).length);
});

test('a body just under 1MB is accepted on an ordinary route', async () => {
  assert.equal((await send('POST', '/api/contacts', { bytes: 1000 * 1024 })).status, 200);
});

test('a body over 1MB on an ordinary route is rejected with a friendly 413 (no internals)', async () => {
  const res = await send('POST', '/api/contacts', { bytes: 1 * MB + 4096 });
  assert.equal(res.status, 413);
  assert.deepEqual(Object.keys(res.json).sort(), ['code', 'error', 'message', 'success']);
  assert.equal(res.json.success, false);
  assert.equal(res.json.message, KINDS.default.message);
  assert.equal(res.json.error, res.json.message, 'screens read `error` OR `message`; both must carry the friendly text');
  assert.equal(res.json.code, 'PAYLOAD_TOO_LARGE');
  noLeak(res);
});

test('a chunked body with no Content-Length is also stopped, with the same friendly 413 (not a dropped connection)', async () => {
  const res = await send('POST', '/api/deals', { bytes: 3 * MB, chunked: true });
  assert.equal(res.status, 413);
  assert.equal(res.json.message, KINDS.default.message);
  noLeak(res);
});

test('PUT / PATCH / DELETE with oversized JSON are limited too', async () => {
  for (const m of ['PUT', 'PATCH', 'DELETE']) {
    const res = await send(m, '/api/contacts/123', { bytes: 2 * MB });
    assert.equal(res.status, 413, `${m} was not limited`);
  }
});

// ============ bulk imports ============
test('all 9 bulk-import routes accept a multi-MB body (well over the 1MB default)', async () => {
  assert.equal(BULK_IMPORT_PATHS.length, 9);
  for (const p of BULK_IMPORT_PATHS) {
    const res = await send('POST', p, { bytes: 4 * MB });
    assert.equal(res.status, 200, `${p} rejected a 4MB import`);
  }
});

test('a bulk import over its own limit gets the import-specific friendly 413', async () => {
  const res = await send('POST', '/api/items/bulk-import', { bytes: 26 * MB });
  assert.equal(res.status, 413);
  assert.equal(res.json.message, KINDS['bulk-import'].message);
  assert.match(res.json.message, /split the import into smaller batches/);
  noLeak(res);
});

test('a bulk import just under 25MB is accepted', async () => {
  assert.equal((await send('POST', '/api/purchases/bulk-import', { bytes: 24 * MB })).status, 200);
});

test('the larger limit is for EXACT method + path only', async () => {
  // different method
  assert.equal((await send('PUT', '/api/items/bulk-import', { bytes: 2 * MB })).status, 413);
  // longer path
  assert.equal((await send('POST', '/api/contacts/bulk-import/extra', { bytes: 2 * MB })).status, 413);
  // sibling path
  assert.equal((await send('POST', '/api/contacts/bulk', { bytes: 2 * MB })).status, 413);
  // the allowlisted path smuggled into the query string of a different route
  assert.equal((await send('POST', '/api/contacts?x=/api/items/bulk-import', { bytes: 2 * MB })).status, 413);
  // same route as Express would route it: query string, case and trailing slash do not matter
  assert.equal((await send('POST', '/api/items/bulk-import?dryRun=1', { bytes: 2 * MB })).status, 200);
  assert.equal((await send('POST', '/API/Items/Bulk-Import/', { bytes: 2 * MB })).status, 200);
});

// ============ signature image ============
test('saving a signature accepts a ~2.7MB base64 image (a 2MB file) and rejects a huge one', async () => {
  const dataUrl = 'data:image/png;base64,' + 'A'.repeat(Math.ceil((2 * MB * 4) / 3));
  const ok = await send('POST', '/api/document-settings/signatures', { body: JSON.stringify({ name: 'Mine', type: 'upload', dataUrl }) });
  assert.equal(ok.status, 200);
  const big = await send('POST', '/api/document-settings/signatures', { bytes: 6 * MB });
  assert.equal(big.status, 413);
  assert.equal(big.json.message, KINDS.signature.message);
  // other document-settings routes keep the default
  assert.equal((await send('PUT', '/api/document-settings', { bytes: 2 * MB })).status, 413);
});

// ============ things that must NOT be affected ============
test('a large RESPONSE (export / download) is unaffected by the request-body limit', async () => {
  const res = await send('GET', '/api/contacts/export?big=1');
  assert.equal(res.status, 200);
  assert.equal(res.length, 5 * MB);
});

test('GET with filters and a long query string is unaffected', async () => {
  const q = new URLSearchParams({ search: 'x'.repeat(3000), stage: 'Won', page: '3' }).toString();
  assert.equal((await send('GET', `/api/deals?${q}`)).status, 200);
});

test('multipart file uploads are not JSON: the JSON limit does not touch them', async () => {
  const boundary = '----bodylimits';
  const file = 'z'.repeat(3 * MB);
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="profile"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n${file}\r\n--${boundary}--\r\n`;
  const res = await send('POST', '/api/auth/profile', { body, contentType: `multipart/form-data; boundary=${boundary}` });
  assert.equal(res.status, 200, 'a 3MB multipart upload must reach the route (its uploader enforces its own limit)');
  assert.equal(res.json.parsedBytes, 0, 'the JSON parser must not have consumed a multipart body');
});

// ============ errors that are NOT "too large" keep going to the app's handler ============
test('malformed JSON is not swallowed: it reaches the application error handler as before', async () => {
  const res = await send('POST', '/api/contacts', { body: '{"name": "broken' });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'APP-HANDLER');
  assert.equal(downstreamErrors[0].type, 'entity.parse.failed');
});

test('the too-large handler ignores every other error and passes it on untouched', () => {
  for (const err of [new Error('boom'), Object.assign(new Error('x'), { status: 413 }), Object.assign(new Error('y'), { code: 'LIMIT_FILE_SIZE' }), Object.assign(new Error('z'), { type: 'entity.parse.failed' })]) {
    let passed; payloadTooLargeHandler(err, { headers: {}, method: 'POST', originalUrl: '/x' }, { headersSent: false }, (e) => (passed = e));
    assert.equal(passed, err, `${err.message} was handled instead of passed on`);
  }
  let passedNone = 'unset'; payloadTooLargeHandler(undefined, {}, {}, (e) => (passedNone = e));
  assert.equal(passedNone, undefined);
});

test('the server logs an operational line for a rejection, with no body or error text', async () => {
  const lines = []; const orig = console.warn; console.warn = (...a) => lines.push(a.join(' '));
  try { await send('POST', '/api/contacts', { bytes: 2 * MB }); } finally { console.warn = orig; }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[body-limit\] 413 "POST \/api\/contacts" content-length=\d+ limit=default$/);
  assert.ok(!/aaaa/.test(lines[0]));
});

// ============ wiring and coverage guards ============
const BACKEND = path.join(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(BACKEND, 'server.js'), 'utf8');

test('server.js uses the limits middleware, in the right order, and no 50mb parser is left', () => {
  assert.ok(!/limit:\s*['"]50mb['"]/.test(serverSrc), 'a 50mb parser is still in server.js');
  assert.match(serverSrc, /require\('\.\/middlewares\/bodyLimits'\)/);
  const at = (s) => serverSrc.indexOf(s);
  const parser = at('app.use(jsonBodyParser)');
  assert.ok(parser > 0, 'jsonBodyParser is not mounted');
  assert.ok(at('app.use(rawBodyParser)') > parser, 'raw parser must follow the json parser');
  assert.ok(at('app.use(payloadTooLargeHandler)') > at('app.use(rawBodyParser)'), 'the 413 handler must come right after the parsers');
  assert.ok(at("require('./middlewares/stripDollarKeys')") > at('app.use(payloadTooLargeHandler)'), 'stripDollarKeys must still run after body parsing');
  assert.ok(at("app.use('/api/companies'") > at('app.use(payloadTooLargeHandler)'), 'parsers must be mounted before the routes');
});

test('every `/bulk-import` route in routes/ is allowlisted (add new ones to bulkLimits)', () => {
  // route file -> mount path, from server.js:  const x = require('./routes/file') ... app.use('/api/..', x)
  const varToFile = {};
  for (const m of serverSrc.matchAll(/const\s+(\w+)\s*=\s*require\(\s*['"]\.\/routes\/([\w.\-]+?)(?:\.js)?['"]\s*\)/g)) varToFile[m[1]] = m[2];
  const fileToMount = {};
  for (const m of serverSrc.matchAll(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/g)) if (varToFile[m[2]]) fileToMount[varToFile[m[2]]] = m[1];

  const found = [];
  for (const f of fs.readdirSync(path.join(BACKEND, 'routes'))) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(BACKEND, 'routes', f), 'utf8');
    if (!/['"]\/bulk-import['"]/.test(src)) continue;
    const mount = fileToMount[f.replace(/\.js$/, '')];
    assert.ok(mount, `routes/${f} defines /bulk-import but is not mounted in server.js under a recognised pattern`);
    found.push(`${mount}/bulk-import`);
  }
  assert.deepEqual(found.sort(), [...BULK_IMPORT_PATHS].sort(), 'bulk-import routes in routes/ and the allowlist differ');
  for (const p of found) assert.equal(LARGE_BODY_ROUTES.get(`POST ${p}`), 'bulk-import');
});

test('the signature route in the allowlist really exists', () => {
  const src = fs.readFileSync(path.join(BACKEND, 'routes', 'documentSettingsRoutes.js'), 'utf8');
  assert.match(src, /router\.post\(\s*['"]\/signatures['"]/);
  assert.match(serverSrc, /app\.use\(\s*['"]\/api\/document-settings['"]/);
});

test('limits can be tuned from the environment without a code change', () => {
  const modPath = require.resolve('../middlewares/bodyLimits');
  const keep = { ...process.env };
  try {
    process.env.JSON_BODY_LIMIT = '2mb'; process.env.JSON_BULK_IMPORT_LIMIT = '40mb';
    delete require.cache[modPath];
    const tuned = require('../middlewares/bodyLimits');
    assert.equal(tuned.KINDS.default.limit, '2mb');
    assert.equal(tuned.KINDS['bulk-import'].limit, '40mb');
  } finally {
    for (const k of ['JSON_BODY_LIMIT', 'JSON_BULK_IMPORT_LIMIT']) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
    delete require.cache[modPath]; require('../middlewares/bodyLimits');
  }
});

// ============ the subscription router: its own 50MB parser and the public webhook ============
// routes/subscription.js is mounted BEFORE the app-level parsers, so it needs the limits itself.
// The webhook is public and is read into a string before its signature is checked.
let subServer; let subUrl;
test('subscription router: setup (the real router, mounted before any app-level parser, as in server.js)', async () => {
  const app = express();
  app.use('/api/subscription', require('../routes/subscription'));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: 'APP-HANDLER', type: err.type }));
  await new Promise((r) => { subServer = app.listen(0, '127.0.0.1', r); });
  subUrl = `http://127.0.0.1:${subServer.address().port}`;
});
const sub = (method, p, opts) => { const prev = baseUrl; baseUrl = subUrl; return send(method, p, opts).finally(() => { baseUrl = prev; }); };

test('webhook: a normal-size event still reaches its handler (no signature -> the handler own 400, not a 413)', async () => {
  const res = await sub('POST', '/api/subscription/webhook', { body: JSON.stringify({ event: 'subscription.charged', payload: { x: 1 } }) });
  assert.equal(res.status, 400);
  assert.match(res.raw, /Missing webhook signature or body/);
});

test('webhook: a body DECLARED over the cap is refused with a 413 before a single byte is read', async () => {
  // A client that declares 5MB but has sent only a few bytes: the answer must come from the header alone.
  const raw = await new Promise((resolve, reject) => {
    const net = require('node:net'); const sock = net.connect(Number(new URL(subUrl).port), '127.0.0.1');
    let out = ''; sock.on('data', (d) => (out += d)); sock.on('error', reject); sock.on('close', () => resolve(out));
    sock.write('POST /api/subscription/webhook HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 5242880\r\n\r\n{"a":1}');
    setTimeout(() => sock.destroy(), 1500);
  });
  assert.match(raw, /^HTTP\/1\.1 413/, raw.slice(0, 120));
  assert.match(raw, /"code":"PAYLOAD_TOO_LARGE"/);
  assert.match(raw, /Connection: close/i);
  for (const re of FORBIDDEN_LEAKS) assert.ok(!re.test(raw), `leaks ${re}`);
});

test('webhook: a body streamed past the cap is cut off (413 or a closed connection), and the server stays healthy', async () => {
  for (const spec of [{ bytes: 3 * MB }, { bytes: 4 * MB, chunked: true }]) {
    const outcome = await sub('POST', '/api/subscription/webhook', spec).then((r) => r.status, (e) => e.code);
    assert.ok(outcome === 413 || outcome === 'ECONNRESET' || outcome === 'EPIPE', `unexpected outcome: ${outcome}`);
  }
  // nothing was left wedged: a normal request is still served right away
  const after = await sub('POST', '/api/subscription/webhook', { body: JSON.stringify({ event: 'ok' }) });
  assert.equal(after.status, 400);
  assert.match(after.raw, /Missing webhook signature or body/);
});

test('webhook: a body just under the cap is still read in full', async () => {
  const body = JSON.stringify({ event: 'x', pad: 'p'.repeat(900 * 1024) });
  const res = await sub('POST', '/api/subscription/webhook', { body });
  assert.notEqual(res.status, 413, 'a 900KB webhook must not be rejected');
});

test('billing routes: JSON over 1MB gets the friendly 413 (was 50MB); a small body still reaches auth', async () => {
  const big = await sub('POST', '/api/subscription/create', { bytes: 2 * MB });
  assert.equal(big.status, 413);
  assert.equal(big.json.message, KINDS.default.message);
  noLeak(big);
  const small = await sub('POST', '/api/subscription/create', { body: JSON.stringify({ mandateMethod: 'manual' }) });
  assert.notEqual(small.status, 413, 'a normal billing request must not be size-limited');
});

test.after(() => { if (subServer) subServer.close(); setTimeout(() => process.exit(process.exitCode || 0), 200).unref(); });

test('no 50MB parser remains anywhere in server code', () => {
  const offenders = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'tests', 'scripts', 'docs', 'temp'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith('.js')) {
      const src = fs.readFileSync(f, 'utf8');
      if (/express\.(json|raw|text|urlencoded)\([^)]*limit:\s*['"](\d{2,}mb)['"]/.test(src) && !/bodyLimits\.js$/.test(f)) offenders.push(path.relative(BACKEND, f));
    } } };
  walk(BACKEND);
  assert.deepEqual(offenders, [], 'a 10MB+ body parser is configured outside bodyLimits.js');
});

// ============ anonymous public-form submit: the 100kb limit its router always intended ============
test('public form submit: the 100kb limit now actually applies (a route-level parser could never win after the app-level one)', async () => {
  const ok = await send('POST', '/api/public/forms/my-form/submit', { bytes: 90 * 1024 });
  assert.equal(ok.status, 200, 'a normal-size submission must be accepted');
  const big = await send('POST', '/api/public/forms/my-form/submit', { bytes: 150 * 1024 });
  assert.equal(big.status, 413);
  assert.equal(big.json.message, KINDS['public-form'].message);
  assert.equal(big.json.error, big.json.message);
  noLeak(big);
});

test('the public-form rule matches only that exact route shape', async () => {
  // not a submit path: ordinary 1MB default applies (150KB is fine there)
  assert.equal((await send('POST', '/api/public/forms/my-form', { bytes: 150 * 1024 })).status, 200);
  assert.equal((await send('POST', '/api/public/forms/a/b/submit', { bytes: 150 * 1024 })).status, 200);
  assert.equal((await send('PUT', '/api/public/forms/my-form/submit', { bytes: 150 * 1024 })).status, 200);
  // Express routes case-insensitively and ignores a trailing slash, so the limit must too
  assert.equal((await send('POST', '/API/Public/Forms/My-Form/Submit/', { bytes: 150 * 1024 })).status, 413);
  // a query string cannot hide the route
  assert.equal((await send('POST', '/api/public/forms/my-form/submit?x=1', { bytes: 150 * 1024 })).status, 413);
});

test('the public-form route in the pattern really exists, and its rate limiters run on the same route', () => {
  const src = fs.readFileSync(path.join(BACKEND, 'routes', 'publicFormRoutes.js'), 'utf8');
  assert.match(src, /router\.post\(\s*["']\/:publicSlug\/submit["']/);
  assert.match(serverSrc, /app\.use\(\s*['"]\/api\/public\/forms['"]/);
});
