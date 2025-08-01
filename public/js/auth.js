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

// Get form and message elements
const loginForm = document.getElementById("login-form");
const statusMsg = document.getElementById("login-error");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Get input values by ID (matches your HTML)
    const email = document.getElementById("account_email").value.trim();
    const password = document.getElementById("account_passwd").value.trim();

    // Clear old status
    statusMsg.style.display = "none";
    statusMsg.textContent = "";

    try {
      // Firebase login
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;
      const userRef = ref(db, `users/${uid}`);

      console.log("✅ Logged in:", uid);

      const userSnap = await get(userRef);

      if (userSnap.exists()) {
        console.log("👤 Existing user → updating info");
        await update(userRef, {
          email: email,
          enable: true
        });
      } else {
        console.log("🆕 New user → creating profile");
        await set(userRef, {
          email: email,
          enable: true,
          name: "Unknown",
          role: "operator"
        });
      }

      // Log login time
      const now = new Date().toISOString();
      await push(ref(db, `users/${uid}/logins`), now);
      console.log("📌 Login time recorded");

      // ✅ Redirect to dashboard
      console.log("➡️ Redirecting to dashboard.html...");
      window.location.href = "dashboard.html";

    } catch (err) {
      console.error("❌ Login failed:", err.message);
      if (statusMsg) {
        statusMsg.style.display = "block";
        statusMsg.textContent = `❌ ${err.message}`;
      }
    }
  });
}
