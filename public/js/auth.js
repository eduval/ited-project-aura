// js/auth.js
// Handles login, keeps a user record in RTDB, and blocks disabled accounts.

import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  ref,
  get,
  set,
  update,
  push,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const loginForm = document.getElementById("login-form");
const statusMsg = document.getElementById("login-error");

function setStatus(message, isError = true) {
  if (!statusMsg) return;
  statusMsg.style.display = "block";
  statusMsg.textContent = message;
  statusMsg.classList.toggle("text-danger", isError);
  statusMsg.classList.toggle("text-success", !isError);
}

// Login flow
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("account_email")?.value?.trim() || "";
    const password = document.getElementById("account_passwd")?.value?.trim() || "";
    if (!email || !password) {
      setStatus("Please enter email and password.", true);
      return;
    }

    setStatus("Signing in...", false);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;
      const userRef = ref(db, `users/${uid}`);

      // Ensure/refresh RTDB record (do NOT re-enable here)
      const snap = await get(userRef);
      if (snap.exists()) {
        await update(userRef, {
          email: email,
          // never set enabled here—respect admin decision
          "logins/lastLogin": Date.now(),
          // lightweight history marker (optional)
          "logins/history": push(ref(db, `users/${uid}/logins/history`)).key ? Date.now() : Date.now(),
        });
      } else {
        await set(userRef, {
          email: email,
          name: userCred.user.displayName || "Unknown",
          role: "operator",      // default role; adjust as needed
          enabled: true,         // new users start enabled
          createdAt: Date.now(),
          logins: { lastLogin: Date.now() },
        });
      }

      // Gate by enabled flag
      const enabledSnap = await get(ref(db, `users/${uid}/enabled`));
      const enabled = enabledSnap.exists() ? !!enabledSnap.val() : true;

      if (!enabled) {
        setStatus("Your account is disabled. Please contact an administrator.", true);
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }

      setStatus("Signed in ✓", false);
      window.location.href = "dashboard.html";
    } catch (err) {
      console.error(err);
      setStatus("Invalid credentials or network error.", true);
    }
  });
}

// Global guard: if a disabled user loads a page, kick them out
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const enabledSnap = await get(ref(db, `users/${user.uid}/enabled`));
    const enabled = enabledSnap.exists() ? !!enabledSnap.val() : true;
    if (!enabled) {
      alert("Your account is disabled. Please contact an administrator.");
      await signOut(auth);
      window.location.href = "index.html";
    }
  } catch (e) {
    console.warn("Enabled check failed:", e);
  }
});