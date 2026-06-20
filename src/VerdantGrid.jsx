import React, { useState, useEffect, useMemo, useCallback } from "react";

/* ============================================================================
   VERDANT GRID: RESTORATION — Multi-Regional Macro-Environmental Engine
   Single-file, dependency-free simulation core.
   Win  : Ecological Balance reaches 100%.
   Lose : Ecological Balance falls to 0%.
   Runs persist to localStorage automatically.
============================================================================ */

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 1) => { const f = 10 ** d; return Math.round(v * f) / f; };
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

const SAVE_KEY = "verdant-grid-save-v1";
const BEST_KEY = "verdant-grid-best-v1";

/* ---------------------------------------------------------------------------
   1. SEVEN-REGION STATE MATRIX — archetypal starting conditions
--------------------------------------------------------------------------- */
const REGION_DEFS = [
  { id: "na", name: "North America", flag: "🦅",
    ecoFunds: 980, loyalty: 62, carbon: 88,
    forest: 55, soil: 60, river: 58, ocean: 62, fish: 60, animals: 58, freshwater: 66 },
  { id: "eu", name: "Europe", flag: "🏰",
    ecoFunds: 900, loyalty: 66, carbon: 80,
    forest: 50, soil: 64, river: 62, ocean: 60, fish: 58, animals: 54, freshwater: 68 },
  { id: "ru", name: "Russia", flag: "🐻", perm: true, runoff: true,
    ecoFunds: 620, loyalty: 55, carbon: 72,
    forest: 78, soil: 55, river: 48, ocean: 54, fish: 52, animals: 66, freshwater: 60 },
  { id: "as", name: "Asia", flag: "🏯", strict: true,
    ecoFunds: 700, loyalty: 58, carbon: 96,
    forest: 42, soil: 48, river: 36, ocean: 50, fish: 54, animals: 46, freshwater: 42 },
  { id: "sa", name: "South America", flag: "🦜", poaching: true,
    ecoFunds: 430, loyalty: 38, carbon: 50,
    forest: 92, soil: 70, river: 66, ocean: 58, fish: 60, animals: 95, freshwater: 72 },
  { id: "af", name: "Africa", flag: "🦁", poaching: true,
    ecoFunds: 360, loyalty: 34, carbon: 46,
    forest: 85, soil: 58, river: 54, ocean: 56, fish: 58, animals: 93, freshwater: 50 },
  { id: "oc", name: "Oceania", flag: "🐠", marine: true,
    ecoFunds: 540, loyalty: 60, carbon: 44,
    forest: 60, soil: 56, river: 60, ocean: 90, fish: 88, animals: 64, freshwater: 62 },
];
const REGION_INDEX = Object.fromEntries(REGION_DEFS.map((r) => [r.id, r]));

const POLICY_DEFS = [
  { id: "caps",     name: "Industrial Output Caps",       upkeep: 7.0, icon: "🏭",
    effect: "CO₂ ↓  Warming ↓  River ↑  Ocean ↑   (loyalty cost)" },
  { id: "recycle",  name: "Mass Recycling Frameworks",    upkeep: 4.5, icon: "♻️",
    effect: "Soil ↑  Ocean Quality ↑" },
  { id: "river",    name: "Riverway Restoration",         upkeep: 5.0, icon: "🌊",
    effect: "River Health ↑  Freshwater ↑" },
  { id: "fishery",  name: "Sustainable Fishery Mandates", upkeep: 4.0, icon: "🎣",
    effect: "Fish Population ↑ (halts overfishing)" },
  { id: "wildlife", name: "Anti-Poaching & Corridors",    upkeep: 5.5, icon: "🦏",
    effect: "Land Animals ↑  Forest Cover ↑" },
  { id: "social",   name: "Regional Social Programs",     upkeep: 9.0, icon: "🤝",
    effect: "Civic Loyalty ↑↑  (heavy upkeep)" },
];

const blankPolicies = () => Object.fromEntries(POLICY_DEFS.map((p) => [p.id, false]));

/* ---------------------------------------------------------------------------
   Ecological Balance — the single win/lose meter (0 = collapse, 100 = restored)
--------------------------------------------------------------------------- */
function computeBalance(regions, co2, temp) {
  const rs = Object.values(regions);
  const avg = (k) => mean(rs.map((r) => r[k]));
  const co2Score = clamp(((460 - co2) / (460 - 395)) * 100);   // 395 ppm = 100, 460 = 0
  const tempScore = clamp(((2.5 - temp) / (2.5 - 0.8)) * 100); // +0.8°C = 100, +2.5 = 0
  return round(mean([
    avg("forest"), avg("soil"), avg("river"), avg("ocean"),
    avg("fish"), avg("animals"), avg("loyalty"), co2Score, tempScore,
  ]));
}

/* ---------------------------------------------------------------------------
   World construction
--------------------------------------------------------------------------- */
function makeInitialWorld() {
  const regions = {};
  for (const d of REGION_DEFS) {
    regions[d.id] = {
      id: d.id,
      ecoFunds: d.ecoFunds, loyalty: d.loyalty, carbon: d.carbon,
      forest: d.forest, soil: d.soil, river: d.river, ocean: d.ocean,
      fish: d.fish, animals: d.animals, freshwater: d.freshwater,
      policies: blankPolicies(),
      ruleBreaking: d.loyalty < 40,
      underfunded: false,
    };
  }
  const co2 = 416;
  const temp = round(1.0 + (co2 - 415) * 0.07, 2);
  const balance = computeBalance(regions, co2, temp);
  return {
    tick: 0, co2, temp,
    permafrost: false, permafrostCo2: 0,
    balance, bestBalance: balance, status: "playing",
    flags: {}, regions,
    events: [{ id: "seed", t: 0, kind: "info",
      msg: "🌍 Verdant Grid online — 7 regional biospheres handed to your stewardship." }],
  };
}

/* ---------------------------------------------------------------------------
   2 + 3. THE TICK ENGINE — cross-matrix multi-vector simulation
--------------------------------------------------------------------------- */
function stepWorld(prev) {
  if (prev.status !== "playing") return prev; // freeze on win/lose

  const events = [];
  let seq = 0;
  const addEvent = (msg, kind) =>
    events.push({ id: `${prev.tick + 1}-${seq++}`, t: prev.tick + 1, msg, kind });

  const flags = { ...prev.flags };
  let { co2, temp, permafrost, permafrostCo2 } = prev;

  const regions = {};
  let illegalCo2 = 0;
  const acc = { carbon: [], forest: [] };

  for (const id of Object.keys(prev.regions)) {
    const r = prev.regions[id];
    const def = REGION_INDEX[id];
    const p = r.policies;

    /* --- economy --- */
    const income = 25 + r.carbon * 0.35;
    let upkeep = 0;
    for (const pol of POLICY_DEFS) if (p[pol.id]) upkeep += pol.upkeep;
    let ecoFunds = r.ecoFunds + income;
    let underfunded = false;
    if (ecoFunds < upkeep) { underfunded = true; ecoFunds = 0; }
    else { ecoFunds -= upkeep; }

    /* --- LOYALTY MULTIPLIER scales all restorative effectiveness --- */
    const loyaltyMult = clamp(r.loyalty, 0, 100) / 100;
    const eff = loyaltyMult * (underfunded ? 0.35 : 1);

    let { forest, soil, river, ocean, fish, animals, freshwater, carbon, loyalty } = r;

    /* --- baseline planetary pressures --- */
    carbon     = clamp(carbon + (p.caps ? -1.1 : 0.12), 10, 100);
    soil       = clamp(soil - 0.08);
    forest     = clamp(forest - (def.poaching ? 0.4 : 0.15));
    animals    = clamp(animals - (def.poaching ? 0.35 : 0.1));
    river      = clamp(river - carbon * 0.004 - (def.runoff ? 0.12 : 0));
    ocean      = clamp(ocean - 0.05 - (def.marine ? 0.04 : 0));
    fish       = clamp(fish - (p.fishery ? 0 : 0.16));
    freshwater = clamp(freshwater - 0.05);
    loyalty    = clamp(loyalty - 0.05);

    /* --- POLICY MULTI-VECTOR IMPACTS (scaled by loyalty) --- */
    if (p.caps)     { river = clamp(river + 0.18 * eff); ocean = clamp(ocean + 0.14 * eff);
                      loyalty = clamp(loyalty - (def.strict ? 1.3 : 0.55)); }
    if (p.recycle)  { soil = clamp(soil + 0.5 * eff);    ocean = clamp(ocean + 0.26 * eff); }
    if (p.river)    { river = clamp(river + 0.7 * eff);  freshwater = clamp(freshwater + 0.6 * eff); }
    if (p.fishery)  { fish = clamp(fish + 0.55 * eff); }
    if (p.wildlife) { animals = clamp(animals + 0.7 * eff); forest = clamp(forest + 0.32 * eff); }
    if (p.social)   { loyalty = clamp(loyalty + 1.25 * (underfunded ? 0.4 : 1)); }
    if (underfunded) loyalty = clamp(loyalty - 0.4);

    /* --- TIPPING POINT: Rule Breaking (loyalty < 40) --- */
    let ruleBreaking = false;
    if (loyalty < 40) {
      ruleBreaking = true;
      const sev = (40 - loyalty) / 40;
      forest  = clamp(forest  - 0.8 - 1.2 * sev);
      animals = clamp(animals - 0.9 - 1.3 * sev);
      river   = clamp(river   - 0.5);
      ocean   = clamp(ocean   - 0.4);
      carbon  = clamp(carbon  + 0.5, 10, 100);
      illegalCo2 += 0.15 + 0.4 * sev;
    }

    /* --- permafrost feedback on vulnerable regions --- */
    if (permafrost && def.perm) {
      carbon  = clamp(carbon + 0.3, 10, 100);
      forest  = clamp(forest - 0.25);
      illegalCo2 += 0.1;
    }

    /* --- per-region milestone events --- */
    if (ruleBreaking && !r.ruleBreaking)
      addEvent(`⛔ ${def.name}: loyalty collapsed below 40% — illegal logging, poaching & dumping surging.`, "crisis");
    if (!ruleBreaking && r.ruleBreaking)
      addEvent(`✅ ${def.name}: civic order restored — regulations enforced once more.`, "good");
    if (underfunded && !r.underfunded)
      addEvent(`💸 ${def.name}: treasury insolvent — active programs running underfunded.`, "warn");

    acc.carbon.push(carbon); acc.forest.push(forest);

    regions[id] = {
      ...r,
      ecoFunds: round(ecoFunds, 0),
      loyalty: round(loyalty), carbon: round(carbon),
      forest: round(forest), soil: round(soil), river: round(river),
      ocean: round(ocean), fish: round(fish), animals: round(animals),
      freshwater: round(freshwater),
      ruleBreaking, underfunded,
    };
  }

  /* --- GLOBAL ATMOSPHERE / OCEAN INTEGRATION --- */
  const avgCarbon = mean(acc.carbon);
  const avgForest = mean(acc.forest);
  const co2step =
    ((avgCarbon - 55) * 0.02 - (avgForest - 50) * 0.016) * 1.5 +
    illegalCo2 * 0.4 + permafrostCo2;
  co2 = Math.max(380, co2 + co2step);

  const tempTarget = 1.0 + (co2 - 415) * 0.07;
  temp = temp + (tempTarget - temp) * 0.08;

  /* --- GLOBAL TIPPING POINT: +1.5°C → irreversible permafrost thaw --- */
  if (!permafrost && temp > 1.5) {
    permafrost = true; permafrostCo2 = 0.06;
    addEvent("🌡️ TIPPING POINT: +1.5 °C breached — permafrost thaw triggered. Baseline CO₂ now rising irreversibly.", "crisis");
  }
  if (permafrost) permafrostCo2 = Math.min(0.18, permafrostCo2 + 0.0008);

  /* --- debounced global milestones --- */
  const fire = (key, cond, reset, msg, kind) => {
    if (cond && !flags[key]) { flags[key] = true; addEvent(msg, kind); }
    else if (reset && flags[key]) { flags[key] = false; }
  };
  const rs = Object.values(regions);
  const gAvg = (k) => mean(rs.map((x) => x[k]));
  fire("co2hi", co2 >= 435, co2 < 425, "🏭 Global CO₂ surpassed 435 ppm — atmospheric load critical.", "warn");
  fire("temp2", temp >= 2.0, temp < 1.8, "🔥 +2.0 °C reached — runaway warming destabilizing every biome.", "crisis");
  fire("fishcrash", gAvg("fish") < 25, gAvg("fish") > 40, "🐟 Global fishery collapse — fish populations below 25%.", "crisis");
  fire("ocCrash", regions.oc.ocean < 40, regions.oc.ocean > 55, "🌊 Oceania marine system in crisis — Ocean Quality below 40%.", "crisis");
  fire("forestGood", gAvg("forest") > 82, gAvg("forest") < 75, "🌳 Global forest cover above 82% — the biosphere is flourishing.", "good");
  fire("oceanGood", gAvg("ocean") > 78, gAvg("ocean") < 70, "🐬 Oceans recovering — global Ocean Quality above 78%.", "good");

  /* --- ECOLOGICAL BALANCE + WIN / LOSE --- */
  const balance = computeBalance(regions, co2, temp);
  const bestBalance = Math.max(prev.bestBalance, balance);
  let status = "playing";
  if (balance >= 100) { status = "won"; addEvent("🏆 VICTORY — Ecological Balance reached 100%. The planet is fully restored.", "good"); }
  else if (balance <= 0) { status = "lost"; addEvent("☠️ COLLAPSE — Ecological Balance hit 0%. The biosphere has failed.", "crisis"); }
  else if (balance < 18 && !flags.peril) { flags.peril = true; addEvent("🚨 Ecological Balance critically low — collapse imminent.", "crisis"); }
  else if (balance >= 18 && flags.peril) { flags.peril = false; }
  else if (balance > 88 && !flags.nearWin) { flags.nearWin = true; addEvent("🌿 Ecological Balance above 88% — total restoration within reach.", "good"); }
  else if (balance <= 88 && flags.nearWin) { flags.nearWin = false; }

  return {
    tick: prev.tick + 1,
    co2: round(co2, 1), temp: round(temp, 2),
    permafrost, permafrostCo2,
    balance, bestBalance, status,
    flags, regions,
    events: [...events, ...prev.events].slice(0, 60),
  };
}

/* ---------------------------------------------------------------------------
   Derived global dashboard metrics + persistence
--------------------------------------------------------------------------- */
function deriveGlobals(world) {
  const rs = Object.values(world.regions);
  const avg = (k) => round(mean(rs.map((r) => r[k])));
  return {
    co2: world.co2, temp: world.temp,
    forest: avg("forest"), soil: avg("soil"), river: avg("river"),
    ocean: avg("ocean"), fish: avg("fish"), animals: avg("animals"),
  };
}

function loadWorld() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.regions && typeof p.tick === "number" && p.status) return p;
    }
  } catch { /* ignore corrupt save */ }
  return makeInitialWorld();
}

const goodColor = (p) => (p >= 66 ? "#34d399" : p >= 40 ? "#fbbf24" : "#f87171");
const badColor  = (p) => (p >= 66 ? "#f87171" : p >= 40 ? "#fbbf24" : "#34d399");
const balanceColor = (b) => (b >= 70 ? "#34d399" : b >= 40 ? "#fbbf24" : "#f87171");

/* ---------------------------------------------------------------------------
   Presentational pieces
--------------------------------------------------------------------------- */
function Bar({ value, color, height = 8 }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 6, height, overflow: "hidden" }}>
      <div style={{ width: `${clamp(value)}%`, height: "100%", background: color,
        borderRadius: 6, transition: "width .6s ease, background .6s ease" }} />
    </div>
  );
}

function MetricCard({ label, value, unit, pct, color, sub }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "#8aa0b4", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color }}>{value}</span>
        <span style={{ fontSize: 12, color: "#8aa0b4" }}>{unit}</span>
      </div>
      <Bar value={pct} color={color} />
      {sub && <div style={{ fontSize: 10, color: "#6b7f93", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function RegionTab({ region, def, selected, onClick }) {
  return (
    <button onClick={onClick} style={{ flex: "1 1 120px", textAlign: "left", cursor: "pointer",
      background: selected ? "rgba(52,211,153,0.14)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${selected ? "#34d399" : region.ruleBreaking ? "#f87171" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 12, padding: "10px 12px", color: "#e6eef5", transition: "all .2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 18 }}>{def.flag}</span>
        {region.ruleBreaking && (
          <span className="vg-pulse" style={{ fontSize: 9, fontWeight: 700, color: "#fff",
            background: "#dc2626", borderRadius: 20, padding: "2px 7px" }}>RULE-BREAK</span>
        )}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, margin: "6px 0 8px" }}>{def.name}</div>
      <div style={{ fontSize: 9.5, color: "#8aa0b4", marginBottom: 3 }}>
        Loyalty {region.loyalty}% · Funds {region.ecoFunds}Ξ
      </div>
      <Bar value={region.loyalty} color={goodColor(region.loyalty)} height={5} />
    </button>
  );
}

function PolicyToggle({ pol, active, onToggle, disabledHint }) {
  return (
    <button onClick={onToggle} style={{ display: "flex", gap: 12, alignItems: "flex-start",
      textAlign: "left", width: "100%", cursor: "pointer",
      background: active ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${active ? "#34d399" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 10, padding: "10px 12px", color: "#e6eef5", marginBottom: 8 }}>
      <span style={{ fontSize: 20, lineHeight: 1 }}>{pol.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{pol.name}</span>
          <span style={{ fontSize: 11, color: active ? "#34d399" : "#8aa0b4", fontWeight: 700 }}>{active ? "ACTIVE" : "OFF"}</span>
        </div>
        <div style={{ fontSize: 10.5, color: "#8aa0b4", marginTop: 3 }}>{pol.effect}</div>
        <div style={{ fontSize: 10, color: "#6b7f93", marginTop: 2 }}>Upkeep {pol.upkeep}Ξ/cycle {disabledHint}</div>
      </div>
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Endgame overlay
--------------------------------------------------------------------------- */
function EndgameOverlay({ world, onNewGame }) {
  if (world.status === "playing") return null;
  const won = world.status === "won";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,8,12,0.82)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div style={{ background: "#0e1722", border: `2px solid ${won ? "#34d399" : "#f87171"}`,
        borderRadius: 18, padding: "30px 34px", maxWidth: 460, textAlign: "center",
        boxShadow: `0 0 60px ${won ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}` }}>
        <div style={{ fontSize: 52, marginBottom: 6 }}>{won ? "🏆" : "☠️"}</div>
        <h2 style={{ margin: "0 0 6px", fontSize: 26, color: won ? "#34d399" : "#f87171" }}>
          {won ? "PLANET RESTORED" : "BIOSPHERE COLLAPSE"}
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "#aebccb", lineHeight: 1.5 }}>
          {won
            ? "You drove global Ecological Balance to 100%. Every biome is thriving and civic loyalty holds across all seven sectors."
            : "Ecological Balance fell to 0%. Cascading tipping points overwhelmed the grid and the planet's life-support systems failed."}
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 20 }}>
          <Stat label="Final Balance" value={`${Math.round(world.balance)}%`} />
          <Stat label="Peak Balance" value={`${Math.round(world.bestBalance)}%`} />
          <Stat label="Cycles" value={world.tick} />
        </div>
        <button onClick={onNewGame} style={{ ...btn(won ? "#34d399" : "#f87171"), fontSize: 14, padding: "10px 22px" }}>
          ↻ New Game
        </button>
      </div>
    </div>
  );
}
function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#8aa0b4", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------------------------------- */
export default function VerdantGrid() {
  const [world, setWorld] = useState(loadWorld);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState("na");
  const [bestEver, setBestEver] = useState(() => {
    try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch { return 0; }
  });

  // 1-second game tick (scaled by speed); halts on win/lose
  useEffect(() => {
    if (!running || world.status !== "playing") return;
    const iv = setInterval(() => setWorld((w) => stepWorld(w)), 1000 / speed);
    return () => clearInterval(iv);
  }, [running, speed, world.status]);

  // persist the run on every change
  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(world)); } catch { /* quota */ }
  }, [world]);

  // persist all-time best balance (idempotent)
  useEffect(() => {
    if (world.balance > bestEver) {
      setBestEver(world.balance);
      try { localStorage.setItem(BEST_KEY, String(world.balance)); } catch { /* quota */ }
    }
  }, [world.balance, bestEver]);

  const togglePolicy = useCallback((rid, pid) => {
    setWorld((w) => {
      if (w.status !== "playing") return w;
      const r = w.regions[rid];
      return { ...w, regions: { ...w.regions, [rid]: { ...r, policies: { ...r.policies, [pid]: !r.policies[pid] } } } };
    });
  }, []);

  const newGame = useCallback(() => {
    const w = makeInitialWorld();
    setWorld(w); setRunning(true); setSpeed(1); setSelected("na");
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }, []);

  const g = useMemo(() => deriveGlobals(world), [world]);
  const region = world.regions[selected];
  const def = REGION_INDEX[selected];

  const tags = useMemo(() => {
    const t = [];
    if (def.carbon >= 80) t.push("High Carbon Footprint");
    if (def.forest >= 78) t.push("Major Forest Sink");
    if (def.perm) t.push("Permafrost-Vulnerable");
    if (def.runoff) t.push("Nuclear / Industrial Runoff");
    if (def.marine) t.push("Marine-Critical");
    if (def.poaching) t.push("High Poaching Pressure");
    if (def.strict) t.push("Regulation-Averse");
    return t;
  }, [def]);

  const year = 2025 + Math.floor(world.tick / 12);
  const month = (world.tick % 12) + 1;
  const kindColor = { crisis: "#f87171", warn: "#fbbf24", good: "#34d399", info: "#7dd3fc" };

  const regionMetrics = [
    ["Forest Cover", region.forest, "%"], ["Soil Health", region.soil, "%"],
    ["River Health", region.river, "%"], ["Ocean Quality", region.ocean, "%"],
    ["Fish Population", region.fish, "%"], ["Land Animals", region.animals, "%"],
    ["Freshwater", region.freshwater, "%"], ["Industrial Carbon", region.carbon, "%"],
  ];

  return (
    <div style={{ minHeight: "100vh", padding: 20, boxSizing: "border-box" }}>
      <style>{`
        @keyframes vgMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes vgPulse { 0%,100%{opacity:1;} 50%{opacity:.45;} }
        .vg-pulse{ animation: vgPulse 1.1s infinite; }
        .vg-marquee:hover .vg-track { animation-play-state: paused; }
      `}</style>

      <EndgameOverlay world={world} onNewGame={newGame} />

      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* HEADER */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, letterSpacing: 0.5 }}>
              🌱 Verdant Grid <span style={{ color: "#34d399" }}>Restoration</span>
            </h1>
            <div style={{ fontSize: 12, color: "#8aa0b4", marginTop: 2 }}>
              Cycle {world.tick} · {String(month).padStart(2, "0")}/{year} · Best balance ever {Math.round(bestEver)}%
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {world.permafrost && (
              <span className="vg-pulse" style={{ fontSize: 10, fontWeight: 700, color: "#fff",
                background: "#7c2d12", border: "1px solid #f97316", padding: "4px 9px", borderRadius: 20 }}>❄️ PERMAFROST THAW</span>
            )}
            <button onClick={() => setRunning((r) => !r)} style={btn(running ? "#fbbf24" : "#34d399")}>{running ? "⏸ Pause" : "▶ Run"}</button>
            {[0.5, 1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} style={btn(speed === s ? "#34d399" : "#2a3744")}>{s}×</button>
            ))}
            <button onClick={newGame} style={btn("#475569")}>↻ New Game</button>
          </div>
        </div>

        {/* ECOLOGICAL BALANCE — win/lose meter */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${balanceColor(world.balance)}55`,
          borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#8aa0b4" }}>
              Global Ecological Balance
            </span>
            <span style={{ fontSize: 13, color: "#6b7f93" }}>Win at 100% · Lose at 0%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: balanceColor(world.balance), minWidth: 78 }}>
              {Math.round(world.balance)}%
            </span>
            <div style={{ flex: 1 }}><Bar value={world.balance} color={balanceColor(world.balance)} height={14} /></div>
          </div>
        </div>

        {/* GLOBAL BIOSPHERE DASHBOARD */}
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#6b7f93", marginBottom: 8 }}>Global Biosphere Dashboard</div>
        <div style={{ display: "grid", gap: 10, marginBottom: 18, gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))" }}>
          <MetricCard label="CO₂" value={g.co2} unit="ppm" pct={clamp(((g.co2 - 380) / 80) * 100)}
            color={badColor(((g.co2 - 380) / 80) * 100)} sub={world.permafrost ? "thaw feedback rising" : "atmospheric load"} />
          <MetricCard label="Temp Δ" value={`+${g.temp}`} unit="°C" pct={clamp(((g.temp - 0.5) / 2.5) * 100)}
            color={badColor(((g.temp - 0.5) / 2.5) * 100)} sub={g.temp > 1.5 ? "tipping point breached" : "below +1.5 °C threshold"} />
          <MetricCard label="Forest" value={g.forest} unit="%" pct={g.forest} color={goodColor(g.forest)} />
          <MetricCard label="Soil" value={g.soil} unit="%" pct={g.soil} color={goodColor(g.soil)} />
          <MetricCard label="River" value={g.river} unit="%" pct={g.river} color={goodColor(g.river)} />
          <MetricCard label="Ocean" value={g.ocean} unit="%" pct={g.ocean} color={goodColor(g.ocean)} />
          <MetricCard label="Fish" value={g.fish} unit="%" pct={g.fish} color={goodColor(g.fish)} />
          <MetricCard label="Animals" value={g.animals} unit="%" pct={g.animals} color={goodColor(g.animals)} />
        </div>

        {/* REGIONAL SELECTOR */}
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#6b7f93", marginBottom: 8 }}>Regional Sectors</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {REGION_DEFS.map((d) => (
            <RegionTab key={d.id} def={d} region={world.regions[d.id]} selected={selected === d.id} onClick={() => setSelected(d.id)} />
          ))}
        </div>

        {/* SELECTED REGION DETAIL */}
        <div style={{ display: "grid", gap: 16, marginBottom: 18, gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)" }}>
          <div style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{def.flag} {def.name}</h2>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: goodColor(region.loyalty) }}>{region.loyalty}% loyalty</div>
                <div style={{ fontSize: 11, color: "#8aa0b4" }}>Eco-Funds {region.ecoFunds}Ξ {region.underfunded && "· ⚠ underfunded"}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 14px" }}>
              {tags.map((t) => (
                <span key={t} style={{ fontSize: 10, color: "#cbd5e1", background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "3px 9px" }}>{t}</span>
              ))}
            </div>
            {region.ruleBreaking && (
              <div className="vg-pulse" style={{ background: "rgba(220,38,38,0.15)", border: "1px solid #dc2626",
                borderRadius: 10, padding: "10px 12px", fontSize: 12, marginBottom: 14, color: "#fecaca" }}>
                ⛔ <b>Rule-Breaking active.</b> Loyalty below 40% — illegal operations bypass your regulations:
                deforestation, poaching and dumping surge and bleed CO₂ into the atmosphere. Deploy <b>Social Programs</b> to restore order.
              </div>
            )}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              {regionMetrics.map(([label, val, unit]) => {
                const isCarbon = label === "Industrial Carbon";
                return (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8aa0b4", marginBottom: 4 }}>
                      <span>{label}</span><span>{val}{unit}</span>
                    </div>
                    <Bar value={val} color={isCarbon ? badColor(val) : goodColor(val)} />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={panel}>
            <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>Policy Console — {def.name}</h2>
            {POLICY_DEFS.map((pol) => (
              <PolicyToggle key={pol.id} pol={pol} active={region.policies[pol.id]}
                onToggle={() => togglePolicy(selected, pol.id)}
                disabledHint={region.underfunded && region.policies[pol.id] ? "· ⚠ effect at 35%" : ""} />
            ))}
            <div style={{ fontSize: 10.5, color: "#6b7f93", marginTop: 4 }}>
              Effectiveness = policy strength × <b style={{ color: "#34d399" }}>loyalty {region.loyalty}%</b>
              {region.underfunded && " × 35% (underfunded)"}. Income ≈ {round(25 + region.carbon * 0.35, 0)}Ξ/cycle.
            </div>
          </div>
        </div>

        {/* ROLLING EVENT TICKER */}
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#6b7f93", marginBottom: 8 }}>Ecological Event Wire</div>
        <div className="vg-marquee" style={{ overflow: "hidden", whiteSpace: "nowrap", background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 0", marginBottom: 14 }}>
          <div className="vg-track" style={{ display: "inline-block", animation: "vgMarquee 38s linear infinite" }}>
            {[0, 1].map((dup) => (
              <span key={dup}>
                {world.events.slice(0, 18).map((e) => (
                  <span key={dup + e.id} style={{ marginRight: 38, fontSize: 12.5, color: kindColor[e.kind] || "#cbd5e1" }}>
                    <span style={{ color: "#52647a" }}>[{e.t}]</span> {e.msg}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* STATIC EVENT LOG */}
        <div style={{ ...panel, maxHeight: 200, overflowY: "auto", padding: 0 }}>
          {world.events.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 10, padding: "7px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12.5 }}>
              <span style={{ color: "#52647a", minWidth: 42 }}>#{e.t}</span>
              <span style={{ color: kindColor[e.kind] || "#cbd5e1" }}>{e.msg}</span>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: "#52647a", marginTop: 16 }}>
          Verdant Grid: Restoration · runs auto-save to this browser
        </div>
      </div>
    </div>
  );
}

const btn = (c) => ({ cursor: "pointer", background: c, color: "#0a1018", border: "none",
  borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700 });
const panel = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16 };
