/**
 * PASTELARIA PDV — Frontend (JavaScript puro).
 * Fala com o backend Code.gs (Google Apps Script + Google Sheets).
 */

// ===================== CONFIGURAÇÃO =====================
// Cole aqui a URL do Web App do Apps Script (termina com /exec).
const API_URL = 'COLE_AQUI_A_URL_DO_APPS_SCRIPT';
// ========================================================

const Pages = {};

// ======================================================================
// Utilitários de interface
// ======================================================================
// Utilitários de interface: formatação, toasts, modais, CSV.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (n) => brl.format(Number(n) || 0);
const num = (n, d = 3) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d }).format(Number(n) || 0);
const parseNum = (s) => {
  if (typeof s === 'number') return s;
  const t = String(s ?? '').trim().replace(/\s/g, '');
  if (!t) return 0;
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0;
};

const TZ = 'America/Sao_Paulo';
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ }) : '');
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '');
const fmtDateTime = (d) => (d ? `${fmtDate(d)} ${fmtTime(d)}` : '');
const fmtDay = (s) => (s ? s.split('-').reverse().join('/') : '');
const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const sinceMin = (d) => Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));

const STATUS = {
  NOVO: { label: 'Novo', cls: 'blue', icon: '🔵' },
  CONFIRMADO: { label: 'Confirmado', cls: 'indigo', icon: '🟣' },
  EM_PREPARO: { label: 'Em preparo', cls: 'yellow', icon: '🟡' },
  PRONTO: { label: 'Pronto', cls: 'green', icon: '🟢' },
  ENTREGUE: { label: 'Entregue', cls: 'gray', icon: '⚪' },
  CANCELADO: { label: 'Cancelado', cls: 'red', icon: '🔴' },
};
const statusBadge = (s) => `<span class="badge ${STATUS[s]?.cls}">${STATUS[s]?.icon} ${STATUS[s]?.label || s}</span>`;
const ROLE = { ADMIN: 'Administrador', ATENDENTE: 'Atendente', COZINHA: 'Cozinha' };

function toast(msg, type = 'ok', ms = 3500) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Abre um modal. `body` é HTML. Retorna {el, close}. */
function modal({ title, body, wide = false, onMount }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Fechar">✕</button></div>
    <div class="modal-body">${body}</div></div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.body.append(wrap);
  const first = wrap.querySelector('input:not([type=hidden]),select,textarea');
  first?.focus();
  onMount?.(wrap, close);
  return { el: wrap, close };
}

const confirmDialog = (message, { ok = 'Confirmar', danger = false } = {}) => new Promise((resolve) => {
  const m = modal({
    title: 'Confirmação',
    body: `<p>${esc(message)}</p><div class="row end gap"><button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button></div>`,
  });
  m.el.querySelector('[data-ok]').onclick = () => { m.close(); resolve(true); };
  m.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) resolve(false); });
});

/** Pede um texto (ex.: motivo). Resolve com string ou null. */
const promptDialog = (title, label, { required = true, ok = 'Confirmar', danger = false } = {}) => new Promise((resolve) => {
  const m = modal({
    title,
    body: `<form class="form"><label>${esc(label)}<textarea name="v" rows="3" ${required ? 'required' : ''}></textarea></label>
      <div class="row end gap"><button type="button" class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}">${esc(ok)}</button></div></form>`,
  });
  m.el.querySelector('form').onsubmit = (e) => { e.preventDefault(); const val = e.target.v.value.trim(); m.close(); resolve(val); };
  m.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) resolve(null); });
});

function downloadCsv(filename, columns, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => cell(c.label)).join(';')];
  for (const r of rows) {
    lines.push(columns.map((c) => {
      const v = r[c.key];
      if (c.type === 'money' || typeof v === 'number') return cell(String(v ?? '').replace('.', ','));
      if (c.type === 'datetime') return cell(fmtDateTime(v));
      if (c.type === 'date') return cell(fmtDay(v));
      return cell(v);
    }).join(';'));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }); // BOM p/ Excel
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Lê arquivo de imagem e redimensiona para data URL JPEG/PNG leve. */
function imageToDataUrl(file, max = 160, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      // A célula do Google Sheets aceita ~50 mil caracteres: reduz a qualidade até caber.
      const test = c.toDataURL('image/webp', quality);
      const mime = test.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
      let q = quality; let out = c.toDataURL(mime, q);
      while (out.length > 40000 && q > 0.2) { q -= 0.1; out = c.toDataURL(mime, q); }
      if (out.length > 40000) return reject(new Error('Imagem complexa demais; use uma foto menor'));
      resolve(out);
    };
    img.onerror = () => reject(new Error('Imagem inválida'));
    img.src = URL.createObjectURL(file);
  });
}

const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/** Beep curto para novos pedidos (sem arquivo de áudio). */
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); o.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 500);
  } catch { /* áudio bloqueado até interação */ }
}

// ======================================================================
// Cliente da API (Google Apps Script)
// ======================================================================
// Cliente da API: fala com o Google Apps Script (backend/Code.gs).
// Usa POST com Content-Type text/plain para evitar o preflight de CORS do Apps Script.
const TOKEN_KEY = 'pastelaria.token';
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

let onUnauthorized = () => {};
const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

const apiConfigured = () => !!API_URL && !/COLE_AQUI/.test(API_URL);

async function request(method, path, body) {
  if (!apiConfigured()) throw new Error('API não configurada. Edite a constante API_URL no início do app.js com a URL do Apps Script.');
  const [p, qstr] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(qstr || ''));
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ method, path: p, query, body: body === undefined ? {} : body, token: getToken() }),
    });
  } catch {
    throw new Error('Sem conexão com o servidor');
  }
  let data;
  try { data = await res.json(); } catch { throw new Error('Resposta inválida do servidor. Confira a URL e a implantação do Apps Script.'); }
  if (data.error) {
    if (data.status === 401 && path !== '/auth/login') onUnauthorized();
    throw Object.assign(new Error(data.error), { status: data.status });
  }
  return data.data;
}

const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
};

const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

// ======================================================================
// Estado global
// ======================================================================
// Estado global compartilhado entre páginas.
const state = { user: null, settings: null };

async function loadSettings() {
  state.settings = await api.get('/settings');
  return state.settings;
}

const activeMethods = () => (state.settings?.payment_methods || []).filter((m) => m.active);
const methodLabel = (key) => (state.settings?.payment_methods || []).find((m) => m.key === key)?.label || key;

// ======================================================================
// Impressão de comandas
// ======================================================================
// Módulo de impressão de comandas (térmicas 58mm/80mm).
//
// imprimirPedido(pedido, settings)
//   Abre a janela de impressão do navegador com CSS para bobina térmica (@page 58mm/80mm).
//   Para imprimir sem diálogo, abra o Chrome com --kiosk-printing e deixe a térmica como padrão.
const PAY_LABEL = { DINHEIRO: 'Dinheiro', PIX: 'Pix', DEBITO: 'Débito', CREDITO: 'Crédito' };

const brlTxt = (n) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');

/** Modelo neutro da comanda: lista de linhas {t, align, bold, size, sep}. */
function montarComanda(p, settings) {
  const L = [];
  const add = (t = '', o = {}) => L.push({ t, ...o });
  const methods = Object.fromEntries((settings.payment_methods || []).map((m) => [m.key, m.label]));
  add((settings.name || 'Pastelaria').toUpperCase(), { align: 'center', bold: true, size: 2 });
  if (settings.phone) add(settings.phone, { align: 'center' });
  add('', { sep: true });
  add(`PEDIDO ${p.label}`, { align: 'center', bold: true, size: 2 });
  add(`Data: ${fmtDate(p.created_at)}`);
  add(`Hora: ${fmtTime(p.created_at)}`);
  if (p.customer) add(`Cliente: ${p.customer}`);
  add('', { sep: true });
  for (const i of p.items) {
    add(`${i.quantity}x ${i.name}`, { bold: true, size: 1.5 });
    if (i.notes) add(`   * ${i.notes}`);
  }
  if (p.notes) {
    add('', { sep: true });
    add('OBSERVAÇÃO:', { bold: true });
    add(p.notes);
  }
  add('', { sep: true });
  if (p.payments?.length) {
    for (const pay of p.payments) add(`PAGAMENTO: ${(methods[pay.method] || PAY_LABEL[pay.method] || pay.method).toUpperCase()} ${brlTxt(pay.amount)}`);
  } else {
    add('PAGAMENTO: PENDENTE');
  }
  if (p.discount > 0) add(`DESCONTO: ${brlTxt(p.discount)}`);
  add(`TOTAL: ${brlTxt(p.total)}`, { bold: true, size: 2 });
  return L;
}

// ---------- Navegador ----------
function htmlComanda(lines, paper) {
  const body = lines.map((l) => {
    if (l.sep) return '<hr>';
    const st = `text-align:${l.align || 'left'};font-weight:${l.bold ? 700 : 400};font-size:${(l.size || 1) * 100}%`;
    return `<div style="${st}">${l.t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) || '&nbsp;'}</div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Comanda</title><style>
    @page { size: ${paper}mm auto; margin: 0 }
    body { width: ${paper - 6}mm; margin: 0 3mm; font: 12px/1.35 'Courier New', monospace; color:#000 }
    hr { border: 0; border-top: 1px dashed #000; margin: 4px 0 }
    div { word-break: break-word }
  </style></head><body>${body}<div style="height:8mm">&nbsp;</div></body></html>`;
}

function imprimirNavegador(lines, paper, copies) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.append(frame);
    const doc = frame.contentDocument;
    doc.open(); doc.write(htmlComanda(lines, paper)); doc.close();
    setTimeout(() => {
      for (let i = 0; i < copies; i++) frame.contentWindow.print();
      setTimeout(() => { frame.remove(); resolve(); }, 1000);
    }, 150);
  });
}

/** Imprime a comanda do pedido conforme as configurações. Lança erro se falhar. */
async function imprimirPedido(pedido, settings) {
  const pr = settings.printer || {};
  const lines = montarComanda(pedido, settings);
  const paper = Number(pr.paper) || 80;
  const copies = pr.copies || 1;
  return imprimirNavegador(lines, paper, copies);
}

/** Envia um teste curto para validar a configuração. */
function imprimirTeste(settings) {
  return imprimirPedido({
    label: '#TESTE', created_at: new Date().toISOString(), customer: 'Teste de impressão',
    items: [{ quantity: 2, name: 'Pastel de Carne', notes: 'Sem cebola' }, { quantity: 1, name: 'Coca-Cola' }],
    notes: 'Comanda de teste', payments: [{ method: 'PIX', amount: 45 }], discount: 0, total: 45,
  }, settings);
}

// ======================================================================
// Componente: seletor de período
// ======================================================================
// Seletor de período (hoje/ontem/semana/mês/personalizado) reutilizável.
const OPTS = [['today', 'Hoje'], ['yesterday', 'Ontem'], ['week', 'Semana'], ['month', 'Mês'], ['custom', 'Período']];

function periodBar(host, state, onChange) {
  host.innerHTML = `<div class="tabs" style="margin:0">${OPTS.map(([k, l]) => `<button class="tab ${state.period === k ? 'active' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
    <div class="row gap ${state.period === 'custom' ? '' : 'hidden'}" id="cust"><input type="date" name="from" value="${state.from || todayStr()}" style="width:auto"><span>até</span><input type="date" name="to" value="${state.to || todayStr()}" style="width:auto"></div>`;
  host.className = 'row gap wrap';
  host.onclick = (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    state.period = b.dataset.p;
    if (state.period === 'custom') { state.from ||= todayStr(); state.to ||= todayStr(); }
    periodBar(host, state, onChange); onChange();
  };
  host.onchange = (e) => {
    if (e.target.name === 'from') state.from = e.target.value;
    if (e.target.name === 'to') state.to = e.target.value;
    onChange();
  };
}

const periodParams = (s) => (s.period === 'custom' ? { period: 'custom', from: s.from, to: s.to } : { period: s.period });

// ======================================================================
// Componente: detalhe do pedido
// ======================================================================
// Detalhe do pedido: status, pagamentos, cancelamento e impressão.
const NEXT = { NOVO: ['CONFIRMADO', 'Confirmar'], CONFIRMADO: ['EM_PREPARO', 'Iniciar preparo'], EM_PREPARO: ['PRONTO', 'Marcar pronto'], PRONTO: ['ENTREGUE', 'Entregar'] };

async function openOrder(id, onChange) {
  const o = await api.get(`/orders/${id}`);
  const role = state.user.role;
  const canPay = role !== 'COZINHA' && o.status !== 'CANCELADO' && o.remaining > 0;
  const canCancel = role !== 'COZINHA' && !['CANCELADO', 'ENTREGUE'].includes(o.status);
  const next = NEXT[o.status];
  const m = modal({
    wide: true,
    title: `Pedido ${o.label}`,
    body: `<div class="row between wrap gap mb"><div>${statusBadge(o.status)} <span class="muted small">${fmtDateTime(o.created_at)} · por ${esc(o.created_by_name || '-')}</span></div>
        <b style="font-size:1.4rem">${money(o.total)}</b></div>
      ${o.customer ? `<p>👤 <b>${esc(o.customer)}</b> ${esc(o.customer_phone || '')}<br><span class="muted small">${esc(o.customer_address || '')}</span></p>` : ''}
      <div class="table-wrap"><table><tbody>${o.items.map((i) => `<tr><td>${i.quantity}x ${esc(i.name)}${i.notes ? `<br><span class="small muted">↳ ${esc(i.notes)}</span>` : ''}</td><td class="num">${money(i.unit_price * i.quantity)}</td></tr>`).join('')}
        ${o.discount > 0 ? `<tr><td>Desconto</td><td class="num">− ${money(o.discount)}</td></tr>` : ''}</tbody></table></div>
      ${o.notes ? `<div class="alert warn mt">OBS: ${esc(o.notes)}</div>` : ''}
      <h3 class="mt">Pagamentos</h3>
      ${o.payments.length ? o.payments.map((p) => `<div class="row between"><span>${esc(methodLabel(p.method))} <span class="muted small">${fmtDateTime(p.created_at)}</span></span><b>${money(p.amount)}</b></div>`).join('') : '<p class="muted">Nenhum pagamento registrado</p>'}
      ${o.remaining > 0 && o.status !== 'CANCELADO' ? `<p style="color:var(--red)"><b>A receber: ${money(o.remaining)}</b></p>` : ''}
      ${o.status === 'CANCELADO' ? `<div class="alert err mt">Cancelado em ${fmtDateTime(o.cancelled_at)} por ${esc(o.cancelled_by_name || '-')}<br>Motivo: ${esc(o.cancel_reason)}</div>` : ''}
      <h3 class="mt">Histórico</h3>
      ${o.history.map((h) => `<div class="small">${fmtDateTime(h.created_at)} — ${statusBadge(h.status)} ${esc(h.user_name || '')}${h.note ? ` <span class="muted">(${esc(h.note)})</span>` : ''}</div>`).join('')}
      <div class="row gap wrap mt end">
        <button class="btn" data-a="print">🖨️ Imprimir</button>
        ${canPay ? '<button class="btn success" data-a="pay">💵 Receber</button>' : ''}
        ${canCancel ? '<button class="btn danger" data-a="cancel">Cancelar pedido</button>' : ''}
        ${next ? `<button class="btn primary" data-a="next">${next[1]}</button>` : ''}</div>`,
  });
  m.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    try {
      if (a === 'print') await imprimirPedido(o, state.settings);
      if (a === 'next') { await api.post(`/orders/${id}/status`, { status: next[0] }); m.close(); onChange?.(); }
      if (a === 'cancel') {
        const reason = await promptDialog('Cancelar pedido', 'Motivo do cancelamento', { danger: true, ok: 'Cancelar pedido' });
        if (!reason) return;
        await api.post(`/orders/${id}/status`, { status: 'CANCELADO', reason });
        toast('Pedido cancelado; estoque devolvido'); m.close(); onChange?.();
      }
      if (a === 'pay') { m.close(); payModal(o, onChange); }
    } catch (err) { toast(err.message, 'err', 6000); }
  });
}

function payModal(o, onChange) {
  const methods = activeMethods();
  const m = modal({
    title: `Receber ${o.label} — falta ${money(o.remaining)}`,
    body: `<form class="form"><div class="pay-row" style="grid-template-columns:1fr 130px"><select name="method">${methods.map((x) => `<option value="${x.key}">${esc(x.label)}</option>`).join('')}</select>
      <input name="amount" inputmode="decimal" value="${String(o.remaining).replace('.', ',')}"></div>
      <p class="muted small">Para pagamento dividido, receba uma forma por vez.</p><button class="btn success lg">Confirmar recebimento</button></form>`,
  });
  m.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/orders/${o.id}/payments`, { payments: [{ method: e.target.method.value, amount: parseNum(e.target.amount.value) }] });
      toast('Pagamento registrado'); m.close(); onChange?.();
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ======================================================================
// Página: dashboard
// ======================================================================
// Página: dashboard
Pages.dashboard = (function () {
let timer;

async function render(el) {
  el.innerHTML = '<div id="dash"></div>';
  await load();
  timer = setInterval(load, 20000);
}
function destroy() { clearInterval(timer); }

const kpi = (label, value, cls = '') => `<div class="kpi ${cls}"><div class="label">${label}</div><div class="value">${value}</div></div>`;

function bars(items, valueKey, labelKey, fmt) {
  const max = Math.max(...items.map((i) => i[valueKey]), 1);
  return `<div class="bars">${items.map((i) => `<div class="bar"><span class="v">${fmt(i[valueKey])}</span><i style="height:${Math.round((i[valueKey] / max) * 100)}%"></i><span>${esc(i[labelKey])}</span></div>`).join('')}</div>`;
}

async function load() {
  let d;
  try { d = await api.get('/dashboard'); } catch { return; }
  const box = $('#dash'); if (!box) return;
  const isAdmin = state.user.role === 'ADMIN';
  const topMax = Math.max(...d.top.map((t) => t.qty), 1);
  box.innerHTML = `<div class="page-head"><h1>📊 Hoje</h1><span class="muted small">Atualiza automaticamente</span></div>
    <div class="kpis">
      ${kpi('Faturamento', money(d.revenue), 'brand')}${kpi('Pedidos', d.orders)}${kpi('Ticket médio', money(d.avg_ticket))}
      ${kpi('🔵 Em aberto', d.open, 'blue')}${kpi('🟡 Em preparo', d.preparing, 'yellow')}${kpi('🟢 Prontos', d.ready, 'green')}${kpi('🔴 Cancelados', d.cancelled, 'red')}
    </div>
    <div class="kpis">
      ${isAdmin ? kpi('Entradas', money(d.entries), 'green') + kpi('Saídas', money(d.exits), 'red') : ''}
      ${kpi('Saldo do caixa', d.cash.open ? money(d.cash.expected) : '<span class="muted" style="font-size:1rem">Caixa fechado</span>', d.cash.open ? 'green' : '')}
      ${d.cash.open ? kpi('Vendas no caixa', money(d.cash.sales_total)) : ''}
    </div>
    <div class="grid cols-2">
      <div class="card"><h2>Vendas por hora</h2>${d.hours.length ? bars(d.hours.map((h) => ({ ...h, label: `${h.hour}h` })), 'total', 'label', (v) => num(v, 0)) : '<div class="empty">Sem vendas hoje</div>'}</div>
      <div class="card"><h2>Últimos 7 dias</h2>${d.week.length ? bars(d.week.map((w) => ({ ...w, label: fmtDay(w.day).slice(0, 5) })), 'total', 'label', (v) => num(v, 0)) : '<div class="empty">Sem dados</div>'}</div>
      <div class="card"><h2>🏆 Mais vendidos hoje</h2>${d.top.length ? d.top.map((t) => `<div class="hbar"><span>${esc(t.name)}</span><div class="track"><div class="fill" style="width:${(t.qty / topMax) * 100}%"></div></div><b>${t.qty}</b></div>`).join('') : '<div class="empty">Sem vendas hoje</div>'}</div>
      <div class="card"><h2>⚠️ Estoque baixo</h2>${d.low_stock.length ? d.low_stock.map((s) => `<div class="alert ${s.quantity <= 0 ? 'err' : 'warn'}">${s.quantity <= 0 ? '🔴 Sem estoque' : '⚠️ Estoque baixo'}: ${esc(s.name)} — ${num(s.quantity)} ${s.unit} <span class="small">(mín. ${num(s.min_quantity)})</span></div>`).join('') : '<div class="empty">Tudo certo com o estoque ✅</div>'}</div>
    </div>`;
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Página: pdv
// ======================================================================
// Página: pdv
Pages.pdv = (function () {
// O carrinho sobrevive à navegação entre telas.
const cart = { items: [], customer: null, customerName: '', notes: '', discount: 0, discountMode: 'value' };
let products = []; let categories = []; let cat = 'all'; let term = ''; let cashOpen = true; let host;

const subtotal = () => cart.items.reduce((s, i) => s + i.price * i.qty, 0);
const discountValue = () => Math.min(subtotal(), Math.round((cart.discountMode === 'percent' ? subtotal() * cart.discount / 100 : cart.discount) * 100) / 100);
const total = () => Math.max(0, Math.round((subtotal() - discountValue()) * 100) / 100);

async function render(el) {
  host = el;
  [products, categories] = await Promise.all([api.get('/products'), api.get('/categories')]);
  categories = categories.filter((c) => c.active);
  cashOpen = !!(await api.get('/cash/current').catch(() => ({}))).register;
  el.innerHTML = `
    ${cashOpen ? '' : `<div class="alert warn">⚠️ Caixa fechado — você pode lançar pedidos, mas só receberá pagamentos após <a href="#/cash">abrir o caixa</a>.</div>`}
    <div class="pdv">
      <section class="pdv-products">
        <div class="row gap mb"><input id="q" class="search" style="max-width:none" placeholder="🔍 Buscar produto ou código…" autocomplete="off"></div>
        <div class="cats" id="cats"></div>
        <div class="prod-grid" id="grid"></div>
      </section>
      <aside class="card cart" id="cart"></aside>
    </div>`;
  $('#q').oninput = debounce((e) => { term = e.target.value.toLowerCase(); drawGrid(); }, 120);
  $('#grid').onclick = (e) => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    addItem(Number(b.dataset.add));
  };
  drawCats(); drawGrid(); drawCart();
}

function drawCats() {
  const tabs = [{ id: 'all', name: 'Todos' }, ...categories];
  $('#cats').innerHTML = tabs.map((c) => `<button class="tab ${String(c.id) === String(cat) ? 'active' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
  $('#cats').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; drawCats(); drawGrid(); };
}

function drawGrid() {
  const list = products.filter((p) => (cat === 'all' || String(p.category_id) === String(cat))
    && (!term || p.name.toLowerCase().includes(term) || (p.code || '').toLowerCase().includes(term)));
  $('#grid').innerHTML = list.length ? list.map((p) => {
    const out = p.track_stock && p.stock_qty <= 0;
    const low = p.track_stock && !out && p.stock_qty <= p.min_stock;
    return `<button class="prod ${out ? 'out' : ''}" data-add="${p.id}">
      <div class="ph">${p.photo ? `<img src="${p.photo}" alt="" loading="lazy">` : '🥟'}</div>
      <div class="info"><span class="name">${esc(p.name)}</span><span class="price">${money(p.price)}</span>
      ${out ? '<span class="flag">🔴 Sem estoque</span>' : low ? '<span class="flag low">⚠️ Estoque baixo</span>' : ''}</div></button>`;
  }).join('') : '<div class="empty" style="grid-column:1/-1">Nenhum produto encontrado</div>';
}

function addItem(id) {
  const p = products.find((x) => x.id === id);
  if (p.track_stock && p.stock_qty <= 0) toast(`${p.name}: sem estoque registrado`, 'warn');
  const ex = cart.items.find((i) => i.id === id && !i.notes);
  if (ex) ex.qty++; else cart.items.push({ id, name: p.name, price: p.price, qty: 1, notes: '' });
  drawCart();
}

function drawCart() {
  const sub = subtotal(); const disc = discountValue();
  $('#cart').innerHTML = `
    <div class="row between"><h2>🛒 Pedido</h2>${cart.items.length ? '<button class="btn sm danger" data-act="clear">Limpar</button>' : ''}</div>
    <div style="position:relative" class="mt">
      ${cart.customer
        ? `<div class="row between"><span>👤 <b>${esc(cart.customer.name)}</b> <span class="muted small">${esc(cart.customer.phone || '')}</span></span><button class="icon-btn" data-act="unset-customer">✕</button></div>`
        : `<input id="cust" placeholder="👤 Cliente (nome ou telefone) — opcional" value="${esc(cart.customerName)}" autocomplete="off">
           <div id="sug" class="suggest hidden"></div>`}
    </div>
    <div class="cart-items">${cart.items.length ? cart.items.map((i, idx) => `
      <div class="cart-line"><div><div class="name">${esc(i.name)}</div>
        <div class="small muted">${money(i.price)} un · <a href="#" data-act="note" data-i="${idx}">${i.notes ? '✏️ ' + esc(i.notes) : '+ observação'}</a></div></div>
        <div class="right"><b>${money(i.price * i.qty)}</b></div>
        <div class="qty"><button data-act="dec" data-i="${idx}">−</button><b>${i.qty}</b><button data-act="inc" data-i="${idx}">+</button></div>
        <div class="right"><button class="icon-btn" data-act="rm" data-i="${idx}" aria-label="Remover">🗑️</button></div></div>`).join('')
      : '<div class="empty">Toque nos produtos para adicionar</div>'}</div>
    <textarea id="onotes" rows="1" placeholder="Observação do pedido (ex.: sem cebola)">${esc(cart.notes)}</textarea>
    <div class="row gap mt"><input id="disc" inputmode="decimal" placeholder="Desconto" value="${cart.discount || ''}" style="flex:1">
      <select id="dmode" style="width:80px"><option value="value" ${cart.discountMode === 'value' ? 'selected' : ''}>R$</option><option value="percent" ${cart.discountMode === 'percent' ? 'selected' : ''}>%</option></select></div>
    <div class="totals mt"><div class="row between"><span>Subtotal</span><span>${money(sub)}</span></div>
      ${disc ? `<div class="row between"><span>Desconto</span><span>− ${money(disc)}</span></div>` : ''}
      <div class="row between grand"><span>Total</span><span>${money(total())}</span></div></div>
    <button class="btn primary lg mt" data-act="checkout" ${cart.items.length ? '' : 'disabled'}>Finalizar pedido</button>`;
  bindCart();
}

function bindCart() {
  const c = $('#cart');
  c.onclick = (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.preventDefault();
    const i = Number(b.dataset.i);
    switch (b.dataset.act) {
      case 'inc': cart.items[i].qty++; break;
      case 'dec': if (--cart.items[i].qty <= 0) cart.items.splice(i, 1); break;
      case 'rm': cart.items.splice(i, 1); break;
      case 'clear': Object.assign(cart, { items: [], customer: null, customerName: '', notes: '', discount: 0 }); break;
      case 'unset-customer': cart.customer = null; break;
      case 'note': return itemNote(i);
      case 'checkout': return checkout();
    }
    drawCart();
  };
  $('#onotes').onchange = (e) => { cart.notes = e.target.value; };
  $('#disc').oninput = (e) => { cart.discount = parseNum(e.target.value); refreshTotals(); };
  $('#dmode').onchange = (e) => { cart.discountMode = e.target.value; drawCart(); };
  const cust = $('#cust');
  if (cust) {
    cust.oninput = debounce(async () => {
      cart.customerName = cust.value;
      const sug = $('#sug');
      if (cust.value.trim().length < 2) return sug.classList.add('hidden');
      const list = (await api.get('/customers' + qs({ q: cust.value.trim() })).catch(() => [])).slice(0, 6);
      sug.innerHTML = list.map((x) => `<div data-id="${x.id}">${esc(x.name)} <span class="muted small">${esc(x.phone || '')}</span></div>`).join('')
        + `<div data-new="1">➕ Cadastrar “${esc(cust.value.trim())}”</div>`;
      sug.classList.remove('hidden');
      sug.onclick = async (e) => {
        const d = e.target.closest('div[data-id],div[data-new]'); if (!d) return;
        if (d.dataset.id) cart.customer = list.find((x) => x.id === Number(d.dataset.id));
        else cart.customer = await newCustomer(cust.value.trim());
        drawCart();
      };
    }, 200);
  }
}

function refreshTotals() {
  const t = $('#cart .totals'); if (!t) return;
  const disc = discountValue();
  t.innerHTML = `<div class="row between"><span>Subtotal</span><span>${money(subtotal())}</span></div>
    ${disc ? `<div class="row between"><span>Desconto</span><span>− ${money(disc)}</span></div>` : ''}
    <div class="row between grand"><span>Total</span><span>${money(total())}</span></div>`;
}

function itemNote(i) {
  const m = modal({
    title: cart.items[i].name,
    body: `<form class="form"><label>Observação do item<input name="n" value="${esc(cart.items[i].notes)}" placeholder="Ex.: sem cebola, bem passado" maxlength="200"></label>
      <button class="btn primary">Salvar</button></form>`,
  });
  m.el.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    cart.items[i].notes = e.target.n.value.trim(); m.close(); drawCart();
  };
}

async function newCustomer(name) {
  return new Promise((resolve) => {
    const m = modal({
      title: 'Novo cliente',
      body: `<form class="form"><label>Nome<input name="name" value="${esc(name)}" required></label>
        <label>Telefone<input name="phone" inputmode="tel"></label><label>Endereço<input name="address"></label>
        <button class="btn primary">Cadastrar</button></form>`,
    });
    m.el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try { const c = await api.post('/customers', { name: f.name.value, phone: f.phone.value, address: f.address.value }); m.close(); resolve(c); }
      catch (err) { toast(err.message, 'err'); }
    };
  });
}

function checkout() {
  const methods = activeMethods();
  const T = total();
  let rows = [];
  const m = modal({ title: `Pagamento — ${money(T)}`, body: '<div id="payb"></div>' });
  const body = m.el.querySelector('#payb');
  const paid = () => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;

  const draw = () => {
    const rest = Math.round((T - paid()) * 100) / 100;
    const change = rows.some((r) => r.method === 'DINHEIRO') && rest < 0 ? -rest : 0;
    body.innerHTML = `
      <div class="pay-methods mb">${methods.map((x) => `<button class="btn lg" data-m="${x.key}">${esc(x.label)}</button>`).join('')}</div>
      ${rows.map((r, i) => `<div class="pay-row"><select data-i="${i}" data-f="method">${methods.map((x) => `<option value="${x.key}" ${x.key === r.method ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
        <input data-i="${i}" data-f="amount" inputmode="decimal" value="${String(r.amount).replace('.', ',')}"><button class="icon-btn" data-rm="${i}">🗑️</button></div>`).join('')}
      <div class="totals mt"><div class="row between"><span>Pago</span><b>${money(paid())}</b></div>
        <div class="row between"><span>${rest > 0 ? 'Falta' : 'Restante'}</span><b style="color:${rest > 0 ? 'var(--red)' : 'var(--green)'}">${money(Math.max(rest, 0))}</b></div>
        ${change ? `<div class="row between"><span>Troco</span><b>${money(change)}</b></div>` : ''}</div>
      <div class="row gap mt"><button class="btn" data-later>Pagar depois</button>
        <button class="btn success lg" style="flex:1" data-ok ${rows.length && rest <= 0 ? '' : 'disabled'}>Confirmar pedido</button></div>
      ${!cashOpen ? '<p class="small" style="color:var(--red)">Caixa fechado: abra o caixa para registrar pagamentos.</p>' : ''}`;
  };
  draw();

  body.onclick = (e) => {
    const mb = e.target.closest('[data-m]');
    if (mb) { const rest = Math.max(0, Math.round((T - paid()) * 100) / 100); rows.push({ method: mb.dataset.m, amount: rest || 0 }); draw(); }
    const rm = e.target.closest('[data-rm]');
    if (rm) { rows.splice(Number(rm.dataset.rm), 1); draw(); }
    if (e.target.closest('[data-later]')) submit([]);
    if (e.target.closest('[data-ok]')) submit(rows.filter((r) => r.amount > 0));
  };
  body.onchange = (e) => {
    const t = e.target; if (t.dataset.i === undefined) return;
    const r = rows[Number(t.dataset.i)];
    if (t.dataset.f === 'method') r.method = t.value; else r.amount = parseNum(t.value);
    draw();
  };

  async function submit(payments) {
    $$('button', body).forEach((b) => { b.disabled = true; });
    try {
      const order = await api.post('/orders', {
        customer_id: cart.customer?.id, customer_name: cart.customer ? undefined : cart.customerName || undefined,
        items: cart.items.map((i) => ({ product_id: i.id, quantity: i.qty, notes: i.notes || undefined })),
        notes: cart.notes || undefined, discount: discountValue(), payments,
      });
      m.close();
      Object.assign(cart, { items: [], customer: null, customerName: '', notes: '', discount: 0 });
      products = await api.get('/products');
      drawGrid(); drawCart();
      done(order);
    } catch (e) {
      toast(e.message, 'err'); draw();
    }
  }
}

function done(order) {
  const pr = state.settings.printer;
  if (pr.auto_print_kitchen) imprimirPedido(order, state.settings).catch((e) => toast(e.message, 'err', 6000));
  const m = modal({
    title: 'Pedido registrado ✅',
    body: `<div class="center"><div style="font-size:3rem;font-weight:800">${esc(order.label)}</div>
      <p>${money(order.total)} · ${order.remaining > 0 ? `<b style="color:var(--red)">a receber ${money(order.remaining)}</b>` : '<b style="color:var(--green)">pago</b>'}</p>
      <div class="row gap" style="justify-content:center"><button class="btn lg" data-print>🖨️ Imprimir comanda</button><button class="btn primary lg" data-close>Novo pedido</button></div></div>`,
  });
  m.el.querySelector('[data-print]').onclick = () => imprimirPedido(order, state.settings).catch((e) => toast(e.message, 'err', 6000));
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Página: orders
// ======================================================================
// Página: orders
Pages.orders = (function () {
let timer; let status = ''; let search = ''; let date = '';

async function render(el) {
  el.innerHTML = `<div class="page-head"><h1>🧾 Pedidos</h1>
    <div class="row gap wrap"><input id="q" class="search" placeholder="🔍 Nº do pedido ou cliente" value="${esc(search)}">
    <input type="date" id="date" value="${date}" style="width:auto" title="Filtrar por dia"></div></div>
    <div class="tabs" id="tabs">${[['', 'Todos'], ['NOVO', 'Novos'], ['CONFIRMADO', 'Confirmados'], ['EM_PREPARO', 'Em preparo'], ['PRONTO', 'Prontos'], ['ENTREGUE', 'Entregues'], ['CANCELADO', 'Cancelados']]
      .map(([k, l]) => `<button class="tab ${k === status ? 'active' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
    <div id="list"></div>`;
  $('#tabs').onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; status = b.dataset.s; $('#tabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b)); load(); };
  $('#q').oninput = debounce((e) => { search = e.target.value; load(); });
  $('#date').onchange = (e) => { date = e.target.value; load(); };
  $('#list').onclick = (e) => { const tr = e.target.closest('[data-id]'); if (tr) openOrder(Number(tr.dataset.id), load); };
  await load();
  timer = setInterval(load, 10000);
}
function destroy() { clearInterval(timer); }

async function load() {
  const range = date ? { period: 'custom', from: date, to: date } : {};
  let rows;
  try { rows = await api.get('/orders' + qs({ status, q: search, limit: 200, ...range })); } catch { return; }
  const list = $('#list'); if (!list) return;
  list.innerHTML = rows.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Pedido</th><th>Horário</th><th>Cliente</th><th>Itens</th><th>Obs.</th><th>Pagamento</th><th class="num">Valor</th><th>Status</th></tr></thead>
    <tbody>${rows.map((o) => `<tr class="clickable" data-id="${o.id}"><td><b>${esc(o.label)}</b></td>
      <td>${fmtTime(o.created_at)}<br><span class="small muted">${fmtDate(o.created_at)}</span></td><td>${esc(o.customer || '—')}</td>
      <td class="small">${o.items.map((i) => `${i.quantity}x ${esc(i.name)}`).join('<br>')}</td><td class="small">${esc(o.notes || '')}</td>
      <td class="small">${o.status === 'CANCELADO' ? '—' : o.remaining > 0 ? `<span class="badge red">A receber ${money(o.remaining)}</span>` : [...new Set(o.payments.map((p) => methodLabel(p.method)))].join(' + ') || '—'}</td>
      <td class="num"><b>${money(o.total)}</b></td><td>${statusBadge(o.status)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty card">Nenhum pedido encontrado</div>';
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Página: kitchen
// ======================================================================
// Página: kitchen
Pages.kitchen = (function () {
const NEXT = {
  NOVO: ['CONFIRMADO', '✅ Aceitar pedido', 'primary'],
  CONFIRMADO: ['EM_PREPARO', '🔥 Iniciar preparo', 'primary'],
  EM_PREPARO: ['PRONTO', '🟢 Marcar como pronto', 'success'],
  PRONTO: ['ENTREGUE', '📦 Entregue', ''],
};
const POLL_MS = 6000;

let timer; let known = null; let orders = []; let host;
const autoPrint = () => localStorage.getItem('pastelaria.kitchenAutoPrint') === '1';

async function render(el) {
  host = el; known = null;
  el.innerHTML = `<div class="page-head"><h1>👨‍🍳 Cozinha</h1>
    <div class="row gap wrap"><label class="check"><input type="checkbox" id="auto" ${autoPrint() ? 'checked' : ''}> Imprimir novos pedidos automaticamente neste computador</label>
    <span class="badge green" id="live">● ao vivo</span></div></div>
    <div id="board" class="kitchen"></div>`;
  $('#auto').onchange = (e) => localStorage.setItem('pastelaria.kitchenAutoPrint', e.target.checked ? '1' : '0');
  $('#board').onclick = onClick;
  await poll();
  timer = setInterval(poll, POLL_MS);
}

function destroy() { clearInterval(timer); }

async function poll() {
  try {
    orders = (await api.get('/kitchen')).sort((a, b) => a.id - b.id);
    $('#live') && ($('#live').className = 'badge green', $('#live').textContent = '● ao vivo');
  } catch (e) {
    if ($('#live')) { $('#live').className = 'badge red'; $('#live').textContent = '● sem conexão'; }
    return;
  }
  if (!$('#board')) return;
  const fresh = known ? orders.filter((o) => !known.has(o.id)) : [];
  known = new Set(orders.map((o) => o.id));
  if (fresh.length) {
    beep(); toast(`Novo pedido ${fresh.map((o) => o.label).join(', ')}`, 'ok');
    if (autoPrint()) for (const o of fresh) imprimirPedido(o, state.settings).catch((e) => toast(e.message, 'err', 6000));
  }
  draw();
}

function draw() {
  const board = $('#board');
  board.innerHTML = orders.length ? orders.map((o) => {
    const mins = sinceMin(o.created_at);
    const next = NEXT[o.status];
    return `<article class="ticket ${o.status} ${mins >= 20 && o.status !== 'PRONTO' ? 'late' : ''}">
      <div class="ticket-head"><span class="n">PEDIDO ${esc(o.label)}</span><span class="muted small">${fmtTime(o.created_at)} · ${mins} min</span></div>
      <div style="padding:0 14px">${statusBadge(o.status)} ${o.customer ? `<span class="small muted">👤 ${esc(o.customer)}</span>` : ''}</div>
      <ul>${o.items.map((i) => `<li>${i.quantity}x ${esc(i.name)}${i.notes ? `<small>↳ ${esc(i.notes)}</small>` : ''}</li>`).join('')}</ul>
      ${o.notes ? `<div class="obs">OBS: ${esc(o.notes)}</div>` : ''}
      <div class="ticket-actions">
        ${next ? `<button class="btn lg ${next[2]}" data-id="${o.id}" data-st="${next[0]}">${next[1]}</button>` : ''}
        <button class="btn sm" data-print="${o.id}">🖨️ Imprimir</button></div></article>`;
  }).join('') : '<div class="empty card" style="grid-column:1/-1">Nenhum pedido em andamento 🎉</div>';
}

async function onClick(e) {
  const pr = e.target.closest('[data-print]');
  if (pr) {
    const o = orders.find((x) => x.id === Number(pr.dataset.print));
    return imprimirPedido(o, state.settings).catch((err) => toast(err.message, 'err', 6000));
  }
  const b = e.target.closest('[data-st]'); if (!b) return;
  b.disabled = true;
  try {
    await api.post(`/orders/${b.dataset.id}/status`, { status: b.dataset.st });
    await poll();
  } catch (err) { toast(err.message, 'err'); b.disabled = false; }
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Página: products
// ======================================================================
// Página: products
Pages.products = (function () {
let tab = 'products'; let products = []; let categories = []; let ingredients = [];

async function render(el) {
  el.innerHTML = `<div class="page-head"><h1>🥟 Produtos</h1><button class="btn primary" id="new"></button></div>
    <div class="tabs"><button class="tab" data-t="products">Produtos</button><button class="tab" data-t="categories">Categorias</button><button class="tab" data-t="ingredients">Ingredientes</button></div><div id="c"></div>`;
  el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
  $('#new').onclick = () => ({ products: productForm, categories: categoryForm, ingredients: ingredientForm })[tab]();
  await draw();
}

async function draw() {
  document.querySelectorAll('.tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.t === tab));
  $('#new').textContent = { products: '+ Novo produto', categories: '+ Nova categoria', ingredients: '+ Novo ingrediente' }[tab];
  [products, categories, ingredients] = await Promise.all([api.get('/products?all=1'), api.get('/categories'), api.get('/ingredients')]);
  const c = $('#c');
  if (tab === 'products') {
    c.innerHTML = `<div class="table-wrap"><table><thead><tr><th></th><th>Código</th><th>Produto</th><th>Categoria</th><th class="num">Preço</th><th class="num">Custo</th><th>Estoque</th><th>Status</th><th></th></tr></thead><tbody>
      ${products.map((p) => `<tr style="${p.active ? '' : 'opacity:.55'}"><td>${p.photo ? `<img class="thumb" src="${p.photo}" alt="">` : '<span class="thumb">🥟</span>'}</td>
        <td class="small">${esc(p.code || '')}</td><td><b>${esc(p.name)}</b><br><span class="small muted">${esc(p.description || '')}</span></td><td>${esc(p.category || '—')}</td>
        <td class="num">${money(p.price)}</td><td class="num">${p.cost ? money(p.cost) : '<span class="muted">auto</span>'}</td>
        <td class="small">${p.has_recipe ? '📋 Ficha técnica' : p.track_stock ? `${num(p.stock_qty)} <span class="muted">(mín ${num(p.min_stock)})</span>` : '—'}</td>
        <td>${p.active ? '<span class="badge green">Ativo</span>' : '<span class="badge gray">Inativo</span>'}</td>
        <td class="num"><button class="btn sm" data-edit="${p.id}">Editar</button> <button class="btn sm" data-recipe="${p.id}">Ficha técnica</button> <button class="btn sm danger" data-del="${p.id}">✕</button></td></tr>`).join('')}</tbody></table></div>`;
    c.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.edit) productForm(products.find((p) => p.id === Number(b.dataset.edit)));
      if (b.dataset.recipe) recipeForm(Number(b.dataset.recipe));
      if (b.dataset.del && await confirmDialog('Excluir este produto? Se já tiver vendas, ele será apenas desativado.', { danger: true, ok: 'Excluir' })) {
        try { const r = await api.del(`/products/${b.dataset.del}`); toast(r.deactivated ? 'Produto desativado (possui histórico)' : 'Produto excluído'); draw(); } catch (err) { toast(err.message, 'err'); }
      }
    };
  } else if (tab === 'categories') {
    c.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Ordem</th><th>Status</th><th></th></tr></thead><tbody>
      ${categories.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${x.sort_order}</td><td>${x.active ? '<span class="badge green">Ativa</span>' : '<span class="badge gray">Inativa</span>'}</td>
        <td class="num"><button class="btn sm" data-edit="${x.id}">Editar</button> <button class="btn sm danger" data-del="${x.id}">✕</button></td></tr>`).join('')}</tbody></table></div>`;
    c.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.edit) categoryForm(categories.find((x) => x.id === Number(b.dataset.edit)));
      if (b.dataset.del && await confirmDialog('Excluir categoria?', { danger: true })) {
        try { await api.del(`/categories/${b.dataset.del}`); draw(); } catch (err) { toast(err.message, 'err'); }
      }
    };
  } else {
    c.innerHTML = `<p class="muted">Ingredientes são usados nas fichas técnicas. O estoque deles é movimentado na tela de Estoque.</p><div class="table-wrap"><table><thead><tr><th>Ingrediente</th><th>Unidade</th><th class="num">Custo/unid.</th><th class="num">Estoque</th><th class="num">Mínimo</th><th></th></tr></thead><tbody>
      ${ingredients.map((x) => `<tr style="${x.active ? '' : 'opacity:.55'}"><td><b>${esc(x.name)}</b></td><td>${x.unit}</td><td class="num">${money(x.cost)}</td><td class="num">${num(x.quantity)}</td><td class="num">${num(x.min_quantity)}</td>
        <td class="num"><button class="btn sm" data-edit="${x.id}">Editar</button> <button class="btn sm danger" data-del="${x.id}">✕</button></td></tr>`).join('')}</tbody></table></div>`;
    c.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.edit) ingredientForm(ingredients.find((x) => x.id === Number(b.dataset.edit)));
      if (b.dataset.del && await confirmDialog('Excluir ingrediente?', { danger: true })) {
        try { await api.del(`/ingredients/${b.dataset.del}`); draw(); } catch (err) { toast(err.message, 'err'); }
      }
    };
  }
}

function productForm(p) {
  let photo; // undefined = manter
  const m = modal({
    title: p ? 'Editar produto' : 'Novo produto',
    body: `<form class="form">
      <div class="two"><label>Nome<input name="name" required maxlength="120" value="${esc(p?.name)}"></label><label>Código<input name="code" maxlength="30" value="${esc(p?.code)}"></label></div>
      <label>Descrição<input name="description" maxlength="500" value="${esc(p?.description)}"></label>
      <div class="two"><label>Categoria<select name="category_id"><option value="">—</option>${categories.filter((c) => c.active || c.id === p?.category_id).map((c) => `<option value="${c.id}" ${c.id === p?.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>Preço de venda R$<input name="price" inputmode="decimal" required value="${p ? String(p.price).replace('.', ',') : ''}"></label></div>
      <div class="two"><label>Custo R$ <span class="muted small">(vazio = calcula pela ficha técnica)</span><input name="cost" inputmode="decimal" value="${p?.cost ? String(p.cost).replace('.', ',') : ''}"></label>
        <label>Foto<input type="file" name="photo" accept="image/*"></label></div>
      <label class="check"><input type="checkbox" name="track_stock" ${p?.track_stock ? 'checked' : ''}> Controlar estoque deste produto (ex.: bebidas). Produtos com ficha técnica descontam ingredientes.</label>
      <div class="two" id="stk" style="${p?.track_stock ? '' : 'display:none'}">
        ${p ? '' : `<label>Estoque inicial<input name="stock_qty" inputmode="decimal" value="0"></label>`}
        <label>Estoque mínimo<input name="min_stock" inputmode="decimal" value="${p?.min_stock ?? 0}"></label></div>
      <label class="check"><input type="checkbox" name="active" ${!p || p.active ? 'checked' : ''}> Ativo (aparece no PDV)</label>
      <button class="btn primary">Salvar</button></form>`,
  });
  const f = m.el.querySelector('form');
  f.track_stock.onchange = () => { $('#stk', m.el).style.display = f.track_stock.checked ? '' : 'none'; };
  f.photo.onchange = async () => { if (f.photo.files[0]) try { photo = await imageToDataUrl(f.photo.files[0]); } catch (e) { toast(e.message, 'err'); } };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = {
      name: f.name.value, code: f.code.value, description: f.description.value, category_id: f.category_id.value || null,
      price: parseNum(f.price.value), cost: parseNum(f.cost.value), track_stock: f.track_stock.checked, active: f.active.checked,
      min_stock: parseNum(f.min_stock.value), stock_qty: f.stock_qty ? parseNum(f.stock_qty.value) : undefined,
    };
    if (photo !== undefined) body.photo = photo;
    try { p ? await api.put(`/products/${p.id}`, body) : await api.post('/products', body); toast('Produto salvo'); m.close(); draw(); }
    catch (err) { toast(err.message, 'err'); }
  };
}

async function recipeForm(id) {
  const p = await api.get(`/products/${id}`);
  const rows = p.recipe.map((r) => ({ ingredient_id: r.ingredient_id, quantity: r.quantity }));
  const m = modal({ title: `Ficha técnica — ${p.name}`, wide: true, body: '<div id="rb"></div>' });
  const body = m.el.querySelector('#rb');
  const cost = () => rows.reduce((s, r) => s + (ingredients.find((i) => i.id === r.ingredient_id)?.cost || 0) * r.quantity, 0);
  const draw2 = () => {
    body.innerHTML = `<p class="muted small">Ao vender 1 unidade, os ingredientes abaixo são descontados do estoque automaticamente.</p>
      ${rows.map((r, i) => {
        const ing = ingredients.find((x) => x.id === r.ingredient_id);
        return `<div class="pay-row" style="grid-template-columns:1fr 130px 40px 40px"><select data-i="${i}" data-f="ing">${ingredients.filter((x) => x.active).map((x) => `<option value="${x.id}" ${x.id === r.ingredient_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          <input data-i="${i}" data-f="qty" inputmode="decimal" value="${String(r.quantity).replace('.', ',')}"><span class="muted" style="align-self:center">${ing?.unit || ''}</span><button class="icon-btn" data-rm="${i}">🗑️</button></div>`;
      }).join('')}
      <button class="btn sm" data-add>+ Ingrediente</button>
      <div class="row between mt"><span>Custo estimado da receita: <b>${money(cost())}</b> · margem sobre o preço: <b>${p.price ? Math.round((1 - cost() / p.price) * 100) : 0}%</b></span><button class="btn primary" data-save>Salvar ficha</button></div>`;
  };
  draw2();
  body.onclick = async (e) => {
    if (e.target.closest('[data-add]')) { const first = ingredients.find((x) => x.active && !rows.some((r) => r.ingredient_id === x.id)); if (!first) return toast('Sem mais ingredientes cadastrados', 'warn'); rows.push({ ingredient_id: first.id, quantity: 1 }); draw2(); }
    const rm = e.target.closest('[data-rm]'); if (rm) { rows.splice(Number(rm.dataset.rm), 1); draw2(); }
    if (e.target.closest('[data-save]')) {
      try { await api.put(`/products/${id}/recipe`, { items: rows }); toast('Ficha técnica salva'); m.close(); draw(); } catch (err) { toast(err.message, 'err'); }
    }
  };
  body.onchange = (e) => {
    const t = e.target; const r = rows[Number(t.dataset.i)]; if (!r) return;
    if (t.dataset.f === 'ing') r.ingredient_id = Number(t.value); else r.quantity = parseNum(t.value);
    draw2();
  };
}

function categoryForm(c) {
  const m = modal({
    title: c ? 'Editar categoria' : 'Nova categoria',
    body: `<form class="form"><label>Nome<input name="name" required maxlength="60" value="${esc(c?.name)}"></label>
      <label>Ordem<input name="o" type="number" value="${c?.sort_order ?? 0}"></label>
      <label class="check"><input type="checkbox" name="a" ${!c || c.active ? 'checked' : ''}> Ativa</label><button class="btn primary">Salvar</button></form>`,
  });
  m.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    const body = { name: f.name.value, sort_order: Number(f.o.value), active: f.a.checked };
    try { c ? await api.put(`/categories/${c.id}`, body) : await api.post('/categories', body); m.close(); draw(); } catch (err) { toast(err.message, 'err'); }
  };
}

function ingredientForm(x) {
  const m = modal({
    title: x ? 'Editar ingrediente' : 'Novo ingrediente',
    body: `<form class="form"><label>Nome<input name="name" required maxlength="80" value="${esc(x?.name)}"></label>
      <div class="two"><label>Unidade<select name="unit">${['un', 'g', 'kg', 'ml', 'l'].map((u) => `<option ${u === x?.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label>Custo por unidade R$<input name="cost" inputmode="decimal" value="${x ? String(x.cost).replace('.', ',') : ''}"></label></div>
      <label>Estoque mínimo<input name="min" inputmode="decimal" value="${x?.min_quantity ?? 0}"></label>
      <label class="check"><input type="checkbox" name="a" ${!x || x.active ? 'checked' : ''}> Ativo</label><button class="btn primary">Salvar</button></form>`,
  });
  m.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    const body = { name: f.name.value, unit: f.unit.value, cost: parseNum(f.cost.value), min_quantity: parseNum(f.min.value), active: f.a.checked };
    try { x ? await api.put(`/ingredients/${x.id}`, body) : await api.post('/ingredients', body); m.close(); draw(); } catch (err) { toast(err.message, 'err'); }
  };
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Página: stock
// ======================================================================
// Página: stock
Pages.stock = (function () {
const TYPES = {
  ENTRADA: 'Entrada', SAIDA: 'Saída manual', PERDA: 'Perda', VENCIMENTO: 'Vencimento', AJUSTE: 'Ajuste (nova quantidade)', INVENTARIO: 'Inventário (contagem)',
};
const MOV_LABEL = { ...TYPES, VENDA: 'Venda', DEVOLUCAO: 'Devolução (cancelamento)' };
let tab = 'items'; let items = [];

async function render(el) {
  el.innerHTML = `<div class="page-head"><h1>📦 Estoque</h1><button class="btn primary" id="mov">+ Movimentar</button></div>
    <div class="tabs"><button class="tab" data-t="items">Saldos</button><button class="tab" data-t="history">Histórico de movimentações</button></div><div id="c"></div>`;
  el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
  $('#mov').onclick = () => movement();
  await draw();
}

async function draw() {
  document.querySelectorAll('.tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.t === tab));
  const c = $('#c');
  if (tab === 'items') {
    items = await api.get('/stock');
    const low = items.filter((i) => i.quantity > 0 && i.quantity <= i.min_quantity).length;
    const out = items.filter((i) => i.quantity <= 0).length;
    c.innerHTML = `${out ? `<div class="alert err">🔴 ${out} item(ns) sem estoque</div>` : ''}${low ? `<div class="alert warn">⚠️ ${low} item(ns) com estoque baixo</div>` : ''}
      <div class="table-wrap"><table><thead><tr><th>Item</th><th>Tipo</th><th class="num">Quantidade</th><th class="num">Mínimo</th><th>Situação</th><th></th></tr></thead><tbody>
      ${items.map((i, idx) => `<tr><td><b>${esc(i.name)}</b></td><td class="small">${i.item_type === 'product' ? 'Produto' : 'Ingrediente'}</td>
        <td class="num">${num(i.quantity)} ${i.unit}</td><td class="num">${num(i.min_quantity)}</td>
        <td>${i.quantity <= 0 ? '<span class="stock-flag out">🔴 Sem estoque</span>' : i.quantity <= i.min_quantity ? '<span class="stock-flag low">⚠️ Estoque baixo</span>' : '<span class="badge green">OK</span>'}</td>
        <td class="num"><button class="btn sm" data-i="${idx}">Movimentar</button></td></tr>`).join('')}</tbody></table></div>`;
    c.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) movement(items[Number(b.dataset.i)]); };
  } else {
    const rows = await api.get('/stock/movements' + qs({ limit: 300 }));
    c.onclick = null;
    c.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Data/hora</th><th>Item</th><th>Tipo</th><th class="num">Qtd.</th><th class="num">Saldo</th><th>Motivo</th><th>Usuário</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="small">${fmtDateTime(r.created_at)}</td><td>${esc(r.item_name)}</td><td>${MOV_LABEL[r.type] || r.type}</td>
        <td class="num" style="color:${r.quantity < 0 ? 'var(--red)' : 'var(--green)'}">${r.quantity > 0 ? '+' : ''}${num(r.quantity)} ${r.unit}</td>
        <td class="num">${num(r.balance_after)}</td><td class="small">${esc(r.reason || '')}</td><td class="small">${esc(r.user_name || '—')}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty card">Sem movimentações</div>';
  }
}

function movement(item) {
  const isAdmin = state.user.role === 'ADMIN';
  const types = Object.entries(TYPES).filter(([k]) => isAdmin || !['AJUSTE', 'INVENTARIO'].includes(k));
  const m = modal({
    title: 'Movimentação de estoque',
    body: `<form class="form">
      <label>Item<select name="item" required>${items.map((i, idx) => `<option value="${idx}" ${item && i.item_id === item.item_id && i.item_type === item.item_type ? 'selected' : ''}>${esc(i.name)} (${num(i.quantity)} ${i.unit})</option>`).join('')}</select></label>
      <div class="two"><label>Tipo<select name="type">${types.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label><span id="ql">Quantidade</span><input name="quantity" inputmode="decimal" required></label></div>
      <label>Motivo<input name="reason" maxlength="200" placeholder="Ex.: compra do fornecedor, quebra, vencido…"></label>
      <button class="btn primary">Registrar</button></form>`,
  });
  const f = m.el.querySelector('form');
  f.type.onchange = () => { m.el.querySelector('#ql').textContent = ['AJUSTE', 'INVENTARIO'].includes(f.type.value) ? 'Quantidade contada (nova)' : 'Quantidade'; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const it = items[Number(f.item.value)];
    try {
      await api.post('/stock/movements', { item_type: it.item_type, item_id: it.item_id, type: f.type.value, quantity: parseNum(f.quantity.value), reason: f.reason.value });
      toast('Movimentação registrada'); m.close(); draw();
    } catch (err) { toast(err.message, 'err'); }
  };
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Página: cash
// ======================================================================
// Página: cash
Pages.cash = (function () {
const MOV = { VENDA: '🟢 Venda', ENTRADA: '➕ Entrada', SANGRIA: '🔻 Sangria', DESPESA: '🧾 Despesa', RETIRADA: '↗️ Retirada', ESTORNO: '↩️ Estorno' };
const NEG = ['SANGRIA', 'DESPESA', 'RETIRADA', 'ESTORNO'];

async function render(el) {
  el.innerHTML = '<div id="c"></div>';
  await draw();
}

async function draw() {
  const [cur, hist] = await Promise.all([api.get('/cash/current'), api.get('/cash/history')]);
  const c = $('#c');
  const closed = hist.filter((r) => r.status === 'FECHADO');
  let html = '';
  if (!cur.register) {
    html += `<div class="page-head"><h1>💵 Caixa</h1></div><div class="card center"><p class="muted">Nenhum caixa aberto.</p><button class="btn primary lg" id="open">Abrir caixa</button></div>`;
  } else {
    const s = cur.summary;
    html += `<div class="page-head"><h1>💵 Caixa aberto</h1><div class="row gap wrap">
      <button class="btn" data-mv="ENTRADA">+ Entrada</button><button class="btn" data-mv="DESPESA">Despesa</button>
      <button class="btn" data-mv="SANGRIA">Sangria</button><button class="btn" data-mv="RETIRADA">Retirada</button>
      <button class="btn danger solid" id="close">Fechar caixa</button></div></div>
      <p class="muted">Aberto em ${fmtDateTime(cur.register.opened_at)} por ${esc(cur.register.opened_by_name || '')}</p>
      <div class="kpis"><div class="kpi"><div class="label">Valor inicial</div><div class="value">${money(s.initial)}</div></div>
        <div class="kpi green"><div class="label">Vendas (total)</div><div class="value">${money(s.sales_total)}</div></div>
        <div class="kpi"><div class="label">Vendas em dinheiro</div><div class="value">${money(s.cash_sales)}</div></div>
        <div class="kpi red"><div class="label">Saídas (desp. + sangria + retirada)</div><div class="value">${money(s.expenses + s.sangrias + s.withdrawals)}</div></div>
        <div class="kpi brand"><div class="label">Dinheiro esperado</div><div class="value">${money(s.expected)}</div></div></div>
      <div class="card mb"><b>Vendas por forma de pagamento:</b> ${Object.entries(s.sales).map(([k, v]) => `<span class="badge gray">${esc(methodLabel(k))}: ${money(v)}</span>`).join(' ') || '<span class="muted">—</span>'}</div>
      <div class="table-wrap"><table><thead><tr><th>Hora</th><th>Tipo</th><th>Descrição</th><th>Forma</th><th>Usuário</th><th class="num">Valor</th></tr></thead><tbody>
      ${cur.movements.map((m) => `<tr><td class="small">${fmtDateTime(m.created_at)}</td><td>${MOV[m.type]}</td><td>${esc(m.description || '')}</td><td>${esc(methodLabel(m.method))}</td><td class="small">${esc(m.user_name || '')}</td>
        <td class="num" style="color:${NEG.includes(m.type) ? 'var(--red)' : 'var(--green)'}">${NEG.includes(m.type) ? '−' : '+'} ${money(m.amount)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sem movimentações</td></tr>'}</tbody></table></div>`;
  }
  html += `<h2 class="mt">Histórico de aberturas e fechamentos</h2>
    <div class="table-wrap mt"><table><thead><tr><th>Abertura</th><th>Fechamento</th><th>Operador</th><th class="num">Inicial</th><th class="num">Esperado</th><th class="num">Informado</th><th class="num">Diferença</th><th>Obs.</th></tr></thead><tbody>
    ${closed.map((r) => `<tr><td class="small">${fmtDateTime(r.opened_at)}</td><td class="small">${fmtDateTime(r.closed_at)}</td><td class="small">${esc(r.opened_by_name || '')}${r.closed_by_name && r.closed_by_name !== r.opened_by_name ? ' / ' + esc(r.closed_by_name) : ''}</td>
      <td class="num">${money(r.initial_amount)}</td><td class="num">${money(r.expected_amount)}</td><td class="num">${money(r.informed_amount)}</td>
      <td class="num" style="color:${r.difference < 0 ? 'var(--red)' : r.difference > 0 ? 'var(--green)' : 'inherit'}"><b>${money(r.difference)}</b></td><td class="small">${esc(r.notes || '')}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Nenhum fechamento ainda</td></tr>'}</tbody></table></div>`;
  c.innerHTML = html;

  $('#open')?.addEventListener('click', openCash);
  $('#close')?.addEventListener('click', () => closeCash(cur.summary.expected));
  c.querySelectorAll('[data-mv]').forEach((b) => { b.onclick = () => movement(b.dataset.mv); });
}

function openCash() {
  const m = modal({ title: 'Abrir caixa', body: `<form class="form"><label>Valor inicial (troco) R$<input name="v" inputmode="decimal" value="0" required></label><button class="btn primary">Abrir</button></form>` });
  m.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    try { await api.post('/cash/open', { initial_amount: parseNum(e.target.v.value) }); toast('Caixa aberto'); m.close(); draw(); } catch (err) { toast(err.message, 'err'); }
  };
}

function movement(type) {
  const titles = { ENTRADA: 'Entrada de dinheiro', DESPESA: 'Despesa paga do caixa', SANGRIA: 'Sangria', RETIRADA: 'Retirada' };
  const m = modal({
    title: titles[type],
    body: `<form class="form"><label>Valor R$<input name="amount" inputmode="decimal" required></label>
      <label>Descrição<input name="d" required maxlength="200" placeholder="${type === 'DESPESA' ? 'Ex.: botijão de gás' : 'Motivo'}"></label>
      ${type === 'DESPESA' ? `<label>Categoria<select name="cat"><option value="despesas">Despesas</option><option value="compras">Compras</option><option value="fornecedores">Fornecedores</option><option value="contas">Contas</option><option value="manutencao">Manutenção</option><option value="outros">Outros</option></select></label>` : ''}
      <button class="btn primary">Registrar</button></form>`,
  });
  m.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/cash/movements', { type, amount: parseNum(e.target.amount.value), description: e.target.d.value, category: e.target.cat?.value });
      toast('Registrado'); m.close(); draw();
    } catch (err) { toast(err.message, 'err'); }
  };
}

function closeCash(expected) {
  const m = modal({
    title: 'Fechar caixa',
    body: `<form class="form"><p>Valor esperado em dinheiro: <b>${money(expected)}</b></p>
      <label>Valor contado no caixa R$<input name="v" inputmode="decimal" required></label>
      <div id="diff" class="muted"></div><label>Observação<textarea name="n" rows="2" placeholder="Obrigatória se houver diferença"></textarea></label>
      <button class="btn danger solid">Fechar caixa</button></form>`,
  });
  const f = m.el.querySelector('form');
  f.v.oninput = () => {
    const d = Math.round((parseNum(f.v.value) - expected) * 100) / 100;
    $('#diff', m.el).innerHTML = d === 0 ? '<span style="color:var(--green)">✔ Caixa batendo</span>' : `<b style="color:var(--red)">Diferença: ${money(d)}</b>`;
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!(await confirmDialog('Fechar o caixa agora?', { danger: true, ok: 'Fechar' }))) return;
    try {
      const r = await api.post('/cash/close', { informed_amount: parseNum(f.v.value), notes: f.n.value });
      toast(`Caixa fechado. Diferença: ${money(r.difference)}`); m.close(); draw();
    } catch (err) { toast(err.message, 'err'); }
  };
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Página: finance
// ======================================================================
// Página: finance
Pages.finance = (function () {
const CATS = {
  recebimentos: 'Recebimentos', outras_entradas: 'Outras entradas',
  compras: 'Compras', fornecedores: 'Fornecedores', despesas: 'Despesas', contas: 'Contas', manutencao: 'Manutenção', outros: 'Outros',
};
const IN = ['recebimentos', 'outras_entradas']; const OUT = ['compras', 'fornecedores', 'despesas', 'contas', 'manutencao', 'outros'];
const per = { period: 'today' };

async function render(el) {
  el.innerHTML = `<div class="page-head"><h1>📈 Fluxo de caixa</h1><div class="row gap"><button class="btn" data-k="ENTRADA">+ Entrada</button><button class="btn primary" data-k="SAIDA">+ Saída</button></div></div>
    <div id="per" class="mb"></div><div id="c"></div>`;
  periodBar($('#per'), per, load);
  el.querySelector('.page-head').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) entry(b.dataset.k); };
  await load();
}

async function load() {
  const p = qs(periodParams(per));
  const [s, list] = await Promise.all([api.get('/finance/summary' + p), api.get('/finance/entries' + p)]);
  $('#c').innerHTML = `<div class="kpis">
    <div class="kpi green"><div class="label">Total de entradas</div><div class="value">${money(s.total_in)}</div></div>
    <div class="kpi red"><div class="label">Total de saídas</div><div class="value">${money(s.total_out)}</div></div>
    <div class="kpi brand"><div class="label">Saldo</div><div class="value">${money(s.balance)}</div></div>
    <div class="kpi blue"><div class="label">Lucro estimado</div><div class="value">${money(s.estimated_profit)}</div></div></div>
    <p class="muted small">Lucro estimado = faturamento (${money(s.revenue)}) + outras entradas − custo dos produtos vendidos (${money(s.cogs)}) − despesas operacionais (exceto compras/fornecedores, já refletidas no custo).</p>
    <div class="grid cols-2 mb"><div class="card"><h2>Entradas</h2><div class="row between mt"><span>Vendas</span><b>${money(s.sales)}</b></div>
      ${s.by_method.map((m) => `<div class="row between small muted" style="padding-left:14px"><span>${esc(methodLabel(m.method))}</span><span>${money(m.total)}</span></div>`).join('')}
      ${s.by_category.filter((c) => c.kind === 'ENTRADA').map((c) => `<div class="row between"><span>${CATS[c.category] || esc(c.category)}</span><b>${money(c.total)}</b></div>`).join('')}</div>
      <div class="card"><h2>Saídas</h2>${s.by_category.filter((c) => c.kind === 'SAIDA').map((c) => `<div class="row between mt"><span>${CATS[c.category] || esc(c.category)}</span><b>${money(c.total)}</b></div>`).join('') || '<div class="empty">Sem saídas no período</div>'}</div></div>
    <h2 class="mb">Lançamentos</h2><div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Usuário</th><th class="num">Valor</th><th></th></tr></thead><tbody>
    ${list.map((e) => `<tr><td>${fmtDay(String(e.entry_date).slice(0, 10))}</td><td>${e.kind === 'ENTRADA' ? '<span class="badge green">Entrada</span>' : '<span class="badge red">Saída</span>'}</td><td>${CATS[e.category] || esc(e.category)}</td>
      <td>${esc(e.description || '')}</td><td class="small">${esc(e.user_name || '')}</td><td class="num" style="color:${e.kind === 'ENTRADA' ? 'var(--green)' : 'var(--red)'}"><b>${money(e.amount)}</b></td>
      <td class="num">${e.register_id ? '<span class="small muted">via caixa</span>' : `<button class="btn sm danger" data-del="${e.id}">✕</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sem lançamentos avulsos no período (vendas entram automaticamente)</td></tr>'}</tbody></table></div>`;
  $('#c').onclick = async (e) => {
    const b = e.target.closest('[data-del]');
    if (b && await confirmDialog('Excluir este lançamento?', { danger: true })) { try { await api.del(`/finance/entries/${b.dataset.del}`); load(); } catch (err) { toast(err.message, 'err'); } }
  };
}

function entry(kind) {
  const cats = kind === 'ENTRADA' ? IN : OUT;
  const m = modal({
    title: kind === 'ENTRADA' ? 'Nova entrada' : 'Nova saída',
    body: `<form class="form"><div class="two"><label>Categoria<select name="cat">${cats.map((c) => `<option value="${c}">${CATS[c]}</option>`).join('')}</select></label>
      <label>Data<input type="date" name="date" value="${todayStr()}" required></label></div>
      <label>Valor R$<input name="amount" inputmode="decimal" required></label><label>Descrição<input name="d" maxlength="200"></label><button class="btn primary">Salvar</button></form>`,
  });
  m.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    try { await api.post('/finance/entries', { kind, category: f.cat.value, date: f.date.value, amount: parseNum(f.amount.value), description: f.d.value }); toast('Lançamento salvo'); m.close(); load(); }
    catch (err) { toast(err.message, 'err'); }
  };
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Página: customers
// ======================================================================
// Página: customers
Pages.customers = (function () {
let list = [];

async function render(el) {
  el.innerHTML = `<div class="page-head"><h1>👥 Clientes</h1><div class="row gap"><input id="q" class="search" placeholder="🔍 Nome ou telefone"><button class="btn primary" id="new">+ Novo cliente</button></div></div><div id="c"></div>`;
  $('#q').oninput = debounce(load); $('#new').onclick = () => form();
  $('#c').onclick = (e) => { const tr = e.target.closest('[data-id]'); if (tr) detail(Number(tr.dataset.id)); };
  await load();
}

async function load() {
  list = await api.get('/customers' + qs({ q: $('#q')?.value.trim() }));
  $('#c').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Endereço</th><th class="num">Pedidos</th><th class="num">Total gasto</th><th>Última compra</th></tr></thead><tbody>
    ${list.map((c) => `<tr class="clickable" data-id="${c.id}"><td><b>${esc(c.name)}</b></td><td>${esc(c.phone || '')}</td><td class="small">${esc(c.address || '')}</td>
      <td class="num">${c.orders_count}</td><td class="num">${money(c.total_spent)}</td><td class="small">${c.last_order ? fmtDateTime(c.last_order) : '—'}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty card">Nenhum cliente cadastrado</div>';
}

async function detail(id) {
  const c = await api.get(`/customers/${id}`);
  const m = modal({
    wide: true, title: c.name,
    body: `<p>📞 ${esc(c.phone || '—')} · 📍 ${esc(c.address || '—')}</p>${c.notes ? `<p class="muted">${esc(c.notes)}</p>` : ''}
      <div class="kpis"><div class="kpi"><div class="label">Compras</div><div class="value">${c.orders_count}</div></div><div class="kpi green"><div class="label">Valor gasto</div><div class="value">${money(c.total_spent)}</div></div>
      <div class="kpi"><div class="label">Última compra</div><div class="value" style="font-size:1rem">${c.last_order ? fmtDateTime(c.last_order) : '—'}</div></div></div>
      <h3>Histórico de pedidos</h3><div class="table-wrap mt"><table><tbody>${c.orders.map((o) => `<tr class="clickable" data-o="${o.id}"><td>#${String(o.number).padStart(3, '0')}</td><td class="small">${fmtDateTime(o.created_at)}</td><td>${statusBadge(o.status)}</td><td class="num">${money(o.total)}</td></tr>`).join('') || '<tr><td class="empty">Sem pedidos</td></tr>'}</tbody></table></div>
      <div class="row gap end mt"><button class="btn" data-edit>Editar</button>${state.user.role === 'ADMIN' ? '<button class="btn danger" data-del>Excluir</button>' : ''}</div>`,
  });
  m.el.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-o]'); if (o) openOrder(Number(o.dataset.o));
    if (e.target.closest('[data-edit]')) { m.close(); form(c); }
    if (e.target.closest('[data-del]') && await confirmDialog('Excluir cliente? Os pedidos são mantidos.', { danger: true })) { await api.del(`/customers/${id}`); m.close(); load(); }
  });
}

function form(c) {
  const m = modal({
    title: c ? 'Editar cliente' : 'Novo cliente',
    body: `<form class="form"><label>Nome<input name="name" required maxlength="120" value="${esc(c?.name)}"></label>
      <label>Telefone<input name="phone" inputmode="tel" value="${esc(c?.phone)}"></label><label>Endereço<input name="address" value="${esc(c?.address)}"></label>
      <label>Observações<textarea name="notes" rows="2">${esc(c?.notes)}</textarea></label><button class="btn primary">Salvar</button></form>`,
  });
  m.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    const body = { name: f.name.value, phone: f.phone.value, address: f.address.value, notes: f.notes.value };
    try { c ? await api.put(`/customers/${c.id}`, body) : await api.post('/customers', body); toast('Cliente salvo'); m.close(); load(); } catch (err) { toast(err.message, 'err'); }
  };
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Página: reports
// ======================================================================
// Página: reports
Pages.reports = (function () {
const REPORTS = [
  ['sales-by-day', 'Vendas por dia'], ['revenue', 'Faturamento / ticket'], ['products', 'Produtos mais vendidos'], ['payments', 'Formas de pagamento'],
  ['stock', 'Estoque'], ['losses', 'Perdas'], ['cancellations', 'Cancelamentos'], ['cashflow', 'Fluxo de caixa'],
];
const per = { period: 'month' }; let type = 'sales-by-day'; let data;

async function render(el) {
  el.innerHTML = `<div class="page-head"><h1>📑 Relatórios</h1><button class="btn" id="csv">⬇️ Exportar CSV</button></div>
    <div class="tabs">${REPORTS.map(([k, l]) => `<button class="tab" data-r="${k}">${l}</button>`).join('')}</div>
    <div id="per" class="mb"></div><div id="c"></div>`;
  el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) { type = b.dataset.r; load(); } };
  periodBar($('#per'), per, load);
  $('#csv').onclick = () => data && downloadCsv(`${type}-${data.from}_${data.to}.csv`, data.columns, data.rows.map(fixRow));
  await load();
}

function fixRow(r) { return r.method ? { ...r, method: methodLabel(r.method) } : r; }

function cell(col, r) {
  const v = r[col.key];
  if (col.key === 'method') return esc(methodLabel(v));
  if (col.key === 'value' && r.type === 'int') return num(v, 0);
  if (col.type === 'money') return money(v);
  if (col.type === 'date') return fmtDay(v);
  if (col.type === 'datetime') return fmtDateTime(v);
  if (col.key === 'number') return `#${String(v).padStart(3, '0')}`;
  return typeof v === 'number' ? num(v) : esc(v ?? '');
}

async function load() {
  document.querySelectorAll('.tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.r === type));
  data = await api.get(`/reports/${type}` + qs(periodParams(per)));
  const alignNum = (c) => (c.type === 'money' || ['qty', 'orders', 'count', 'quantity', 'min_quantity'].includes(c.key) ? 'num' : '');
  $('#c').innerHTML = `<p class="muted">${esc(data.title)} · ${fmtDay(data.from)} a ${fmtDay(data.to)}</p>` + (data.rows.length
    ? `<div class="table-wrap"><table><thead><tr>${data.columns.map((c) => `<th class="${alignNum(c)}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
      ${data.rows.map((r) => `<tr>${data.columns.map((c) => `<td class="${alignNum(c)}">${cell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '<div class="empty card">Sem dados no período</div>');
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Página: settings
// ======================================================================
// Página: settings
Pages.settings = (function () {
let tab = 'general';

async function render(el) {
  el.innerHTML = `<div class="page-head"><h1>⚙️ Configurações</h1></div>
    <div class="tabs">${[['general', 'Geral'], ['printer', 'Impressora'], ['payments', 'Pagamentos'], ['users', 'Usuários'], ['audit', 'Auditoria']].map(([k, l]) => `<button class="tab" data-t="${k}">${l}</button>`).join('')}</div>
    <div id="c"></div>`;
  el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
  await draw();
}

async function save(body) {
  try { await api.put('/settings', body); await loadSettings(); toast('Configurações salvas'); return true; }
  catch (e) { toast(e.message, 'err'); return false; }
}

async function draw() {
  document.querySelectorAll('.tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.t === tab));
  const s = state.settings; const c = $('#c');
  if (tab === 'general') {
    let logo = s.logo;
    c.innerHTML = `<form class="card form" style="max-width:640px" id="f">
      <label>Nome da pastelaria<input name="name" required maxlength="100" value="${esc(s.name)}"></label>
      <div class="two"><label>Telefone<input name="phone" value="${esc(s.phone)}"></label><label>Endereço<input name="address" value="${esc(s.address)}"></label></div>
      <label>Logo <input type="file" name="logo" accept="image/*"></label>
      ${s.logo ? `<div><img id="lp" src="${s.logo}" style="max-height:60px"> <button type="button" class="btn sm" id="rl">Remover</button></div>` : ''}
      <h3>Numeração dos pedidos</h3>
      <div class="two"><label>Prefixo<input name="prefix" maxlength="5" value="${esc(s.order_prefix)}"></label><label>Dígitos<input name="digits" type="number" min="1" max="8" value="${s.order_digits}"></label></div>
      <label>Próximo número <span class="muted small">(a sequência continua mesmo após fechar o sistema)</span><input name="next" type="number" min="1" value="${s.order_next}"></label>
      <p class="muted small">Produtos, categorias e ingredientes são gerenciados em <a href="#/products">Produtos</a>.</p>
      <button class="btn primary">Salvar</button></form>`;
    const f = $('#f');
    f.logo.onchange = async () => { if (f.logo.files[0]) logo = await imageToDataUrl(f.logo.files[0], 200); };
    $('#rl')?.addEventListener('click', () => { logo = ''; $('#lp').remove(); $('#rl').remove(); });
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (await save({ name: f.name.value, phone: f.phone.value, address: f.address.value, logo, order_prefix: f.prefix.value, order_digits: Number(f.digits.value), ...(Number(f.next.value) !== s.order_next ? { order_next: Number(f.next.value) } : {}) })) setTimeout(() => location.reload(), 600);
    };
  } else if (tab === 'printer') {
    const p = s.printer;
    c.innerHTML = `<form class="card form" style="max-width:640px" id="f">
      <div class="two"><label>Tamanho do papel<select name="paper"><option value="80" ${p.paper === 80 ? 'selected' : ''}>80 mm</option><option value="58" ${p.paper === 58 ? 'selected' : ''}>58 mm</option></select></label>
        <label>Cópias<input name="copies" type="number" min="1" max="5" value="${p.copies}"></label></div>
      <label class="check"><input type="checkbox" name="auto" ${p.auto_print_kitchen ? 'checked' : ''}> Imprimir comanda automaticamente ao finalizar o pedido no PDV</label>
      <p class="muted small">Para a cozinha imprimir novos pedidos no próprio computador, use a opção na tela Cozinha.</p>
      <div class="row gap"><button class="btn primary">Salvar</button><button type="button" class="btn" id="test">🖨️ Imprimir teste</button></div></form>`;
    const f = $('#f');
    const read = () => ({ mode: 'browser', paper: Number(f.paper.value), copies: Number(f.copies.value), auto_print_kitchen: f.auto.checked });
    f.onsubmit = async (e) => { e.preventDefault(); if (await save({ printer: read() })) draw(); };
    $('#test').onclick = () => imprimirTeste({ ...s, printer: read() }).then(() => toast('Teste enviado')).catch((e) => toast(e.message, 'err', 6000));
  } else if (tab === 'payments') {
    const list = s.payment_methods.map((m) => ({ ...m }));
    const dr = () => {
      c.innerHTML = `<div class="card form" style="max-width:520px">${list.map((m, i) => `<div class="pay-row" style="grid-template-columns:1fr auto"><input data-i="${i}" value="${esc(m.label)}"><label class="check"><input type="checkbox" data-a="${i}" ${m.active ? 'checked' : ''}> Ativa</label></div>`).join('')}
        <div class="row gap"><button class="btn" id="add">+ Forma de pagamento</button><button class="btn primary" id="sv">Salvar</button></div></div>`;
      c.oninput = (e) => { if (e.target.dataset.i) list[Number(e.target.dataset.i)].label = e.target.value; };
      c.onchange = (e) => { if (e.target.dataset.a) list[Number(e.target.dataset.a)].active = e.target.checked; };
      $('#add').onclick = () => { list.push({ key: 'FORMA' + (list.length + 1), label: 'Nova forma', active: true }); dr(); };
      $('#sv').onclick = async () => { if (await save({ payment_methods: list })) draw(); };
    };
    dr();
  } else if (tab === 'users') {
    const users = await api.get('/users');
    c.innerHTML = `<div class="row end mb"><button class="btn primary" id="nu">+ Novo usuário</button></div><div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${ROLE[u.role]}</td><td>${u.active ? '<span class="badge green">Ativo</span>' : '<span class="badge gray">Inativo</span>'}</td><td class="num"><button class="btn sm" data-u="${u.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#nu').onclick = () => userForm();
    c.onclick = (e) => { const b = e.target.closest('[data-u]'); if (b) userForm(users.find((u) => u.id === Number(b.dataset.u))); };
  } else {
    const rows = await api.get('/audit?limit=200');
    c.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="small">${fmtDateTime(r.created_at)}</td><td>${esc(r.user_name || '—')}</td><td><b>${esc(r.action)}</b></td><td class="small">${esc(r.entity || '')} ${esc(r.entity_id || '')}</td><td class="small muted">${esc((r.details || '').slice(0, 140))}</td></tr>`).join('')}</tbody></table></div>`;
  }
}

function userForm(u) {
  const m = modal({
    title: u ? 'Editar usuário' : 'Novo usuário',
    body: `<form class="form"><label>Nome<input name="name" required value="${esc(u?.name)}"></label>
      <label>E-mail<input name="email" type="email" required ${u ? 'disabled' : ''} value="${esc(u?.email)}"></label>
      <label>Perfil<select name="role">${Object.entries(ROLE).map(([k, l]) => `<option value="${k}" ${u?.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>${u ? 'Nova senha (deixe vazio para manter)' : 'Senha (mín. 6)'}<input name="password" type="password" minlength="6" ${u ? '' : 'required'} autocomplete="new-password"></label>
      ${u ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Ativo</label>` : ''}<button class="btn primary">Salvar</button></form>`,
  });
  m.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    try {
      if (u) await api.put(`/users/${u.id}`, { name: f.name.value, role: f.role.value, active: f.active.checked, password: f.password.value || undefined });
      else await api.post('/users', { name: f.name.value, email: f.email.value, role: f.role.value, password: f.password.value });
      toast('Usuário salvo'); m.close(); draw();
    } catch (err) { toast(err.message, 'err'); }
  };
}

return { render: render, destroy: typeof destroy === 'function' ? destroy : undefined };
})();

// ======================================================================
// Aplicação (login, menu, rotas)
// ======================================================================
const ALL = ['ADMIN', 'ATENDENTE', 'COZINHA'];
const STAFF = ['ADMIN', 'ATENDENTE'];
const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', roles: STAFF },
  { id: 'pdv', label: 'Novo pedido', icon: '🛒', roles: STAFF },
  { id: 'orders', label: 'Pedidos', icon: '🧾', roles: ALL },
  { id: 'kitchen', label: 'Cozinha', icon: '👨‍🍳', roles: ALL },
  { id: 'products', label: 'Produtos', icon: '🥟', roles: ['ADMIN'] },
  { id: 'stock', label: 'Estoque', icon: '📦', roles: STAFF },
  { id: 'cash', label: 'Caixa', icon: '💵', roles: STAFF },
  { id: 'finance', label: 'Financeiro', icon: '📈', roles: ['ADMIN'] },
  { id: 'customers', label: 'Clientes', icon: '👥', roles: STAFF },
  { id: 'reports', label: 'Relatórios', icon: '📑', roles: ['ADMIN'] },
  { id: 'settings', label: 'Configurações', icon: '⚙️', roles: ['ADMIN'] },
];

const root = $('#root');
let current = null;

setUnauthorizedHandler(() => {
  if (!state.user) return;
  state.user = null; setToken(null);
  toast('Sessão expirada. Entre novamente.', 'warn');
  showLogin();
});

function showLogin() {
  current?.destroy?.(); current = null;
  root.innerHTML = `<div class="login-wrap"><form class="login form" id="login">
    <div class="emoji">🥟</div><h1>${esc(state.settings?.name || 'Pastelaria')}</h1>
    <p class="muted center" style="margin:0 0 8px">Entre para continuar</p>
    <label>E-mail<input name="email" type="email" autocomplete="username" required autofocus></label>
    <label>Senha<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn primary lg">Entrar</button><div class="muted small center" id="login-err"></div>
    ${apiConfigured() ? '' : '<div class="alert warn">⚠️ API não configurada. Abra o arquivo <b>app.js</b> e cole a URL do Apps Script na constante <b>API_URL</b> (início do arquivo).</div>'}</form></div>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button'); btn.disabled = true;
    try {
      const r = await api.post('/auth/login', { email: f.email.value, password: f.password.value });
      setToken(r.token); state.user = r.user;
      await boot();
    } catch (err) {
      $('#login-err').textContent = err.message; $('#login-err').style.color = 'var(--red)';
      btn.disabled = false;
    }
  };
}

function layout() {
  const s = state.settings;
  const pages = PAGES.filter((p) => p.roles.includes(state.user.role));
  root.innerHTML = `<div id="app">
    <div class="topbar"><button class="icon-btn" id="burger" aria-label="Menu">☰</button><b>${esc(s.name)}</b></div>
    <aside class="sidebar" id="sidebar">
      <div class="brand">${s.logo ? `<img src="${s.logo}" alt="">` : '<div class="logo">🥟</div>'}<span>${esc(s.name)}</span></div>
      <nav class="nav">${pages.map((p) => `<a href="#/${p.id}" data-page="${p.id}"><span>${p.icon}</span>${p.label}</a>`).join('')}</nav>
      <div class="userbox"><b>${esc(state.user.name)}</b>${ROLE[state.user.role]}
        <button class="btn sm" id="pw">Alterar senha</button><button class="btn sm" id="logout">Sair</button></div>
    </aside>
    <main class="main" id="view"></main></div>`;
  $('#burger').onclick = () => $('#sidebar').classList.toggle('open');
  $('#sidebar').addEventListener('click', (e) => { if (e.target.closest('a')) $('#sidebar').classList.remove('open'); });
  $('#logout').onclick = () => { setToken(null); state.user = null; showLogin(); };
  $('#pw').onclick = changePassword;
}

async function changePassword() {
  const m = modal({
    title: 'Alterar senha',
    body: `<form class="form"><label>Senha atual<input type="password" name="current" required></label>
      <label>Nova senha (mín. 6)<input type="password" name="next" minlength="6" required></label>
      <button class="btn primary">Salvar</button></form>`,
  });
  m.el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    try { await api.post('/auth/password', { current: e.target.current.value, next: e.target.next.value }); toast('Senha alterada'); m.close(); }
    catch (err) { toast(err.message, 'err'); }
  };
}

async function route() {
  if (!state.user) return;
  const id = (location.hash.replace(/^#\//, '').split('?')[0]) || (state.user.role === 'COZINHA' ? 'kitchen' : 'dashboard');
  const page = PAGES.find((p) => p.id === id);
  if (!page || !page.roles.includes(state.user.role)) { location.hash = state.user.role === 'COZINHA' ? '#/kitchen' : '#/dashboard'; return; }
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === id));
  current?.destroy?.();
  const view = $('#view');
  view.innerHTML = '<div class="empty">Carregando…</div>';
  try {
    const mod = Pages[id];
    if (!mod) throw new Error('Página não encontrada');
    current = mod;
    await mod.render(view);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="alert err">Erro ao carregar a página: ${esc(e.message)}</div>`;
  }
}

async function boot() {
  try {
    await loadSettings();
    if (!state.user) state.user = (await api.get('/auth/me')).user;
  } catch {
    setToken(null); state.user = null;
    try { await loadSettings(); } catch { /* sem login: segue só com a tela */ }
    return showLogin();
  }
  layout();
  route();
}

window.addEventListener('hashchange', route);
if (apiConfigured() && getToken()) boot(); else showLogin();
