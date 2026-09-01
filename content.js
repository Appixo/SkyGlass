// FR24 Clear View — content script
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
  };

  let settings = { ...DEFAULTS };

  function apply() {
    const html = document.documentElement;
    html.classList.toggle("fcv-no-sidebar", settings.hideSidebar);
    html.classList.toggle("fcv-no-ads", settings.hideAds);
    html.classList.toggle("fcv-panel-compact", settings.panelMode === "compact");
    html.classList.toggle("fcv-panel-hidden", settings.panelMode === "hidden");
    html.classList.toggle("fcv-dim", settings.dimPanel);
    html.classList.toggle("fcv-no-pill", !settings.showPill);
    // Let the map (Google Maps) pick up the new available width.
    window.dispatchEvent(new Event("resize"));
    updatePill();
  }

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

    pill.append(btnSidebar, btnPanel, btnDim);
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
  }

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
