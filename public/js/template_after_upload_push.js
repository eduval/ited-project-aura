// js/template_after_upload_push.js
import { db } from "./firebase-config.js";
import { consumeOneTimeOverride } from "./templates_readonly.js";
import {
  ref as dbRef,
  push,
  set,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

window.addEventListener("template:uploaded", async (e) => {
  try {
    const { section, meta } = e.detail;
    if (!section || !meta?.url) return;

    const filesRef = dbRef(db, `templates/${section}/files`);
    const newRef = push(filesRef);

    // Trust server-provided uploadedAt if present; otherwise use now (seconds)
    const uploadedAt =
      meta.uploadedAt && String(meta.uploadedAt).length <= 10
        ? meta.uploadedAt
        : Math.floor(Date.now() / 1000);

    await set(newRef, {
      name: meta.name,
      url: meta.url,
      size: meta.size || 0,
      uploadedAt,
    });

    // Always set "active" to the newest file by uploadedAt
    const snap = await get(filesRef);
    let newestId = newRef.key;
    let newestAt = uploadedAt;

    if (snap.exists()) {
      snap.forEach((child) => {
        const f = child.val() || {};
        const at = typeof f.uploadedAt === "number" ? f.uploadedAt : 0;
        if (at > newestAt) {
          newestAt = at;
          newestId = child.key;
        }
      });
    }
    // wherever you pick a template for a section:


async function resolveTemplateUrl(section) {
  // 1) One-time override (consumed & cleared)
  const once = consumeOneTimeOverride(section);
  if (once?.url) return { url: once.url, source: "override", name: once.name };

  // 2) Otherwise use the enforced "active" (latest)
  // --- your existing logic follows ---
  const activeId = await getActiveIdFromRTDB(section);
  const url = await getFileUrlFromRTDB(section, activeId);
  return { url, source: "active", name: "" };
}

    const activeRef = dbRef(db, `templates/${section}/active`);
    await set(activeRef, newestId);
  } catch (err) {
    console.error("[template_after_upload_push] failed to write to RTDB", err);
    alert(
      "Upload succeeded but failed to save metadata to database (check rules)."
    );
  }
});
