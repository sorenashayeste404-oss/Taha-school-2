/**
 * برنامه ۱۰ مدرسه طاها
 * Student + Admin school schedule app
 * Static HTML/CSS/JS + Firebase Firestore
 * ورود مدیر با رمز ساده (پروژه دانش‌آموزی)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import {
  firebaseConfig,
  ADMIN_PASSWORD,
  GROUPS,
  DAYS,
  DAY_ORDER_MAP
} from "./firebase-config.js";

/* ========== Firebase Init ========== */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Offline persistence (safe – won't crash if fails)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Persistence failed: multiple tabs open");
  } else if (err.code === "unimplemented") {
    console.warn("Persistence not supported in this browser");
  }
});

/* ========== State ========== */
const state = {
  group: localStorage.getItem("taha_group") || null,
  field: localStorage.getItem("taha_field") || null,
  branch: localStorage.getItem("taha_branch") || null,
  lessons: [],
  tasks: [],
  messages: [],
  currentView: "home",
  currentDay: "شنبه",
  taskFilter: "همه",
  adminTab: "dashboard",
  adminLessonFilter: { group: GROUPS[0], day: "شنبه" },
  adminTaskFilter: { group: GROUPS[0], day: "همه" },
  editingLessonId: null,
  editingTaskId: null,
  unsubLessons: null,
  unsubTasks: null,
  unsubMessages: null,
  isOnline: navigator.onLine,
  isAdmin: false,
  displayName: localStorage.getItem("taha_display_name") || "",
  clientId: localStorage.getItem("taha_client_id") || null,
  chatStickToBottom: true,
  chatLoading: false
};

// Persistent client ID for identifying own messages
function ensureClientId() {
  if (!state.clientId) {
    state.clientId =
      (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
    localStorage.setItem("taha_client_id", state.clientId);
  }
  return state.clientId;
}
ensureClientId();

/* ========== DOM Helpers ========== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

function showView(viewId) {
  state.currentView = viewId;
  $$("#screen-student .view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById("view-" + viewId);
  if (el) el.classList.add("active");

  $$(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.view === viewId);
  });

  // Chat: subscribe when entering, unsubscribe when leaving to save reads
  if (viewId === "chat") {
    ensureDisplayNameThen(() => {
      subscribeMessages();
      // Focus input on mobile after short delay
      setTimeout(() => {
        const input = $("#chat-input");
        if (input && window.innerWidth > 600) input.focus();
      }, 200);
    });
  } else if (state.unsubMessages) {
    state.unsubMessages();
    state.unsubMessages = null;
  }
}

function showAdminView(tabId) {
  state.adminTab = tabId;
  $$("#screen-admin .admin-view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById("admin-" + tabId);
  if (el) el.classList.add("active");

  $$(".admin-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
}

function showToast(message, type = "info") {
  const container = $("#toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function hideLoading() {
  const el = $("#loading-overlay");
  if (el) {
    el.classList.add("fade-out");
    setTimeout(() => el.classList.add("hidden"), 350);
  }
}

function parseTimeOrder(timeStr) {
  // "08:00 - 09:30" → minutes from midnight of start time
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function getTodayName() {
  // JS: 0=Sun ... 6=Sat. Iranian week starts Saturday.
  const map = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  return map[new Date().getDay()];
}

function friendlyError(err) {
  if (!err) return "خطای ناشناخته رخ داد.";
  const code = err.code || "";
  if (code === "permission-denied" || code.includes("permission")) {
    return "دسترسی مجاز نیست.";
  }
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
    return "ایمیل یا رمز عبور اشتباه است.";
  }
  if (code === "auth/user-not-found") {
    return "کاربری با این ایمیل یافت نشد.";
  }
  if (code === "auth/too-many-requests") {
    return "تعداد تلاش‌ها زیاد است. کمی صبر کنید.";
  }
  if (code === "auth/invalid-email") {
    return "فرمت ایمیل نامعتبر است.";
  }
  if (code === "unavailable" || !navigator.onLine) {
    return "اتصال اینترنت برقرار نیست.";
  }
  return err.message || "خطایی رخ داد. دوباره تلاش کنید.";
}

/* ========== LocalStorage ========== */
function saveGroup(field, branch) {
  const group = `دهم ${field} شعبه ${branch}`;
  state.group = group;
  state.field = field;
  state.branch = branch;
  localStorage.setItem("taha_group", group);
  localStorage.setItem("taha_field", field);
  localStorage.setItem("taha_branch", branch);
}

function clearGroup() {
  state.group = null;
  state.field = null;
  state.branch = null;
  localStorage.removeItem("taha_group");
  localStorage.removeItem("taha_field");
  localStorage.removeItem("taha_branch");
}

/* ========== Firestore Subscriptions ========== */
function subscribeData() {
  if (state.unsubLessons) state.unsubLessons();
  if (state.unsubTasks) state.unsubTasks();

  if (!state.group) return;

  // Lessons
  const lessonsQ = query(
    collection(db, "lessons"),
    where("group", "==", state.group),
    orderBy("dayOrder"),
    orderBy("timeOrder")
  );

  state.unsubLessons = onSnapshot(
    lessonsQ,
    (snap) => {
      state.lessons = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAllStudent();
    },
    (err) => {
      console.error("Lessons snapshot error:", err);
      // Fallback: try without orderBy if index missing
      if (err.code === "failed-precondition") {
        const simpleQ = query(
          collection(db, "lessons"),
          where("group", "==", state.group)
        );
        state.unsubLessons = onSnapshot(simpleQ, (snap) => {
          state.lessons = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0) || (a.timeOrder || 0) - (b.timeOrder || 0));
          renderAllStudent();
        });
      } else {
        showToast(friendlyError(err), "error");
      }
    }
  );

  // Tasks
  const tasksQ = query(
    collection(db, "tasks"),
    where("group", "==", state.group),
    orderBy("dayOrder")
  );

  state.unsubTasks = onSnapshot(
    tasksQ,
    (snap) => {
      state.tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAllStudent();
    },
    (err) => {
      console.error("Tasks snapshot error:", err);
      if (err.code === "failed-precondition") {
        const simpleQ = query(
          collection(db, "tasks"),
          where("group", "==", state.group)
        );
        state.unsubTasks = onSnapshot(simpleQ, (snap) => {
          state.tasks = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0));
          renderAllStudent();
        });
      } else {
        showToast(friendlyError(err), "error");
      }
    }
  );
}

/* ========== Student Render ========== */
function renderAllStudent() {
  updateHeader();
  renderHome();
  renderSchedule();
  renderTasks();
  renderSettings();
}

function updateHeader() {
  const title = $("#header-group");
  if (title) title.textContent = state.group || "—";

  const badge = $("#sync-badge");
  if (badge) {
    badge.classList.toggle("offline", !state.isOnline);
    badge.querySelector("span:last-child").textContent = state.isOnline
      ? "آنلاین"
      : "آفلاین";
  }
}

function renderHome() {
  const container = $("#home-content");
  if (!container) return;

  const today = getTodayName();
  const todayLessons = state.lessons.filter((l) => l.day === today);
  const todayTasks = state.tasks.filter((t) => t.day === today);

  let html = `
    <div class="welcome-card">
      <h2>سلام! 👋</h2>
      <p>${state.group || ""}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-num">${todayLessons.length}</div>
        <div class="stat-label">درس امروز</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${todayTasks.length}</div>
        <div class="stat-label">کار امروز</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${state.lessons.length}</div>
        <div class="stat-label">کل دروس</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${state.tasks.length}</div>
        <div class="stat-label">کل کارها</div>
      </div>
    </div>
  `;

  // Today's schedule summary
  html += `<div class="section-title"><span class="icon">📅</span> برنامه امروز (${today})</div>`;

  if (todayLessons.length === 0) {
    html += `
      <div class="empty-state" style="padding:1.5rem">
        <p>برای امروز درسی ثبت نشده است.</p>
      </div>`;
  } else {
    todayLessons.forEach((l) => {
      html += `
        <div class="today-lesson-card">
          <div class="time-badge">${esc(l.time || "")}</div>
          <div class="lesson-info">
            <h4>${esc(l.name || "")}</h4>
            <span>${esc(l.teacher || "—")}</span>
          </div>
        </div>`;
    });
  }

  // Today's tasks
  if (todayTasks.length > 0) {
    html += `<div class="section-title mt-3"><span class="icon">✅</span> کارهای امروز</div>`;
    todayTasks.forEach((t) => {
      html += `
        <div class="task-card">
          <h3>${esc(t.title || "")}</h3>
          <div class="task-desc">${esc(t.desc || "")}</div>
        </div>`;
    });
  }

  container.innerHTML = html;
}

function renderSchedule() {
  const tabsEl = $("#day-tabs");
  const listEl = $("#schedule-list");
  if (!tabsEl || !listEl) return;

  // Day tabs
  tabsEl.innerHTML = DAYS.map(
    (d) =>
      `<button class="day-tab ${d.name === state.currentDay ? "active" : ""}" data-day="${d.name}">${d.name}</button>`
  ).join("");

  tabsEl.querySelectorAll(".day-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.currentDay = btn.dataset.day;
      renderSchedule();
    });
  });

  // Lessons for selected day
  const dayLessons = state.lessons
    .filter((l) => l.day === state.currentDay)
    .sort((a, b) => (a.timeOrder || 0) - (b.timeOrder || 0));

  if (dayLessons.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <p>هنوز برنامه‌ای برای این کلاس ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = dayLessons
    .map(
      (l) => `
    <div class="lesson-card">
      <div class="lesson-time">${esc(l.time || "")}</div>
      <div class="lesson-details">
        <h3>${esc(l.name || "")}</h3>
        <div class="teacher">${esc(l.teacher || "—")}</div>
      </div>
    </div>`
    )
    .join("");
}

function renderTasks() {
  const filtersEl = $("#task-filters");
  const listEl = $("#tasks-list");
  if (!filtersEl || !listEl) return;

  const filters = ["همه", ...DAYS.map((d) => d.name)];
  filtersEl.innerHTML = filters
    .map(
      (f) =>
        `<button class="filter-tab ${f === state.taskFilter ? "active" : ""}" data-filter="${f}">${f}</button>`
    )
    .join("");

  filtersEl.querySelectorAll(".filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.taskFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  let filtered = state.tasks;
  if (state.taskFilter !== "همه") {
    filtered = state.tasks.filter((t) => t.day === state.taskFilter);
  }

  filtered = [...filtered].sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0));

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>فعلاً کاری برای این کلاس ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (t) => `
    <div class="task-card">
      <span class="task-day">${esc(t.day || "")}</span>
      <h3>${esc(t.title || "")}</h3>
      <div class="task-desc">${esc(t.desc || "")}</div>
    </div>`
    )
    .join("");
}

function renderSettings() {
  const el = $("#settings-group");
  if (el) el.textContent = state.group || "—";
  const nameEl = $("#settings-display-name");
  if (nameEl) nameEl.textContent = state.displayName || "تنظیم نشده";
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/* ========== Display Name ========== */
function saveDisplayName(name) {
  const cleaned = (name || "").trim().slice(0, 30);
  if (!cleaned) return false;
  state.displayName = cleaned;
  localStorage.setItem("taha_display_name", cleaned);
  const el = $("#settings-display-name");
  if (el) el.textContent = cleaned;
  return true;
}

function openNameModal(force = false) {
  const modal = $("#name-modal");
  const input = $("#display-name-input");
  if (!modal || !input) return;
  input.value = state.displayName || "";
  modal.classList.add("open");
  setTimeout(() => input.focus(), 100);
  modal.dataset.force = force ? "1" : "0";
}

function closeNameModal() {
  const modal = $("#name-modal");
  if (modal) modal.classList.remove("open");
}

function ensureDisplayNameThen(cb) {
  if (state.displayName && state.displayName.trim()) {
    if (typeof cb === "function") cb();
    return;
  }
  // Show modal; after save, call cb
  window._afterNameSave = cb;
  openNameModal(true);
}

/* ========== Messenger (Public Chat) ========== */
const MESSAGES_LIMIT = 80;

function subscribeMessages() {
  if (state.unsubMessages) {
    state.unsubMessages();
    state.unsubMessages = null;
  }

  state.chatLoading = true;
  renderChatLoading();

  const q = query(
    collection(db, "messages"),
    orderBy("createdAt", "desc"),
    limit(MESSAGES_LIMIT)
  );

  state.unsubMessages = onSnapshot(
    q,
    (snap) => {
      state.chatLoading = false;
      // Newest first from query → reverse for chronological display
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .reverse();
      state.messages = list;
      renderChat();
    },
    (err) => {
      state.chatLoading = false;
      console.error("Messages snapshot error:", err);
      renderChatError(friendlyError(err));
    }
  );
}

function renderChatLoading() {
  const container = $("#chat-messages");
  if (!container) return;
  container.innerHTML = `
    <div class="chat-loading" id="chat-loading">
      <div class="spinner small"></div>
      <span>در حال دریافت پیام‌ها...</span>
    </div>`;
}

function renderChatError(msg) {
  const container = $("#chat-messages");
  if (!container) return;
  container.innerHTML = `
    <div class="chat-empty">
      <div class="empty-icon">📡</div>
      <p>اتصال به پیام‌رسان برقرار نشد.</p>
      <p class="text-secondary text-sm">${esc(msg || "اینترنت خود را بررسی کنید.")}</p>
    </div>`;
}

function formatMessageTime(ts) {
  if (!ts) return "";
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(date.getTime())) return "";
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    const timeStr = date.toLocaleTimeString("fa-IR", {
      hour: "2-digit",
      minute: "2-digit"
    });
    if (isToday) return timeStr;
    const dateStr = date.toLocaleDateString("fa-IR", {
      month: "short",
      day: "numeric"
    });
    return dateStr + " " + timeStr;
  } catch {
    return "";
  }
}

function renderChat() {
  const container = $("#chat-messages");
  if (!container) return;

  if (state.chatLoading) {
    renderChatLoading();
    return;
  }

  if (!state.messages || state.messages.length === 0) {
    container.innerHTML = `
      <div class="chat-empty">
        <div class="empty-icon">💬</div>
        <p>هنوز پیامی نیست</p>
        <p class="text-secondary text-sm">اولین پیام را شما بفرستید!</p>
      </div>`;
    return;
  }

  // Preserve scroll position logic
  const wasNearBottom =
    state.chatStickToBottom ||
    container.scrollHeight - container.scrollTop - container.clientHeight < 120;

  const frag = document.createDocumentFragment();

  state.messages.forEach((m) => {
    const isMine = m.senderId === state.clientId;
    const row = document.createElement("div");
    row.className = "chat-row" + (isMine ? " mine" : "");

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble" + (isMine ? " mine" : "");

    const nameEl = document.createElement("div");
    nameEl.className = "chat-sender";
    nameEl.textContent = m.senderName || "کاربر";

    const textEl = document.createElement("div");
    textEl.className = "chat-text";
    textEl.textContent = m.text || "";

    const meta = document.createElement("div");
    meta.className = "chat-meta";
    const timeSpan = document.createElement("span");
    timeSpan.className = "chat-time";
    timeSpan.textContent = formatMessageTime(m.createdAt);
    meta.appendChild(timeSpan);

    // Admin can delete any message (session flag from admin login)
    const isAdminUser =
      state.isAdmin || sessionStorage.getItem("taha_admin") === "1";
    if (isAdminUser) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "chat-del-btn";
      delBtn.title = "حذف پیام";
      delBtn.textContent = "حذف";
      delBtn.dataset.id = m.id;
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        confirmDeleteMessage(m.id);
      });
      meta.appendChild(delBtn);
    }

    bubble.appendChild(nameEl);
    bubble.appendChild(textEl);
    bubble.appendChild(meta);
    row.appendChild(bubble);
    frag.appendChild(row);
  });

  container.innerHTML = "";
  container.appendChild(frag);

  if (wasNearBottom) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      state.chatStickToBottom = true;
    });
  }
}

async function sendMessage() {
  const input = $("#chat-input");
  if (!input) return;

  const text = (input.value || "").trim();
  if (!text) return;

  if (!state.displayName || !state.displayName.trim()) {
    ensureDisplayNameThen(() => sendMessage());
    return;
  }

  if (text.length > 500) {
    showToast("پیام خیلی طولانی است (حداکثر ۵۰۰ کاراکتر).", "warning");
    return;
  }

  const btn = $("#chat-send-btn");
  if (btn) btn.disabled = true;

  try {
    await addDoc(collection(db, "messages"), {
      text: text,
      senderId: ensureClientId(),
      senderName: state.displayName.trim().slice(0, 30),
      createdAt: serverTimestamp()
    });
    input.value = "";
    state.chatStickToBottom = true;
    // onSnapshot will re-render; force scroll
  } catch (err) {
    console.error("Send message error:", err);
    showToast(friendlyError(err), "error");
  } finally {
    if (btn) btn.disabled = false;
    input.focus();
  }
}

function confirmDeleteMessage(id) {
  const modal = $("#confirm-modal");
  const msg = $("#confirm-message");
  const yesBtn = $("#confirm-yes");
  const noBtn = $("#confirm-no");
  if (!modal || !msg || !yesBtn || !noBtn) return;

  msg.textContent = "آیا از حذف این پیام مطمئن هستید؟";
  modal.classList.add("open");

  const cleanup = () => {
    modal.classList.remove("open");
    yesBtn.onclick = null;
    noBtn.onclick = null;
  };

  noBtn.onclick = cleanup;
  yesBtn.onclick = async () => {
    cleanup();
    try {
      await deleteDoc(doc(db, "messages", id));
      showToast("پیام حذف شد.", "success");
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };
}

/* ========== Class Selection ========== */
function initClassSelect() {
  let selectedField = state.field || null;
  let selectedBranch = state.branch || null;

  const fieldBtns = $$("#field-options .option-btn");
  const branchBtns = $$("#branch-options .option-btn");
  const enterBtn = $("#btn-enter");

  function updateEnterBtn() {
    enterBtn.disabled = !(selectedField && selectedBranch);
  }

  fieldBtns.forEach((btn) => {
    if (btn.dataset.value === selectedField) btn.classList.add("active");
    btn.addEventListener("click", () => {
      fieldBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedField = btn.dataset.value;
      updateEnterBtn();
    });
  });

  branchBtns.forEach((btn) => {
    if (btn.dataset.value === selectedBranch) btn.classList.add("active");
    btn.addEventListener("click", () => {
      branchBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedBranch = btn.dataset.value;
      updateEnterBtn();
    });
  });

  updateEnterBtn();

  enterBtn.addEventListener("click", () => {
    if (!selectedField || !selectedBranch) return;
    saveGroup(selectedField, selectedBranch);
    startStudentApp();
  });
}

function startStudentApp() {
  showScreen("screen-student");
  showView("home");
  subscribeData();
  renderAllStudent();
}

/* ========== Admin Auth (رمز ساده) ========== */
function initAdminLogin() {
  const form = $("#admin-login-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const password = $("#admin-password").value;
    const btn = $("#btn-admin-login");
    btn.disabled = true;
    btn.textContent = "در حال ورود...";

    if (password === ADMIN_PASSWORD) {
      state.isAdmin = true;
      sessionStorage.setItem("taha_admin", "1");
      showScreen("screen-admin");
      showAdminView("dashboard");
      loadAdminData();
      showToast("ورود موفق", "success");
      $("#admin-password").value = "";
    } else {
      showToast("رمز عبور اشتباه است.", "error");
    }

    btn.disabled = false;
    btn.textContent = "ورود";
  });
}

/* ========== Admin Data ========== */
let adminLessonsUnsub = null;
let adminTasksUnsub = null;
let allAdminLessons = [];
let allAdminTasks = [];

function loadAdminData() {
  // Subscribe to all lessons (admin needs all groups)
  if (adminLessonsUnsub) adminLessonsUnsub();
  if (adminTasksUnsub) adminTasksUnsub();

  adminLessonsUnsub = onSnapshot(
    collection(db, "lessons"),
    (snap) => {
      allAdminLessons = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAdminLessons();
      renderAdminDashboard();
    },
    (err) => showToast(friendlyError(err), "error")
  );

  adminTasksUnsub = onSnapshot(
    collection(db, "tasks"),
    (snap) => {
      allAdminTasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAdminTasks();
      renderAdminDashboard();
    },
    (err) => showToast(friendlyError(err), "error")
  );
}

function renderAdminDashboard() {
  const el = $("#admin-dashboard-content");
  if (!el) return;

  const lessonCount = allAdminLessons.length;
  const taskCount = allAdminTasks.length;
  const groupsWithData = new Set([
    ...allAdminLessons.map((l) => l.group),
    ...allAdminTasks.map((t) => t.group)
  ]);

  el.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:1fr 1fr">
      <div class="stat-card">
        <div class="stat-num">${lessonCount}</div>
        <div class="stat-label">کل دروس</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${taskCount}</div>
        <div class="stat-label">کل کارها</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${groupsWithData.size}</div>
        <div class="stat-label">کلاس‌های فعال</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${GROUPS.length}</div>
        <div class="stat-label">کل کلاس‌ها</div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-title">راهنمای سریع</div>
      <p class="text-secondary text-sm mt-1">
        از تب «برنامه کلاسی» برای افزودن، ویرایش یا حذف دروس استفاده کنید.
        از تب «کارهای روزانه» برای مدیریت تکالیف و کارها استفاده کنید.
      </p>
    </div>
  `;
}

function renderAdminLessons() {
  const listEl = $("#admin-lessons-list");
  if (!listEl) return;

  const { group, day } = state.adminLessonFilter;
  let filtered = allAdminLessons.filter((l) => l.group === group);
  if (day !== "همه") filtered = filtered.filter((l) => l.day === day);
  filtered.sort(
    (a, b) =>
      (a.dayOrder || 0) - (b.dayOrder || 0) ||
      (a.timeOrder || 0) - (b.timeOrder || 0)
  );

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <p>درسی برای این فیلتر ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (l) => `
    <div class="list-item">
      <div class="item-info">
        <h4>${esc(l.name || "")}</h4>
        <div class="item-meta">
          ${esc(l.day || "")} · ${esc(l.time || "")}<br>
          ${esc(l.teacher || "—")} · ${esc(l.group || "")}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary btn-sm" data-edit-lesson="${l.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-del-lesson="${l.id}">حذف</button>
      </div>
    </div>`
    )
    .join("");

  listEl.querySelectorAll("[data-edit-lesson]").forEach((btn) => {
    btn.addEventListener("click", () => openLessonModal(btn.dataset.editLesson));
  });
  listEl.querySelectorAll("[data-del-lesson]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDelete("lesson", btn.dataset.delLesson));
  });
}

function renderAdminTasks() {
  const listEl = $("#admin-tasks-list");
  if (!listEl) return;

  const { group, day } = state.adminTaskFilter;
  let filtered = allAdminTasks.filter((t) => t.group === group);
  if (day !== "همه") filtered = filtered.filter((t) => t.day === day);
  filtered.sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0));

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>کاری برای این فیلتر ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (t) => `
    <div class="list-item">
      <div class="item-info">
        <h4>${esc(t.title || "")}</h4>
        <div class="item-meta">
          ${esc(t.day || "")} · ${esc(t.group || "")}<br>
          ${esc(t.desc || "")}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary btn-sm" data-edit-task="${t.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-del-task="${t.id}">حذف</button>
      </div>
    </div>`
    )
    .join("");

  listEl.querySelectorAll("[data-edit-task]").forEach((btn) => {
    btn.addEventListener("click", () => openTaskModal(btn.dataset.editTask));
  });
  listEl.querySelectorAll("[data-del-task]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDelete("task", btn.dataset.delTask));
  });
}

/* ========== Admin Modals ========== */
function openLessonModal(id = null) {
  state.editingLessonId = id;
  const modal = $("#lesson-modal");
  const title = $("#lesson-modal-title");
  title.textContent = id ? "ویرایش درس" : "افزودن درس";

  if (id) {
    const lesson = allAdminLessons.find((l) => l.id === id);
    if (lesson) {
      $("#lesson-group").value = lesson.group || "";
      $("#lesson-day").value = lesson.day || "";
      $("#lesson-time").value = lesson.time || "";
      $("#lesson-name").value = lesson.name || "";
      $("#lesson-teacher").value = lesson.teacher || "";
    }
  } else {
    $("#lesson-group").value = state.adminLessonFilter.group;
    $("#lesson-day").value = state.adminLessonFilter.day === "همه" ? "شنبه" : state.adminLessonFilter.day;
    $("#lesson-time").value = "";
    $("#lesson-name").value = "";
    $("#lesson-teacher").value = "";
  }

  modal.classList.add("open");
}

function closeLessonModal() {
  $("#lesson-modal").classList.remove("open");
  state.editingLessonId = null;
}

function openTaskModal(id = null) {
  state.editingTaskId = id;
  const modal = $("#task-modal");
  const title = $("#task-modal-title");
  title.textContent = id ? "ویرایش کار" : "افزودن کار";

  if (id) {
    const task = allAdminTasks.find((t) => t.id === id);
    if (task) {
      $("#task-group").value = task.group || "";
      $("#task-day").value = task.day || "";
      $("#task-title").value = task.title || "";
      $("#task-desc").value = task.desc || "";
    }
  } else {
    $("#task-group").value = state.adminTaskFilter.group;
    $("#task-day").value = state.adminTaskFilter.day === "همه" ? "شنبه" : state.adminTaskFilter.day;
    $("#task-title").value = "";
    $("#task-desc").value = "";
  }

  modal.classList.add("open");
}

function closeTaskModal() {
  $("#task-modal").classList.remove("open");
  state.editingTaskId = null;
}

async function saveLesson(e) {
  e.preventDefault();
  const group = $("#lesson-group").value;
  const day = $("#lesson-day").value;
  const time = $("#lesson-time").value.trim();
  const name = $("#lesson-name").value.trim();
  const teacher = $("#lesson-teacher").value.trim();

  if (!group || !day || !time || !name) {
    showToast("لطفاً فیلدهای ضروری را پر کنید.", "warning");
    return;
  }

  const btn = $("#btn-save-lesson");
  btn.disabled = true;
  btn.textContent = "در حال ذخیره...";

  const data = {
    group,
    day,
    dayOrder: DAY_ORDER_MAP[day] || 0,
    time,
    timeOrder: parseTimeOrder(time),
    name,
    teacher,
    updatedAt: serverTimestamp()
  };

  try {
    if (state.editingLessonId) {
      await updateDoc(doc(db, "lessons", state.editingLessonId), data);
      showToast("با موفقیت ذخیره شد.", "success");
    } else {
      await addDoc(collection(db, "lessons"), data);
      showToast("با موفقیت ذخیره شد.", "success");
    }
    closeLessonModal();
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "ذخیره درس";
  }
}

async function saveTask(e) {
  e.preventDefault();
  const group = $("#task-group").value;
  const day = $("#task-day").value;
  const title = $("#task-title").value.trim();
  const desc = $("#task-desc").value.trim();

  if (!group || !day || !title) {
    showToast("لطفاً فیلدهای ضروری را پر کنید.", "warning");
    return;
  }

  const btn = $("#btn-save-task");
  btn.disabled = true;
  btn.textContent = "در حال ذخیره...";

  const data = {
    group,
    day,
    dayOrder: DAY_ORDER_MAP[day] || 0,
    title,
    desc,
    updatedAt: serverTimestamp()
  };

  try {
    if (state.editingTaskId) {
      await updateDoc(doc(db, "tasks", state.editingTaskId), data);
      showToast("با موفقیت ذخیره شد.", "success");
    } else {
      await addDoc(collection(db, "tasks"), data);
      showToast("با موفقیت ذخیره شد.", "success");
    }
    closeTaskModal();
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "ذخیره کار";
  }
}

function confirmDelete(type, id) {
  const overlay = $("#confirm-modal");
  const msg = $("#confirm-message");
  msg.textContent =
    type === "lesson"
      ? "آیا از حذف این درس مطمئن هستید؟"
      : "آیا از حذف این کار مطمئن هستید؟";

  overlay.classList.add("open");

  const yesBtn = $("#confirm-yes");
  const noBtn = $("#confirm-no");

  const cleanup = () => {
    overlay.classList.remove("open");
    yesBtn.replaceWith(yesBtn.cloneNode(true));
    noBtn.replaceWith(noBtn.cloneNode(true));
  };

  $("#confirm-yes").onclick = async () => {
    cleanup();
    try {
      if (type === "lesson") {
        await deleteDoc(doc(db, "lessons", id));
      } else {
        await deleteDoc(doc(db, "tasks", id));
      }
      showToast("با موفقیت حذف شد.", "success");
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  $("#confirm-no").onclick = cleanup;
}

/* ========== Populate Select Options ========== */
function populateSelects() {
  const groupOptions = GROUPS.map(
    (g) => `<option value="${g}">${g}</option>`
  ).join("");
  const dayOptions = DAYS.map(
    (d) => `<option value="${d.name}">${d.name}</option>`
  ).join("");
  const dayOptionsAll =
    `<option value="همه">همه روزها</option>` + dayOptions;

  // Admin filter selects
  const alGroup = $("#admin-lesson-group");
  const alDay = $("#admin-lesson-day");
  const atGroup = $("#admin-task-group");
  const atDay = $("#admin-task-day");

  if (alGroup) alGroup.innerHTML = groupOptions;
  if (alDay) alDay.innerHTML = dayOptionsAll;
  if (atGroup) atGroup.innerHTML = groupOptions;
  if (atDay) atDay.innerHTML = dayOptionsAll;

  // Modal selects
  const lg = $("#lesson-group");
  const ld = $("#lesson-day");
  const tg = $("#task-group");
  const td = $("#task-day");

  if (lg) lg.innerHTML = groupOptions;
  if (ld) ld.innerHTML = dayOptions;
  if (tg) tg.innerHTML = groupOptions;
  if (td) td.innerHTML = dayOptions;
}

/* ========== Event Bindings ========== */
function bindEvents() {
  // Bottom nav
  $$(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      showView(item.dataset.view);
    });
  });

  // Change class
  $("#btn-change-class")?.addEventListener("click", () => {
    clearGroup();
    if (state.unsubLessons) state.unsubLessons();
    if (state.unsubTasks) state.unsubTasks();
    if (state.unsubMessages) {
      state.unsubMessages();
      state.unsubMessages = null;
    }
    showScreen("screen-select");
  });

  // Change display name
  $("#btn-change-name")?.addEventListener("click", () => openNameModal(false));

  // Name modal
  $("#name-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#display-name-input");
    const name = (input?.value || "").trim();
    if (!name) {
      showToast("لطفاً یک نام وارد کنید.", "warning");
      return;
    }
    if (saveDisplayName(name)) {
      closeNameModal();
      showToast("نام ذخیره شد.", "success");
      if (typeof window._afterNameSave === "function") {
        const cb = window._afterNameSave;
        window._afterNameSave = null;
        cb();
      }
    }
  });
  $("#name-modal-close")?.addEventListener("click", () => {
    const force = $("#name-modal")?.dataset.force === "1";
    if (force && !state.displayName) {
      showToast("برای استفاده از پیام‌رسان باید نام تعیین کنید.", "warning");
      return;
    }
    closeNameModal();
    window._afterNameSave = null;
  });
  $("#name-modal-cancel")?.addEventListener("click", () => {
    const force = $("#name-modal")?.dataset.force === "1";
    if (force && !state.displayName) {
      showToast("برای استفاده از پیام‌رسان باید نام تعیین کنید.", "warning");
      return;
    }
    closeNameModal();
    window._afterNameSave = null;
  });
  $("#name-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      const force = e.currentTarget.dataset.force === "1";
      if (force && !state.displayName) return;
      closeNameModal();
      window._afterNameSave = null;
    }
  });

  // Chat send
  $("#chat-send-btn")?.addEventListener("click", () => sendMessage());
  $("#chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Chat scroll tracking (don't force-scroll if user is reading older messages)
  const chatBox = $("#chat-messages");
  if (chatBox) {
    chatBox.addEventListener("scroll", () => {
      const nearBottom =
        chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 120;
      state.chatStickToBottom = nearBottom;
    });
  }

  // Admin link from select screen
  $("#link-admin")?.addEventListener("click", () => {
    showScreen("screen-admin-login");
  });

  // Back from admin login
  $("#link-back-student")?.addEventListener("click", () => {
    if (state.group) {
      startStudentApp();
    } else {
      showScreen("screen-select");
    }
  });

  // Admin tabs
  $$(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      showAdminView(tab.dataset.tab);
    });
  });

  // Admin → student app (keeps admin session so can delete messages)
  $("#btn-admin-to-student")?.addEventListener("click", () => {
    if (state.group) {
      startStudentApp();
    } else {
      showScreen("screen-select");
    }
    showToast("با دسترسی مدیر وارد برنامه دانش‌آموز شدید.", "info");
  });

  // Admin logout
  $("#btn-admin-logout")?.addEventListener("click", () => {
    state.isAdmin = false;
    sessionStorage.removeItem("taha_admin");
    if (adminLessonsUnsub) adminLessonsUnsub();
    if (adminTasksUnsub) adminTasksUnsub();
    if (state.group) {
      startStudentApp();
    } else {
      showScreen("screen-select");
    }
    showToast("خارج شدید.", "info");
  });

  // Admin filters
  $("#admin-lesson-group")?.addEventListener("change", (e) => {
    state.adminLessonFilter.group = e.target.value;
    renderAdminLessons();
  });
  $("#admin-lesson-day")?.addEventListener("change", (e) => {
    state.adminLessonFilter.day = e.target.value;
    renderAdminLessons();
  });
  $("#admin-task-group")?.addEventListener("change", (e) => {
    state.adminTaskFilter.group = e.target.value;
    renderAdminTasks();
  });
  $("#admin-task-day")?.addEventListener("change", (e) => {
    state.adminTaskFilter.day = e.target.value;
    renderAdminTasks();
  });

  // Add buttons
  $("#btn-add-lesson")?.addEventListener("click", () => openLessonModal());
  $("#btn-add-task")?.addEventListener("click", () => openTaskModal());

  // Forms
  $("#lesson-form")?.addEventListener("submit", saveLesson);
  $("#task-form")?.addEventListener("submit", saveTask);

  // Modal closes
  $("#lesson-modal-close")?.addEventListener("click", closeLessonModal);
  $("#task-modal-close")?.addEventListener("click", closeTaskModal);
  $("#lesson-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLessonModal();
  });
  $("#task-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeTaskModal();
  });

  // Online/offline
  window.addEventListener("online", () => {
    state.isOnline = true;
    updateHeader();
    showToast("اتصال برقرار شد.", "success");
  });
  window.addEventListener("offline", () => {
    state.isOnline = false;
    updateHeader();
    showToast("اتصال قطع شد. داده‌های ذخیره‌شده نمایش داده می‌شود.", "warning");
  });
}

/* ========== Init ========== */
function init() {
  populateSelects();
  initClassSelect();
  initAdminLogin();
  bindEvents();

  // اگر قبلاً وارد پنل مدیر شده بود (در همین تب)
  if (sessionStorage.getItem("taha_admin") === "1") {
    state.isAdmin = true;
    showScreen("screen-admin");
    showAdminView("dashboard");
    loadAdminData();
  } else if (state.group) {
    startStudentApp();
  } else {
    showScreen("screen-select");
  }

  hideLoading();
}

// Start
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
