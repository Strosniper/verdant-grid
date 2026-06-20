import React, { useState, useEffect, useMemo, useCallback } from "react";

/* ============================================================================
   VERDANT GRID: RESTORATION  —  v2
   Living world map · Eco-Point skill tree (Earth/Water/Animals/Social) ·
   HQ + loyalty-by-distance · Win at 100% Ecological Balance, lose at 0%.
   Runs auto-save to localStorage.
============================================================================ */

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 1) => { const f = 10 ** d; return Math.round(v * f) / f; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const SAVE_KEY = "verdant-grid-save-v2";
const BEST_KEY = "verdant-grid-best-v2";
const BASE_POINT_RATE = 4;

/* ---------------------------------------------------------------------------
   Region gameplay archetypes
--------------------------------------------------------------------------- */
const REGION_DEFS = [
  { id: "na", name: "North America", flag: "🦅",
    loyalty: 62, carbon: 88, forest: 55, soil: 60, river: 58, ocean: 62, fish: 60, animals: 58, freshwater: 66 },
  { id: "eu", name: "Europe", flag: "🏰",
    loyalty: 66, carbon: 80, forest: 50, soil: 64, river: 62, ocean: 60, fish: 58, animals: 54, freshwater: 68 },
  { id: "ru", name: "Russia", flag: "🐻", perm: true, runoff: true,
    loyalty: 55, carbon: 72, forest: 78, soil: 55, river: 48, ocean: 54, fish: 52, animals: 66, freshwater: 60 },
  { id: "as", name: "Asia", flag: "🏯",
    loyalty: 58, carbon: 96, forest: 42, soil: 48, river: 36, ocean: 50, fish: 54, animals: 46, freshwater: 42 },
  { id: "sa", name: "South America", flag: "🦜", poaching: true,
    loyalty: 48, carbon: 50, forest: 92, soil: 70, river: 66, ocean: 58, fish: 60, animals: 95, freshwater: 72 },
  { id: "af", name: "Africa", flag: "🦁", poaching: true,
    loyalty: 44, carbon: 46, forest: 85, soil: 58, river: 54, ocean: 56, fish: 58, animals: 93, freshwater: 50 },
  { id: "oc", name: "Oceania", flag: "🐠", marine: true,
    loyalty: 60, carbon: 44, forest: 60, soil: 56, river: 60, ocean: 90, fish: 88, animals: 64, freshwater: 62 },
];
const REGION_INDEX = Object.fromEntries(REGION_DEFS.map((r) => [r.id, r]));

/* ---------------------------------------------------------------------------
   Map geometry (stylized continents) + tree/structure slots
--------------------------------------------------------------------------- */
const poly = (pts) => "M" + pts.map((p) => p.join(" ")).join(" L ") + " Z";
const REGION_GEO = [
  { id: "na", cx: 175, cy: 135, size: 70, pts: [[110,90],[170,68],[235,82],[258,120],[232,150],[250,185],[210,205],[178,178],[150,200],[118,165],[96,120]] },
  { id: "sa", cx: 268, cy: 330, size: 68, pts: [[235,255],[290,250],[316,292],[300,346],[270,422],[246,402],[236,340],[220,300]] },
  { id: "eu", cx: 512, cy: 112, size: 40, pts: [[472,82],[522,70],[560,92],[548,128],[505,150],[476,126]] },
  { id: "af", cx: 535, cy: 278, size: 70, pts: [[478,198],[548,190],[602,240],[582,312],[540,360],[500,334],[484,268]] },
  { id: "ru", cx: 728, cy: 96, size: 95, pts: [[582,70],[680,50],[802,56],[880,82],[860,122],[760,136],[660,128],[590,108]] },
  { id: "as", cx: 752, cy: 200, size: 70, pts: [[650,140],[762,138],[844,166],[860,216],[800,260],[716,246],[666,200]] },
  { id: "oc", cx: 882, cy: 372, size: 48, pts: [[826,330],[896,322],[942,356],[922,402],[860,420],[826,378]] },
];
const GEO_INDEX = Object.fromEntries(REGION_GEO.map((g) => [g.id, g]));
const SLOT_OFFSETS = [[-0.55,-0.2],[-0.05,-0.4],[0.45,-0.25],[-0.6,0.18],[-0.12,0.08],[0.32,0.05],[0.6,0.32],[-0.32,0.42],[0.16,0.45],[0.5,0.5]];
const SLOTS = Object.fromEntries(REGION_GEO.map((g) => [g.id,
  SLOT_OFFSETS.map(([ox, oy]) => [g.cx + ox * g.size, g.cy + oy * g.size])]));

/* normalized distance between regions (for HQ loyalty falloff) */
const DIST = (() => {
  const d = {}; let max = 0;
  for (const a of REGION_GEO) { d[a.id] = {};
    for (const b of REGION_GEO) { const v = Math.hypot(a.cx - b.cx, a.cy - b.cy); d[a.id][b.id] = v; if (v > max) max = v; } }
  for (const a in d) for (const b in d[a]) d[a][b] /= max;
  return d;
})();

/* ---------------------------------------------------------------------------
   THE SKILL TREE  —  Earth / Water / Animals / Social
   fx keys: forest soil river ocean fish animals fresh carbon points loyalty volunteers
   (ecological keys scale by a region's loyalty; carbon/points/loyalty are flat)
--------------------------------------------------------------------------- */
const SECTIONS = [
  { id: "earth",   name: "Earth",   icon: "🌍", color: "#5bbf6a" },
  { id: "water",   name: "Water",   icon: "🌊", color: "#38b6e0" },
  { id: "animals", name: "Animals", icon: "🦌", color: "#e0a23b" },
  { id: "social",  name: "Social",  icon: "🤝", color: "#b886e8" },
];

const PROJECTS = [
  // EARTH ─ Woodland Protection
  { id: "e_wood1", sec: "earth", branch: "Woodland Protection", name: "Forest Reserves", cost: 40, req: [], fx: { forest: 0.18, animals: 0.05 } },
  { id: "e_wood2", sec: "earth", branch: "Woodland Protection", name: "Wildlife Corridors", cost: 90, req: ["e_wood1"], fx: { forest: 0.12, animals: 0.18 } },
  { id: "e_wood3", sec: "earth", branch: "Woodland Protection", name: "Old-Growth Sanctuaries", cost: 160, req: ["e_wood2"], fx: { forest: 0.28, animals: 0.1 } },
  // EARTH ─ Renewable Energy
  { id: "e_solar", sec: "earth", branch: "Renewable Energy", name: "Solar Arrays", cost: 50, req: [], visual: "solar", fx: { carbon: -0.5 } },
  { id: "e_wind",  sec: "earth", branch: "Renewable Energy", name: "Wind Farms", cost: 95, req: ["e_solar"], visual: "wind", fx: { carbon: -0.6 } },
  { id: "e_geo",   sec: "earth", branch: "Renewable Energy", name: "Geothermal Grid", cost: 150, req: ["e_wind"], fx: { carbon: -0.7 } },
  { id: "e_h2",    sec: "earth", branch: "Renewable Energy", name: "Hydrogen Economy", cost: 220, req: ["e_geo"], fx: { carbon: -0.9 } },
  // EARTH ─ Public Transit
  { id: "e_tram", sec: "earth", branch: "Public Transit", name: "Electric Streetcars", cost: 45, req: [], fx: { carbon: -0.3 } },
  { id: "e_rail", sec: "earth", branch: "Public Transit", name: "High-Speed Rail", cost: 100, req: ["e_tram"], fx: { carbon: -0.5 } },
  { id: "e_ev",   sec: "earth", branch: "Public Transit", name: "Autonomous EV Fleets", cost: 175, req: ["e_rail"], fx: { carbon: -0.7 } },
  // EARTH ─ Waste Sorting
  { id: "e_rec",  sec: "earth", branch: "Waste Sorting", name: "Recycling Mandate", cost: 40, req: [], fx: { soil: 0.3, ocean: 0.1 } },
  { id: "e_comp", sec: "earth", branch: "Waste Sorting", name: "Composting Programs", cost: 85, req: ["e_rec"], fx: { soil: 0.4 } },
  { id: "e_circ", sec: "earth", branch: "Waste Sorting", name: "Circular Economy", cost: 160, req: ["e_comp"], fx: { soil: 0.25, carbon: -0.25 } },
  // EARTH ─ Land Reclamation
  { id: "e_brown", sec: "earth", branch: "Land Reclamation", name: "Brownfield Cleanup", cost: 60, req: [], fx: { soil: 0.3, fresh: 0.2 } },
  { id: "e_oil",   sec: "earth", branch: "Land Reclamation", name: "Oil-Spill Remediation", cost: 120, req: ["e_brown"], fx: { soil: 0.25, river: 0.2, ocean: 0.1 } },
  { id: "e_bio",   sec: "earth", branch: "Land Reclamation", name: "Soil Bioremediation", cost: 185, req: ["e_oil"], fx: { soil: 0.5 } },

  // WATER ─ Floating Stations
  { id: "w_skim",   sec: "water", branch: "Floating Stations", name: "River Skimmers", cost: 45, req: [], fx: { river: 0.4 } },
  { id: "w_lagoon", sec: "water", branch: "Floating Stations", name: "Lagoon Filtration", cost: 95, req: ["w_skim"], fx: { river: 0.3, fresh: 0.3 } },
  { id: "w_buoy",   sec: "water", branch: "Floating Stations", name: "Smart Buoy Network", cost: 150, req: ["w_lagoon"], fx: { ocean: 0.3, river: 0.2 } },
  // WATER ─ Water Renewables
  { id: "w_tidal",  sec: "water", branch: "Water Renewables", name: "Tidal Generators", cost: 60, req: [], fx: { carbon: -0.4, ocean: 0.05 } },
  { id: "w_wave",   sec: "water", branch: "Water Renewables", name: "Wave Energy", cost: 110, req: ["w_tidal"], fx: { carbon: -0.55 } },
  { id: "w_offwind",sec: "water", branch: "Water Renewables", name: "Offshore Wind", cost: 175, req: ["w_wave"], visual: "wind", fx: { carbon: -0.7 } },
  // WATER ─ Reef Protection
  { id: "w_coral",  sec: "water", branch: "Reef Protection", name: "Coral Nurseries", cost: 55, req: [], visual: "reef", fx: { ocean: 0.35, fish: 0.2 } },
  { id: "w_sanct",  sec: "water", branch: "Reef Protection", name: "Marine Sanctuaries", cost: 110, req: ["w_coral"], fx: { ocean: 0.3, fish: 0.3 } },
  { id: "w_drone",  sec: "water", branch: "Reef Protection", name: "Reef Restoration Drones", cost: 185, req: ["w_sanct"], fx: { ocean: 0.5 } },
  // WATER ─ Freshwater Protection
  { id: "w_aq",    sec: "water", branch: "Freshwater Protection", name: "Aquifer Shielding", cost: 50, req: [], fx: { fresh: 0.4 } },
  { id: "w_water", sec: "water", branch: "Freshwater Protection", name: "Watershed Reforestation", cost: 100, req: ["w_aq"], fx: { fresh: 0.3, forest: 0.1 } },
  { id: "w_glac",  sec: "water", branch: "Freshwater Protection", name: "Glacier Monitoring", cost: 150, req: ["w_water"], fx: { fresh: 0.3 } },
  // WATER ─ Polar Research
  { id: "w_polar", sec: "water", branch: "Polar Research", name: "Polar Survey Stations", cost: 70, req: [], fx: { fish: 0.3 } },
  { id: "w_track", sec: "water", branch: "Polar Research", name: "Fish-Migration Tracking", cost: 130, req: ["w_polar"], fx: { fish: 0.4 } },
  { id: "w_trawl", sec: "water", branch: "Polar Research", name: "Ban Bottom Trawling", cost: 195, req: ["w_track"], fx: { fish: 0.6 } },
  // WATER ─ Shoreline Cleanup
  { id: "w_beach", sec: "water", branch: "Shoreline Cleanup", name: "Beach Cleanups", cost: 40, req: [], fx: { ocean: 0.2 } },
  { id: "w_boom",  sec: "water", branch: "Shoreline Cleanup", name: "Coastal Booms", cost: 90, req: ["w_beach"], fx: { ocean: 0.3, river: 0.1 } },
  { id: "w_array", sec: "water", branch: "Shoreline Cleanup", name: "Ocean Cleanup Array", cost: 200, req: ["w_boom"], fx: { ocean: 0.6 } },

  // ANIMALS
  { id: "a_patrol",  sec: "animals", branch: "Land Animals", name: "Anti-Poaching Patrols", cost: 50, req: [], fx: { animals: 0.4 } },
  { id: "a_habitat", sec: "animals", branch: "Land Animals", name: "Habitat Restoration", cost: 100, req: ["a_patrol"], fx: { animals: 0.3, forest: 0.1 } },
  { id: "a_wet",  sec: "animals", branch: "Reptile Protection", name: "Wetland Reserves", cost: 45, req: [], fx: { animals: 0.2, fresh: 0.1 } },
  { id: "a_fly",  sec: "animals", branch: "Bird Protection", name: "Migratory Flyways", cost: 45, req: [], fx: { animals: 0.2 } },
  { id: "a_poll", sec: "animals", branch: "Insect Protection", name: "Pollinator Corridors", cost: 45, req: [], fx: { animals: 0.15, forest: 0.05, soil: 0.1 } },
  { id: "a_hatch", sec: "animals", branch: "Fish Protection", name: "Hatchery Programs", cost: 50, req: [], fx: { fish: 0.4 } },
  { id: "a_mpa",   sec: "animals", branch: "Fish Protection", name: "Marine Protected Areas", cost: 100, req: ["a_hatch"], fx: { fish: 0.3, ocean: 0.1 } },

  // SOCIAL ─ Eco Economy (point income)
  { id: "s_bond",   sec: "social", branch: "Eco Economy", name: "Green Bonds", cost: 30, req: [], fx: { points: 2 } },
  { id: "s_credit", sec: "social", branch: "Eco Economy", name: "Carbon Credit Market", cost: 90, req: ["s_bond"], fx: { points: 3 } },
  { id: "s_tour",   sec: "social", branch: "Eco Economy", name: "Eco-Tourism", cost: 160, req: ["s_credit"], fx: { points: 4 } },
  // SOCIAL ─ Civic Loyalty
  { id: "s_aware",  sec: "social", branch: "Civic Loyalty", name: "Public Awareness", cost: 40, req: [], fx: { loyalty: 0.12 } },
  { id: "s_edu",    sec: "social", branch: "Civic Loyalty", name: "Education Programs", cost: 90, req: ["s_aware"], fx: { loyalty: 0.2 } },
  { id: "s_council",sec: "social", branch: "Civic Loyalty", name: "Community Councils", cost: 150, req: ["s_edu"], fx: { loyalty: 0.3 } },
  // SOCIAL ─ Volunteers (deployable units)
  { id: "s_vol1", sec: "social", branch: "Volunteers", name: "Volunteer Corps", cost: 60, req: [], fx: { volunteers: 2 } },
  { id: "s_vol2", sec: "social", branch: "Volunteers", name: "International Aid", cost: 120, req: ["s_vol1"], fx: { volunteers: 2, animals: 0.05 } },
];
const PROJECT_INDEX = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));
const LOYALTY_CAMPAIGN_COST = 25;

const aggregateEffects = (purchased) => {
  const e = { forest: 0, soil: 0, river: 0, ocean: 0, fish: 0, animals: 0, fresh: 0, carbon: 0, points: 0, loyalty: 0, volunteers: 0 };
  for (const id in purchased) {
    if (!purchased[id]) continue;
    const p = PROJECT_INDEX[id]; if (!p) continue;
    for (const k in p.fx) e[k] += p.fx[k];
  }
  return e;
};
const deriveVisuals = (purchased) => {
  const v = { solar: false, wind: false, reef: false };
  for (const id in purchased) { const p = purchased[id] && PROJECT_INDEX[id]; if (p && p.visual) v[p.visual] = true; }
  return v;
};

/* ---------------------------------------------------------------------------
   Ecological Balance — single win/lose meter
--------------------------------------------------------------------------- */
function computeBalance(regions, co2, temp) {
  const rs = Object.values(regions);
  const avg = (k) => mean(rs.map((r) => r[k]));
  const co2Score = clamp(((460 - co2) / (460 - 395)) * 100);
  const tempScore = clamp(((2.5 - temp) / (2.5 - 0.8)) * 100);
  return round(mean([avg("forest"), avg("soil"), avg("river"), avg("ocean"),
    avg("fish"), avg("animals"), avg("loyalty"), co2Score, tempScore]));
}

function makeInitialWorld() {
  const regions = {};
  for (const d of REGION_DEFS) {
    regions[d.id] = {
      id: d.id, loyalty: d.loyalty, carbon: d.carbon,
      forest: d.forest, soil: d.soil, river: d.river, ocean: d.ocean,
      fish: d.fish, animals: d.animals, freshwater: d.freshwater,
      ruleBreaking: d.loyalty < 40, volunteer: false,
    };
  }
  const co2 = 416;
  const temp = round(1.0 + (co2 - 415) * 0.07, 2);
  return {
    tick: 0, co2, temp, permafrost: false, permafrostCo2: 0,
    ecoPoints: 80, purchased: {}, hq: "na",
    balance: computeBalance(regions, co2, temp), bestBalance: 0, status: "playing",
    flags: {}, regions,
    events: [{ id: "seed", t: 0, kind: "info",
      msg: "🌍 Verdant Grid online — choose an HQ, earn Eco-Points, and commission projects to heal the planet." }],
  };
}

/* ---------------------------------------------------------------------------
   THE TICK ENGINE
--------------------------------------------------------------------------- */
function stepWorld(prev) {
  if (prev.status !== "playing") return prev;
  const events = []; let seq = 0;
  const addEvent = (msg, kind) => events.push({ id: `${prev.tick + 1}-${seq++}`, t: prev.tick + 1, msg, kind });
  const flags = { ...prev.flags };
  let { co2, temp, permafrost, permafrostCo2, hq } = prev;

  const eff = aggregateEffects(prev.purchased);
  let ecoPoints = prev.ecoPoints + BASE_POINT_RATE + eff.points;

  const regions = {}; let illegalCo2 = 0; const accCarbon = [], accForest = [];

  for (const id of Object.keys(prev.regions)) {
    const r = prev.regions[id];
    const def = REGION_INDEX[id];
    let { forest, soil, river, ocean, fish, animals, freshwater, carbon, loyalty } = r;

    /* loyalty: HQ-distance support + civic projects + volunteers */
    const distFactor = DIST[hq][id];
    const supportTarget = 72 - 42 * distFactor;
    loyalty += (supportTarget - loyalty) * 0.02 + eff.loyalty + (r.volunteer ? 0.25 : 0);
    loyalty = clamp(loyalty);
    const m = loyalty / 100; // LOYALTY MULTIPLIER

    /* baseline planetary pressure (the system fights back) */
    carbon     = clamp(carbon + 0.1, 10, 100);
    soil       = clamp(soil - 0.08);
    forest     = clamp(forest - (def.poaching ? 0.35 : 0.13));
    animals    = clamp(animals - (def.poaching ? 0.32 : 0.09));
    river      = clamp(river - carbon * 0.003 - (def.runoff ? 0.1 : 0));
    ocean      = clamp(ocean - 0.05 - (def.marine ? 0.04 : 0));
    fish       = clamp(fish - 0.14);
    freshwater = clamp(freshwater - 0.05);

    /* global tech effects — restoration scaled by loyalty, carbon flat */
    forest     = clamp(forest + eff.forest * m + (r.volunteer ? 0.12 : 0));
    soil       = clamp(soil + eff.soil * m);
    river      = clamp(river + eff.river * m);
    ocean      = clamp(ocean + eff.ocean * m);
    fish       = clamp(fish + eff.fish * m);
    animals    = clamp(animals + eff.animals * m + (r.volunteer ? 0.12 : 0));
    freshwater = clamp(freshwater + eff.fresh * m);
    carbon     = clamp(carbon + eff.carbon, 10, 100);

    /* TIPPING POINT: Rule Breaking */
    let ruleBreaking = false;
    if (loyalty < 40) {
      ruleBreaking = true;
      const sev = (40 - loyalty) / 40;
      forest = clamp(forest - 0.8 - 1.2 * sev);
      animals = clamp(animals - 0.9 - 1.3 * sev);
      river = clamp(river - 0.5); ocean = clamp(ocean - 0.4);
      carbon = clamp(carbon + 0.5, 10, 100);
      illegalCo2 += 0.15 + 0.4 * sev;
    }
    if (permafrost && def.perm) { carbon = clamp(carbon + 0.3, 10, 100); forest = clamp(forest - 0.25); illegalCo2 += 0.1; }

    if (ruleBreaking && !r.ruleBreaking) addEvent(`⛔ ${def.name}: loyalty collapsed below 40% — illegal logging, poaching & dumping surging.`, "crisis");
    if (!ruleBreaking && r.ruleBreaking) addEvent(`✅ ${def.name}: civic order restored.`, "good");

    accCarbon.push(carbon); accForest.push(forest);
    regions[id] = { ...r, loyalty: round(loyalty), carbon: round(carbon),
      forest: round(forest), soil: round(soil), river: round(river), ocean: round(ocean),
      fish: round(fish), animals: round(animals), freshwater: round(freshwater), ruleBreaking };
  }

  /* global atmosphere */
  const avgCarbon = mean(accCarbon), avgForest = mean(accForest);
  co2 = Math.max(380, co2 + ((avgCarbon - 55) * 0.02 - (avgForest - 50) * 0.016) * 1.5 + illegalCo2 * 0.4 + permafrostCo2);
  temp = temp + ((1.0 + (co2 - 415) * 0.07) - temp) * 0.08;

  if (!permafrost && temp > 1.5) { permafrost = true; permafrostCo2 = 0.06;
    addEvent("🌡️ TIPPING POINT: +1.5 °C breached — permafrost thaw triggered. Baseline CO₂ now rising irreversibly.", "crisis"); }
  if (permafrost) permafrostCo2 = Math.min(0.18, permafrostCo2 + 0.0008);

  const rs = Object.values(regions); const gAvg = (k) => mean(rs.map((x) => x[k]));
  const fire = (key, cond, reset, msg, kind) => {
    if (cond && !flags[key]) { flags[key] = true; addEvent(msg, kind); } else if (reset && flags[key]) flags[key] = false;
  };
  fire("co2hi", co2 >= 435, co2 < 425, "🏭 Global CO₂ surpassed 435 ppm — atmospheric load critical.", "warn");
  fire("fishcrash", gAvg("fish") < 25, gAvg("fish") > 40, "🐟 Global fishery collapse — fish below 25%.", "crisis");
  fire("ocCrash", regions.oc.ocean < 40, regions.oc.ocean > 55, "🌊 Oceania marine system in crisis.", "crisis");
  fire("forestGood", gAvg("forest") > 82, gAvg("forest") < 75, "🌳 Global forest cover above 82% — flourishing.", "good");

  const balance = computeBalance(regions, co2, temp);
  const bestBalance = Math.max(prev.bestBalance, balance);
  let status = "playing";
  if (balance >= 100) { status = "won"; addEvent("🏆 VICTORY — Ecological Balance reached 100%. The planet is fully restored.", "good"); }
  else if (balance <= 0) { status = "lost"; addEvent("☠️ COLLAPSE — Ecological Balance hit 0%.", "crisis"); }

  return { tick: prev.tick + 1, co2: round(co2, 1), temp: round(temp, 2), permafrost, permafrostCo2,
    ecoPoints: round(ecoPoints, 0), purchased: prev.purchased, hq,
    balance, bestBalance, status, flags, regions, events: [...events, ...prev.events].slice(0, 60) };
}

/* ---------------------------------------------------------------------------
   Persistence + derived helpers
--------------------------------------------------------------------------- */
function deriveGlobals(world) {
  const rs = Object.values(world.regions);
  const avg = (k) => round(mean(rs.map((r) => r[k])));
  return { co2: world.co2, temp: world.temp, forest: avg("forest"), soil: avg("soil"),
    river: avg("river"), ocean: avg("ocean"), fish: avg("fish"), animals: avg("animals"), loyalty: avg("loyalty") };
}
function loadWorld() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const p = JSON.parse(raw);
    if (p && p.regions && typeof p.tick === "number" && p.status && p.purchased) return p; } } catch {}
  return makeInitialWorld();
}

const hexToRgb = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lerpColor = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); t = clamp(t, 0, 1);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`; };
const goodColor = (p) => (p >= 66 ? "#34d399" : p >= 40 ? "#fbbf24" : "#f87171");
const badColor  = (p) => (p >= 66 ? "#f87171" : p >= 40 ? "#fbbf24" : "#34d399");
const balanceColor = (b) => (b >= 70 ? "#34d399" : b >= 40 ? "#fbbf24" : "#f87171");

/* ---------------------------------------------------------------------------
   WORLD MAP (the living globe view)
--------------------------------------------------------------------------- */
function WorldMap({ world, globals, selected, onSelect }) {
  const visuals = useMemo(() => deriveVisuals(world.purchased), [world.purchased]);
  const water = (globals.ocean + globals.river) / 2;
  const oceanColor = lerpColor("#3f7d57", "#1f74a8", (water - 25) / 55); // green→blue
  const garbageOpacity = clamp((100 - globals.ocean) / 100, 0, 1) * 0.5;
  const garbage = [[300,160,26],[420,205,22],[640,150,24],[650,345,28],[175,365,26],[785,255,22]];

  return (
    <svg viewBox="0 0 1000 460" style={{ width: "100%", height: "auto", display: "block",
      borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: oceanColor, transition: "background .8s" }}>
      <defs>
        <radialGradient id="vgGlow" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="1000" height="460" fill="url(#vgGlow)" />

      {/* garbage patches — fade as oceans clean */}
      {garbage.map(([x, y, r], i) => (
        <g key={i} opacity={garbageOpacity} style={{ transition: "opacity .8s" }}>
          <ellipse cx={x} cy={y} rx={r} ry={r * 0.6} fill="#6e5a36" />
          <ellipse cx={x + r * 0.4} cy={y + 4} rx={r * 0.5} ry={r * 0.32} fill="#5a4a2c" />
        </g>
      ))}

      {REGION_GEO.map((geo) => {
        const r = world.regions[geo.id];
        const def = REGION_INDEX[geo.id];
        const land = lerpColor("#8a7350", "#2f7a3f", r.forest / 100); // brown→green
        const isSel = selected === geo.id;
        const isHQ = world.hq === geo.id;
        const slots = SLOTS[geo.id];
        const nTrees = Math.round((r.forest / 100) * slots.length);
        const treeSize = 9 + r.forest * 0.06;
        return (
          <g key={geo.id} onClick={() => onSelect(geo.id)} style={{ cursor: "pointer" }}>
            <path d={poly(geo.pts)} fill={land}
              stroke={isSel ? "#ffffff" : isHQ ? "#facc15" : r.ruleBreaking ? "#f87171" : "rgba(0,0,0,0.25)"}
              strokeWidth={isSel ? 3 : isHQ ? 2.5 : 1.2} style={{ transition: "fill .8s" }} />

            {/* trees */}
            {slots.slice(0, nTrees).map(([x, y], i) => (
              <text key={"t" + i} x={x} y={y} fontSize={treeSize} textAnchor="middle" style={{ pointerEvents: "none" }}>🌲</text>
            ))}
            {/* solar panels */}
            {visuals.solar && (
              <g style={{ pointerEvents: "none" }}>
                {[slots[1], slots[5]].map(([x, y], i) => (
                  <rect key={"s" + i} x={x - 6} y={y - 4} width="12" height="8" rx="1"
                    fill="#2563eb" stroke="#93c5fd" strokeWidth="0.7" transform={`rotate(-18 ${x} ${y})`} />
                ))}
              </g>
            )}
            {/* wind turbines */}
            {visuals.wind && (
              <g stroke="#e5e7eb" strokeWidth="1.1" style={{ pointerEvents: "none" }}>
                {[slots[2], slots[8]].map(([x, y], i) => (
                  <g key={"w" + i}>
                    <line x1={x} y1={y} x2={x} y2={y - 13} />
                    <line x1={x} y1={y - 13} x2={x - 6} y2={y - 17} />
                    <line x1={x} y1={y - 13} x2={x + 6} y2={y - 17} />
                    <line x1={x} y1={y - 13} x2={x} y2={y - 6} />
                  </g>
                ))}
              </g>
            )}
            {/* reef marker (coastal) */}
            {visuals.reef && <text x={geo.cx + geo.size * 0.7} y={geo.cy + geo.size * 0.6} fontSize="13" style={{ pointerEvents: "none" }}>🪸</text>}

            {/* HQ + label */}
            {isHQ && <text x={geo.cx} y={geo.cy - geo.size * 0.55} fontSize="16" textAnchor="middle" style={{ pointerEvents: "none" }}>⭐</text>}
            <text x={geo.cx} y={geo.cy} fontSize="15" textAnchor="middle" style={{ pointerEvents: "none" }}>{def.flag}</text>
            <text x={geo.cx} y={geo.cy + geo.size * 0.55 + 4} fontSize="9.5" textAnchor="middle"
              fill="#f1f5f9" style={{ pointerEvents: "none", fontWeight: 600 }}>
              {def.name} · {r.loyalty}%
            </text>
            {r.volunteer && <text x={geo.cx - geo.size * 0.6} y={geo.cy + 4} fontSize="12" style={{ pointerEvents: "none" }}>🤝</text>}
            {r.ruleBreaking && <text x={geo.cx + geo.size * 0.5} y={geo.cy - 6} fontSize="12" style={{ pointerEvents: "none" }}>⚠️</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Small UI pieces
--------------------------------------------------------------------------- */
function Bar({ value, color, height = 8 }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 6, height, overflow: "hidden" }}>
      <div style={{ width: `${clamp(value)}%`, height: "100%", background: color, borderRadius: 6, transition: "width .6s, background .6s" }} />
    </div>
  );
}
function MetricCard({ label, value, unit, pct, color, sub }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", color: "#8aa0b4", marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 7 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
        <span style={{ fontSize: 11, color: "#8aa0b4" }}>{unit}</span>
      </div>
      <Bar value={pct} color={color} />
      {sub && <div style={{ fontSize: 9.5, color: "#6b7f93", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}
const fxLabel = (fx) => {
  const map = { forest: "🌲Forest", soil: "🟫Soil", river: "🏞️River", ocean: "🌊Ocean", fish: "🐟Fish",
    animals: "🦌Animals", fresh: "💧Fresh", carbon: "🏭CO₂", points: "✦Points", loyalty: "❤Loyalty", volunteers: "🤝Volunteers" };
  return Object.entries(fx).map(([k, v]) => `${map[k] || k} ${v > 0 ? "+" : ""}${v}`).join("  ");
};

/* ---------------------------------------------------------------------------
   PROJECTS MODAL (the skill tree)
--------------------------------------------------------------------------- */
function ProjectsModal({ world, onClose, onBuy }) {
  const [tab, setTab] = useState("earth");
  const owned = world.purchased;
  const branches = useMemo(() => {
    const list = PROJECTS.filter((p) => p.sec === tab);
    const by = {};
    for (const p of list) (by[p.branch] = by[p.branch] || []).push(p);
    return by;
  }, [tab]);

  const nodeState = (p) => {
    if (owned[p.id]) return "owned";
    if (!p.req.every((r) => owned[r])) return "locked";
    if (world.ecoPoints < p.cost) return "poor";
    return "buy";
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,8,12,0.78)", zIndex: 40,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#0e1722", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 16, width: "min(960px, 100%)", maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>🔬 Eco-Projects</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#86efac" }}>✦ {world.ecoPoints} pts</span>
            <button onClick={onClose} style={btn("#475569")}>✕ Close</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 18px 0" }}>
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setTab(s.id)} style={{ cursor: "pointer", flex: 1,
              background: tab === s.id ? s.color : "rgba(255,255,255,0.05)", color: tab === s.id ? "#0a1018" : "#cbd5e1",
              border: "none", borderRadius: 10, padding: "9px 6px", fontSize: 13, fontWeight: 700 }}>
              {s.icon} {s.name}
            </button>
          ))}
        </div>

        <div style={{ overflowY: "auto", padding: 18 }}>
          {Object.entries(branches).map(([branch, nodes]) => (
            <div key={branch} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "#8aa0b4", marginBottom: 8 }}>{branch}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {nodes.map((p) => {
                  const st = nodeState(p);
                  const border = st === "owned" ? "#34d399" : st === "buy" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)";
                  return (
                    <div key={p.id} style={{ flex: "1 1 220px", minWidth: 200, background: "rgba(255,255,255,0.03)",
                      border: `1px solid ${border}`, borderRadius: 10, padding: 11, opacity: st === "locked" ? 0.55 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                        <span style={{ fontSize: 12, color: "#86efac", fontWeight: 700, whiteSpace: "nowrap" }}>✦ {p.cost}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: "#8aa0b4", margin: "6px 0 9px" }}>{fxLabel(p.fx)}</div>
                      {st === "owned" && <div style={{ fontSize: 11, fontWeight: 700, color: "#34d399" }}>✓ Commissioned</div>}
                      {st === "locked" && <div style={{ fontSize: 11, color: "#94a3b8" }}>🔒 Requires {p.req.map((r) => PROJECT_INDEX[r].name).join(", ")}</div>}
                      {st === "poor" && <button disabled style={{ ...btn("#374151"), cursor: "not-allowed", width: "100%" }}>Need ✦ {p.cost}</button>}
                      {st === "buy" && <button onClick={() => onBuy(p.id)} style={{ ...btn("#34d399"), width: "100%" }}>Commission</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Endgame overlay
--------------------------------------------------------------------------- */
function EndgameOverlay({ world, onNewGame }) {
  if (world.status === "playing") return null;
  const won = world.status === "won";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,8,12,0.85)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}>
      <div style={{ background: "#0e1722", border: `2px solid ${won ? "#34d399" : "#f87171"}`, borderRadius: 18,
        padding: "30px 34px", maxWidth: 460, textAlign: "center" }}>
        <div style={{ fontSize: 52 }}>{won ? "🏆" : "☠️"}</div>
        <h2 style={{ margin: "4px 0 6px", fontSize: 26, color: won ? "#34d399" : "#f87171" }}>{won ? "PLANET RESTORED" : "BIOSPHERE COLLAPSE"}</h2>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "#aebccb", lineHeight: 1.5 }}>
          {won ? "You drove global Ecological Balance to 100%. Every biome thrives and loyalty holds across all seven sectors."
               : "Ecological Balance fell to 0%. Cascading tipping points overwhelmed the grid."}
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 20 }}>
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(world.balance)}%</div><div style={st.k}>Final</div></div>
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(world.bestBalance)}%</div><div style={st.k}>Peak</div></div>
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{world.tick}</div><div style={st.k}>Cycles</div></div>
        </div>
        <button onClick={onNewGame} style={{ ...btn(won ? "#34d399" : "#f87171"), fontSize: 14, padding: "10px 22px" }}>↻ New Game</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   MAIN
--------------------------------------------------------------------------- */
export default function VerdantGrid() {
  const [world, setWorld] = useState(loadWorld);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState("na");
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [bestEver, setBestEver] = useState(() => { try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch { return 0; } });

  useEffect(() => {
    if (!running || world.status !== "playing") return;
    const iv = setInterval(() => setWorld((w) => stepWorld(w)), 1000 / speed);
    return () => clearInterval(iv);
  }, [running, speed, world.status]);

  useEffect(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(world)); } catch {} }, [world]);
  useEffect(() => { if (world.balance > bestEver) { setBestEver(world.balance);
    try { localStorage.setItem(BEST_KEY, String(world.balance)); } catch {} } }, [world.balance, bestEver]);

  const buyProject = useCallback((id) => setWorld((w) => {
    if (w.status !== "playing") return w;
    const p = PROJECT_INDEX[id];
    if (!p || w.purchased[id] || w.ecoPoints < p.cost || !p.req.every((r) => w.purchased[r])) return w;
    return { ...w, ecoPoints: w.ecoPoints - p.cost, purchased: { ...w.purchased, [id]: true },
      events: [{ id: `buy-${w.tick}-${id}`, t: w.tick, kind: "good", msg: `🔬 ${p.name} commissioned — now active across all sectors.` }, ...w.events].slice(0, 60) };
  }), []);

  const setHQ = useCallback((id) => setWorld((w) => (w.status !== "playing" ? w : { ...w, hq: id,
    events: [{ id: `hq-${w.tick}-${id}`, t: w.tick, kind: "info", msg: `🏛️ Headquarters relocated to ${REGION_INDEX[id].name}.` }, ...w.events].slice(0, 60) })), []);

  const loyaltyCampaign = useCallback((id) => setWorld((w) => {
    if (w.status !== "playing" || w.ecoPoints < LOYALTY_CAMPAIGN_COST) return w;
    const r = w.regions[id];
    return { ...w, ecoPoints: w.ecoPoints - LOYALTY_CAMPAIGN_COST,
      regions: { ...w.regions, [id]: { ...r, loyalty: clamp(r.loyalty + 15) } },
      events: [{ id: `camp-${w.tick}-${id}`, t: w.tick, kind: "good", msg: `📣 Loyalty campaign in ${REGION_INDEX[id].name} (+15%).` }, ...w.events].slice(0, 60) };
  }), []);

  const toggleVolunteer = useCallback((id) => setWorld((w) => {
    if (w.status !== "playing") return w;
    const r = w.regions[id];
    const slots = aggregateEffects(w.purchased).volunteers;
    const used = Object.values(w.regions).filter((x) => x.volunteer).length;
    if (!r.volunteer && used >= slots) return w;
    return { ...w, regions: { ...w.regions, [id]: { ...r, volunteer: !r.volunteer } } };
  }), []);

  const newGame = useCallback(() => { const w = makeInitialWorld(); setWorld(w); setRunning(true); setSpeed(1);
    setSelected("na"); setProjectsOpen(false); try { localStorage.removeItem(SAVE_KEY); } catch {} }, []);

  const g = useMemo(() => deriveGlobals(world), [world]);
  const region = world.regions[selected];
  const def = REGION_INDEX[selected];
  const volSlots = useMemo(() => aggregateEffects(world.purchased).volunteers, [world.purchased]);
  const volUsed = useMemo(() => Object.values(world.regions).filter((x) => x.volunteer).length, [world.regions]);
  const kindColor = { crisis: "#f87171", warn: "#fbbf24", good: "#34d399", info: "#7dd3fc" };
  const year = 2025 + Math.floor(world.tick / 12);

  const regionMetrics = [
    ["Forest", region.forest], ["Soil", region.soil], ["River", region.river], ["Ocean", region.ocean],
    ["Fish", region.fish], ["Animals", region.animals], ["Freshwater", region.freshwater], ["Carbon", region.carbon],
  ];

  return (
    <div style={{ minHeight: "100vh", padding: 18, boxSizing: "border-box" }}>
      <style>{`
        @keyframes vgMarquee { from { transform: translateX(0);} to { transform: translateX(-50%);} }
        @keyframes vgPulse { 0%,100%{opacity:1;} 50%{opacity:.45;} }
        .vg-pulse{ animation: vgPulse 1.1s infinite; }
        .vg-marquee:hover .vg-track { animation-play-state: paused; }
      `}</style>

      <EndgameOverlay world={world} onNewGame={newGame} />
      {projectsOpen && <ProjectsModal world={world} onClose={() => setProjectsOpen(false)} onBuy={buyProject} />}

      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* HEADER */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 21 }}>🌱 Verdant Grid <span style={{ color: "#34d399" }}>Restoration</span></h1>
            <div style={{ fontSize: 11.5, color: "#8aa0b4", marginTop: 2 }}>
              Cycle {world.tick} · {year} · HQ {REGION_INDEX[world.hq].flag} {REGION_INDEX[world.hq].name} · Best {Math.round(bestEver)}%
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#86efac" }}>✦ {world.ecoPoints}</span>
            <button onClick={() => setProjectsOpen(true)} style={btn("#5bbf6a")}>🔬 Projects</button>
            {world.permafrost && <span className="vg-pulse" style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#7c2d12", border: "1px solid #f97316", padding: "4px 9px", borderRadius: 20 }}>❄️ THAW</span>}
            <button onClick={() => setRunning((r) => !r)} style={btn(running ? "#fbbf24" : "#34d399")}>{running ? "⏸" : "▶"}</button>
            {[1, 2, 4].map((s) => <button key={s} onClick={() => setSpeed(s)} style={btn(speed === s ? "#34d399" : "#2a3744")}>{s}×</button>)}
            <button onClick={newGame} style={btn("#475569")}>↻ New</button>
          </div>
        </div>

        {/* BALANCE METER */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${balanceColor(world.balance)}55`, borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
            <span style={{ fontSize: 11.5, letterSpacing: 1, textTransform: "uppercase", color: "#8aa0b4" }}>Global Ecological Balance</span>
            <span style={{ fontSize: 12, color: "#6b7f93" }}>Win 100% · Lose 0%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 32, fontWeight: 800, color: balanceColor(world.balance), minWidth: 74 }}>{Math.round(world.balance)}%</span>
            <div style={{ flex: 1 }}><Bar value={world.balance} color={balanceColor(world.balance)} height={14} /></div>
          </div>
        </div>

        {/* MAP + SELECTED CONTINENT */}
        <div style={{ display: "grid", gap: 14, marginBottom: 14, gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)" }}>
          <div>
            <WorldMap world={world} globals={g} selected={selected} onSelect={setSelected} />
            <div style={{ fontSize: 10.5, color: "#6b7f93", marginTop: 6, textAlign: "center" }}>
              Click a continent to manage it · 🌲 forest grows · water turns blue as you clean it · garbage fades · ⭐ = HQ
            </div>
          </div>

          <div style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{def.flag} {def.name}</h2>
              <span style={{ fontSize: 15, fontWeight: 700, color: goodColor(region.loyalty) }}>{region.loyalty}% loyalty</span>
            </div>
            {region.ruleBreaking && (
              <div className="vg-pulse" style={{ background: "rgba(220,38,38,0.15)", border: "1px solid #dc2626", borderRadius: 9, padding: "8px 10px", fontSize: 11.5, marginBottom: 10, color: "#fecaca" }}>
                ⛔ Rule-Breaking — illegal activity is surging here. Run a loyalty campaign, station volunteers, or move HQ closer.
              </div>
            )}
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
              {regionMetrics.map(([label, val]) => (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#8aa0b4", marginBottom: 3 }}>
                    <span>{label}</span><span>{val}%</span>
                  </div>
                  <Bar value={val} color={label === "Carbon" ? badColor(val) : goodColor(val)} height={6} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button onClick={() => setHQ(selected)} disabled={world.hq === selected}
                style={{ ...btn(world.hq === selected ? "#374151" : "#facc15"), cursor: world.hq === selected ? "default" : "pointer" }}>
                {world.hq === selected ? "⭐ HQ here" : "🏛️ Set HQ"}
              </button>
              <button onClick={() => loyaltyCampaign(selected)} disabled={world.ecoPoints < LOYALTY_CAMPAIGN_COST}
                style={{ ...btn(world.ecoPoints < LOYALTY_CAMPAIGN_COST ? "#374151" : "#60a5fa"), cursor: world.ecoPoints < LOYALTY_CAMPAIGN_COST ? "not-allowed" : "pointer" }}>
                📣 Campaign ✦{LOYALTY_CAMPAIGN_COST}
              </button>
              <button onClick={() => toggleVolunteer(selected)} disabled={!region.volunteer && volUsed >= volSlots}
                style={{ ...btn(region.volunteer ? "#34d399" : volUsed >= volSlots ? "#374151" : "#a78bfa"), cursor: !region.volunteer && volUsed >= volSlots ? "not-allowed" : "pointer" }}>
                🤝 {region.volunteer ? "Recall" : "Station"} ({volUsed}/{volSlots})
              </button>
            </div>
            <div style={{ fontSize: 10, color: "#6b7f93", marginTop: 8 }}>
              Loyalty support is strongest at HQ and weakens with distance. Volunteers boost biodiversity & loyalty where stationed.
            </div>
          </div>
        </div>

        {/* GLOBAL DASHBOARD */}
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#6b7f93", marginBottom: 8 }}>Global Biosphere Dashboard</div>
        <div style={{ display: "grid", gap: 9, marginBottom: 16, gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))" }}>
          <MetricCard label="CO₂" value={g.co2} unit="ppm" pct={clamp(((g.co2 - 380) / 80) * 100)} color={badColor(((g.co2 - 380) / 80) * 100)} sub={world.permafrost ? "thaw rising" : "atmosphere"} />
          <MetricCard label="Temp Δ" value={`+${g.temp}`} unit="°C" pct={clamp(((g.temp - 0.5) / 2.5) * 100)} color={badColor(((g.temp - 0.5) / 2.5) * 100)} sub={g.temp > 1.5 ? "tipping breached" : "< +1.5 °C"} />
          <MetricCard label="Forest" value={g.forest} unit="%" pct={g.forest} color={goodColor(g.forest)} />
          <MetricCard label="Soil" value={g.soil} unit="%" pct={g.soil} color={goodColor(g.soil)} />
          <MetricCard label="River" value={g.river} unit="%" pct={g.river} color={goodColor(g.river)} />
          <MetricCard label="Ocean" value={g.ocean} unit="%" pct={g.ocean} color={goodColor(g.ocean)} />
          <MetricCard label="Fish" value={g.fish} unit="%" pct={g.fish} color={goodColor(g.fish)} />
          <MetricCard label="Animals" value={g.animals} unit="%" pct={g.animals} color={goodColor(g.animals)} />
        </div>

        {/* TICKER */}
        <div className="vg-marquee" style={{ overflow: "hidden", whiteSpace: "nowrap", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 0", marginBottom: 12 }}>
          <div className="vg-track" style={{ display: "inline-block", animation: "vgMarquee 38s linear infinite" }}>
            {[0, 1].map((dup) => (
              <span key={dup}>{world.events.slice(0, 16).map((e) => (
                <span key={dup + e.id} style={{ marginRight: 36, fontSize: 12.5, color: kindColor[e.kind] || "#cbd5e1" }}>
                  <span style={{ color: "#52647a" }}>[{e.t}]</span> {e.msg}
                </span>))}</span>
            ))}
          </div>
        </div>

        {/* LOG */}
        <div style={{ ...panel, maxHeight: 170, overflowY: "auto", padding: 0 }}>
          {world.events.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 10, padding: "6px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
              <span style={{ color: "#52647a", minWidth: 40 }}>#{e.t}</span>
              <span style={{ color: kindColor[e.kind] || "#cbd5e1" }}>{e.msg}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 11, color: "#52647a", marginTop: 14 }}>Verdant Grid: Restoration · auto-saved to this browser</div>
      </div>
    </div>
  );
}

const btn = (c) => ({ cursor: "pointer", background: c, color: "#0a1018", border: "none", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 700 });
const panel = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14 };
const st = { k: { fontSize: 10, color: "#8aa0b4", textTransform: "uppercase", letterSpacing: 0.5 } };
