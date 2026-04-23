---
title: "Architecture overview — for the blog"
tags: [engineering, docs, waypoint]
created_at: "2026-04-09T15:00:00Z"
---

# Waypoint — how it's built

Drafted for a "how we shipped" blog post after launch. Keep it honest — this is a small app and its architecture should reflect that.

## Stack at a glance

- **Client**: Tauri shell (macOS, Windows, Linux) + React + TypeScript. iOS companion is a separate native app.
- **Server**: a single Go service on Fly.io, Postgres on Neon, Cloudflare R2 for tiles.
- **Tiles**: Mapbox for vector tiles, a nightly job that pre-bakes route-neighborhood tiles into R2 for offline use.

## The interesting parts

### 1. Route-aware tile prefetch

When you save a route, a background job computes a 500m-wide corridor along the line and pulls down every tile inside it at zoom 12–16. This is the single reason offline actually feels good — the naïve approach (prefetch the viewport) misses the tiles you'll actually need.

### 2. Local-first with LWW

Every edit is written locally first and replayed to the server on reconnect. Conflicts resolve last-write-wins using a UTC timestamp from the client. Not perfect but the domain tolerates it — nobody edits the same route from two devices simultaneously.

### 3. Elevation as compressed HGT

SRTM data in `.hgt.zip` files, stored per 1°×1° tile in R2. Resolves a point in ~5ms after cold start. Beats round-tripping an elevation API and survives being offline.

## Things that aren't interesting on purpose

- The auth stack is boring (cookies for web, bearer for mobile).
- The payments stack is boring (Stripe Checkout + customer portal).
- The email stack is boring (transactional provider, no custom templating).

## Post-launch tech debt (ordered by pain)

1. Search is literal-prefix only. Should do ICU normalization.
2. The tile LRU uses `localStorage`, which has a 5MB ceiling on some browsers. Move to IndexedDB.
3. No observability on the sync loop beyond logs. Add structured metrics.
