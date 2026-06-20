import React, { useState, useEffect, useMemo, useCallback } from "react";

/* ============================================================================
   VERDANT GRID: RESTORATION  —  v3  "Living Earth"
   Hyper-stylized animated world map · ~90-project skill tree ·
   HQ + loyalty-by-distance · all indicators 0-100% · win 100% / lose 0%.
============================================================================ */

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 1) => { const f = 10 ** d; return Math.round(v * f) / f; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const SAVE_KEY = "verdant-grid-save-v3";
const BEST_KEY = "verdant-grid-best-v3";
const BASE_POINT_RATE = 2.5;          // harder economy
const LOYALTY_CAMPAIGN_COST = 28;

/* ---------------------------------------------------------------------------
   Region archetypes
--------------------------------------------------------------------------- */
const REGION_DEFS = [
  { id: "na", name: "North America", flag: "🦅", loyalty: 62, carbon: 88, forest: 55, soil: 60, river: 58, ocean: 62, fish: 60, animals: 58, freshwater: 66 },
  { id: "eu", name: "Europe", flag: "🏰", loyalty: 66, carbon: 80, forest: 50, soil: 64, river: 62, ocean: 60, fish: 58, animals: 54, freshwater: 68 },
  { id: "ru", name: "Russia", flag: "🐻", perm: true, runoff: true, loyalty: 55, carbon: 72, forest: 78, soil: 55, river: 48, ocean: 54, fish: 52, animals: 66, freshwater: 60 },
  { id: "as", name: "Asia", flag: "🏯", loyalty: 58, carbon: 96, forest: 42, soil: 48, river: 36, ocean: 50, fish: 54, animals: 46, freshwater: 42 },
  { id: "sa", name: "South America", flag: "🦜", poaching: true, loyalty: 48, carbon: 50, forest: 92, soil: 70, river: 66, ocean: 58, fish: 60, animals: 95, freshwater: 72 },
  { id: "af", name: "Africa", flag: "🦁", poaching: true, loyalty: 44, carbon: 46, forest: 85, soil: 58, river: 54, ocean: 56, fish: 58, animals: 93, freshwater: 50 },
  { id: "oc", name: "Oceania", flag: "🐠", marine: true, loyalty: 60, carbon: 44, forest: 60, soil: 56, river: 60, ocean: 90, fish: 88, animals: 64, freshwater: 62 },
];
const REGION_INDEX = Object.fromEntries(REGION_DEFS.map((r) => [r.id, r]));

/* ---------------------------------------------------------------------------
   Geography — real-ish lat/lon coastlines projected to an equirectangular map
--------------------------------------------------------------------------- */
const MW = 1000, MH = 500;
const project = (lon, lat) => [(lon + 180) / 360 * MW, (90 - lat) / 180 * MH];
const toPath = (pts) => "M" + pts.map((p) => `${round(p[0], 1)} ${round(p[1], 1)}`).join(" L ") + " Z";

const OUTLINES = {
  na: [[-166,66],[-156,71],[-130,71],[-100,70],[-82,73],[-78,62],[-64,60],[-55,52],[-60,47],[-70,42],[-76,35],[-81,30],[-80,25],[-90,29],[-95,25],[-97,18],[-90,16],[-83,9],[-80,8],[-87,14],[-96,16],[-106,23],[-114,28],[-122,37],[-124,48],[-135,57],[-150,60]],
  sa: [[-77,8],[-72,11],[-60,10],[-50,5],[-44,-2],[-35,-5],[-39,-13],[-43,-23],[-48,-28],[-54,-34],[-58,-39],[-63,-41],[-65,-45],[-69,-52],[-66,-55],[-72,-52],[-73,-44],[-73,-37],[-71,-30],[-71,-18],[-77,-12],[-81,-5],[-80,2],[-78,5]],
  eu: [[-9,43],[-9,39],[-6,36],[-1,37],[3,42],[7,44],[12,45],[14,41],[18,42],[24,40],[28,41],[34,46],[40,48],[40,55],[30,60],[24,57],[22,60],[24,66],[20,70],[12,66],[5,62],[8,58],[8,54],[3,52],[-1,49],[-4,48]],
  af: [[-13,28],[-6,36],[10,37],[20,32],[26,32],[32,31],[37,22],[43,12],[51,12],[48,4],[41,-2],[40,-10],[35,-18],[33,-26],[27,-34],[18,-35],[14,-26],[12,-16],[9,-2],[5,4],[-2,5],[-9,5],[-15,12],[-17,21]],
  ru: [[42,60],[40,68],[55,70],[68,73],[80,73],[100,76],[115,74],[135,73],[160,70],[180,68],[178,66],[165,62],[160,56],[155,52],[140,48],[132,43],[130,50],[120,53],[108,52],[95,50],[80,51],[68,53],[58,52],[50,50],[48,55],[44,57]],
  as: [[42,40],[36,36],[35,30],[40,25],[43,15],[48,13],[52,16],[57,23],[62,25],[67,25],[72,21],[73,16],[77,8],[80,13],[84,18],[89,21],[92,17],[97,16],[99,9],[101,3],[104,9],[107,11],[109,18],[112,21],[117,23],[121,29],[122,33],[121,37],[126,40],[131,43],[120,45],[105,44],[90,45],[75,43],[60,42],[50,41],[45,40]],
  oc: [[131,-12],[136,-12],[141,-11],[143,-14],[146,-18],[149,-21],[153,-26],[153,-30],[151,-34],[148,-38],[143,-39],[139,-36],[135,-35],[129,-32],[124,-34],[118,-35],[114,-34],[114,-26],[117,-21],[122,-18],[127,-14]],
};
const REGION_PROJ = Object.fromEntries(Object.entries(OUTLINES).map(([id, o]) => [id, o.map(([lo, la]) => project(lo, la))]));
const REGION_PATHS = Object.fromEntries(Object.entries(REGION_PROJ).map(([id, p]) => [id, toPath(p)]));
const CENTROIDS = Object.fromEntries(Object.entries(REGION_PROJ).map(([id, p]) => [id, [mean(p.map((q) => q[0])), mean(p.map((q) => q[1]))]]));

const ISLAND_OUTLINES = [
  [[-45,60],[-50,64],[-50,70],[-40,73],[-25,70],[-20,66],[-32,60]],     // Greenland
  [[-5,50],[-3,53],[-5,57],[-2,58],[0,53],[1,51]],                       // Britain
  [[130,31],[135,34],[140,38],[142,43],[140,40],[137,36],[132,31]],      // Japan
  [[44,-16],[50,-15],[50,-22],[46,-25],[44,-20]],                        // Madagascar
  [[167,-46],[170,-44],[174,-41],[178,-38],[176,-41],[172,-45]],         // New Zealand
  [[131,-2],[140,-3],[150,-6],[146,-8],[138,-8],[131,-5]],               // New Guinea
  [[-24,65],[-19,66],[-14,65],[-18,64]],                                 // Iceland
  [[95,5],[100,0],[106,-6],[114,-8],[120,-9],[112,-7],[104,-3],[98,2]],  // Indonesia
];
const ISLAND_PATHS = ISLAND_OUTLINES.map((o) => toPath(o.map(([lo, la]) => project(lo, la))));
const ANTARCTICA = "M0 500 L0 436 Q 130 424 270 436 T 560 432 T 830 438 L1000 432 L1000 500 Z";

/* point-in-polygon → scatter tree/structure slots that sit on land */
function pip(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function genSlots(poly, gx = 6, gy = 6) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const inside = [];
  for (let j = 1; j < gy; j++) for (let i = 1; i < gx; i++) {
    const x = minx + ((maxx - minx) * i) / gx, y = miny + ((maxy - miny) * j) / gy;
    if (pip(x, y, poly)) inside.push([round(x, 1), round(y, 1)]);
  }
  return inside;
}
const SLOTS = Object.fromEntries(Object.entries(REGION_PROJ).map(([id, p]) => [id, genSlots(p)]));
const slotAt = (id, i) => SLOTS[id][i % SLOTS[id].length] || CENTROIDS[id];

const DIST = (() => {
  const ids = Object.keys(CENTROIDS); const d = {}; let max = 0;
  for (const a of ids) { d[a] = {}; for (const b of ids) { const v = Math.hypot(CENTROIDS[a][0] - CENTROIDS[b][0], CENTROIDS[a][1] - CENTROIDS[b][1]); d[a][b] = v; if (v > max) max = v; } }
  for (const a in d) for (const b in d[a]) d[a][b] /= max;
  return d;
})();

/* ---------------------------------------------------------------------------
   SKILL TREE  (~90 projects)
   fx keys: forest soil river ocean fish animals fresh carbon points loyalty volunteers
--------------------------------------------------------------------------- */
const SECTIONS = [
  { id: "earth", name: "Earth", icon: "🌍", color: "#5bbf6a" },
  { id: "water", name: "Water", icon: "🌊", color: "#38b6e0" },
  { id: "animals", name: "Animals", icon: "🦌", color: "#e0a23b" },
  { id: "social", name: "Social", icon: "🤝", color: "#b886e8" },
];

const PROJECTS = [
  // ════════ EARTH ════════
  { id: "e_wood1", sec: "earth", branch: "Woodland Protection", name: "Forest Reserves", cost: 40, req: [], fx: { forest: 0.18, animals: 0.05 } },
  { id: "e_wood2", sec: "earth", branch: "Woodland Protection", name: "Wildlife Corridors", cost: 95, req: ["e_wood1"], fx: { forest: 0.12, animals: 0.18 } },
  { id: "e_wood3", sec: "earth", branch: "Woodland Protection", name: "Old-Growth Sanctuaries", cost: 170, req: ["e_wood2"], fx: { forest: 0.28, animals: 0.1 } },
  { id: "e_drone", sec: "earth", branch: "Reforestation", name: "Drone Seed-Bombing", cost: 70, req: [], fx: { forest: 0.3 } },
  { id: "e_mangrove", sec: "earth", branch: "Reforestation", name: "Mangrove Planting", cost: 120, req: ["e_drone"], fx: { forest: 0.2, ocean: 0.15, animals: 0.1 } },
  { id: "e_solar", sec: "earth", branch: "Renewable Energy", name: "Solar Arrays", cost: 50, req: [], visual: "solar", fx: { carbon: -0.5 } },
  { id: "e_wind", sec: "earth", branch: "Renewable Energy", name: "Wind Farms", cost: 100, req: ["e_solar"], visual: "wind", fx: { carbon: -0.6 } },
  { id: "e_geo", sec: "earth", branch: "Renewable Energy", name: "Geothermal Grid", cost: 160, req: ["e_wind"], fx: { carbon: -0.7 } },
  { id: "e_h2", sec: "earth", branch: "Renewable Energy", name: "Hydrogen Economy", cost: 240, req: ["e_geo"], fx: { carbon: -0.9 } },
  { id: "e_dac", sec: "earth", branch: "Carbon Capture", name: "Direct Air Capture", cost: 130, req: [], visual: "capture", fx: { carbon: -0.7 } },
  { id: "e_min", sec: "earth", branch: "Carbon Capture", name: "Carbon Mineralization", cost: 190, req: ["e_dac"], fx: { carbon: -0.8 } },
  { id: "e_char", sec: "earth", branch: "Carbon Capture", name: "Biochar Sequestration", cost: 160, req: ["e_dac"], fx: { carbon: -0.5, soil: 0.25 } },
  { id: "e_steel", sec: "earth", branch: "Green Industry", name: "Clean Steel", cost: 110, req: [], fx: { carbon: -0.5 } },
  { id: "e_cement", sec: "earth", branch: "Green Industry", name: "Low-Carbon Cement", cost: 120, req: ["e_steel"], fx: { carbon: -0.5 } },
  { id: "e_ielec", sec: "earth", branch: "Green Industry", name: "Industrial Electrification", cost: 200, req: ["e_cement"], fx: { carbon: -0.8 } },
  { id: "e_tram", sec: "earth", branch: "Public Transit", name: "Electric Streetcars", cost: 45, req: [], fx: { carbon: -0.3 } },
  { id: "e_rail", sec: "earth", branch: "Public Transit", name: "High-Speed Rail", cost: 105, req: ["e_tram"], fx: { carbon: -0.5 } },
  { id: "e_ev", sec: "earth", branch: "Public Transit", name: "Autonomous EV Fleets", cost: 185, req: ["e_rail"], fx: { carbon: -0.7 } },
  { id: "e_rec", sec: "earth", branch: "Waste Sorting", name: "Recycling Mandate", cost: 40, req: [], fx: { soil: 0.3, ocean: 0.1 } },
  { id: "e_comp", sec: "earth", branch: "Waste Sorting", name: "Composting Programs", cost: 90, req: ["e_rec"], fx: { soil: 0.4 } },
  { id: "e_circ", sec: "earth", branch: "Waste Sorting", name: "Circular Economy", cost: 170, req: ["e_comp"], fx: { soil: 0.25, carbon: -0.25 } },
  { id: "e_cover", sec: "earth", branch: "Regenerative Agriculture", name: "Cover Cropping", cost: 45, req: [], fx: { soil: 0.3 } },
  { id: "e_notill", sec: "earth", branch: "Regenerative Agriculture", name: "No-Till Farming", cost: 100, req: ["e_cover"], fx: { soil: 0.3, carbon: -0.2 } },
  { id: "e_agro", sec: "earth", branch: "Regenerative Agriculture", name: "Agroforestry", cost: 160, req: ["e_notill"], fx: { soil: 0.2, forest: 0.15, animals: 0.1 } },
  { id: "e_brown", sec: "earth", branch: "Land Reclamation", name: "Brownfield Cleanup", cost: 60, req: [], fx: { soil: 0.3, fresh: 0.2 } },
  { id: "e_oil", sec: "earth", branch: "Land Reclamation", name: "Oil-Spill Remediation", cost: 125, req: ["e_brown"], fx: { soil: 0.25, river: 0.2, ocean: 0.1 } },
  { id: "e_bio", sec: "earth", branch: "Land Reclamation", name: "Soil Bioremediation", cost: 195, req: ["e_oil"], fx: { soil: 0.5 } },

  // ════════ WATER ════════
  { id: "w_skim", sec: "water", branch: "Floating Stations", name: "River Skimmers", cost: 45, req: [], fx: { river: 0.4 } },
  { id: "w_lagoon", sec: "water", branch: "Floating Stations", name: "Lagoon Filtration", cost: 100, req: ["w_skim"], fx: { river: 0.3, fresh: 0.3 } },
  { id: "w_buoy", sec: "water", branch: "Floating Stations", name: "Smart Buoy Network", cost: 160, req: ["w_lagoon"], fx: { ocean: 0.3, river: 0.2 } },
  { id: "w_tidal", sec: "water", branch: "Water Renewables", name: "Tidal Generators", cost: 60, req: [], fx: { carbon: -0.4, ocean: 0.05 } },
  { id: "w_wave", sec: "water", branch: "Water Renewables", name: "Wave Energy", cost: 115, req: ["w_tidal"], fx: { carbon: -0.55 } },
  { id: "w_offwind", sec: "water", branch: "Water Renewables", name: "Offshore Wind", cost: 185, req: ["w_wave"], visual: "wind", fx: { carbon: -0.7 } },
  { id: "w_coral", sec: "water", branch: "Reef Protection", name: "Coral Nurseries", cost: 55, req: [], visual: "reef", fx: { ocean: 0.35, fish: 0.2 } },
  { id: "w_sanct", sec: "water", branch: "Reef Protection", name: "Marine Sanctuaries", cost: 115, req: ["w_coral"], fx: { ocean: 0.3, fish: 0.3 } },
  { id: "w_drone", sec: "water", branch: "Reef Protection", name: "Reef Restoration Drones", cost: 195, req: ["w_sanct"], fx: { ocean: 0.5 } },
  { id: "w_aq", sec: "water", branch: "Freshwater Protection", name: "Aquifer Shielding", cost: 50, req: [], fx: { fresh: 0.4 } },
  { id: "w_water", sec: "water", branch: "Freshwater Protection", name: "Watershed Reforestation", cost: 105, req: ["w_aq"], fx: { fresh: 0.3, forest: 0.1 } },
  { id: "w_glac", sec: "water", branch: "Freshwater Protection", name: "Glacier Monitoring", cost: 160, req: ["w_water"], fx: { fresh: 0.3 } },
  { id: "w_desal", sec: "water", branch: "Sanitation", name: "Solar Desalination", cost: 70, req: [], fx: { fresh: 0.4 } },
  { id: "w_waste", sec: "water", branch: "Sanitation", name: "Wastewater Treatment", cost: 115, req: ["w_desal"], fx: { river: 0.3, fresh: 0.3 } },
  { id: "w_grey", sec: "water", branch: "Sanitation", name: "Greywater Recycling", cost: 160, req: ["w_waste"], fx: { fresh: 0.4 } },
  { id: "w_ban", sec: "water", branch: "Plastic Reduction", name: "Single-Use Plastic Ban", cost: 50, req: [], fx: { ocean: 0.25 } },
  { id: "w_pack", sec: "water", branch: "Plastic Reduction", name: "Biodegradable Packaging", cost: 105, req: ["w_ban"], fx: { ocean: 0.2, soil: 0.1 } },
  { id: "w_inter", sec: "water", branch: "Plastic Reduction", name: "River Interceptors", cost: 160, req: ["w_pack"], fx: { river: 0.3, ocean: 0.2 } },
  { id: "w_wet", sec: "water", branch: "Wetlands", name: "Wetland Restoration", cost: 80, req: [], fx: { river: 0.2, fresh: 0.2, animals: 0.15 } },
  { id: "w_peat", sec: "water", branch: "Wetlands", name: "Peatland Rewetting", cost: 150, req: ["w_wet"], fx: { carbon: -0.4, fresh: 0.2 } },
  { id: "w_polar", sec: "water", branch: "Polar Research", name: "Polar Survey Stations", cost: 70, req: [], fx: { fish: 0.3 } },
  { id: "w_track", sec: "water", branch: "Polar Research", name: "Fish-Migration Tracking", cost: 135, req: ["w_polar"], fx: { fish: 0.4 } },
  { id: "w_trawl", sec: "water", branch: "Polar Research", name: "Ban Bottom Trawling", cost: 205, req: ["w_track"], fx: { fish: 0.6 } },
  { id: "w_beach", sec: "water", branch: "Shoreline Cleanup", name: "Beach Cleanups", cost: 40, req: [], fx: { ocean: 0.2 } },
  { id: "w_boom", sec: "water", branch: "Shoreline Cleanup", name: "Coastal Booms", cost: 95, req: ["w_beach"], fx: { ocean: 0.3, river: 0.1 } },
  { id: "w_array", sec: "water", branch: "Shoreline Cleanup", name: "Ocean Cleanup Array", cost: 210, req: ["w_boom"], fx: { ocean: 0.6 } },

  // ════════ ANIMALS ════════
  { id: "a_patrol", sec: "animals", branch: "Land Animals", name: "Anti-Poaching Patrols", cost: 50, req: [], fx: { animals: 0.4 } },
  { id: "a_habitat", sec: "animals", branch: "Land Animals", name: "Habitat Restoration", cost: 105, req: ["a_patrol"], fx: { animals: 0.3, forest: 0.1 } },
  { id: "a_predator", sec: "animals", branch: "Land Animals", name: "Predator Reintroduction", cost: 160, req: ["a_habitat"], fx: { animals: 0.3 } },
  { id: "a_wet", sec: "animals", branch: "Reptile Protection", name: "Wetland Reserves", cost: 45, req: [], fx: { animals: 0.2, fresh: 0.1 } },
  { id: "a_turtle", sec: "animals", branch: "Reptile Protection", name: "Sea-Turtle Protection", cost: 95, req: ["a_wet"], fx: { animals: 0.2, ocean: 0.1 } },
  { id: "a_fly", sec: "animals", branch: "Bird Protection", name: "Migratory Flyways", cost: 45, req: [], fx: { animals: 0.2 } },
  { id: "a_raptor", sec: "animals", branch: "Bird Protection", name: "Raptor Recovery", cost: 95, req: ["a_fly"], fx: { animals: 0.25 } },
  { id: "a_poll", sec: "animals", branch: "Insect Protection", name: "Pollinator Corridors", cost: 45, req: [], fx: { animals: 0.15, forest: 0.05, soil: 0.1 } },
  { id: "a_pest", sec: "animals", branch: "Insect Protection", name: "Pesticide Phase-Out", cost: 95, req: ["a_poll"], fx: { animals: 0.2, soil: 0.15, fish: 0.1 } },
  { id: "a_hatch", sec: "animals", branch: "Fish Protection", name: "Hatchery Programs", cost: 50, req: [], fx: { fish: 0.4 } },
  { id: "a_ladder", sec: "animals", branch: "Fish Protection", name: "Fish Ladders", cost: 95, req: ["a_hatch"], fx: { fish: 0.3, river: 0.1 } },
  { id: "a_aqua", sec: "animals", branch: "Fish Protection", name: "Aquaculture Reform", cost: 150, req: ["a_ladder"], fx: { fish: 0.4 } },
  { id: "a_mpa", sec: "animals", branch: "Fish Protection", name: "Marine Protected Areas", cost: 175, req: ["a_aqua"], fx: { fish: 0.3, ocean: 0.1 } },
  { id: "a_gene", sec: "animals", branch: "Endangered Species", name: "Gene Banks", cost: 80, req: [], fx: { animals: 0.2 } },
  { id: "a_breed", sec: "animals", branch: "Endangered Species", name: "Captive Breeding", cost: 135, req: ["a_gene"], fx: { animals: 0.3 } },
  { id: "a_rewild", sec: "animals", branch: "Endangered Species", name: "Rewilding Programs", cost: 200, req: ["a_breed"], fx: { animals: 0.4, forest: 0.1 } },

  // ════════ SOCIAL ════════
  { id: "s_bond", sec: "social", branch: "Eco Economy", name: "Green Bonds", cost: 35, req: [], fx: { points: 1.5 } },
  { id: "s_credit", sec: "social", branch: "Eco Economy", name: "Carbon Credit Market", cost: 95, req: ["s_bond"], fx: { points: 2.5 } },
  { id: "s_tour", sec: "social", branch: "Eco Economy", name: "Eco-Tourism", cost: 170, req: ["s_credit"], fx: { points: 3.5 } },
  { id: "s_crowd", sec: "social", branch: "Eco Economy", name: "Climate Crowdfunding", cost: 45, req: [], fx: { points: 1.5 } },
  { id: "s_patent", sec: "social", branch: "Eco Economy", name: "Green-Tech Patents", cost: 120, req: ["s_credit"], fx: { points: 3 } },
  { id: "s_sat", sec: "social", branch: "Research & Data", name: "Satellite Monitoring", cost: 80, req: [], fx: { points: 2 } },
  { id: "s_model", sec: "social", branch: "Research & Data", name: "Climate Modeling", cost: 135, req: ["s_sat"], fx: { points: 2, loyalty: 0.1 } },
  { id: "s_open", sec: "social", branch: "Research & Data", name: "Open Data Initiative", cost: 175, req: ["s_model"], fx: { points: 3 } },
  { id: "s_aware", sec: "social", branch: "Civic Loyalty", name: "Public Awareness", cost: 40, req: [], fx: { loyalty: 0.12 } },
  { id: "s_edu", sec: "social", branch: "Civic Loyalty", name: "Education Programs", cost: 95, req: ["s_aware"], fx: { loyalty: 0.2 } },
  { id: "s_council", sec: "social", branch: "Civic Loyalty", name: "Community Councils", cost: 160, req: ["s_edu"], fx: { loyalty: 0.3 } },
  { id: "s_indig", sec: "social", branch: "Civic Loyalty", name: "Indigenous Stewardship", cost: 200, req: ["s_council"], fx: { loyalty: 0.15, forest: 0.15, animals: 0.15 } },
  { id: "s_tax", sec: "social", branch: "Policy & Governance", name: "Carbon Tax", cost: 105, req: [], fx: { points: 2, carbon: -0.3 } },
  { id: "s_subsidy", sec: "social", branch: "Policy & Governance", name: "Subsidy Reform", cost: 150, req: ["s_tax"], fx: { points: 3 } },
  { id: "s_treaty", sec: "social", branch: "Policy & Governance", name: "International Treaties", cost: 220, req: ["s_subsidy"], fx: { loyalty: 0.25, carbon: -0.4 } },
  { id: "s_vol1", sec: "social", branch: "Volunteers", name: "Volunteer Corps", cost: 65, req: [], fx: { volunteers: 2 } },
  { id: "s_vol2", sec: "social", branch: "Volunteers", name: "International Aid", cost: 130, req: ["s_vol1"], fx: { volunteers: 2, animals: 0.05 } },
  { id: "s_youth", sec: "social", branch: "Volunteers", name: "Youth Climate Corps", cost: 180, req: ["s_vol2"], fx: { volunteers: 2, loyalty: 0.15 } },
];
const PROJECT_INDEX = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

const aggregateEffects = (purchased) => {
  const e = { forest: 0, soil: 0, river: 0, ocean: 0, fish: 0, animals: 0, fresh: 0, carbon: 0, points: 0, loyalty: 0, volunteers: 0 };
  for (const id in purchased) { if (!purchased[id]) continue; const p = PROJECT_INDEX[id]; if (!p) continue; for (const k in p.fx) e[k] += p.fx[k]; }
  return e;
};
const deriveVisuals = (purchased) => {
  const v = { solar: false, wind: false, reef: false, capture: false, trawlBanned: !!purchased.w_trawl };
  for (const id in purchased) { const p = purchased[id] && PROJECT_INDEX[id]; if (p && p.visual) v[p.visual] = true; }
  return v;
};

/* ---------------------------------------------------------------------------
   Ecological balance + world construction
--------------------------------------------------------------------------- */
function computeBalance(regions, co2, temp) {
  const rs = Object.values(regions); const avg = (k) => mean(rs.map((r) => r[k]));
  const air = clamp(((460 - co2) / 65) * 100), climate = clamp(((2.5 - temp) / 1.7) * 100);
  return round(mean([avg("forest"), avg("soil"), avg("river"), avg("ocean"), avg("fish"), avg("animals"), avg("loyalty"), air, climate]));
}
function makeInitialWorld() {
  const regions = {};
  for (const d of REGION_DEFS) regions[d.id] = { id: d.id, loyalty: d.loyalty, carbon: d.carbon, forest: d.forest, soil: d.soil, river: d.river, ocean: d.ocean, fish: d.fish, animals: d.animals, freshwater: d.freshwater, ruleBreaking: d.loyalty < 40, volunteer: false };
  const co2 = 416, temp = round(1.0 + (co2 - 415) * 0.07, 2);
  return { tick: 0, co2, temp, permafrost: false, permafrostCo2: 0, ecoPoints: 70, purchased: {}, hq: "na",
    balance: computeBalance(regions, co2, temp), bestBalance: 0, status: "playing", flags: {}, regions,
    events: [{ id: "seed", t: 0, kind: "info", msg: "🌍 Verdant Grid online — choose an HQ, earn Eco-Points, and commission projects to heal the planet." }] };
}

/* ---------------------------------------------------------------------------
   Tick engine
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
    const r = prev.regions[id]; const def = REGION_INDEX[id];
    let { forest, soil, river, ocean, fish, animals, freshwater, carbon, loyalty } = r;
    const supportTarget = 72 - 42 * DIST[hq][id];
    loyalty = clamp(loyalty + (supportTarget - loyalty) * 0.02 + eff.loyalty + (r.volunteer ? 0.25 : 0));
    const m = loyalty / 100;
    carbon = clamp(carbon + 0.1, 10, 100);
    soil = clamp(soil - 0.08);
    forest = clamp(forest - (def.poaching ? 0.35 : 0.13));
    animals = clamp(animals - (def.poaching ? 0.32 : 0.09));
    river = clamp(river - carbon * 0.003 - (def.runoff ? 0.1 : 0));
    ocean = clamp(ocean - 0.05 - (def.marine ? 0.04 : 0));
    fish = clamp(fish - 0.14);
    freshwater = clamp(freshwater - 0.05);
    forest = clamp(forest + eff.forest * m + (r.volunteer ? 0.12 : 0));
    soil = clamp(soil + eff.soil * m);
    river = clamp(river + eff.river * m);
    ocean = clamp(ocean + eff.ocean * m);
    fish = clamp(fish + eff.fish * m);
    animals = clamp(animals + eff.animals * m + (r.volunteer ? 0.12 : 0));
    freshwater = clamp(freshwater + eff.fresh * m);
    carbon = clamp(carbon + eff.carbon, 10, 100);
    let ruleBreaking = false;
    if (loyalty < 40) { ruleBreaking = true; const sev = (40 - loyalty) / 40;
      forest = clamp(forest - 0.8 - 1.2 * sev); animals = clamp(animals - 0.9 - 1.3 * sev);
      river = clamp(river - 0.5); ocean = clamp(ocean - 0.4); carbon = clamp(carbon + 0.5, 10, 100); illegalCo2 += 0.15 + 0.4 * sev; }
    if (permafrost && def.perm) { carbon = clamp(carbon + 0.3, 10, 100); forest = clamp(forest - 0.25); illegalCo2 += 0.1; }
    if (ruleBreaking && !r.ruleBreaking) addEvent(`⛔ ${def.name}: loyalty collapsed below 40% — illegal logging, poaching & dumping surging.`, "crisis");
    if (!ruleBreaking && r.ruleBreaking) addEvent(`✅ ${def.name}: civic order restored.`, "good");
    accCarbon.push(carbon); accForest.push(forest);
    regions[id] = { ...r, loyalty: round(loyalty), carbon: round(carbon), forest: round(forest), soil: round(soil), river: round(river), ocean: round(ocean), fish: round(fish), animals: round(animals), freshwater: round(freshwater), ruleBreaking };
  }

  const avgCarbon = mean(accCarbon), avgForest = mean(accForest);
  co2 = Math.max(380, co2 + ((avgCarbon - 55) * 0.02 - (avgForest - 50) * 0.016) * 1.5 + illegalCo2 * 0.4 + permafrostCo2);
  temp = temp + ((1.0 + (co2 - 415) * 0.07) - temp) * 0.08;
  if (!permafrost && temp > 1.5) { permafrost = true; permafrostCo2 = 0.06; addEvent("🌡️ TIPPING POINT: +1.5 °C breached — permafrost thaw triggered. Baseline Air Quality now falling irreversibly.", "crisis"); }
  if (permafrost) permafrostCo2 = Math.min(0.18, permafrostCo2 + 0.0008);

  const rs = Object.values(regions); const gAvg = (k) => mean(rs.map((x) => x[k]));
  const fire = (key, cond, reset, msg, kind) => { if (cond && !flags[key]) { flags[key] = true; addEvent(msg, kind); } else if (reset && flags[key]) flags[key] = false; };
  fire("co2hi", co2 >= 435, co2 < 425, "🏭 Global Air Quality dropping sharply — atmospheric load critical.", "warn");
  fire("fishcrash", gAvg("fish") < 25, gAvg("fish") > 40, "🐟 Global fishery collapse — fish below 25%.", "crisis");
  fire("ocCrash", regions.oc.ocean < 40, regions.oc.ocean > 55, "🌊 Oceania marine system in crisis.", "crisis");
  fire("forestGood", gAvg("forest") > 82, gAvg("forest") < 75, "🌳 Global forest cover above 82% — flourishing.", "good");

  const balance = computeBalance(regions, co2, temp);
  const bestBalance = Math.max(prev.bestBalance, balance);
  let status = "playing";
  if (balance >= 100) { status = "won"; addEvent("🏆 VICTORY — Ecological Balance reached 100%. The planet is fully restored.", "good"); }
  else if (balance <= 0) { status = "lost"; addEvent("☠️ COLLAPSE — Ecological Balance hit 0%.", "crisis"); }

  return { tick: prev.tick + 1, co2: round(co2, 1), temp: round(temp, 2), permafrost, permafrostCo2, ecoPoints: round(ecoPoints, 0), purchased: prev.purchased, hq, balance, bestBalance, status, flags, regions, events: [...events, ...prev.events].slice(0, 60) };
}

/* ---------------------------------------------------------------------------
   Helpers / persistence
--------------------------------------------------------------------------- */
function deriveGlobals(world) {
  const rs = Object.values(world.regions); const avg = (k) => round(mean(rs.map((r) => r[k])));
  return { air: round(clamp(((460 - world.co2) / 65) * 100)), climate: round(clamp(((2.5 - world.temp) / 1.7) * 100)),
    forest: avg("forest"), soil: avg("soil"), river: avg("river"), ocean: avg("ocean"), fish: avg("fish"), animals: avg("animals") };
}
function loadWorld() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const p = JSON.parse(raw); if (p && p.regions && typeof p.tick === "number" && p.status && p.purchased) return p; } } catch {}
  return makeInitialWorld();
}
const hexToRgb = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lerpColor = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); t = clamp(t, 0, 1); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`; };
const goodColor = (p) => (p >= 66 ? "#34d399" : p >= 40 ? "#fbbf24" : "#f87171");
const balanceColor = (b) => (b >= 70 ? "#34d399" : b >= 40 ? "#fbbf24" : "#f87171");

/* ---------------------------------------------------------------------------
   Animated map sub-pieces
--------------------------------------------------------------------------- */
function Windmill({ x, y, dur }) {
  const hy = y - 12;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={x} y1={y} x2={x} y2={hy} stroke="#eef2f6" strokeWidth="1.2" />
      <g>
        <animateTransform attributeName="transform" type="rotate" from={`0 ${x} ${hy}`} to={`360 ${x} ${hy}`} dur={`${dur}s`} repeatCount="indefinite" />
        <line x1={x} y1={hy} x2={x} y2={hy - 8} stroke="#eef2f6" strokeWidth="1.3" />
        <line x1={x} y1={hy} x2={x - 7} y2={hy + 4} stroke="#eef2f6" strokeWidth="1.3" />
        <line x1={x} y1={hy} x2={x + 7} y2={hy + 4} stroke="#eef2f6" strokeWidth="1.3" />
      </g>
      <circle cx={x} cy={hy} r="1.4" fill="#cbd5e1" />
    </g>
  );
}
function Boat({ path, dur, emoji, size = 12 }) {
  return (
    <text fontSize={size} style={{ pointerEvents: "none" }}>
      <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
      {emoji}
    </text>
  );
}

/* ---------------------------------------------------------------------------
   WORLD MAP
--------------------------------------------------------------------------- */
function WorldMap({ world, globals, selected, onSelect }) {
  const visuals = useMemo(() => deriveVisuals(world.purchased), [world.purchased]);
  const water = (globals.ocean + globals.river) / 2;
  const pollution = clamp((72 - water) / 72, 0, 1);     // 1 = filthy green, 0 = clean blue
  const garbageOpacity = clamp((100 - globals.ocean) / 100, 0, 1) * 0.55;
  const garbage = [[260,150,26],[470,210,22],[700,170,24],[640,360,28],[150,360,24],[820,250,22]];
  const cargoRoutes = [
    "M 210 150 C 330 120, 440 150, 520 145", "M 360 180 C 390 250, 360 320, 400 370",
    "M 880 180 C 920 250, 870 320, 905 380", "M 600 360 C 660 390, 720 360, 770 385",
  ];
  const trawlRoutes = ["M 820 360 C 860 340, 905 360, 930 390", "M 120 200 C 170 180, 230 200, 270 175", "M 760 300 C 800 290, 840 305, 870 290"];

  return (
    <svg viewBox="0 0 1000 500" style={{ width: "100%", height: "auto", display: "block", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "#06223a" }}>
      <defs>
        <linearGradient id="vgOcean" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#072a45" /><stop offset="0.5" stopColor="#0f5078" /><stop offset="1" stopColor="#072135" />
        </linearGradient>
        <radialGradient id="vgAtmo" cx="50%" cy="44%" r="78%">
          <stop offset="62%" stopColor="rgba(120,180,230,0)" /><stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
        </radialGradient>
        <filter id="vgRelief" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="0.014 0.022" numOctaves="4" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="vgShadow"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.45" /></filter>
        <filter id="vgRipple"><feTurbulence type="turbulence" baseFrequency="0.018 0.04" numOctaves="2" seed="5" result="t" />
          <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.55  0 0 0 0 0.75  0 0 0 0.05 0" /></filter>
      </defs>

      {/* ocean + texture + pollution */}
      <rect x="0" y="0" width="1000" height="500" fill="url(#vgOcean)" />
      <rect x="0" y="0" width="1000" height="500" filter="url(#vgRipple)" opacity="0.7" />
      <rect x="0" y="0" width="1000" height="500" fill={lerpColor("#1c6fa8", "#3f7d57", pollution)} opacity={pollution * 0.55} style={{ transition: "fill .8s, opacity .8s" }} />

      {/* drifting water glints */}
      {[[200,210,38],[560,300,46],[760,180,40]].map(([x, y, w], i) => (
        <ellipse key={"gl" + i} cx={x} cy={y} rx={w} ry="3" fill="rgba(255,255,255,0.18)">
          <animateTransform attributeName="transform" type="translate" from="-40 0" to="60 0" dur={`${10 + i * 3}s`} repeatCount="indefinite" />
        </ellipse>
      ))}

      {/* garbage patches (fade as oceans clean) */}
      {garbage.map(([x, y, r], i) => (
        <g key={"gb" + i} opacity={garbageOpacity} style={{ transition: "opacity .8s" }}>
          <ellipse cx={x} cy={y} rx={r} ry={r * 0.55} fill="#6e5a36" /><ellipse cx={x + r * 0.4} cy={y + 3} rx={r * 0.5} ry={r * 0.3} fill="#574826" />
        </g>
      ))}

      {/* boats sail behind continents */}
      {cargoRoutes.map((p, i) => <Boat key={"c" + i} path={p} dur={26 + i * 6} emoji="🚢" />)}
      {!visuals.trawlBanned && trawlRoutes.map((p, i) => <Boat key={"tr" + i} path={p} dur={18 + i * 4} emoji="🚤" size={11} />)}

      {/* polar ice */}
      <ellipse cx="500" cy="-30" rx="600" ry="70" fill="rgba(225,238,248,0.85)" />
      <path d={ANTARCTICA} fill="rgba(228,240,250,0.92)" />

      {/* LAND (rugged + shadowed) */}
      <g filter="url(#vgRelief)">
        <g filter="url(#vgShadow)">
          {ISLAND_PATHS.map((d, i) => <path key={"is" + i} d={d} fill={lerpColor("#7d6a4c", "#3a7a45", globals.forest / 100)} stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" style={{ pointerEvents: "none" }} />)}
          {REGION_GEO_IDS.map((id) => {
            const r = world.regions[id];
            return <path key={id} d={REGION_PATHS[id]} fill={lerpColor("#8a7350", "#2f7a3f", r.forest / 100)}
              stroke={selected === id ? "#ffffff" : world.hq === id ? "#facc15" : r.ruleBreaking ? "#f87171" : "rgba(0,0,0,0.3)"}
              strokeWidth={selected === id ? 3 : world.hq === id ? 2.4 : 1} onClick={() => onSelect(id)}
              style={{ cursor: "pointer", transition: "fill .8s" }} />;
          })}
        </g>
      </g>

      {/* structures, trees, labels (crisp, above relief) */}
      {REGION_GEO_IDS.map((id) => {
        const r = world.regions[id]; const def = REGION_INDEX[id]; const [cx, cy] = CENTROIDS[id];
        const slots = SLOTS[id]; const nTrees = Math.round((r.forest / 100) * slots.length); const tSize = 9 + r.forest * 0.05;
        return (
          <g key={"d" + id} onClick={() => onSelect(id)} style={{ cursor: "pointer" }}>
            {slots.slice(0, nTrees).map(([x, y], i) => <text key={"t" + i} x={x} y={y} fontSize={tSize} textAnchor="middle" style={{ pointerEvents: "none" }}>🌲</text>)}
            {visuals.solar && [slotAt(id, 1), slotAt(id, 4)].map(([x, y], i) => <rect key={"s" + i} x={x - 6} y={y - 4} width="12" height="8" rx="1" fill="#2563eb" stroke="#93c5fd" strokeWidth="0.7" transform={`rotate(-18 ${x} ${y})`} style={{ pointerEvents: "none" }} />)}
            {visuals.wind && [2, 5].map((s, i) => { const [x, y] = slotAt(id, s); return <Windmill key={"w" + i} x={x} y={y} dur={3 + (Math.round(x) % 5) * 0.5} />; })}
            {visuals.capture && (() => { const [x, y] = slotAt(id, 3); return <g style={{ pointerEvents: "none" }}><rect x={x - 3} y={y - 11} width="6" height="11" rx="1" fill="#9aa6b2" stroke="#5b6573" strokeWidth="0.6" /><ellipse cx={x} cy={y - 11} rx="4" ry="1.4" fill="#cbd5e1" /></g>; })()}
            {visuals.reef && <text x={cx + 22} y={cy + 18} fontSize="13" style={{ pointerEvents: "none" }}>🪸</text>}
            {world.hq === id && <text x={cx} y={cy - 20} fontSize="16" textAnchor="middle" style={{ pointerEvents: "none" }}>⭐</text>}
            {r.volunteer && <text x={cx - 22} y={cy + 4} fontSize="13" style={{ pointerEvents: "none" }}>🤝</text>}
            {r.ruleBreaking && <text x={cx + 18} y={cy - 8} fontSize="13" style={{ pointerEvents: "none" }}>⚠️</text>}
            <text x={cx} y={cy} fontSize="15" textAnchor="middle" style={{ pointerEvents: "none" }}>{def.flag}</text>
            <text x={cx} y={cy + 16} fontSize="9.5" textAnchor="middle" fill="#f8fafc" style={{ pointerEvents: "none", fontWeight: 700, paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 2.4 }}>{def.name} · {r.loyalty}%</text>
          </g>
        );
      })}

      {/* clouds */}
      {[[180,120,70,16],[620,90,90,20],[420,330,80,18]].map(([x, y, w, h], i) => (
        <g key={"cl" + i} opacity="0.22"><ellipse cx={x} cy={y} rx={w} ry={h} fill="#ffffff" />
          <animateTransform attributeName="transform" type="translate" from="0 0" to={`${60 + i * 20} 0`} dur={`${40 + i * 12}s`} repeatCount="indefinite" /></g>
      ))}

      <rect x="0" y="0" width="1000" height="500" fill="url(#vgAtmo)" style={{ pointerEvents: "none" }} />
    </svg>
  );
}
const REGION_GEO_IDS = Object.keys(OUTLINES);

/* ---------------------------------------------------------------------------
   UI pieces
--------------------------------------------------------------------------- */
function Bar({ value, color, height = 8 }) {
  return <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 6, height, overflow: "hidden" }}>
    <div style={{ width: `${clamp(value)}%`, height: "100%", background: color, borderRadius: 6, transition: "width .6s, background .6s" }} /></div>;
}
function MetricCard({ label, value, pct, color, sub }) {
  return <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
    <div style={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", color: "#8aa0b4", marginBottom: 5 }}>{label}</div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 7 }}><span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span><span style={{ fontSize: 11, color: "#8aa0b4" }}>%</span></div>
    <Bar value={pct} color={color} />{sub && <div style={{ fontSize: 9.5, color: "#6b7f93", marginTop: 5 }}>{sub}</div>}</div>;
}
const fxLabel = (fx) => { const map = { forest: "🌲Forest", soil: "🟫Soil", river: "🏞️River", ocean: "🌊Ocean", fish: "🐟Fish", animals: "🦌Animals", fresh: "💧Fresh", carbon: "💨Air", points: "✦Points", loyalty: "❤Loyalty", volunteers: "🤝Volunteers" };
  return Object.entries(fx).map(([k, v]) => `${map[k] || k} ${k === "carbon" ? (v < 0 ? "+" : "−") : v > 0 ? "+" : ""}${k === "carbon" ? Math.abs(v) : v}`).join("  "); };

function ProjectsModal({ world, onClose, onBuy }) {
  const [tab, setTab] = useState("earth");
  const owned = world.purchased;
  const branches = useMemo(() => { const by = {}; for (const p of PROJECTS) if (p.sec === tab) (by[p.branch] = by[p.branch] || []).push(p); return by; }, [tab]);
  const nodeState = (p) => owned[p.id] ? "owned" : !p.req.every((r) => owned[r]) ? "locked" : world.ecoPoints < p.cost ? "poor" : "buy";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,8,12,0.8)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#0e1722", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, width: "min(1000px,100%)", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>🔬 Eco-Projects</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}><span style={{ fontSize: 15, fontWeight: 700, color: "#86efac" }}>✦ {world.ecoPoints} pts</span><button onClick={onClose} style={btn("#475569")}>✕ Close</button></div>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "12px 18px 0" }}>
          {SECTIONS.map((s) => <button key={s.id} onClick={() => setTab(s.id)} style={{ cursor: "pointer", flex: 1, background: tab === s.id ? s.color : "rgba(255,255,255,0.05)", color: tab === s.id ? "#0a1018" : "#cbd5e1", border: "none", borderRadius: 10, padding: "9px 6px", fontSize: 13, fontWeight: 700 }}>{s.icon} {s.name}</button>)}
        </div>
        <div style={{ overflowY: "auto", padding: 18 }}>
          {Object.entries(branches).map(([branch, nodes]) => (
            <div key={branch} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "#8aa0b4", marginBottom: 8 }}>{branch}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {nodes.map((p) => { const s = nodeState(p); const border = s === "owned" ? "#34d399" : s === "buy" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)";
                  return (
                    <div key={p.id} style={{ flex: "1 1 220px", minWidth: 200, background: "rgba(255,255,255,0.03)", border: `1px solid ${border}`, borderRadius: 10, padding: 11, opacity: s === "locked" ? 0.55 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span><span style={{ fontSize: 12, color: "#86efac", fontWeight: 700, whiteSpace: "nowrap" }}>✦ {p.cost}</span></div>
                      <div style={{ fontSize: 10.5, color: "#8aa0b4", margin: "6px 0 9px" }}>{fxLabel(p.fx)}</div>
                      {s === "owned" && <div style={{ fontSize: 11, fontWeight: 700, color: "#34d399" }}>✓ Commissioned</div>}
                      {s === "locked" && <div style={{ fontSize: 11, color: "#94a3b8" }}>🔒 Requires {p.req.map((r) => PROJECT_INDEX[r].name).join(", ")}</div>}
                      {s === "poor" && <button disabled style={{ ...btn("#374151"), cursor: "not-allowed", width: "100%" }}>Need ✦ {p.cost}</button>}
                      {s === "buy" && <button onClick={() => onBuy(p.id)} style={{ ...btn("#34d399"), width: "100%" }}>Commission</button>}
                    </div>
                  ); })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EndgameOverlay({ world, onNewGame }) {
  if (world.status === "playing") return null;
  const won = world.status === "won";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,8,12,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}>
      <div style={{ background: "#0e1722", border: `2px solid ${won ? "#34d399" : "#f87171"}`, borderRadius: 18, padding: "30px 34px", maxWidth: 460, textAlign: "center" }}>
        <div style={{ fontSize: 52 }}>{won ? "🏆" : "☠️"}</div>
        <h2 style={{ margin: "4px 0 6px", fontSize: 26, color: won ? "#34d399" : "#f87171" }}>{won ? "PLANET RESTORED" : "BIOSPHERE COLLAPSE"}</h2>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "#aebccb", lineHeight: 1.5 }}>{won ? "You drove global Ecological Balance to 100%. Every biome thrives." : "Ecological Balance fell to 0%. Cascading tipping points overwhelmed the grid."}</p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 20 }}>
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(world.balance)}%</div><div style={skl}>Final</div></div>
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(world.bestBalance)}%</div><div style={skl}>Peak</div></div>
          <div><div style={{ fontSize: 20, fontWeight: 700 }}>{world.tick}</div><div style={skl}>Cycles</div></div>
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

  useEffect(() => { if (!running || world.status !== "playing") return; const iv = setInterval(() => setWorld((w) => stepWorld(w)), 1000 / speed); return () => clearInterval(iv); }, [running, speed, world.status]);
  useEffect(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(world)); } catch {} }, [world]);
  useEffect(() => { if (world.balance > bestEver) { setBestEver(world.balance); try { localStorage.setItem(BEST_KEY, String(world.balance)); } catch {} } }, [world.balance, bestEver]);

  const buyProject = useCallback((id) => setWorld((w) => {
    if (w.status !== "playing") return w; const p = PROJECT_INDEX[id];
    if (!p || w.purchased[id] || w.ecoPoints < p.cost || !p.req.every((r) => w.purchased[r])) return w;
    return { ...w, ecoPoints: w.ecoPoints - p.cost, purchased: { ...w.purchased, [id]: true }, events: [{ id: `buy-${w.tick}-${id}`, t: w.tick, kind: "good", msg: `🔬 ${p.name} commissioned — active across all sectors.` }, ...w.events].slice(0, 60) };
  }), []);
  const setHQ = useCallback((id) => setWorld((w) => (w.status !== "playing" ? w : { ...w, hq: id, events: [{ id: `hq-${w.tick}-${id}`, t: w.tick, kind: "info", msg: `🏛️ Headquarters relocated to ${REGION_INDEX[id].name}.` }, ...w.events].slice(0, 60) })), []);
  const loyaltyCampaign = useCallback((id) => setWorld((w) => { if (w.status !== "playing" || w.ecoPoints < LOYALTY_CAMPAIGN_COST) return w; const r = w.regions[id];
    return { ...w, ecoPoints: w.ecoPoints - LOYALTY_CAMPAIGN_COST, regions: { ...w.regions, [id]: { ...r, loyalty: clamp(r.loyalty + 15) } }, events: [{ id: `camp-${w.tick}-${id}`, t: w.tick, kind: "good", msg: `📣 Loyalty campaign in ${REGION_INDEX[id].name} (+15%).` }, ...w.events].slice(0, 60) }; }), []);
  const toggleVolunteer = useCallback((id) => setWorld((w) => { if (w.status !== "playing") return w; const r = w.regions[id];
    const slots = aggregateEffects(w.purchased).volunteers, used = Object.values(w.regions).filter((x) => x.volunteer).length;
    if (!r.volunteer && used >= slots) return w; return { ...w, regions: { ...w.regions, [id]: { ...r, volunteer: !r.volunteer } } }; }), []);
  const newGame = useCallback(() => { const w = makeInitialWorld(); setWorld(w); setRunning(true); setSpeed(1); setSelected("na"); setProjectsOpen(false); try { localStorage.removeItem(SAVE_KEY); } catch {} }, []);

  const g = useMemo(() => deriveGlobals(world), [world]);
  const region = world.regions[selected]; const def = REGION_INDEX[selected];
  const volSlots = useMemo(() => aggregateEffects(world.purchased).volunteers, [world.purchased]);
  const volUsed = useMemo(() => Object.values(world.regions).filter((x) => x.volunteer).length, [world.regions]);
  const kindColor = { crisis: "#f87171", warn: "#fbbf24", good: "#34d399", info: "#7dd3fc" };
  const year = 2025 + Math.floor(world.tick / 12);
  const regionMetrics = [["Forest", region.forest], ["Soil", region.soil], ["River", region.river], ["Ocean", region.ocean], ["Fish", region.fish], ["Animals", region.animals], ["Freshwater", region.freshwater], ["Emissions", region.carbon]];

  return (
    <div style={{ minHeight: "100vh", padding: 18, boxSizing: "border-box" }}>
      <style>{`@keyframes vgMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes vgPulse{0%,100%{opacity:1}50%{opacity:.45}}.vg-pulse{animation:vgPulse 1.1s infinite}.vg-marquee:hover .vg-track{animation-play-state:paused}`}</style>
      <EndgameOverlay world={world} onNewGame={newGame} />
      {projectsOpen && <ProjectsModal world={world} onClose={() => setProjectsOpen(false)} onBuy={buyProject} />}

      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div><h1 style={{ margin: 0, fontSize: 21 }}>🌱 Verdant Grid <span style={{ color: "#34d399" }}>Restoration</span></h1>
            <div style={{ fontSize: 11.5, color: "#8aa0b4", marginTop: 2 }}>Cycle {world.tick} · {year} · HQ {REGION_INDEX[world.hq].flag} {REGION_INDEX[world.hq].name} · Best {Math.round(bestEver)}%</div></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#86efac" }}>✦ {world.ecoPoints}</span>
            <button onClick={() => setProjectsOpen(true)} style={btn("#5bbf6a")}>🔬 Projects</button>
            {world.permafrost && <span className="vg-pulse" style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#7c2d12", border: "1px solid #f97316", padding: "4px 9px", borderRadius: 20 }}>❄️ THAW</span>}
            <button onClick={() => setRunning((r) => !r)} style={btn(running ? "#fbbf24" : "#34d399")}>{running ? "⏸" : "▶"}</button>
            {[1, 2, 4].map((s) => <button key={s} onClick={() => setSpeed(s)} style={btn(speed === s ? "#34d399" : "#2a3744")}>{s}×</button>)}
            <button onClick={newGame} style={btn("#475569")}>↻ New</button>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${balanceColor(world.balance)}55`, borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}><span style={{ fontSize: 11.5, letterSpacing: 1, textTransform: "uppercase", color: "#8aa0b4" }}>Global Ecological Balance</span><span style={{ fontSize: 12, color: "#6b7f93" }}>Win 100% · Lose 0%</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}><span style={{ fontSize: 32, fontWeight: 800, color: balanceColor(world.balance), minWidth: 74 }}>{Math.round(world.balance)}%</span><div style={{ flex: 1 }}><Bar value={world.balance} color={balanceColor(world.balance)} height={14} /></div></div>
        </div>

        <div style={{ display: "grid", gap: 14, marginBottom: 14, gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)" }}>
          <div><WorldMap world={world} globals={g} selected={selected} onSelect={setSelected} />
            <div style={{ fontSize: 10.5, color: "#6b7f93", marginTop: 6, textAlign: "center" }}>Click a continent to manage it · 🌲 forests thicken · oceans turn blue as you clean them · 🚤 trawlers vanish once banned · ⭐ = HQ</div></div>

          <div style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 16 }}>{def.flag} {def.name}</h2><span style={{ fontSize: 15, fontWeight: 700, color: goodColor(region.loyalty) }}>{region.loyalty}% loyalty</span></div>
            {region.ruleBreaking && <div className="vg-pulse" style={{ background: "rgba(220,38,38,0.15)", border: "1px solid #dc2626", borderRadius: 9, padding: "8px 10px", fontSize: 11.5, marginBottom: 10, color: "#fecaca" }}>⛔ Rule-Breaking — illegal activity surging. Run a campaign, station volunteers, or move HQ closer.</div>}
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
              {regionMetrics.map(([label, val]) => <div key={label}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#8aa0b4", marginBottom: 3 }}><span>{label}</span><span>{val}%</span></div><Bar value={label === "Emissions" ? 100 - val : val} color={goodColor(label === "Emissions" ? 100 - val : val)} height={6} /></div>)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button onClick={() => setHQ(selected)} disabled={world.hq === selected} style={{ ...btn(world.hq === selected ? "#374151" : "#facc15"), cursor: world.hq === selected ? "default" : "pointer" }}>{world.hq === selected ? "⭐ HQ here" : "🏛️ Set HQ"}</button>
              <button onClick={() => loyaltyCampaign(selected)} disabled={world.ecoPoints < LOYALTY_CAMPAIGN_COST} style={{ ...btn(world.ecoPoints < LOYALTY_CAMPAIGN_COST ? "#374151" : "#60a5fa"), cursor: world.ecoPoints < LOYALTY_CAMPAIGN_COST ? "not-allowed" : "pointer" }}>📣 Campaign ✦{LOYALTY_CAMPAIGN_COST}</button>
              <button onClick={() => toggleVolunteer(selected)} disabled={!region.volunteer && volUsed >= volSlots} style={{ ...btn(region.volunteer ? "#34d399" : volUsed >= volSlots ? "#374151" : "#a78bfa"), cursor: !region.volunteer && volUsed >= volSlots ? "not-allowed" : "pointer" }}>🤝 {region.volunteer ? "Recall" : "Station"} ({volUsed}/{volSlots})</button>
            </div>
            <div style={{ fontSize: 10, color: "#6b7f93", marginTop: 8 }}>Loyalty support is strongest at HQ and weakens with distance. Volunteers boost biodiversity & loyalty where stationed.</div>
          </div>
        </div>

        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#6b7f93", marginBottom: 8 }}>Global Biosphere Dashboard</div>
        <div style={{ display: "grid", gap: 9, marginBottom: 16, gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))" }}>
          <MetricCard label="Air Quality" value={g.air} pct={g.air} color={goodColor(g.air)} sub={world.permafrost ? "thaw dragging down" : "atmosphere"} />
          <MetricCard label="Climate" value={g.climate} pct={g.climate} color={goodColor(g.climate)} sub={g.climate < 45 ? "tipping risk" : "stable"} />
          <MetricCard label="Forest" value={g.forest} pct={g.forest} color={goodColor(g.forest)} />
          <MetricCard label="Soil" value={g.soil} pct={g.soil} color={goodColor(g.soil)} />
          <MetricCard label="River" value={g.river} pct={g.river} color={goodColor(g.river)} />
          <MetricCard label="Ocean" value={g.ocean} pct={g.ocean} color={goodColor(g.ocean)} />
          <MetricCard label="Fish" value={g.fish} pct={g.fish} color={goodColor(g.fish)} />
          <MetricCard label="Animals" value={g.animals} pct={g.animals} color={goodColor(g.animals)} />
        </div>

        <div className="vg-marquee" style={{ overflow: "hidden", whiteSpace: "nowrap", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 0", marginBottom: 12 }}>
          <div className="vg-track" style={{ display: "inline-block", animation: "vgMarquee 38s linear infinite" }}>
            {[0, 1].map((dup) => <span key={dup}>{world.events.slice(0, 16).map((e) => <span key={dup + e.id} style={{ marginRight: 36, fontSize: 12.5, color: kindColor[e.kind] || "#cbd5e1" }}><span style={{ color: "#52647a" }}>[{e.t}]</span> {e.msg}</span>)}</span>)}
          </div>
        </div>

        <div style={{ ...panel, maxHeight: 170, overflowY: "auto", padding: 0 }}>
          {world.events.map((e) => <div key={e.id} style={{ display: "flex", gap: 10, padding: "6px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}><span style={{ color: "#52647a", minWidth: 40 }}>#{e.t}</span><span style={{ color: kindColor[e.kind] || "#cbd5e1" }}>{e.msg}</span></div>)}
        </div>
        <div style={{ textAlign: "center", fontSize: 11, color: "#52647a", marginTop: 14 }}>Verdant Grid: Restoration · auto-saved to this browser</div>
      </div>
    </div>
  );
}

const btn = (c) => ({ cursor: "pointer", background: c, color: "#0a1018", border: "none", borderRadius: 8, padding: "7px 11px", fontSize: 12.5, fontWeight: 700 });
const panel = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14 };
const skl = { fontSize: 10, color: "#8aa0b4", textTransform: "uppercase", letterSpacing: 0.5 };
