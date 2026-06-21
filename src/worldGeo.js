/* ============================================================================
   worldGeo.js — real geographic continent data for Verdant Grid.
   Builds accurate, detailed coastlines from world-atlas TopoJSON, grouped into
   the seven game regions and projected with d3-geo (Natural Earth projection).
============================================================================ */
import { feature } from "topojson-client";
import topo from "world-atlas/countries-110m.json";
import { geoNaturalEarth1, geoPath, geoCentroid, geoContains } from "d3-geo";

export const MAP_W = 1000, MAP_H = 500;
export const REGION_GEO_IDS = ["na", "sa", "eu", "af", "ru", "as", "oc"];

/* ISO-numeric country codes → game region */
const REGION_CODES = {
  na: [124, 840, 484, 304, 320, 84, 222, 340, 558, 188, 591, 192, 388, 332, 214, 44, 780, 630],
  sa: [76, 32, 152, 170, 604, 862, 218, 68, 600, 858, 328, 740, 238],
  eu: [8, 40, 56, 70, 100, 191, 196, 203, 208, 233, 246, 250, 276, 300, 348, 352, 372, 380, 428, 440, 442, 498, 499, 528, 578, 616, 620, 642, 688, 703, 705, 724, 752, 756, 807, 826, 112, 804],
  af: [12, 24, 72, 108, 120, 140, 148, 178, 180, 204, 226, 231, 232, 262, 266, 270, 288, 324, 384, 404, 426, 430, 434, 450, 454, 466, 478, 504, 508, 516, 562, 566, 624, 646, 686, 694, 706, 710, 716, 728, 729, 732, 748, 768, 788, 800, 818, 834, 854, 894],
  ru: [643],
  as: [4, 31, 50, 51, 64, 96, 104, 116, 144, 156, 158, 268, 356, 360, 364, 368, 376, 392, 398, 400, 408, 410, 414, 417, 418, 422, 458, 496, 512, 524, 586, 608, 626, 634, 682, 704, 760, 762, 764, 784, 792, 795, 860, 887, 275],
  oc: [36, 554, 598, 90, 242, 548, 540],
};
const NAME_REGION = { Kosovo: "eu", "N. Cyprus": "as", Somaliland: "af" };
const ANTARCTIC_IDS = new Set([10, 260]);
const CODE_REGION = {};
for (const [reg, arr] of Object.entries(REGION_CODES)) for (const c of arr) CODE_REGION[c] = reg;

const fc = feature(topo, topo.objects.countries);
const byRegion = { na: [], sa: [], eu: [], af: [], ru: [], as: [], oc: [] };
const neutral = [], antarctic = [];
for (const f of fc.features) {
  const code = Number(f.id);
  if (ANTARCTIC_IDS.has(code)) { antarctic.push(f); continue; }
  const reg = CODE_REGION[code] || NAME_REGION[f.properties && f.properties.name];
  if (reg) byRegion[reg].push(f); else neutral.push(f);
}

const projection = geoNaturalEarth1().fitExtent([[14, 18], [986, 470]], fc);
const pathGen = geoPath(projection);
const fcOf = (feats) => ({ type: "FeatureCollection", features: feats });

export const REGION_PATHS = {};
export const CENTROIDS = {};
for (const id of REGION_GEO_IDS) {
  const feats = byRegion[id];
  REGION_PATHS[id] = feats.map((f) => pathGen(f)).join(" ");
  const c = projection(geoCentroid(fcOf(feats)));
  CENTROIDS[id] = [Math.round(c[0] * 10) / 10, Math.round(c[1] * 10) / 10];
}
export const NEUTRAL_PATH = neutral.map((f) => pathGen(f)).join(" ");
export const ANTARCTICA_PATH = antarctic.map((f) => pathGen(f)).join(" ");

/* tree / structure slots: sample on-land pixels per region */
export const SLOTS = {};
for (const id of REGION_GEO_IDS) {
  const region = fcOf(byRegion[id]);
  const b = pathGen.bounds(region);
  const slots = [];
  const gx = 7, gy = 6;
  for (let j = 1; j < gy; j++) for (let i = 1; i < gx; i++) {
    const x = b[0][0] + ((b[1][0] - b[0][0]) * i) / gx;
    const y = b[0][1] + ((b[1][1] - b[0][1]) * j) / gy;
    const ll = projection.invert([x, y]);
    if (ll && geoContains(region, ll)) slots.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
  SLOTS[id] = slots.length ? slots : [CENTROIDS[id]];
}

export const DIST = (() => {
  const d = {}; let max = 0;
  for (const a of REGION_GEO_IDS) { d[a] = {}; for (const b of REGION_GEO_IDS) { const v = Math.hypot(CENTROIDS[a][0] - CENTROIDS[b][0], CENTROIDS[a][1] - CENTROIDS[b][1]); d[a][b] = v; if (v > max) max = v; } }
  for (const a in d) for (const b in d[a]) d[a][b] /= max;
  return d;
})();

export const projLatY = (lat) => projection([0, lat])[1];
