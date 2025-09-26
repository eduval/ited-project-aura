// js/upload_templates.js
(function () {
  // ===== Endpoint =====
  const UPLOAD_ENDPOINT = "https://ited.org.ec/aura/excelfiles_upload/upload.php";

  // Firebase sections (also used in element IDs)
  const SECTIONS = [
    "coursefailure",
    "lowattendance",
    "atriskstatus",
    "lowtermaverage",
    "transcripttemplate",
  ];

  // Allowed Word types
  const WORD_TYPES = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  // Shorthand safely
  const $ = (sel) => document.querySelector(sel);

  // Per-section element getters
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
    const spinner = elSpinner(s);
    if (spinner) spinner.classList.remove("d-none");
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

  function validWordFile(file) {
    const nameOk = /\.(docx?|DOCX?)$/.test(file.name || "");
    const typeOk = WORD_TYPES.includes(file.type || "");
    // Some browsers give empty MIME for local files; accept if extension matches.
    return nameOk && (typeOk || (file.type || "") === "");
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

      resetProgressUI(section);
      setStatus(section, "", "neutral");

      if (!validWordFile(file)) {
        markFailUI(section);
        setStatus(section, "❌ Please choose a .doc or .docx file.", "err");
        input.value = "";
        return;
      }

      // Determine name
      const origName = file.name;
      const extMatch = origName.match(/\.(docx?|DOCX?)$/);
      const ext = (extMatch ? extMatch[0] : ".docx").toLowerCase();

      // Force a canonical name for the transcript template; others keep original
      const forceName =
        section === "transcripttemplate" ? `template${ext}` : origName;

      // Build form data
      const fd = new FormData();
      fd.append("file", file, forceName);
      fd.append("type", section);

      // XHR upload
      const xhr = new XMLHttpRequest();
      xhr.open("POST", UPLOAD_ENDPOINT, true);
      xhr.timeout = 5 * 60 * 1000; // 5 minutes, adjust as needed

      // Progress
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const bar = elBar(section);
        const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
        if (bar) {
          bar.style.width = pct + "%";
          bar.textContent = pct + "%";
        }
      };

      xhr.onloadstart = () => {
        startProgressUI(section);
        setStatus(section, "Uploading...", "neutral");
      };

      xhr.onerror = () => {
        markFailUI(section);
        setStatus(section, "❌ Network error during upload.", "err");
      };

      xhr.ontimeout = () => {
        markFailUI(section);
        setStatus(section, "⏳ Upload timed out.", "err");
      };

      xhr.onload = () => {
        const ok = xhr.status >= 200 && xhr.status < 300;
        if (!ok) {
          markFailUI(section);
          setStatus(section, `❌ Server responded ${xhr.status}.`, "err");
          return;
        }

        let resp;
        try {
          resp = JSON.parse(xhr.responseText);
        } catch {
          resp = null;
        }

        if (!resp || resp.success !== true || !resp.url) {
          markFailUI(section);
          const msg = resp && resp.error ? `❌ ${resp.error}` : "❌ Upload failed.";
          setStatus(section, msg, "err");
          return;
        }

        // If server will do extra processing, briefly show "Processing..."
        // (Optional: uncomment next line if your PHP performs async steps)
        // markProcessingUI(section);

        const shownName = section === "transcripttemplate" ? forceName : (resp.name || origName);
        markDoneUI(section);
        setStatus(section, `✅ Uploaded: ${shownName}`, "ok");
        input.value = "";

        // Notify other scripts (e.g., template_after_upload_push.js) to write to Firebase
        window.dispatchEvent(
          new CustomEvent("template:uploaded", {
            detail: {
              section,
              meta: {
                name: shownName, // ensure Firebase stores "Templates.docx" for transcripttemplate
                url: resp.url,
                size: resp.size || 0,
                uploadedAt:
                  resp.uploadedAt || Math.floor(Date.now() / 1000),
              },
            },
          })
        );
      };

      xhr.send(fd);
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
