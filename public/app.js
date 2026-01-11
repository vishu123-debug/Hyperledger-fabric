'use strict';

const API = '/api';

const statusText = document.getElementById('statusText');
const statusWrap = document.getElementById('statusWrap');
const refreshBtn = document.getElementById('refreshBtn');
const roleToggleBtn = document.getElementById('roleToggleBtn');

const tendersBody = document.getElementById('tendersBody');
const search = document.getElementById('search');

const createForm = document.getElementById('createForm');
const publishForm = document.getElementById('publishForm');
const awardForm = document.getElementById('awardForm');
const cancelForm = document.getElementById('cancelForm');

const detailsBox = document.getElementById('detailsBox');
const auditList = document.getElementById('auditList');
const authorityPill = document.getElementById('authorityPill');
const modePill = document.getElementById('modePill');

const whatsNewList = document.getElementById('whatsNewList');
const ticker = document.getElementById('ticker');
const tickerToggleBtn = document.getElementById('tickerToggleBtn');

const lastUpdated = document.getElementById('lastUpdated');

let tendersCache = [];
let selectedTenderId = null;

// authority | auditor
let mode = 'authority';
let tickerPaused = false;

if (lastUpdated) {
  const d = new Date();
  lastUpdated.textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function setStatus(msg, kind = 'neutral') {
  statusText.textContent = msg;

  statusWrap.classList.remove('alert-error', 'alert-ok');
  if (kind === 'error') statusWrap.classList.add('alert-error');
  if (kind === 'ok') statusWrap.classList.add('alert-ok');
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function withMode(urlPath) {
  const sep = urlPath.includes('?') ? '&' : '?';
  return `${urlPath}${sep}mode=${encodeURIComponent(mode)}`;
}

async function apiJson(urlPath, opts) {
  const res = await fetch(withMode(urlPath), opts);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

function normalizeTenders(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(t => ({
    ...t,
    tenderId: String(t.tenderId ?? ''),
    department: String(t.department ?? ''),
    status: String(t.status ?? ''),
    estimatedValue: t.estimatedValue ?? '',
    updatedAt: String(t.updatedAt ?? ''),
  }));
}

function sortByUpdatedDesc(list) {
  return [...list].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/* ---------- Inline form validation (local + readable) ---------- */

function clearFormErrors(formEl) {
  formEl.querySelectorAll('.form-error').forEach(n => n.remove());
  formEl.querySelectorAll('.is-invalid').forEach(n => n.classList.remove('is-invalid'));
}

function showFormError(formEl, msg, inputEls = []) {
  const box = document.createElement('div');
  box.className = 'form-error';
  box.setAttribute('role', 'alert');
  box.textContent = msg;
  formEl.prepend(box);

  inputEls.filter(Boolean).forEach(el => el.classList.add('is-invalid'));

  // Make it obvious where the problem is.
  formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const first = inputEls.find(Boolean);
  if (first) first.focus({ preventScroll: true });

  // Keep the evaluator banner as a summary, but don’t rely on it.
  setStatus(`Error: ${msg}`, 'error');
}

function buildWhatsNew(list) {
  const sorted = sortByUpdatedDesc(list).slice(0, 6);

  if (sorted.length === 0) {
    whatsNewList.innerHTML = `<li><span>Info:</span>No tenders found yet.</li>`;
    return;
  }

  const items = sorted.map(t => {
    const label = `${t.status || 'UPDATED'}`;
    const money = Number(t.estimatedValue).toLocaleString('en-IN');
    const txt = `${t.tenderId} • ${t.department} • ₹${money}`;
    return `<li><span>${escapeHtml(label)}:</span>${escapeHtml(txt)}</li>`;
  }).join('');

  whatsNewList.innerHTML = items + items;
}

async function loadInfo() {
  const data = await apiJson(`${API}/info`);
  authorityPill.textContent = `Authority: ${data.authorityMode}`;
  modePill.textContent = `Mode: ${data.mode}`;

  roleToggleBtn.textContent = (mode === 'authority')
    ? 'Switch to Auditor Mode'
    : 'Switch to Authority Mode';
}

async function loadTenders() {
  setStatus('Loading tenders...');
  const data = await apiJson(`${API}/tenders`);
  tendersCache = normalizeTenders(data);
  renderTenders(filterTenders(search.value));
  buildWhatsNew(tendersCache);
  setStatus('Ready.', 'ok');
}

function filterTenders(q) {
  const s = q.trim().toLowerCase();
  if (!s) return tendersCache;
  return tendersCache.filter(t => {
    const id = t.tenderId.toLowerCase();
    const dep = t.department.toLowerCase();
    return id.includes(s) || dep.includes(s);
  });
}

function renderTenders(list) {
  if (!Array.isArray(list) || list.length === 0) {
    tendersBody.innerHTML = `<tr><td colspan="5" class="muted">No tenders found.</td></tr>`;
    return;
  }

  tendersBody.innerHTML = list.map(t => {
    const id = escapeHtml(t.tenderId);
    const dep = escapeHtml(t.department);
    const val = escapeHtml(Number(t.estimatedValue).toLocaleString('en-IN'));
    const st = escapeHtml(t.status);

    return `
      <tr>
        <td><strong>${id}</strong></td>
        <td>${dep}</td>
        <td>₹${val}</td>
        <td>${st}</td>
        <td><button class="btn btn-secondary" data-action="view" data-id="${id}">View</button></td>
      </tr>
    `;
  }).join('');
}

async function viewTender(tenderId) {
  selectedTenderId = tenderId;

  setStatus(`Loading ${tenderId}...`);
  const t = await apiJson(`${API}/tenders/${encodeURIComponent(tenderId)}`);
  renderDetails(t);

  const audits = await apiJson(`${API}/tenders/${encodeURIComponent(tenderId)}/audit`);
  renderAudit(audits);

  // Pre-fill forms
  document.getElementById('publishId').value = tenderId;
  document.getElementById('awardId').value = tenderId;
  document.getElementById('cancelId').value = tenderId;

  setStatus('Ready.', 'ok');
}

function renderDetails(t) {
  detailsBox.classList.remove('muted');

  const money = Number(t.estimatedValue).toLocaleString('en-IN');
  const created = t.createdAt ? new Date(t.createdAt).toLocaleString() : '';
  const updated = t.updatedAt ? new Date(t.updatedAt).toLocaleString() : '';

  detailsBox.innerHTML = `
    <div><strong>ID:</strong> ${escapeHtml(t.tenderId)}</div>
    <div><strong>Title:</strong> ${escapeHtml(t.title)}</div>
    <div><strong>Department:</strong> ${escapeHtml(t.department)}</div>
    <div><strong>Estimated Value:</strong> ₹${escapeHtml(money)}</div>
    <div><strong>Status:</strong> ${escapeHtml(t.status)}</div>
    <div class="meta">
      <div><strong>Created:</strong> ${escapeHtml(created)} (Org: ${escapeHtml(t.createdByOrg)})</div>
      <div><strong>Updated:</strong> ${escapeHtml(updated)}</div>
    </div>
  `;
}

function renderAudit(audits) {
  if (!Array.isArray(audits) || audits.length === 0) {
    auditList.innerHTML = `<li class="muted">No audit entries found.</li>`;
    return;
  }

  auditList.innerHTML = audits.map((a, idx) => {
    const action = escapeHtml(a.action);
    const ts = escapeHtml(a.timestamp ? new Date(a.timestamp).toLocaleString() : '');
    const txId = escapeHtml(a.txId);
    const msp = escapeHtml(a.actor?.mspId || '');
    const actor = escapeHtml(a.actor?.clientId || '');

    const detailsObj = a.details ?? {};
    const detailsPretty = escapeHtml(JSON.stringify(detailsObj, null, 2)).trim();

    const snap = a.details?.tenderSnapshot || {};
    const summary = [];

    if (snap.title) summary.push(`<div class="meta"><strong>Title:</strong> ${escapeHtml(snap.title)}</div>`);
    if (snap.department) summary.push(`<div class="meta"><strong>Department:</strong> ${escapeHtml(snap.department)}</div>`);
    if (snap.estimatedValue !== undefined && snap.estimatedValue !== null && snap.estimatedValue !== '') {
      summary.push(
        `<div class="meta"><strong>Estimated Value:</strong> ₹${escapeHtml(Number(snap.estimatedValue).toLocaleString('en-IN'))}</div>`
      );
    }
    if (snap.status) summary.push(`<div class="meta"><strong>Status:</strong> ${escapeHtml(snap.status)}</div>`);

    const summaryHtml = summary.length ? `<div class="audit-summary">${summary.join('')}</div>` : '';

    const rawId = `audit-raw-${idx}`;

    return `
      <li>
        <div><strong>${action}</strong> at <strong>${ts}</strong></div>
        <div class="meta"><strong>Authority (MSP):</strong> ${msp}</div>
        <div class="meta"><strong>Actor (Client ID):</strong> ${actor}</div>
        <div class="meta"><strong>TxID:</strong> ${txId}</div>

        ${summaryHtml}

        <button type="button"
                class="btn btn-secondary btn-sm audit-toggle"
                data-target="${rawId}"
                aria-expanded="false">
          Show raw JSON
        </button>

        <pre id="${rawId}" class="audit-details" hidden>${detailsPretty}</pre>
      </li>
    `;
  }).join('');
}

/* Toggle for dynamically-rendered audit items */
auditList.addEventListener('click', (e) => {
  const btn = e.target.closest('.audit-toggle');
  if (!btn) return;

  const id = btn.getAttribute('data-target');
  const pre = document.getElementById(id);
  if (!pre) return;

  const isHidden = pre.hasAttribute('hidden');
  if (isHidden) {
    pre.removeAttribute('hidden');
    btn.textContent = 'Hide raw JSON';
    btn.setAttribute('aria-expanded', 'true');
  } else {
    pre.setAttribute('hidden', '');
    btn.textContent = 'Show raw JSON';
    btn.setAttribute('aria-expanded', 'false');
  }
});

tendersBody.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.getAttribute('data-action') !== 'view') return;

  const id = btn.getAttribute('data-id');
  if (!id) return;

  viewTender(id).catch(err => setStatus('Error: ' + err.message, 'error'));
});

refreshBtn.addEventListener('click', () => {
  (async () => {
    try {
      await loadInfo();
      await loadTenders();
      if (selectedTenderId) await viewTender(selectedTenderId);
    } catch (err) {
      setStatus('Error: ' + err.message, 'error');
    }
  })();
});

search.addEventListener('input', () => renderTenders(filterTenders(search.value)));

roleToggleBtn.addEventListener('click', () => {
  mode = (mode === 'authority') ? 'auditor' : 'authority';

  (async () => {
    try {
      await loadInfo();
      await loadTenders();
      if (selectedTenderId) await viewTender(selectedTenderId);

      if (mode === 'auditor') {
        setStatus('Auditor Mode enabled. Try write actions to see access denied (expected).', 'ok');
      } else {
        setStatus('Authority Mode enabled. You can create, publish, award, and cancel.', 'ok');
      }
    } catch (err) {
      setStatus('Error: ' + err.message, 'error');
    }
  })();
});

tickerToggleBtn?.addEventListener('click', () => {
  tickerPaused = !tickerPaused;
  ticker.classList.toggle('paused', tickerPaused);
  tickerToggleBtn.textContent = tickerPaused ? 'Resume' : 'Pause';
});

/* ---------- Form handlers (with local validation + inline errors) ---------- */

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFormErrors(createForm);

  const fd = new FormData(createForm);

  const tenderIdEl = createForm.querySelector('[name="tenderId"]');
  const titleEl = createForm.querySelector('[name="title"]');
  const deptEl = createForm.querySelector('[name="department"]');
  const valEl = createForm.querySelector('[name="estimatedValue"]');

  const tenderId = String(fd.get('tenderId') || '').trim();
  const title = String(fd.get('title') || '').trim();
  const department = String(fd.get('department') || '').trim();
  const estimatedValueRaw = String(fd.get('estimatedValue') || '').trim();

  if (!tenderId) return showFormError(createForm, 'Tender ID is required.', [tenderIdEl]);
  if (!title) return showFormError(createForm, 'Title is required.', [titleEl]);
  if (!department) return showFormError(createForm, 'Department is required.', [deptEl]);
  if (!estimatedValueRaw || Number.isNaN(Number(estimatedValueRaw))) {
    return showFormError(createForm, 'Estimated Value must be a number.', [valEl]);
  }

  const payload = {
    tenderId,
    title,
    department,
    estimatedValue: Number(estimatedValueRaw),
  };

  try {
    setStatus('Saving draft...');
    await apiJson(`${API}/tenders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    createForm.reset();
    await loadTenders();
    setStatus('Draft saved to ledger.', 'ok');
  } catch (err) {
    showFormError(createForm, err.message || 'Request failed.');
  }
});

publishForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFormErrors(publishForm);

  const idEl = publishForm.querySelector('[name="publishId"]');
  const id = String(new FormData(publishForm).get('publishId') || '').trim();
  if (!id) return showFormError(publishForm, 'Tender ID is required.', [idEl]);

  try {
    setStatus('Publishing tender...');
    await apiJson(`${API}/tenders/${encodeURIComponent(id)}/publish`, { method: 'POST' });
    await loadTenders();
    await viewTender(id);
    setStatus('Tender published.', 'ok');
  } catch (err) {
    showFormError(publishForm, err.message || 'Request failed.');
  }
});

awardForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFormErrors(awardForm);

  const fd = new FormData(awardForm);

  const idEl = awardForm.querySelector('[name="awardId"]');
  const orgEl = awardForm.querySelector('[name="awardedToOrg"]');

  const id = String(fd.get('awardId') || '').trim();
  const awardedToOrg = String(fd.get('awardedToOrg') || '').trim();
  const remarks = String(fd.get('remarks') || '').trim();

  if (!id) return showFormError(awardForm, 'Tender ID is required.', [idEl]);
  if (!awardedToOrg) return showFormError(awardForm, 'Awarded To (Vendor/Org) is required.', [orgEl]);

  try {
    setStatus('Awarding tender...');
    await apiJson(`${API}/tenders/${encodeURIComponent(id)}/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ awardedToOrg, remarks }),
    });
    await loadTenders();
    await viewTender(id);
    setStatus('Tender awarded.', 'ok');
  } catch (err) {
    showFormError(awardForm, err.message || 'Request failed.');
  }
});

cancelForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFormErrors(cancelForm);

  const fd = new FormData(cancelForm);

  const idEl = cancelForm.querySelector('[name="cancelId"]');
  const reasonEl = cancelForm.querySelector('[name="reason"]');

  const id = String(fd.get('cancelId') || '').trim();
  const reason = String(fd.get('reason') || '').trim();

  if (!id) return showFormError(cancelForm, 'Tender ID is required.', [idEl]);
  if (!reason) return showFormError(cancelForm, 'Cancel reason is required.', [reasonEl]);

  try {
    setStatus('Cancelling tender...');
    await apiJson(`${API}/tenders/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    await loadTenders();
    await viewTender(id);
    setStatus('Tender cancelled.', 'ok');
  } catch (err) {
    showFormError(cancelForm, err.message || 'Request failed.');
  }
});

// Boot
(async function init() {
  try {
    await loadInfo();
    await loadTenders();
    setStatus('Ready. Create a tender, then View it to inspect the audit trail.', 'ok');
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
  }
})();
