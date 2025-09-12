// js/upload_templates.js
// Per-section DOC/DOCX uploader with progress + UI feedback.

(function () {
    // ===== Endpoint =====
    // If your page is served over https:// then this URL must also be https://
    // (otherwise the browser will block it as mixed content).
    const UPLOAD_ENDPOINT = "https://ited.org.ec/aura/excelfiles_upload/upload.php";

    // Section map: key === Firebase section key and also used in element IDs
    const SECTIONS = [
        "coursefailure",
        "lowattendance",
        "atriskstatus",
        "lowtermaverage",
    ];

    // Allowed Word types
    const WORD_TYPES = [
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    // Shorthand safely
    const $ = (sel) => document.querySelector(sel);

    // Helpers to access per-section elements
    const elBtn = (s) => $(`#uploadBtn-${s}`);
    const elInput = (s) => $(`#file-${s}`);
    const elStatus = (s) => $(`#status-${s}`);
    const elProgress = (s) => $(`#progress-${s}`);
    const elBar = (s) => $(`#progressbar-${s}`);
    const elSpinner = (s) => $(`#spinner-${s}`);

    function setStatus(s, text, type = "neutral") {
        const el = elStatus(s);
        if (!el) return;
        el.classList.remove("text-success", "text-danger", "text-muted");
        if (type === "ok") el.classList.add("text-success");
        else if (type === "err") el.classList.add("text-danger");
        else el.classList.add("text-muted");
        el.innerHTML = text || "";
    }

    function resetProgressUI(s) {
        const progress = elProgress(s);
        const bar = elBar(s);
        const spinner = elSpinner(s);
        if (progress) progress.classList.add("d-none");
        if (bar) {
            bar.style.width = "0%";
            bar.textContent = "0%";
            bar.classList.remove(
                "bg-success",
                "bg-danger",
                "bg-warning",
                "progress-bar-animated",
                "progress-bar-striped"
            );
            bar.classList.add("progress-bar-animated", "progress-bar-striped");
        }
        if (spinner) spinner.classList.add("d-none");
    }

    function startProgressUI(s) {
        const progress = elProgress(s);
        const bar = elBar(s);
        if (progress) progress.classList.remove("d-none");
        if (bar) {
            bar.style.width = "0%";
            bar.textContent = "0%";
            bar.classList.add("progress-bar-animated", "progress-bar-striped");
            bar.classList.remove("bg-success", "bg-danger", "bg-warning");
        }
    }

    function markProcessingUI(s) {
        const bar = elBar(s);
        const spinner = elSpinner(s);
        if (bar) {
            bar.classList.add("bg-warning");
            bar.classList.remove("progress-bar-animated", "progress-bar-striped");
            bar.style.width = "100%";
            bar.textContent = "Processing...";
        }
        if (spinner) spinner.classList.remove("d-none");
    }

    function markDoneUI(s) {
        const bar = elBar(s);
        const spinner = elSpinner(s);
        if (bar) {
            bar.classList.add("bg-success");
            bar.classList.remove("progress-bar-animated", "progress-bar-striped", "bg-warning");
            bar.style.width = "100%";
            bar.textContent = "Done";
        }
        if (spinner) spinner.classList.add("d-none");
    }

    function markFailUI(s) {
        const bar = elBar(s);
        const spinner = elSpinner(s);
        if (bar) {
            bar.classList.add("bg-danger");
            bar.classList.remove("progress-bar-animated", "progress-bar-striped", "bg-warning");
            bar.style.width = "100%";
            bar.textContent = "Failed";
        }
        if (spinner) spinner.classList.add("d-none");
    }

    function attachSection(section) {
        const btn = elBtn(section);
        const input = elInput(section);
        if (!btn || !input) {
            console.warn(`[templates] Missing elements for section: ${section}`);
            return;
        }

        // Button triggers hidden file input
        btn.addEventListener("click", () => input.click());

        // When a file is picked, upload it
        input.addEventListener("change", () => {
            const file = input.files && input.files[0];
            if (!file) return;

            // Validate type
            const isWord =
                WORD_TYPES.includes(file.type) || /\.docx?$/i.test(file.name);
            if (!isWord) {
                setStatus(section, "Only Word files (.doc, .docx) are allowed.", "err");
                input.value = "";
                return;
            }

            // Start UI
            resetProgressUI(section);
            startProgressUI(section);
            setStatus(section, `Uploading “${file.name}”…`);

            // Build form data (backend expects: file + type)
            const fd = new FormData();
            fd.append("file", file, file.name);
            fd.append("type", section);

            // XHR so we can handle upload progress + processing step
            const xhr = new XMLHttpRequest();
            const url = UPLOAD_ENDPOINT; // or `${UPLOAD_ENDPOINT}?type=${encodeURIComponent(section)}` if your PHP reads query

            xhr.open("POST", url, true);

            // Progress bar
            xhr.upload.addEventListener("progress", (evt) => {
                if (evt.lengthComputable) {
                    const pct = Math.round((evt.loaded / evt.total) * 100);
                    const bar = elBar(section);
                    if (bar) {
                        bar.style.width = `${pct}%`;
                        bar.textContent = `${pct}%`;
                    }
                }
            });

            // Upload finished sending → show "Processing..."
            xhr.upload.addEventListener("load", () => {
                markProcessingUI(section);
            });

            xhr.onerror = () => {
                console.error(`[templates] XHR network error: ${section}`);
                markFailUI(section);
                setStatus(section, "Network error during upload.", "err");
                input.value = "";
            };

            xhr.onload = () => {
                const ok = xhr.status >= 200 && xhr.status < 300;
                if (!ok) {
                    console.error(`[templates] HTTP ${xhr.status} ${xhr.statusText}`, xhr.responseText);
                    markFailUI(section);
                    setStatus(section, `Upload failed: ${xhr.status} ${xhr.statusText}`, "err");
                    input.value = "";
                    return;
                }

                let resp;
                try { resp = JSON.parse(xhr.responseText); }
                catch { resp = null; }

                if (!resp || resp.success !== true) {
                    console.error("[templates] Bad response", xhr.responseText);
                    markFailUI(section);
                    const msg = (resp && resp.error) ? resp.error : "Unexpected server response.";
                    setStatus(section, `❌ ${msg}`, "err");
                    input.value = "";
                    return;
                }

                // Success
                markDoneUI(section);
                setStatus(section, `✅ Uploaded: ${resp.name || file.name}`, "ok");
                input.value = "";

                // Tell the page a template was uploaded so a helper can write to Firebase
                window.dispatchEvent(new CustomEvent("template:uploaded", {
                    detail: {
                        section,
                        meta: {
                            name: resp.name || file.name,
                            url: resp.url,
                            size: resp.size || 0,
                            uploadedAt: resp.uploadedAt || Math.floor(Date.now() / 1000)
                        }
                    }
                }));

                // If your list is bound via templates_readonly.js (onValue), it will refresh automatically.
            };


            try {
                xhr.send(fd);
            } catch (e) {
                console.error("[templates] send error", e);
                markFailUI(section);
                setStatus(section, `Network error: ${e.message}`, "err");
                input.value = "";
            }
        });
    }

    // Initialize all sections when DOM is ready
    document.addEventListener("DOMContentLoaded", () => {
        SECTIONS.forEach(attachSection);

        // Diagnostics
        console.log("[templates] Uploader wired for sections:", SECTIONS);
        console.log("[templates] Endpoint:", UPLOAD_ENDPOINT);

        if (location.protocol === "https:" && !/^https:\/\//i.test(UPLOAD_ENDPOINT)) {
            console.warn(
                "%cMixed Content Warning:",
                "color:#b45309;font-weight:bold",
                "Your page is HTTPS but endpoint is HTTP. The browser will block the request. Use an HTTPS tunnel (ngrok, cloudflared) or run the page over http:// for local testing."
            );
        }
    });
})();
