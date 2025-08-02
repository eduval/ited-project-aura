// js/menu.js
import { db } from './firebase-config.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const menuRef = ref(db, 'menu');

get(menuRef).then(snapshot => {
    if (snapshot.exists()) {
        const menu = snapshot.val();

        // Convert menu object to array, sort by id, then map
        const sortedMenuEntries = Object.entries(menu)
            .filter(([_, item]) => item.enable)
            .sort(([, a], [, b]) => (a.id || 0) - (b.id || 0)); // Sort top-level by id ascending

        const menuHTML = sortedMenuEntries
            .map(([key, item]) => renderMenuItem(key, item))
            .join('');

        document.getElementById('dynamicMenu').innerHTML = menuHTML;
    } else {
        console.warn('No menu data found.');
    }
}).catch(console.error);

function renderMenuItem(key, item) {
    if (!item.enable) return '';

    const hasChildren = item.children && Object.values(item.children).some(c => c.enable);

    const iconHtml = item.iconSvg ? item.iconSvg : '';

    if (hasChildren) {
        // Sort children by id ascending as well
        const sortedChildrenEntries = Object.entries(item.children)
            .filter(([_, child]) => child.enable)
            .sort(([, a], [, b]) => (a.id || 0) - (b.id || 0));

        const childrenHTML = sortedChildrenEntries
            .map(([childKey, childItem]) => renderMenuItem(childKey, childItem))
            .join('');

        return `
      <li class="nav-item">
        <a class="nav-link" href="#">
          ${iconHtml}
          <span>${item.title}</span>
          <span class="group-icon float-end">
            <i class="fi fi-arrow-end"></i>
            <i class="fi fi-arrow-down"></i>
          </span>
        </a>
        <ul class="nav flex-column ms-3">
          ${childrenHTML}
        </ul>
      </li>
    `;
    }

    return `
    <li class="nav-item">
      <a class="nav-link" href="${item.link}">
        ${iconHtml}
        <span>${item.title}</span>
      </a>
    </li>
  `;
}
