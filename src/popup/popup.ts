import type { Application, ApplicationStatus, Message } from '../shared/types';
import type { SubscriptionState } from '../shared/subscription';
import type { GmailStatus } from '../background/gmail';
import { STATUS_LABELS, STATUS_ORDER } from '../shared/constants';
import { DEFAULT_SUBSCRIPTION, isFeatureUnlocked } from '../shared/subscription';
import { computeAnalytics } from './analytics';
import { exportToCSV } from './csv-export';

// ── State ────────────────────────────────────────────

let applications: Application[] = [];
let activeFilter: ApplicationStatus | 'all' = 'all';
let searchQuery = '';
let editingId: string | null = null;
let activeView: 'list' | 'stats' = 'list';
let subscription: SubscriptionState = { ...DEFAULT_SUBSCRIPTION };

// ── DOM refs ─────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const appList = $<HTMLUListElement>('appList');
const appCount = $<HTMLSpanElement>('appCount');
const emptyState = $<HTMLDivElement>('emptyState');
const searchInput = $<HTMLInputElement>('searchInput');
const addToggle = $<HTMLButtonElement>('addToggle');
const addForm = $<HTMLFormElement>('addForm');
const cancelAdd = $<HTMLButtonElement>('cancelAdd');
const statusFilters = $<HTMLDivElement>('statusFilters');
const viewTabs = $<HTMLDivElement>('viewTabs');

// Pro elements
const proBadge = $<HTMLSpanElement>('proBadge');
const exportBtn = $<HTMLButtonElement>('exportBtn');
const settingsBtn = $<HTMLButtonElement>('settingsBtn');
const settingsOverlay = $<HTMLDivElement>('settingsOverlay');
const settingsClose = $<HTMLButtonElement>('settingsClose');
const upgradeBanner = $<HTMLDivElement>('upgradeBanner');
const upgradeBannerBtn = $<HTMLButtonElement>('upgradeBannerBtn');

// Analytics
const listContainer = $<HTMLDivElement>('listContainer');
const analyticsContainer = $<HTMLDivElement>('analyticsContainer');
const analyticsUpgrade = $<HTMLDivElement>('analyticsUpgrade');
const analyticsUpgradeBtn = $<HTMLButtonElement>('analyticsUpgradeBtn');
const analyticsContent = $<HTMLDivElement>('analyticsContent');

// Universal detector toggle
const universalToggle = $<HTMLDivElement>('universalToggle');
const universalDesc = $<HTMLParagraphElement>('universalDesc');

// Gmail settings
const gmailDot = $<HTMLSpanElement>('gmailDot');
const gmailStatusText = $<HTMLSpanElement>('gmailStatusText');
const gmailConnectBtn = $<HTMLButtonElement>('gmailConnectBtn');
const gmailDisconnectBtn = $<HTMLButtonElement>('gmailDisconnectBtn');
const gmailCheckNowBtn = $<HTMLButtonElement>('gmailCheckNowBtn');
const gmailLastCheck = $<HTMLParagraphElement>('gmailLastCheck');
const subscriptionInfo = $<HTMLDivElement>('subscriptionInfo');
const upgradeBtn = $<HTMLButtonElement>('upgradeBtn');

// Form inputs
const inputCompany = $<HTMLInputElement>('inputCompany');
const inputRole = $<HTMLInputElement>('inputRole');
const inputUrl = $<HTMLInputElement>('inputUrl');
const inputDate = $<HTMLInputElement>('inputDate');
const inputNotes = $<HTMLInputElement>('inputNotes');

// ── Messaging ────────────────────────────────────────

function send(message: Message): Promise<unknown> {
  return chrome.runtime.sendMessage(message).catch(() => {
    // Service worker may have been idle — retry once to wake it
    return chrome.runtime.sendMessage(message);
  });
}

// ── DOM helpers ──────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'className') {
        element.className = val;
      } else if (key.startsWith('data-')) {
        element.dataset[key.slice(5)] = val;
      } else {
        element.setAttribute(key, val);
      }
    }
  }
  for (const child of children) {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  }
  return element;
}

function svgIcon(pathD: string, size = 14): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  // Support multiple path commands separated by |
  for (const d of pathD.split('|')) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d.trim());
    svg.appendChild(path);
  }
  return svg;
}

// ── Render ───────────────────────────────────────────

function getFilteredApps(): Application[] {
  let filtered = applications;

  if (activeFilter !== 'all') {
    filtered = filtered.filter(a => a.status === activeFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(a =>
      a.company.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q)
    );
  }

  return filtered;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDaysSinceApplied(dateStr: string): number {
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function buildEditForm(app: Application): HTMLFormElement {
  const form = el('form', { className: 'edit-form' }) as HTMLFormElement;

  const row1 = el('div', { className: 'form-row' });
  const companyInput = el('input', { type: 'text', value: app.company, placeholder: 'Company *', required: '' }) as HTMLInputElement;
  companyInput.name = 'company';
  companyInput.value = app.company;
  const roleInput = el('input', { type: 'text', value: app.role, placeholder: 'Role *', required: '' }) as HTMLInputElement;
  roleInput.name = 'role';
  roleInput.value = app.role;
  row1.append(companyInput, roleInput);

  const row2 = el('div', { className: 'form-row' });
  const urlInput = el('input', { type: 'url', placeholder: 'Job posting URL (optional)' }) as HTMLInputElement;
  urlInput.name = 'sourceUrl';
  urlInput.value = app.sourceUrl;
  const dateInput = el('input', { type: 'date' }) as HTMLInputElement;
  dateInput.name = 'dateApplied';
  dateInput.value = app.dateApplied;
  row2.append(urlInput, dateInput);

  const row3 = el('div', { className: 'form-row' });
  const notesInput = el('input', { type: 'text', placeholder: 'Notes (optional)' }) as HTMLInputElement;
  notesInput.name = 'notes';
  notesInput.value = app.notes;
  row3.append(notesInput);

  const actions = el('div', { className: 'form-actions' });
  const cancelBtn = el('button', { type: 'button', className: 'btn btn-ghost' }, 'Cancel');
  const saveBtn = el('button', { type: 'submit', className: 'btn btn-primary' }, 'Save');
  actions.append(cancelBtn, saveBtn);

  form.append(row1, row2, row3, actions);

  cancelBtn.addEventListener('click', () => {
    editingId = null;
    renderList();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const company = companyInput.value.trim();
    const role = roleInput.value.trim();
    if (!company || !role) return;

    await send({
      type: 'UPDATE_APPLICATION',
      payload: {
        id: app.id,
        company,
        role,
        sourceUrl: urlInput.value.trim(),
        dateApplied: dateInput.value || app.dateApplied,
        notes: notesInput.value.trim(),
      },
    });

    // Update local state
    const idx = applications.findIndex(a => a.id === app.id);
    if (idx !== -1) {
      applications[idx] = {
        ...applications[idx],
        company,
        role,
        sourceUrl: urlInput.value.trim(),
        dateApplied: dateInput.value || app.dateApplied,
        notes: notesInput.value.trim(),
      };
    }

    editingId = null;
    renderList();
  });

  // Auto-focus company field after DOM insertion
  requestAnimationFrame(() => companyInput.select());

  return form;
}

function buildAppItem(app: Application): HTMLLIElement {
  const isEditing = editingId === app.id;
  const days = getDaysSinceApplied(app.dateApplied);
  const showFollowUp = app.status === 'applied' && days >= 7;

  // Status dot
  const dot = el('div', { className: 'status-dot', 'data-status': app.status });

  // Info section (display mode)
  const company = el('div', { className: 'app-company' }, app.company);
  const role = el('div', { className: 'app-role' }, app.role);

  const metaChildren: (HTMLElement | string)[] = [
    el('span', { className: 'app-date' }, formatDate(app.dateApplied)),
  ];

  if (app.sourcePlatform && app.sourcePlatform !== 'manual') {
    metaChildren.push(el('span', { className: 'app-source' }, app.sourcePlatform));
  }

  if (showFollowUp) {
    metaChildren.push(el('span', { className: 'app-followup' }, 'Follow up?'));
  }

  // Salary display (gated)
  if (app.salary) {
    if (isFeatureUnlocked(subscription, 'salary_detection')) {
      metaChildren.push(el('span', { className: 'app-salary' }, app.salary));
    } else {
      const locked = el('span', { className: 'app-salary-locked' }, 'Salary (Pro)');
      locked.addEventListener('click', (e) => {
        e.stopPropagation();
        send({ type: 'OPEN_PAYMENT_PAGE' });
      });
      metaChildren.push(locked);
    }
  }

  if (app.notes) {
    metaChildren.push(el('span', { className: 'app-note-preview' }, app.notes));
  }

  const meta = el('div', { className: 'app-meta' }, ...metaChildren);
  const info = el('div', { className: 'app-info' }, company, role, meta);

  // Make info clickable to edit
  info.style.cursor = 'pointer';
  info.addEventListener('click', (e) => {
    e.stopPropagation();
    editingId = editingId === app.id ? null : app.id;
    renderList();
  });

  // Status select
  const select = el('select', { className: 'app-status-select', 'data-id': app.id });
  for (const s of STATUS_ORDER) {
    const option = el('option', { value: s }, STATUS_LABELS[s]);
    if (s === app.status) option.selected = true;
    select.appendChild(option);
  }

  // Delete button
  const deleteBtn = el('button', { className: 'app-delete', 'data-id': app.id, title: 'Delete' });
  deleteBtn.appendChild(svgIcon('M18 6L6 18|M6 6L18 18'));

  const actions = el('div', { className: 'app-actions' }, select, deleteBtn);

  const li = el('li', {
    className: `app-item${isEditing ? ' app-item--editing' : ''}`,
    'data-id': app.id,
  });

  // Top row: always visible
  const topRow = el('div', { className: 'app-item-row' }, dot, info, actions);
  li.appendChild(topRow);

  // Edit form: shown when editing
  if (isEditing) {
    li.appendChild(buildEditForm(app));
  }

  return li;
}

function getFollowUpCount(): number {
  return applications.filter(a => a.status === 'applied' && getDaysSinceApplied(a.dateApplied) >= 7).length;
}

function renderList() {
  const filtered = getFilteredApps();

  // Update count with follow-up info
  const followUpCount = getFollowUpCount();
  appCount.textContent = followUpCount > 0
    ? `${applications.length} tracked \u00b7 ${followUpCount} need follow-up`
    : `${applications.length} tracked`;

  // Clear the list
  appList.replaceChildren();

  // Show/hide empty state
  if (applications.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  if (filtered.length === 0) {
    const noResults = el('li', {}, 'No matching applications');
    noResults.style.padding = '32px 16px';
    noResults.style.textAlign = 'center';
    noResults.style.color = 'var(--text-dim)';
    noResults.style.fontSize = '12px';
    appList.appendChild(noResults);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const app of filtered) {
    fragment.appendChild(buildAppItem(app));
  }
  appList.appendChild(fragment);
}

// ── Analytics rendering ─────────────────────────────

function renderAnalytics() {
  const data = computeAnalytics(applications);
  analyticsContent.replaceChildren();

  // Velocity card
  const velocityCard = el('div', { className: 'stat-card' });
  const velocityHeader = el('div', { className: 'stat-card-header' });
  velocityHeader.appendChild(el('span', { className: 'stat-card-title' }, 'Application Velocity'));
  velocityHeader.appendChild(el('span', { className: 'stat-card-value' }, `${data.thisWeek}/wk`));
  velocityCard.appendChild(velocityHeader);

  // Trend
  if (data.lastWeek > 0 || data.thisWeek > 0) {
    const trendClass = data.velocityTrend >= 0 ? 'stat-trend-up' : 'stat-trend-down';
    const arrow = data.velocityTrend >= 0 ? '\u2191' : '\u2193';
    velocityCard.appendChild(el('div', { className: `stat-card-sub ${trendClass}` },
      `${arrow} ${Math.abs(data.velocityTrend)}% vs last week`));
  }

  // Bar chart
  const maxCount = Math.max(...data.weeklyVelocity.map(w => w.count), 1);
  const barChart = el('div', { className: 'bar-chart' });
  for (const week of data.weeklyVelocity) {
    const col = el('div', { className: 'bar-chart-col' });
    const bar = el('div', { className: 'bar-chart-bar' });
    bar.style.height = `${Math.max((week.count / maxCount) * 100, 5)}%`;
    col.appendChild(bar);
    col.appendChild(el('span', { className: 'bar-chart-label' }, week.weekLabel));
    barChart.appendChild(col);
  }
  velocityCard.appendChild(barChart);
  analyticsContent.appendChild(velocityCard);

  // Response rate card
  const responseCard = el('div', { className: 'stat-card' });
  const respHeader = el('div', { className: 'stat-card-header' });
  respHeader.appendChild(el('span', { className: 'stat-card-title' }, 'Response Rate'));
  respHeader.appendChild(el('span', { className: 'stat-card-value' }, `${data.responseRate}%`));
  responseCard.appendChild(respHeader);
  responseCard.appendChild(el('div', { className: 'stat-card-sub' },
    `${data.responseRate}% got a response`));
  const progressBar = el('div', { className: 'progress-bar' });
  const progressFill = el('div', { className: 'progress-bar-fill blue' });
  progressFill.style.width = `${data.responseRate}%`;
  progressBar.appendChild(progressFill);
  responseCard.appendChild(progressBar);
  analyticsContent.appendChild(responseCard);

  // Source effectiveness card
  if (data.platformBreakdown.length > 0) {
    const sourceCard = el('div', { className: 'stat-card' });
    sourceCard.appendChild(el('div', { className: 'stat-card-title' }, 'Source Effectiveness'));
    for (const plat of data.platformBreakdown) {
      const row = el('div', { className: 'platform-row' });
      row.appendChild(el('span', { className: 'platform-name' }, plat.platform));
      row.appendChild(el('span', { className: 'platform-count' }, `${plat.count} apps`));
      row.appendChild(el('span', { className: 'platform-rate' }, `${plat.responseRate}% resp`));
      sourceCard.appendChild(row);
    }
    analyticsContent.appendChild(sourceCard);
  }

  // Avg days to response
  if (data.avgDaysToResponse !== null) {
    const avgCard = el('div', { className: 'stat-card' });
    const avgHeader = el('div', { className: 'stat-card-header' });
    avgHeader.appendChild(el('span', { className: 'stat-card-title' }, 'Avg. Days to Response'));
    avgHeader.appendChild(el('span', { className: 'stat-card-value' }, String(data.avgDaysToResponse)));
    avgCard.appendChild(avgHeader);
    analyticsContent.appendChild(avgCard);
  }
}

// ── View switching ──────────────────────────────────

function switchView(view: 'list' | 'stats') {
  activeView = view;

  // Update tab buttons
  viewTabs.querySelectorAll('.view-tab').forEach(tab => {
    tab.classList.toggle('active', (tab as HTMLElement).dataset.view === view);
  });

  if (view === 'list') {
    listContainer.classList.remove('hidden');
    analyticsContainer.classList.add('hidden');
    document.querySelector('.add-section')?.classList.remove('hidden');
  } else {
    listContainer.classList.add('hidden');
    analyticsContainer.classList.remove('hidden');
    document.querySelector('.add-section')?.classList.add('hidden');

    if (isFeatureUnlocked(subscription, 'analytics')) {
      analyticsUpgrade.classList.add('hidden');
      analyticsContent.classList.remove('hidden');
      renderAnalytics();
    } else {
      analyticsUpgrade.classList.remove('hidden');
      analyticsContent.classList.add('hidden');
    }
  }
}

// ── Subscription UI ─────────────────────────────────

function updateProUI() {
  const isPro = subscription.isPro;

  // Pro badge
  proBadge.classList.toggle('hidden', !isPro);

  // Export button
  if (isPro) {
    exportBtn.classList.remove('disabled');
    exportBtn.title = 'Export CSV';
  } else {
    exportBtn.classList.add('disabled');
    exportBtn.title = 'Export CSV (Pro)';
  }

  // Upgrade banner
  upgradeBanner.classList.toggle('hidden', isPro);

  // Settings subscription info — use safe DOM methods
  subscriptionInfo.replaceChildren();
  const desc = el('p', { className: 'settings-desc' },
    isPro ? 'Logged Pro — All features unlocked.' : 'Free tier — unlimited tracking, all detectors.');
  subscriptionInfo.appendChild(desc);

  upgradeBtn.classList.toggle('hidden', isPro);
}

// ── Gmail settings UI ───────────────────────────────

async function updateGmailUI() {
  const status = await send({ type: 'GET_GMAIL_STATUS' }) as GmailStatus;
  const isPro = subscription.isPro;

  if (status.connected && isPro) {
    gmailDot.className = 'gmail-dot connected';
    gmailStatusText.textContent = 'Connected';
    gmailConnectBtn.classList.add('hidden');
    gmailDisconnectBtn.classList.remove('hidden');
    gmailCheckNowBtn.classList.remove('hidden');

    if (status.lastCheck) {
      const d = new Date(status.lastCheck);
      gmailLastCheck.textContent = `Last checked: ${d.toLocaleString()}`;
      gmailLastCheck.classList.remove('hidden');
    }
  } else {
    gmailDot.className = 'gmail-dot disconnected';
    gmailStatusText.textContent = isPro ? 'Not connected' : 'Pro feature';
    gmailConnectBtn.classList.toggle('hidden', !isPro);
    gmailDisconnectBtn.classList.add('hidden');
    gmailCheckNowBtn.classList.add('hidden');
    gmailLastCheck.classList.add('hidden');
  }
}

// ── Event handlers ───────────────────────────────────

// Search
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  renderList();
});

// Status filters
statusFilters.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.filter-btn') as HTMLButtonElement | null;
  if (!btn) return;

  statusFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = (btn.dataset.status as ApplicationStatus | 'all') ?? 'all';
  renderList();
});

// View tabs
viewTabs.addEventListener('click', (e) => {
  const tab = (e.target as HTMLElement).closest('.view-tab') as HTMLButtonElement | null;
  if (!tab) return;
  switchView(tab.dataset.view as 'list' | 'stats');
});

// Toggle add form
addToggle.addEventListener('click', () => {
  addToggle.classList.add('hidden');
  addForm.classList.remove('hidden');
  inputCompany.focus();
  inputDate.value = new Date().toISOString().split('T')[0];
});

cancelAdd.addEventListener('click', () => {
  addForm.classList.add('hidden');
  addToggle.classList.remove('hidden');
  addForm.reset();
});

// Submit new application
addForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const company = inputCompany.value.trim();
  const role = inputRole.value.trim();
  if (!company || !role) return;

  const app = await send({
    type: 'ADD_APPLICATION',
    payload: {
      company,
      role,
      status: 'applied',
      dateApplied: inputDate.value || new Date().toISOString().split('T')[0],
      sourceUrl: inputUrl.value.trim(),
      sourcePlatform: 'manual',
      notes: inputNotes.value.trim(),
      detectedBy: 'manual',
    },
  }) as Application;

  applications.unshift(app);
  renderList();

  // Reset form
  addForm.reset();
  addForm.classList.add('hidden');
  addToggle.classList.remove('hidden');
});

// Status change (delegated)
appList.addEventListener('change', async (e) => {
  const select = e.target as HTMLSelectElement;
  if (!select.classList.contains('app-status-select')) return;

  const id = select.dataset.id!;
  const newStatus = select.value as ApplicationStatus;

  await send({
    type: 'UPDATE_APPLICATION',
    payload: { id, status: newStatus },
  });

  const app = applications.find(a => a.id === id);
  if (app) app.status = newStatus;
  renderList();
});

// Delete (delegated)
appList.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest('.app-delete') as HTMLButtonElement | null;
  if (!btn) return;

  const id = btn.dataset.id!;
  await send({ type: 'DELETE_APPLICATION', payload: { id } });

  applications = applications.filter(a => a.id !== id);
  renderList();
});

// Export CSV
exportBtn.addEventListener('click', () => {
  if (!isFeatureUnlocked(subscription, 'csv_export')) {
    send({ type: 'OPEN_PAYMENT_PAGE' });
    return;
  }
  exportToCSV(applications);
});

// Settings
settingsBtn.addEventListener('click', async () => {
  settingsOverlay.classList.remove('hidden');
  // Initialize universal detector toggle
  const uniStatus = await send({ type: 'GET_UNIVERSAL_DETECTOR_STATUS' }) as { enabled: boolean };
  universalToggle.classList.toggle('active', uniStatus.enabled);
  universalDesc.textContent = uniStatus.enabled
    ? 'Active — detecting applications on all websites.'
    : 'Catches applications on company career pages powered by other ATS systems.';
  updateGmailUI();
});

settingsClose.addEventListener('click', () => {
  settingsOverlay.classList.add('hidden');
});

// Universal detector toggle
universalToggle.addEventListener('click', async () => {
  const isActive = universalToggle.classList.contains('active');
  if (isActive) {
    await send({ type: 'DISABLE_UNIVERSAL_DETECTOR' });
    universalToggle.classList.remove('active');
    universalDesc.textContent = 'Catches applications on company career pages powered by other ATS systems.';
  } else {
    // Must request permission from a user gesture context (popup counts)
    const granted = await chrome.permissions.request({
      origins: ['https://*/*', 'http://*/*'],
    });
    if (granted) {
      await send({ type: 'ENABLE_UNIVERSAL_DETECTOR' });
      universalToggle.classList.add('active');
      universalDesc.textContent = 'Active — detecting applications on all websites.';
    }
  }
});

// Gmail actions
gmailConnectBtn.addEventListener('click', async () => {
  gmailConnectBtn.textContent = 'Connecting...';
  const result = await send({ type: 'CONNECT_GMAIL' }) as GmailStatus;
  if (result.connected) {
    await updateGmailUI();
  } else {
    gmailStatusText.textContent = result.error || 'Connection failed';
    gmailConnectBtn.textContent = 'Connect Gmail';
  }
});

gmailDisconnectBtn.addEventListener('click', async () => {
  await send({ type: 'DISCONNECT_GMAIL' });
  await updateGmailUI();
});

gmailCheckNowBtn.addEventListener('click', async () => {
  gmailCheckNowBtn.textContent = 'Checking...';
  const result = await send({ type: 'CHECK_GMAIL_NOW' }) as GmailStatus & { detected: number };
  gmailCheckNowBtn.textContent = 'Check Now';
  if (result.detected > 0) {
    // Refresh application list
    applications = (await send({ type: 'GET_APPLICATIONS' })) as Application[];
    renderList();
    gmailStatusText.textContent = `Found ${result.detected} new`;
  }
  await updateGmailUI();
});

// Upgrade buttons
upgradeBannerBtn.addEventListener('click', () => {
  send({ type: 'OPEN_PAYMENT_PAGE' });
});

analyticsUpgradeBtn.addEventListener('click', () => {
  send({ type: 'OPEN_PAYMENT_PAGE' });
});

upgradeBtn.addEventListener('click', () => {
  send({ type: 'OPEN_PAYMENT_PAGE' });
});

// ── Init ─────────────────────────────────────────────

async function init() {
  // Fetch data and subscription in parallel
  const [apps, sub] = await Promise.all([
    send({ type: 'GET_APPLICATIONS' }) as Promise<Application[]>,
    send({ type: 'GET_SUBSCRIPTION' }) as Promise<SubscriptionState>,
  ]);

  applications = apps;
  subscription = sub;

  updateProUI();
  renderList();
}

init();
