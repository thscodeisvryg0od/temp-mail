const Settings = (() => {
  const DEFAULTS = {
    theme: "auto",
    sound: true,
    notifications: false,
    refreshInterval: 10000,
    lang: null,
    seenIds: []
  };

  let data = { ...DEFAULTS };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem("tm_settings") || "{}");
      Object.assign(data, raw);
    } catch (e) {}
    if (!data.lang) {
      data.lang = (navigator.language || "en").slice(0, 2);
      if (!["tr","en","de","fr","es","it"].includes(data.lang)) data.lang = "en";
    }
    return data;
  }

  function save() {
    try {
      localStorage.setItem("tm_settings", JSON.stringify(data));
    } catch (e) {}
  }

  return {
    load,
    save,
    get(key) { return data[key]; },
    set(key, value) { data[key] = value; save(); },
    all() { return data; }
  };
})();

Settings.load();