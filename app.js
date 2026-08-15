import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, GoogleAuthProvider, signInWithPopup, signOut, updateProfile,
  reauthenticateWithCredential, EmailAuthProvider, reload
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const AUTO_LOCK_MS = 5 * 60 * 1000;
let currentUser = null;
let currentNoteId = null;
let lockTimer = null;
let notesCache = [];

const $ = (s) => document.querySelector(s);
const appRoot = $("#app");

function toast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  $("#toast-root").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

function route() {
  const path = location.hash.replace(/^#/, "") || "/login";
  if (path === "/" || path === "") return go("/login");
  if (path.startsWith("/notes/")) return renderNoteEditor(path.split("/")[2]);
  if (path === "/dashboard") return renderDashboard();
  if (path === "/profile") return renderProfile();
  if (path === "/signup") return renderSignup();
  return renderLogin();
}

function go(path) { location.hash = path; }

function authGuard() {
  if (!currentUser) { go("/login"); return false; }
  return true;
}

function shell(content) {
  appRoot.innerHTML = content;
}

function passwordMeter(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const label = ["Very weak", "Weak", "Fair", "Good", "Strong", "Strong"][score];
  return `<div class="meter"><div style="width:${score * 20}%"></div></div><small>${label} · 8+ chars, upper, lower, number & special</small>`;
}

function renderLogin(error = "") {
  shell(`<div class="page center"><section class="card auth-card">
    <div class="brand">Secure Vault</div><h1>Welcome back</h1><p class="muted">Log in to your vault</p>
    ${error ? `<div class="alert error">${escapeHtml(error)}</div>` : ""}
    <form id="login-form" class="form">
      <input id="email" type="email" placeholder="Email" required autocomplete="email" />
      <input id="password" type="password" placeholder="Password" required autocomplete="current-password" />
      <button class="btn primary" type="submit">Log in</button>
    </form>
    <button id="google-login" class="btn secondary google">Continue with Google</button>
    <p class="small center-text">No account? <a href="#/signup">Sign up</a></p>
  </section></div>`);

  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#email").value.trim(); const password = $("#password").value;
    setBusy(e.submitter, true, "Logging in...");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await reload(cred.user);
      if (!cred.user.emailVerified) {
        await signOut(auth);
        toast("Please verify your email before logging in.", "error");
        return;
      }
      currentUser = cred.user; go("/dashboard");
    } catch (err) { toast(firebaseError(err), "error"); }
    finally { setBusy(e.submitter, false, "Log in"); }
  });
  $("#google-login").addEventListener("click", async () => {
    setBusy($("#google-login"), true, "Opening Google...");
    try { await signInWithPopup(auth, googleProvider); currentUser = auth.currentUser; go("/dashboard"); }
    catch (err) { toast(firebaseError(err), "error"); }
    finally { setBusy($("#google-login"), false, "Continue with Google"); }
  });
}

function renderSignup() {
  shell(`<div class="page center"><section class="card auth-card">
    <div class="brand">Secure Vault</div><h1>Create your account</h1><p class="muted">Email verification replaces the old custom OTP flow.</p>
    <form id="signup-form" class="form">
      <input id="name" type="text" maxlength="60" placeholder="Display name" required autocomplete="name" />
      <input id="email" type="email" placeholder="Email" required autocomplete="email" />
      <input id="password" type="password" minlength="8" maxlength="64" placeholder="Password" required autocomplete="new-password" />
      <div id="meter">${passwordMeter("")}</div>
      <input id="confirm" type="password" placeholder="Confirm password" required autocomplete="new-password" />
      <button class="btn primary" type="submit">Create account</button>
    </form>
    <button id="google-signup" class="btn secondary google">Sign up with Google</button>
    <p class="small center-text">Already have an account? <a href="#/login">Log in</a></p>
  </section></div>`);

  $("#password").addEventListener("input", e => { $("#meter").innerHTML = passwordMeter(e.target.value); });
  $("#signup-form").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#name").value.trim(), email = $("#email").value.trim(), password = $("#password").value, confirm = $("#confirm").value;
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}/.test(password)) return toast("Use at least 8 characters with upper, lower, number and special character.", "error");
    if (password !== confirm) return toast("Passwords do not match.", "error");
    setBusy(e.submitter, true, "Creating account...");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, "users", cred.user.uid), { email, name, provider: "password", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
      await sendEmailVerification(cred.user);
      await signOut(auth);
      toast("Account created. Check your email and verify your address.", "success");
      go("/login");
    } catch (err) { toast(firebaseError(err), "error"); }
    finally { setBusy(e.submitter, false, "Create account"); }
  });
  $("#google-signup").addEventListener("click", async () => {
    setBusy($("#google-signup"), true, "Opening Google...");
    try { const cred = await signInWithPopup(auth, googleProvider); await ensureUserProfile(cred.user, "google"); currentUser = cred.user; go("/dashboard"); }
    catch (err) { toast(firebaseError(err), "error"); }
    finally { setBusy($("#google-signup"), false, "Sign up with Google"); }
  });
}

async function ensureUserProfile(user, provider = "password") {
  const ref = doc(db, "users", user.uid); const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref, { email: user.email, name: user.displayName || "", provider, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

async function getNotes() {
  const q = query(collection(db, "users", currentUser.uid, "notes"), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function nav() {
  return `<nav><a class="brand" href="#/dashboard">Secure Vault</a><div class="nav-actions"><a href="#/profile">${escapeHtml(currentUser.displayName || currentUser.email)}</a><button id="logout" class="btn tiny">Log out</button></div></nav>`;
}

async function renderDashboard() {
  if (!authGuard()) return;
  shell(`${nav()}<main class="container"><div class="heading"><div><h1>Your notes</h1><p class="muted">Private notes stored in Firebase Firestore.</p></div><a class="btn primary" href="#/notes/new">+ New note</a></div><div id="notes" class="notes-grid"><p class="muted">Loading...</p></div></main>`);
  $("#logout").onclick = async () => { await signOut(auth); currentUser = null; go("/login"); };
  try {
    notesCache = await getNotes();
    $("#notes").innerHTML = notesCache.length ? notesCache.map(n => `<article class="note-card"><a href="#/notes/${n.id}"><strong>${escapeHtml(n.title)}</strong><span>${n.updatedAt?.toDate ? n.updatedAt.toDate().toLocaleString() : ""}</span></a><button class="delete-note" data-id="${n.id}">Delete</button></article>`).join("") : `<div class="empty card"><h3>No notes yet</h3><p class="muted">Create your first secure note.</p><a class="btn primary" href="#/notes/new">Create note</a></div>`;
    document.querySelectorAll(".delete-note").forEach(btn => btn.onclick = async () => {
      if (!confirm("Delete this note?")) return;
      try { await deleteDoc(doc(db, "users", currentUser.uid, "notes", btn.dataset.id)); toast("Note deleted.", "success"); renderDashboard(); }
      catch (err) { toast(firebaseError(err), "error"); }
    });
  } catch (err) { $("#notes").innerHTML = `<div class="alert error">${escapeHtml(firebaseError(err))}</div>`; }
}

async function renderNoteEditor(id) {
  if (!authGuard()) return;
  const isNew = id === "new";
  currentNoteId = isNew ? null : id;
  shell(`${nav()}<main class="container narrow"><div class="heading"><div><h1>${isNew ? "New note" : "Edit note"}</h1><p class="muted">Auto-locks after 5 minutes of inactivity.</p></div><a class="btn tiny" href="#/dashboard">Back</a></div><section id="editor-card" class="card editor"><label>Title<input id="title" maxlength="200" placeholder="Note title" /></label><label>Content<textarea id="content" rows="16" placeholder="Write your private note..."></textarea></label><div class="row"><button id="save" class="btn primary">Save note</button><button id="lock" class="btn secondary">Lock now</button></div></section></main>`);
  $("#logout").onclick = async () => { await signOut(auth); currentUser = null; go("/login"); };
  if (!isNew) {
    try { const snap = await getDoc(doc(db, "users", currentUser.uid, "notes", id)); if (!snap.exists()) { toast("Note not found.", "error"); return go("/dashboard"); } $("#title").value = snap.data().title || ""; $("#content").value = snap.data().content || ""; }
    catch (err) { toast(firebaseError(err), "error"); }
  }
  $("#save").onclick = async () => {
    const title = $("#title").value.trim(), content = $("#content").value;
    if (!title || !content.trim()) return toast("Title and content are required.", "error");
    setBusy($("#save"), true, "Saving...");
    try {
      const payload = { title, content, updatedAt: serverTimestamp() };
      if (isNew) await addDoc(collection(db, "users", currentUser.uid, "notes"), { ...payload, createdAt: serverTimestamp() });
      else await updateDoc(doc(db, "users", currentUser.uid, "notes", id), payload);
      toast("Note saved.", "success"); setTimeout(() => go("/dashboard"), 500);
    } catch (err) { toast(firebaseError(err), "error"); }
    finally { setBusy($("#save"), false, "Save note"); }
  };
  $("#lock").onclick = lockEditor;
  startAutoLock();
}

function lockEditor() {
  const card = $("#editor-card"); if (!card) return;
  ["#title", "#content", "#save"].forEach(s => { const el = $(s); if (el) el.disabled = true; });
  card.insertAdjacentHTML("beforeend", `<div id="lock-overlay" class="lock-overlay"><div><h2>Vault locked</h2><p class="muted">Inactive for 5 minutes.</p><button id="unlock" class="btn primary">Unlock</button></div></div>`);
  $("#unlock").onclick = unlockEditor;
}

async function unlockEditor() {
  const overlay = $("#lock-overlay"); if (!overlay) return;
  try {
    await reload(currentUser);
    if (currentUser.providerData.some(p => p.providerId === "password")) {
      const password = prompt("Enter your account password to unlock:");
      if (!password) return;
      await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, password));
    } else {
      await signInWithPopup(auth, googleProvider);
    }
    overlay.remove(); ["#title", "#content", "#save"].forEach(s => { const el = $(s); if (el) el.disabled = false; }); startAutoLock(); toast("Vault unlocked.", "success");
  } catch (err) { toast("Unlock failed.", "error"); }
}

function startAutoLock() {
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(lockEditor, AUTO_LOCK_MS);
  ["mousemove", "keydown", "click", "scroll"].forEach(ev => window.addEventListener(ev, resetLock, { passive: true }));
}
function resetLock() { if (!$("#editor-card") || $("#lock-overlay")) return; clearTimeout(lockTimer); lockTimer = setTimeout(lockEditor, AUTO_LOCK_MS); }

async function renderProfile() {
  if (!authGuard()) return;
  const snap = await getDoc(doc(db, "users", currentUser.uid)); const data = snap.exists() ? snap.data() : {};
  shell(`${nav()}<main class="container narrow"><section class="card"><h1>Profile</h1><p class="muted">Manage your Firebase account profile.</p><form id="profile-form" class="form"><label>Display name<input id="profile-name" maxlength="60" value="${escapeHtml(data.name || currentUser.displayName || "")}" required /></label><label>Email<input value="${escapeHtml(currentUser.email || "")}" disabled /></label><button class="btn primary">Save profile</button></form><div class="divider"></div><button id="verify" class="btn secondary">${currentUser.emailVerified ? "Email verified ✓" : "Send verification email"}</button></section></main>`);
  $("#logout").onclick = async () => { await signOut(auth); currentUser = null; go("/login"); };
  $("#profile-form").onsubmit = async e => { e.preventDefault(); const name = $("#profile-name").value.trim(); try { await updateProfile(currentUser, { displayName: name }); await setDoc(doc(db, "users", currentUser.uid), { name, updatedAt: serverTimestamp() }, { merge: true }); toast("Profile updated.", "success"); } catch (err) { toast(firebaseError(err), "error"); } };
  $("#verify").onclick = async () => { try { await sendEmailVerification(currentUser); toast("Verification email sent.", "success"); } catch (err) { toast(firebaseError(err), "error"); } };
}

function setBusy(btn, busy, label) { if (!btn) return; btn.disabled = busy; btn.textContent = label; }
function firebaseError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-credential": "Incorrect email or password.", "auth/invalid-login-credentials": "Incorrect email or password.",
    "auth/email-already-in-use": "This email is already registered.", "auth/weak-password": "Password is too weak.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.", "auth/popup-blocked": "Google popup was blocked. Allow popups and try again.",
    "auth/unauthorized-domain": "This domain is not authorized in Firebase Authentication.", "permission-denied": "Firebase permission denied. Check Firestore Security Rules.",
    "failed-precondition": "Firestore needs an index or configuration update."
  };
  return map[code] || err?.message || "Something went wrong.";
}

window.addEventListener("hashchange", route);
onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) await ensureUserProfile(user, user.providerData[0]?.providerId === "google.com" ? "google" : "password");
  const path = location.hash.replace(/^#/, "") || "/login";
  if (user && (path === "/login" || path === "/signup" || path === "/")) go("/dashboard");
  else if (!user && (path === "/dashboard" || path === "/profile" || path.startsWith("/notes/"))) go("/login");
  else route();
});
