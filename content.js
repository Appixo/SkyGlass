// SkyGlass — content script
// Applies fcv-* classes on <html> based on saved settings and hosts the
// on-map control pill. All visual work is done by content.css, so the
// SPA can re-render as much as it likes.

(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  const DEFAULTS = {
    hideSidebar: true,
    hideAds: true,
    panelMode: "compact", // "full" | "compact" | "hidden"
    dimPanel: false,
    showPill: true,
    weather: false,
    autoFollow: false,
    mapDim: 0, // 0–80 (%)
    mapTheme: "normal", // "normal" | "grayscale" | "sepia" | "night"
    focusMode: false,
    planeOpacity: 100, // 20–100 (%)
  };

  const THEMES = ["normal", "grayscale", "sepia", "night"];

  let settings = { ...DEFAULTS };

  function apply() {
    const html = document.documentElement;
    html.classList.toggle("fcv-no-sidebar", settings.hideSidebar);
    html.classList.toggle("fcv-no-ads", settings.hideAds);
    html.classList.toggle("fcv-panel-compact", settings.panelMode === "compact");
    html.classList.toggle("fcv-panel-hidden", settings.panelMode === "hidden");
    html.classList.toggle("fcv-dim", settings.dimPanel);
    html.classList.toggle("fcv-no-pill", !settings.showPill);
    for (const t of THEMES) {
      html.classList.toggle(`fcv-theme-${t}`, t !== "normal" && settings.mapTheme === t);
    }
    html.classList.toggle("fcv-focus", settings.focusMode);
    html.style.setProperty(
      "--fcv-plane-opacity",
      String(Math.min(100, Math.max(20, settings.planeOpacity)) / 100)
    );
    tagPlaneCanvas();
    // Let the map (Google Maps) pick up the new available width.
    window.dispatchEvent(new Event("resize"));
    syncWeather();
    syncDim();
    updatePill();
  }

  // ---- Basemap dimming (planes stay bright; drawn by page-hook.js) ----
  let lastSentDim = null;
  function syncDim() {
    const opacity = Math.min(80, Math.max(0, settings.mapDim)) / 100;
    if (opacity === lastSentDim) return;
    lastSentDim = opacity;
    window.postMessage({ source: "fcv", cmd: "dim", opacity }, "*");
  }

  // ---- Tag FR24's aircraft canvas so CSS can target it ----
  // The aircraft layer is a full-viewport canvas outside .gm-style whose
  // wrapper sits at z-index 1 (the z-index 0 sibling holds trails/labels).
  function tagPlaneCanvas() {
    for (const c of document.querySelectorAll("canvas")) {
      if (c.closest(".gm-style") || c.classList.contains("fcv-planes")) continue;
      if (getComputedStyle(c.parentElement).zIndex === "1") {
        c.classList.add("fcv-planes");
      }
    }
  }
  setInterval(tagPlaneCanvas, 2000);

  // ---- Auto-follow: keep the selected flight followed ----
  // FR24's follow button icon carries `stroke-0 group-hover:stroke-current`
  // when NOT following and `stroke-current stroke-0.5` while following. Only
  // click on the exact not-following signature so a future site change makes
  // this a no-op instead of a misfire.
  function autoFollowTick() {
    if (!settings.autoFollow) return;
    const btn = document.querySelector(
      '[data-testid="aircraft__follow-flight-button"]'
    );
    const svg = btn && btn.querySelector("svg");
    if (!svg) return;
    const cls = svg.classList;
    if (cls.contains("stroke-0") && cls.contains("group-hover:stroke-current")) {
      btn.click();
    }
  }
  setInterval(autoFollowTick, 3000);

  // ---- Rain radar overlay (free RainViewer tiles, drawn by page-hook.js) ----
  let weatherActive = false;
  let weatherPending = false;

  async function syncWeather() {
    if (settings.weather === weatherActive || weatherPending) return;
    if (!settings.weather) {
      window.postMessage({ source: "fcv", cmd: "weather", on: false }, "*");
      return;
    }
    weatherPending = true;
    try {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      const data = await res.json();
      const tilePath = data?.radar?.past?.at(-1)?.path;
      if (tilePath) {
        window.postMessage({ source: "fcv", cmd: "weather", on: true, tilePath }, "*");
      }
    } catch (e) {
      console.warn("SkyGlass: rain radar unavailable", e);
    } finally {
      weatherPending = false;
    }
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.source !== "fcv-page") return;
    if (e.data.cmd === "weather-state") {
      weatherActive = e.data.active;
      updatePill();
    }
  });

  // Refresh the radar frame every 10 minutes while enabled.
  setInterval(() => {
    if (settings.weather) {
      weatherActive = false;
      syncWeather();
    }
  }, 10 * 60 * 1000);

  function save(patch) {
    settings = { ...settings, ...patch };
    api.storage.sync.set(patch);
    apply();
  }

  // ---- Control pill ----
  const PANEL_ICONS = { full: "▤", compact: "▥", hidden: "□" };
  const PANEL_LABELS = {
    full: "Flight panel: full (click for compact)",
    compact: "Flight panel: compact (click to hide)",
    hidden: "Flight panel: hidden (click for full)",
  };
  let pill;

  function buildPill() {
    if (pill || !document.body) return;
    pill = document.createElement("div");
    pill.id = "fcv-pill";

    const btnSidebar = mkBtn("◧", () =>
      save({ hideSidebar: !settings.hideSidebar })
    );
    btnSidebar.dataset.fcv = "sidebar";

    const btnPanel = mkBtn(PANEL_ICONS.compact, () => {
      const next = { full: "compact", compact: "hidden", hidden: "full" }[
        settings.panelMode
      ];
      save({ panelMode: next });
    });
    btnPanel.dataset.fcv = "panel";

    const btnDim = mkBtn("◑", () => save({ dimPanel: !settings.dimPanel }));
    btnDim.dataset.fcv = "dim";

    const btnFollow = mkBtn("⌖", () => save({ autoFollow: !settings.autoFollow }));
    btnFollow.dataset.fcv = "follow";

    const btnFocus = mkBtn("◎", () => save({ focusMode: !settings.focusMode }));
    btnFocus.dataset.fcv = "focus";

    pill.append(btnSidebar, btnPanel, btnDim, btnFollow, btnFocus);
    document.body.appendChild(pill);
    updatePill();
  }

  function mkBtn(label, onClick) {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function updatePill() {
    if (!pill) return;
    const q = (name) => pill.querySelector(`[data-fcv="${name}"]`);
    const sb = q("sidebar");
    sb.classList.toggle("fcv-on", settings.hideSidebar);
    sb.title = settings.hideSidebar
      ? "Sidebar hidden (click to show)"
      : "Hide right sidebar";
    const pn = q("panel");
    pn.textContent = PANEL_ICONS[settings.panelMode];
    pn.title = PANEL_LABELS[settings.panelMode];
    pn.classList.toggle("fcv-on", settings.panelMode !== "full");
    const dm = q("dim");
    dm.classList.toggle("fcv-on", settings.dimPanel);
    dm.title = settings.dimPanel
      ? "Panel dimming on (click to disable)"
      : "Dim flight panel until hovered";
    const af = q("follow");
    af.classList.toggle("fcv-on", settings.autoFollow);
    af.title = settings.autoFollow
      ? "Auto-follow on (click to disable)"
      : "Auto-follow the selected flight";
    const fc = q("focus");
    fc.classList.toggle("fcv-on", settings.focusMode);
    fc.title = settings.focusMode
      ? "Focus mode on (click to disable)"
      : "Focus mode: fade all planes except the followed one";
  }

  // ---- Keyboard shortcuts ----
  const SHORTCUTS = {
    s: () => save({ hideSidebar: !settings.hideSidebar }),
    p: () => {
      const next = { full: "compact", compact: "hidden", hidden: "full" }[
        settings.panelMode
      ];
      save({ panelMode: next });
    },
    d: () => save({ dimPanel: !settings.dimPanel }),
    w: () => save({ weather: !settings.weather }),
    a: () => save({ autoFollow: !settings.autoFollow }),
    o: () => save({ focusMode: !settings.focusMode }),
    t: () => {
      const next = THEMES[(THEMES.indexOf(settings.mapTheme) + 1) % THEMES.length];
      save({ mapTheme: next });
    },
    m: () => {
      // Cycle basemap dimming: 0 → 30 → 50 → 70 → 0
      const steps = [0, 30, 50, 70];
      const next = steps[(steps.indexOf(settings.mapDim) + 1) % steps.length] ?? 30;
      save({ mapDim: next });
    },
    f: () => {
      // Click the site's own Follow button once.
      const btn = document.querySelector(
        '[data-testid="aircraft__follow-flight-button"]'
      );
      if (btn) btn.click();
    },
  };

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    ) {
      return;
    }
    const fn = SHORTCUTS[e.key.toLowerCase()];
    if (fn) fn();
  });

  // Re-add the pill if the SPA ever blows away <body>'s children.
  const observer = new MutationObserver(() => {
    if (pill && !document.body.contains(pill)) {
      document.body.appendChild(pill);
    }
  });

  api.storage.sync.get(DEFAULTS).then((stored) => {
    settings = { ...DEFAULTS, ...stored };
    buildPill();
    apply();
    observer.observe(document.body, { childList: true });
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULTS) settings[key] = newValue;
    }
    apply();
  });
})();
