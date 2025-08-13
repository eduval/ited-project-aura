import { db } from './firebase-config.js';
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const currentPath = window.location.pathname.split('/').pop();
const dynamicMenu = document.getElementById('dynamicMenu');

// Show loading spinner initially
dynamicMenu.innerHTML = `
  <li class="text-center py-4">
    <div class="spinner-grow text-primary" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
  </li>
`;

const menuRef = ref(db, 'menu');
const alertsRef = ref(db, 'alerts');

let unreadAlertCount = 0; // store live alerts count

// Listen for Alerts changes in real time
onValue(alertsRef, snapshot => {
    if (snapshot.exists()) {
        const alerts = snapshot.val();
        let alertList = [];

        for (const uploadKey in alerts) {
            const group = alerts[uploadKey];
            for (const alertKey in group) {
                const alert = group[alertKey];
                if (!alert.read) {
                    alertList.push(alert);
                }
            }
        }

        unreadAlertCount = alertList.length;

        // Update the badge if menu is already rendered
        const badgeEl = document.querySelector('.notification-count-alerts');
        if (badgeEl) {
            badgeEl.textContent = unreadAlertCount;
            badgeEl.style.display = unreadAlertCount > 0 ? 'inline-block' : 'none';
        }
    }
});

get(menuRef).then(snapshot => {
    if (snapshot.exists()) {
        const menu = snapshot.val();

        const sortedMenuEntries = Object.entries(menu)
            .filter(([_, item]) => item.enable)
            .sort(([, a], [, b]) => (a.id || 0) - (b.id || 0));

        const menuHTML = sortedMenuEntries
            .map(([key, item]) => {
                const apiCanvasKeys = ["999999999", "anotherCanvasApiKey"];
                const insertDivider = apiCanvasKeys.includes(key);

                let dividerHTML = '';
                if (insertDivider) {
                    dividerHTML = `
<li class="nav-title mt-3">
  <h6 class="mb-0 smaller text-muted text-uppercase">API AREA</h6>
</li>`;
                }
                return dividerHTML + renderMenuItem(key, item, currentPath);
            })
            .join('');

        dynamicMenu.innerHTML = menuHTML;

        // Menu toggle events
        setTimeout(() => {
            document.querySelectorAll('#dynamicMenu .nav-link').forEach(link => {
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

                        const arrowEnd = this.querySelector('.fi-arrow-end');
                        const arrowDown = this.querySelector('.fi-arrow-down');
                        if (arrowEnd && arrowDown) {
                            arrowEnd.classList.toggle('d-none');
                            arrowDown.classList.toggle('d-none');
                        }

                        document.querySelectorAll('#dynamicMenu .nav-item').forEach(li => {
                            li.classList.remove('active');
                        });
                        parentLi.classList.add('active');
                    }
                });
            });
        }, 0);

    } else {
        dynamicMenu.innerHTML = `
          <li class="text-center py-3 text-muted">No menu data found</li>
        `;
        console.warn('No menu data found.');
    }
}).catch(err => {
    console.error(err);
    dynamicMenu.innerHTML = `
      <li class="text-center py-3 text-danger">Error loading menu</li>
    `;
});

function renderMenuItem(key, item, currentPath) {
    if (!item.enable) return '';

    const iconHtml = item.iconSvg
        ? `<span class="nav-link-icon" style="margin-right: 12px; display: inline-flex; align-items: center;">${item.iconSvg}</span>`
        : '';

    const hasChildren = item.children && Object.values(item.children).some(c => c.enable);

    let isActive = false;

    // Check if current item or one of its children matches current page
    if (item.link && item.link.split('/').pop() === currentPath) {
        isActive = true;
    } else if (hasChildren) {
        isActive = Object.values(item.children).some(child =>
            child.link && child.link.split('/').pop() === currentPath
        );
    }

    // Add badge ONLY if menu title is "Alerts"
    const badgeHtml = item.title === "Alerts"
        ? `<span class="notification-count-alerts"
            style="position: absolute; top: -10px; right: -20px; background: red; color: white; border-radius: 50%; padding: 5px 5px; font-size: 12px;">${unreadAlertCount}</span>`
        : '';

    if (hasChildren) {
        const sortedChildrenEntries = Object.entries(item.children)
            .filter(([_, child]) => child.enable)
            .sort(([, a], [, b]) => (a.id || 0) - (b.id || 0));

        const childrenHTML = sortedChildrenEntries
            .map(([childKey, childItem]) => renderMenuItem(childKey, childItem, currentPath))
            .join('');

        return `
<li class="nav-item${isActive ? ' active' : ''}" style="position: relative;">
  <a class="nav-link" href="#">
    ${iconHtml}
    <span style="line-height: 1; position: relative;">${item.title}${badgeHtml}</span>
    <span class="group-icon float-end">
      <i class="fi fi-arrow-end${isActive ? ' d-none' : ''}"></i>
      <i class="fi fi-arrow-down${isActive ? '' : ' d-none'}"></i>
    </span>
  </a>
  <ul class="nav flex-column ms-3${isActive ? '' : ' d-none'}" style="${isActive ? 'display: block; visibility: visible; height: auto; overflow: visible;' : ''} margin-left: 0; padding-left: 20px;">
    ${childrenHTML}
  </ul>
</li>
`;
    } else {
        return `
<li class="nav-item${isActive ? ' active' : ''}" style="position: relative;">
  <a class="nav-link" href="${item.link || '#'}" style="display: flex; align-items: center; position: relative;">
    ${iconHtml}
    <span style="line-height: 1; position: relative;">${item.title}${badgeHtml}</span>
  </a>
</li>
`;
    }
}
