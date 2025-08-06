// js/account.js
import { auth, db } from './firebase-config.js';
import {
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

import {
  ref,
  get
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

document.addEventListener('DOMContentLoaded', () => {
  const nameElem = document.getElementById('user-name');
  const emailElem = document.getElementById('user-email');
  const lastLoginElem = document.getElementById('last-login');
  const avatarBtn = document.getElementById('dropdownAccountOptions'); 
  const accountDropdown = document.getElementById('account-dropdown');

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    const uid = user.uid;

    try {
      const snap = await get(ref(db, `users/${uid}`));
      const data = snap.exists() ? snap.val() : {};

      const fullName = data?.name || user.displayName || 'No Name';
      const email = user.email || 'Unavailable';
      const role = data?.role || 'No Role';
      const photoURL = data?.photoURL || user.photoURL || null;

      const lastLoginRaw = data?.logins?.lastLogin || user.metadata?.lastSignInTime || null;
      const lastLoginFormatted = lastLoginRaw
        ? new Date(lastLoginRaw).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : 'Unknown';

      const initials = fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase();

      // 👉 Set user info
      if (nameElem) nameElem.textContent = fullName;
      if (emailElem) {
        emailElem.textContent = email;

        const roleElem = document.getElementById('user-role');
        if (roleElem) {
          roleElem.textContent = `Role: ${role}`;
        }
      }

      if (lastLoginElem) lastLoginElem.textContent = lastLoginFormatted;

      // 👉 Set avatar (optional)
      if (avatarBtn) {
        if (photoURL) {
          avatarBtn.style.backgroundImage = `url(${photoURL})`;
          avatarBtn.textContent = '';
        } else {
          avatarBtn.style.backgroundImage = '';
          avatarBtn.textContent = initials;
          avatarBtn.classList.add('fw-bold', 'small');
        }
      }

      if (accountDropdown) {
        accountDropdown.style.display = 'block';
      }

    } catch (error) {
      console.error("❌ Error fetching user data:", error);
    }
  });
});
