---
title: 'Dan''s question: cookies vs JWT for the new API'
tags:
- engineering
- inbox
created_at: 2026-04-20T15:22:00Z
---

Dan asked over lunch: *for the Waypoint public API, cookies or bearer JWT?*

Quick take without thinking too hard:

- **Cookies** win if the API is browser-first and same-origin. `SameSite=Lax`, HttpOnly, CSRF token, done.
- **JWT** wins if clients are mobile / third-party / server-to-server.

Waypoint's API is both. So: cookies for the first-party web app, bearer for everything else. Same identity backend issues either.

Reply to Dan: this week, not today.
