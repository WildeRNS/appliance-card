/**
 * Universal Appliance Card with Visual Editor for Home Assistant
 * File: /config/www/appliance-card.js
 */

class ApplianceCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = [
        { name: "name", label: "Кастомна назва (необов'язково)", selector: { text: {} } },
        {
          name: "appliance_type",
          label: "Тип приладу",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "washing_machine", label: "Пральна машина" },
                { value: "dishwasher", label: "Посудомийна машина" }
              ]
            }
          }
        },
        { name: "status_entity", label: "Сенсор стану (Status / Binary Sensor) *", selector: { entity: {} } },
        { name: "program_entity", label: "Сенсор програми (Program)", selector: { entity: {} } },
        { name: "phase_entity", label: "Сенсор фази (Phase)", selector: { entity: {} } },
        { name: "progress_entity", label: "Сенсор прогресу % (Progress)", selector: { entity: {} } },
        { name: "remaining_entity", label: "Сенсор залишку часу хв (Remaining Time)", selector: { entity: {} } },
        { name: "power_entity", label: "Сенсор потужності Вт (Power)", selector: { entity: {} } },
      ];
      this._form.computeLabel = (schema) => schema.label;
      this._form.addEventListener("value-changed", (ev) => {
        const event = new CustomEvent("config-changed", {
          detail: { config: ev.detail.value },
          bubbles: true,
          composed: true,
        });
        this.dispatchEvent(event);
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
  }
}

customElements.define("appliance-card-editor", ApplianceCardEditor);

class ApplianceCard extends HTMLElement {
  static STRINGS = {
    uk: {
      name_wm: "Пральна машина",
      name_dw: "Посудомийна машина",
      badge_running: "ПРАЦЮЄ", badge_idle: "ГОТОВО / ВИМКНЕНО", badge_nodata: "НЕМАЄ ДАНИХ",
      ring_running: "ЗАЛИШИЛОСЬ", ring_idle: "ГОТОВО",
      program: "ПРОГРАМА", phase: "ФАЗА", power: "ПОТУЖНІСТЬ",
      off: "Вимкнено", dash: "---", min: "хв", hour: "год", W: "Вт", kW: "кВт",
      tip_history: "Історія",
      need_entity: "Оберіть 'status_entity' у налаштуваннях картки",
    },
    en: {
      name_wm: "Washing Machine",
      name_dw: "Dishwasher",
      badge_running: "RUNNING", badge_idle: "IDLE", badge_nodata: "NO DATA",
      ring_running: "REMAINING", ring_idle: "FINISHED",
      program: "PROGRAM", phase: "PHASE", power: "POWER",
      off: "Off", dash: "---", min: "min", hour: "h", W: "W", kW: "kW",
      tip_history: "History",
      need_entity: "Please select 'status_entity' in card settings",
    }
  };

  static DEFAULTS = {
    appliance_type: "washing_machine",
    running_states: ["on", "true", "running", "працює", "запуск", "starting", "wash", "washing", "spin", "rinse", "отжим", "полоскание", "manual"],
  };

  static async getConfigElement() {
    return document.createElement("appliance-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:appliance-card",
      appliance_type: "washing_machine",
      name: "",
      status_entity: "",
      program_entity: "",
      phase_entity: "",
      progress_entity: "",
      remaining_entity: "",
      power_entity: "",
    };
  }

  setConfig(config) {
    this._config = { ...ApplianceCard.DEFAULTS, ...config };
    this._built = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    this._update();
  }

  getCardSize() {
    return 5;
  }

  connectedCallback() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      if (this._hass && this._built && this._isRunning()) this._update();
    }, 10000);
  }

  disconnectedCallback() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  get _t() {
    const S = ApplianceCard.STRINGS;
    const cfg = this._config?.language;
    if (cfg && S[cfg]) return S[cfg];
    const haLang = (this._hass?.locale?.language || this._hass?.language || "uk").toLowerCase();
    return S[haLang] || S[haLang.split(/[-_]/)[0]] || S.uk;
  }

  _st(entityId) {
    return entityId ? this._hass?.states[entityId] : undefined;
  }

  _isRunning() {
    const c = this._config;
    if (!c.status_entity) return false;
    const status = this._st(c.status_entity);
    if (!status) return false;
    const stVal = String(status.state).toLowerCase();
    return c.running_states.includes(stVal);
  }

  _fmtTimeRemaining(minutes) {
    const m = parseInt(minutes, 10);
    if (isNaN(m) || m < 0) return "---";
    const t = this._t;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if (h > 0) {
      return `${h} ${t.hour} ${remM} ${t.min}`;
    }
    return `${remM} ${t.min}`;
  }

  _fmtPower(val) {
    const p = parseFloat(val);
    const t = this._t;
    if (isNaN(p) || p <= 0) return `0 ${t.W}`;
    if (p >= 1000) {
      return (p / 1000).toFixed(1).replace(".", ",") + ` ${t.kW}`;
    }
    return Math.round(p) + ` ${t.W}`;
  }

  _getCleanVal(entityId, isRunning) {
    const t = this._t;
    if (!entityId || !isRunning) return t.dash;
    const st = this._st(entityId);
    if (!st) return t.dash;
    const val = String(st.state).trim();
    const lower = val.toLowerCase();
    if (["off", "unavailable", "unknown", "none", "idle", "null", ""].includes(lower)) {
      return t.dash;
    }
    return val;
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId },
        bubbles: true,
        composed: true,
      })
    );
  }

  _getApplianceSVG(type) {
    if (type === "dishwasher") {
      return `
        <svg class="machine" id="machine" viewBox="0 0 220 232" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="dw-body" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#ffffff"/>
              <stop offset=".55" stop-color="#f2f5f9"/>
              <stop offset="1" stop-color="#d9e0e9"/>
            </linearGradient>
            <linearGradient id="dw-door" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#2c3e50"/>
              <stop offset="1" stop-color="#1a252f"/>
            </linearGradient>
          </defs>
          <ellipse cx="110" cy="222" rx="76" ry="8" fill="#20304a" opacity=".16"/>
          <rect x="30" y="8" width="160" height="204" rx="18" fill="url(#dw-body)"/>
          <rect x="30" y="8" width="160" height="204" rx="18" fill="none" stroke="#c7cfda" stroke-width="1.4"/>
          <rect x="48"  y="210" width="10" height="7" rx="3" fill="#9aa6b4"/>
          <rect x="162" y="210" width="10" height="7" rx="3" fill="#9aa6b4"/>
          <rect x="38" y="18" width="144" height="28" rx="6" fill="#1e2c4d"/>
          <text id="dispTime" x="110" y="36" text-anchor="middle" font-family="ui-monospace, Consolas, monospace" font-size="12" font-weight="700" fill="#22b263" letter-spacing="1">--:--</text>
          <rect x="42" y="54" width="136" height="146" rx="12" fill="url(#dw-door)"/>
          <g class="water-jets">
            <path d="M 70 120 Q 110 80 150 120" fill="none" stroke="#56a8ff" stroke-width="3" stroke-dasharray="6 4" opacity="0.8"/>
            <path d="M 70 160 Q 110 120 150 160" fill="none" stroke="#56a8ff" stroke-width="3" stroke-dasharray="6 4" opacity="0.8"/>
            <circle cx="90" cy="130" r="12" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.5"/>
            <circle cx="130" cy="130" r="12" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.5"/>
          </g>
          <g class="arcs">
            <circle cx="110" cy="128" r="53" fill="none" stroke="#2f80ed" stroke-width="4" stroke-linecap="round" stroke-dasharray="80 120" opacity=".7"/>
          </g>
        </svg>
      `;
    }

    return `
      <svg class="machine" id="machine" viewBox="0 0 220 232" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="wm-glass" cx=".4" cy=".35" r=".85">
            <stop offset="0" stop-color="#2c3645"/>
            <stop offset=".6" stop-color="#141923"/>
            <stop offset="1" stop-color="#090c12"/>
          </radialGradient>
        </defs>
        <ellipse cx="110" cy="222" rx="76" ry="7" fill="#20304a" opacity=".16"/>
        <rect x="44" y="216" width="12" height="6" rx="2" fill="#121315"/>
        <rect x="164" y="216" width="12" height="6" rx="2" fill="#121315"/>
        <rect x="30" y="8" width="160" height="210" rx="14" fill="#ffffff"/>
        <rect x="30" y="8" width="160" height="210" rx="14" fill="none" stroke="#d0d6de" stroke-width="1.5"/>
        <path d="M 30 22 L 30 50 L 190 50 L 190 22 A 14 14 0 0 0 176 8 L 44 8 A 14 14 0 0 0 30 22 Z" fill="#111317"/>
        <line x1="30" y1="50" x2="190" y2="50" stroke="#2a2e37" stroke-width="1"/>
        <text x="36" y="24" font-family="sans-serif" font-size="6" font-weight="900" fill="#ffffff" letter-spacing="0.6">MILANO</text>
        <text x="63" y="24" font-family="sans-serif" font-size="4.5" fill="#8892a0">AquaForce</text>
        <circle cx="110" cy="29" r="11" fill="#1e222a" stroke="#363c48" stroke-width="1.5"/>
        <line x1="110" y1="19" x2="110" y2="23" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="110" cy="29" r="14" fill="none" stroke="#485060" stroke-width="1" stroke-dasharray="1.5 3.5"/>
        <rect x="142" y="18" width="40" height="20" rx="4" fill="#05070a"/>
        <text id="dispTime" x="162" y="32" text-anchor="middle" font-family="ui-monospace, Consolas, monospace" font-size="10.5" font-weight="700" fill="#e2f1ff" letter-spacing="1">--:--</text>
        <circle cx="110" cy="136" r="56" fill="#14171d"/>
        <circle cx="110" cy="136" r="56" fill="none" stroke="#232833" stroke-width="1.5"/>
        <circle cx="110" cy="136" r="46" fill="#202530"/>
        <circle cx="110" cy="136" r="39" fill="url(#wm-glass)"/>
        <circle cx="110" cy="136" r="39" fill="none" stroke="#3e4858" stroke-width="1"/>
        <g class="laundry">
          <circle cx="100" cy="132" r="13" fill="#ea4335"/>
          <circle cx="119" cy="139" r="12" fill="#4285f4"/>
          <circle cx="110" cy="123" r="10" fill="#fbbc05"/>
          <circle cx="103" cy="143" r="7"  fill="#f28b82" opacity=".9"/>
        </g>
        <ellipse cx="96" cy="116" rx="20" ry="10" fill="#ffffff" opacity=".12" transform="rotate(-24 96 116)"/>
        <g class="arcs">
          <circle cx="110" cy="136" r="49" fill="none" stroke="#2f80ed" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="90 60" opacity=".9"/>
        </g>
        <rect x="150" y="186" width="22" height="18" rx="3" fill="#ffffff" stroke="#c8ced7" stroke-width="1.2"/>
        <line x1="168" y1="195" x2="168" y2="199" stroke="#9aa3af" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    `;
  }

  _build() {
    const c = this._config;
    const t = this._t;
    const isDw = c.appliance_type === "dishwasher";
    const defaultIcon = isDw ? "mdi:dishwasher" : "mdi:washing-machine";
    const defaultName = isDw ? t.name_dw : t.name_wm;

    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          display: block;
          border-radius: 24px;
          padding: 16px 16px 14px;
          overflow: hidden;
          position: relative;
          background: linear-gradient(180deg, #edf3fb 0%, #e4edf8 55%, #dfe9f6 100%);
          color: #1c2733;
          font-family: var(--paper-font-body1_-_font-family, inherit);
          box-shadow: var(--ha-card-box-shadow, 0 6px 20px rgba(38, 63, 97, .10));
        }
        ha-card::before {
          content: ""; position: absolute; top: 0; left: 0; right: 0; height: 5px;
          background: linear-gradient(90deg, #2f80ed, #56a8ff);
        }

        .header { display: flex; align-items: center; gap: 10px; }
        .h-icon {
          width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0;
          background: #fff; box-shadow: 0 3px 10px rgba(47,128,237,.18);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        .h-title {
          font-size: 17.5px; font-weight: 700; letter-spacing: .2px;
          flex: 0 1 auto; min-width: 56px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .badge {
          display: flex; align-items: center; gap: 7px; flex-shrink: 0;
          font-size: 11px; font-weight: 700; letter-spacing: .7px;
          padding: 6px 11px; border-radius: 999px;
          background: #e3e8ee; color: #6b7684; white-space: nowrap;
        }
        .badge .b-dot { width: 7px; height: 7px; border-radius: 50%; background: #9aa5b1; }
        .running .badge { background: #d9f2e2; color: #1c9a55; }
        .running .badge .b-dot { background: #22b263; animation: pulse 1.6s ease-in-out infinite; }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,178,99,.45); }
          50%      { box-shadow: 0 0 0 5px rgba(34,178,99,0); }
        }
        .h-spacer { flex: 1; }
        .h-btn {
          width: 35px; height: 35px; border-radius: 12px; flex-shrink: 0;
          background: rgba(255,255,255,.75); border: 1px solid #d8e0ea;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #7d8894; transition: transform .12s ease;
        }
        .h-btn:active { transform: scale(.94); }
        .h-btn ha-icon { --mdc-icon-size: 19px; }

        .hero { display: flex; justify-content: center; padding: 14px 0 6px; }
        .machine { width: 210px; max-width: 62%; cursor: pointer; }
        .laundry { transform-origin: 110px 136px; }
        .arcs    { transform-origin: 110px 136px; }
        .water-jets { transform-origin: 110px 128px; }

        .running .arcs { animation: spin 3s linear infinite; }
        .running .laundry { animation: tumble 3s ease-in-out infinite; }
        .running .water-jets { animation: spray 2s ease-in-out infinite alternate; }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes tumble {
          0%, 100% { transform: rotate(-14deg); }
          50%      { transform: rotate(16deg); }
        }
        @keyframes spray {
          0% { transform: scale(0.9) rotate(-5deg); opacity: 0.6; }
          100% { transform: scale(1.05) rotate(5deg); opacity: 1; }
        }

        .panel {
          background: rgba(255,255,255,.72);
          border: 1px solid rgba(255,255,255,.9);
          border-radius: 18px; padding: 14px 16px; margin-top: 12px;
          box-shadow: 0 2px 10px rgba(38,63,97,.05);
          position: relative;
        }

        .status-panel { display: flex; align-items: center; gap: 16px; }
        .ring-box { position: relative; width: 92px; height: 92px; flex-shrink: 0; cursor: pointer; }
        .ring-box svg { width: 100%; height: 100%; }
        .ring-track { stroke: #dde5ee; }
        .ring-arc { stroke: #2f80ed; stroke-linecap: round; transition: stroke-dashoffset 0.5s ease; }
        .ring-anim { transform-origin: 48px 48px; }
        .running .ring-anim { animation: spin 2.5s linear infinite; }

        .ring-center {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; text-align: center;
        }
        .ring-time { font-size: 14.5px; font-weight: 800; line-height: 1.1; color: #1c2733; }
        .ring-label {
          font-size: 8px; font-weight: 700; letter-spacing: .8px; color: #8a95a3;
          margin-top: 3px; max-width: 65px; overflow: hidden; white-space: nowrap;
        }

        .st-col { flex: 1; min-width: 0; padding-right: 48px; }
        .st-program { font-size: 16px; font-weight: 800; color: #1c2733; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .st-phase { font-size: 13px; color: #506173; font-weight: 600; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .bar { height: 8px; border-radius: 6px; background: #e2e9f1; margin-top: 10px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 6px; width: 0%; background: linear-gradient(90deg, #2f80ed, #56a8ff); transition: width .5s ease; }

        .power-badge {
          position: absolute; top: 14px; right: 16px;
          display: flex; align-items: center; gap: 4px;
          font-size: 12px; font-weight: 800; color: #2f80ed;
          background: rgba(47, 128, 237, 0.08); padding: 4px 8px;
          border-radius: 8px; border: 1px solid rgba(47, 128, 237, 0.15);
          cursor: pointer;
        }
        .power-badge ha-icon { --mdc-icon-size: 14px; color: #2f80ed; }

        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 12px; }
        .info-card { background: rgba(255,255,255,.72); border: 1px solid rgba(255,255,255,.9); border-radius: 14px; padding: 10px 12px; cursor: pointer; }
        .info-label { font-size: 10px; font-weight: 700; letter-spacing: .8px; color: #8a95a3; }
        .info-value { font-size: 13.5px; font-weight: 700; margin-top: 3px; color: #1c2733; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .alert-box { padding: 12px; background: #fee2e2; color: #991b1b; border-radius: 12px; font-weight: 600; font-size: 13px; text-align: center; }
      </style>

      <ha-card>
        <div class="wrap idle" id="wrap">
          <div class="header">
            <div class="h-icon" id="hIcon">
              <ha-icon icon="${defaultIcon}" style="color: #2f80ed;"></ha-icon>
            </div>
            <div class="h-title" id="name">${c.name || defaultName}</div>
            <div class="badge"><span class="b-dot"></span><span id="badgeText"></span></div>
            <div class="h-spacer"></div>
            <div class="h-btn" id="chartBtn" title="${t.tip_history}">
              <ha-icon icon="mdi:chart-bar"></ha-icon>
            </div>
          </div>

          <div class="hero">
            ${this._getApplianceSVG(c.appliance_type)}
          </div>

          <div id="mainContent">
            <div class="panel status-panel">
              <div class="power-badge" id="powerBadge" title="${t.power}">
                <ha-icon icon="mdi:flash"></ha-icon>
                <span id="powerVal">0 Вт</span>
              </div>

              <div class="ring-box" id="ringBox">
                <svg viewBox="0 0 96 96">
                  <circle class="ring-track" cx="48" cy="48" r="39" fill="none" stroke-width="8"/>
                  <g class="ring-anim">
                    <circle class="ring-arc" id="ringArc" cx="48" cy="48" r="39" fill="none"
                            stroke-width="8" stroke-dasharray="245" stroke-dashoffset="245" transform="rotate(-90 48 48)"/>
                  </g>
                </svg>
                <div class="ring-center">
                  <div class="ring-time" id="ringTime">---</div>
                  <div class="ring-label" id="ringLabel"></div>
                </div>
              </div>

              <div class="st-col">
                <div class="st-program" id="stProgram">---</div>
                <div class="st-phase" id="stPhase">---</div>
                <div class="bar" id="bar"><div class="bar-fill" id="barFill"></div></div>
              </div>
            </div>

            <div class="info-grid">
              <div class="info-card" id="cardProg">
                <div class="info-label">${t.program}</div>
                <div class="info-value" id="valProgram">---</div>
              </div>
              <div class="info-card" id="cardPhase">
                <div class="info-label">${t.phase}</div>
                <div class="info-value" id="valPhase">---</div>
              </div>
            </div>
          </div>

          <div id="alertBox" class="alert-box" style="display: none; margin-top: 12px;">${t.need_entity}</div>

        </div>
      </ha-card>
    `;

    const mi = (ent) => () => this._moreInfo(ent);
    root.getElementById("machine")?.addEventListener("click", mi(c.status_entity));
    root.getElementById("hIcon")?.addEventListener("click", mi(c.status_entity));
    root.getElementById("chartBtn")?.addEventListener("click", mi(c.status_entity));
    root.getElementById("ringBox")?.addEventListener("click", mi(c.remaining_entity || c.status_entity));
    root.getElementById("powerBadge")?.addEventListener("click", mi(c.power_entity));
    root.getElementById("cardProg")?.addEventListener("click", mi(c.program_entity));
    root.getElementById("cardPhase")?.addEventListener("click", mi(c.phase_entity));

    this._built = true;
  }

  _update() {
    const root = this.shadowRoot;
    if (!root) return;

    const c = this._config;
    const t = this._t;
    const wrap = root.getElementById("wrap");
    if (!wrap) return;

    const mainContent = root.getElementById("mainContent");
    const alertBox = root.getElementById("alertBox");

    if (!c.status_entity) {
      if (mainContent) mainContent.style.display = "none";
      if (alertBox) alertBox.style.display = "block";
      return;
    } else {
      if (mainContent) mainContent.style.display = "block";
      if (alertBox) alertBox.style.display = "none";
    }

    const running = this._isRunning();
    wrap.classList.toggle("running", running);
    wrap.classList.toggle("idle", !running);

    const isDw = c.appliance_type === "dishwasher";
    const nameEl = root.getElementById("name");
    if (nameEl) nameEl.textContent = c.name || (isDw ? t.name_dw : t.name_wm);

    const status = this._st(c.status_entity);
    const noData = !status || ["unknown", "unavailable"].includes(status.state);
    const badgeTextEl = root.getElementById("badgeText");
    if (badgeTextEl) {
      badgeTextEl.textContent = noData ? t.badge_nodata : running ? t.badge_running : t.badge_idle;
    }

    const remState = c.remaining_entity ? this._st(c.remaining_entity)?.state : null;
    const remFmt = running ? this._fmtTimeRemaining(remState) : "---";

    const dispTimeEl = root.getElementById("dispTime");
    if (dispTimeEl) dispTimeEl.textContent = running ? remFmt : "--:--";

    const ringTimeEl = root.getElementById("ringTime");
    if (ringTimeEl) ringTimeEl.textContent = running ? remFmt : "0 " + t.min;

    const ringLabelEl = root.getElementById("ringLabel");
    if (ringLabelEl) ringLabelEl.textContent = running ? t.ring_running : t.ring_idle;

    const powerRaw = c.power_entity ? this._st(c.power_entity)?.state : null;
    const powerValEl = root.getElementById("powerVal");
    if (powerValEl) powerValEl.textContent = this._fmtPower(powerRaw);

    const progRaw = c.progress_entity ? this._st(c.progress_entity)?.state : null;
    const progNum = parseFloat(progRaw);
    let progress = isNaN(progNum) ? 0 : Math.min(100, Math.max(0, progNum));
    
    if (running && (isNaN(progNum) || progress === 0)) {
      progress = 65;
    }

    const offset = 245 - (245 * progress) / 100;
    const ringArcEl = root.getElementById("ringArc");
    if (ringArcEl) ringArcEl.style.strokeDashoffset = running ? offset : 245;

    const barFillEl = root.getElementById("barFill");
    if (barFillEl) barFillEl.style.width = running ? `${progress}%` : "0%";

    const programText = this._getCleanVal(c.program_entity, running);
    const phaseText = this._getCleanVal(c.phase_entity, running);

    const stProgramEl = root.getElementById("stProgram");
    if (stProgramEl) stProgramEl.textContent = programText;

    const stPhaseEl = root.getElementById("stPhase");
    if (stPhaseEl) stPhaseEl.textContent = phaseText;

    const valProgramEl = root.getElementById("valProgram");
    if (valProgramEl) valProgramEl.textContent = programText;

    const valPhaseEl = root.getElementById("valPhase");
    if (valPhaseEl) valPhaseEl.textContent = phaseText;
  }
}

customElements.define("appliance-card", ApplianceCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "appliance-card",
  name: "Universal Appliance Card",
  description: "Animated card for Washing Machine and Dishwasher.",
});