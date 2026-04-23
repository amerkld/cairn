---
title: Waypoint v1 — launch overview
tags:
- launch
- waypoint
- planning
deadline: 2026-05-15
created_at: 2026-04-10T08:00:00Z
---

# Waypoint v1 Launch

The plan to take Waypoint out of private beta and into the open.

## Objective

Ship a polished v1 to the public by **May 15, 2026** with at least 500 signups in the first two weeks and a Product Hunt launch that doesn't embarrass anyone.

## Timeline

| Week of      | Focus                                            | Owner |
| ------------ | ------------------------------------------------ | ----- |
| Apr 20       | Final feature freeze + bug burn-down             | Sam   |
| Apr 27       | Marketing assets, landing page polish, press kit | Sam   |
| May 04       | Private beta → public beta, price-page live      | Sam   |
| May 11       | Product Hunt day + post-launch support           | Sam   |

## Launch checklist

- [x] Offline trail sync merged
- [x] Rate limiting in place (see `Captures/20260423-api-rate-limit-idea.md`)
- [ ] Onboarding email sequence (3 emails)
- [ ] Pricing page ships with annual toggle
- [ ] Press kit — screenshots, logo variants, 150-word blurb
- [ ] Domain + Plausible analytics ready
- [ ] `/status` page pointing at uptime monitor

## Stakeholders

- **Amer** — everything. Sole builder.
- **Beta cohort (15 people)**: getting a thank-you note + 50% off for year one.
- **Ahmad**: just here for the music bot

## Risks

> The only risks I can't fix in a weekend are the ones I haven't identified.

1. Mapbox tile costs spike under real traffic — monitoring set up, but a budget alert would be wise.
2. Apple review on the iOS companion is slower than hoped — *not a blocker for web launch*.
3. The onboarding email sequence isn't written yet. See Actions.

## Links

- Product Hunt draft: https://www.producthunt.com/
- Beta feedback doc: see `beta-feedback-synthesis.md`
- Pricing page WIP: https://waypoint.test/pricing
