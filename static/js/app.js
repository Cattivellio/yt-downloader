(() => {
  "use strict";

  // ---------- DOM helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  const formatViews = (n) => {
    if (!n && n !== 0) return null;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B views";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M views";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K views";
    return n.toLocaleString() + " views";
  };

  // ---------- Theme ----------
  const THEME_KEY = "ytdl-theme";
  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    const icon = $(".theme-icon");
    if (icon) icon.textContent = theme === "dark" ? "☀" : "☾";
  };
  const initTheme = () => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") {
      applyTheme(stored);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      applyTheme("dark");
    } else {
      applyTheme("light");
    }
  };

  // ---------- Toast ----------
  const ensureToastStack = () => {
    let stack = $(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  };
  const toast = (message, opts = {}) => {
    const stack = ensureToastStack();
    const el = document.createElement("div");
    el.className = "toast" + (opts.error ? " error" : "");
    el.innerHTML = `<span class="dot"></span><span>${escapeHtml(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity 200ms";
      setTimeout(() => el.remove(), 220);
    }, opts.duration || 3200);
  };

  // ---------- URL detection ----------
  const YT_RE = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/.+/i;
  const PLAYLIST_RE = /[?&]list=/i;
  const detectUrlType = (url) => {
    if (!YT_RE.test(url)) return { valid: false, type: "invalid" };
    if (PLAYLIST_RE.test(url)) return { valid: true, type: "playlist" };
    return { valid: true, type: "video" };
  };

  // ---------- Helpers for format info ----------
  const isAudio = (f) => f.id.startsWith("audio_");
  const qualityOf = (f) => (isAudio(f) ? f.abr : f.height);

  // ---------- Skeletons ----------
  const videoSkeleton = () => `
    <div class="card">
      <div class="video-info">
        <div class="skeleton thumb"></div>
        <div class="meta">
          <div class="skeleton line long"></div>
          <div class="skeleton line medium"></div>
          <div class="skeleton line short"></div>
        </div>
      </div>
    </div>
  `;
  const playlistSkeleton = () => `
    <div class="card">
      <div class="card-section">
        <div class="skeleton line medium"></div>
        <div class="skeleton line short"></div>
      </div>
      <div class="card-section">
        <div class="playlist-grid">
          ${Array.from({ length: 6 })
            .map(
              () => `<div class="playlist-item">
                <div class="skeleton thumb"></div>
                <div class="info">
                  <div class="skeleton line long"></div>
                  <div class="skeleton line short"></div>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </div>
    </div>
  `;

  // ---------- Format row (single video) ----------
  const formatRow = (v, f) => {
    const kind = isAudio(f) ? "audio" : "video";
    const quality = qualityOf(f) || "";
    return `
      <div class="format-row"
           data-format-id="${escapeHtml(f.id)}"
           data-url="${escapeHtml(v.webpage_url)}"
           data-kind="${kind}"
           data-quality="${quality}"
           data-label="${escapeHtml(f.label)}">
        <span class="ext">${escapeHtml(f.ext)}</span>
        <div class="label">
          <span class="title">${escapeHtml(f.label)}</span>
          ${f.note ? `<span class="note">${escapeHtml(f.note)}</span>` : ""}
        </div>
        <span class="size">${escapeHtml(f.size_estimate || "—")}</span>
        <div class="row-actions">
          <button class="btn-icon-square share-btn" type="button" aria-label="Copy share link" title="Copy share link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          </button>
          <button class="btn btn-secondary download-btn" type="button">Download</button>
        </div>
      </div>
    `;
  };

  // ---------- Renderers ----------
  const renderVideo = (v) => {
    const stats = [
      v.duration_string && v.duration_string !== "—" ? `<span class="badge">${escapeHtml(v.duration_string)}</span>` : "",
      v.view_count ? `<span class="badge">${escapeHtml(formatViews(v.view_count) || "")}</span>` : "",
      v.upload_date ? `<span class="badge">${escapeHtml(v.upload_date)}</span>` : "",
    ].filter(Boolean).join("");

    return `
      <div class="card" data-info-type="video">
        <div class="video-info">
          <div class="thumb">
            ${v.thumbnail ? `<img src="${escapeHtml(v.thumbnail)}" alt="" loading="lazy" />` : ""}
          </div>
          <div class="meta">
            <h2>${escapeHtml(v.title)}</h2>
            <div class="channel">${escapeHtml(v.channel || "")}</div>
            <div class="stats">${stats}</div>
          </div>
        </div>
        ${v.video_formats.length ? `
          <div class="card-section">
            <h3 class="card-title">Video · MP4</h3>
            <div class="format-list">${v.video_formats.map((f) => formatRow(v, f)).join("")}</div>
          </div>` : ""}
        ${v.audio_formats.length ? `
          <div class="card-section">
            <h3 class="card-title">Audio</h3>
            <div class="format-list">${v.audio_formats.map((f) => formatRow(v, f)).join("")}</div>
          </div>` : ""}
      </div>
    `;
  };

  const renderPlaylist = (p) => {
    const xIcon = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    const plusIcon = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;

    const item = (e, idx) => `
      <div class="playlist-item" data-video-url="${escapeHtml(e.webpage_url)}" data-idx="${idx}">
        <button class="toggle-btn" type="button"
                data-toggle
                data-label="${escapeHtml(e.title)}"
                aria-label="Toggle this video"
                title="Click to skip this video">
          ${xIcon}
        </button>
        <div class="thumb">
          ${e.thumbnail ? `<img src="${escapeHtml(e.thumbnail)}" alt="" loading="lazy" />` : ""}
        </div>
        <div class="info">
          <h3>${escapeHtml(e.title)}</h3>
          <div class="meta">
            <span>${escapeHtml(e.channel || "")}</span>
            ${e.duration_string && e.duration_string !== "—" ? `<span>·</span><span>${escapeHtml(e.duration_string)}</span>` : ""}
          </div>
        </div>
      </div>
    `;

    const videoChips = (p.video_formats || []).map((f) => `
      <button class="chip" type="button"
              data-kind="video" data-quality="${f.height || 1080}" data-label="${escapeHtml(f.label)}">
        ${escapeHtml(f.label)}<span class="size">${escapeHtml(f.size_estimate || "—")}</span>
      </button>
    `).join("");

    const audioChips = (p.audio_formats || []).map((f) => `
      <button class="chip audio" type="button"
              data-kind="audio" data-quality="${f.abr || 192}" data-label="${escapeHtml(f.label)}">
        ${escapeHtml(f.label)}<span class="size">${escapeHtml(f.size_estimate || "—")}</span>
      </button>
    `).join("");

    return `
      <div class="card" data-info-type="playlist" data-playlist-url="${escapeHtml(p.webpage_url || '')}">
        <div class="card-section">
          <div class="playlist-header">
            <div>
              <h2>${escapeHtml(p.title)}</h2>
              <div class="channel" style="color: var(--muted-foreground); font-size: 0.9rem;">
                ${escapeHtml(p.channel || "")} · <span data-remaining-count>${p.count}</span> of ${p.count} video${p.count === 1 ? "" : "s"}
              </div>
            </div>
            <button class="btn btn-secondary share-playlist-btn" type="button" data-share-playlist>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              Share
            </button>
          </div>
          <div class="playlist-formats">
            <span class="label">Download ${p.count} video${p.count === 1 ? "" : "s"} as</span>
            <div class="chip-row" data-chip-row>
              ${videoChips}${audioChips}
            </div>
            <div class="playlist-controls">
              <label class="switch">
                <input type="checkbox" data-batch-mode />
                <span class="track"></span>
                <span>Batch (zip)</span>
              </label>
              <span data-selection-info>All selected</span>
              <div class="right">
                <button class="btn-link" type="button" data-action="select-all">Select all</button>
                <span>·</span>
                <button class="btn-link" type="button" data-action="deselect-all">Deselect all</button>
              </div>
            </div>
          </div>
        </div>
        <div class="card-section">
          <div class="playlist-grid">${p.entries.map(item).join("")}</div>
        </div>
      </div>
    `;
  };

  // Reusable SVG strings (used elsewhere)
  renderPlaylist._xIcon = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;
  renderPlaylist._plusIcon = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  `;

  // ---------- Share modal ----------
  const buildShareUrl = (url, kind, quality) => {
    const params = new URLSearchParams({
      url: String(url || ""),
      kind: String(kind || "video"),
      quality: String(quality || ""),
    });
    return `${window.location.origin}/share?${params.toString()}`;
  };

  const openShareModal = (shareUrl) => {
    closeShareModal();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "share-modal";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div class="modal-header">
          <h2 id="share-title">Share this download</h2>
          <button class="btn-icon" type="button" aria-label="Close" data-close>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div class="modal-body">
          <p>Send this link to someone. When they open it, the download starts automatically.</p>
          <div class="field">
            <input id="share-input" class="input" type="text" readonly value="${escapeHtml(shareUrl)}" />
            <button class="btn btn-primary" type="button" data-copy>Copy</button>
          </div>
        </div>
        <div class="modal-footer">
          <span class="note">Link works only while the app is running on this host.</span>
          <button class="btn btn-secondary" type="button" data-close>Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const input = backdrop.querySelector("#share-input");
    input.select();
    setTimeout(() => input.select(), 50);

    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) closeShareModal();
      const t = ev.target.closest("[data-close], [data-copy]");
      if (!t) return;
      if (t.hasAttribute("data-close")) closeShareModal();
      if (t.hasAttribute("data-copy")) {
        copyToClipboard(shareUrl);
      }
    });

    document.addEventListener("keydown", escClose);
  };

  const escClose = (ev) => {
    if (ev.key === "Escape") closeShareModal();
  };

  const closeShareModal = () => {
    const m = $("#share-modal");
    if (m) m.remove();
    document.removeEventListener("keydown", escClose);
  };

  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast("Share link copied to clipboard");
    } catch (err) {
      toast("Could not copy — please copy manually", { error: true });
    }
  };

  // ---------- Info fetch ----------
  const resultsEl = () => $("#results");

  const fetchInfo = async (url) => {
    const root = resultsEl();
    const detected = detectUrlType(url);
    root.innerHTML = detected.type === "playlist" ? playlistSkeleton() : videoSkeleton();

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Request failed (${res.status})`);
      }
      const data = await res.json();
      root.innerHTML = data.type === "playlist" ? renderPlaylist(data) : renderVideo(data);
      attachRowHandlers();
      attachPlaylistHandlers();
    } catch (err) {
      root.innerHTML = `
        <div class="card">
          <div class="card-section empty">
            <span class="ico">⚠</span>
            <h3>Could not load video</h3>
            <p>${escapeHtml(err.message || String(err))}</p>
          </div>
        </div>`;
    }
  };

  // ---------- Download flow ----------
  const newRequestId = () =>
    "r_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  const buildProgressBlock = (parent, title) => {
    const block = document.createElement("div");
    block.className = "progress-block";
    block.innerHTML = `
      <div class="row">
        <span class="title">${escapeHtml(title)}</span>
        <span class="stats">Preparing…</span>
      </div>
      <div class="progress-track"><div class="progress-bar indeterminate"></div></div>
    `;
    parent.appendChild(block);
    return block;
  };

  const updateProgressBlock = (block, payload) => {
    const stats = block.querySelector(".stats");
    const bar = block.querySelector(".progress-bar");
    if (payload.type === "progress") {
      const pct = Math.max(0, Math.min(100, payload.percent || 0));
      bar.classList.remove("indeterminate");
      bar.style.width = pct.toFixed(1) + "%";
      const parts = [pct.toFixed(1) + "%"];
      if (payload.speed) parts.push(payload.speed);
      if (payload.eta) parts.push("ETA " + payload.eta);
      stats.textContent = parts.join(" · ");
    } else if (payload.type === "finished") {
      stats.textContent = "Processing…";
      bar.classList.remove("indeterminate");
      bar.style.width = "100%";
    } else if (payload.type === "done") {
      stats.textContent = "Sending to browser…";
    } else if (payload.type === "error") {
      stats.textContent = "Error: " + (payload.message || "unknown");
      bar.style.background = "var(--destructive)";
    }
  };

  const startDownload = async ({ url, kind, quality, label, card }) => {
    if (!url) return;
    const requestId = newRequestId();
    const title = label || "Download";

    const btn = card?.querySelector(".download-btn:not([disabled])");
    const host = card || $("#results");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Starting…";
    }

    const block = buildProgressBlock(host, `Downloading · ${title}`);

    const params = new URLSearchParams({
      url: String(url),
      kind: String(kind || "video"),
      request_id: requestId,
    });
    if (quality) params.set("quality", String(quality));
    const downloadUrl = "/api/download?" + params.toString();

    const es = new EventSource(`/api/progress?request_id=${encodeURIComponent(requestId)}`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        updateProgressBlock(block, data);
        if (data.type === "done" || data.type === "error") es.close();
      } catch (e) {
        /* ignore */
      }
    };
    es.onerror = () => es.close();

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const m = /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i.exec(disp);
      const filename = m ? decodeURIComponent(m[1]) : "download";

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      block.querySelector(".stats").textContent = "Done · " + filename;
      block.querySelector(".progress-bar").style.background = "var(--primary)";
      toast(`Saved · ${filename}`);
    } catch (err) {
      block.querySelector(".stats").textContent = "Failed: " + (err.message || err);
      block.querySelector(".progress-bar").style.background = "var(--destructive)";
      toast(err.message || "Download failed", { error: true });
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Download";
      }
      setTimeout(() => {
        block.style.transition = "opacity 250ms";
        block.style.opacity = "0";
        setTimeout(() => block.remove(), 280);
      }, 4500);
    }
  };

  // ---------- Handlers ----------
  const attachRowHandlers = () => {
    $$(".format-row").forEach((row) => {
      if (row.dataset.bound) return;
      row.dataset.bound = "1";
      const url = row.dataset.url;
      const kind = row.dataset.kind;
      const quality = row.dataset.quality;
      const label = row.dataset.label;

      row.addEventListener("click", (ev) => {
        if (ev.target.closest(".share-btn, .download-btn")) return;
        if (!url) return;
        startDownload({ url, kind, quality, label, card: row });
      });
      const dl = row.querySelector(".download-btn");
      if (dl) {
        dl.addEventListener("click", (ev) => {
          ev.stopPropagation();
          startDownload({ url, kind, quality, label, card: row });
        });
      }
      const share = row.querySelector(".share-btn");
      if (share) {
        share.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const shareUrl = buildShareUrl(url, kind, quality);
          openShareModal(shareUrl);
        });
      }
    });
  };

  // ---------- Playlist logic ----------
  const updateSelectionInfo = (card) => {
    const items = $$(".playlist-item", card);
    const total = items.length;
    const selected = items.filter((i) => !i.classList.contains("deselected")).length;
    const info = card.querySelector("[data-selection-info]");
    if (info) {
      if (total === 0) info.textContent = "No videos";
      else if (selected === total) info.textContent = "All selected";
      else if (selected === 0) info.textContent = "None selected";
      else info.textContent = `${selected} of ${total} selected`;
    }
  };

  const attachPlaylistHandlers = () => {
    const card = $('.card[data-info-type="playlist"]');
    if (!card || card.dataset.bound) return;
    card.dataset.bound = "1";

    const xIconSVG = renderPlaylist._xIcon;
    const plusIconSVG = renderPlaylist._plusIcon;

    card.addEventListener("click", (ev) => {
      const toggle = ev.target.closest("[data-toggle]");
      const chip = ev.target.closest(".chip");
      const link = ev.target.closest("[data-action]");
      const shareBtn = ev.target.closest("[data-share-playlist]");
      const item = ev.target.closest(".playlist-item");

      if (toggle && item) {
        const isDeselected = item.classList.toggle("deselected");
        const btn = item.querySelector("[data-toggle]");
        btn.innerHTML = isDeselected ? plusIconSVG : xIconSVG;
        btn.title = isDeselected
          ? "Click to include this video"
          : "Click to skip this video";
        btn.setAttribute(
          "aria-label",
          isDeselected ? "Include this video" : "Skip this video"
        );
        updateSelectionInfo(card);
        return;
      }
      if (link) {
        const action = link.dataset.action;
        $$(".playlist-item", card).forEach((i) => {
          const btn = i.querySelector("[data-toggle]");
          if (action === "select-all") {
            i.classList.remove("deselected");
            if (btn) {
              btn.innerHTML = xIconSVG;
              btn.title = "Click to skip this video";
              btn.setAttribute("aria-label", "Skip this video");
            }
          } else if (action === "deselect-all") {
            i.classList.add("deselected");
            if (btn) {
              btn.innerHTML = plusIconSVG;
              btn.title = "Click to include this video";
              btn.setAttribute("aria-label", "Include this video");
            }
          }
        });
        updateSelectionInfo(card);
        return;
      }
      if (chip) {
        const batchMode = card.querySelector("[data-batch-mode]")?.checked;
        const kind = chip.dataset.kind;
        const quality = chip.dataset.quality;
        const label = chip.dataset.label;
        const items = $$(".playlist-item", card).filter(
          (i) => !i.classList.contains("deselected")
        );
        if (!items.length) {
          toast("No videos selected", { error: true });
          return;
        }
        if (batchMode) {
          batchDownloadZip(card, kind, quality, label);
        } else {
          bulkDownload(items, kind, quality, label, card);
        }
        return;
      }
      if (shareBtn) {
        openPlaylistShareModal(card);
      }
    });

    updateSelectionInfo(card);
  };

  // ---------- Playlist share modal ----------
  const openPlaylistShareModal = (card) => {
    closeShareModal();
    const playlistUrl = card.dataset.playlistUrl || "";
    const videoFormats = (() => {
      try { return JSON.parse(JSON.stringify(card.dataset.videoFormats || "[]")); } catch { return []; }
    })();
    const audioFormats = (() => {
      try { return JSON.parse(JSON.stringify(card.dataset.audioFormats || "[]")); } catch { return []; }
    })();

    // Read the actual format objects from the chips we rendered
    const chipRows = $$("[data-chip-row] .chip", card);
    const formats = chipRows.map((c) => ({
      kind: c.dataset.kind,
      quality: c.dataset.quality,
      label: c.dataset.label,
    }));

    const rowHtml = (f) => {
      const shareUrl = buildShareUrl(playlistUrl, f.kind, f.quality);
      return `
        <div class="share-format-row" data-share-url="${escapeHtml(shareUrl)}">
          <div class="info">
            <span class="title">${escapeHtml(f.label)}</span>
            <span class="url">${escapeHtml(shareUrl)}</span>
          </div>
          <button class="btn btn-secondary" type="button" data-copy>Copy</button>
        </div>
      `;
    };

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "share-modal";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pl-share-title">
        <div class="modal-header">
          <h2 id="pl-share-title">Share this playlist</h2>
          <button class="btn-icon" type="button" aria-label="Close" data-close>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div class="modal-body">
          <p>Pick a format. When someone opens the link, all videos in this playlist will download in that format.</p>
          <div class="share-format-list">
            ${formats.map(rowHtml).join("")}
          </div>
        </div>
        <div class="modal-footer">
          <span class="note">Link works only while the app is running on this host.</span>
          <button class="btn btn-secondary" type="button" data-close>Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) closeShareModal();
      const t = ev.target.closest("[data-close], [data-copy]");
      if (!t) return;
      if (t.hasAttribute("data-close")) closeShareModal();
      if (t.hasAttribute("data-copy")) {
        const row = t.closest(".share-format-row");
        const url = row?.dataset.shareUrl;
        if (url) copyToClipboard(url);
      }
    });

    document.addEventListener("keydown", escClose);
  };

  // ---------- Bulk batch download (zip) ----------
  const batchDownloadZip = async (card, kind, quality, label) => {
    const playlistUrl = card.dataset.playlistUrl;
    if (!playlistUrl) {
      toast("Could not determine playlist URL", { error: true });
      return;
    }
    const requestId = newRequestId();

    const host = card.querySelector(".card-section:last-child") || card;
    const block = document.createElement("div");
    block.className = "progress-block batch-progress";
    block.innerHTML = `
      <div class="row">
        <span class="title">Batch · ${escapeHtml(label)}</span>
        <span class="stats">Starting…</span>
      </div>
      <div class="progress-track"><div class="progress-bar indeterminate"></div></div>
      <div class="batch-items"></div>
    `;
    host.prepend(block);
    const batchStats = block.querySelector(".stats");
    const batchBar = block.querySelector(".progress-bar");
    const itemsContainer = block.querySelector(".batch-items");

    const es = new EventSource(`/api/progress?request_id=${encodeURIComponent(requestId)}`);
    const itemBlocks = new Map();

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        switch (data.type) {
          case "video_start": {
            const n = data.n;
            const vidBlock = document.createElement("div");
            vidBlock.className = "batch-item";
            vidBlock.innerHTML = `
              <div class="row">
                <span class="title">⬇ ${escapeHtml((data.title || "").slice(0, 60))}</span>
                <span class="stats">…</span>
              </div>
              <div class="progress-track"><div class="progress-bar indeterminate"></div></div>
            `;
            itemsContainer.appendChild(vidBlock);
            itemBlocks.set(n, vidBlock);
            batchBar.classList.remove("indeterminate");
            batchBar.style.width = (((n - 1) / data.total) * 100).toFixed(1) + "%";
            batchStats.textContent = `${n} / ${data.total}`;
            break;
          }
          case "progress": {
            const idx = data.item_index;
            if (idx === undefined) break;
            const n = idx + 1;
            const vb = itemBlocks.get(n);
            if (vb) {
              const pct = Math.max(0, Math.min(100, data.percent || 0));
              const subBar = vb.querySelector(".progress-bar");
              subBar.classList.remove("indeterminate");
              subBar.style.width = pct.toFixed(1) + "%";
              const parts = [pct.toFixed(1) + "%"];
              if (data.speed) parts.push(data.speed);
              if (data.eta) parts.push("ETA " + data.eta);
              vb.querySelector(".stats").textContent = parts.join(" · ");
            }
            break;
          }
          case "finished": {
            const idx = data.item_index;
            if (idx === undefined) break;
            const n = idx + 1;
            const vb = itemBlocks.get(n);
            if (vb) {
              vb.querySelector(".stats").textContent = "Processing…";
              vb.querySelector(".progress-bar").style.width = "100%";
            }
            break;
          }
          case "video_ok": {
            batchBar.style.width = ((data.n / data.total) * 100).toFixed(1) + "%";
            batchStats.textContent = `${data.n} / ${data.total}`;
            const vb = itemBlocks.get(data.n);
            if (vb) {
              vb.querySelector(".stats").textContent = "Done";
              vb.querySelector(".progress-bar").style.background = "var(--primary)";
            }
            break;
          }
          case "video_fail": {
            batchBar.style.width = ((data.n / data.total) * 100).toFixed(1) + "%";
            batchStats.textContent = `${data.n} / ${data.total}`;
            const vb = itemBlocks.get(data.n);
            if (vb) {
              vb.querySelector(".stats").textContent = "Failed";
              vb.querySelector(".progress-bar").style.background = "var(--destructive)";
            }
            break;
          }
          case "zipping":
            batchStats.textContent = `Creating zip · ${data.count} file${data.count === 1 ? "" : "s"}`;
            batchBar.style.width = "100%";
            break;
          case "pl_done":
            batchStats.textContent = "Ready";
            es.close();
            break;
        }
      } catch (_e) {
        /* ignore */
      }
    };
    es.onerror = () => es.close();

    try {
      const res = await fetch("/api/download-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: playlistUrl,
          kind: kind,
          quality: quality ? parseInt(quality) : null,
          request_id: requestId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Failed (${res.status})`);
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const m = /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i.exec(disp);
      const filename = m ? decodeURIComponent(m[1]) : "download.zip";

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      batchBar.style.width = "100%";
      batchBar.style.background = "var(--primary)";
      batchStats.textContent = "Saved · " + filename;
      toast("Saved · " + filename);
    } catch (err) {
      batchStats.textContent = "Failed: " + (err.message || err);
      batchBar.style.background = "var(--destructive)";
      toast(err.message || "Batch download failed", { error: true });
    } finally {
      es.close();
    }
  };

  // ---------- Bulk download (playlist) ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const bulkDownload = async (items, kind, quality, label, card) => {
    const host = card.querySelector(".card-section:last-child") || card;
    const header = document.createElement("div");
    header.className = "progress-block";
    header.innerHTML = `
      <div class="row">
        <span class="title">Bulk · ${escapeHtml(label)}</span>
        <span class="stats">0 / ${items.length}</span>
      </div>
      <div class="progress-track"><div class="progress-bar" style="width: 0%"></div></div>
    `;
    host.prepend(header);
    const stats = header.querySelector(".stats");
    const bar = header.querySelector(".progress-bar");

    let done = 0;
    for (const item of items) {
      const url = item.dataset.videoUrl;
      const titleEl = item.querySelector("h3");
      const itemTitle = titleEl ? titleEl.textContent : "video";

      const block = buildProgressBlock(card, `Downloading · ${itemTitle}`);
      const requestId = newRequestId();

      const params = new URLSearchParams({
        url: String(url),
        kind: String(kind),
        request_id: requestId,
      });
      if (quality) params.set("quality", String(quality));
      const downloadUrl = "/api/download?" + params.toString();

      const es = new EventSource(`/api/progress?request_id=${encodeURIComponent(requestId)}`);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          updateProgressBlock(block, data);
          if (data.type === "done" || data.type === "error") es.close();
        } catch (e) {
          /* ignore */
        }
      };
      es.onerror = () => es.close();

      try {
        const res = await fetch(downloadUrl);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Failed (${res.status})`);
        }
        const blob = await res.blob();
        const disp = res.headers.get("Content-Disposition") || "";
        const m = /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i.exec(disp);
        const filename = m ? decodeURIComponent(m[1]) : "download";

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);

        block.querySelector(".stats").textContent = "Done · " + filename;
        block.querySelector(".progress-bar").style.background = "var(--primary)";
      } catch (err) {
        block.querySelector(".stats").textContent = "Failed: " + (err.message || err);
        block.querySelector(".progress-bar").style.background = "var(--destructive)";
      }
      done += 1;
      stats.textContent = `${done} / ${items.length}`;
      bar.style.width = ((done / items.length) * 100).toFixed(1) + "%";
      await sleep(450);
    }
    stats.textContent = `Done · ${items.length} file${items.length === 1 ? "" : "s"}`;
    bar.style.background = "var(--primary)";
    toast(`Bulk download complete · ${items.length} file${items.length === 1 ? "" : "s"}`);
  };

  // ---------- URL bar ----------
  const initUrlBar = () => {
    const form = $("#url-form");
    const input = $("#url-input");
    const typeEl = $("#url-type");
    const submitBtn = $("#url-submit");

    const refresh = () => {
      const val = input.value.trim();
      const d = detectUrlType(val);
      typeEl.classList.remove("visible");
      typeEl.textContent = "";
      if (!val) return;
      if (!d.valid) {
        typeEl.textContent = "✕ invalid";
        typeEl.classList.add("visible");
        return;
      }
      typeEl.textContent = d.type === "playlist" ? "▤ playlist" : "▣ video";
      typeEl.classList.add("visible");
    };

    input.addEventListener("input", refresh);
    input.addEventListener("paste", () => setTimeout(refresh, 0));

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const val = input.value.trim();
      const d = detectUrlType(val);
      if (!d.valid) {
        toast("Please paste a valid YouTube URL", { error: true });
        input.focus();
        return;
      }
      submitBtn.disabled = true;
      fetchInfo(val).finally(() => {
        submitBtn.disabled = false;
      });
    });

    refresh();
  };

  // ---------- Theme toggle ----------
  const initThemeToggle = () => {
    const btn = $("#theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
    });
  };

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initUrlBar();
    initThemeToggle();
  });
})();
