/*
 * Moonraker Printer Card
 * A Lovelace card for Klipper printers that are connected through the
 * Moonraker integration (https://github.com/marcolivierarsenault/moonraker-home-assistant).
 * Pick the printer device in the editor; the card finds all entities itself.
 * MIT License
 */

const CARD_VERSION = "0.1.2";

const T = {
  de: {
    printing: "Druckt", paused: "Pausiert", complete: "Fertig", cancelled: "Abgebrochen",
    error: "Fehler", standby: "Bereit", offline: "Offline",
    light: "Licht", filament: "Filament", file: "Datei", layer: "Schicht", height: "Höhe",
    left: "Restzeit", eta: "Fertig um", tomorrow: "morgen", elapsed: "Läuft seit",
    used: "Filament", speed: "Tempo", pause: "Pause", resume: "Fortsetzen", cancel: "Abbrechen",
    confirmCancel: "Druck wirklich abbrechen?", nozzle: "Düse", bed: "Bett", bedOuter: "Bett außen",
    heater: "Heizung", partFan: "Bauteillüfter", speedFactor: "Geschwindigkeit", home: "Home",
    estop: "NOT-AUS", confirmEstop: "Not-Aus auslösen? Danach ist ein Firmware-Neustart nötig.",
    jobs: "Drucke", printTime: "Druckzeit", longest: "Längster Druck", stats: "Statistik",
    noDevice: "Bitte im Editor einen Moonraker-Drucker auswählen.",
    notFound: "Keine Moonraker-Entitäten gefunden für",
    temps: "Temperaturen", controls: "Steuerung", camOff: "Kamera nicht erreichbar",
    edDevice: "Drucker (Moonraker-Gerät)", edPrefix: "oder Entitäts-Präfix (z. B. hobbyraum_neptune_4_pro)",
    edName: "Name", edCamera: "Kamera", edRotate: "Kamera drehen", edFlip: "Kamera spiegeln",
    edShowCam: "Kamera anzeigen", edShowStats: "Statistik anzeigen", edShowControls: "Steuerung anzeigen",
    edShowTemps: "Temperaturen anzeigen", edLive: "Live-Video statt Standbild", edRefresh: "Standbild-Intervall",
  },
  en: {
    printing: "Printing", paused: "Paused", complete: "Complete", cancelled: "Cancelled",
    error: "Error", standby: "Ready", offline: "Offline",
    light: "Light", filament: "Filament", file: "File", layer: "Layer", height: "Height",
    left: "Time left", eta: "Done at", tomorrow: "tomorrow", elapsed: "Elapsed",
    used: "Filament", speed: "Speed", pause: "Pause", resume: "Resume", cancel: "Cancel",
    confirmCancel: "Really cancel the print?", nozzle: "Nozzle", bed: "Bed", bedOuter: "Bed outer",
    heater: "Heater", partFan: "Part fan", speedFactor: "Speed factor", home: "Home",
    estop: "E-STOP", confirmEstop: "Trigger emergency stop? A firmware restart is needed afterwards.",
    jobs: "Prints", printTime: "Print time", longest: "Longest print", stats: "Statistics",
    noDevice: "Please pick a Moonraker printer in the editor.",
    notFound: "No Moonraker entities found for",
    temps: "Temperatures", controls: "Controls", camOff: "Camera not reachable",
    edDevice: "Printer (Moonraker device)", edPrefix: "or entity prefix (e.g. my_printer)",
    edName: "Name", edCamera: "Camera", edRotate: "Rotate camera", edFlip: "Mirror camera",
    edShowCam: "Show camera", edShowStats: "Show statistics", edShowControls: "Show controls",
    edShowTemps: "Show temperatures", edLive: "Live video instead of snapshots", edRefresh: "Snapshot interval",
  },
};

const tr = (hass, key) => {
  const lang = (hass?.locale?.language || hass?.language || "en").slice(0, 2);
  return (T[lang] || T.en)[key] ?? T.en[key] ?? key;
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmt = (hass, n, digits = 0) =>
  n === null ? "–" : n.toLocaleString(hass?.locale?.language || "en", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/* Find the entity prefix of a Moonraker device: "sensor.<prefix>_current_print_state" */
function prefixFromDevice(hass, deviceId) {
  if (!hass?.entities || !deviceId) return null;
  for (const [eid, ent] of Object.entries(hass.entities)) {
    if (ent.device_id === deviceId && eid.startsWith("sensor.") && eid.endsWith("_current_print_state")) {
      return eid.slice("sensor.".length, -"_current_print_state".length);
    }
  }
  return null;
}

/* Collect all entities belonging to a prefix */
function resolveEntities(hass, prefix, config) {
  const p = prefix;
  const has = (id) => id && hass.states[id] !== undefined;
  const pick = (...ids) => ids.find(has) || null;
  const all = Object.keys(hass.states).filter((id) => id.split(".")[1]?.startsWith(p + "_"));
  const suffix = (id) => id.split(".")[1].slice(p.length + 1);

  // Heaters: every "<x>_temperature" sensor that has a matching "number.<x>_target"
  const heaters = [];
  for (const id of all) {
    if (!id.startsWith("sensor.") || !id.endsWith("_temperature")) continue;
    const base = suffix(id).replace(/_temperature$/, "");
    const target = `number.${p}_${base}_target`;
    if (!has(target)) continue;
    heaters.push({ base, temp: id, target, power: pick(`sensor.${p}_${base}_power`) });
  }
  const order = (b) => (b.startsWith("extruder") ? 0 : b === "bed" ? 1 : b.startsWith("heater_bed") ? 2 : 3);
  heaters.sort((a, b) => order(a.base) - order(b.base) || a.base.localeCompare(b.base));

  // Cameras: everything of the device except the thumbnail; prefer an available one
  const cams = all.filter((id) => id.startsWith("camera.") && !id.endsWith("_thumbnail"));
  cams.sort((a, b) => (hass.states[a].state === "unavailable") - (hass.states[b].state === "unavailable"));

  return {
    state: pick(`sensor.${p}_current_print_state`),
    printerState: pick(`sensor.${p}_printer_state`),
    message: pick(`sensor.${p}_current_display_message`),
    filename: pick(`sensor.${p}_filename`),
    progress: pick(`sensor.${p}_progress`),
    timeLeft: pick(`sensor.${p}_print_time_left`),
    eta: pick(`sensor.${p}_print_eta`),
    duration: pick(`sensor.${p}_print_duration`),
    filamentUsed: pick(`sensor.${p}_filament_used`),
    printSpeed: pick(`sensor.${p}_print_speed`),
    layer: pick(`sensor.${p}_current_layer`),
    totalLayer: pick(`sensor.${p}_total_layer`),
    z: pick(`sensor.${p}_toolhead_position_z`),
    thumbnail: pick(`camera.${p}_thumbnail`),
    camera: config.camera && has(config.camera) ? config.camera : cams[0] || null,
    lights: all.filter((id) => id.startsWith("switch.") && /light|led/i.test(id)).sort(),
    runout: all.filter((id) => id.startsWith("binary_sensor.") && !id.endsWith("_update_available")),
    heaters,
    partFan: pick(`number.${p}_fan_speed`),
    speedFactor: pick(`number.${p}_speed_factor`),
    pauseBtn: pick(`button.${p}_pause_print`),
    resumeBtn: pick(`button.${p}_resume_print`),
    cancelBtn: pick(`button.${p}_cancel_print`),
    homeBtn: pick(`button.${p}_home_all_axes`),
    estopBtn: pick(`button.${p}_emergency_stop`),
    jobs: pick(`sensor.${p}_totals_jobs`),
    totalTime: pick(`sensor.${p}_totals_print_time`),
    totalFilament: pick(`sensor.${p}_totals_filament_used`),
    longest: pick(`sensor.${p}_longest_print`),
  };
}

function heaterName(hass, base) {
  if (base === "extruder") return tr(hass, "nozzle");
  if (base.startsWith("extruder")) return `${tr(hass, "nozzle")} ${base.replace("extruder", "")}`;
  if (base === "bed") return tr(hass, "bed");
  if (base === "heater_bed1") return tr(hass, "bedOuter");
  return base.replace(/^heater_generic_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function hoursOf(hass, id) {
  const s = hass.states[id];
  const v = num(s?.state);
  if (v === null) return null;
  const f = { h: 1, min: 1 / 60, s: 1 / 3600, d: 24 }[s.attributes.unit_of_measurement] ?? 1;
  return v * f;
}

function fmtDuration(h) {
  if (h === null) return "–";
  const m = Math.round(h * 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}

function fmtEta(hass, id) {
  const s = hass.states[id]?.state;
  const d = s ? new Date(s) : null;
  if (!d || isNaN(d)) return "–";
  const lang = hass.locale?.language || "de";
  const time = d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${tr(hass, "tomorrow")} ${time}`;
}

class MoonrakerPrinterCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("moonraker-printer-card-editor");
  }

  static getStubConfig(hass) {
    const ent = Object.keys(hass.states).find((id) => id.startsWith("sensor.") && id.endsWith("_current_print_state"));
    const devId = ent && hass.entities?.[ent]?.device_id;
    return devId ? { device_id: devId } : { prefix: ent ? ent.slice(7, -21) : "" };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = {
      camera_rotation: 0,
      camera_mirror: false,
      camera_live: true,
      show_camera: true,
      show_temperatures: true,
      show_controls: true,
      show_stats: true,
      ...config,
    };
    this._sig = null;
    this._camFor = null;
    if (this._root) this._update(true);
  }

  getCardSize() {
    return 10;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  set hass(hass) {
    this._hass = hass;
    this._update(false);
  }

  connectedCallback() {
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._root.innerHTML = `<style>${STYLE}</style><ha-card><div id="head"></div><div id="cam"></div><div id="body"></div></ha-card>`;
      this._root.addEventListener("click", (e) => this._onClick(e));
    }
    this._update(true);
    this._loadCam(true);
    this._startCamTimer();
  }

  _prefix() {
    const c = this._config;
    return prefixFromDevice(this._hass, c.device_id) || c.prefix || null;
  }

  _update(force) {
    if (!this._root || !this._hass || !this._config) return;
    const hass = this._hass;
    const prefix = this._prefix();
    const head = this._root.getElementById("head");
    const body = this._root.getElementById("body");
    if (!prefix) {
      head.innerHTML = `<div class="warn">${esc(tr(hass, "noDevice"))}</div>`;
      body.innerHTML = "";
      return;
    }
    const e = resolveEntities(hass, prefix, this._config);
    this._e = e;
    if (!e.state) {
      head.innerHTML = `<div class="warn">${esc(tr(hass, "notFound"))} „${esc(prefix)}“</div>`;
      body.innerHTML = "";
      return;
    }

    // Re-render only when a relevant state changed
    const ids = Object.values(e).flat().flatMap((x) => (x && typeof x === "object" ? Object.values(x) : [x])).filter(Boolean);
    const sig = ids.map((id) => `${hass.states[id]?.state}|${hass.states[id]?.attributes?.entity_picture || ""}`).join(";");
    if (!force && sig === this._sig) return;
    this._sig = sig;

    head.innerHTML = this._renderHead(e);
    this._renderCamera(e);
    body.innerHTML = this._renderJob(e) + this._renderTemps(e) + this._renderControls(e) + this._renderStats(e);
    body.querySelectorAll("img.thumb").forEach((img) =>
      img.addEventListener("error", () => {
        const ph = document.createElement("div");
        ph.className = "thumb ph";
        ph.innerHTML = '<ha-icon icon="mdi:printer-3d"></ha-icon>';
        img.replaceWith(ph);
      })
    );
  }

  _renderHead(e) {
    const hass = this._hass;
    const st = hass.states[e.state].state;
    const ps = e.printerState ? hass.states[e.printerState].state : "ready";
    const key = ps !== "ready" && ps !== "printing" ? (ps === "error" || ps === "shutdown" ? "error" : "offline") : st;
    const label = tr(hass, key);
    const name = this._config.name || hass.states[e.state].attributes.friendly_name?.replace(/\s*Current Print State$/i, "") || "Printer";
    const lights = e.lights
      .map((id, i) => {
        const on = hass.states[id].state === "on";
        return `<button class="chip ${on ? "on" : ""}" data-toggle="${esc(id)}" title="${esc(hass.states[id].attributes.friendly_name)}">
          <ha-icon icon="mdi:lightbulb${on ? "" : "-outline"}"></ha-icon>${e.lights.length > 1 ? i + 1 : ""}</button>`;
      })
      .join("");
    const runout = e.runout
      .map((id) => {
        const ok = hass.states[id].state === "on";
        return `<span class="chip ${ok ? "" : "bad"}" data-more="${esc(id)}" title="${esc(tr(hass, "filament"))}">
          <ha-icon icon="${ok ? "mdi:printer-3d-nozzle" : "mdi:printer-3d-nozzle-alert"}"></ha-icon></span>`;
      })
      .join("");
    return `<div class="head">
      <ha-icon class="logo" icon="mdi:printer-3d"></ha-icon>
      <div class="title"><div class="name">${esc(name)}</div><div class="state s-${esc(key)}">${esc(label)}</div></div>
      <div class="chips">${runout}${lights}</div>
    </div>`;
  }

  _renderCamera(e) {
    const holder = this._root.getElementById("cam");
    const c = this._config;
    if (!c.show_camera || !e.camera) {
      holder.innerHTML = "";
      this._camImg = null;
      this._camFor = null;
      return;
    }
    const rot = Number(c.camera_rotation) || 0;
    const key = `${e.camera}|${c.camera_live}|${rot}|${c.camera_mirror}`;
    if (this._camFor !== key) {
      this._camFor = key;
      const tf = `rotate(${rot}deg)${c.camera_mirror ? " scaleX(-1)" : ""}`;
      holder.innerHTML = `<div class="camwrap off ${rot % 180 ? "quarter" : ""}">
        <div class="cam" style="transform:${tf}"><img alt=""></div>
        <div class="camoff"><ha-icon icon="mdi:video-off-outline"></ha-icon>${esc(tr(this._hass, "camOff"))}</div></div>`;
      const wrap = holder.querySelector(".camwrap");
      const img = holder.querySelector("img");
      img.addEventListener("load", () => {
        wrap.classList.remove("off");
      });
      img.addEventListener("error", () => {
        if (!img.getAttribute("src")) return;
        wrap.classList.add("off");
        clearTimeout(this._camRetry);
        if (this._live()) {
          // MJPEG stream not available for this camera: fall back to refreshed snapshots
          this._camFallback = true;
          this._camSrc = null;
          img.removeAttribute("src");
          this._startCamTimer();
          this._loadCam(true);
        }
      });
      this._camImg = img;
      this._camSrc = null;
      this._camFallback = false;
      this._startCamTimer();
      this._loadCam(true);
    } else {
      this._loadCam(false);
    }
  }

  _live() {
    return !!this._config?.camera_live && !this._camFallback;
  }

  _startCamTimer() {
    clearInterval(this._camTimer);
    this._camTimer = null;
    if (!this.isConnected || !this._config || this._live()) return;
    const sec = Math.max(1, Number(this._config.camera_refresh) || 2);
    this._camTimer = setInterval(() => this._loadCam(true), sec * 1000);
  }

  _camUrl() {
    const s = this._hass?.states[this._e?.camera];
    const pic = s?.attributes?.entity_picture;
    if (!pic || s.state === "unavailable") return null;
    if (this._live()) return pic.replace("/api/camera_proxy/", "/api/camera_proxy_stream/");
    return `${pic}${pic.includes("?") ? "&" : "?"}t=${Date.now()}`;
  }

  /* Live: keep one running MJPEG stream (token rotation does not break it).
     Snapshots: preload the next picture and swap it in, so the image never flickers. */
  _loadCam(reload) {
    const img = this._camImg;
    if (!img || !this.isConnected) return;
    const wrap = img.closest(".camwrap");
    const url = this._camUrl();
    if (!url) {
      img.removeAttribute("src");
      this._camSrc = null;
      wrap?.classList.add("off");
      return;
    }
    if (this._live()) {
      if (reload || !this._camSrc) {
        this._camSrc = url;
        img.src = url;
      }
      return;
    }
    if ((!reload && this._camSrc) || this._camLoading) return;
    this._camLoading = true;
    const pre = new Image();
    pre.onload = () => {
      this._camLoading = false;
      this._camSrc = url;
      img.src = url;
    };
    pre.onerror = () => {
      this._camLoading = false;
      wrap?.classList.add("off");
    };
    pre.src = url;
  }

  disconnectedCallback() {
    clearInterval(this._camTimer);
    clearTimeout(this._camRetry);
    this._camTimer = null;
    if (this._camImg) {
      this._camImg.removeAttribute("src"); // stop the stream while the card is hidden
      this._camSrc = null;
    }
  }

  _renderJob(e) {
    const hass = this._hass;
    const st = hass.states[e.state].state;
    if (st !== "printing" && st !== "paused") return "";
    const pct = num(hass.states[e.progress]?.state) ?? 0;
    const file = (hass.states[e.filename]?.state || "").replace(/\.gcode$/i, "");
    const thumb = e.thumbnail ? hass.states[e.thumbnail]?.attributes?.entity_picture : null;
    const cur = num(hass.states[e.layer]?.state);
    const tot = num(hass.states[e.totalLayer]?.state);
    const z = num(hass.states[e.z]?.state);
    const layer = tot && tot > 0 && cur !== null
      ? [tr(hass, "layer"), `${cur} / ${tot}`]
      : [tr(hass, "height"), z !== null && z >= 0 ? `Z ${fmt(hass, z, 2)} mm` : "–"];
    const used = num(hass.states[e.filamentUsed]?.state);
    const speed = num(hass.states[e.printSpeed]?.state);
    const items = [
      layer,
      [tr(hass, "left"), fmtDuration(hoursOf(hass, e.timeLeft))],
      [tr(hass, "eta"), fmtEta(hass, e.eta)],
      [tr(hass, "elapsed"), fmtDuration(hoursOf(hass, e.duration))],
      [tr(hass, "used"), used !== null ? `${fmt(hass, used, 2)} m` : "–"],
      [tr(hass, "speed"), speed !== null ? `${Math.round(speed)} mm/s` : "–"],
    ];
    const btn = (id, icon, label, cls = "") =>
      id ? `<button class="act ${cls}" data-press="${esc(id)}" ${cls === "danger" ? 'data-confirm="cancel"' : ""}><ha-icon icon="${icon}"></ha-icon>${esc(label)}</button>` : "";
    return `<div class="section job">
      <div class="jobtop">
        ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="">` : `<div class="thumb ph"><ha-icon icon="mdi:printer-3d"></ha-icon></div>`}
        <div class="jobinfo">
          <div class="file" title="${esc(file)}">${esc(file)}</div>
          <div class="bar"><div style="width:${Math.min(100, Math.max(0, pct))}%"></div></div>
          <div class="pct">${fmt(hass, pct)} %</div>
        </div>
      </div>
      <div class="grid">${items.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
      <div class="actions">
        ${st === "printing" ? btn(e.pauseBtn, "mdi:pause", tr(hass, "pause")) : btn(e.resumeBtn, "mdi:play", tr(hass, "resume"))}
        ${btn(e.cancelBtn, "mdi:stop", tr(hass, "cancel"), "danger")}
      </div>
    </div>`;
  }

  _renderTemps(e) {
    const hass = this._hass;
    if (!this._config.show_temperatures || !e.heaters.length) return "";
    const rows = e.heaters
      .map((h) => {
        const t = num(hass.states[h.temp]?.state);
        const tg = num(hass.states[h.target]?.state);
        const pw = num(hass.states[h.power]?.state);
        const hot = tg && tg > 0;
        return `<div class="heater ${hot ? "hot" : ""}">
          <ha-icon icon="${h.base.startsWith("extruder") ? "mdi:printer-3d-nozzle-heat" : "mdi:radiator"}"></ha-icon>
          <div class="hname">${esc(heaterName(hass, h.base))}${pw !== null && hot ? `<small>${Math.round(pw)} %</small>` : ""}</div>
          <div class="hval">${t !== null ? t.toFixed(0) : "–"} °C</div>
          <div class="step">
            <button data-step="${esc(h.target)}" data-d="-5">−</button>
            <span data-more="${esc(h.target)}">${tg !== null ? tg.toFixed(0) : "–"} °C</span>
            <button data-step="${esc(h.target)}" data-d="5">+</button>
          </div>
        </div>`;
      })
      .join("");
    return `<div class="section"><div class="stitle">${esc(tr(hass, "temps"))}</div>${rows}</div>`;
  }

  _renderControls(e) {
    const hass = this._hass;
    if (!this._config.show_controls) return "";
    const stepper = (id, icon, label, d, unit) => {
      if (!id) return "";
      const v = num(hass.states[id]?.state);
      return `<div class="heater">
        <ha-icon icon="${icon}"></ha-icon><div class="hname">${esc(label)}</div><div class="hval"></div>
        <div class="step"><button data-step="${esc(id)}" data-d="-${d}">−</button>
        <span data-more="${esc(id)}">${v !== null ? v.toFixed(0) : "–"} ${unit}</span>
        <button data-step="${esc(id)}" data-d="${d}">+</button></div></div>`;
    };
    const btn = (id, icon, label, cls = "", confirm = "") =>
      id ? `<button class="act ${cls}" data-press="${esc(id)}" ${confirm ? `data-confirm="${confirm}"` : ""}><ha-icon icon="${icon}"></ha-icon>${esc(label)}</button>` : "";
    return `<div class="section"><div class="stitle">${esc(tr(hass, "controls"))}</div>
      ${stepper(e.partFan, "mdi:fan", tr(hass, "partFan"), 10, "%")}
      ${stepper(e.speedFactor, "mdi:speedometer", tr(hass, "speedFactor"), 10, "%")}
      <div class="actions">${btn(e.homeBtn, "mdi:home", tr(hass, "home"))}${btn(e.estopBtn, "mdi:alert-octagon", tr(hass, "estop"), "danger", "estop")}</div>
    </div>`;
  }

  _renderStats(e) {
    const hass = this._hass;
    if (!this._config.show_stats || !e.jobs) return "";
    const v = (id) => {
      const s = hass.states[id];
      if (!s) return "–";
      const n = num(s.state);
      const u = s.attributes.unit_of_measurement || "";
      if (n !== null && u === "m") return `${fmt(hass, n / 1000, 2)} km`;
      if (n !== null && u === "Jobs") return `${Math.round(n)}`;
      return s.state;
    };
    const items = [
      [tr(hass, "jobs"), v(e.jobs)],
      [tr(hass, "printTime"), v(e.totalTime)],
      [tr(hass, "used"), v(e.totalFilament)],
      [tr(hass, "longest"), v(e.longest)],
    ];
    return `<div class="section"><div class="stitle">${esc(tr(hass, "stats"))}</div>
      <div class="grid four">${items.map(([k, val]) => `<div><span>${esc(k)}</span><b>${esc(val)}</b></div>`).join("")}</div></div>`;
  }

  _onClick(ev) {
    const el = ev.composedPath().find((n) => n.dataset && (n.dataset.press || n.dataset.toggle || n.dataset.step || n.dataset.more));
    if (!el) return;
    const hass = this._hass;
    const d = el.dataset;
    if (d.press) {
      if (d.confirm === "cancel" && !confirm(tr(hass, "confirmCancel"))) return;
      if (d.confirm === "estop" && !confirm(tr(hass, "confirmEstop"))) return;
      hass.callService("button", "press", { entity_id: d.press });
    } else if (d.toggle) {
      hass.callService("switch", "toggle", { entity_id: d.toggle });
    } else if (d.step) {
      const s = hass.states[d.step];
      const cur = num(s?.state) ?? 0;
      const min = num(s?.attributes?.min) ?? 0;
      const max = num(s?.attributes?.max) ?? 1000;
      const val = Math.min(max, Math.max(min, Math.round((cur + Number(d.d)) / 5) * 5));
      hass.callService("number", "set_value", { entity_id: d.step, value: val });
    } else if (d.more) {
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: d.more }, bubbles: true, composed: true }));
    }
  }
}

const STYLE = `
ha-card { overflow: hidden; }
.warn { padding: 16px; color: var(--warning-color); }
.head { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
.logo { --mdc-icon-size: 32px; color: var(--primary-color); }
.title { flex: 1; min-width: 0; }
.name { font-size: 1.15em; font-weight: 500; }
.state { font-size: .9em; color: var(--secondary-text-color); }
.s-printing { color: var(--success-color, #4caf50); }
.s-paused { color: var(--warning-color, #ff9800); }
.s-error, .s-cancelled { color: var(--error-color, #f44336); }
.chips { display: flex; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--divider-color); border-radius: 18px;
  padding: 4px 8px; background: none; color: var(--secondary-text-color); cursor: pointer; font: inherit; }
.chip.on { color: var(--state-light-active-color, #ffc107); border-color: currentColor; }
.chip.bad { color: var(--error-color); border-color: currentColor; }
.camwrap { position: relative; overflow: hidden; background: #000; }
.cam img { display: block; width: 100%; min-height: 120px; object-fit: contain; }
.camwrap.off .cam { visibility: hidden; height: 0; }
.camoff { display: none; }
.camwrap.off .camoff { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 160px; color: #bbb; }
.thumb.ph { display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color); --mdc-icon-size: 36px; }
.camwrap.quarter .cam { aspect-ratio: 1; }
.cam { transform-origin: center; }
.section { padding: 12px 16px; border-top: 1px solid var(--divider-color); }
.stitle { font-size: .8em; text-transform: uppercase; letter-spacing: .05em; color: var(--secondary-text-color); margin-bottom: 8px; }
.jobtop { display: flex; gap: 12px; align-items: center; }
.thumb { width: 72px; height: 72px; object-fit: contain; border-radius: 8px; background: var(--secondary-background-color); }
.jobinfo { flex: 1; min-width: 0; }
.file { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.bar { height: 10px; border-radius: 5px; background: var(--secondary-background-color); margin: 8px 0 4px; overflow: hidden; }
.bar div { height: 100%; background: var(--primary-color); border-radius: 5px; transition: width .5s; }
.pct { font-size: 1.4em; font-weight: 500; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.grid.four { grid-template-columns: repeat(4, 1fr); margin-top: 0; }
.grid div { display: flex; flex-direction: column; min-width: 0; }
.grid span { font-size: .78em; color: var(--secondary-text-color); }
.grid b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 420px) { .grid { grid-template-columns: repeat(2, 1fr); } .grid.four { grid-template-columns: repeat(2, 1fr); } }
.actions { display: flex; gap: 8px; margin-top: 12px; }
.act { flex: 1; display: inline-flex; justify-content: center; align-items: center; gap: 6px; padding: 10px; border-radius: 10px;
  border: 0; cursor: pointer; font: inherit; color: var(--text-primary-color, #fff); background: var(--primary-color); }
.act.danger { background: var(--error-color, #f44336); }
.heater { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.heater ha-icon { color: var(--secondary-text-color); }
.heater.hot ha-icon { color: var(--state-climate-heat-color, #ff8100); }
.hname { flex: 1; }
.hname small { margin-left: 6px; color: var(--secondary-text-color); }
.hval { font-weight: 500; min-width: 56px; text-align: right; }
.step { display: flex; align-items: center; gap: 4px; }
.step span { min-width: 58px; text-align: center; cursor: pointer; color: var(--secondary-text-color); }
.step button { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--divider-color); background: none;
  color: var(--primary-text-color); cursor: pointer; font-size: 18px; line-height: 1; }
`;

/* ---------------- Editor ---------------- */
class MoonrakerPrinterCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  _schema() {
    return [
      { name: "device_id", selector: { device: { integration: "moonraker" } } },
      { name: "prefix", selector: { text: {} } },
      { name: "name", selector: { text: {} } },
      { name: "camera", selector: { entity: { domain: "camera" } } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "camera_rotation", selector: { select: { mode: "dropdown", options: ["0", "90", "180", "270"] } } },
          { name: "camera_mirror", selector: { boolean: {} } },
          { name: "show_camera", selector: { boolean: {} } },
          { name: "camera_live", selector: { boolean: {} } },
          { name: "camera_refresh", selector: { number: { min: 1, max: 60, step: 1, mode: "box", unit_of_measurement: "s" } } },
          { name: "show_temperatures", selector: { boolean: {} } },
          { name: "show_controls", selector: { boolean: {} } },
          { name: "show_stats", selector: { boolean: {} } },
        ],
      },
    ];
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) =>
        ({
          device_id: tr(this._hass, "edDevice"),
          prefix: tr(this._hass, "edPrefix"),
          name: tr(this._hass, "edName"),
          camera: tr(this._hass, "edCamera"),
          camera_rotation: tr(this._hass, "edRotate"),
          camera_mirror: tr(this._hass, "edFlip"),
          show_camera: tr(this._hass, "edShowCam"),
          camera_live: tr(this._hass, "edLive"),
          camera_refresh: tr(this._hass, "edRefresh"),
          show_temperatures: tr(this._hass, "edShowTemps"),
          show_controls: tr(this._hass, "edShowControls"),
          show_stats: tr(this._hass, "edShowStats"),
        })[s.name] ?? s.name;
      this._form.addEventListener("value-changed", (ev) => {
        const cfg = { ...ev.detail.value };
        if (cfg.camera_rotation !== undefined) cfg.camera_rotation = Number(cfg.camera_rotation);
        for (const k of Object.keys(cfg)) if (cfg[k] === "" || cfg[k] === undefined) delete cfg[k];
        this._config = cfg;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = this._schema();
    this._form.data = {
      camera_rotation: "0", camera_mirror: false, show_camera: true, camera_live: true,
      show_temperatures: true, show_controls: true, show_stats: true,
      ...this._config,
      ...(this._config.camera_rotation !== undefined ? { camera_rotation: String(this._config.camera_rotation) } : {}),
    };
  }
}

customElements.define("moonraker-printer-card", MoonrakerPrinterCard);
customElements.define("moonraker-printer-card-editor", MoonrakerPrinterCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "moonraker-printer-card",
  name: "Moonraker Printer Card",
  description: "Klipper printer via the Moonraker integration: camera, job, temperatures, controls.",
  preview: false,
  documentationURL: "https://github.com/bggsolar/ha-moonraker-printer-card",
});

console.info(`%c MOONRAKER-PRINTER-CARD %c ${CARD_VERSION} `, "color:#fff;background:#3f51b5;font-weight:700", "color:#3f51b5;background:#fff");
