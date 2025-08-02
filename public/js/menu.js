import { db } from './firebase-config.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const menuRef = ref(db, 'menu');

get(menuRef).then(snapshot => {
    if (snapshot.exists()) {
        const menu = snapshot.val();

        const sortedMenuEntries = Object.entries(menu)
            .filter(([_, item]) => item.enable)
            .sort(([, a], [, b]) => (a.id || 0) - (b.id || 0));

        const menuHTML = sortedMenuEntries
            .map(([key, item], index) => renderMenuItem(key, item, index === 0))
            .join('');

        document.getElementById('dynamicMenu').innerHTML = menuHTML;

        setTimeout(() => {
            document.querySelectorAll('#dynamicMenu .nav-link').forEach(link => {
                link.addEventListener('click', function (e) {
                    const submenu = this.nextElementSibling;
                    const parentLi = this.closest('li.nav-item');

                    if (submenu && submenu.classList.contains('nav')) {
                        e.preventDefault();

                        submenu.classList.toggle('d-none');

                        // Style submenu
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

                        // Toggle arrows
                        const arrowEnd = this.querySelector('.fi-arrow-end');
                        const arrowDown = this.querySelector('.fi-arrow-down');
                        if (arrowEnd && arrowDown) {
                            arrowEnd.classList.toggle('d-none');
                            arrowDown.classList.toggle('d-none');
                        }

                        // Set active class on parent <li>
                        document.querySelectorAll('#dynamicMenu .nav-item').forEach(li => {
                            li.classList.remove('active');
                        });
                        parentLi.classList.add('active');
                    }
                });
            });
        }, 0);
    } else {
        console.warn('No menu data found.');
    }
}).catch(console.error);

function renderMenuItem(key, item, isFirst = false) {
    if (!item.enable) return '';

    const iconHtml = item.iconSvg
        ? `<span class="nav-link-icon" style="margin-right: 12px; display: inline-flex; align-items: center;">${item.iconSvg}</span>`
        : '';

    const hasChildren = item.children && Object.values(item.children).some(c => c.enable);

    if (hasChildren) {
        const sortedChildrenEntries = Object.entries(item.children)
            .filter(([_, child]) => child.enable)
            .sort(([, a], [, b]) => (a.id || 0) - (b.id || 0));

        const childrenHTML = sortedChildrenEntries
            .map(([childKey, childItem]) => renderMenuItem(childKey, childItem))
            .join('');

        return `
<li class="nav-item${isFirst ? ' active' : ''}">
  <a class="nav-link" href="#">
    ${iconHtml}
    <span style="line-height: 1;">${item.title}</span>
    <span class="group-icon float-end">
      <i class="fi fi-arrow-end${isFirst ? ' d-none' : ''}"></i>
      <i class="fi fi-arrow-down${isFirst ? '' : ' d-none'}"></i>
    </span>
  </a>
  <ul class="nav flex-column ms-3${isFirst ? '' : ' d-none'}" style="${isFirst ? 'display: block; visibility: visible; height: auto; overflow: visible;' : ''} margin-left: 0; padding-left: 20px;">
    ${childrenHTML}
  </ul>
</li>
`;
    } else {
        return `
<li class="nav-item${isFirst ? ' active' : ''}">
  <a class="nav-link" href="${item.link || '#'}" style="display: flex; align-items: center;">
    ${iconHtml}
    <span style="line-height: 1;">${item.title}</span>
  </a>
</li>
`;
    }
}
