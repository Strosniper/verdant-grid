# 🌱 Verdant Grid: Restoration

A multi-regional macro-environmental simulation. Steward seven global sectors —
North America, Europe, Russia, Asia, South America, Africa, and Oceania — through
a live cross-matrix engine of climate, biosphere, and civic-loyalty systems.

- **Win:** drive the global **Ecological Balance** to **100%**.
- **Lose:** let it fall to **0%**.
- Runs **auto-save** to your browser (localStorage) and resume where you left off.

## Tech

- React 18 + Vite. Single self-contained component (`src/VerdantGrid.jsx`), no UI libraries.

## Run locally

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev      # open the printed http://localhost:5173
npm run build    # production build into /dist
npm run preview  # preview the production build
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. On [vercel.com](https://vercel.com) → **Add New… → Project** → import the repo.
3. Vercel auto-detects Vite. Defaults are correct:
   - Build command: `npm run build`
   - Output directory: `dist`
4. **Deploy**. Every `git push` afterward redeploys automatically.

## Gameplay

Select a region, toggle policies, and watch effects ripple across the planet.
Policy strength is scaled by each region's **Civic Loyalty** — let loyalty fall
below 40% and illegal logging, poaching, and dumping surge. Cross **+1.5 °C** and
permafrost thaw permanently raises baseline CO₂.
