// ============ CONFIG ============
const API = "https://api.mail.tm";
let REFRESH_MS = Settings.get("refreshInterval") || 10000;
const ACCOUNT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// ============ STATE ============
const state = {
  email: null, password: null, token: null, accountId: null,
  createdAt: null, messages: [], filtered: [],
  timer: null, tickTimer: null, firstLoad: true, activeMsgId: null
};

// ============ DOM ============
const $ = s => document.querySelector(s);
const emailBox = $("#emailBox");
const copyBtn = $("#copyBtn");
const newBtn = $("#newBtn");
const refreshBtn = $("#refreshBtn");
const qrBtn = $("#qrBtn");
const langSelect = $("#langSelect");
const themeBtn = $("#themeBtn");
const themeIcon = $("#themeIcon");
const soundBtn = $("#soundBtn");
const soundIcon = $("#soundIcon");
const messagesEl = $("#messages");
const countBadge = $("#countBadge");
const searchBox = $("#searchBox");
const ageBox = $("#ageBox");
const toast = $("#toast");

const modal = $("#modal");
const modalSubject = $("#modalSubject");
const modalFrom = $("#modalFrom");
const modalBody = $("#modalBody");
const modalClose = $("#modalClose");
const attachmentsEl = $("#attachments");
const deleteBtn = $("#deleteBtn");

const qrModal = $("#qrModal");
const qrClose = $("#qrClose");
const qrContainer = $("#qrContainer");

const settingsModal = $("#settingsModal");
const settingsClose = $("#settingsClose");
const themeSelect = $("#themeSelect");
const soundToggle = $("#soundToggle");
const desktopToggle = $("#desktopToggle");
const refreshSelect = $("#refreshSelect");

// ============ HELPERS ============
function showToast(msg, type = "success") {
  toast.textContent = msg;
  toast.className = "toast show " + (type !== "success" ? type : "");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
}

function randomString(len = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}dk`;
  if (s < 86400) return `${Math.floor(s / 3600)}sa`;
  return `${Math.floor(s / 86400)}g`;
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}

// ============ THEME ============
function applyTheme() {
  const pref = Settings.get("theme") || "auto";
  const actual = pref === "auto"
    ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : pref;
  document.documentElement.setAttribute("data-theme", actual);
  themeIcon.textContent = actual === "light" ? "☀️" : "🌙";
  themeSelect.value = pref;
}

themeBtn.addEventListener("click", () => {
  const order = ["dark", "light", "auto"];
  const cur = Settings.get("theme") || "auto";
  const next = order[(order.indexOf(cur) + 1) % order.length];
  Settings.set("theme", next);
  applyTheme();
});

matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (Settings.get("theme") === "auto") applyTheme();
});

// ============ SOUND ============
function applySound() {
  const on = Settings.get("sound");
  soundIcon.textContent = on ? "🔔" : "🔕";
  soundBtn.classList.toggle("off", !on);
  soundToggle.checked = on;
}
soundBtn.addEventListener("click", () => {
  Settings.set("sound", !Settings.get("sound"));
  applySound();
  if (Settings.get("sound")) Notify.playChime();
});

// ============ API ============
async function getDomains() {
  const r = await fetch(`${API}/domains?page=1`);
  const d = await r.json();
  const active = d["hydra:member"].filter(x => x.isActive);
  if (!active.length) throw new Error("No active domain");
  return active[Math.floor(Math.random() * active.length)].domain;
}

async function createAccount() {
  const domain = await getDomains();
  const address = `${randomString(10)}@${domain}`;
  const password = randomString(16);

  const r = await fetch(`${API}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password })
  });
  if (!r.ok) throw new Error("Account creation failed");
  const account = await r.json();

  const tokenRes = await fetch(`${API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password })
  });
  if (!tokenRes.ok) throw new Error("Token failed");
  const tokenData = await tokenRes.json();

  Object.assign(state, {
    email: address,
    password,
    token: tokenData.token,
    accountId: account.id,
    createdAt: Date.now()
  });
  Settings.set("seenIds", []);
  state.firstLoad = true;
  persistState();
}

function persistState() {
  try {
    localStorage.setItem("tm_state", JSON.stringify({
      email: state.email,
      password: state.password,
      token: state.token,
      accountId: state.accountId,
      createdAt: state.createdAt
    }));
  } catch (e) {}
}

async function fetchMessages({ silent = false } = {}) {
  if (!state.token) return [];
  try {
    const r = await fetch(`${API}/messages?page=1`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (r.status === 401) {
      await init();
      return;
    }
    const data = await r.json();
    const list = data["hydra:member"] || [];
    renderMessages(list);
    return list;
  } catch (e) {
    if (!silent) showToast(t("networkError"), "error");
    return [];
  }
}

async function fetchMessage(id) {
  const r = await fetch(`${API}/messages/${id}`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  return r.json();
}

async function deleteMessage(id) {
  const r = await fetch(`${API}/messages/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${state.token}` }
  });
  return r.ok;
}

async function getAttachmentUrl(msgId, attId) {
  const r = await fetch(`${API}/messages/${msgId}/attachment/${attId}`, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (!r.ok) throw new Error("Attachment fetch failed");
  return r.json();
}

// ============ RENDER ============
function renderMessages(list) {
  const seen = new Set(Settings.get("seenIds") || []);
  const newOnes = list.filter(m => !seen.has(m.id));

  // Bildirim: sadece ilk yükleme değil ve yeni mesaj varsa
  if (!state.firstLoad && newOnes.length > 0) {
    const m = newOnes[0];
    Notify.notifyNewMessage(m.from.address, m.subject);
    countBadge.classList.add("bump");
    setTimeout(() => countBadge.classList.remove("bump"), 450);
  }
  state.firstLoad = false;

  // Görülenleri güncelle
  list.forEach(m => seen.add(m.id));
  // Son 500'ü tut
  Settings.set("seenIds", Array.from(seen).slice(-500));

  state.messages = list;
  applyFilter();
}

function applyFilter() {
  const q = (searchBox.value || "").trim().toLowerCase();
  let list = state.messages;
  if (q) {
    list = list.filter(m =>
      (m.from?.address || "").toLowerCase().includes(q) ||
      (m.subject || "").toLowerCase().includes(q) ||
      (m.intro || "").toLowerCase().includes(q)
    );
  }
  state.filtered = list;
  countBadge.textContent = list.length;

  const seen = new Set(Settings.get("seenIds") || []);

  if (list.length === 0) {
    messagesEl.innerHTML = `<div class="empty">${q ? "🔍 " + escapeHtml(q) : t("emptyInbox")}</div>`;
    return;
  }

  messagesEl.innerHTML = list.map(m => {
    const attach = (m.hasAttachments || (m.attachments && m.attachments.length))
      ? `<div class="msg-attach">📎</div>` : "";
    return `
      <div class="msg" data-id="${m.id}">
        <div class="msg-info">
          <div class="msg-from">${escapeHtml(m.from?.address || "?")}</div>
          <div class="msg-subject">${escapeHtml(m.subject || t("noSubject"))}</div>
        </div>
        <div class="msg-right">
          <div class="msg-time">${timeAgo(m.createdAt)}</div>
          ${attach}
        </div>
      </div>`;
  }).join("");

  messagesEl.querySelectorAll(".msg").forEach(el => {
    el.addEventListener("click", () => openMessage(el.dataset.id));
  });
}

function renderSkeleton() {
  messagesEl.innerHTML = Array.from({ length: 3 })
    .map(() => `<div class="skeleton"></div>`).join("");
}

async function openMessage(id) {
  state.activeMsgId = id;
  modal.classList.remove("hidden");
  modalSubject.textContent = t("loading");
  modalFrom.textContent = "";
  modalBody.innerHTML = "";
  attachmentsEl.classList.add("hidden");
  attachmentsEl.innerHTML = "";

  try {
    const m = await fetchMessage(id);
    modalSubject.textContent = m.subject || t("noSubject");
    modalFrom.textContent = `${m.from?.address || "?"}  ·  ${new Date(m.createdAt).toLocaleString(currentLang)}`;

    // Ekler
    if (Array.isArray(m.attachments) && m.attachments.length) {
      attachmentsEl.classList.remove("hidden");
      attachmentsEl.innerHTML =
        `<div class="attach-title">📎 ${t("attachments")} (${m.attachments.length})</div>` +
        m.attachments.map(a => `
          <div class="attach">
            <span class="attach-icon">📄</span>
            <div class="attach-info">
              <div class="attach-name">${escapeHtml(a.filename || "file")}</div>
              <div class="attach-size">${formatBytes(a.size || 0)} · ${escapeHtml(a.contentType || "")}</div>
            </div>
            <button class="btn ghost small" data-att="${a.id}">${t("download")}</button>
          </div>`).join("");

      attachmentsEl.querySelectorAll("button[data-att]").forEach(btn => {
        btn.addEventListener("click", () => downloadAttachment(id, btn.dataset.att));
      });
    }

    // Gövde
    if (Array.isArray(m.html) && m.html.length) {
      const iframe = document.createElement("iframe");
      iframe.sandbox = "allow-same-origin";
      iframe.srcdoc = m.html.join("\n");
      modalBody.innerHTML = "";
      modalBody.appendChild(iframe);
    } else if (m.text) {
      modalBody.textContent = m.text;
    } else {
      modalBody.textContent = t("noBody");
    }
  } catch (e) {
    modalSubject.textContent = t("error");
    modalBody.textContent = t("networkError");
  }
}

async function downloadAttachment(msgId, attId) {
  try {
    const { url } = await getAttachmentUrl(msgId, attId);
    if (url) window.open(url, "_blank", "noopener");
  } catch (e) {
    showToast(t("networkError"), "error");
  }
}

// ============ ACTIONS ============
copyBtn.addEventListener("click", async () => {
  if (!state.email) return;
  try {
    await navigator.clipboard.writeText(state.email);
    showToast(t("copied"));
  } catch {
    emailBox.select();
    document.execCommand("copy");
    showToast(t("copied"));
  }
});

newBtn.addEventListener("click", async () => {
  newBtn.disabled = true;
  emailBox.value = t("loading");
  renderSkeleton();
  try {
    await createAccount();
    emailBox.value = state.email;
    await fetchMessages();
  } catch (e) {
    showToast(t("error"), "error");
    emailBox.value = state.email || "—";
  }
  newBtn.disabled = false;
});

refreshBtn.addEventListener("click", async () => {
  refreshBtn.classList.add("spin");
  await fetchMessages();
  setTimeout(() => refreshBtn.classList.remove("spin"), 600);
});

qrBtn.addEventListener("click", () => {
  qrContainer.innerHTML = "";
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(state.email || "")}`;
  const img = new Image();
  img.src = url;
  img.alt = "QR";
  qrContainer.appendChild(img);
  qrModal.classList.remove("hidden");
});

deleteBtn.addEventListener("click", async () => {
  if (!state.activeMsgId) return;
  if (!confirm(t("confirmDelete"))) return;
  const ok = await deleteMessage(state.activeMsgId);
  if (ok) {
    showToast(t("deleted"));
    modal.classList.add("hidden");
    state.activeMsgId = null;
    await fetchMessages();
  } else {
    showToast(t("error"), "error");
  }
});

searchBox.addEventListener("input", () => applyFilter());

langSelect.addEventListener("change", e => {
  currentLang = e.target.value;
  Settings.set("lang", currentLang);
  applyI18n();
  applyFilter();
  updateAge();
});

// Modal kapatma
modalClose.addEventListener("click", () => { modal.classList.add("hidden"); state.activeMsgId = null; });
modal.addEventListener("click", e => { if (e.target === modal) { modal.classList.add("hidden"); state.activeMsgId = null; } });
qrClose.addEventListener("click", () => qrModal.classList.add("hidden"));
qrModal.addEventListener("click", e => { if (e.target === qrModal) qrModal.classList.add("hidden"); });

// ============ SETTINGS MODAL ============
function openSettings() { settingsModal.classList.remove("hidden"); }
// Settings'i sadece ikon üzerinden değil — kısayolla veya brand tıklamasıyla açabiliriz
document.querySelector(".brand").addEventListener("dblclick", openSettings);
settingsClose.addEventListener("click", () => settingsModal.classList.add("hidden"));
settingsModal.addEventListener("click", e => { if (e.target === settingsModal) settingsModal.classList.add("hidden"); });

themeSelect.addEventListener("change", e => {
  Settings.set("theme", e.target.value);
  applyTheme();
});
soundToggle.addEventListener("change", e => {
  Settings.set("sound", e.target.checked);
  applySound();
});
desktopToggle.addEventListener("change", async e => {
  if (e.target.checked) {
    const ok = await Notify.requestPermission();
    if (!ok) {
      e.target.checked = false;
      Settings.set("notifications", false);
      showToast(t("notifDenied"), "error");
      return;
    }
    Settings.set("notifications", true);
    showToast(t("notifEnabled"), "info");
  } else {
    Settings.set("notifications", false);
  }
});
refreshSelect.addEventListener("change", e => {
  REFRESH_MS = Number(e.target.value);
  Settings.set("refreshInterval", REFRESH_MS);
  restartTimer();
});

// ============ AGE TIMER ============
function updateAge() {
  if (!state.createdAt) return;
  const age = Date.now() - state.createdAt;
  const left = Math.max(0, ACCOUNT_LIFETIME_MS - age);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  ageBox.textContent = `⏱ ${h}s ${m}dk`;
}

// ============ KEYBOARD SHORTCUTS ============
document.addEventListener("keydown", e => {
  const inInput = /input|textarea|select/i.test(e.target.tagName);
  if (e.key === "Escape") {
    modal.classList.add("hidden");
    qrModal.classList.add("hidden");
    settingsModal.classList.add("hidden");
    if (inInput) e.target.blur();
    return;
  }
  if (inInput) return;
  if (e.key === "r" || e.key === "R") { refreshBtn.click(); }
  if (e.key === "c" || e.key === "C") { copyBtn.click(); }
  if (e.key === "n" || e.key === "N") { newBtn.click(); }
  if (e.key === "/") { e.preventDefault(); searchBox.focus(); }
});

// ============ TIMERS ============
function restartTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => fetchMessages({ silent: true }), REFRESH_MS);
  if (state.tickTimer) clearInterval(state.tickTimer);
  state.tickTimer = setInterval(updateAge, 60000);
}

// ============ INIT ============
async function init() {
  emailBox.value = t("loading");
  renderSkeleton();
  try {
    const saved = localStorage.getItem("tm_state");
    if (saved) {
      Object.assign(state, JSON.parse(saved));
      if (!state.createdAt) state.createdAt = Date.now();
      emailBox.value = state.email;
    } else {
      await createAccount();
      emailBox.value = state.email;
    }
    await fetchMessages();
    restartTimer();
    updateAge();
  } catch (e) {
    console.error(e);
    emailBox.value = t("error");
    showToast(t("error"), "error");
  }
}

// ============ BOOT ============
langSelect.value = currentLang;
settingsModal.classList.add("hidden");
applyI18n();
applyTheme();
applySound();
soundToggle.checked = Settings.get("sound");
desktopToggle.checked = Settings.get("notifications");
refreshSelect.value = String(Settings.get("refreshInterval") || 10000);
applyFilter();
init();

// PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}