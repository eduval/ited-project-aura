// js/setting.js
import { auth, db } from "./firebase-config.js";
import {
  ref,
  get,
  update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  // Element references
  const nameCard = document.getElementById("name-card");
  const accountName = document.getElementById("account-name");
  const accountPhone = document.getElementById("account-phone");
  const fnameInput = document.getElementById("user-fname");
  const lnameInput = document.getElementById("user-lname");
  const phoneInput = document.getElementById("user-phone");
  const editForm = document.querySelector("#modal-account-edit form");

  const currentEmailEl = document.getElementById("user-current-email");
  const newEmailInput = document.getElementById("user-newemail");
  const emailPassInput = document.getElementById("user-emailpassconfirm");

  const profileNameEl = document.getElementById("profile-name");
  const profileRoleEl = document.getElementById("profile-role");
  const profileLastLoginEl = document.getElementById("profile-last-login");
  const currentEmailElem = document.getElementById("current-email");
  const profileLocationEl = document.getElementById("profile-location"); // ✅ Location element

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    const uid = user.uid;
    const userRef = ref(db, `users/${uid}`);

    try {
      const snapshot = await get(userRef);
      if (!snapshot.exists()) return;

      const data = snapshot.val();

      // Extract values
      const fullName = data?.name || user.displayName || "Unknown";
      const phone = data?.phone || "Not provided";
      const firstName = data?.account?.first || fullName.split(" ")[0] || "";
      const lastName = data?.account?.last || fullName.split(" ").slice(1).join(" ") || "";

      // Update name, phone, email
      if (nameCard) nameCard.textContent = fullName;
      if (accountName) accountName.textContent = `Name: ${fullName}`;
      if (accountPhone) accountPhone.textContent = `Phone: ${phone}`;
      if (fnameInput) fnameInput.value = firstName;
      if (lnameInput) lnameInput.value = lastName;
      if (phoneInput) phoneInput.value = phone;
      if (currentEmailEl) currentEmailEl.textContent = user.email || "Unavailable";
      if (currentEmailElem && user.email) currentEmailElem.textContent = user.email;

      // Profile card updates
      if (profileNameEl) profileNameEl.textContent = fullName;
      if (profileRoleEl) profileRoleEl.textContent = data?.role || "Unknown";
      const rawTime = data?.logins?.lastLogin;
      const formatted = rawTime
        ? new Date(rawTime).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short"
          })
        : "Unavailable";
      if (profileLastLoginEl) profileLastLoginEl.textContent = formatted;

      // ✅ Show location
      if (profileLocationEl && data.location) {
        const { lat, lng } = data.location;
        profileLocationEl.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }

      // 🔄 Handle form submission
      editForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const first = fnameInput?.value.trim() || "";
        const last = lnameInput?.value.trim() || "";
        const fullName = `${first} ${last}`.trim();
        const phone = phoneInput?.value.trim() || "";
        const newEmail = newEmailInput?.value.trim();
        const password = emailPassInput?.value.trim();

        try {
          await update(userRef, {
            name: fullName,
            phone: phone,
            account: {
              first: first,
              last: last
            }
          });

          await updateProfile(auth.currentUser, { displayName: fullName });

          if (nameCard) nameCard.textContent = fullName;
          if (accountName) accountName.textContent = `Name: ${fullName}`;
          if (accountPhone) accountPhone.textContent = `Phone: ${phone}`;
          if (profileNameEl) profileNameEl.textContent = fullName;

          if (newEmail && newEmail !== user.email) {
            if (!user.emailVerified) {
              await sendEmailVerification(user);
              alert("📩 Please verify your current email first.");
              return;
            }

            const credential = EmailAuthProvider.credential(user.email, password);
            await reauthenticateWithCredential(user, credential);
            await updateEmail(user, newEmail);
            await sendEmailVerification(user);

            alert("📩 Verification sent to new email. Click it to confirm.");
          }

          const modal = bootstrap.Modal.getInstance(document.getElementById("modal-account-edit"));
          modal?.hide();
          alert("✅ Profile updated.");
        } catch (err) {
          console.error("❌ Error updating account info:", err);
          alert("⚠️ Failed to update profile. Please check your email/password.");
        }
      });

    } catch (err) {
      console.error("❌ Failed to load user profile:", err);
    }
  });
});
