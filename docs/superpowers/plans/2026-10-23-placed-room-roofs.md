# Player-built room roofs implementation plan

> Execute sequentially with executing-plans; request independent read-only review before delivery.

**Goal:** The actually earned rectangular camp room looks like an enterable roofed house outside and an operable cutaway inside, while saved costs, collision and assets stay authoritative.

**Architecture:** Extend existing house grouping with floor-component recognition, keep public groups unchanged, and reuse houseRenderer for recognized paid rooms. Cache only the current grouping in IsometricEngine; derive nothing in server persistence. TypeScript/Canvas/Vitest and existing owned-CDP QA.

- [ ] Add fail-first house tests using actual25-floor/24-boundary earned layout: complete room, floor-under-walls, holes, facing/owner/map separation, door/survival, adjacent shared-wall rooms. Add renderer assertions outside roof/inside cutaway/damage and public behavior.
- [ ] Implement geometric grouping and live floor references in house.ts, reuse renderer with optional paid-room metadata. No gifts or false roof on incomplete boundary.
- [ ] Add engine tests: authority array cache/current-map invalidation, live HP/open references, actual room drawing and storage hidden beneath opaque roof outside. Integrate cached groups, interior layers and caption.
- [ ] Verify focused tests with effective negative controls, full suite/type/build. Fix only demonstrated defects.
- [ ] Native continuation of same earned shelter DB: outside/inside screenshots, door/storage operation, restart; unchanged resource/building/ammo and consistent-backup restore audit. No concurrent load/tests during native run.
- [ ] Inspect images, export sanitized evidence/checkpoint and independent review; commit/pushsdh/main and verify remote SHA. Keep broad goal active and report limitations.
