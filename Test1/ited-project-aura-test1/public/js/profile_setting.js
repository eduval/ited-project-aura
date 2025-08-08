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
  // ===== Common elements (header dropdown) =====
  const nameElem = document.getElementById("user-name");
  const emailElem = document.getElementById("user-email");
  const lastLoginElem = document.getElementById("last-login"); // optional id in some headers
  const avatarBtn = document.getElementById("dropdownAccountOptions");
  const accountDropdown = document.getElementById("account-dropdown");

  // ===== Profile page / Settings page display fields =====
  const profileNameEl = document.getElementById("profile-name");
  const profileRoleEl = document.getElementById("profile-role");
  const profileLastLoginEl = document.getElementById("profile-last-login");
  const profileLocationEl = document.getElementById("profile-location");
  const currentEmailElem = document.getElementById("current-email");
  const accountPhoneElem = document.getElementById("account-phone");

  // ===== Account edit modal fields (Settings page) =====
  const nameCard = document.getElementById("name-card");
  const accountName = document.getElementById("account-name");
  const fnameInput = document.getElementById("user-fname");
  const lnameInput = document.getElementById("user-lname");
  const phoneInput = document.getElementById("user-phone");
  const editForm = document.querySelector("#modal-account-edit form");

  // ===== Email change modal fields (Settings page) =====
  const newEmailInput = document.getElementById("user-newemail");
  const emailPassInput = document.getElementById("user-emailpassconfirm");

  // Optional: link to profile page (if present in dropdown or elsewhere)
  const profileLink = document.getElementById("profile-link"); // if you add <a id="profile-link" href="profile.html">

  // Helper: set avatar initials if no photo
  const setAvatar = (btn, name, photoURL) => {
    if (!btn) return;
    if (photoURL) {
      btn.style.backgroundImage = `url(${photoURL})`;
      btn.textContent = "";
      btn.classList.remove("fw-bold", "small");
    } else {
      const initials = (name || "U")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase();
      btn.style.backgroundImage = "";
      btn.textContent = initials || "U";
      btn.classList.add("fw-bold", "small");
    }
  };

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // Not logged in — nothing to populate
      return;
    }

    const uid = user.uid;
    const userRef = ref(db, `users/${uid}`);

    try {
      const snap = await get(userRef);
      if (!snap.exists()) {
        console.warn("User profile not found in DB");
        // Still show basic data from Firebase Auth where possible
      }

      const data = snap.exists() ? snap.val() : {};
      const fullName = data?.name || user.displayName || "No Name";
      const email = user.email || "No Email";
      const role = data?.role || "No Role";
      const phone = data?.phone || "Not provided";
      const photoURL = data?.photoURL || user.photoURL || null;

      // last login: prefer auth metadata if available
      const lastLoginRaw =
        user.metadata?.lastSignInTime || data?.logins?.lastLogin || null;
      const lastLoginFormatted = lastLoginRaw
        ? new Date(lastLoginRaw).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "Unknown";

      // ----- HEADER DROPDOWN (account.js functionality) -----
      if (nameElem) nameElem.textContent = fullName;
      if (emailElem) {
        emailElem.textContent = email;

        // Insert or update a role line under email using #user-role id
        let roleElem = document.getElementById("user-role");
        if (!roleElem) {
          roleElem = document.createElement("span");
          roleElem.id = "user-role";
          roleElem.className = "d-block smaller fw-medium text-truncate";
          emailElem.insertAdjacentElement("afterend", roleElem);
        }
        roleElem.textContent = `Role: ${role}`;
      }
      if (lastLoginElem) lastLoginElem.textContent = lastLoginFormatted;

      setAvatar(avatarBtn, fullName, photoURL);

      if (accountDropdown) accountDropdown.style.display = "block";

      // ----- PROFILE DISPLAY (profile_setting.js display part) -----
      if (profileNameEl) profileNameEl.textContent = fullName;
      if (profileRoleEl) profileRoleEl.textContent = `Role: ${role}`;
      if (profileLastLoginEl)
        profileLastLoginEl.textContent = lastLoginFormatted;
      if (profileLocationEl && data.location) {
        const { lat, lng, city } = data.location;
        // If you later store {city} in DB, prefer it; otherwise show lat/lng
        profileLocationEl.textContent =
          city?.trim() ? `📍 ${city}` :
          (lat && lng ? `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Location: Unknown");
      }
      if (currentEmailElem) currentEmailElem.textContent = email;
      if (accountPhoneElem) accountPhoneElem.textContent = phone;

      // ----- SETTINGS: prefill modal inputs -----
      if (nameCard) nameCard.textContent = fullName;
      if (accountName) accountName.textContent = `Name: ${fullName}`;

      // Split name into first/last using DB if available
      const firstName = data?.account?.first || fullName.split(" ")[0] || "";
      const lastName =
        data?.account?.last || fullName.split(" ").slice(1).join(" ") || "";

      if (fnameInput) fnameInput.value = lastName; // Note: original settings.html had fname/lname swapped
      if (lnameInput) lnameInput.value = firstName;
      if (phoneInput) phoneInput.value = phone;

      // ----- SETTINGS: handle profile update submit -----
      if (editForm) {
        // Avoid duplicate listeners if auth state fires again
        editForm.addEventListener(
          "submit",
          async (e) => {
            e.preventDefault();

            const first =
              (fnameInput?.value || "").trim(); // original ids are swapped in HTML
            const last = (lnameInput?.value || "").trim();
            const newPhone = (phoneInput?.value || "").trim();

            // If your HTML had first/last reversed, keep using the same pattern users already expect visually
            const newFullName = `${last} ${first}`.trim();

            try {
              // Update in Realtime DB
              await update(userRef, {
                name: newFullName,
                phone: newPhone,
                account: {
                  first: last,
                  last: first,
                },
              });

              // Update Firebase Auth profile name too
              await updateProfile(auth.currentUser, { displayName: newFullName });

              // Reflect in UI
              if (nameCard) nameCard.textContent = newFullName;
              if (accountName) accountName.textContent = `Name: ${newFullName}`;
              if (profileNameEl) profileNameEl.textContent = newFullName;
              if (accountPhoneElem) accountPhoneElem.textContent = newPhone;
              if (nameElem) nameElem.textContent = newFullName;
              setAvatar(avatarBtn, newFullName, photoURL);

              // If email change fields present and user wrote a new email, process it
              const newEmail = newEmailInput?.value.trim();
              const pass = emailPassInput?.value.trim();

              if (newEmail && newEmail !== user.email) {
                if (!user.emailVerified) {
                  await sendEmailVerification(user);
                  alert("📩 Please verify your current email first.");
                } else {
                  if (!pass) {
                    alert("Please enter your account password to change email.");
                  } else {
                    const cred = EmailAuthProvider.credential(user.email, pass);
                    await reauthenticateWithCredential(user, cred);
                    await updateEmail(user, newEmail);
                    await sendEmailVerification(user);
                    alert("📩 Verification sent to the new email. Click it to confirm.");
                  }
                }
              }

              // Close the modal if Bootstrap available
              try {
                const modalEl = document.getElementById("modal-account-edit");
                // v5
                const modal = bootstrap?.Modal?.getInstance?.(modalEl) || new bootstrap.Modal(modalEl);
                modal?.hide();
              } catch (_) {}

              alert("✅ Profile updated.");
            } catch (err) {
              console.error("❌ Error updating account info:", err);
              alert("⚠️ Failed to update profile. Please check your inputs.");
            }
          },
          { once: true } // prevent double-binding
        );
      }

      // Optional: if you want avatar click to go directly to profile.html on pages with no dropdown
      if (profileLink && avatarBtn) {
        avatarBtn.addEventListener("click", (e) => {
          // If your UI should open dropdown, comment the next two lines
          // e.preventDefault();
          // window.location.href = "profile.html";
        });
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  });
});
