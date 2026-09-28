const Notify = (() => {
  let audioCtx = null;

  function ensureCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }

  /** Sakin, iki tonlu bir bildirim sesi */
  function playChime() {
    if (!Settings.get("sound")) return;
    const ctx = ensureCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { f: 880, t: now },
      { f: 1174.66, t: now + 0.12 }
    ];

    notes.forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  async function requestPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const p = await Notification.requestPermission();
    return p === "granted";
  }

  function showDesktop(from, subject) {
    if (!Settings.get("notifications")) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const n = new Notification("📩 TempMail — Yeni Mesaj", {
        body: `${from}\n${subject || "(no subject)"}`,
        icon: "assets/icons/icon-192.png",
        badge: "assets/icons/icon-192.png",
        tag: "tempmail-" + Date.now(),
        silent: true
      });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 6000);
    } catch (e) {}
  }

  function notifyNewMessage(from, subject) {
    playChime();
    showDesktop(from, subject);
  }

  return { playChime, requestPermission, notifyNewMessage };
})();