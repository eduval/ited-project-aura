import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // User logged out — optionally hide or clear user menu
            return;
        }

        try {
            // Fetch user info from Realtime Database
            const userRef = ref(db, `users/${user.uid}`);
            const snap = await get(userRef);
            if (!snap.exists()) {
                console.warn('User profile not found in DB');
                return;
            }

            const userData = snap.val();


            // Prepare fields
            const name = userData.name || 'No Name';
            const email = user.email || 'No Email';
            const role = userData.role || 'No Role';
            const photoURL = userData.photoURL || null;
            const lastLogin = user.metadata?.lastSignInTime
                ? new Date(user.metadata.lastSignInTime).toLocaleString()
                : 'Unknown';

            // Prepare initials if no photo
            const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();

            // Update dropdown user info safely
            const nameElem = document.getElementById('user-name');
            if (nameElem) nameElem.textContent = name;

            const emailElem = document.getElementById('user-email');
            if (emailElem) {
                emailElem.textContent = email;

                // Remove old role if exists
                const oldRoleElem = document.getElementById('user-role');
                if (oldRoleElem) oldRoleElem.remove();

                // Insert role after email
                const roleElem = document.createElement('span');
                roleElem.id = 'user-role';
                roleElem.className = 'd-block smaller fw-medium text-truncate';
                roleElem.textContent = `Role: ${role}`;

                emailElem.insertAdjacentElement('afterend', roleElem);
            }

            const lastLoginElem = document.getElementById('last-login');
            if (lastLoginElem) lastLoginElem.textContent = lastLogin;

            const avatarBtn = document.getElementById('dropdownAccountOptions');
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

            const accountDropdown = document.getElementById('account-dropdown');
            if (accountDropdown) {
                accountDropdown.style.display = 'block';
            }

        } catch (error) {
            console.error('Error fetching user profile:', error);
        }
    });
});
