const API_BASE = '';
const DEFAULT_EXHIBITION = 'Fine Food Australia 2026';

let source = [];
let companies = [];
let editor = '';
let currentUser = null;
let apiAvailable = false;
let saving = false;

const $ = selector => document.querySelector(selector);
const key = value => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = (value = '') => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeRow(row) {
  return {
    ...row,
    sourceName: row.sourceName ?? row.source_name ?? '',
    formImage: row.formImage ?? row.form_image_key ?? '',
    cardImage: row.cardImage ?? row.card_image_key ?? '',
    reviewNote: row.reviewNote ?? row.review_note ?? '',
    goodEnough: row.goodEnough === true || row.goodEnough === 1 || row.goodEnough === '1' || row.good_enough === true || row.good_enough === 1 || row.good_enough === '1',
    qrData: typeof row.qrData === 'string' ? safeJson(row.qrData, []) : (row.qrData ?? safeJson(row.qr_data, [])),
    revision: Number(row.revision || 1)
  };
}

function groupSource(rows) {
  const map = new Map();
  for (const raw of rows) {
    const row = normalizeRow(raw);
    const company = row.company || `Unidentified contact (${row.sourceName || row.id})`;
    const groupKey = key(company) || row.id;
    if (!map.has(groupKey)) map.set(groupKey, { id: `company-${map.size + 1}`, company, interactions: [] });
    map.get(groupKey).interactions.push(row);
  }
  return [...map.values()];
}

function flatten() {
  return companies.flatMap(company => company.interactions.map(interaction => ({
    ...interaction,
    company: interaction.company || company.company
  })));
}

function apiFields(company, interaction, only) {
  const all = {
    source_name: interaction.sourceName,
    company: interaction.company || company.company,
    person: interaction.person,
    email: interaction.email,
    phone: interaction.phone,
    exhibition: interaction.exhibition,
    day: interaction.day,
    relationship: interaction.relationship,
    category: interaction.category,
    followup: interaction.followup,
    priority: interaction.priority,
    notes: interaction.notes,
    review_note: interaction.reviewNote,
    status: interaction.status || (interaction.goodEnough ? 'reviewed' : 'needs_review'),
    good_enough: Boolean(interaction.goodEnough),
    form_image_key: interaction.formImage || '',
    card_image_key: interaction.cardImage || '',
    qr_data: JSON.stringify(interaction.qrData || [])
  };
  return only ? Object.fromEntries(only.filter(field => field in all).map(field => [field, all[field]])) : all;
}

function applyRow(target, raw) {
  Object.assign(target, normalizeRow(raw));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.current = result.current;
    throw error;
  }
  return result;
}

async function loadFromDatabase(showErrors = false) {
  try {
    const session = await apiRequest('/api/auth/me');
    currentUser = session.user || null;
    editor = currentUser?.display_name || currentUser?.username || '';
    const rows = await apiRequest('/api/contacts');
    source = rows;
    companies = groupSource(rows);
    apiAvailable = true;
    render();
  } catch (error) {
    apiAvailable = false;
    currentUser = null;
    editor = '';
    render();
    if (showErrors && error.status !== 401) alert(`Could not load the online database: ${error.message}`);
    else if (error.status !== 401) console.warn('Online database is not available:', error.message);
    if (error.status === 401 && !document.querySelector('.login-form')) openLogin();
  }
}

async function saveRecord(company, interaction, changedFields) {
  const result = await apiRequest(`/api/contacts/${encodeURIComponent(interaction.id)}`, {
    method: 'PATCH',
    headers: { 'If-Match': String(interaction.revision || 1) },
    body: JSON.stringify(apiFields(company, interaction, changedFields))
  });
  applyRow(interaction, result);
  return interaction;
}

async function saveReviewStatus(company) {
  const changes = [...document.querySelectorAll('[data-review]')]
    .map(box => ({ interaction: company.interactions.find(item => item.id === box.dataset.review), checked: box.checked }))
    .filter(item => item.interaction && Boolean(item.interaction.goodEnough) !== item.checked);
  if (!changes.length) { close(); return; }
  saving = true;
  try {
    for (const change of changes) {
      change.interaction.goodEnough = change.checked;
      change.interaction.status = change.checked ? 'reviewed' : 'needs_review';
      await saveRecord(company, change.interaction, ['good_enough', 'status']);
    }
    await loadFromDatabase(true);
    close();
  } catch (error) {
    alert(error.status === 409 ? 'This record changed elsewhere. The latest version will be loaded.' : `Save failed: ${error.message}`);
    await loadFromDatabase(false);
  } finally {
    saving = false;
  }
}

function render() {
  const search = ($('#search')?.value || '').toLowerCase();
  const rows = companies.filter(company => `${company.company} ${company.interactions.map(interaction => `${interaction.person} ${interaction.notes}`).join(' ')}`.toLowerCase().includes(search));
  const all = flatten();
  const pending = all.filter(interaction => !interaction.goodEnough);
  $('#companyCount').textContent = companies.length;
  $('#interactionCount').textContent = all.length;
  $('#reviewCount').textContent = pending.length;
  $('#reviewSummary').textContent = pending.length;
  $('#editorSummary').textContent = editor || 'Not signed in';
  $('#loginBtn').textContent = editor ? 'Account' : 'Sign in';
  $('#adminLink').hidden = currentUser?.role !== 'admin';
  $('#rows').innerHTML = rows.map(company => {
    const people = [...new Set(company.interactions.map(interaction => interaction.person).filter(Boolean))].join(', ') || 'Not captured';
    const latest = [...company.interactions].reverse().find(interaction => interaction.followup)?.followup || '-';
    const needsReview = company.interactions.some(interaction => !interaction.goodEnough);
    const latestInteraction = company.interactions[company.interactions.length - 1];
    return `<tr><td><button class="company" data-company="${esc(company.id)}">${esc(company.company)}</button></td><td><span class="person">${esc(people)}</span></td><td><span class="tag">${esc(latestInteraction.priority || 'To evaluate')}</span></td><td>${esc(latest)}</td><td class="${needsReview ? 'review' : ''}">${needsReview ? 'Needs review' : 'Reviewed'}</td><td><button class="edit" data-company="${esc(company.id)}">${needsReview ? 'Review' : 'Open'} &gt;</button></td></tr>`;
  }).join('') || '<tr><td colspan="6">No matches.</td></tr>';
  document.querySelectorAll('[data-company]').forEach(button => button.onclick = () => openCompany(button.dataset.company));
  document.querySelectorAll('.edit').forEach(button => button.onclick = () => openCompany(button.dataset.company));
}

function openLogin() {
  if (editor) {
    show(`<div class="card-head"><div><p class="small">EDITOR ACCOUNT</p><h2>Signed in as ${esc(editor)}</h2></div><button class="close" data-close>&times;</button></div><p>Your edits are recorded under this editor name. Sign out before handing the device to another editor.</p><div class="bar"><button class="outline" data-close>Close</button><button class="blue" id="logoutBtn">Sign out</button></div>`);
    document.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
    $('#logoutBtn').onclick = logout;
    return;
  }
  show(`<div class="login-card"><div class="card-head"><div><p class="small">CASAJOY FIELD DESK</p><h2>Editor sign in</h2></div><button class="close" data-close>&times;</button></div><p>Use the username and password assigned to you. Your display name will be attached to every saved edit.</p><form class="login-form"><label>Username<input name="username" autocomplete="username" required autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><p class="auth-error" id="loginError" hidden></p><div class="bar"><button type="button" class="outline" data-close>Cancel</button><button type="submit" class="blue">Sign in</button></div></form></div>`);
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
  $('.login-form').onsubmit = async event => {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('button[type="submit"]');
    const errorBox = $('#loginError');
    submit.disabled = true;
    errorBox.hidden = true;
    try {
      const result = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      currentUser = result.user || null;
      editor = currentUser?.display_name || currentUser?.username || '';
      close();
      await loadFromDatabase(true);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      submit.disabled = false;
    }
  };
}

async function logout() {
  try { await apiRequest('/api/auth/logout', { method: 'POST' }); }
  catch (error) { console.warn('Sign out request failed:', error.message); }
  currentUser = null;
  editor = '';
  source = [];
  companies = [];
  close();
  render();
  openLogin();
}

function openCompany(id) {
  const company = companies.find(item => item.id === id);
  if (!company) return;
  const locked = !editor;
  const history = company.interactions.map(interaction => `<div class="interaction-row"><span>${esc(interaction.sourceName || interaction.id)}</span><span>${interaction.goodEnough ? 'Reviewed' : 'Needs review'}</span></div>`).join('');
  const images = company.interactions.map((interaction, index) => {
    const scan = (imageKey, label) => imageKey
      ? `<figure><img src="${esc(imageUrl(imageKey))}" alt="${esc(company.company)} ${esc(label)}" loading="lazy"><figcaption>${esc(label)} - ${esc(interaction.sourceName || `Interaction ${index + 1}`)}</figcaption></figure>`
      : `<div class="scan-missing"><strong>${esc(label)}</strong><span>Not available</span></div>`;
    return `<div class="scan-set"><p class="small">INTERACTION ${index + 1}</p>${scan(interaction.formImage, 'Form scan')}${scan(interaction.cardImage, 'Business card')}</div>`;
  }).join('');
  show(`<div class="card-head"><div><p class="small">COMPANY RECORD</p><h2>${esc(company.company)}</h2></div><button class="close" data-close>&times;</button></div><div class="detail-grid"><div class="images">${images}</div><div class="fields">${company.interactions.map((interaction, index) => interactionFields(interaction, index, locked)).join('')}</div></div><div class="interaction"><h3>Interaction history</h3>${history}</div><div class="bar"><button class="outline" data-close>Close</button>${locked ? '<button class="blue" id="loginFromEdit">Sign in to edit</button>' : '<button class="outline" id="editFields">Edit fields</button><button class="blue" id="saveReview">Save review status</button>'}</div>`);
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
  if (locked) $('#loginFromEdit').onclick = openLogin;
  else {
    $('#editFields').onclick = () => openEdit(company.id, company.interactions[0].id);
    $('#saveReview').onclick = () => saveReviewStatus(company);
  }
}

function interactionFields(interaction, index, locked) {
  return `<div class="interaction"><h3>Interaction ${index + 1}</h3>${field('Contact person', interaction.person)}${field('Email', interaction.email)}${field('Phone', interaction.phone)}${field('Exhibition', interaction.exhibition || DEFAULT_EXHIBITION)}${field('Day', interaction.day)}${field('Relationship', interaction.relationship)}${field('Business category', interaction.category)}${field('Follow-up', interaction.followup)}${field('Classification', interaction.priority)}${field('Notes', interaction.notes)}${field('OCR review note', interaction.reviewNote || 'Best-effort transcription; confirm against scan')}${field('Missing card status', interaction.cardImage ? 'Business card present' : 'Business card missing')}<div class="switch"><input type="checkbox" ${interaction.goodEnough ? 'checked' : ''} data-review="${esc(interaction.id)}" ${locked ? 'disabled' : ''}><span>Good enough - no further review</span></div>${locked ? '<div class="locked">Sign in through Cloudflare Access before editing.</div>' : ''}</div>`;
}

function field(label, value) {
  return `<div class="field ${value ? '' : 'missing'}"><span>${esc(label)}</span><strong>${esc(value || 'Needs your input')}</strong></div>`;
}

function selectHtml(name, value, options) {
  return `<select name="${name}">${options.map(option => `<option ${option === value ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
}

function openEdit(companyId, interactionId) {
  const company = companies.find(item => item.id === companyId);
  const interaction = company?.interactions.find(item => item.id === interactionId);
  if (!company || !interaction || !editor) return openLogin();
  show(`<div class="card-head"><div><p class="small">EDIT INTERACTION</p><h2>${esc(company.company)}</h2></div><button class="close" data-close>&times;</button></div><form class="edit-form"><div class="edit-grid"><label>Company<input name="company" value="${esc(interaction.company || company.company)}" required></label><label>Contact person<input name="person" value="${esc(interaction.person)}"></label><label>Email<input name="email" value="${esc(interaction.email)}"></label><label>Phone<input name="phone" value="${esc(interaction.phone)}"></label><label>Exhibition${selectHtml('exhibition', interaction.exhibition || DEFAULT_EXHIBITION, [DEFAULT_EXHIBITION])}</label><label>Day${selectHtml('day', interaction.day || '1', ['1', '2', '3', '4', '5', '6', '7'])}</label><label>Relationship${selectHtml('relationship', interaction.relationship || 'Potential Customer', ['Potential Customer', 'Existing Customer', 'Potential Supplier', 'Service Provider'])}</label><label>Business category${selectHtml('category', interaction.category || 'Brand Owner', ['Brand Owner', 'OEM Customer', 'Distributor', 'Trader'])}</label><label>Classification${selectHtml('priority', interaction.priority || 'To evaluate', ['Very Important', 'Important', 'Less Important', 'To evaluate'])}</label></div><label>Follow-up summary<textarea name="followup">${esc(interaction.followup)}</textarea></label><label>Notes<textarea name="notes">${esc(interaction.notes)}</textarea></label><label>OCR review note<textarea name="reviewNote">${esc(interaction.reviewNote)}</textarea></label><div class="bar"><button type="button" class="outline" data-close>Cancel</button><button class="blue">Save changes</button></div></form>`);
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
  $('.edit-form').onsubmit = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const previous = { ...interaction };
    Object.assign(interaction, values, { goodEnough: false, status: 'needs_review' });
    saving = true;
    try {
      await saveRecord(company, interaction, ['company', 'person', 'email', 'phone', 'exhibition', 'day', 'relationship', 'category', 'priority', 'followup', 'notes', 'review_note', 'good_enough', 'status']);
      await loadFromDatabase(true);
      close();
    } catch (error) {
      Object.assign(interaction, previous);
      alert(error.status === 409 ? 'This record changed elsewhere. The latest version will be loaded.' : `Save failed: ${error.message}`);
      await loadFromDatabase(false);
    } finally {
      saving = false;
    }
  };
}

function openAdd() {
  if (!editor) return openLogin();
  show(`<div class="card-head"><div><p class="small">NEW RECORD</p><h2>Add contact</h2></div><button class="close" data-close>&times;</button></div><form class="edit-form"><div class="edit-grid"><label>Company<input name="company" required></label><label>Contact person<input name="person"></label><label>Email<input name="email"></label><label>Phone<input name="phone"></label><label>Exhibition${selectHtml('exhibition', DEFAULT_EXHIBITION, [DEFAULT_EXHIBITION])}</label><label>Day${selectHtml('day', '1', ['1', '2', '3', '4', '5', '6', '7'])}</label><label>Relationship${selectHtml('relationship', 'Potential Customer', ['Potential Customer', 'Existing Customer', 'Potential Supplier', 'Service Provider'])}</label><label>Business category${selectHtml('category', 'Brand Owner', ['Brand Owner', 'OEM Customer', 'Distributor', 'Trader'])}</label><label>Classification${selectHtml('priority', 'To evaluate', ['Very Important', 'Important', 'Less Important', 'To evaluate'])}</label></div><label>Follow-up summary<textarea name="followup"></textarea></label><label>Notes<textarea name="notes"></textarea></label><label>OCR review note<textarea name="reviewNote"></textarea></label><div class="bar"><button type="button" class="outline" data-close>Cancel</button><button class="blue">Save contact</button></div></form>`);
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
  $('.edit-form').onsubmit = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    saving = true;
    try {
      await apiRequest('/api/contacts', { method: 'POST', body: JSON.stringify({ ...values, source_name: 'Manual entry', good_enough: false, status: 'needs_review', form_image_key: '', card_image_key: '', qr_data: '[]' }) });
      await loadFromDatabase(true);
      close();
    } catch (error) {
      alert(`Save failed: ${error.message}`);
    } finally {
      saving = false;
    }
  };
}

function imageUrl(imageKey) {
  return `/api/images/${encodeURIComponent(imageKey)}`;
}

function show(html) { $('#backdrop').hidden = false; $('#card').innerHTML = html; }
function close() { $('#backdrop').hidden = true; }

async function exportXlsx() {
  if (typeof JSZip === 'undefined') return alert('Excel export library is still loading. Please try again.');
  const columns = ['Company', 'Contact person', 'Email', 'Phone', 'Exhibition', 'Day', 'Relationship', 'Business category', 'Follow-up summary', 'Classification', 'Notes', 'OCR review note', 'Missing card status', 'Source scan', 'Good enough'];
  const rows = flatten();
  const cell = value => `<c t="inlineStr"><is><t>${esc(value || '')}</t></is></c>`;
  const xmlRows = [`<row>${columns.map(cell).join('')}</row>`, ...rows.map(row => `<row>${[row.company, row.person, row.email, row.phone, row.exhibition || DEFAULT_EXHIBITION, row.day, row.relationship, row.category, row.followup, row.priority, row.notes, row.reviewNote, row.cardImage ? 'Business card present' : 'Business card missing', row.sourceName, row.goodEnough ? 'Yes' : 'No'].map(cell).join('')}</row>`)].join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Contacts" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', sheet);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'casajoy-exhibition-contacts.xlsx'; link.click();
}

const imageViewer = document.createElement('div');
imageViewer.className = 'image-viewer'; imageViewer.hidden = true;
imageViewer.innerHTML = '<button class="viewer-close" aria-label="Close image">&times;</button><img alt="Expanded scan">';
document.body.appendChild(imageViewer);
const viewerImage = imageViewer.querySelector('img');
const closeViewer = () => { imageViewer.hidden = true; viewerImage.removeAttribute('src'); };
document.addEventListener('click', event => { const image = event.target.closest('.images img'); if (image) { viewerImage.src = image.src; imageViewer.hidden = false; } });
imageViewer.querySelector('.viewer-close').onclick = closeViewer;
imageViewer.onclick = event => { if (event.target === imageViewer) closeViewer(); };
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeViewer(); });

$('#loginBtn').onclick = openLogin;
$('#addBtn').onclick = openAdd;
$('#exportBtn').onclick = exportXlsx;
$('#search').oninput = render;
$('#backdrop').onclick = event => { if (event.target.id === 'backdrop') close(); };
$('#guideLink').onclick = event => {
  event.preventDefault();
  show(`<div class="card-head"><div><p class="small">CASAJOY GUIDE</p><h2>Guide book</h2></div><button class="close" data-close>&times;</button></div><p>D1 is the authoritative online database. Each edit saves one interaction with revision protection, then reloads the canonical data from the Worker.</p><p>Company names, contact details, classification, follow-up, notes and OCR review notes are editable. The source scans will be served through private storage.</p>`);
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
};

render();
loadFromDatabase();
