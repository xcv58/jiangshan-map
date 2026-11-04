**Reconciled web SVG optimization batch — 2026-11-04**

**Playback improves in 3/3 primary pairs; zoom improves in 3/3; startup is faster in 3/3. The every-run 60 FPS target remains unmet.** Branch `codex/svg-performance-final` includes latest fetched upstream main **`ae8a422`** (#254 and #256). Both HTML asset conflicts are resolved with synchronized content hashes. Main's compact mobile header, single-row collapsed chronicle bar and corrected Sakhalin polygons are retained alongside the SVG optimizations. All 16 validation groups pass, including onboarding and paired feature/responsive checks.

The fresh measured source is **`376573a`**, compared with unmodified **`ae8a422`**. Controller `c41b76fb` is unchanged from the selected SVG implementation; reconciled CSS is `f6b79d42` and snapshot bundle `77b4b705`. The production diff against main is still limited to `js/app.js`, `css/style.css` and the timeline wrapper/asset versions in `index.html`. No iOS, data, locale, quiz or topic-page source changes are introduced relative to main. Both roots use the same 190 snapshot entries, 189 concrete snapshots and 498 milestones.

These are fresh, separate cohorts. The [original d54411d report](https://github.com/xcv58/jiangshan-map/blob/2e2f08afb65df47a558bd27996a7ade71fd855b0/docs/svg-performance-final.md) and [c0274ba checkpoint](https://github.com/xcv58/jiangshan-map/blob/0614644/docs/svg-performance-final.md) remain in branch history. Their raw archives remain in `../jiangshan-map-svg-final-review` and `../jiangshan-map-svg-final-c0274ba-review`. The second reconciliation was necessary because #256 changed the startup/geometry dataset during the first rerun. Earlier results are not pooled with this final cohort or substituted for any low sample.

**Local comparison.** Both LAN pages serve the reconciled roots. An identical preview-only helper waits for fonts/snapshots and a settled camera, then starts real 4× playback from 750. Space pauses/resumes; reload restarts. Compare one foreground tab at a time. The helper is absent from measured loopback pages and production HTML.

- [Latest main — ae8a422](http://192.168.8.31:8826/?year=750&compareplay=1)
- [Reconciled SVG optimization](http://192.168.8.31:8827/?year=750&compareplay=1)

**Repeated actual FPS.** Three alternating pairs per workload use visible Chrome 156.0.8078.79 on Apple M4 / 16 GiB, 1280×720 CSS viewport, DPR 2 and default Metal/Graphite. Pan/zoom use trusted four-second input; playback runs real 4× event playback for ten seconds. Chrome presented-page-frame feedback is cross-checked against display feedback using the unchanged parser. There is no synthetic animation, RAF FPS proxy, hidden footer, skipped event or graphics-backend override. Values are medians with full ranges; all observations are retained.

| Workload | Main ae8a422 FPS | Reconciled SVG FPS |
| --- | ---: | ---: |
| Pan | 59.82 (59.82–59.87) | 60.05 (59.95–60.08) |
| Zoom | 40.37 (37.43–41.91) | 57.41 (57.38–57.74) |
| Playback | 45.88 (45.09–47.77) | 57.68 (57.44–57.97) |

Playback improves in 3 of three primary pairs. Pan remains approximately 60 FPS. Zoom improves in every primary pair in this cohort. The captured cohort remains separate. Individual primary zoom pairs are:

| Repeat | Main zoom FPS | Reconciled SVG zoom FPS |
| --- | ---: | ---: |
| 1 | 37.43 | 57.38 |
| 2 | 41.91 | 57.74 |
| 3 | 40.37 | 57.41 |

Playback frame-interval p95 is **50.000 → 16.668 ms**. Its candidate maximum gap ranges **66.668–83.331 ms**, so higher average FPS does not eliminate every hitch. Primary candidate minima are **59.95 pan, 57.38 zoom and 57.44 playback FPS**. Both cohorts retain literal `target.passed=false`; rounding does not change acceptance. [Raw primary cohort](performance/svg-final-frames.json.gz), [verified analysis](performance/svg-final-frames-analysis.json.gz).

**Independent native capture.** ScreenCaptureKit/GPU traces use a separate three-pair cohort to keep capture overhead out of the primary comparison. Changed pixels in the map ROI exclude footer and browser chrome. They are independent of Chrome feedback, but describe observed content changes rather than physical photon FPS or every-layer freshness. Capture can coalesce samples; still content can be intentional, and the first change has one-sample boundary uncertainty. Values below are changed samples per second, kept separate from Chrome FPS.

| Workload | Main native changes, Hz | Reconciled native changes, Hz |
| --- | ---: | ---: |
| Pan | 59.84 (59.60–59.95) | 60.09 (60.01–60.16) |
| Zoom | 42.21 (37.96–45.17) | 53.34 (52.50–56.25) |
| Playback | 46.47 (45.97–49.06) | 58.37 (57.78–58.51) |

Captured Chrome feedback also remains separate: zoom **43.19 → 57.48 FPS** (candidate range 56.45–58.03); playback **47.26 → 58.08 FPS**. Captured zoom improves in 3/3 pairs; primary zoom improves in 3/3. All 12 playback observations visit the same **22 event years, 751 through 885**. [Captured cohort](performance/svg-final-native.json.gz), [native/GPU analysis](performance/svg-final-native-analysis.json.gz), [native metadata archive](performance/svg-final-native-captures.json.gz).

The trace audit records candidate primary zoom long-task counts of [0, 0, 0]. Zoom input-driver durations are 4.032–4.033 seconds, and final camera/wheel deltas are verified. The largest recorded individual Dawn scheduling wait across captured zoom traces is 1.144 ms, with 0 feedback gaps overlapping a >=8 ms wait. These categories do not isolate the cause of a cadence change or prove GPU saturation. Main and host conditions changed between cohorts; earlier performance differences cannot be attributed to one cause from these observations.

**Startup and memory.** Three alternating fresh-browser pairs follow both FPS cohorts. Readiness requires complete snapshots, loaded UI fonts and a settled year-1415 camera. Separate interaction samples are taken every 250 ms. Values are medians with full ranges; memory is MiB.

| Metric | Main ae8a422 | Reconciled SVG |
| --- | ---: | ---: |
| Full-scene ready, ms | 907.5 (875.0–912.5) | 883.7 (852.3–908.8) |
| First contentful paint, ms | 384.0 (384.0–404.0) | 404.0 (376.0–424.0) |
| Startup main-page JS heap | 14.31 (14.30–14.31) | 13.97 (13.82–13.97) |
| Peak sampled main-page JS heap | 46.01 (32.70–47.48) | 32.19 (30.89–32.21) |
| Main-page JS heap after interactions | 22.62 (22.55–47.48) | 20.23 (20.16–20.46) |
| Startup owned-process RSS | 1468.97 (1301.11–1474.19) | 1490.03 (1275.61–1490.39) |
| Peak sampled owned-process RSS | 1614.86 (1585.31–1619.72) | 1587.88 (1556.53–1597.42) |
| Owned-process RSS after interactions | 1557.88 (1502.88–1566.30) | 1538.03 (1507.23–1556.17) |

Startup is faster in 3/3 pairs, peak sampled main-page JS heap is lower in 3/3, and peak owned-process RSS is lower in 2/3. Full ranges and individual runs are retained; small or mixed differences do not establish a consistent benefit. Browser/application profiles are fresh, but OS/font/network caches and host load are uncontrolled. Main-page heap excludes worker isolates; summed RSS can double-count shared pages and does not measure unique physical or total GPU memory. [All six observations and resource timing](performance/svg-final-memory.json.gz).

**Changes retained.** The aggregate selected SVG optimization remains in place against the reconciled main:

- Cache repeated geometry/boundary work and dictionary availability while retaining exact predicates and source data.
- Reuse unchanged SVG polity/region nodes, avoid redundant attribute writes and suppress only labels safely outside the viewport. Revealed labels receive the current scale before painting.
- Reuse a bounded painted SVG plane during translation, with 256 CSS px overscan and canonical camera commits on rebase, zoom, resize and settle. Logical hit tests and callouts retain their coordinates.
- Lazily prepare upcoming boundary/polity paths in a worker, preserving cancellation, stale-result rejection and capability fallbacks.
- Move the timeline playhead by transform and isolate changing surfaces from the unchanged frosted backdrop. Existing 220 ms easing, controls, labels, hints and onboarding remain.

Pan layout totals are **246.18 → 79.62 ms** per four seconds. Primary playback long tasks have median **3 → 0**, and dropped-frame reports **8.44% → 0.33%**. Aggregate paint totals process different numbers of frames and do not isolate per-frame cost or an individual optimization. No WebGL/MapLibre dependency, rejected SVG trial or city-detail feature is included.

**Feature, onboarding and responsive verification.** All **16 validation groups pass**: assets; full atlas/40 CUJs; geometry equivalence; worker lifecycle/capability fallbacks; exact SVG scenes; camera/pointer/mobile pinch; bounded-plane rebasing/layer reuse; viewport labels; callouts; paired feature flows; timeline/onboarding; responsive controls; Chrome/native parser fixtures; evidence-tooling regressions; and LAN preview/source checks. [Complete verification record](performance/svg-final-verification.json.gz).

Geometry remains byte-identical across 189 concrete snapshots, with 16,433 anchor comparisons and six margin/threshold fixtures. Complete scenes match in forward/reverse order. Paired feature checks cover person search and pins, routes, place history, English/Traditional Chinese, polity links, quiz answer/next/exit, embed, real playback and year navigation. First-visit onboarding DOM/hints, timeline ARIA and the existing easing remain equivalent. The upstream compact header and collapsed/expanded chronicle behavior are retained; canonical atlas bundles and topology baseline also pass local publication checks.

Responsive checks compare both versions at **320×568, 390×844, 640×900, 768×1024, 900×640, 1024×768, 1280×720, 1440×900 and 1920×1080**, followed by orientation changes. Trusted interactions exercise layers, chronology panels, timeline/year navigation, pan, zoom and reset. Control geometry agrees within 0.51 CSS px, final cameras within 0.1 world unit, with no new horizontal overflow. These are emulated viewport/touch checks, not physical-phone or Safari FPS/INP measurements.

Six refreshed screenshots come from the final paired responsive run. They are full, unmasked and unaligned; animations are frozen only for deterministic visual QA, never for FPS collection. Mean RGB difference is **0.0817–0.1802 / 255**; **0.0241–0.0380%** of pixels differ by >16 in a channel. This is close static rendering, not pixel identity during motion. [Hashes and pixel comparisons](performance/svg-final-screenshots.json).

- Desktop: [main](performance/svg-final-main-1280x720.png), [optimized](performance/svg-final-optimized-1280x720.png).
- Tablet: [main](performance/svg-final-main-768x1024.png), [optimized](performance/svg-final-optimized-768x1024.png).
- Phone: [main](performance/svg-final-main-390x844.png), [optimized](performance/svg-final-optimized-390x844.png).

**Recorded host conditions.** The user relaunched Jellyfin before the comparison work; neither service was stopped or altered during collection. Jellyfin PID(s) [12908] and LogiPluginService PID(s) [81073] are present in all 84 host observations. Observed CPU: Jellyfin **0.20 (0.00–1.10)%**; LogiPluginService **0.00 (0.00–12.40)%**. One-minute load is **7.56 (3.64–16.65)**. Load is context, not proof of causality or CPU/GPU utilization. Do not pool this rerun with older measurements.

**Evidence and reproduction.** Runtime sources were committed before validation/measurement. Served assets are checked before and after collection and again offline. The assembler verifies all 36 trace digests, recomputes FPS using the unchanged counter, aligns 18 native captures, retains six startup/memory observations and checks all validation/measurement script and log hashes. The fresh-run guards accepted completed target failures while rejecting stale/incomplete output in 13 offline regression cases; new native paths are relative, with relocated legacy captures supported by both analyzers. Historical tool versions are resolved by exact contents in branch history. All raw traces, captures and screenshots for this rerun are preserved in `../jiangshan-map-svg-final-ae8a422-review`; old raw evidence remains in its original directory. No low samples were removed or replaced.

Detailed evidence is packaged as compressed JSON; the [readable summary](performance/svg-final-summary.json) retains full ranges and acceptance. Defaults are pinned to `ae8a422`, loopback ports 8824/8825 and a fresh review directory. LAN previews keep both footers visible on 8826/8827. The native helper is a macOS measurement CLI under `scripts/`, not an iOS app or runtime dependency.

```sh
# Serve unmodified ae8a422 and the reconciled optimized checkout:
node scripts/serve_web_benchmark.cjs MAIN_CHECKOUT OPTIMIZED_CHECKOUT

# LAN preview:
LAN_HOST=192.168.8.31 LAN_MAIN_ROOT=MAIN_CHECKOUT \
node scripts/serve_timeline_comparison.cjs

# Full verification (including LAN):
PLAYWRIGHT_PATH=/path/to/playwright \
LAN_MAIN_URL=http://192.168.8.31:8826/ \
LAN_CANDIDATE_URL=http://192.168.8.31:8827/ \
node scripts/check_svg_final.cjs

# Then collect sequentially, keeping Chrome visible/focused and services running:
PLAYWRIGHT_PATH=/path/to/playwright \
FRAME_CAPTURE_BINARY=/path/to/capture-window \
node scripts/check_svg_final.cjs --measure-only

# Offline only after timed collection:
node --expose-gc scripts/analyze_svg_final.cjs \
  ../jiangshan-map-svg-final-ae8a422-review docs/performance
```

Build the native helper with `xcrun swiftc -O -parse-as-library -swift-version 5 scripts/capture_window_frames.swift -o /tmp/capture-window`; it requires existing screen-recording access. Supply `WEB_BASE_REF=ae8a422` and a separate `SVG_REVIEW_DIR` explicitly to preserve an existing collection when rerunning. The runner continues after a fresh, completed 60 FPS acceptance failure while refusing collection errors or changed validated sources.
