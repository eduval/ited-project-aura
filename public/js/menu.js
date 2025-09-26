// menu.js — role-aware dynamic menu with unread Alerts badge

import { auth, db } from './firebase-config.js';
import {
  ref,
  get,
  onValue,
  query,
  orderByChild,
  equalTo
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const currentPath = window.location.pathname.split('/').pop();
const dynamicMenu = document.getElementById('dynamicMenu');

// ----------------------------
// Initial loading placeholder
// ----------------------------
dynamicMenu.innerHTML = `
  <li class="text-center py-4">
    <div class="spinner-grow text-primary" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
  </li>
`;

// ----------------------------
// Helpers
// ----------------------------
function safeIconSvg(item) {
  const svg = item?.iconSvg || item?.iconsvg;
  return svg
    ? `<span class="nav-link-icon" style="margin-right:12px;display:inline-flex;align-items:center;">${svg}</span>`
    : '';
}

function userCanSee(item, role) {
  const r = item?.roles;
  if (!r) return true;
  const norm = v => String(v).toLowerCase();
  if (typeof r === 'string') return norm(r) === role;
  if (Array.isArray(r)) return r.map(norm).includes(role);
  if (typeof r === 'object') return Object.values(r).map(norm).includes(role);
  return false;
}

async function getCurrentUserRole() {
  return new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(async user => {
      unsub && unsub();
      if (!user) return resolve('guest');

      try {
        const uidSnap = await get(ref(db, `users/${user.uid}/role`));
        if (uidSnap.exists()) return resolve(String(uidSnap.val()).toLowerCase());

        if (user.email) {
          const q = query(ref(db, 'users'), orderByChild('email'), equalTo(user.email));
          const byEmail = await get(q);
          if (byEmail.exists()) {
            const firstKey = Object.keys(byEmail.val())[0];
            const role = byEmail.val()[firstKey]?.role;
            if (role) return resolve(String(role).toLowerCase());
          }
        }
      } catch (e) {
        console.warn('[menu] role lookup failed, defaulting to guest:', e);
      }
      resolve('guest');
    });
  });
}

function isActiveForPath(item) {
  const own = item?.link && item.link.split('/').pop() === currentPath;
  if (own) return true;
  if (item?.children) {
    return Object.values(item.children).some(
      c => c?.link && c.link.split('/').pop() === currentPath
    );
  }
  return false;
}

// ----------------------------
// Live Alerts unread badge
// ----------------------------
const alertsRef = ref(db, 'alerts');
let unreadAlertCount = 0;

onValue(alertsRef, snapshot => {
  if (!snapshot.exists()) return;

  const alerts = snapshot.val();
  let unread = 0;

  for (const uploadKey in alerts) {
    const group = alerts[uploadKey];
    for (const alertKey in group) {
      const alert = group[alertKey];
      if (alert && alert.read === false) unread++;
    }
  }

  unreadAlertCount = unread;

  const badgeEl = dynamicMenu.querySelector('.notification-count-alerts');
  if (badgeEl) {
    badgeEl.textContent = unreadAlertCount;
    badgeEl.style.display = unreadAlertCount > 0 ? 'inline-block' : 'none';
  }
});

// ----------------------------
// Renderers
// ----------------------------
function renderMenuItem(key, item, role) {
  if (!item?.enable || !userCanSee(item, role)) return '';

  const iconHtml = safeIconSvg(item);
  const hasChildren = item?.children && Object.values(item.children)
    .some(c => c && c.enable && userCanSee(c, role));
  const isActive = isActiveForPath(item);

  const badgeHtml = item.title === "Alerts"
    ? `<span class="notification-count-alerts"
         style="position:absolute;top:-10px;right:-20px;background:red;color:white;border-radius:50%;padding:5px 5px;font-size:12px;${unreadAlertCount > 0 ? '' : 'display:none;'}">
         ${unreadAlertCount}
       </span>`
    : '';

  if (hasChildren) {
    const childrenHTML = Object.entries(item.children)
      .filter(([_, c]) => c && c.enable && userCanSee(c, role))
      .sort(([, a], [, b]) => (a.id || 0) - (b.id || 0))
      .map(([childKey, childItem]) => renderMenuItem(childKey, childItem, role))
      .join('');

    return `
<li class="nav-item${isActive ? ' active' : ''}" style="position:relative;">
  <a class="nav-link" href="#">
    ${iconHtml}
    <span style="line-height:1;position:relative;">${item.title}${badgeHtml}</span>
    <span class="group-icon float-end">
      <i class="fi fi-arrow-end${isActive ? ' d-none' : ''}"></i>
      <i class="fi fi-arrow-down${isActive ? '' : ' d-none'}"></i>
    </span>
  </a>
  <ul class="nav flex-column ms-3${isActive ? '' : ' d-none'}"
      style="${isActive ? 'display:block;visibility:visible;height:auto;overflow:visible;' : ''} margin-left:0;padding-left:20px;">
    ${childrenHTML}
  </ul>
</li>`;
  }

  return `
<li class="nav-item${isActive ? ' active' : ''}" style="position:relative;">
  <a class="nav-link" href="${item.link || '#'}" style="display:flex;align-items:center;position:relative;">
    ${iconHtml}
    <span style="line-height:1;position:relative;">${item.title}${badgeHtml}</span>
  </a>
</li>`;
}

// ----------------------------
// Init: get role → load menu → render → wire toggles
// ----------------------------
(async function initMenu() {
  const role = await getCurrentUserRole();
  //console.log('[menu] role =', role, 'user =', auth.currentUser?.uid, auth.currentUser?.email);

  const menuRef = ref(db, 'menu');

  try {
    const snap = await get(menuRef);
    if (!snap.exists()) {
      dynamicMenu.innerHTML = `<li class="text-center py-3 text-muted">No menu data found</li>`;
      console.warn('[menu] no menu data');
      return;
    }

    const menu = snap.val();

    /*console.table(
      Object.entries(menu).map(([k, it]) => ({
        key: k,
        title: it?.title,
        enable: !!it?.enable,
        roles: it?.roles ?? '(none)',
        visible: !!(it?.enable && userCanSee(it, role))
      }))
    );*/

    const sortedMenuEntries = Object.entries(menu)
      .filter(([, it]) => it && it.enable && userCanSee(it, role))
      .sort(([, a], [, b]) => (a.id || 0) - (b.id || 0));

    const apiCanvasKeys = ["999999999", "anotherCanvasApiKey"];
    const settingsKeys = ["settingsCriteria", "anotherSettingsKey"];
    let settingsDividerAdded = false;

    const API_DIVIDER_HTML = `
<li class="nav-title mt-3">
  <h6 class="mb-0 smaller text-muted text-uppercase">API AREA</h6>
</li>`;

    const SETTINGS_DIVIDER_HTML = `
<li class="nav-title mt-3">
  <h6 class="mb-0 smaller text-muted text-uppercase">Settings</h6>
</li>`;

    const menuHTML = sortedMenuEntries.map(([key, item]) => {
      let dividerHTML = '';
      if (apiCanvasKeys.includes(key)) dividerHTML = API_DIVIDER_HTML;
      if (settingsKeys.includes(key) && !settingsDividerAdded) {
        dividerHTML += SETTINGS_DIVIDER_HTML;
        settingsDividerAdded = true;
      }
      return dividerHTML + renderMenuItem(key, item, role);
    }).join('');

    dynamicMenu.innerHTML = menuHTML;

    // Wire submenu toggles
    setTimeout(() => {
      dynamicMenu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function (e) {
          const submenu = this.nextElementSibling;
          const parentLi = this.closest('li.nav-item');

          if (submenu && submenu.classList.contains('nav')) {
            e.preventDefault();

            submenu.classList.toggle('d-none');

            if (!submenu.classList.contains('d-none')) {
              submenu.style.display = 'block';
              submenu.style.visibility = 'visible';
              submenu.style.height = 'auto';
              submenu.style.overflow = 'visible';
            } else {
              submenu.style.display = '';
              submenu.style.visibility = '';
              submenu.style.height = '';
              submenu.style.overflow = '';
            }

            const arrowEnd = this.querySelector('.fi fi-arrow-end') || this.querySelector('.fi-arrow-end');
            const arrowDown = this.querySelector('.fi fi-arrow-down') || this.querySelector('.fi-arrow-down');
            if (arrowEnd && arrowDown) {
              arrowEnd.classList.toggle('d-none');
              arrowDown.classList.toggle('d-none');
            }

            dynamicMenu.querySelectorAll('.nav-item').forEach(li => li.classList.remove('active'));
            parentLi.classList.add('active');
          }
        });
      });
    }, 0);

  } catch (err) {
    console.error('[menu] error loading menu:', err);
    dynamicMenu.innerHTML = `<li class="text-center py-3 text-danger">Error loading menu</li>`;
  }
})();
