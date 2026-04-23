---
title: "Incident playbook — launch week edition"
tags: [engineering, ops, waypoint]
created_at: "2026-04-17T13:00:00Z"
---

# Incident playbook

Written specifically for the two weeks around launch, when traffic is unpredictable and I'll be sleep-deprived.

## Severity ladder

| Level | Definition                                   | First action              |
| ----- | -------------------------------------------- | ------------------------- |
| SEV-1 | Signup or pay fails for any user             | Page me immediately       |
| SEV-2 | App unusable for >10% of sessions            | Page me within 15 min     |
| SEV-3 | Feature degraded, app still usable           | Email alert, wake me if asleep |
| SEV-4 | Cosmetic or edge-case bug                    | Morning-of fix            |

## Top three likely fires

### 1. Tile server overloaded

Symptom: map loads slow, `/tiles/*` 5xx.

- [ ] Flip `CDN_ONLY=1` on Fly to bypass the origin tile service.
- [ ] Verify on a real route.
- [ ] Status page: "Map tiles are degraded, we're working on it."

### 2. Stripe webhook backlog

Symptom: paid users stuck on the free tier.

- [ ] Check Stripe dashboard → Webhooks for retry queue length.
- [ ] If >50 pending, trigger manual `POST /hooks/reconcile` (see `ops/runbooks/billing.md`).
- [ ] Email affected users with a personal apology.

### 3. Signup flow broken (most common in launches)

Symptom: `/signup` 500s.

- [ ] Rollback to previous deploy — `fly deploy --image <previous-sha>`.
- [ ] Post status update.
- [ ] Investigate the next morning, not at 2 AM.

## Rule I will follow

> Rollback first, diagnose second. Every launch I've seen that went sideways did so because someone tried to fix forward under pressure.
