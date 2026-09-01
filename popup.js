const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = {
  hideAds: true,
  showPill: true,
  mapDim: 0,
  mapTheme: "normal",
  planeOpacity: 100,
};

api.storage.sync.get(DEFAULTS).then((s) => {
  for (const key of ["hideAds", "showPill"]) {
    const box = document.getElementById(key);
    box.checked = s[key];
    box.addEventListener("change", () => api.storage.sync.set({ [key]: box.checked }));
  }

  const theme = document.getElementById("mapTheme");
  theme.value = s.mapTheme;
  theme.addEventListener("change", () => api.storage.sync.set({ mapTheme: theme.value }));

  const bindRange = (id, valId, key) => {
    const el = document.getElementById(id);
    const val = document.getElementById(valId);
    el.value = s[key];
    val.textContent = s[key] + "%";
    el.addEventListener("input", () => {
      val.textContent = el.value + "%";
      api.storage.sync.set({ [key]: Number(el.value) });
    });
  };
  bindRange("mapDim", "mapDimVal", "mapDim");
  bindRange("planeOpacity", "planeOpacityVal", "planeOpacity");
});
