const $ = selector => document.querySelector(selector);
const esc = (value = '') => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return result;
}

function setError(message = '') {
  const box = $('#adminError');
  box.textContent = message;
  box.hidden = !message;
}

function renderUsers(users) {
  $('#users').innerHTML = users.map(user => `
    <tr>
      <td><strong>${esc(user.username)}</strong></td>
      <td><input form="user-${user.id}" name="display_name" value="${esc(user.display_name)}" maxlength="100" required></td>
      <td><label class="inline-check"><input form="user-${user.id}" name="active" type="checkbox" ${user.active ? 'checked' : ''}> ${user.active ? 'Active' : 'Disabled'}</label></td>
      <td>${esc(formatDate(user.last_login_at))}</td>
      <td>
        <form id="user-${user.id}" class="user-action-form" data-id="${user.id}">
          <input name="password" type="password" minlength="10" maxlength="200" autocomplete="new-password" placeholder="New password (optional)">
          <button class="blue">Save</button>
          <button type="button" class="outline revoke-btn" data-id="${user.id}">Revoke sessions</button>
        </form>
      </td>
    </tr>`).join('') || '<tr><td colspan="5">No editor accounts yet.</td></tr>';

  document.querySelectorAll('.user-action-form').forEach(form => form.onsubmit = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const activeControl = document.querySelector(`[form="${form.id}"][name="active"]`);
    const body = { display_name: values.display_name, active: Boolean(activeControl?.checked) };
    if (values.password) body.password = values.password;
    try {
      await apiRequest(`/admin/api/users/${form.dataset.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await loadAdmin();
    } catch (error) {
      setError(`Could not update account: ${error.message}`);
    }
  });

  document.querySelectorAll('.revoke-btn').forEach(button => button.onclick = async () => {
    try {
      await apiRequest(`/admin/api/users/${button.dataset.id}/revoke-sessions`, { method: 'POST' });
      setError('All active sessions for that account were revoked.');
      await loadAdmin();
    } catch (error) {
      setError(`Could not revoke sessions: ${error.message}`);
    }
  });
}

function renderAudit(rows) {
  $('#audit').innerHTML = rows.map(row => {
    let details = row.details_json || '{}';
    try { details = JSON.stringify(JSON.parse(details)); } catch { /* keep the raw audit value */ }
    return `<tr><td>${esc(formatDate(row.created_at))}</td><td>${esc(row.action)}</td><td>${esc(row.username || '-')}</td><td>${esc(row.actor || '-')}</td><td>${esc(details)}</td></tr>`;
  }).join('') || '<tr><td colspan="5">No events yet.</td></tr>';
}

async function loadAdmin() {
  try {
    const [status, users, audit] = await Promise.all([
      apiRequest('/admin/api/status'),
      apiRequest('/admin/api/users'),
      apiRequest('/admin/api/audit')
    ]);
    setError('');
    $('#adminEmail').textContent = status.admin_email;
    $('#userCount').textContent = users.length;
    $('#activeCount').textContent = users.filter(user => user.active).length;
    renderUsers(users);
    renderAudit(audit);
  } catch (error) {
    setError(error.status === 403 ? 'Administrator access required. Sign in through the Paulus Cloudflare Access account.' : `Could not load administration data: ${error.message}`);
  }
}

$('#createUserForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await apiRequest('/admin/api/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset();
    setError('Editor account created. Share the credentials securely with that editor.');
    await loadAdmin();
  } catch (error) {
    setError(`Could not create account: ${error.message}`);
  } finally {
    submit.disabled = false;
  }
};

loadAdmin();
