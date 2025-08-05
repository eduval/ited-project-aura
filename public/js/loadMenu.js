

const database = firebase.database();
const menuRef = database.ref("menu");
const sidebarMenu = document.getElementById("sidebar-menu");

menuRef.once("value")
  .then((snapshot) => {
    const menuItems = snapshot.val();

    if (!menuItems) return;

    Object.values(menuItems).forEach((item) => {
      if (item.enable) {
        const li = document.createElement("li");
        li.className = "nav-item";

        li.innerHTML = `
          <a class="nav-link" href="${item.link}">
            <span class="nav-icon">${item.iconSvg}</span>
            <span class="nav-text">${item.title}</span>
          </a>
        `;

        sidebarMenu.appendChild(li);
      }
    });
  })
  .catch((error) => {
    console.error("Error loading menu:", error);
  });
