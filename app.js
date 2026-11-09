import {
  firebaseConfig, USE_AUTH, authEmails, MESSAGE_LIMIT, ACCESS_CODE, AUTO_LOCK_SECONDS
} from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const users = {
  anik:  { name: "Anik",  id: "user_1" },
  priya: { name: "Priya", id: "user_2" }
};
const STORAGE_KEY = "retro-messenger-user";
const MAX_CODE_TRIES = 3;
const TYPING_IDLE_MS = 3000;
const EMPTY_HTML = '<li class="empty">No messages yet. Say hello.</li>';

const $ = (id) => document.getElementById(id);
const el = {
  screens: { game: $("game"), landing: $("landing"), chat: $("chat") },
  // game
  coin: $("coin"), tossBtn: $("toss-btn"), result: $("result"), score: $("score"),
  picks: document.querySelectorAll(".pick"),
  codeForm: $("code-form"), codeInput: $("code-input"), codeError: $("code-error"),
  // landing
  loginForm: $("login-form"), loginName: $("login-name"), password: $("password"),
  landingError: $("landing-error"),
  // chat
  killSwitch: $("kill-switch"), switchUser: $("switch-user"),
  currentUser: $("current-user"), conn: $("conn"), typing: $("typing"),
  messages: $("messages"), composer: $("composer"), input: $("message-input"),
  chatError: $("chat-error")
};

let fb = null;       // firebase-database module
let db = null;
let auth = null, authApi = null;
let screen = "game";
let currentUser = null;
let pendingUser = null;
let unsubscribers = [];
const myKillIds = new Set();

// Per-chat-session state (reset in enterChat)
const live = {
  connected: false, everOnline: false,
  other: null, otherPresence: null, otherSeenAt: 0,
  pendingIds: new Set(), hasUnseen: false, seenTimer: 0,
  typingOn: false, typingTimer: 0,
  connRef: null  // this device's entry under presence/{me}/conns
};
let hiddenAt = 0;

const otherOf = (key) => (key === "anik" ? "priya" : "anik");
const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };

function showScreen(name) {
  screen = name;
  for (const [key, node] of Object.entries(el.screens)) node.hidden = key !== name;
}

// ============================================================
//  FIREBASE — loaded in the background so the game works even if the CDN fails
// ============================================================
const fbReady = Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-database.js")])
  .then(([appMod, dbMod]) => {
    fb = dbMod;
    db = dbMod.getDatabase(appMod.initializeApp(firebaseConfig));
  })
  .catch((err) => { console.error("Firebase failed to load", err); db = null; });

const authReady = fbReady.then(async () => {
  if (!USE_AUTH || !db) return;
  authApi = await import(SDK + "firebase-auth.js");
  auth = authApi.getAuth();
  await new Promise((resolve) => {
    const off = authApi.onAuthStateChanged(auth, () => { off(); resolve(); });
  });
}).catch((err) => { console.error(err); auth = null; });

// ============================================================
//  COIN TOSS GAME
// ============================================================
const game = { pick: "heads", rotation: 0, tossing: false, wins: 0, losses: 0, codeTries: 0 };

el.picks.forEach((btn) => btn.addEventListener("click", () => {
  if (game.tossing) return;
  game.pick = btn.dataset.pick;
  el.picks.forEach((b) => {
    const on = b === btn;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
}));

el.tossBtn.addEventListener("click", toss);

function toss() {
  if (game.tossing) return;
  game.tossing = true;
  el.tossBtn.disabled = true;
  el.result.textContent = " ";
  el.result.className = "result";
  el.codeForm.hidden = true;

  const outcome = (crypto.getRandomValues(new Uint32Array(1))[0] & 1) ? "heads" : "tails";

  // Always spin forward 4 full turns, landing on the right face (0° = heads, 180° = tails).
  const base = game.rotation - (game.rotation % 360) + 1440;
  game.rotation = base + (outcome === "tails" ? 180 : 0);
  el.coin.style.transform = `rotateY(${game.rotation}deg)`;

  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 200 : 900;
  setTimeout(() => finishToss(outcome), duration + 30);
}

function finishToss(outcome) {
  game.tossing = false;
  el.tossBtn.disabled = false;
  if (screen !== "game") return;

  const win = outcome === game.pick;
  win ? game.wins++ : game.losses++;
  el.score.textContent = `W ${game.wins} · L ${game.losses}`;
  el.result.textContent = `${outcome.toUpperCase()}! ${win ? "YOU WIN" : "YOU LOSE"}`;
  el.result.className = "result " + (win ? "win" : "lose");

  game.codeTries = 0;
  el.codeError.textContent = "";
  el.codeInput.value = "";
  el.codeForm.hidden = false;
}

el.codeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  checkCode();
});

function checkCode() {
  const entered = el.codeInput.value.trim().toUpperCase();
  el.codeInput.value = "";
  if (!entered || game.tossing) return;

  if (entered === String(ACCESS_CODE).trim().toUpperCase()) {
    el.codeForm.hidden = true;
    el.codeInput.blur();
    openMessenger();
    return;
  }

  game.codeTries++;
  if (game.codeTries >= MAX_CODE_TRIES) {
    el.codeForm.hidden = true;
    el.codeError.textContent = "";
    el.result.textContent = "TOSS AGAIN";
    el.result.className = "result";
  } else {
    el.codeError.textContent = "Invalid or expired code";
    el.codeInput.focus();
  }
}

function resetGame() {
  game.codeTries = 0;
  el.codeForm.hidden = true;
  el.codeInput.value = "";
  el.codeError.textContent = "";
  el.result.textContent = " ";
  el.result.className = "result";
}

// ============================================================
//  USER SELECTION
// ============================================================
async function openMessenger() {
  await fbReady;
  if (screen !== "game") return;
  if (!db) {
    showLanding();
    showError(el.landingError, "Cannot connect. Check your internet and reload.");
    return;
  }
  if (USE_AUTH) {
    await authReady;
    if (screen !== "game") return;
    const key = auth && auth.currentUser && userKeyForEmail(auth.currentUser.email);
    key ? enterChat(key) : showLanding();
  } else {
    const saved = safeStorage("get");
    users[saved] ? enterChat(saved) : showLanding();
  }
}

document.querySelectorAll("[data-user]").forEach((btn) => {
  btn.addEventListener("click", () => selectUser(btn.dataset.user));
});

function selectUser(key) {
  showError(el.landingError, "");
  if (!db) return showError(el.landingError, "Cannot connect. Check your internet and reload.");
  if (!USE_AUTH) return enterChat(key);
  if (!auth) return showError(el.landingError, "Sign-in is unavailable. Check your connection and reload.");

  pendingUser = key;
  el.loginName.textContent = users[key].name.toUpperCase();
  el.loginForm.hidden = false;
  el.password.value = "";
  el.password.focus();
}

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pendingUser || !auth) return;
  const key = pendingUser;
  const btn = el.loginForm.querySelector("button");
  btn.disabled = true;
  try {
    await authApi.signInWithEmailAndPassword(auth, authEmails[key], el.password.value);
    el.password.value = "";
    if (screen === "landing") enterChat(key);
  } catch (err) {
    console.error(err);
    showError(el.landingError, "Sign-in failed: wrong password or account not set up.");
  } finally {
    btn.disabled = false;
  }
});

function showLanding() {
  leaveChat();
  pendingUser = null;
  el.loginForm.hidden = true;
  el.password.value = "";
  showScreen("landing");
}

// ============================================================
//  CHAT
// ============================================================
function enterChat(key) {
  leaveChat();
  currentUser = key;
  safeStorage("set", key);

  Object.assign(live, {
    connected: false, everOnline: false,
    other: otherOf(key), otherPresence: null, otherSeenAt: 0,
    hasUnseen: false, typingOn: false,
    connRef: fb.push(fb.ref(db, `presence/${key}/conns`)) // key only, nothing written yet
  });
  live.pendingIds.clear();

  el.currentUser.textContent = users[key].name.toUpperCase();
  el.messages.innerHTML = EMPTY_HTML;
  el.typing.textContent = "";
  el.killSwitch.disabled = false;
  showError(el.chatError, "");
  renderStatus();
  showScreen("chat");
  el.input.focus();
  startListeners(key);
}

// Leaves the chat cleanly: listeners off, presence offline, typing cleared.
function leaveChat() {
  const me = currentUser;
  stopListeners();
  stopTyping(me);
  clearTimeout(live.seenTimer);
  currentUser = null;
  const connRef = live.connRef;
  live.connRef = null;
  if (me && db && connRef) {
    const atRef = fb.ref(db, `presence/${me}/at`);
    quiet(fb.onDisconnect(connRef).cancel());
    quiet(fb.onDisconnect(atRef).cancel());
    quiet(fb.onDisconnect(fb.ref(db, `typing/${me}`)).cancel());
    quiet(fb.remove(connRef));
    quiet(fb.set(atRef, fb.serverTimestamp()));
  }
}

function startListeners(me) {
  stopListeners();
  const { ref, query, orderByChild, limitToLast, onChildAdded, onChildChanged, onChildRemoved, onValue } = fb;
  const other = live.other;
  const recent = query(ref(db, "messages"), orderByChild("timestamp"), limitToLast(MESSAGE_LIMIT));
  const onReadError = (err) => showError(el.chatError, "Cannot read messages: " + (err.code || err.message));

  unsubscribers.push(onChildAdded(recent, (snap, prevKey) => renderMessage(snap.key, snap.val(), prevKey), onReadError));
  unsubscribers.push(onChildChanged(recent, (snap) => updateMessageTime(snap.key, snap.val()), () => {}));
  unsubscribers.push(onChildRemoved(recent, (snap) => {
    findMessage(snap.key)?.remove();
    if (!el.messages.querySelector(".msg")) el.messages.innerHTML = EMPTY_HTML;
  }, () => {}));

  // Own connection + presence (re-registered after every reconnect).
  unsubscribers.push(onValue(ref(db, ".info/connected"), (snap) => {
    live.connected = snap.val() === true;
    if (live.connected && live.connRef) {
      live.everOnline = true;
      const connRef = live.connRef;
      quiet(fb.onDisconnect(ref(db, `typing/${me}`)).remove());
      quiet(fb.onDisconnect(ref(db, `presence/${me}/at`)).set(fb.serverTimestamp()));
      quiet(fb.onDisconnect(connRef).remove().then(() => setPresence(me)));
    }
    renderStatus();
  }));

  unsubscribers.push(onValue(ref(db, `presence/${other}`), (snap) => {
    live.otherPresence = snap.val();
    renderStatus();
  }, () => {}));

  unsubscribers.push(onValue(ref(db, `typing/${other}`), (snap) => {
    el.typing.textContent = snap.val() === true ? `${users[other].name.toUpperCase()} is typing…` : "";
  }, () => {}));

  unsubscribers.push(onValue(ref(db, `seen/${other}`), (snap) => {
    live.otherSeenAt = typeof snap.val() === "number" ? snap.val() : 0;
    el.messages.querySelectorAll(".msg.mine").forEach(updateTick);
  }, () => {}));

  // Kill signal: the first value is the baseline; a new kill id from the other device locks this one.
  let baseline;
  let first = true;
  unsubscribers.push(onValue(ref(db, "control/kill/id"), (snap) => {
    const id = snap.val();
    if (first) { first = false; baseline = id; return; }
    if (id && id !== baseline && !myKillIds.has(id)) lockToGame();
  }, () => { /* control path not readable: kill still deletes messages */ }));
}

function stopListeners() {
  unsubscribers.forEach((off) => off());
  unsubscribers = [];
}

// ---------- Presence ----------
// Online = at least one device with the chat open and visible. Each device owns one entry,
// so closing one device never marks the person offline while another is still open.
function setPresence(me) {
  if (!db || currentUser !== me || !live.connRef) return;
  if (document.visibilityState === "visible") {
    quiet(fb.set(live.connRef, true));
  } else {
    quiet(fb.remove(live.connRef));
    quiet(fb.set(fb.ref(db, `presence/${me}/at`), fb.serverTimestamp()));
  }
}

function renderStatus() {
  const name = live.other ? users[live.other].name.toUpperCase() : "";
  const p = live.otherPresence;
  let text, cls;
  if (!live.connected) {
    text = live.everOnline ? "○ you're offline" : "connecting…";
    cls = live.everOnline ? "offline" : "";
  } else if (p && p.conns && Object.keys(p.conns).length > 0) {
    text = `● ${name} online`; cls = "online";
  } else if (p && typeof p.at === "number") {
    text = `${name} last on ${formatTime(p.at)}`; cls = "";
  } else {
    text = `${name} offline`; cls = "";
  }
  el.conn.textContent = text;
  el.conn.className = "conn " + cls;
}

// ---------- Messages ----------
function findMessage(id) {
  return el.messages.querySelector(`[data-id="${CSS.escape(id)}"]`);
}

function renderMessage(id, msg, prevKey) {
  if (!msg || typeof msg.text !== "string" || !users[msg.sender]) return;
  if (findMessage(id)) return;

  el.messages.querySelector(".empty")?.remove();

  const nearBottom = el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 80;
  const isMine = msg.sender === currentUser;

  const li = document.createElement("li");
  li.className = "msg" + (isMine ? " mine" : "");
  li.dataset.id = id;
  li.dataset.ts = typeof msg.timestamp === "number" ? msg.timestamp : 0;

  const head = document.createElement("div");
  head.className = "msg-head";
  head.textContent = users[msg.sender].name.toUpperCase() + " · ";
  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = formatTime(msg.timestamp);
  head.appendChild(time);
  if (isMine) {
    const tick = document.createElement("span");
    tick.className = "tick";
    head.appendChild(tick);
  }

  const text = document.createElement("div");
  text.className = "msg-text";
  text.textContent = msg.text;
  li.append(head, text);

  // Keep timestamp order even if two messages cross on the network.
  const prev = prevKey ? findMessage(prevKey) : null;
  if (prev) prev.after(li);
  else if (prevKey === null) el.messages.prepend(li);
  else el.messages.appendChild(li);

  if (isMine) updateTick(li);
  else { live.hasUnseen = true; scheduleMarkSeen(); }

  if (isMine || nearBottom) el.messages.scrollTop = el.messages.scrollHeight;
}

// The server replaces the estimated timestamp with the real one after a send.
function updateMessageTime(id, msg) {
  const li = findMessage(id);
  if (!li || !msg || typeof msg.timestamp !== "number") return;
  li.dataset.ts = msg.timestamp;
  const time = li.querySelector(".msg-time");
  if (time) time.textContent = formatTime(msg.timestamp);
  if (li.classList.contains("mine")) updateTick(li);
}

function updateTick(li) {
  const tick = li.querySelector(".tick");
  if (!tick) return;
  const ts = Number(li.dataset.ts);
  if (live.pendingIds.has(li.dataset.id)) {
    tick.textContent = "…"; tick.className = "tick"; tick.title = "Sending";
  } else if (ts && live.otherSeenAt >= ts) {
    tick.textContent = "✓✓"; tick.className = "tick seen"; tick.title = "Seen";
  } else {
    tick.textContent = "✓"; tick.className = "tick"; tick.title = "Sent";
  }
}

// ---------- Seen receipts: one small write, batched, only while the chat is visible ----------
function scheduleMarkSeen() {
  clearTimeout(live.seenTimer);
  live.seenTimer = setTimeout(markSeen, 400);
}

function markSeen() {
  if (!live.hasUnseen || screen !== "chat" || !currentUser || document.visibilityState !== "visible") return;
  live.hasUnseen = false;
  quiet(fb.set(fb.ref(db, `seen/${currentUser}`), fb.serverTimestamp()));
}

// ---------- Typing indicator: writes only when the state flips ----------
el.input.addEventListener("input", () => {
  if (!currentUser || !db) return;
  if (!el.input.value.trim()) return stopTyping(currentUser);
  if (!live.typingOn) {
    live.typingOn = true;
    quiet(fb.set(fb.ref(db, `typing/${currentUser}`), true));
  }
  clearTimeout(live.typingTimer);
  const me = currentUser;
  live.typingTimer = setTimeout(() => stopTyping(me), TYPING_IDLE_MS);
});

function stopTyping(me) {
  clearTimeout(live.typingTimer);
  if (!live.typingOn) return;
  live.typingOn = false;
  if (me && db) quiet(fb.set(fb.ref(db, `typing/${me}`), false));
}

// ---------- Send ----------
el.composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = el.input.value.trim();
  if (!text || !currentUser || !db) return;

  const sender = currentUser;
  const receiver = otherOf(sender);
  el.input.value = "";
  stopTyping(sender);
  showError(el.chatError, "");

  // Reserve the key first so the "sending" tick shows before the local echo renders.
  const msgRef = fb.push(fb.ref(db, "messages"));
  live.pendingIds.add(msgRef.key);
  try {
    await fb.set(msgRef, { sender, receiver, text, timestamp: fb.serverTimestamp() });
  } catch (err) {
    if (screen === "chat" && currentUser === sender && !el.input.value) el.input.value = text;
    showError(el.chatError, "Message not sent: " + (err.code || err.message));
  } finally {
    live.pendingIds.delete(msgRef.key);
    const li = findMessage(msgRef.key);
    if (li) updateTick(li);
  }
});

el.switchUser.addEventListener("click", async () => {
  safeStorage("remove");
  leaveChat();
  if (USE_AUTH && auth) {
    try { await authApi.signOut(auth); } catch (err) { console.error(err); }
  }
  showLanding();
});

// ============================================================
//  KILL SWITCH — hide instantly, delete everything, kick the other device
// ============================================================
el.killSwitch.addEventListener("click", () => {
  if (el.killSwitch.disabled) return;
  el.killSwitch.disabled = true;
  const deletion = deleteAllMessages();
  lockToGame();
  deletion.catch((err) => {
    console.error(err);
    el.result.textContent = "CONNECTION ERROR";
    el.result.className = "result lose";
  });
});

async function deleteAllMessages() {
  const killId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  myKillIds.add(killId);
  try {
    // One atomic write: wipe messages + signal the other device.
    await fb.update(fb.ref(db), {
      messages: null,
      "control/kill": { id: killId, at: fb.serverTimestamp() }
    });
  } catch (err) {
    // Rules without the control path: still delete the messages.
    await fb.remove(fb.ref(db, "messages"));
  }
}

function lockToGame() {
  leaveChat();
  el.messages.innerHTML = "";
  el.typing.textContent = "";
  el.input.value = "";
  showError(el.chatError, "");
  resetGame();
  showScreen("game");
}

// ============================================================
//  PRIVACY: background auto-lock + back/forward cache
// ============================================================
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    hiddenAt = Date.now();
    if (currentUser) {
      stopTyping(currentUser);
      setPresence(currentUser);
    }
    return;
  }
  const away = hiddenAt ? Date.now() - hiddenAt : 0;
  hiddenAt = 0;
  if (screen === "chat" && AUTO_LOCK_SECONDS > 0 && away >= AUTO_LOCK_SECONDS * 1000) {
    lockToGame();
  } else if (currentUser) {
    setPresence(currentUser);
    markSeen();
  }
});

window.addEventListener("pageshow", (e) => {
  if (e.persisted && screen !== "game") lockToGame();
});

// ============================================================
//  HELPERS
// ============================================================
function formatTime(ts) {
  if (typeof ts !== "number") return "";
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

function userKeyForEmail(email) {
  return Object.keys(authEmails).find((k) => authEmails[k].toLowerCase() === (email || "").toLowerCase());
}

function showError(target, message) {
  target.textContent = message;
}

function safeStorage(action, value) {
  try {
    if (action === "get") return localStorage.getItem(STORAGE_KEY);
    if (action === "set") localStorage.setItem(STORAGE_KEY, value);
    if (action === "remove") localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable: app still works, just won't remember the user */ }
  return null;
}
