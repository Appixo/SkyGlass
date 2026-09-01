const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = {
  hideSidebar: true,
  hideAds: true,
  panelMode: "compact",
  dimPanel: false,
  showPill: true,
  weather: false,
  autoFollow: false,
  mapDim: 0,
  mapTheme: "normal",
  focusMode: false,
  planeOpacity: 100,
};

api.storage.sync.get(DEFAULTS).then((s) => {
  for (const key of [
    "hideSidebar",
    "hideAds",
    "dimPanel",
    "showPill",
    "weather",
    "autoFollow",
    "focusMode",
  ]) {
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
  const theme = document.getElementById("mapTheme");
  theme.value = s.mapTheme;
  theme.addEventListener("change", () => api.storage.sync.set({ mapTheme: theme.value }));

  const dim = document.getElementById("mapDim");
  const dimVal = document.getElementById("mapDimVal");
  dim.value = s.mapDim;
  dimVal.textContent = s.mapDim + "%";
  dim.addEventListener("input", () => {
    dimVal.textContent = dim.value + "%";
    api.storage.sync.set({ mapDim: Number(dim.value) });
  });

  const po = document.getElementById("planeOpacity");
  const poVal = document.getElementById("planeOpacityVal");
  po.value = s.planeOpacity;
  poVal.textContent = s.planeOpacity + "%";
  po.addEventListener("input", () => {
    poVal.textContent = po.value + "%";
    api.storage.sync.set({ planeOpacity: Number(po.value) });
  });
});
