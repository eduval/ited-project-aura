// js/template_after_upload_push.js
import { db } from "./firebase-config.js";
import {
    ref as dbRef,
    push,
    set,
    get,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/**
 * Listens for `template:uploaded` events (dispatched by upload_templates.js)
 * and writes the file metadata to:
 *   templates/<section>/files/<autoId>
 * Also sets `active` if it doesn't exist yet.
 */
window.addEventListener("template:uploaded", async (e) => {
    try {
        const { section, meta } = e.detail;
        if (!section || !meta?.url) return;

        // 1) Push the file entry
        const filesRef = dbRef(db, `templates/${section}/files`);
        const newRef = push(filesRef);
        await set(newRef, {
            name: meta.name,
            url: meta.url,
            size: meta.size || 0,
            uploadedAt: meta.uploadedAt || Math.floor(Date.now() / 1000),
        });

        // 2) If active is not set, set this one as active
        const activeRef = dbRef(db, `templates/${section}/active`);
        const snapActive = await get(activeRef);
        if (!snapActive.exists()) {
            await set(activeRef, newRef.key);
        }
    } catch (err) {
        console.error("[template_after_upload_push] failed to write to RTDB", err);
        alert("Upload succeeded but failed to save metadata to database (check rules).");
    }
});
