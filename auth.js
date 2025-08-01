// /js/auth.js

import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  ref,
  push,
  update,
  get,
  set
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Elements
const loginForm = document.getElementById("login-form");
const statusMsg = document.getElementById("status");

// ✅ LOGIN HANDLER
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = e.target.email.value.trim();
    const password = e.target.password.value.trim();

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;
      const userRef = ref(db, `users/${uid}`);

      console.log("✅ Logged in:", uid);

      try {
        const userSnap = await get(userRef);

        if (userSnap.exists()) {
          // ✅ Existing user: only update email + enable
          console.log("👤 Existing user → updating email/enable");
          await update(userRef, {
            email: email,
            enable: true
          });
        } else {
          // 🆕 New user: create full profile with default values
          console.log("🆕 New user → creating full profile");
          await set(userRef, {
            email: email,
            enable: true,
            name: "Unknown",
            role: "operator"
          });
        }

        // ✅ Append login timestamp
        const now = new Date().toISOString();
        await push(ref(db, `users/${uid}/logins`), now);
        console.log("📌 Login time saved");

        // ✅ Redirect to dashboard
        window.location.href = "dashboard.html";

      } catch (writeError) {
        console.error("❌ Failed to update user info:", writeError.message);
        statusMsg && (statusMsg.innerText = `❌ Failed to update user info`);
      }

    } catch (err) {
      console.error("❌ Login error:", err.message);
      statusMsg && (statusMsg.innerText = `❌ ${err.message}`);
    }
  });
}
