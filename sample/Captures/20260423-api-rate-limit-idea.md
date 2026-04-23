---
title: 'Rate limit idea: leaky bucket per IP + user'
tags:
- engineering
- waypoint
- idea
created_at: 2026-04-23T09:14:00Z
---

Two buckets, not one. Protects against both the **noisy tenant** and the **scraper on a VPS**.

- Per-IP: 120 req/min, burst 20
- Per-user: 300 req/min, burst 40

Middleware sketch:

```ts
const allowed = await Promise.all([
  bucket.consume(`ip:${req.ip}`, 1),
  bucket.consume(`user:${req.userId ?? "anon"}`, 1),
]);
if (allowed.includes(false)) return res.status(429).end();
```

Open question: where does the bucket live? Redis is the obvious answer but I'd rather not add it just for this. Check if the existing Postgres can take it with `pg_stat_statements`-style counters first.
