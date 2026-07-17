/* ============================================================
       VERDE+ — gerenciador de horta pessoal
       Armazenamento persistente via localStorage (site hospedado
       de verdade, ex: GitHub Pages). Os dados ficam salvos neste
       navegador/dispositivo.
       ============================================================ */

const STORAGE_KEYS = {
  plants: 'verde-plants', careLog: 'verde-carelog', growthLog: 'verde-growthlog',
  photoIndex: 'verde-photo-index', reminders: 'verde-reminders', expenses: 'verde-expenses'
};

const CATEGORIES = ['Fruta', 'Hortaliça', 'Tempero', 'Flor', 'Árvore', 'Suculenta', 'Ornamental', 'Outra'];
const LOCATIONS = ['Jardim', 'Quintal', 'Varanda', 'Estufa', 'Horta Vertical', 'Sala', 'Cozinha', 'Outro'];
const LIGHT_OPTIONS = ['Sol pleno', 'Meia sombra', 'Sombra'];
const DEFAULT_FREQS = {
  'Fruta': { water: 2, fert: 21, prune: 60 }, 'Hortaliça': { water: 2, fert: 20, prune: 30 },
  'Tempero': { water: 3, fert: 25, prune: 20 }, 'Flor': { water: 3, fert: 21, prune: 25 },
  'Árvore': { water: 5, fert: 45, prune: 120 }, 'Suculenta': { water: 12, fert: 45, prune: 0 },
  'Ornamental': { water: 4, fert: 30, prune: 30 }, 'Outra': { water: 3, fert: 21, prune: 30 }
};
const CARE_TYPES = {
  water: { label: 'Rega', verb: 'Reguei hoje!', color: 'var(--water)', bg: 'var(--water-bg)' },
  fertilize: { label: 'Adubação', verb: 'Adubei hoje!', color: 'var(--fert)', bg: 'var(--fert-bg)' },
  prune: { label: 'Poda', verb: 'Podei hoje!', color: 'var(--prune)', bg: 'var(--prune-bg)' },
  harvest: { label: 'Colheita', verb: 'Colhi hoje!', color: 'var(--leaf)', bg: 'var(--leaf-pale)' }
};

let state = {
  plants: [], careLog: [], growthLog: [], photoIndex: [], reminders: [], expenses: [],
  tab: 'painel',
  view: 'list', // 'list' | 'detail'
  currentPlantId: null,
  detailTab: 'visao',
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
  filters: { search: '', category: 'todas', location: 'todas', archived: false, favOnly: false },
  ready: false
};

/* ---------------- storage helpers ----------------
   Site hospedado de verdade (ex: GitHub Pages) usa localStorage
   de forma padrão. Cada planta/registro é gravado sob uma chave
   com o nome de usuário logado, então cada conta enxerga só a
   própria horta NESTE navegador/dispositivo. */
async function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(`${key}:${currentUser}`);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}
async function storageSet(key, value) {
  try {
    localStorage.setItem(`${key}:${currentUser}`, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('storage set failed', key, e);
    showToast('Não foi possível salvar. Tente novamente.');
    return false;
  }
}

/* ============================================================
   AUTENTICAÇÃO
   Cadastro: nome + email + senha.
   Login: email OU nome + senha.
   Os usuários ficam guardados por email (chave única e estável);
   um índice auxiliar de nome -> email permite logar pelo nome.
   ============================================================ */
const USERS_KEY = 'verde-users';
const SESSION_KEY = 'verde-session';
let authMode = 'login';
let currentUser = null;     // email (identificador estável usado para namespacing dos dados)
let currentUserName = null; // nome de exibição

async function sharedGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}
async function sharedSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('shared storage set failed', key, e);
    return false;
  }
}
async function getUsersBlob() {
  const blob = await sharedGet(USERS_KEY, { byEmail: {}, byName: {} });
  if (!blob || typeof blob !== 'object' || typeof blob.byEmail !== 'object' || typeof blob.byName !== 'object') {
    // formato antigo/corrompido: recomeça do zero pra não quebrar o cadastro/login
    return { byEmail: {}, byName: {} };
  }
  return blob;
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(salt + ':' + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('field-name').classList.toggle('hidden', mode === 'login');
  document.getElementById('field-email').classList.toggle('hidden', mode === 'login');
  document.getElementById('field-identifier').classList.toggle('hidden', mode === 'signup');
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
  document.getElementById('auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  hideAuthError();
}
function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.add('show');
}
function hideAuthError() {
  document.getElementById('auth-error').classList.remove('show');
}

async function handleAuthSubmit(ev) {
  ev.preventDefault();
  hideAuthError();
  const password = document.getElementById('auth-password').value;
  const submitBtn = document.getElementById('auth-submit-btn');
  const defaultLabel = authMode === 'login' ? 'Entrar' : 'Criar conta';

  try {
    if (authMode === 'signup') {
      const name = document.getElementById('auth-name').value.trim();
      const email = document.getElementById('auth-email').value.trim().toLowerCase();
      if (!name || !email || !password) { showAuthError('Preencha nome, email e senha.'); return false; }
      if (!isValidEmail(email)) { showAuthError('Digite um email válido.'); return false; }
      if (password.length < 6) { showAuthError('A senha precisa ter pelo menos 6 caracteres.'); return false; }

      submitBtn.disabled = true; submitBtn.textContent = 'Aguarde…';
      const users = await getUsersBlob();
      const nameKey = name.toLowerCase();

      if (users.byEmail[email]) { showAuthError('Já existe uma conta com esse email.'); return false; }
      if (users.byName[nameKey]) { showAuthError('Já existe uma conta com esse nome. Escolha outro.'); return false; }

      const salt = randomSalt();
      const hash = await hashPassword(password, salt);
      users.byEmail[email] = { name, email, salt, hash };
      users.byName[nameKey] = email;
      const saved = await sharedSet(USERS_KEY, users);
      if (!saved) { showAuthError('Não conseguimos salvar sua conta agora. Tente de novo.'); return false; }
      await loginAs(email, name);
    } else {
      const identifier = document.getElementById('auth-identifier').value.trim();
      if (!identifier || !password) { showAuthError('Preencha email/nome e senha.'); return false; }

      submitBtn.disabled = true; submitBtn.textContent = 'Aguarde…';
      const users = await getUsersBlob();

      let email = identifier.toLowerCase();
      if (!isValidEmail(email)) {
        // não parece email: trata como nome e resolve pro email correspondente
        email = users.byName[identifier.toLowerCase()] || null;
      }
      const record = email ? users.byEmail[email] : null;

      if (!record) { showAuthError('Não encontramos essa conta.'); return false; }

      const hash = await hashPassword(password, record.salt);
      if (hash !== record.hash) { showAuthError('Senha incorreta.'); return false; }

      await loginAs(record.email, record.name);
    }
    return false;
  } catch (e) {
    console.error('auth error', e);
    showAuthError('Algo deu errado. Tente novamente.');
    return false;
  } finally {
    if (!currentUser) {
      submitBtn.disabled = false;
      submitBtn.textContent = defaultLabel;
    }
  }
}

async function loginAs(email, name) {
  currentUser = email;
  currentUserName = name;
  try { localStorage.setItem(SESSION_KEY, email); } catch (e) { /* segue sem lembrar sessão */ }
  document.body.classList.add('authed');
  document.getElementById('account-btn').textContent = name.slice(0, 2).toUpperCase();
  await loadAll();
  render();
}

async function handleLogout() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignora */ }
  currentUser = null;
  currentUserName = null;
  document.body.classList.remove('authed');
  ['auth-name', 'auth-email', 'auth-identifier', 'auth-password'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  switchAuthMode('login');
  const submitBtn = document.getElementById('auth-submit-btn');
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar'; }
  closeAccountMenu();
}

function toggleAccountMenu() {
  if (document.getElementById('account-menu')) { closeAccountMenu(); return; }
  const menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.id = 'account-menu';
  menu.innerHTML = `
        <div class="who">Logado como <strong>${escapeHtml(currentUserName)}</strong><br>${escapeHtml(currentUser)}</div>
        <button onclick="handleLogout()">Sair</button>
      `;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', outsideAccountMenu), 0);
}
function outsideAccountMenu(ev) {
  const menu = document.getElementById('account-menu');
  if (menu && !menu.contains(ev.target) && ev.target.id !== 'account-btn') closeAccountMenu();
}
function closeAccountMenu() {
  const menu = document.getElementById('account-menu');
  if (menu) menu.remove();
  document.removeEventListener('click', outsideAccountMenu);
}

async function loadAll() {
  const [plants, careLog, growthLog, photoIndex, reminders, expenses] = await Promise.all([
    storageGet(STORAGE_KEYS.plants, []),
    storageGet(STORAGE_KEYS.careLog, []),
    storageGet(STORAGE_KEYS.growthLog, []),
    storageGet(STORAGE_KEYS.photoIndex, []),
    storageGet(STORAGE_KEYS.reminders, []),
    storageGet(STORAGE_KEYS.expenses, [])
  ]);
  state.plants = plants; state.careLog = careLog; state.growthLog = growthLog;
  state.photoIndex = photoIndex; state.reminders = reminders; state.expenses = expenses;
  state.ready = true;
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------------- date helpers ---------------- */
function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysBetween(d1, d2) { return Math.floor((new Date(d2) - new Date(d1)) / 86400000); }
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
function monthName(m) { return ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][m]; }

/* ---------------- domain logic ---------------- */
function lastCareDate(plantId, type) {
  const logs = state.careLog.filter(c => c.plantId === plantId && c.type === type).sort((a, b) => b.date.localeCompare(a.date));
  return logs.length ? logs[0].date : null;
}
function plantAlerts(plant) {
  const alerts = [];
  const today = todayISO();
  if (plant.waterFreq) {
    const last = lastCareDate(plant.id, 'water') || plant.plantDate;
    const since = daysBetween(last, today);
    if (since >= plant.waterFreq) alerts.push({ type: 'water', overdue: since - plant.waterFreq });
  }
  if (plant.fertFreq) {
    const last = lastCareDate(plant.id, 'fertilize') || plant.plantDate;
    const since = daysBetween(last, today);
    if (since >= plant.fertFreq - 3) alerts.push({ type: 'fert', overdue: since - plant.fertFreq });
  }
  if (plant.pruneFreq) {
    const last = lastCareDate(plant.id, 'prune') || plant.plantDate;
    const since = daysBetween(last, today);
    if (since >= plant.pruneFreq) alerts.push({ type: 'prune', overdue: since - plant.pruneFreq });
  }
  return alerts;
}
function isHealthy(plant) {
  const alerts = plantAlerts(plant);
  const overdueWater = alerts.find(a => a.type === 'water' && a.overdue > 2);
  const gLogs = state.growthLog.filter(g => g.plantId === plant.id).sort((a, b) => b.date.localeCompare(a.date));
  const pestFlag = gLogs.length && gLogs[0].pests;
  return !overdueWater && !pestFlag;
}
function activePlants() { return state.plants.filter(p => !p.archived); }

function ringDashInfo(plant) {
  // % progress until next watering is due (for the signature ring)
  if (!plant.waterFreq) return { pct: 1, color: 'var(--leaf)' };
  const last = lastCareDate(plant.id, 'water') || plant.plantDate;
  const since = daysBetween(last, todayISO());
  const pct = Math.min(since / plant.waterFreq, 1);
  let color = 'var(--leaf)';
  if (pct >= 1) color = 'var(--water)'; else if (pct >= 0.7) color = 'var(--fert)';
  return { pct, color };
}

/* ---------------- render shell ---------------- */
const TABS = [
  { id: 'painel', label: 'Painel' },
  { id: 'plantas', label: 'Minhas plantas' },
  { id: 'calendario', label: 'Calendário' },
  { id: 'estatisticas', label: 'Estatísticas' },
  { id: 'lembretes', label: 'Lembretes' },
  { id: 'financeiro', label: 'Financeiro' },
];

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = TABS.map(t => `<button class="${state.tab === t.id && state.view === 'list' ? 'active' : ''}" onclick="goTab('${t.id}')">${t.label}</button>`).join('');
}
function goTab(id) { state.tab = id; state.view = 'list'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

function render() {
  renderNav();
  const app = document.getElementById('app');
  if (!state.ready) { app.innerHTML = '<div class="boot">carregando sua horta…</div>'; return; }
  if (state.view === 'detail') {
    app.innerHTML = renderDetail();
    if (state.detailTab === 'fotos') loadPhotoThumbs();
    return;
  }
  switch (state.tab) {
    case 'painel': app.innerHTML = renderPainel(); break;
    case 'plantas': app.innerHTML = renderPlantas(); break;
    case 'calendario': app.innerHTML = renderCalendario(); break;
    case 'estatisticas': app.innerHTML = renderEstatisticas(); break;
    case 'lembretes': app.innerHTML = renderLembretes(); break;
    case 'financeiro': app.innerHTML = renderFinanceiro(); break;
  }
}

/* ---------------- shared bits ---------------- */
function ringSvg(plant, size = 56) {
  const { pct, color } = ringDashInfo(plant);
  const r = size / 2 - 5; const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px;">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}"></circle>
      <circle class="ring-prog" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}"></circle>
    </svg>
    <div class="ring-leaf">${plantEmoji(plant.category)}</div>
  </div>`;
}
function plantEmoji(cat) {
  return { Fruta: '🍓', Hortaliça: '🥬', Tempero: '🌿', Flor: '🌼', Árvore: '🌳', Suculenta: '🪴', Ornamental: '🌱', Outra: '🌱' }[cat] || '🌱';
}

function quickActionsHtml(plant, mini) {
  const today = todayISO();
  return Object.keys(CARE_TYPES).map(type => {
    const done = state.careLog.some(c => c.plantId === plant.id && c.type === type && c.date === today);
    const label = mini ? CARE_TYPES[type].label : CARE_TYPES[type].verb;
    return `<button class="qa-btn ${mini ? 'mini' : ''} ${done ? 'done-today' : ''}" onclick="event.stopPropagation(); logCare('${plant.id}','${type}')">${done ? '✓ ' : ''}${label}</button>`;
  }).join('');
}

function alertBadges(plant) {
  const alerts = plantAlerts(plant);
  const map = {
    water: { label: 'Regar', bg: 'var(--water-bg)', fg: 'var(--water)' },
    fert: { label: 'Adubar', bg: 'var(--fert-bg)', fg: 'var(--fert)' },
    prune: { label: 'Podar', bg: 'var(--prune-bg)', fg: 'var(--prune)' }
  };
  return alerts.map(a => {
    const m = map[a.type];
    return `<span class="pill" style="background:${m.bg};color:${m.fg};">${m.label}</span>`;
  }).join('');
}

function plantCard(plant) {
  return `<div class="card plant-card" onclick="openDetail('${plant.id}')">
    <button class="fav-btn ${plant.favorite ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${plant.id}')">${plant.favorite ? '★' : '☆'}</button>
    <div class="plant-card-top">
      ${ringSvg(plant)}
      <div class="plant-card-info">
        <h4>${escapeHtml(plant.nickname || plant.species)}</h4>
        <div class="species">${escapeHtml(plant.species)}</div>
      </div>
    </div>
    <div class="plant-meta">
      <span class="tag">${plant.category}</span>
      <span class="tag">${plant.location}</span>
      ${alertBadges(plant)}
    </div>
    <div class="quick-actions">${quickActionsHtml(plant)}</div>
  </div>`;
}

function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

/* ---------------- PAINEL (dashboard) ---------------- */
function renderPainel() {
  const plants = activePlants();
  const today = todayISO();
  const waterCount = plants.filter(p => plantAlerts(p).some(a => a.type === 'water')).length;
  const fertCount = plants.filter(p => plantAlerts(p).some(a => a.type === 'fert')).length;
  const pruneCount = plants.filter(p => plantAlerts(p).some(a => a.type === 'prune')).length;
  const okCount = plants.length - new Set(plants.filter(p => plantAlerts(p).length > 0).map(p => p.id)).size;

  if (plants.length === 0) {
    return `<div class="section-title"><h2>Painel</h2></div>${emptyState('Sua horta está vazia', 'Cadastre a primeira planta para começar a acompanhar rega, adubação e poda.', 'openPlantForm()')}`;
  }

  const alertPlants = plants.filter(p => plantAlerts(p).length > 0)
    .sort((a, b) => plantAlerts(b).length - plantAlerts(a).length);

  return `
  <div class="section-title"><h2>Painel</h2><span class="muted" style="font-size:13px;">${fmtDate(today)}</span></div>
  <div class="alert-row">
    <div class="alert-chip water"><div><div class="num">${waterCount}</div><div class="label">precisam de rega</div></div></div>
    <div class="alert-chip fert"><div><div class="num">${fertCount}</div><div class="label">adubação próxima</div></div></div>
    <div class="alert-chip prune"><div><div class="num">${pruneCount}</div><div class="label">aguardando poda</div></div></div>
    <div class="alert-chip ok"><div><div class="num">${okCount}</div><div class="label">tudo em dia</div></div></div>
  </div>

  ${alertPlants.length ? `
  <div class="section-title"><h2 style="font-size:17px;">Precisam de atenção</h2></div>
  <div class="grid grid-cards">${alertPlants.map(plantCard).join('')}</div>
  ` : `<div class="section-title"><h2 style="font-size:17px;">Tudo em dia 🌿</h2></div>`}

  <div class="section-title"><h2 style="font-size:17px;">Todas as plantas</h2><button class="btn btn-sm" onclick="goTab('plantas')">ver todas →</button></div>
  <div class="grid grid-cards">${plants.slice(0, 6).map(plantCard).join('')}</div>
  `;
}

function emptyState(title, msg, action) {
  return `<div class="card empty"><h3>${title}</h3><p>${msg}</p><button class="btn btn-primary" style="margin-top:10px;" onclick="${action}">+ Nova planta</button></div>`;
}

/* ---------------- PLANTAS (list) ---------------- */
function renderPlantas() {
  const f = state.filters;
  let list = state.plants.filter(p => !!p.archived === !!f.archived);
  if (f.category !== 'todas') list = list.filter(p => p.category === f.category);
  if (f.location !== 'todas') list = list.filter(p => p.location === f.location);
  if (f.favOnly) list = list.filter(p => p.favorite);
  if (f.search) list = list.filter(p => (p.species + ' ' + p.nickname).toLowerCase().includes(f.search.toLowerCase()));

  return `
  <div class="section-title"><h2>Minhas plantas</h2><span class="muted" style="font-size:13px;">${list.length} planta${list.length === 1 ? '' : 's'}</span></div>
  <div class="filter-bar">
    <input type="text" placeholder="Buscar por espécie ou apelido…" value="${escapeHtml(f.search)}" oninput="state.filters.search=this.value; renderInto('plantas')">
    <select onchange="state.filters.category=this.value; renderInto('plantas')">
      <option value="todas" ${f.category === 'todas' ? 'selected' : ''}>Todas categorias</option>
      ${CATEGORIES.map(c => `<option value="${c}" ${f.category === c ? 'selected' : ''}>${c}</option>`).join('')}
    </select>
    <select onchange="state.filters.location=this.value; renderInto('plantas')">
      <option value="todas" ${f.location === 'todas' ? 'selected' : ''}>Todos locais</option>
      ${LOCATIONS.map(l => `<option value="${l}" ${f.location === l ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink-soft);">
      <input type="checkbox" ${f.favOnly ? 'checked' : ''} onchange="state.filters.favOnly=this.checked; renderInto('plantas')"> favoritas
    </label>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink-soft);">
      <input type="checkbox" ${f.archived ? 'checked' : ''} onchange="state.filters.archived=this.checked; renderInto('plantas')"> ver removidas
    </label>
  </div>
  ${list.length === 0 ? emptyState('Nenhuma planta encontrada', 'Ajuste os filtros ou cadastre uma nova planta.', 'openPlantForm()') :
      `<div class="grid grid-cards">${list.map(plantCard).join('')}</div>`}
  `;
}
function renderInto(tab) { if (state.tab === tab && state.view === 'list') document.getElementById('app').innerHTML = ({ plantas: renderPlantas, painel: renderPainel })[tab](); }

/* ---------------- CALENDÁRIO ---------------- */
function renderCalendario() {
  const y = state.calYear, m = state.calMonth;
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = startDow - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, other: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, other: false });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length, other: true });

  const events = {}; // iso -> [{color,label}]
  function pushEvent(iso, color, label) { (events[iso] = events[iso] || []).push({ color, label }); }

  state.careLog.forEach(c => {
    const p = state.plants.find(pp => pp.id === c.plantId); if (!p) return;
    const info = CARE_TYPES[c.type];
    pushEvent(c.date, info.color, `${info.label}: ${p.nickname || p.species}`);
  });
  // scheduled next-due dates within visible range
  activePlants().forEach(p => {
    [['water', 'waterFreq'], ['fertilize', 'fertFreq'], ['prune', 'pruneFreq']].forEach(([type, freqKey]) => {
      if (!p[freqKey]) return;
      const last = lastCareDate(p.id, type) || p.plantDate;
      const next = new Date(last + 'T00:00:00'); next.setDate(next.getDate() + p[freqKey]);
      const iso = next.toISOString().slice(0, 10);
      if (next.getFullYear() === y && next.getMonth() === m) {
        pushEvent(iso, CARE_TYPES[type].color, `Previsto: ${CARE_TYPES[type].label} — ${p.nickname || p.species}`);
      }
    });
  });

  const todayIso = todayISO();
  const dow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return `
  <div class="section-title"><h2>Calendário</h2></div>
  <div class="card" style="padding:18px;">
    <div class="cal-head">
      <h3 style="font-size:17px;">${monthName(m)} ${y}</h3>
      <div class="cal-nav">
        <button onclick="calShift(-1)">‹</button>
        <button onclick="calToday()" class="btn btn-sm">hoje</button>
        <button onclick="calShift(1)">›</button>
      </div>
    </div>
    <div class="cal-grid">
      ${dow.map(d => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells.map(c => {
    if (c.other) return `<div class="cal-cell other"><div class="cal-daynum">${c.day}</div></div>`;
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
    const evs = (events[iso] || []).slice(0, 3);
    const isToday = iso === todayIso;
    return `<div class="cal-cell ${isToday ? 'today' : ''}" title="${(events[iso] || []).map(e => e.label).join('\\n')}">
          <div class="cal-daynum">${c.day}</div>
          <div class="cal-dot-row">${evs.map(e => `<span class="cal-dot" style="background:${e.color}"></span>`).join('')}</div>
        </div>`;
  }).join('')}
    </div>
    <div class="chart-legend" style="margin-top:14px;">
      <span><span class="legend-dot" style="background:var(--water)"></span>Rega</span>
      <span><span class="legend-dot" style="background:var(--fert)"></span>Adubação</span>
      <span><span class="legend-dot" style="background:var(--prune)"></span>Poda</span>
    </div>
  </div>`;
}
function calShift(delta) {
  state.calMonth += delta;
  if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  render();
}
function calToday() { const d = new Date(); state.calMonth = d.getMonth(); state.calYear = d.getFullYear(); render(); }

/* ---------------- ESTATÍSTICAS ---------------- */
function renderEstatisticas() {
  const plants = activePlants();
  const total = plants.length;
  const needWater = plants.filter(p => plantAlerts(p).some(a => a.type === 'water')).length;
  const healthy = plants.filter(isHealthy).length;
  const harvestCount = state.careLog.filter(c => c.type === 'harvest').length;

  // planta mais produtiva: soma de frutos registrados no growthLog
  let mostProductive = null, bestFruit = -1;
  plants.forEach(p => {
    const sum = state.growthLog.filter(g => g.plantId === p.id).reduce((s, g) => s + (Number(g.fruits) || 0), 0);
    if (sum > bestFruit) { bestFruit = sum; mostProductive = p; }
  });

  // planta que exige mais cuidados: contagem total de careLog
  let mostDemanding = null, bestCount = -1;
  plants.forEach(p => {
    const c = state.careLog.filter(l => l.plantId === p.id).length;
    if (c > bestCount) { bestCount = c; mostDemanding = p; }
  });

  const monthNow = todayISO().slice(0, 7);
  const careThisMonth = state.careLog.filter(c => c.date.slice(0, 7) === monthNow).length;

  // média de dias entre regas (todas plantas)
  let intervals = [];
  plants.forEach(p => {
    const waters = state.careLog.filter(c => c.plantId === p.id && c.type === 'water').map(c => c.date).sort();
    for (let i = 1; i < waters.length; i++) intervals.push(daysBetween(waters[i - 1], waters[i]));
  });
  const avgInterval = intervals.length ? (intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1) : '—';

  // ranking mais produtivas
  const ranking = plants.map(p => ({
    p, fruits: state.growthLog.filter(g => g.plantId === p.id).reduce((s, g) => s + (Number(g.fruits) || 0), 0),
    harvests: state.careLog.filter(c => c.plantId === p.id && c.type === 'harvest').length
  })).sort((a, b) => (b.fruits + b.harvests) - (a.fruits + a.harvests)).slice(0, 5).filter(r => r.fruits + r.harvests > 0);

  // atividade dos últimos 6 meses (para o gráfico de barras)
  const monthlyActivity = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    const count = state.careLog.filter(c => c.date.slice(0, 7) === key).length;
    monthlyActivity.push({ label: monthName(d.getMonth()).slice(0, 3), count });
  }

  return `
  <div class="section-title"><h2>Estatísticas</h2><button class="btn btn-sm" onclick="exportReport()">🧾 exportar relatório PDF</button></div>
  <div class="grid stat-grid">
    ${statCard(total, 'plantas cadastradas')}
    ${statCard(needWater, 'precisam de rega hoje')}
    ${statCard(healthy, 'plantas saudáveis')}
    ${statCard(harvestCount, 'colheitas realizadas')}
    ${statCard(mostProductive ? (mostProductive.nickname || mostProductive.species) : '—', 'planta mais produtiva', bestFruit > 0 ? `${bestFruit} frutos` : '')}
    ${statCard(mostDemanding ? (mostDemanding.nickname || mostDemanding.species) : '—', 'exige mais cuidados', bestCount > 0 ? `${bestCount} cuidados` : '')}
    ${statCard(careThisMonth, 'cuidados este mês')}
    ${statCard(avgInterval, 'média de dias entre regas')}
  </div>

  <div class="section-title"><h2 style="font-size:17px;">Atividade dos últimos 6 meses</h2></div>
  <div class="card chart-wrap" style="padding:20px 22px 14px;">
    ${monthlyBarChart(monthlyActivity)}
  </div>

  <div class="section-title"><h2 style="font-size:17px;">🏆 Ranking das mais produtivas</h2></div>
  <div class="card">
    ${ranking.length === 0 ? `<div class="empty">Ainda não há colheitas ou frutos registrados.</div>` :
      ranking.map((r, i) => `<div class="reminder-row"><div style="font-family:var(--font-display);font-weight:700;color:var(--clay);width:22px;">${i + 1}</div>
        <div style="flex:1;"><div class="reminder-title">${escapeHtml(r.p.nickname || r.p.species)}</div><div class="reminder-date">${r.fruits} frutos · ${r.harvests} colheitas</div></div>
      </div>`).join('')}
  </div>`;
}

function monthlyBarChart(data) {
  const w = 560, h = 190, padL = 8, padR = 8, padT = 10, padB = 28;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const maxV = Math.max(...data.map(d => d.count), 1);
  const gap = 14;
  const barW = (innerW - gap * (data.length - 1)) / data.length;
  const bars = data.map((d, i) => {
    const x = padL + i * (barW + gap);
    const barH = d.count === 0 ? 3 : Math.max(6, (d.count / maxV) * innerH);
    const y = padT + innerH - barH;
    return `
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="7" fill="url(#barFill)"></rect>
        ${d.count > 0 ? `<text x="${x + barW / 2}" y="${y - 6}" font-size="11" font-weight="700" fill="var(--leaf-dark)" text-anchor="middle" font-family="var(--font-body)">${d.count}</text>` : ''}
        <text x="${x + barW / 2}" y="${h - 8}" font-size="11" fill="var(--ink-soft)" text-anchor="middle" font-family="var(--font-body)">${d.label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:190px;">
        <defs>
          <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--leaf)"/>
            <stop offset="100%" stop-color="var(--clay)"/>
          </linearGradient>
        </defs>
        <line x1="${padL}" y1="${padT + innerH}" x2="${w - padR}" y2="${padT + innerH}" stroke="var(--border)"/>
        ${bars}
      </svg>`;
}
function statCard(value, label, sub) {
  return `<div class="card stat-card"><div class="stat-value">${value}</div><div class="stat-label">${label}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
}

/* ---------------- LEMBRETES ---------------- */
function renderLembretes() {
  const list = [...state.reminders].sort((a, b) => (a.done - b.done) || a.date.localeCompare(b.date));
  return `
  <div class="section-title"><h2>Lembretes</h2><button class="btn btn-primary btn-sm" onclick="openReminderForm()">+ novo lembrete</button></div>
  <p class="muted" style="margin:-6px 0 16px;font-size:13px;">Troca de vaso, defensivos naturais, transplante, controle de pragas e outros cuidados avulsos.</p>
  <div class="card">
    ${list.length === 0 ? `<div class="empty"><h3>Nenhum lembrete</h3><p>Crie lembretes para tarefas que não seguem uma frequência fixa.</p></div>` :
      list.map(r => {
        const plant = state.plants.find(p => p.id === r.plantId);
        return `<div class="reminder-row">
          <button class="reminder-check ${r.done ? 'done' : ''}" onclick="toggleReminder('${r.id}')">${r.done ? '✓' : ''}</button>
          <div style="flex:1;">
            <div class="reminder-title ${r.done ? 'done' : ''}">${escapeHtml(r.title)}</div>
            <div class="reminder-date">${fmtDate(r.date)} ${plant ? `· ${escapeHtml(plant.nickname || plant.species)}` : ''} ${r.type ? `· ${r.type}` : ''}</div>
          </div>
          <button class="btn btn-ghost btn-sm btn-danger" onclick="deleteReminder('${r.id}')">excluir</button>
        </div>`;
      }).join('')}
  </div>`;
}

/* ---------------- FINANCEIRO ---------------- */
function renderFinanceiro() {
  const total = state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const byPlant = {};
  state.expenses.forEach(e => { if (e.plantId) { byPlant[e.plantId] = (byPlant[e.plantId] || 0) + Number(e.amount || 0); } });
  const rows = Object.entries(byPlant).map(([pid, amt]) => {
    const p = state.plants.find(pp => pp.id === pid);
    return { name: p ? (p.nickname || p.species) : '—', amt };
  }).sort((a, b) => b.amt - a.amt);

  return `
  <div class="section-title"><h2>Financeiro</h2><button class="btn btn-primary btn-sm" onclick="openExpenseForm()">+ novo gasto</button></div>
  <div class="grid stat-grid" style="margin-bottom:22px;">
    ${statCard('R$ ' + total.toFixed(2), 'total investido na horta')}
    ${statCard(state.expenses.length, 'lançamentos registrados')}
  </div>
  <div class="section-title"><h2 style="font-size:17px;">Custo por planta</h2></div>
  <div class="card" style="margin-bottom:22px;">
    ${rows.length === 0 ? `<div class="empty">Nenhum gasto vinculado a uma planta ainda.</div>` :
      rows.map(r => `<div class="exp-row"><span>${escapeHtml(r.name)}</span><span class="exp-amount">R$ ${r.amt.toFixed(2)}</span></div>`).join('')}
  </div>
  <div class="section-title"><h2 style="font-size:17px;">Todos os lançamentos</h2></div>
  <div class="card">
    ${state.expenses.length === 0 ? `<div class="empty"><h3>Nenhum gasto registrado</h3><p>Registre mudas, terra, adubo, fertilizantes e vasos.</p></div>` :
      [...state.expenses].sort((a, b) => b.date.localeCompare(a.date)).map(e => {
        const p = state.plants.find(pp => pp.id === e.plantId);
        return `<div class="exp-row">
          <div><div style="font-weight:700;">${escapeHtml(e.description)}</div>
          <div class="muted" style="font-size:11.5px;">${fmtDate(e.date)} · ${e.category}${p ? ` · ${escapeHtml(p.nickname || p.species)}` : ''}</div></div>
          <div style="display:flex;align-items:center;gap:10px;"><span class="exp-amount">R$ ${Number(e.amount).toFixed(2)}</span>
          <button class="btn btn-ghost btn-sm btn-danger" onclick="deleteExpense('${e.id}')">✕</button></div>
        </div>`;
      }).join('')}
  </div>`;
}

/* ---------------- DETAIL VIEW ---------------- */
function openDetail(id) { state.currentPlantId = id; state.view = 'detail'; state.detailTab = 'visao'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function closeDetail() { state.view = 'list'; render(); }

function renderDetail() {
  const p = state.plants.find(pp => pp.id === state.currentPlantId);
  if (!p) { state.view = 'list'; return renderPlantas(); }
  const tabs = [['visao', 'Visão geral'], ['fotos', 'Fotos'], ['crescimento', 'Crescimento'], ['historico', 'Histórico'], ['financeiro', 'Custos']];

  return `
  <button class="back-link" onclick="closeDetail()">← voltar</button>
  <div class="detail-head">
    ${ringSvg(p, 72)}
    <div style="flex:1;min-width:200px;">
      <span class="eyebrow">${p.category} · ${p.environment}</span>
      <h1>${escapeHtml(p.nickname || p.species)}</h1>
      <p class="muted" style="font-style:italic;margin-top:2px;">${escapeHtml(p.species)}</p>
      <div class="detail-tags">
        <span class="tag">📍 ${p.location}</span>
        <span class="tag">☀️ ${p.light}</span>
        <span class="tag">🌱 plantada em ${fmtDate(p.plantDate)}</span>
        ${alertBadges(p)}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-sm" onclick="toggleFavorite('${p.id}')">${p.favorite ? '★ favorita' : '☆ favoritar'}</button>
      <button class="btn btn-sm" onclick="openPlantForm('${p.id}')">editar</button>
      <button class="btn btn-sm btn-danger" onclick="archivePlant('${p.id}')">${p.archived ? 'restaurar' : 'remover'}</button>
    </div>
  </div>

  <div class="quick-actions" style="margin-top:18px;max-width:520px;">${quickActionsHtml(p)}</div>

  <div class="detail-tabs">
    ${tabs.map(([id, label]) => `<button class="${state.detailTab === id ? 'active' : ''}" onclick="state.detailTab='${id}'; render();">${label}</button>`).join('')}
  </div>

  ${state.detailTab === 'visao' ? detailVisao(p) : ''}
  ${state.detailTab === 'fotos' ? detailFotos(p) : ''}
  ${state.detailTab === 'crescimento' ? detailCrescimento(p) : ''}
  ${state.detailTab === 'historico' ? detailHistorico(p) : ''}
  ${state.detailTab === 'financeiro' ? detailFinanceiroPlanta(p) : ''}
  `;
}

function detailVisao(p) {
  return `
  <div class="grid info-grid">
    <div class="card info-item"><div class="k">Frequência de rega</div><div class="v">${p.waterFreq ? `a cada ${p.waterFreq} dias` : 'não definida'}</div></div>
    <div class="card info-item"><div class="k">Frequência de adubação</div><div class="v">${p.fertFreq ? `a cada ${p.fertFreq} dias` : 'não definida'}</div></div>
    <div class="card info-item"><div class="k">Frequência de poda</div><div class="v">${p.pruneFreq ? `a cada ${p.pruneFreq} dias` : 'não definida'}</div></div>
    <div class="card info-item"><div class="k">Última rega</div><div class="v">${fmtDate(lastCareDate(p.id, 'water'))}</div></div>
    <div class="card info-item"><div class="k">Última adubação</div><div class="v">${fmtDate(lastCareDate(p.id, 'fertilize'))}</div></div>
    <div class="card info-item"><div class="k">Última poda</div><div class="v">${fmtDate(lastCareDate(p.id, 'prune'))}</div></div>
  </div>
  ${p.notes ? `<div class="card" style="padding:16px;margin-top:16px;"><div class="k" style="font-size:11px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Observações</div><p style="margin-top:6px;">${escapeHtml(p.notes)}</p></div>` : ''}
  `;
}

function detailFotos(p) {
  const photos = state.photoIndex.filter(ph => ph.plantId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  return `
  <div class="photo-grid">
    <label class="upload-tile">
      <span style="font-size:22px;">📷</span> adicionar foto
      <input type="file" accept="image/*" class="hidden" onchange="uploadPhoto(this, '${p.id}')">
    </label>
    ${photos.map(ph => `<div class="photo-tile" id="photo-${ph.id}">
        <img data-photo-id="${ph.id}" alt="${fmtDate(ph.date)}">
        <div class="pdate">${fmtDate(ph.date)}</div>
      </div>`).join('')}
  </div>
  ${photos.length === 0 ? '<p class="muted" style="margin-top:14px;">Adicione fotos periódicas para criar a linha do tempo de evolução desta planta.</p>' : ''}
  `;
}

async function loadPhotoThumbs() {
  const imgs = document.querySelectorAll('img[data-photo-id]');
  for (const img of imgs) {
    const id = img.getAttribute('data-photo-id');
    try {
      const photoData = await storageGet('photo-data:' + id, null);
      if (photoData) img.src = photoData;
    } catch (e) { }
  }
}

function detailCrescimento(p) {
  const logs = state.growthLog.filter(g => g.plantId === p.id).sort((a, b) => a.date.localeCompare(b.date));
  const heights = logs.filter(l => l.height).map(l => Number(l.height));
  const maxH = heights.length ? Math.max(...heights, 1) : 1;
  const minH = heights.length ? Math.min(...heights, 0) * 0.85 : 0;
  const chartW = 560, chartH = 200, padL = 34, padR = 16, padT = 18, padB = 30;
  const innerW = chartW - padL - padR, innerH = chartH - padT - padB;
  let pathD = '', areaD = '', points = '', gridLines = '';

  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    const gy = padT + (innerH / gridCount) * i;
    const val = Math.round(maxH - ((maxH - minH) / gridCount) * i);
    gridLines += `<line x1="${padL}" y1="${gy}" x2="${chartW - padR}" y2="${gy}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4"/>
        <text x="${padL - 8}" y="${gy + 4}" font-size="10" fill="var(--ink-soft)" text-anchor="end" font-family="var(--font-body)">${val}</text>`;
  }

  if (heights.length > 1) {
    const measured = logs.filter(l => l.height);
    const step = innerW / (measured.length - 1);
    const coords = measured.map((l, i) => ({
      x: padL + i * step,
      y: padT + innerH - ((Number(l.height) - minH) / (maxH - minH || 1)) * innerH,
      date: l.date, h: l.height
    }));

    // curva suave (Catmull-Rom -> Bézier)
    pathD = `M${coords[0].x},${coords[0].y} `;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i - 1] || coords[i];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      pathD += `C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y} `;
    }
    areaD = `${pathD} L${coords[coords.length - 1].x},${padT + innerH} L${coords[0].x},${padT + innerH} Z`;
    points = coords.map(c => `<circle cx="${c.x}" cy="${c.y}" r="4" fill="var(--surface)" stroke="var(--leaf)" stroke-width="2.5"><title>${fmtDate(c.date)}: ${c.h}cm</title></circle>`).join('');
  }

  return `
  <div class="card chart-wrap">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h3 style="font-size:15px;">Evolução de altura (cm)</h3>
      <button class="btn btn-sm btn-primary" onclick="openGrowthForm('${p.id}')">+ registrar medição</button>
    </div>
    ${heights.length > 1 ? `<svg viewBox="0 0 ${chartW} ${chartH}" style="width:100%;height:200px;margin-top:12px;">
      <defs>
        <linearGradient id="growthFill-${p.id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--leaf)" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="var(--clay)" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaD}" fill="url(#growthFill-${p.id})" stroke="none"/>
      <path d="${pathD}" fill="none" stroke="var(--leaf)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${points}
    </svg>` : `<p class="muted" style="margin-top:12px;">Registre ao menos duas medições de altura para ver o gráfico de evolução.</p>`}
  </div>
  <div class="section-title"><h2 style="font-size:16px;">Registros</h2></div>
  <div class="card">
    ${logs.length === 0 ? `<div class="empty">Nenhum registro de crescimento ainda.</div>` :
      [...logs].reverse().map(l => `<div class="reminder-row">
        <div style="flex:1;">
          <div class="reminder-title">${fmtDate(l.date)}${l.height ? ` · ${l.height} cm` : ''}${l.fruits ? ` · ${l.fruits} frutos` : ''}${l.flowers ? ` · ${l.flowers} flores` : ''}</div>
          ${l.pests ? `<div style="font-size:12px;color:var(--water);margin-top:2px;">⚠ ${escapeHtml(l.pests)}</div>` : ''}
          ${l.notes ? `<div class="reminder-date">${escapeHtml(l.notes)}</div>` : ''}
        </div>
      </div>`).join('')}
  </div>`;
}

function detailHistorico(p) {
  const logs = [...state.careLog.filter(c => c.plantId === p.id)].sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="card timeline" style="padding:6px 16px;">
    ${logs.length === 0 ? `<div class="empty">Nenhum cuidado registrado ainda. Use os botões rápidos acima!</div>` :
      logs.map(c => {
        const info = CARE_TYPES[c.type];
        return `<div class="tl-item">
          <div class="tl-dot" style="background:${info.color}"></div>
          <div class="tl-body">
            <div class="tl-title">${info.label}</div>
            <div class="tl-date">${fmtDate(c.date)}</div>
          </div>
        </div>`;
      }).join('')}
  </div>`;
}

function detailFinanceiroPlanta(p) {
  const exps = state.expenses.filter(e => e.plantId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const total = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
  return `
  <div class="section-title"><h2 style="font-size:16px;">Gastos com esta planta</h2><button class="btn btn-sm btn-primary" onclick="openExpenseForm('${p.id}')">+ novo gasto</button></div>
  <div class="stat-card card" style="margin-bottom:14px;max-width:220px;"><div class="stat-value">R$ ${total.toFixed(2)}</div><div class="stat-label">total investido</div></div>
  <div class="card">
    ${exps.length === 0 ? `<div class="empty">Nenhum gasto vinculado ainda.</div>` :
      exps.map(e => `<div class="exp-row"><div><div style="font-weight:700;">${escapeHtml(e.description)}</div><div class="muted" style="font-size:11.5px;">${fmtDate(e.date)} · ${e.category}</div></div>
      <div style="display:flex;align-items:center;gap:10px;"><span class="exp-amount">R$ ${Number(e.amount).toFixed(2)}</span><button class="btn btn-ghost btn-sm btn-danger" onclick="deleteExpense('${e.id}')">✕</button></div></div>`).join('')}
  </div>`;
}

/* ---------------- ACTIONS: care log / photos / growth ---------------- */
async function logCare(plantId, type) {
  const today = todayISO();
  const already = state.careLog.find(c => c.plantId === plantId && c.type === type && c.date === today);
  if (already) { showToast('Já registrado hoje ✓'); return; }
  state.careLog.push({ id: uid(), plantId, type, date: today });
  await storageSet(STORAGE_KEYS.careLog, state.careLog);
  showToast(CARE_TYPES[type].verb + ' registrado.');
  render();
  if (quickPopOpen) renderQuickPop();
}

async function toggleFavorite(id) {
  const p = state.plants.find(pp => pp.id === id); if (!p) return;
  p.favorite = !p.favorite;
  await storageSet(STORAGE_KEYS.plants, state.plants);
  render();
}

async function archivePlant(id) {
  const p = state.plants.find(pp => pp.id === id); if (!p) return;
  const confirmMsg = p.archived ? 'Restaurar esta planta para a horta ativa?' : 'Remover esta planta da horta ativa? O histórico será mantido.';
  if (!confirm(confirmMsg)) return;
  p.archived = !p.archived;
  await storageSet(STORAGE_KEYS.plants, state.plants);
  showToast(p.archived ? 'Planta removida (histórico mantido).' : 'Planta restaurada.');
  if (state.view === 'detail') closeDetail(); else render();
}

function uploadPhoto(input, plantId) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    const img = new Image();
    img.onload = async function () {
      const maxW = 900;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      const id = uid();
      await storageSet('photo-data:' + id, dataUrl);
      state.photoIndex.push({ id, plantId, date: todayISO() });
      await storageSet(STORAGE_KEYS.photoIndex, state.photoIndex);
      showToast('Foto adicionada.');
      render();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

/* ---------------- FLOATING QUICK ACTION ---------------- */
let quickPopOpen = false, quickPopFilter = '';
function toggleQuickPop() {
  quickPopOpen = !quickPopOpen;
  quickPopFilter = '';
  renderQuickPop();
}
function closeQuickPop() { quickPopOpen = false; document.getElementById('quick-pop-root').innerHTML = ''; }
function renderQuickPop() {
  const root = document.getElementById('quick-pop-root');
  if (!quickPopOpen) { root.innerHTML = ''; return; }
  const list = activePlants().filter(p => (p.species + ' ' + (p.nickname || '')).toLowerCase().includes(quickPopFilter.toLowerCase()));
  root.innerHTML = `
  <div class="quick-pop">
    <div class="quick-pop-head">
      <input type="text" placeholder="Buscar planta para registrar cuidado…" value="${escapeHtml(quickPopFilter)}"
        oninput="quickPopFilter=this.value; renderQuickPop();" id="qp-search">
    </div>
    <div class="quick-pop-list">
      ${list.length === 0 ? `<div class="empty" style="padding:20px 10px;">Nenhuma planta encontrada.</div>` :
      list.map(p => `<div class="quick-pop-row">
          <div class="qpr-name">${escapeHtml(p.nickname || p.species)}</div>
          <div class="quick-actions">${quickActionsHtml(p, true)}</div>
        </div>`).join('')}
    </div>
  </div>`;
  const input = document.getElementById('qp-search');
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}
document.addEventListener('click', function (e) {
  if (!quickPopOpen) return;
  const pop = document.querySelector('.quick-pop');
  const fab = document.getElementById('fab-btn');
  if (pop && !pop.contains(e.target) && e.target !== fab) closeQuickPop();
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && quickPopOpen) closeQuickPop(); });

/* ---------------- MODALS: generic ---------------- */
function openModal(html) {
  document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop" onclick="if(event.target===this) closeModal()"><div class="modal">${html}</div></div>`;
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* ----- plant form ----- */
function openPlantForm(id) {
  const p = id ? state.plants.find(pp => pp.id === id) : null;
  const title = p ? 'Editar planta' : 'Nova planta';
  const cat = p ? p.category : CATEGORIES[0];
  const d = DEFAULT_FREQS[cat] || { water: '', fert: '', prune: '' };
  openModal(`
    <div class="modal-head"><h3>${title}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    ${p ? '' : '<p class="muted" style="margin:-8px 0 14px;font-size:12.5px;">Preencha o essencial — as frequências já vêm sugeridas pela categoria, é só ajustar se quiser.</p>'}
    <form id="plant-form" onsubmit="return savePlant(event,'${id || ''}')">
      <div class="form-grid">
        <div class="field"><label>Nome da espécie *</label><input required name="species" autofocus value="${p ? escapeHtml(p.species) : ''}" placeholder="Ex: Morangueiro"></div>
        <div class="field"><label>Apelido da planta</label><input name="nickname" value="${p ? escapeHtml(p.nickname) : ''}" placeholder="Ex: Morango da varanda"></div>
        <div class="field"><label>Categoria</label><select name="category" id="pf-category" onchange="applyCategoryDefaults(this)">${CATEGORIES.map(c => `<option ${cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Local</label><select name="location">${LOCATIONS.map(l => `<option ${p && p.location === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Regar a cada (dias)</label><input type="number" min="0" id="pf-water" name="waterFreq" value="${p ? p.waterFreq || '' : d.water}" placeholder="Ex: 2"></div>
        <div class="field"><label>Adubar a cada (dias)</label><input type="number" min="0" id="pf-fert" name="fertFreq" value="${p ? p.fertFreq || '' : d.fert}" placeholder="Ex: 21"></div>
        <div class="field span2"><label>Podar a cada (dias, deixe 0 se não se aplica)</label><input type="number" min="0" id="pf-prune" name="pruneFreq" value="${p ? p.pruneFreq || '' : d.prune}" placeholder="Ex: 30"></div>
      </div>
      <details style="margin-top:14px;">
        <summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--ink-soft);">+ mais detalhes (ambiente, luz, data, observações)</summary>
        <div class="form-grid" style="margin-top:12px;">
          <div class="field"><label>Ambiente</label><select name="environment"><option ${p && p.environment === 'Interno' ? 'selected' : ''}>Interno</option><option ${!p || p.environment === 'Externo' ? 'selected' : ''}>Externo</option></select></div>
          <div class="field"><label>Necessidade de luz</label><select name="light">${LIGHT_OPTIONS.map(l => `<option ${p && p.light === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Data de plantio</label><input type="date" name="plantDate" value="${p ? p.plantDate : todayISO()}"></div>
          <div class="field"></div>
          <div class="field span2"><label>Observações</label><textarea name="notes" placeholder="Cuidados especiais, histórico, curiosidades…">${p ? escapeHtml(p.notes || '') : ''}</textarea></div>
        </div>
      </details>
      <div class="modal-actions">
        <button type="button" class="btn" onclick="closeModal()">cancelar</button>
        <button type="submit" class="btn btn-primary">${p ? 'salvar alterações' : 'cadastrar planta'}</button>
      </div>
    </form>
  `);
}
function applyCategoryDefaults(sel) {
  const d = DEFAULT_FREQS[sel.value]; if (!d) return;
  document.getElementById('pf-water').value = d.water;
  document.getElementById('pf-fert').value = d.fert;
  document.getElementById('pf-prune').value = d.prune;
}
async function savePlant(ev, id) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const data = Object.fromEntries(f.entries());
  ['waterFreq', 'fertFreq', 'pruneFreq'].forEach(k => data[k] = data[k] ? Number(data[k]) : null);
  if (id) {
    const p = state.plants.find(pp => pp.id === id);
    Object.assign(p, data);
  } else {
    state.plants.push({ id: uid(), ...data, favorite: false, archived: false, createdAt: todayISO() });
  }
  await storageSet(STORAGE_KEYS.plants, state.plants);
  closeModal();
  showToast(id ? 'Planta atualizada.' : 'Planta cadastrada!');
  render();
  return false;
}

/* ----- growth form ----- */
function openGrowthForm(plantId) {
  openModal(`
    <div class="modal-head"><h3>Registrar crescimento</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <form onsubmit="return saveGrowth(event,'${plantId}')">
      <div class="form-grid">
        <div class="field"><label>Data</label><input type="date" name="date" value="${todayISO()}"></div>
        <div class="field"><label>Altura aproximada (cm)</label><input type="number" step="0.1" name="height"></div>
        <div class="field"><label>Quantidade de frutos</label><input type="number" name="fruits"></div>
        <div class="field"><label>Quantidade de flores</label><input type="number" name="flowers"></div>
        <div class="field span2"><label>Pragas / doenças observadas</label><input name="pests" placeholder="Deixe em branco se não houver"></div>
        <div class="field span2"><label>Observações</label><textarea name="notes"></textarea></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" onclick="closeModal()">cancelar</button>
        <button type="submit" class="btn btn-primary">salvar registro</button>
      </div>
    </form>
  `);
}
async function saveGrowth(ev, plantId) {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target).entries());
  state.growthLog.push({ id: uid(), plantId, ...f });
  await storageSet(STORAGE_KEYS.growthLog, state.growthLog);
  closeModal(); showToast('Registro de crescimento salvo.'); render();
  return false;
}

/* ----- reminder form ----- */
function openReminderForm() {
  openModal(`
    <div class="modal-head"><h3>Novo lembrete</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <form onsubmit="return saveReminder(event)">
      <div class="form-grid">
        <div class="field span2"><label>Título *</label><input required name="title" placeholder="Ex: Trocar vaso do morangueiro"></div>
        <div class="field"><label>Data</label><input type="date" name="date" value="${todayISO()}"></div>
        <div class="field"><label>Tipo</label><input name="type" placeholder="Ex: transplante, defensivo, praga…"></div>
        <div class="field span2"><label>Planta relacionada (opcional)</label>
          <select name="plantId"><option value="">— nenhuma —</option>${activePlants().map(p => `<option value="${p.id}">${escapeHtml(p.nickname || p.species)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" onclick="closeModal()">cancelar</button>
        <button type="submit" class="btn btn-primary">salvar lembrete</button>
      </div>
    </form>
  `);
}
async function saveReminder(ev) {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target).entries());
  state.reminders.push({ id: uid(), ...f, done: false });
  await storageSet(STORAGE_KEYS.reminders, state.reminders);
  closeModal(); showToast('Lembrete criado.'); render();
  return false;
}
async function toggleReminder(id) {
  const r = state.reminders.find(rr => rr.id === id); r.done = !r.done;
  await storageSet(STORAGE_KEYS.reminders, state.reminders); render();
}
async function deleteReminder(id) {
  if (!confirm('Excluir este lembrete?')) return;
  state.reminders = state.reminders.filter(r => r.id !== id);
  await storageSet(STORAGE_KEYS.reminders, state.reminders); render();
}

/* ----- expense form ----- */
function openExpenseForm(plantId) {
  openModal(`
    <div class="modal-head"><h3>Novo gasto</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <form onsubmit="return saveExpense(event)">
      <div class="form-grid">
        <div class="field span2"><label>Descrição *</label><input required name="description" placeholder="Ex: Adubo orgânico 2kg"></div>
        <div class="field"><label>Valor (R$) *</label><input required type="number" step="0.01" min="0" name="amount"></div>
        <div class="field"><label>Data</label><input type="date" name="date" value="${todayISO()}"></div>
        <div class="field"><label>Categoria</label><select name="category"><option>Muda</option><option>Terra/substrato</option><option>Adubo</option><option>Fertilizante</option><option>Vaso</option><option>Defensivo</option><option>Outro</option></select></div>
        <div class="field"><label>Planta relacionada</label>
          <select name="plantId"><option value="">— nenhuma —</option>${activePlants().map(p => `<option value="${p.id}" ${plantId === p.id ? 'selected' : ''}>${escapeHtml(p.nickname || p.species)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" onclick="closeModal()">cancelar</button>
        <button type="submit" class="btn btn-primary">salvar gasto</button>
      </div>
    </form>
  `);
}
async function saveExpense(ev) {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target).entries());
  state.expenses.push({ id: uid(), ...f });
  await storageSet(STORAGE_KEYS.expenses, state.expenses);
  closeModal(); showToast('Gasto registrado.'); render();
  return false;
}
async function deleteExpense(id) {
  if (!confirm('Excluir este gasto?')) return;
  state.expenses = state.expenses.filter(e => e.id !== id);
  await storageSet(STORAGE_KEYS.expenses, state.expenses); render();
}

/* ---------------- report export (print to PDF) ---------------- */
function exportReport() {
  const plants = activePlants();
  const today = fmtDate(todayISO());
  const rows = plants.map(p => {
    const alerts = plantAlerts(p).map(a => ({ water: 'Regar', fert: 'Adubar', prune: 'Podar' }[a.type])).join(', ') || 'em dia';
    return `<tr><td>${escapeHtml(p.nickname || p.species)}</td><td>${escapeHtml(p.species)}</td><td>${p.category}</td><td>${p.location}</td><td>${fmtDate(lastCareDate(p.id, 'water'))}</td><td>${alerts}</td></tr>`;
  }).join('');
  document.getElementById('print-report').innerHTML = `
    <h1 style="font-family:serif;">Verde+ — Relatório da horta</h1>
    <p>Gerado em ${today} · ${plants.length} plantas ativas</p>
    <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><th>Apelido</th><th>Espécie</th><th>Categoria</th><th>Local</th><th>Última rega</th><th>Alertas</th></tr>
      ${rows}
    </table>`;
  window.print();
}

/* ---------------- toast ---------------- */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------------- init ---------------- */
(async function init() {
  let savedEmail = null;
  try {
    savedEmail = localStorage.getItem(SESSION_KEY);
  } catch (e) { /* sem sessão salva ainda */ }

  if (savedEmail) {
    const users = await getUsersBlob();
    const record = users.byEmail[savedEmail];
    if (record) {
      currentUser = record.email;
      currentUserName = record.name;
      document.body.classList.add('authed');
      document.getElementById('account-btn').textContent = record.name.slice(0, 2).toUpperCase();
      await loadAll();
      render();
    } else {
      // sessão salva aponta pra uma conta que não existe mais (dados apagados etc.)
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignora */ }
    }
  }
  // se não houver sessão, a tela de login (já visível por padrão) aguarda o envio do formulário
})();