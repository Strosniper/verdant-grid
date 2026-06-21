import React, { useState, useEffect, useMemo, useCallback } from "react";
import { REGION_GEO_IDS, REGION_PATHS, CENTROIDS, SLOTS, DIST, NEUTRAL_PATH, ANTARCTICA_PATH, projLatY } from "./worldGeo.js";

/* ============================================================================
   VERDANT GRID: RESTORATION  —  v4  "Living Earth"
   Realistic biome map · timed per-continent project rollout · random eco-disasters
   · movable volunteer units · refined UI · slow economy · win 100% / lose 0%.
============================================================================ */

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 1) => { const f = 10 ** d; return Math.round(v * f) / f; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const SAVE_KEY = "verdant-grid-save-v5";
const BEST_KEY = "verdant-grid-best-v5";
const BASE_POINT_RATE = 1.0;
const UPKEEP_PER = 0.05;              // points/cycle drained per implemented project
const LOYALTY_CAMPAIGN_COST = 30;
const DISASTER_CHANCE = 0.005;
const DIFFICULTY = {
  easy:       { label: "Easy",       point: 1.0,  decay: 0.8, disaster: 0.5, rollout: 1.0 },
  medium:     { label: "Medium",     point: 0.75, decay: 1.0, disaster: 1.0, rollout: 0.8 },
  hard:       { label: "Hard",       point: 0.55, decay: 1.3, disaster: 1.5, rollout: 0.6 },
  impossible: { label: "Impossible", point: 0.4,  decay: 1.7, disaster: 2.2, rollout: 0.45 },
};
const DIFF_KEYS = ["easy", "medium", "hard", "impossible"];

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

/* Geography (accurate coastlines + projection) lives in worldGeo.js */
const slotAt = (id, i) => SLOTS[id][i % SLOTS[id].length] || CENTROIDS[id];

/* ---------------------------------------------------------------------------
   Skill tree (~93 projects)
--------------------------------------------------------------------------- */
const SECTIONS = [
  { id: "earth", name: "Earth", icon: "🌍", color: "#5bbf6a" }, { id: "water", name: "Water", icon: "🌊", color: "#38b6e0" },
  { id: "animals", name: "Animals", icon: "🦌", color: "#e0a23b" }, { id: "social", name: "Social", icon: "🤝", color: "#b886e8" },
];
const PROJECTS = [
  { id: "e_wood1", sec: "earth", branch: "Woodland Protection", name: "Forest Reserves", cost: 40, req: [], fx: { forest: 0.18, animals: 0.05 } },
  { id: "e_wood2", sec: "earth", branch: "Woodland Protection", name: "Wildlife Corridors", cost: 95, req: ["e_wood1"], fx: { forest: 0.12, animals: 0.18 } },
  { id: "e_wood3", sec: "earth", branch: "Woodland Protection", name: "Old-Growth Sanctuaries", cost: 170, req: ["e_wood2"], fx: { forest: 0.28, animals: 0.1 } },
  { id: "e_drone", sec: "earth", branch: "Reforestation", name: "Drone Seed-Bombing", cost: 70, req: [], fx: { forest: 0.3 } },
  { id: "e_mangrove", sec: "earth", branch: "Reforestation", name: "Mangrove Planting", cost: 120, req: ["e_drone"], fx: { forest: 0.2, ocean: 0.15, animals: 0.1 } },
  { id: "e_roof", sec: "earth", branch: "Urban Greening", name: "Green Roofs", cost: 60, req: [], fx: { soil: 0.15, carbon: -0.2 } },
  { id: "e_urforest", sec: "earth", branch: "Urban Greening", name: "Urban Forests", cost: 115, req: ["e_roof"], fx: { forest: 0.15, animals: 0.1 } },
  { id: "e_green", sec: "earth", branch: "Urban Greening", name: "Green Cities Initiative", cost: 185, req: ["e_urforest"], visual: "greencity", fx: { forest: 0.2, soil: 0.15, loyalty: 0.1 } },
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
  { id: "e_fusion", sec: "earth", branch: "Renewable Energy", name: "Fusion Power", cost: 270, req: ["e_h2"], fx: { carbon: -1.2 } },
  { id: "e_grid", sec: "earth", branch: "Atmospheric Recovery", name: "Smart Grid", cost: 90, req: [], fx: { carbon: -0.4 } },
  { id: "e_retro", sec: "earth", branch: "Atmospheric Recovery", name: "Building Retrofits", cost: 105, req: ["e_grid"], fx: { carbon: -0.5 } },
  { id: "e_methane", sec: "earth", branch: "Atmospheric Recovery", name: "Methane Capture", cost: 120, req: [], fx: { carbon: -0.6 } },
  { id: "e_reflect", sec: "earth", branch: "Atmospheric Recovery", name: "Reflective City Surfaces", cost: 110, req: [], fx: { carbon: -0.3 } },
  { id: "e_cloud", sec: "earth", branch: "Atmospheric Recovery", name: "Marine Cloud Brightening", cost: 175, req: ["e_reflect"], fx: { carbon: -0.5 } },
  { id: "e_ozone", sec: "earth", branch: "Atmospheric Recovery", name: "Ozone Layer Restoration", cost: 150, req: [], fx: { carbon: -0.4 } },

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
  { id: "w_kelp", sec: "water", branch: "Blue Carbon", name: "Kelp Carbon Farms", cost: 110, req: [], fx: { carbon: -0.5, ocean: 0.15 } },
  { id: "w_seagrass", sec: "water", branch: "Blue Carbon", name: "Seagrass Meadows", cost: 150, req: ["w_kelp"], fx: { carbon: -0.4, fish: 0.2 } },
  { id: "w_polar", sec: "water", branch: "Polar Research", name: "Polar Survey Stations", cost: 70, req: [], fx: { fish: 0.3 } },
  { id: "w_track", sec: "water", branch: "Polar Research", name: "Fish-Migration Tracking", cost: 135, req: ["w_polar"], fx: { fish: 0.4 } },
  { id: "w_trawl", sec: "water", branch: "Polar Research", name: "Ban Bottom Trawling", cost: 205, req: ["w_track"], fx: { fish: 0.6 } },
  { id: "w_beach", sec: "water", branch: "Shoreline Cleanup", name: "Beach Cleanups", cost: 40, req: [], fx: { ocean: 0.2 } },
  { id: "w_boom", sec: "water", branch: "Shoreline Cleanup", name: "Coastal Booms", cost: 95, req: ["w_beach"], fx: { ocean: 0.3, river: 0.1 } },
  { id: "w_array", sec: "water", branch: "Shoreline Cleanup", name: "Ocean Cleanup Array", cost: 210, req: ["w_boom"], fx: { ocean: 0.6 } },

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

  { id: "s_bond", sec: "social", branch: "Eco Economy", name: "Green Bonds", cost: 35, req: [], fx: { points: 1.4 } },
  { id: "s_credit", sec: "social", branch: "Eco Economy", name: "Carbon Credit Market", cost: 95, req: ["s_bond"], fx: { points: 2.2 } },
  { id: "s_tour", sec: "social", branch: "Eco Economy", name: "Eco-Tourism", cost: 170, req: ["s_credit"], fx: { points: 3 } },
  { id: "s_crowd", sec: "social", branch: "Eco Economy", name: "Climate Crowdfunding", cost: 45, req: [], fx: { points: 1.3 } },
  { id: "s_patent", sec: "social", branch: "Eco Economy", name: "Green-Tech Patents", cost: 120, req: ["s_credit"], fx: { points: 2.5 } },
  { id: "s_sat", sec: "social", branch: "Research & Data", name: "Satellite Monitoring", cost: 80, req: [], fx: { points: 1.6 } },
  { id: "s_model", sec: "social", branch: "Research & Data", name: "Climate Modeling", cost: 135, req: ["s_sat"], fx: { points: 1.8, loyalty: 0.1 } },
  { id: "s_open", sec: "social", branch: "Research & Data", name: "Open Data Initiative", cost: 175, req: ["s_model"], fx: { points: 2.6 } },
  { id: "s_aware", sec: "social", branch: "Civic Loyalty", name: "Public Awareness", cost: 40, req: [], fx: { loyalty: 0.12 } },
  { id: "s_edu", sec: "social", branch: "Civic Loyalty", name: "Education Programs", cost: 95, req: ["s_aware"], fx: { loyalty: 0.2 } },
  { id: "s_council", sec: "social", branch: "Civic Loyalty", name: "Community Councils", cost: 160, req: ["s_edu"], fx: { loyalty: 0.3 } },
  { id: "s_indig", sec: "social", branch: "Civic Loyalty", name: "Indigenous Stewardship", cost: 200, req: ["s_council"], fx: { loyalty: 0.15, forest: 0.15, animals: 0.15 } },
  { id: "s_tax", sec: "social", branch: "Policy & Governance", name: "Carbon Tax", cost: 105, req: [], fx: { points: 1.6, carbon: -0.3 } },
  { id: "s_subsidy", sec: "social", branch: "Policy & Governance", name: "Subsidy Reform", cost: 150, req: ["s_tax"], fx: { points: 2.6 } },
  { id: "s_treaty", sec: "social", branch: "Policy & Governance", name: "International Treaties", cost: 220, req: ["s_subsidy"], fx: { loyalty: 0.25, carbon: -0.4 } },
  { id: "s_vol1", sec: "social", branch: "Volunteers", name: "Volunteer Corps", cost: 65, req: [], fx: { volunteers: 2 } },
  { id: "s_vol2", sec: "social", branch: "Volunteers", name: "International Aid", cost: 130, req: ["s_vol1"], fx: { volunteers: 2, animals: 0.05 } },
  { id: "s_youth", sec: "social", branch: "Volunteers", name: "Youth Climate Corps", cost: 180, req: ["s_vol2"], fx: { volunteers: 2, loyalty: 0.15 } },
];
const PROJECT_INDEX = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));
const volunteerSlots = (purchased) => { let n = 0; for (const id in purchased) { const p = purchased[id] && PROJECT_INDEX[id]; if (p && p.fx.volunteers) n += p.fx.volunteers; } return n; };

const DISASTERS = [
  { type: "meteor", icon: "☄️", name: "Meteor Strike", all: 15 },
  { type: "volcano", icon: "🌋", name: "Volcanic Eruption", all: 20, carbon: 6 },
  { type: "wildfire", icon: "🔥", name: "Mega-Wildfire", forest: 26, animals: 20, carbon: 8 },
  { type: "tsunami", icon: "🌊", name: "Tsunami", ocean: 20, river: 16, fish: 15, fresh: 10 },
  { type: "drought", icon: "🌵", name: "Severe Drought", fresh: 22, river: 18, soil: 15, forest: 10 },
  { type: "quake", icon: "🏚️", name: "Earthquake", all: 12, loyalty: 8 },
  { type: "pandemic", icon: "🦠", name: "Wildlife Pandemic", animals: 26, loyalty: 6 },
  { type: "spill", icon: "🛢️", name: "Oil Spill", ocean: 18, river: 14, fish: 16 },
];

/* ---------------------------------------------------------------------------
   Balance + world construction
--------------------------------------------------------------------------- */
function computeBalance(regions, co2, temp) {
  const rs = Object.values(regions); const avg = (k) => mean(rs.map((r) => r[k]));
  const air = clamp(((460 - co2) / 65) * 100), climate = clamp(((2.5 - temp) / 1.7) * 100);
  return round(mean([avg("forest"), avg("soil"), avg("river"), avg("ocean"), avg("fish"), avg("animals"), avg("loyalty"), air, climate]));
}
function makeInitialWorld(difficulty = "medium") {
  const regions = {};
  for (const d of REGION_DEFS) regions[d.id] = { id: d.id, loyalty: d.loyalty, carbon: d.carbon, forest: d.forest, soil: d.soil, river: d.river, ocean: d.ocean, fish: d.fish, animals: d.animals, freshwater: d.freshwater, ruleBreaking: d.loyalty < 40, volunteer: false };
  const co2 = 416, temp = round(1.0 + (co2 - 415) * 0.07, 2);
  return { tick: 0, co2, temp, permafrost: false, permafrostCo2: 0, ecoPoints: 55, owned: {}, queue: [], completed: {}, rollout: {}, hq: "na", difficulty, activeDisaster: null,
    balance: computeBalance(regions, co2, temp), bestBalance: 0, status: "playing", flags: {}, regions,
    events: [{ id: "seed", t: 0, kind: "info", msg: `🌍 Verdant Grid online (${DIFFICULTY[difficulty].label}) — projects implement one at a time, in the order you commission them.` }] };
}

/* ---------------------------------------------------------------------------
   Tick engine — with timed rollout + disasters
--------------------------------------------------------------------------- */
function stepWorld(prev) {
  if (prev.status !== "playing") return prev;
  const events = []; let seq = 0;
  const addEvent = (msg, kind) => events.push({ id: `${prev.tick + 1}-${seq++}`, t: prev.tick + 1, msg, kind });
  const flags = { ...prev.flags };
  let { co2, temp, permafrost, permafrostCo2, hq } = prev;
  const D = DIFFICULTY[prev.difficulty] || DIFFICULTY.medium;
  const ids = Object.keys(prev.regions);
  const completed = prev.completed || {};
  const completedIds = Object.keys(completed).filter((id) => completed[id]);
  const queue = prev.queue || [];
  const activePid = queue.length ? queue[0] : null;     // only the front of the queue rolls out

  let activeDisaster = prev.activeDisaster ? { ...prev.activeDisaster, ticks: prev.activeDisaster.ticks - 1 } : null;
  if (activeDisaster && activeDisaster.ticks <= 0) activeDisaster = null;
  let strike = null;
  if (prev.tick > 20 && Math.random() < DISASTER_CHANCE * D.disaster) {
    const d = DISASTERS[Math.floor(Math.random() * DISASTERS.length)];
    const region = ids[Math.floor(Math.random() * ids.length)];
    strike = { ...d, region };
    activeDisaster = { region, icon: d.icon, name: d.name, ticks: 6 };
    addEvent(`${d.icon} DISASTER — a ${d.name} struck ${REGION_INDEX[region].name}!`, "crisis");
  }

  const regions = {}, newRollout = {}; let illegalCo2 = 0; const accCarbon = [], accForest = [], activeProg = [];
  for (const id of ids) {
    const r = prev.regions[id]; const def = REGION_INDEX[id];
    let { forest, soil, river, ocean, fish, animals, freshwater, carbon, loyalty } = r;
    const distFactor = DIST[hq][id];
    const rate = (0.012 + (loyalty / 100) * 0.03 + (1 - distFactor) * 0.018) * D.rollout;   // rollout speed
    // advance only the active (front-of-queue) project for this region
    let pr = (prev.rollout[id] || {})[activePid] || 0;
    if (activePid) { if (pr < 1) pr = Math.min(1, pr + rate); newRollout[id] = { [activePid]: pr }; activeProg.push(pr); }
    else newRollout[id] = {};
    // accumulate effects: completed projects (full) + active project (partial)
    let aF = 0, aS = 0, aRi = 0, aO = 0, aFi = 0, aAn = 0, aFw = 0, aC = 0, aLoy = 0;
    const addFx = (fx, w) => { if (fx.forest) aF += fx.forest * w; if (fx.soil) aS += fx.soil * w; if (fx.river) aRi += fx.river * w; if (fx.ocean) aO += fx.ocean * w; if (fx.fish) aFi += fx.fish * w; if (fx.animals) aAn += fx.animals * w; if (fx.fresh) aFw += fx.fresh * w; if (fx.carbon) aC += fx.carbon * w; if (fx.loyalty) aLoy += fx.loyalty * w; };
    for (const pid of completedIds) addFx(PROJECT_INDEX[pid].fx, 1);
    if (activePid) addFx(PROJECT_INDEX[activePid].fx, pr);
    const supportTarget = 72 - 42 * distFactor;
    loyalty = clamp(loyalty + (supportTarget - loyalty) * 0.02 + aLoy + (r.volunteer ? 0.25 : 0));
    const m = loyalty / 100;
    carbon = clamp(carbon + 0.1 * D.decay, 10, 100); soil = clamp(soil - 0.08 * D.decay);
    forest = clamp(forest - (def.poaching ? 0.35 : 0.13) * D.decay); animals = clamp(animals - (def.poaching ? 0.32 : 0.09) * D.decay);
    river = clamp(river - (carbon * 0.003 + (def.runoff ? 0.1 : 0)) * D.decay); ocean = clamp(ocean - (0.05 + (def.marine ? 0.04 : 0)) * D.decay);
    fish = clamp(fish - 0.14 * D.decay); freshwater = clamp(freshwater - 0.05 * D.decay);
    forest = clamp(forest + aF * m + (r.volunteer ? 0.12 : 0)); soil = clamp(soil + aS * m); river = clamp(river + aRi * m);
    ocean = clamp(ocean + aO * m); fish = clamp(fish + aFi * m); animals = clamp(animals + aAn * m + (r.volunteer ? 0.12 : 0));
    freshwater = clamp(freshwater + aFw * m); carbon = clamp(carbon + aC, 10, 100);
    if (strike && strike.region === id) {
      const s = strike; const hit = (v, k) => clamp(v - (s.all || 0) - (s[k] || 0));
      forest = hit(forest, "forest"); soil = hit(soil, "soil"); river = hit(river, "river"); ocean = hit(ocean, "ocean");
      fish = hit(fish, "fish"); animals = hit(animals, "animals"); freshwater = hit(freshwater, "fresh");
      loyalty = clamp(loyalty - (s.loyalty || 0)); carbon = clamp(carbon + (s.carbon || 0), 10, 100);
    }
    let ruleBreaking = false;
    if (loyalty < 40) { ruleBreaking = true; const sev = (40 - loyalty) / 40;
      forest = clamp(forest - 0.8 - 1.2 * sev); animals = clamp(animals - 0.9 - 1.3 * sev);
      river = clamp(river - 0.5); ocean = clamp(ocean - 0.4); carbon = clamp(carbon + 0.5, 10, 100); illegalCo2 += 0.15 + 0.4 * sev; }
    if (permafrost && def.perm) { carbon = clamp(carbon + 0.3, 10, 100); forest = clamp(forest - 0.25); illegalCo2 += 0.1; }
    if (ruleBreaking && !r.ruleBreaking) addEvent(`⛔ ${def.name}: loyalty collapsed below 40% — illegal activity surging.`, "crisis");
    if (!ruleBreaking && r.ruleBreaking) addEvent(`✅ ${def.name}: civic order restored.`, "good");
    accCarbon.push(carbon); accForest.push(forest);
    regions[id] = { ...r, loyalty: round(loyalty), carbon: round(carbon), forest: round(forest), soil: round(soil), river: round(river), ocean: round(ocean), fish: round(fish), animals: round(animals), freshwater: round(freshwater), ruleBreaking };
  }

  // queue progression: when the active project is implemented nearly everywhere, complete it and start the next
  let newQueue = queue, newCompleted = completed;
  if (activePid && mean(activeProg) >= 0.97) {
    newCompleted = { ...completed, [activePid]: true };
    newQueue = queue.slice(1);
    addEvent(`✅ ${PROJECT_INDEX[activePid].name} fully implemented worldwide.${newQueue.length ? ` Next: ${PROJECT_INDEX[newQueue[0]].name}.` : ""}`, "good");
  }

  // economy: income from completed (full) + active (partial), minus upkeep per implemented project
  let pointBonus = 0;
  for (const pid of completedIds) { const fx = PROJECT_INDEX[pid].fx; if (fx.points) pointBonus += fx.points; }
  if (activePid) { const fx = PROJECT_INDEX[activePid].fx; if (fx.points) pointBonus += fx.points * mean(activeProg); }
  const upkeep = completedIds.length * UPKEEP_PER;
  const ecoPoints = round(Math.max(0, prev.ecoPoints + (BASE_POINT_RATE + pointBonus) * D.point - upkeep), 0);

  const avgCarbon = mean(accCarbon), avgForest = mean(accForest);
  co2 = Math.max(380, co2 + ((avgCarbon - 55) * 0.02 - (avgForest - 50) * 0.016) * 1.5 + illegalCo2 * 0.4 + permafrostCo2);
  temp = temp + ((1.0 + (co2 - 415) * 0.07) - temp) * 0.08;
  if (!permafrost && temp > 1.5) { permafrost = true; permafrostCo2 = 0.06; addEvent("🌡️ TIPPING POINT: +1.5 °C breached — permafrost thaw triggered.", "crisis"); }
  if (permafrost) permafrostCo2 = Math.min(0.18, permafrostCo2 + 0.0008);

  const rs = Object.values(regions); const gAvg = (k) => mean(rs.map((x) => x[k]));
  const fire = (key, cond, reset, msg, kind) => { if (cond && !flags[key]) { flags[key] = true; addEvent(msg, kind); } else if (reset && flags[key]) flags[key] = false; };
  fire("co2hi", co2 >= 435, co2 < 425, "🏭 Global Air Quality dropping sharply.", "warn");
  fire("fishcrash", gAvg("fish") < 25, gAvg("fish") > 40, "🐟 Global fishery collapse — fish below 25%.", "crisis");
  fire("forestGood", gAvg("forest") > 82, gAvg("forest") < 75, "🌳 Global forest cover above 82% — flourishing.", "good");

  const balance = computeBalance(regions, co2, temp);
  const bestBalance = Math.max(prev.bestBalance, balance);
  let status = "playing";
  if (balance >= 100) { status = "won"; addEvent("🏆 VICTORY — Ecological Balance reached 100%.", "good"); }
  else if (balance <= 0) { status = "lost"; addEvent("☠️ COLLAPSE — Ecological Balance hit 0%.", "crisis"); }

  return { tick: prev.tick + 1, co2: round(co2, 1), temp: round(temp, 2), permafrost, permafrostCo2, ecoPoints, owned: prev.owned, queue: newQueue, completed: newCompleted, rollout: newRollout, hq, difficulty: prev.difficulty, activeDisaster, balance, bestBalance, status, flags, regions, events: [...events, ...prev.events].slice(0, 60) };
}

/* ---------------------------------------------------------------------------
   Helpers / persistence
--------------------------------------------------------------------------- */
function deriveGlobals(world) {
  const rs = Object.values(world.regions); const avg = (k) => round(mean(rs.map((r) => r[k])));
  return { air: round(clamp(((460 - world.co2) / 65) * 100)), climate: round(clamp(((2.5 - world.temp) / 1.7) * 100)),
    forest: avg("forest"), soil: avg("soil"), river: avg("river"), ocean: avg("ocean"), fish: avg("fish"), animals: avg("animals") };
}
function loadWorld() { try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const p = JSON.parse(raw); if (p && p.regions && typeof p.tick === "number" && p.status && p.owned && p.queue && p.completed && p.difficulty) return p; } } catch {} return makeInitialWorld(); }
const hexToRgb = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lerpColor = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); t = clamp(t, 0, 1); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`; };
const goodColor = (p) => (p >= 66 ? "#34d399" : p >= 40 ? "#fbbf24" : "#f87171");
const balanceColor = (b) => (b >= 70 ? "#34d399" : b >= 40 ? "#fbbf24" : "#f87171");
const regionVisuals = (world, id) => { const rr = world.rollout[id] || {}; const active = world.queue[0]; const has = (v) => PROJECTS.some((p) => p.visual === v && (world.completed[p.id] || (active === p.id && (rr[p.id] || 0) > 0.4))); return { solar: has("solar"), wind: has("wind"), reef: has("reef"), capture: has("capture"), greencity: has("greencity") }; };

/* ---------------------------------------------------------------------------
   Animated map sub-pieces
--------------------------------------------------------------------------- */
function Windmill({ x, y, dur }) {
  const hy = y - 12;
  return (<g style={{ pointerEvents: "none" }}>
    <line x1={x} y1={y} x2={x} y2={hy} stroke="#eef2f6" strokeWidth="1.2" />
    <g><animateTransform attributeName="transform" type="rotate" from={`0 ${x} ${hy}`} to={`360 ${x} ${hy}`} dur={`${dur}s`} repeatCount="indefinite" />
      <line x1={x} y1={hy} x2={x} y2={hy - 8} stroke="#eef2f6" strokeWidth="1.3" /><line x1={x} y1={hy} x2={x - 7} y2={hy + 4} stroke="#eef2f6" strokeWidth="1.3" /><line x1={x} y1={hy} x2={x + 7} y2={hy + 4} stroke="#eef2f6" strokeWidth="1.3" /></g>
    <circle cx={x} cy={hy} r="1.4" fill="#cbd5e1" /></g>);
}
function Boat({ path, dur, emoji, size = 12 }) { return (<text fontSize={size} style={{ pointerEvents: "none" }}><animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />{emoji}</text>); }

function WorldMap({ world, globals, selected, onSelect }) {
  const water = (globals.ocean + globals.river) / 2;
  const pollution = clamp((72 - water) / 72, 0, 1);
  const garbageOpacity = clamp((100 - globals.ocean) / 100, 0, 1) * 0.4;
  const garbage = [[260,150,26],[470,210,22],[700,170,24],[640,360,28],[150,360,24],[820,250,22]];
  const cargo = ["M 210 150 C 330 120, 440 150, 520 145", "M 360 180 C 390 250, 360 320, 400 370", "M 880 180 C 920 250, 870 320, 905 380", "M 600 360 C 660 390, 720 360, 770 385"];
  const trawl = ["M 820 360 C 860 340, 905 360, 930 390", "M 120 200 C 170 180, 230 200, 270 175", "M 760 300 C 800 290, 840 305, 870 290"];
  const trawlBanned = !!world.completed.w_trawl;
  const bandDefs = [[90,66,"#e7f1ef",0.4],[66,48,"#2c5b3a",0.34],[48,30,"#3c8048",0.26],[30,14,"#c7b074",0.4],[14,-12,"#2f8f43",0.36],[-12,-30,"#c7b074",0.36],[-30,-52,"#3c8048",0.26]];
  const EXTR = 7; // faux-3D extrusion depth
  const extrude = (d, key) => Array.from({ length: EXTR }).map((_, k) => {
    const off = EXTR - k; return <path key={key + "x" + k} d={d} transform={`translate(0 ${off})`} fill={lerpColor("#231a0d", "#83663a", k / (EXTR - 1))} style={{ pointerEvents: "none" }} />;
  });
  const topFace = (d, fill, extra) => (<g>{extra}<path d={d} fill={fill} style={{ pointerEvents: "none" }} /></g>);

  return (
    <svg viewBox="0 0 1000 500" style={{ width: "100%", height: "auto", display: "block", borderRadius: 18, border: "1px solid rgba(94,240,138,0.18)", background: "#0a1f1a", boxShadow: "0 18px 60px rgba(0,0,0,0.55), inset 0 0 80px rgba(0,0,0,0.4)" }}>
      <defs>
        <radialGradient id="vgOcean" cx="26%" cy="20%" r="95%"><stop offset="0%" stopColor="#27554a" /><stop offset="45%" stopColor="#163a33" /><stop offset="100%" stopColor="#091915" /></radialGradient>
        <radialGradient id="vgSun" cx="22%" cy="16%" r="55%"><stop offset="0%" stopColor="rgba(180,255,200,0.5)" /><stop offset="100%" stopColor="rgba(180,255,200,0)" /></radialGradient>
        <radialGradient id="vgGlobe" cx="38%" cy="30%" r="85%"><stop offset="0%" stopColor="rgba(255,255,255,0.1)" /><stop offset="48%" stopColor="rgba(255,255,255,0)" /><stop offset="100%" stopColor="rgba(0,8,6,0.6)" /></radialGradient>
        <radialGradient id="vgAtmo" cx="50%" cy="46%" r="80%"><stop offset="66%" stopColor="rgba(94,240,138,0)" /><stop offset="100%" stopColor="rgba(40,120,90,0.2)" /></radialGradient>
        <filter id="vgTerrain"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.03" numOctaves="5" seed="8" result="n" /><feDiffuseLighting in="n" lightingColor="#e6f5e2" surfaceScale="2.4" diffuseConstant="1.15"><feDistantLight azimuth="235" elevation="58" /></feDiffuseLighting></filter>
        <filter id="vgShadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#000" floodOpacity="0.55" /></filter>
        <filter id="vgBlur"><feGaussianBlur stdDeviation="5" /></filter>
        <filter id="vgRipple"><feTurbulence type="turbulence" baseFrequency="0.012 0.03" numOctaves="2" seed="5" result="t" /><feColorMatrix in="t" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.7  0 0 0 0 0.55  0 0 0 0.035 0" /></filter>
        <clipPath id="vgLandClip">{REGION_GEO_IDS.map((id) => <path key={id} d={REGION_PATHS[id]} />)}<path d={NEUTRAL_PATH} /><path d={ANTARCTICA_PATH} /></clipPath>
      </defs>

      <rect x="0" y="0" width="1000" height="500" fill="url(#vgOcean)" />
      <rect x="0" y="0" width="1000" height="500" fill="url(#vgSun)" style={{ pointerEvents: "none" }} />
      <rect x="0" y="0" width="1000" height="500" filter="url(#vgRipple)" opacity="0.6" />
      <rect x="0" y="0" width="1000" height="500" fill={lerpColor("#1d6e74", "#3f6b4a", pollution)} opacity={pollution * 0.45} style={{ transition: "fill .8s, opacity .8s" }} />
      {[[200,210,38],[560,300,46],[760,180,40]].map(([x, y, w], i) => (<ellipse key={"gl" + i} cx={x} cy={y} rx={w} ry="3" fill="rgba(200,255,220,0.14)"><animateTransform attributeName="transform" type="translate" from="-40 0" to="60 0" dur={`${10 + i * 3}s`} repeatCount="indefinite" /></ellipse>))}
      {garbage.map(([x, y, r], i) => (<g key={"gb" + i} opacity={garbageOpacity} style={{ transition: "opacity .8s" }}><ellipse cx={x} cy={y} rx={r} ry={r * 0.55} fill="#5e5430" /><ellipse cx={x + r * 0.4} cy={y + 3} rx={r * 0.5} ry={r * 0.3} fill="#4a4226" /></g>))}
      {cargo.map((p, i) => <Boat key={"c" + i} path={p} dur={26 + i * 6} emoji="🚢" />)}
      {!trawlBanned && trawl.map((p, i) => <Boat key={"tr" + i} path={p} dur={18 + i * 4} emoji="🚤" size={11} />)}

      {/* coastal shelf glow */}
      <g filter="url(#vgBlur)" opacity="0.45">{REGION_GEO_IDS.map((id) => <path key={id} d={REGION_PATHS[id]} fill="none" stroke="#5ef0c0" strokeWidth="6" />)}<path d={NEUTRAL_PATH} fill="none" stroke="#5ef0c0" strokeWidth="5" /></g>

      {/* LAND — extruded slabs floating on the ocean */}
      <g filter="url(#vgShadow)">
        <g>{extrude(NEUTRAL_PATH, "neu")}{topFace(NEUTRAL_PATH, lerpColor("#7d6a4c", "#36833f", globals.forest / 100))}</g>
        <g>{extrude(ANTARCTICA_PATH, "ant")}<path d={ANTARCTICA_PATH} fill="rgba(228,242,238,0.95)" style={{ pointerEvents: "none" }} /></g>
        {REGION_GEO_IDS.map((id) => { const r = world.regions[id];
          const stroke = selected === id ? "#ffffff" : world.hq === id ? "#facc15" : r.ruleBreaking ? "#f87171" : null;
          return (<g key={id} onClick={() => onSelect(id)} style={{ cursor: "pointer" }}>
            {extrude(REGION_PATHS[id], id)}
            <path d={REGION_PATHS[id]} fill={lerpColor("#8a7350", "#2f8f43", r.forest / 100)} style={{ transition: "fill .8s" }} />
            {stroke && <path d={REGION_PATHS[id]} fill="none" stroke={stroke} strokeWidth={selected === id ? 2.6 : 2} style={{ pointerEvents: "none" }} />}
          </g>); })}
      </g>

      {/* biome bands + terrain relief lighting (clipped to land) */}
      <g clipPath="url(#vgLandClip)" style={{ pointerEvents: "none" }}>
        {bandDefs.map(([la, lb, c, o], i) => { const ya = projLatY(la), yb = projLatY(lb); return <rect key={i} x="0" y={Math.min(ya, yb)} width="1000" height={Math.abs(yb - ya)} fill={c} opacity={o} />; })}
        <rect x="0" y="0" width="1000" height="500" filter="url(#vgTerrain)" opacity="0.5" style={{ mixBlendMode: "soft-light" }} />
        <rect x="0" y="0" width="1000" height="500" fill="url(#vgSun)" opacity="0.5" style={{ mixBlendMode: "screen" }} />
      </g>

      {/* structures, trees, labels */}
      {REGION_GEO_IDS.map((id) => {
        const r = world.regions[id]; const def = REGION_INDEX[id]; const [cx, cy] = CENTROIDS[id];
        const slots = SLOTS[id]; const nTrees = Math.round((r.forest / 100) * slots.length); const tSize = 9 + r.forest * 0.05;
        const v = regionVisuals(world, id);
        return (<g key={"d" + id} onClick={() => onSelect(id)} style={{ cursor: "pointer" }}>
          {slots.slice(0, nTrees).map(([x, y], i) => <text key={"t" + i} x={x} y={y} fontSize={tSize} textAnchor="middle" style={{ pointerEvents: "none" }}>🌲</text>)}
          {v.greencity && [slotAt(id, 0), slotAt(id, 6)].map(([x, y], i) => <g key={"gc" + i} style={{ pointerEvents: "none" }}><circle cx={x} cy={y} r="6" fill="rgba(62,240,122,0.35)" /><circle cx={x} cy={y} r="3" fill="#3ef07a" /><circle cx={x + 5} cy={y - 3} r="2" fill="#3ef07a" /><circle cx={x - 4} cy={y + 3} r="2" fill="#3ef07a" /></g>)}
          {v.solar && [slotAt(id, 1), slotAt(id, 4)].map(([x, y], i) => <rect key={"s" + i} x={x - 6} y={y - 4} width="12" height="8" rx="1" fill="#2563eb" stroke="#93c5fd" strokeWidth="0.7" transform={`rotate(-18 ${x} ${y})`} style={{ pointerEvents: "none" }} />)}
          {v.wind && [2, 5].map((s, i) => { const [x, y] = slotAt(id, s); return <Windmill key={"w" + i} x={x} y={y} dur={3 + (Math.round(x) % 5) * 0.5} />; })}
          {v.capture && (() => { const [x, y] = slotAt(id, 3); return <g style={{ pointerEvents: "none" }}><rect x={x - 3} y={y - 11} width="6" height="11" rx="1" fill="#9aa6b2" stroke="#5b6573" strokeWidth="0.6" /><ellipse cx={x} cy={y - 11} rx="4" ry="1.4" fill="#cbd5e1" /></g>; })()}
          {v.reef && <text x={cx + 22} y={cy + 18} fontSize="13" style={{ pointerEvents: "none" }}>🪸</text>}
          {world.hq === id && <text x={cx} y={cy - 20} fontSize="16" textAnchor="middle" style={{ pointerEvents: "none" }}>⭐</text>}
          {r.volunteer && <text x={cx - 22} y={cy + 4} fontSize="13" style={{ pointerEvents: "none" }}>🤝</text>}
          {r.ruleBreaking && <text x={cx + 18} y={cy - 8} fontSize="13" style={{ pointerEvents: "none" }}>⚠️</text>}
          <text x={cx} y={cy} fontSize="15" textAnchor="middle" style={{ pointerEvents: "none" }}>{def.flag}</text>
          <text x={cx} y={cy + 16} fontSize="9.5" textAnchor="middle" fill="#f8fafc" style={{ pointerEvents: "none", fontWeight: 700, paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 2.4 }}>{def.name} · {r.loyalty}%</text>
        </g>);
      })}

      {/* disaster marker */}
      {world.activeDisaster && (() => { const [cx, cy] = CENTROIDS[world.activeDisaster.region]; return (<g style={{ pointerEvents: "none" }}><circle cx={cx} cy={cy} r="26" fill="none" stroke="#f87171" strokeWidth="2"><animate attributeName="r" from="10" to="34" dur="1.2s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.9" to="0" dur="1.2s" repeatCount="indefinite" /></circle><text x={cx} y={cy - 28} fontSize="22" textAnchor="middle">{world.activeDisaster.icon}</text></g>); })()}

      {[[180,120,70,16],[620,90,90,20],[420,330,80,18]].map(([x, y, w, h], i) => (<g key={"cl" + i} opacity="0.2" style={{ pointerEvents: "none" }}><ellipse cx={x} cy={y} rx={w} ry={h} fill="#ffffff" /><animateTransform attributeName="transform" type="translate" from="0 0" to={`${60 + i * 20} 0`} dur={`${40 + i * 12}s`} repeatCount="indefinite" /></g>))}
      <rect x="0" y="0" width="1000" height="500" fill="url(#vgGlobe)" style={{ pointerEvents: "none" }} />
      <rect x="0" y="0" width="1000" height="500" fill="url(#vgAtmo)" style={{ pointerEvents: "none" }} />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   UI pieces
--------------------------------------------------------------------------- */
function Bar({ value, color, height = 8 }) { return <div className="vg-track2" style={{ height }}><div style={{ width: `${clamp(value)}%`, height: "100%", background: color, borderRadius: 6, transition: "width .6s, background .6s" }} /></div>; }
function MetricCard({ icon, label, value, pct, color, sub }) {
  return <div className="vg-metric"><div className="vg-metric-h"><span>{icon} {label}</span></div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 3, margin: "2px 0 8px" }}><span style={{ fontSize: 21, fontWeight: 800, color }}>{value}</span><span style={{ fontSize: 11, color: "#94a3b8" }}>%</span></div>
    <Bar value={pct} color={color} />{sub && <div style={{ fontSize: 9.5, color: "#7b8aa0", marginTop: 5 }}>{sub}</div>}</div>;
}
const fxLabel = (fx) => { const map = { forest: "🌲", soil: "🟫", river: "🏞️", ocean: "🌊", fish: "🐟", animals: "🦌", fresh: "💧", carbon: "💨", points: "✦", loyalty: "❤", volunteers: "🤝" };
  return Object.entries(fx).map(([k, v]) => `${map[k] || k}${k === "carbon" ? (v < 0 ? "+" : "−") : v > 0 ? "+" : ""}${k === "carbon" ? Math.abs(v) : v}`).join("  "); };

function ProjectsModal({ world, onClose, onBuy }) {
  const [tab, setTab] = useState("earth");
  const owned = world.owned;
  const active = world.queue[0];
  const branches = useMemo(() => { const by = {}; for (const p of PROJECTS) if (p.sec === tab) (by[p.branch] = by[p.branch] || []).push(p); return by; }, [tab]);
  const nodeState = (p) => world.completed[p.id] ? "done" : owned[p.id] ? (p.id === active ? "active" : "queued") : !p.req.every((r) => owned[r]) ? "locked" : world.ecoPoints < p.cost ? "poor" : "buy";
  const activeProg = round(mean(REGION_GEO_IDS.map((r) => (world.rollout[r] || {})[active] || 0)) * 100, 0);
  const sec = SECTIONS.find((s) => s.id === tab);
  return (
    <div className="vg-modal-bg" onClick={onClose}>
      <div className="vg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vg-modal-head"><div><h2 style={{ margin: 0, fontSize: 18 }}>Eco-Projects</h2><div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>Projects implement <b>one at a time</b>, in the order you commission them.</div></div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}><span className="vg-points">✦ {world.ecoPoints}</span><button className="vg-btn" style={{ background: "#33415a", color: "#e6eef5" }} onClick={onClose}>✕</button></div></div>
        {active && <div className="vg-queue-bar"><span>⏳ Implementing: <b>{PROJECT_INDEX[active].name}</b> — {activeProg}%</span><span style={{ color: "#7fa593" }}>{world.queue.length - 1} queued</span></div>}
        <div className="vg-tabs">{SECTIONS.map((s) => <button key={s.id} className={"vg-tab" + (tab === s.id ? " on" : "")} onClick={() => setTab(s.id)} style={tab === s.id ? { background: s.color, color: "#08121e" } : {}}>{s.icon} {s.name}</button>)}</div>
        <div className="vg-modal-body">
          {Object.entries(branches).map(([branch, nodes]) => (
            <div key={branch} style={{ marginBottom: 18 }}>
              <div className="vg-branch" style={{ borderColor: sec.color + "55" }}><span style={{ width: 6, height: 6, borderRadius: 6, background: sec.color, display: "inline-block" }} /> {branch}</div>
              <div className="vg-grid">{nodes.map((p) => { const s = nodeState(p);
                return (<div key={p.id} className={"vg-node" + (s === "done" ? " owned" : s === "locked" ? " locked" : "")}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}><span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{p.name}</span><span className="vg-cost">✦{p.cost}</span></div>
                  <div style={{ fontSize: 11, color: "#9fb0c4", margin: "7px 0 9px", letterSpacing: 0.3 }}>{fxLabel(p.fx)}</div>
                  {s === "done" && <div style={{ fontSize: 11.5, fontWeight: 700, color: "#34d399" }}>✓ Implemented</div>}
                  {s === "active" && <div><div style={{ fontSize: 10.5, color: "#fbbf24", marginBottom: 4 }}>⏳ Implementing… {activeProg}%</div><Bar value={activeProg} color="#fbbf24" height={5} /></div>}
                  {s === "queued" && <div style={{ fontSize: 11, color: "#7dd3fc" }}>🕓 Queued · position {world.queue.indexOf(p.id)}</div>}
                  {s === "locked" && <div style={{ fontSize: 11, color: "#8295ab" }}>🔒 Requires {p.req.map((r) => PROJECT_INDEX[r].name).join(", ")}</div>}
                  {s === "poor" && <button className="vg-btn block" disabled style={{ background: "#2a3446", color: "#64748b" }}>Need ✦{p.cost}</button>}
                  {s === "buy" && <button className="vg-btn block" style={{ background: sec.color, color: "#08121e" }} onClick={() => onBuy(p.id)}>{world.queue.length ? "Add to queue" : "Commission"}</button>}
                </div>); })}</div>
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
  return (<div className="vg-modal-bg" style={{ zIndex: 60 }}><div className="vg-end" style={{ borderColor: won ? "#34d399" : "#f87171" }}>
    <div style={{ fontSize: 52 }}>{won ? "🏆" : "☠️"}</div>
    <h2 style={{ margin: "4px 0 6px", fontSize: 26, color: won ? "#34d399" : "#f87171" }}>{won ? "PLANET RESTORED" : "BIOSPHERE COLLAPSE"}</h2>
    <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "#aebccb", lineHeight: 1.5 }}>{won ? "You drove global Ecological Balance to 100%. Every biome thrives." : "Ecological Balance fell to 0%. Cascading tipping points overwhelmed the grid."}</p>
    <div style={{ display: "flex", gap: 18, justifyContent: "center", marginBottom: 20 }}>{[["Final", Math.round(world.balance) + "%"], ["Peak", Math.round(world.bestBalance) + "%"], ["Cycles", world.tick]].map(([k, v]) => <div key={k}><div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div><div className="vg-k">{k}</div></div>)}</div>
    <button className="vg-btn" style={{ background: won ? "#34d399" : "#f87171", color: "#08121e", fontSize: 14, padding: "10px 22px" }} onClick={onNewGame}>↻ New Game</button>
  </div></div>);
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

  const buyProject = useCallback((id) => setWorld((w) => { if (w.status !== "playing") return w; const p = PROJECT_INDEX[id];
    if (!p || w.owned[id] || w.ecoPoints < p.cost || !p.req.every((r) => w.owned[r])) return w;
    const queued = w.queue.length > 0;
    return { ...w, ecoPoints: w.ecoPoints - p.cost, owned: { ...w.owned, [id]: true }, queue: [...w.queue, id], events: [{ id: `buy-${w.tick}-${id}`, t: w.tick, kind: "good", msg: `🔬 ${p.name} ${queued ? "added to the implementation queue" : "commissioned — rollout beginning"}.` }, ...w.events].slice(0, 60) }; }), []);
  const setHQ = useCallback((id) => setWorld((w) => (w.status !== "playing" ? w : { ...w, hq: id, events: [{ id: `hq-${w.tick}-${id}`, t: w.tick, kind: "info", msg: `🏛️ Headquarters relocated to ${REGION_INDEX[id].name}.` }, ...w.events].slice(0, 60) })), []);
  const loyaltyCampaign = useCallback((id) => setWorld((w) => { if (w.status !== "playing" || w.ecoPoints < LOYALTY_CAMPAIGN_COST) return w; const r = w.regions[id];
    return { ...w, ecoPoints: w.ecoPoints - LOYALTY_CAMPAIGN_COST, regions: { ...w.regions, [id]: { ...r, loyalty: clamp(r.loyalty + 15) } }, events: [{ id: `camp-${w.tick}-${id}`, t: w.tick, kind: "good", msg: `📣 Loyalty campaign in ${REGION_INDEX[id].name} (+15%).` }, ...w.events].slice(0, 60) }; }), []);
  const toggleVolunteer = useCallback((id) => setWorld((w) => { if (w.status !== "playing") return w; const r = w.regions[id];
    const slots = volunteerSlots(w.completed), used = Object.values(w.regions).filter((x) => x.volunteer).length;
    if (!r.volunteer && used >= slots) return w; return { ...w, regions: { ...w.regions, [id]: { ...r, volunteer: !r.volunteer } } }; }), []);
  const newGame = useCallback((difficulty) => { const dk = (typeof difficulty === "string" && DIFFICULTY[difficulty]) ? difficulty : world.difficulty; const w = makeInitialWorld(dk); setWorld(w); setRunning(true); setSpeed(1); setSelected("na"); setProjectsOpen(false); try { localStorage.removeItem(SAVE_KEY); } catch {} }, [world.difficulty]);

  const g = useMemo(() => deriveGlobals(world), [world]);
  const region = world.regions[selected]; const def = REGION_INDEX[selected];
  const volSlots = useMemo(() => volunteerSlots(world.completed), [world.completed]);
  const activeProject = world.queue[0];
  const activeProjProg = useMemo(() => activeProject ? Math.round(mean(REGION_GEO_IDS.map((r) => (world.rollout[r] || {})[activeProject] || 0)) * 100) : 0, [world.rollout, activeProject]);
  const volUsed = useMemo(() => Object.values(world.regions).filter((x) => x.volunteer).length, [world.regions]);
  const kindColor = { crisis: "#f87171", warn: "#fbbf24", good: "#34d399", info: "#7dd3fc" };
  const year = 2025 + Math.floor(world.tick / 12);
  const regionMetrics = [["Forest", region.forest], ["Soil", region.soil], ["River", region.river], ["Ocean", region.ocean], ["Fish", region.fish], ["Animals", region.animals], ["Freshwater", region.freshwater], ["Emissions", region.carbon]];

  return (
    <div className="vg-app">
      <style>{CSS}</style>
      <EndgameOverlay world={world} onNewGame={newGame} />
      {projectsOpen && <ProjectsModal world={world} onClose={() => setProjectsOpen(false)} onBuy={buyProject} />}

      <div className="vg-wrap">
        <header className="vg-header">
          <div><h1 className="vg-title">🌱 Verdant Grid <span>Restoration</span></h1>
            <div className="vg-sub">Cycle {world.tick} · {year} · HQ {REGION_INDEX[world.hq].flag} {REGION_INDEX[world.hq].name} · Best {Math.round(bestEver)}%</div></div>
          <div className="vg-controls">
            <span className="vg-points">✦ {world.ecoPoints}</span>
            <button className="vg-btn primary" onClick={() => setProjectsOpen(true)}>🔬 Projects</button>
            {world.permafrost && <span className="vg-chip warn">❄️ THAW</span>}
            <button className="vg-btn" onClick={() => setRunning((r) => !r)}>{running ? "⏸" : "▶"}</button>
            {[1, 2, 4].map((s) => <button key={s} className={"vg-btn" + (speed === s ? " sel" : "")} onClick={() => setSpeed(s)}>{s}×</button>)}
            <button className="vg-btn" onClick={() => newGame()}>↻</button>
          </div>
        </header>

        <div className="vg-diffbar">
          <span className="vg-diff-label">Difficulty</span>
          {DIFF_KEYS.map((k) => <button key={k} className={"vg-btn vg-diff" + (world.difficulty === k ? " sel" : "")} onClick={() => newGame(k)}>{DIFFICULTY[k].label}</button>)}
          <span className="vg-diff-note">selecting a level starts a new game</span>
        </div>

        <div className="vg-balance" style={{ borderColor: balanceColor(world.balance) + "55" }}>
          <div className="vg-balance-h"><span>Global Ecological Balance · {DIFFICULTY[world.difficulty].label}</span><span style={{ color: "#7b8aa0" }}>Win 100% · Lose 0%</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}><span style={{ fontSize: 32, fontWeight: 800, color: balanceColor(world.balance), minWidth: 76 }}>{Math.round(world.balance)}%</span><div style={{ flex: 1 }}><Bar value={world.balance} color={balanceColor(world.balance)} height={14} /></div></div>
          {activeProject
            ? <div className="vg-queue-strip">⏳ Implementing <b>{PROJECT_INDEX[activeProject].name}</b> — {activeProjProg}%<span style={{ flex: 1 }} /><span style={{ color: "#7fa593" }}>{world.queue.length - 1} queued</span></div>
            : <div className="vg-queue-strip" style={{ color: "#5f7c6e" }}>No project implementing — open 🔬 Projects to commission one.</div>}
        </div>

        <div className="vg-main">
          <div><WorldMap world={world} globals={g} selected={selected} onSelect={setSelected} />
            <div className="vg-caption">🌲 forests thicken · oceans turn blue as you clean them · 🚤 trawlers vanish once banned · ☄️ disasters strike at random · ⭐ = HQ</div></div>

          <div className="vg-panel">
            <div className="vg-panel-h"><h2>{def.flag} {def.name}</h2><span style={{ fontSize: 15, fontWeight: 700, color: goodColor(region.loyalty) }}>{region.loyalty}%</span></div>
            {region.ruleBreaking && <div className="vg-alert">⛔ Rule-Breaking — illegal activity surging. Run a campaign, station volunteers, or move HQ closer.</div>}
            <div className="vg-region-grid">{regionMetrics.map(([label, val]) => { const shown = label === "Emissions" ? 100 - val : val; return <div key={label}><div className="vg-rl"><span>{label}</span><span>{val}%</span></div><Bar value={shown} color={goodColor(shown)} height={6} /></div>; })}</div>
            <div className="vg-actions">
              <button className="vg-btn" style={world.hq === selected ? {} : { background: "#facc15", color: "#08121e" }} onClick={() => setHQ(selected)} disabled={world.hq === selected}>{world.hq === selected ? "⭐ HQ" : "🏛️ Set HQ"}</button>
              <button className="vg-btn" style={world.ecoPoints >= LOYALTY_CAMPAIGN_COST ? { background: "#60a5fa", color: "#08121e" } : {}} onClick={() => loyaltyCampaign(selected)} disabled={world.ecoPoints < LOYALTY_CAMPAIGN_COST}>📣 Campaign ✦{LOYALTY_CAMPAIGN_COST}</button>
              <button className="vg-btn" style={region.volunteer ? { background: "#34d399", color: "#08121e" } : !region.volunteer && volUsed >= volSlots ? {} : { background: "#a78bfa", color: "#08121e" }} onClick={() => toggleVolunteer(selected)} disabled={!region.volunteer && volUsed >= volSlots}>🤝 {region.volunteer ? "Recall" : "Deploy"} ({volUsed}/{volSlots})</button>
            </div>
            <div className="vg-hint">Volunteer units boost biodiversity & loyalty where stationed — move them to struggling continents. Loyalty support is strongest near HQ.</div>
          </div>
        </div>

        <div className="vg-section-label">Global Biosphere Dashboard</div>
        <div className="vg-metrics">
          <MetricCard icon="💨" label="Air Quality" value={g.air} pct={g.air} color={goodColor(g.air)} sub={world.permafrost ? "thaw dragging down" : "atmosphere"} />
          <MetricCard icon="🌡️" label="Climate" value={g.climate} pct={g.climate} color={goodColor(g.climate)} sub={g.climate < 45 ? "tipping risk" : "stable"} />
          <MetricCard icon="🌲" label="Forest" value={g.forest} pct={g.forest} color={goodColor(g.forest)} />
          <MetricCard icon="🟫" label="Soil" value={g.soil} pct={g.soil} color={goodColor(g.soil)} />
          <MetricCard icon="🏞️" label="River" value={g.river} pct={g.river} color={goodColor(g.river)} />
          <MetricCard icon="🌊" label="Ocean" value={g.ocean} pct={g.ocean} color={goodColor(g.ocean)} />
          <MetricCard icon="🐟" label="Fish" value={g.fish} pct={g.fish} color={goodColor(g.fish)} />
          <MetricCard icon="🦌" label="Animals" value={g.animals} pct={g.animals} color={goodColor(g.animals)} />
        </div>

        <div className="vg-marquee"><div className="vg-track">{[0, 1].map((dup) => <span key={dup}>{world.events.slice(0, 16).map((e) => <span key={dup + e.id} className="vg-tick" style={{ color: kindColor[e.kind] || "#cbd5e1" }}><b style={{ color: "#52647a" }}>[{e.t}]</b> {e.msg}</span>)}</span>)}</div></div>
        <div className="vg-log">{world.events.map((e) => <div key={e.id} className="vg-log-row"><span className="vg-log-t">#{e.t}</span><span style={{ color: kindColor[e.kind] || "#cbd5e1" }}>{e.msg}</span></div>)}</div>
        <div className="vg-foot">Verdant Grid: Restoration · auto-saved to this browser</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Design system
--------------------------------------------------------------------------- */
const CSS = `
.vg-app{min-height:100vh;padding:22px;box-sizing:border-box;color:#d8f0e4;font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
 background:
  radial-gradient(900px 520px at 16% -8%,rgba(94,240,138,.12),transparent 60%),
  radial-gradient(820px 600px at 102% 2%,rgba(54,224,200,.09),transparent 55%),
  linear-gradient(rgba(94,240,138,.028) 1px,transparent 1px) 0 0/44px 44px,
  linear-gradient(90deg,rgba(94,240,138,.028) 1px,transparent 1px) 0 0/44px 44px,
  linear-gradient(180deg,#07140f,#040a08)}
.vg-app *{font-variant-numeric:tabular-nums}
.vg-wrap{max-width:1220px;margin:0 auto}
.vg-glass{background:linear-gradient(155deg,rgba(22,44,37,.62),rgba(9,19,16,.62));border:1px solid rgba(94,240,138,.14);border-radius:16px;backdrop-filter:blur(12px);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 14px 36px rgba(0,0,0,.42)}
.vg-header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:18px}
.vg-title{margin:0;font-size:23px;font-weight:800;letter-spacing:-.4px;background:linear-gradient(90deg,#eafff0,#9bf7c0);-webkit-background-clip:text;background-clip:text;color:transparent}
.vg-title span{background:linear-gradient(90deg,#5ef08a,#36e0c8);-webkit-background-clip:text;background-clip:text;color:transparent}
.vg-sub{font-size:11.5px;color:#7fa593;margin-top:3px;letter-spacing:.2px}
.vg-controls{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.vg-points{font-size:15px;font-weight:800;color:#072018;background:linear-gradient(90deg,#5ef08a,#36e0c8);padding:6px 13px;border-radius:10px;box-shadow:0 0 18px rgba(94,240,138,.45)}
.vg-btn{cursor:pointer;background:linear-gradient(155deg,rgba(34,60,50,.7),rgba(14,26,21,.7));color:#cdeeda;border:1px solid rgba(94,240,138,.18);border-radius:10px;padding:8px 13px;font-size:12.5px;font-weight:700;transition:transform .12s,box-shadow .18s,border-color .18s}
.vg-btn:hover:not(:disabled){transform:translateY(-1px);border-color:rgba(94,240,138,.5);box-shadow:0 0 16px rgba(94,240,138,.25)}
.vg-btn:disabled{opacity:.45;cursor:default}
.vg-btn.primary{background:linear-gradient(90deg,#5ef08a,#36e0c8);color:#072018;border-color:transparent;box-shadow:0 0 18px rgba(94,240,138,.35)}
.vg-btn.sel{background:linear-gradient(90deg,#5ef08a,#36e0c8);color:#072018;border-color:transparent}
.vg-btn.block{width:100%;margin-top:auto}
.vg-chip{font-size:10px;font-weight:700;padding:5px 9px;border-radius:20px}
.vg-chip.warn{color:#fff;background:linear-gradient(90deg,#7c2d12,#b45309);border:1px solid #f97316;animation:vgPulse 1.1s infinite}
.vg-balance{padding:15px 18px;margin-bottom:16px;border-radius:16px;background:linear-gradient(155deg,rgba(22,44,37,.62),rgba(9,19,16,.62));border:1px solid;backdrop-filter:blur(12px);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 14px 36px rgba(0,0,0,.42)}
.vg-balance-h{display:flex;justify-content:space-between;margin-bottom:9px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#7fa593}
.vg-main{display:grid;gap:16px;margin-bottom:18px;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr)}
@media(max-width:880px){.vg-main{grid-template-columns:1fr}}
.vg-caption{font-size:10.5px;color:#5f7c6e;margin-top:9px;text-align:center;letter-spacing:.2px}
.vg-panel{padding:16px;border-radius:16px;background:linear-gradient(155deg,rgba(22,44,37,.62),rgba(9,19,16,.62));border:1px solid rgba(94,240,138,.14);backdrop-filter:blur(12px);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 14px 36px rgba(0,0,0,.42)}
.vg-panel-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}.vg-panel-h h2{margin:0;font-size:16px;font-weight:700;color:#eafff0}
.vg-alert{background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.6);border-radius:11px;padding:9px 11px;font-size:11.5px;margin-bottom:12px;color:#fecaca;animation:vgPulse 1.4s infinite}
.vg-region-grid{display:grid;gap:10px;grid-template-columns:1fr 1fr;margin-bottom:14px}
.vg-rl{display:flex;justify-content:space-between;font-size:10.5px;color:#7fa593;margin-bottom:4px}
.vg-actions{display:flex;flex-wrap:wrap;gap:8px}
.vg-hint{font-size:10px;color:#5f7c6e;margin-top:10px;line-height:1.55}
.vg-section-label{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#6b8a7b;margin-bottom:10px;font-weight:600;display:flex;align-items:center;gap:9px}
.vg-section-label::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(94,240,138,.25),transparent)}
.vg-metrics{display:grid;gap:11px;margin-bottom:16px;grid-template-columns:repeat(auto-fit,minmax(122px,1fr))}
.vg-metric{position:relative;padding:12px 13px 13px;min-width:0;border-radius:14px;background:linear-gradient(155deg,rgba(24,46,39,.6),rgba(10,20,17,.6));border:1px solid rgba(94,240,138,.12);overflow:hidden;transition:transform .14s,border-color .2s}
.vg-metric::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#5ef08a,#36e0c8);opacity:.7}
.vg-metric:hover{transform:translateY(-2px);border-color:rgba(94,240,138,.35)}
.vg-metric-h{font-size:10.5px;letter-spacing:.4px;color:#8fb0a0;font-weight:600;margin-bottom:2px}
.vg-track2{background:rgba(0,0,0,.32);border-radius:6px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.04)}
.vg-marquee{overflow:hidden;white-space:nowrap;border-radius:12px;padding:9px 0;margin-bottom:12px;background:linear-gradient(155deg,rgba(22,44,37,.55),rgba(9,19,16,.55));border:1px solid rgba(94,240,138,.12)}
.vg-marquee:hover .vg-track{animation-play-state:paused}
.vg-track{display:inline-block;animation:vgMarquee 40s linear infinite}
.vg-tick{margin-right:36px;font-size:12.5px}
.vg-log{border-radius:14px;max-height:168px;overflow-y:auto;background:linear-gradient(155deg,rgba(20,40,34,.5),rgba(8,16,14,.5));border:1px solid rgba(94,240,138,.1)}
.vg-log-row{display:flex;gap:10px;padding:6px 14px;border-bottom:1px solid rgba(94,240,138,.06);font-size:12px}
.vg-log-t{color:#4d6a5d;min-width:40px}
.vg-foot{text-align:center;font-size:11px;color:#4d6a5d;margin-top:14px;letter-spacing:.3px}
.vg-modal-bg{position:fixed;inset:0;background:rgba(2,8,6,.74);z-index:40;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(5px)}
.vg-modal{background:linear-gradient(160deg,#0d1f1a,#081411);border:1px solid rgba(94,240,138,.2);border-radius:20px;width:min(1040px,100%);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 40px 90px rgba(0,0,0,.6),0 0 50px rgba(94,240,138,.07)}
.vg-modal-head{display:flex;align-items:center;justify-content:space-between;padding:17px 22px;border-bottom:1px solid rgba(94,240,138,.12)}
.vg-modal-head h2{color:#eafff0}
.vg-tabs{display:flex;gap:9px;padding:16px 22px 0}
.vg-tab{cursor:pointer;flex:1;background:rgba(94,240,138,.06);color:#bcd9c9;border:1px solid rgba(94,240,138,.12);border-radius:11px;padding:10px 6px;font-size:13px;font-weight:700;transition:transform .12s,box-shadow .18s}
.vg-tab:hover{transform:translateY(-1px);box-shadow:0 0 14px rgba(94,240,138,.18)}
.vg-tab.on{box-shadow:0 0 20px rgba(94,240,138,.3)}
.vg-modal-body{overflow-y:auto;padding:18px 22px}
.vg-branch{display:flex;align-items:center;gap:9px;font-size:11.5px;letter-spacing:.8px;text-transform:uppercase;color:#a7c4b4;margin-bottom:11px;padding-bottom:7px;border-bottom:1px solid}
.vg-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(212px,1fr))}
.vg-node{background:linear-gradient(160deg,rgba(26,50,42,.55),rgba(10,20,17,.55));border:1px solid rgba(94,240,138,.13);border-radius:13px;padding:13px;display:flex;flex-direction:column;min-height:118px;transition:transform .14s,border-color .2s,box-shadow .2s}
.vg-node:hover{transform:translateY(-3px);border-color:rgba(94,240,138,.45);box-shadow:0 10px 24px rgba(0,0,0,.4),0 0 18px rgba(94,240,138,.12)}
.vg-node.owned{border-color:rgba(94,240,138,.55);background:linear-gradient(160deg,rgba(52,211,153,.12),rgba(10,24,18,.5))}
.vg-node.locked{opacity:.5}
.vg-cost{font-size:12px;color:#86efac;font-weight:800;white-space:nowrap}
.vg-end{background:linear-gradient(160deg,#0d1f1a,#081411);border:2px solid;border-radius:22px;padding:34px 38px;max-width:480px;text-align:center;box-shadow:0 40px 90px rgba(0,0,0,.65),0 0 60px rgba(94,240,138,.08)}
.vg-k{font-size:10px;color:#8fb0a0;text-transform:uppercase;letter-spacing:.6px}
.vg-app ::-webkit-scrollbar{width:9px;height:9px}
.vg-app ::-webkit-scrollbar-thumb{background:rgba(94,240,138,.22);border-radius:8px}
.vg-app ::-webkit-scrollbar-thumb:hover{background:rgba(94,240,138,.38)}
.vg-diffbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:14px}
.vg-diff-label{font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#7fa593;font-weight:600;margin-right:2px}
.vg-diff{padding:6px 13px}
.vg-diff-note{font-size:10px;color:#5f7c6e;margin-left:4px}
.vg-queue-strip{display:flex;align-items:center;gap:6px;margin-top:11px;padding-top:10px;border-top:1px solid rgba(94,240,138,.1);font-size:12px;color:#cdeeda}
.vg-queue-bar{display:flex;justify-content:space-between;align-items:center;margin:12px 22px 0;padding:9px 14px;border-radius:11px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);font-size:12px;color:#fde68a}
@keyframes vgMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes vgPulse{0%,100%{opacity:1}50%{opacity:.5}}
`;
