const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = {
  hideSidebar: true,
  hideAds: true,
  panelMode: "compact",
  dimPanel: false,
  showPill: true,
  weather: false,
};

api.storage.sync.get(DEFAULTS).then((s) => {
  for (const key of ["hideSidebar", "hideAds", "dimPanel", "showPill", "weather"]) {
    const box = document.getElementById(key);
    box.checked = s[key];
    box.addEventListener("change", () => api.storage.sync.set({ [key]: box.checked }));
  }
  for (const radio of document.querySelectorAll('input[name="panelMode"]')) {
    radio.checked = radio.value === s.panelMode;
    radio.addEventListener("change", () => {
      if (radio.checked) api.storage.sync.set({ panelMode: radio.value });
    });
  }
});
