const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const SESSION_COOKIE = 'casajoy_editor_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 8;
// Keep PBKDF2 within the free Worker CPU budget while retaining salted hashing.
const PASSWORD_HASH_ITERATIONS = 10000;
const ACCESS_ISSUER = 'https://dawn-salad-adac.cloudflareaccess.com';
let accessKeysPromise;
const ALLOWED_FIELDS = [
  'source_name', 'company', 'person', 'email', 'phone', 'exhibition', 'day',
  'relationship', 'category', 'followup', 'priority', 'notes', 'review_note',
  'status', 'good_enough', 'form_image_key', 'card_image_key', 'qr_data'
];

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers(JSON_HEADERS);
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Response(JSON.stringify(data), { status, headers });
}

function cors(response, request, extraHeaders = {}) {
  const origin = request.headers.get('Origin');
  if (origin === 'https://casajoy-exhibition-dashboard.pages.dev') {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  for (const [name, value] of Object.entries(extraHeaders)) response.headers.set(name, value);
  response.headers.set('Vary', 'Origin');
  return response;
}

function requireAuth(request, env) {
  const token = request.headers.get('X-Internal-Token');
  if (!env.INTERNAL_API_TOKEN || token !== env.INTERNAL_API_TOKEN) return null;
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  const allowed = (env.ALLOWED_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (email && allowed.length && !allowed.includes(email.toLowerCase())) return null;
  return email || 'cloudflare-access-user';
}

function allowedAdminEmails(env) {
  return (env.ADMIN_ACCESS_EMAILS || env.ALLOWED_EMAILS || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
}

async function requireAdminAccess(request, env) {
  if (!hasInternalToken(request, env)) return null;
  const email = await verifyAccessIdentity(request, env);
  if (!email || !allowedAdminEmails(env).includes(email)) return null;
  return email;
}

function hasInternalToken(request, env) {
  return Boolean(env.INTERNAL_API_TOKEN && request.headers.get('X-Internal-Token') === env.INTERNAL_API_TOKEN);
}

function bytesToHex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function accessKeys(env) {
  if (!accessKeysPromise) {
    const issuer = env.ACCESS_TEAM_DOMAIN ? `https://${env.ACCESS_TEAM_DOMAIN}` : ACCESS_ISSUER;
    accessKeysPromise = fetch(`${issuer}/cdn-cgi/access/certs`, { cf: { cacheTtl: 300, cacheEverything: true } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`Access certs returned ${response.status}`)))
      .then(data => data.keys || [])
      .catch(error => {
        accessKeysPromise = null;
        throw error;
      });
  }
  return accessKeysPromise;
}

async function verifyAccessIdentity(request, env) {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) return null;
  try {
    const parts = assertion.split('.');
    if (parts.length !== 3) return null;
    const header = decodeJwtPart(parts[0]);
    const claims = decodeJwtPart(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) return null;
    const issuer = env.ACCESS_TEAM_DOMAIN ? `https://${env.ACCESS_TEAM_DOMAIN}` : ACCESS_ISSUER;
    if (claims.iss !== issuer || !claims.email) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp <= now || (claims.nbf && claims.nbf > now)) return null;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (env.ACCESS_AUDIENCE && !audience.includes(env.ACCESS_AUDIENCE)) return null;
    const key = (await accessKeys(env)).find(item => item.kid === header.kid);
    if (!key) return null;
    const cryptoKey = await crypto.subtle.importKey(
      'jwk', key,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', cryptoKey, decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    return valid ? String(claims.email).trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: PASSWORD_HASH_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split('=')));
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function dateValue(value) {
  if (!value) return 0;
  const normalized = String(value).includes('T') ? String(value) : `${String(value).replace(' ', 'T')}Z`;
  return Date.parse(normalized) || 0;
}

async function getEditorSession(request, env) {
  const token = parseCookies(request.headers.get('Cookie') || '')[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await env.DB.prepare(`
    SELECT s.id, s.user_id, s.expires_at, u.username, u.display_name, u.role, u.active
    FROM editor_sessions s
    JOIN editor_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL
  `).bind(tokenHash).first();
  if (!session || !session.active || dateValue(session.expires_at) <= Date.now()) return null;
  return { ...session, tokenHash };
}

function editorLabel(session) {
  return session.display_name || session.username;
}

function validateUsername(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/.test(value.trim());
}

function validatePassword(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 200;
}

async function auditAuth(env, { userId = null, actor = '', username = '', action, details = {} }) {
  await env.DB.prepare(
    'INSERT INTO auth_audit (user_id, actor, username, action, details_json) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, actor, username, action, JSON.stringify(details)).run();
}

async function loginAttemptKey(request, username) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return sha256Hex(`${username.toLowerCase()}|${ip}`);
}

async function isLoginBlocked(env, attemptKey) {
  const row = await env.DB.prepare('SELECT failures, window_started_at FROM login_attempts WHERE attempt_key = ?').bind(attemptKey).first();
  if (!row) return false;
  if (dateValue(row.window_started_at) + LOGIN_WINDOW_MS <= Date.now()) {
    await env.DB.prepare('DELETE FROM login_attempts WHERE attempt_key = ?').bind(attemptKey).run();
    return false;
  }
  return Number(row.failures) >= MAX_LOGIN_FAILURES;
}

async function recordLoginFailure(env, attemptKey) {
  await env.DB.prepare(`
    INSERT INTO login_attempts (attempt_key, failures, window_started_at, updated_at)
    VALUES (?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(attempt_key) DO UPDATE SET
      failures = CASE
        WHEN strftime('%s', 'now') - strftime('%s', window_started_at) >= 900 THEN 1
        ELSE failures + 1
      END,
      window_started_at = CASE
        WHEN strftime('%s', 'now') - strftime('%s', window_started_at) >= 900 THEN CURRENT_TIMESTAMP
        ELSE window_started_at
      END,
      updated_at = CURRENT_TIMESTAMP
  `).bind(attemptKey).run();
}

async function login(request, env) {
  const input = await request.json().catch(() => null);
  const username = typeof input?.username === 'string' ? input.username.trim() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  const attemptKey = await loginAttemptKey(request, username || 'invalid');
  if (await isLoginBlocked(env, attemptKey)) return json({ error: 'Too many failed attempts. Try again later.' }, 429);

  const user = validateUsername(username)
    ? await env.DB.prepare('SELECT * FROM editor_users WHERE username = ? COLLATE NOCASE').bind(username).first()
    : null;
  const salt = user?.password_salt || 'casajoy-invalid-login-salt';
  const suppliedHash = await passwordHash(password, salt);
  const valid = Boolean(user && user.active && validatePassword(password) && constantTimeEqual(suppliedHash, user.password_hash));
  if (!valid) {
    await recordLoginFailure(env, attemptKey);
    await auditAuth(env, { userId: user?.id || null, username, action: 'login_failed' });
    return json({ error: 'Invalid username or password.' }, 401);
  }

  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO editor_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').bind(randomHex(16), user.id, tokenHash, expiresAt),
    env.DB.prepare('UPDATE editor_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM login_attempts WHERE attempt_key = ?').bind(attemptKey)
  ]);
  await auditAuth(env, { userId: user.id, username: user.username, actor: user.username, action: 'login' });
  return json({ authenticated: true, user: { username: user.username, display_name: user.display_name, role: user.role } }, 200, {
    'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000))
  });
}

function cleanPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const patch = {};
  for (const field of ALLOWED_FIELDS) if (Object.hasOwn(input, field)) patch[field] = input[field];
  if (Object.hasOwn(patch, 'good_enough')) patch.good_enough = patch.good_enough ? 1 : 0;
  return patch;
}

async function createBackup(env, generatedAt = new Date()) {
  const [contacts, history] = await Promise.all([
    env.DB.prepare('SELECT * FROM contacts ORDER BY id').all(),
    env.DB.prepare('SELECT * FROM edit_history ORDER BY id').all()
  ]);
  const stamp = generatedAt.toISOString().replace(/[:.]/g, '-');
  const key = `backups/d1-${stamp}.json`;
  const body = JSON.stringify({
    schema_version: 1,
    generated_at: generatedAt.toISOString(),
    contacts: contacts.results,
    edit_history: history.results
  });
  await env.SCANS.put(key, body, {
    httpMetadata: {
      contentType: 'application/json',
      cacheControl: 'private, max-age=0'
    }
  });

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let cursor;
  do {
    const listed = await env.SCANS.list({ prefix: 'backups/d1-', cursor });
    const expired = listed.objects.filter(object => object.uploaded && object.uploaded.getTime() < cutoff).map(object => object.key);
    if (expired.length) await env.SCANS.delete(expired);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return { key, contacts: contacts.results.length, history: history.results.length };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      const headers = {
        'Access-Control-Allow-Headers': 'Content-Type, If-Match',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin'
      };
      if (origin === 'https://casajoy-exhibition-dashboard.pages.dev') {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
      return new Response(null, { headers });
    }
    if (url.pathname === '/api/health') return cors(json({ ok: true, protected: true }), request);

    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      if (!hasInternalToken(request, env)) return cors(json({ error: 'Authentication required.' }, 401), request);
      return cors(await login(request, env), request);
    }
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      if (!hasInternalToken(request, env)) return cors(json({ error: 'Authentication required.' }, 401), request);
      const token = parseCookies(request.headers.get('Cookie') || '')[SESSION_COOKIE];
      if (token) {
        const tokenHash = await sha256Hex(token);
        await env.DB.prepare('UPDATE editor_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?').bind(tokenHash).run();
      }
      return cors(json({ authenticated: false }), request, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (url.pathname === '/api/auth/me' && request.method === 'GET') {
      if (!hasInternalToken(request, env)) return cors(json({ error: 'Authentication required.' }, 401), request);
      const session = await getEditorSession(request, env);
      if (!session) return cors(json({ error: 'Please sign in.' }, 401), request);
      return cors(json({ authenticated: true, user: { username: session.username, display_name: session.display_name, role: session.role } }), request);
    }

    const adminPath = url.pathname.startsWith('/admin/api');
    if (adminPath) {
      const adminEmail = await requireAdminAccess(request, env);
      if (!adminEmail) return cors(json({ error: 'Administrator access required.' }, 403), request);
      if (url.pathname === '/admin/api/status' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM editor_users').first();
        return cors(json({ admin_email: adminEmail, users: Number(row?.count || 0) }), request);
      }
      if (url.pathname === '/admin/api/users' && request.method === 'GET') {
        const result = await env.DB.prepare(`
          SELECT id, username, display_name, role, active, created_at, updated_at, last_login_at
          FROM editor_users ORDER BY username COLLATE NOCASE
        `).all();
        return cors(json(result.results), request);
      }
      if (url.pathname === '/admin/api/users' && request.method === 'POST') {
        const input = await request.json().catch(() => null);
        const username = typeof input?.username === 'string' ? input.username.trim() : '';
        const displayName = typeof input?.display_name === 'string' ? input.display_name.trim() : '';
        const password = input?.password;
        const role = input?.role === 'admin' ? 'admin' : 'editor';
        if (!validateUsername(username) || !displayName || displayName.length > 100 || !validatePassword(password)) {
          return cors(json({ error: 'Use a valid username, display name, and password of at least 10 characters.' }, 400), request);
        }
        try {
          const salt = randomHex(16);
          const hash = await passwordHash(password, salt);
          const result = await env.DB.prepare(`
            INSERT INTO editor_users (username, display_name, password_salt, password_hash, role)
            VALUES (?, ?, ?, ?, ?)
          `).bind(username, displayName, salt, hash, role).run();

          // Look up by the unique business key instead of relying on D1 insert metadata.
          const created = await env.DB.prepare(`
            SELECT id, username, display_name, role, active, created_at, updated_at, last_login_at
            FROM editor_users WHERE username = ? COLLATE NOCASE
          `).bind(username).first();
          if (!created) {
            console.error('admin_user_create_missing_row', {
              username,
              changes: result?.meta?.changes ?? null,
              lastRowId: result?.meta?.last_row_id ?? null
            });
            return cors(json({ error: 'The account could not be confirmed after creation. Please try again.' }, 500), request);
          }

          // An audit failure must not make a successfully created account look failed.
          try {
            await auditAuth(env, { userId: created.id, actor: adminEmail, username: created.username, action: 'user_created', details: { role } });
          } catch (auditError) {
            console.error('admin_user_create_audit_failed', {
              username: created.username,
              userId: created.id,
              error: String(auditError?.message || auditError)
            });
          }
          return cors(json(created, 201), request);
        } catch (error) {
          const message = String(error?.message || error);
          if (message.toLowerCase().includes('unique')) return cors(json({ error: 'Username is already in use.' }, 409), request);
          console.error('admin_user_create_failed', { username, error: message });
          return cors(json({ error: 'Could not create the account right now. Please try again.' }, 500), request);
        }
      }
      const adminUserMatch = url.pathname.match(/^\/admin\/api\/users\/(\d+)$/);
      if (adminUserMatch && request.method === 'PATCH') {
        const id = Number(adminUserMatch[1]);
        const input = await request.json().catch(() => null);
        const current = await env.DB.prepare('SELECT * FROM editor_users WHERE id = ?').bind(id).first();
        if (!current) return cors(json({ error: 'User not found.' }, 404), request);
        const displayName = Object.hasOwn(input || {}, 'display_name') ? String(input.display_name || '').trim() : current.display_name;
        const active = Object.hasOwn(input || {}, 'active') ? (input.active ? 1 : 0) : current.active;
        const role = input?.role === 'admin' ? 'admin' : (input?.role === 'editor' ? 'editor' : current.role);
        let salt = current.password_salt;
        let hash = current.password_hash;
        const passwordChanged = Object.hasOwn(input || {}, 'password');
        if (passwordChanged) {
          if (!validatePassword(input.password)) return cors(json({ error: 'Password must be at least 10 characters.' }, 400), request);
          salt = randomHex(16);
          hash = await passwordHash(input.password, salt);
        }
        if (!displayName || displayName.length > 100) return cors(json({ error: 'Display name is required.' }, 400), request);
        await env.DB.prepare(`
          UPDATE editor_users SET display_name = ?, password_salt = ?, password_hash = ?, role = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(displayName, salt, hash, role, active, id).run();
        if (!active || passwordChanged) await env.DB.prepare('UPDATE editor_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL').bind(id).run();
        const updated = await env.DB.prepare('SELECT id, username, display_name, role, active, created_at, updated_at, last_login_at FROM editor_users WHERE id = ?').bind(id).first();
        await auditAuth(env, { userId: id, actor: adminEmail, username: current.username, action: passwordChanged ? 'user_updated_password' : 'user_updated', details: { active, role } });
        return cors(json(updated), request);
      }
      const revokeMatch = url.pathname.match(/^\/admin\/api\/users\/(\d+)\/revoke-sessions$/);
      if (revokeMatch && request.method === 'POST') {
        const id = Number(revokeMatch[1]);
        const result = await env.DB.prepare('UPDATE editor_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL').bind(id).run();
        await auditAuth(env, { userId: id, actor: adminEmail, action: 'sessions_revoked', details: { count: result.meta.changes } });
        return cors(json({ revoked: result.meta.changes }), request);
      }
      if (url.pathname === '/admin/api/audit' && request.method === 'GET') {
        const result = await env.DB.prepare(`
          SELECT id, user_id, actor, username, action, details_json, created_at
          FROM auth_audit ORDER BY id DESC LIMIT 200
        `).all();
        return cors(json(result.results), request);
      }
      return cors(json({ error: 'Not found.' }, 404), request);
    }

    const session = await getEditorSession(request, env);
    if (!session) return cors(json({ error: 'Please sign in.' }, 401), request);
    const editor = editorLabel(session);
    if (url.pathname === '/api/session' && request.method === 'GET') return cors(json({ authenticated: true, email: editor, username: session.username }), request);

    if (url.pathname.startsWith('/api/images/') && request.method === 'GET') {
      const key = decodeURIComponent(url.pathname.slice('/api/images/'.length));
      if (!key || key.includes('..') || !key.startsWith('scans/')) return cors(json({ error: 'Invalid image key.' }, 400), request);
      const object = await env.SCANS.get(key);
      if (!object) return cors(json({ error: 'Image not found.' }, 404), request);
      const headers = new Headers({
        'Cache-Control': 'private, max-age=3600',
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        ETag: object.httpEtag
      });
      return new Response(object.body, { headers });
    }

    if (url.pathname === '/api/contacts' && request.method === 'GET') {
      const result = await env.DB.prepare('SELECT * FROM contacts ORDER BY id').all();
      return cors(json(result.results), request);
    }
    if (url.pathname === '/api/contacts' && request.method === 'POST') {
      const input = await request.json().catch(() => null);
      const patch = cleanPatch(input);
      if (!patch || typeof patch.company !== 'string' || !patch.company.trim()) return cors(json({ error: 'Company is required.' }, 400), request);
      const id = `manual-${crypto.randomUUID()}`;
      const row = {
        id,
        source_name: patch.source_name || 'Manual entry',
        company: patch.company || '',
        person: patch.person || '',
        email: patch.email || '',
        phone: patch.phone || '',
        exhibition: patch.exhibition || '',
        day: patch.day || '',
        relationship: patch.relationship || '',
        category: patch.category || '',
        followup: patch.followup || '',
        priority: patch.priority || '',
        notes: patch.notes || '',
        review_note: patch.review_note || '',
        status: patch.status || 'needs_review',
        good_enough: patch.good_enough ? 1 : 0,
        form_image_key: patch.form_image_key || '',
        card_image_key: patch.card_image_key || '',
        qr_data: patch.qr_data || '[]'
      };
      const columns = ['id', ...ALLOWED_FIELDS];
      const values = columns.map(column => row[column] ?? '');
      await env.DB.prepare(`INSERT INTO contacts (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).bind(...values).run();
      const created = await env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first();
      await env.DB.prepare('INSERT INTO edit_history (contact_id, editor, action, before_json, after_json) VALUES (?, ?, ?, ?, ?)').bind(id, editor, 'create', '{}', JSON.stringify(created)).run();
      return cors(json(created, 201), request);
    }
    const match = url.pathname.match(/^\/api\/contacts\/([^/]+)$/);
    if (match && request.method === 'PATCH') {
      const id = decodeURIComponent(match[1]);
      const patch = cleanPatch(await request.json().catch(() => null));
      if (!patch || !Object.keys(patch).length) return cors(json({ error: 'No valid fields supplied.' }, 400), request);
      const current = await env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first();
      if (!current) return cors(json({ error: 'Contact not found.' }, 404), request);
      const expectedRevision = Number(request.headers.get('If-Match') || patch.revision || 0);
      if (expectedRevision && expectedRevision !== current.revision) return cors(json({ error: 'Conflict: record changed since it was loaded.', current }, 409), request);
      const next = { ...current, ...patch, revision: current.revision + 1 };
      const assignments = ALLOWED_FIELDS.map(field => `${field} = ?`).join(', ');
      const values = ALLOWED_FIELDS.map(field => next[field] ?? '');
      const update = await env.DB.prepare(`UPDATE contacts SET ${assignments}, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?`).bind(...values, next.revision, id, current.revision).run();
      if (!update.meta?.changes) {
        const latest = await env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first();
        return cors(json({ error: 'Conflict: record changed since it was loaded.', current: latest }, 409), request);
      }
      await env.DB.prepare('INSERT INTO edit_history (contact_id, editor, action, before_json, after_json) VALUES (?, ?, ?, ?, ?)').bind(id, editor, 'update', JSON.stringify(current), JSON.stringify(next)).run();
      return cors(json(next), request);
    }
    return cors(json({ error: 'Not found.' }, 404), request);
  },

  async scheduled(event, env, ctx) {
    await createBackup(env, new Date(event.scheduledTime || Date.now()));
  }
};
