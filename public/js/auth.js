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

    const email = document.getElementById("account_email").value.trim();
    const password = document.getElementById("account_passwd").value.trim();

    statusMsg.style.display = "none";
    statusMsg.textContent = "";

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;
      const userRef = ref(db, `users/${uid}`);

      // Get geolocation (browser-based)
      let location = { lat: null, lng: null };
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });

        location.lat = position.coords.latitude;
        location.lng = position.coords.longitude;

        console.log("📍 Location captured:", location);
      } catch (geoErr) {
        console.warn("⚠️ Location not available:", geoErr.message);
      }

      const userSnap = await get(userRef);

      if (userSnap.exists()) {
        console.log("👤 Existing user → updating info");
        await update(userRef, {
          email: email,
          enable: true,
          location: location  // ✅ Save location
        });
      } else {
        console.log("🆕 New user → creating profile");
        await set(userRef, {
          email: email,
          enable: true,
          name: "Unknown",
          role: "operator",
          location: location  // ✅ Save location
        });
      }

      // Log login time and location
      const now = new Date().toISOString();
      await update(ref(db, `users/${uid}/logins`), {
        lastLogin: now,
        lastLocation: location
      });
      await push(ref(db, `users/${uid}/logins/history`), {
        timestamp: now,
        location: location
      });

      console.log("📌 Login time and location recorded");

      // ✅ Redirect
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
