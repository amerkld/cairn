---
title: "Launch day runbook — May 11, 2026"
tags: [marketing, launch, runbook]
created_at: "2026-04-16T09:00:00Z"
---

# Launch day runbook

Minute-by-minute for May 11. Everything that should happen is written down so I don't have to think on the day.

## T-1 (Sunday May 10)

- [ ] Final production deploy locked by 6 PM PT
- [ ] Tweets scheduled in Typefully
- [ ] Product Hunt listing published and *marked for Monday*
- [ ] Status page reviewed, on-call phone has notifications on
- [ ] Early bedtime — no debugging tonight

## Launch day

| Time (PT) | What happens                                                | Channel link                              |
| --------- | ----------------------------------------------------------- | ----------------------------------------- |
| 00:01     | Product Hunt goes live automatically                        | `Channels/product-hunt.md`                |
| 06:00     | Wake up, check PH rank, reply to early comments             | —                                         |
| 08:00     | *Show HN* post goes up                                      | `Channels/hacker-news.md`                 |
| 09:00     | Launch tweet + email to newsletter list                     | —                                         |
| 10:00     | First check-in with monitoring — traffic baseline           | Grafana                                   |
| 12:00     | Reply sweep (PH, HN, Twitter)                               | —                                         |
| 15:00     | Second monitoring check — anticipate peak around now        | Grafana                                   |
| 18:00     | Thank-you note to anyone who wrote a blog / newsletter      | —                                         |
| 22:00     | Close the laptop. Tomorrow exists.                          | —                                         |

## Contingencies

> A launch is not the right day to discover your alerting doesn't work.

- **Traffic spike crashes tiles server** → flip the CDN-only fallback, disables live POI layer but map loads.
- **Payments break** → Stripe dashboard, retry queue, email affected users personally within 2 hours.
- **HN thread goes sideways** → don't argue. Answer technical questions, let the rest pass.
