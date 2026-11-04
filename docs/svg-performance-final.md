**Reconciled web SVG optimization batch — 2026-11-04**

**Playback improvements reproduce against latest fetched main; the earlier consistent zoom and startup gains do not reproduce in this rerun. The every-run 60 FPS target remains unmet.** Branch `codex/svg-performance-final` now includes upstream main **`c0274ba`** (#254). The CSS asset-version conflict in `index.html` is resolved, with synchronized content hashes. Main's compact mobile header and single-row collapsed chronicle bar are retained alongside the SVG optimizations. All 16 validation groups pass, including unchanged onboarding and paired feature/responsive checks.

The fresh measured source is **`8050ef3`**, compared with unmodified **`c0274ba`**. Controller `c41b76fb` is unchanged from the selected SVG implementation; reconciled CSS is `f6b79d42`. The production diff against main is still limited to `js/app.js`, `css/style.css` and the timeline wrapper/asset versions in `index.html`. No iOS, data, locale, quiz or topic-page source changes are introduced. Both roots use the same 190 snapshot entries, 189 concrete snapshots and 498 historical milestones.

These are fresh, separate cohorts. The earlier `d54411d` report and packaged evidence remain in [branch history](https://github.com/xcv58/jiangshan-map/blob/2e2f08afb65df47a558bd27996a7ade71fd855b0/docs/svg-performance-final.md), with original raw evidence preserved in `../jiangshan-map-svg-final-review`. Those older results are not pooled with this rerun or presented as measurements of the reconciled runtime.

**Local comparison.** Both LAN pages serve the reconciled roots. An identical preview-only helper waits for fonts/snapshots and a settled camera, then starts real 4× playback from 750. Space pauses/resumes; reload restarts. Compare one foreground tab at a time. The helper is absent from measured loopback pages and production HTML.

- [Latest main — c0274ba](http://192.168.8.31:8826/?year=750&compareplay=1)
- [Reconciled SVG optimization](http://192.168.8.31:8827/?year=750&compareplay=1)

**Repeated actual FPS.** Three alternating pairs per workload use visible Chrome 156.0.8078.79 on Apple M4 / 16 GiB, a 1280×720 CSS viewport, DPR 2 and the default Metal/Graphite backend. Pan/zoom use trusted four-second input; playback runs real 4× event playback for ten seconds. Chrome presented-page-frame feedback is cross-checked against display feedback with the unchanged parser. There is no synthetic animation, RAF FPS proxy, hidden footer, skipped event or graphics-backend override. Values are medians with full ranges; all observations are retained.

| Workload | Main c0274ba FPS | Reconciled SVG FPS |
| --- | ---: | ---: |
| Pan | 60.06 (58.30–60.12) | 59.95 (59.93–60.04) |
| Zoom | 43.89 (38.77–46.69) | 43.22 (39.87–56.69) |
| Playback | 46.08 (45.23–47.25) | 58.13 (58.08–58.38) |

Playback improves in all three pairs; the lowest optimized observation exceeds the highest main observation. Pan remains approximately 60 FPS. Zoom does not improve consistently: it is slower in two of three primary pairs, including the slow first run, and the candidate median is slightly lower. The captured cohort below is stronger for zoom, but does not replace these primary results. The individual primary zoom pairs are:

| Repeat | Main zoom FPS | Reconciled SVG zoom FPS |
| --- | ---: | ---: |
| 1 | 43.89 | 39.87 |
| 2 | 38.77 | 56.69 |
| 3 | 46.69 | 43.22 |

Playback frame-interval p95 improves **50.000 → 16.668 ms**. Its candidate maximum gaps remain approximately **83.3 ms**, so higher average FPS does not eliminate every hitch. Primary candidate minima are **59.93 pan, 39.87 zoom and 58.08 playback FPS**. Both cohorts retain literal `target.passed=false`; rounding and the stronger captured zoom result do not change acceptance. [Raw primary cohort](performance/svg-final-frames.json.gz), [verified analysis](performance/svg-final-frames-analysis.json.gz).

**Independent native capture.** ScreenCaptureKit/GPU traces are collected in a separate three-pair cohort to keep capture overhead out of the primary comparison. Changed pixels in the map ROI exclude footer and browser chrome. They are independent of Chrome feedback, but describe observed content changes rather than physical photon FPS or every-layer freshness. Capture can coalesce samples; still content can be intentional, and the first change has one-sample boundary uncertainty. Values below are changed samples per second, kept separate from Chrome FPS.

| Workload | Main native changes, Hz | Reconciled native changes, Hz |
| --- | ---: | ---: |
| Pan | 59.69 (56.72–59.75) | 59.74 (59.46–59.83) |
| Zoom | 37.73 (37.45–38.72) | 50.43 (40.85–53.08) |
| Playback | 47.38 (46.30–48.25) | 58.21 (58.07–58.27) |

Captured Chrome feedback also remains separate: zoom **38.22 → 55.59 FPS** (candidate range 41.10–56.78); playback **47.68 → 58.11 FPS**. Captured zoom improves in all three pairs, but primary zoom remains mixed. All 12 playback observations across the separate cohorts visit the same **22 historical event years, 751 through 885**. [Captured cohort](performance/svg-final-native.json.gz), [native/GPU analysis](performance/svg-final-native-analysis.json.gz), [native metadata archive](performance/svg-final-native-captures.json.gz).

The trace audit finds no >50 ms main-thread long tasks in any primary candidate zoom run. Input-driver durations are about 4.03 seconds and final camera/wheel deltas are verified. Across all six captured zoom traces, the recorded Dawn scheduling waits remain below 0.8 ms individually, with no >=8 ms overlap counted. This does not identify the cause of the variable zoom cadence or isolate SVG repainting from host/browser scheduling. Main and host conditions changed since the older cohort; these observations do not establish which change caused the difference.

**Startup and memory.** Three alternating fresh-browser pairs are collected after both FPS cohorts. Readiness requires complete snapshots, loaded UI fonts and a settled year-1415 camera. Separate interaction samples are taken every 250 ms. Values are medians with full ranges; memory is MiB.

| Metric | Main c0274ba | Reconciled SVG |
| --- | ---: | ---: |
| Full-scene ready, ms | 912.0 (909.4–921.8) | 913.9 (901.7–958.7) |
| First contentful paint, ms | 416.0 (392.0–420.0) | 408.0 (388.0–412.0) |
| Startup main-page JS heap | 14.30 (14.30–14.30) | 13.96 (13.96–13.96) |
| Peak sampled main-page JS heap | 41.36 (35.17–41.69) | 30.08 (29.92–33.73) |
| Main-page JS heap after interactions | 22.62 (22.33–22.62) | 20.49 (20.31–20.61) |
| Startup owned-process RSS | 1481.72 (1319.08–1486.61) | 1488.92 (1486.14–1496.92) |
| Peak sampled owned-process RSS | 1621.09 (1608.11–1670.56) | 1606.20 (1523.91–1655.16) |
| Owned-process RSS after interactions | 1539.39 (1526.55–1567.33) | 1463.84 (1438.80–1555.20) |

Startup is effectively flat in this rerun: the candidate is faster in only one of three pairs and its median is slightly higher. No startup improvement is established. Peak sampled main-page JS heap is lower in all three pairs. Peak process RSS is lower in median but ranges overlap and one pair is higher, so no consistent total-memory reduction is established. Browser/application profiles are fresh, but OS/font/network caches and host load are uncontrolled. Main-page heap excludes worker isolates; summed RSS can double-count shared pages and does not measure unique physical or total GPU memory. [All six observations and resource timing](performance/svg-final-memory.json.gz).

**Changes retained.** The aggregate selected SVG optimization remains in place against the reconciled main:

- Cache repeated geometry/boundary work and dictionary availability while retaining exact predicates and source data.
- Reuse unchanged SVG polity/region nodes, avoid redundant attribute writes and suppress only labels safely outside the viewport. Revealed labels receive the current scale before painting.
- Reuse a bounded painted SVG plane during translation, with 256 CSS px overscan and canonical camera commits on rebase, zoom, resize and settle. Logical hit tests and callouts retain their coordinates.
- Lazily prepare upcoming boundary/polity paths in a worker, preserving cancellation, stale-result rejection and capability fallbacks.
- Move the timeline playhead by transform and isolate changing surfaces from the unchanged frosted backdrop. Existing 220 ms easing, controls, labels, hints and onboarding remain.

Pan layout totals fall **250.31 → 71.07 ms** per four seconds. Primary playback long tasks fall from median **5 → 0**, and dropped-frame reports from **9.44% → 0.33%**. Aggregate paint totals process different numbers of frames and do not isolate per-frame cost or an individual optimization. No WebGL/MapLibre dependency, rejected SVG trial or city-detail feature is included.

**Feature, onboarding and responsive verification.** All **16 validation groups pass**: assets; full atlas/40 CUJs; geometry equivalence; worker lifecycle/capability fallbacks; exact SVG scenes; camera/pointer/mobile pinch; bounded-plane rebasing/layer reuse; viewport labels; callouts; paired feature flows; timeline/onboarding; responsive controls; Chrome/native parser fixtures; evidence-tooling regressions; and LAN preview/source checks. [Complete verification record](performance/svg-final-verification.json.gz).

Geometry remains byte-identical across 189 concrete snapshots, with 16,433 anchor comparisons and six margin/threshold fixtures. Complete scenes match in forward/reverse order. Paired feature checks cover person search and pins, routes, place history, English/Traditional Chinese, polity links, quiz answer/next/exit, embed, real playback and year navigation. First-visit onboarding DOM/hints, timeline ARIA and the existing easing remain equivalent. The upstream compact header and collapsed/expanded chronicle behavior are retained; canonical atlas bundles and topology baseline also pass local publication checks.

Responsive checks compare both versions at **320×568, 390×844, 640×900, 768×1024, 900×640, 1024×768, 1280×720, 1440×900 and 1920×1080**, followed by orientation changes. Trusted interactions exercise layers, chronology panels, timeline/year navigation, pan, zoom and reset. Control geometry agrees within 0.51 CSS px, final cameras within 0.1 world unit, with no new horizontal overflow. These are emulated viewport/touch checks, not physical-phone or Safari FPS/INP measurements.

Six refreshed screenshots come from the reconciled paired responsive run. They are full, unmasked and unaligned; animations are frozen only for deterministic visual QA, never for FPS collection. Mean RGB difference is **0.0818–0.1802 / 255**; **0.0246–0.0374%** of pixels differ by >16 in a channel. This is close static rendering, not pixel identity during motion. [Hashes and pixel comparisons](performance/svg-final-screenshots.json).

- Desktop: [main](performance/svg-final-main-1280x720.png), [optimized](performance/svg-final-optimized-1280x720.png).
- Tablet: [main](performance/svg-final-main-768x1024.png), [optimized](performance/svg-final-optimized-768x1024.png).
- Phone: [main](performance/svg-final-main-390x844.png), [optimized](performance/svg-final-optimized-390x844.png).

**Recorded host conditions.** The user relaunched Jellyfin before measurement; neither service was stopped or altered during collection. Jellyfin PID 12908 and LogiPluginService PID 81073 are present in all 84 before/after host observations. Observed CPU: Jellyfin **0.20 (0.00–1.00)%**; LogiPluginService **0.00 (0.00–16.30)%**. One-minute load is **12.16 (8.48–31.18)**, substantially more variable/higher than in the old cohort. Load is context, not proof of causality or CPU/GPU utilization. Do not pool this rerun with older measurements.

**Evidence and reproduction.** Runtime sources were committed before validation/measurement. Served assets are checked before and after collection and again offline. The assembler verifies all 36 trace digests, recomputes FPS using the unchanged counter, aligns 18 native captures, retains six startup/memory observations and checks all validation/measurement script and log hashes. The fresh-run guards accepted completed target failures while rejecting stale/incomplete output in 13 offline regression cases; new native paths are relative, with relocated legacy captures supported by both analyzers. Historical tool versions are resolved by exact contents in branch history. All raw traces, captures and screenshots for this rerun are preserved in `../jiangshan-map-svg-final-c0274ba-review`; old raw evidence remains in its original directory. No low samples were removed or replaced.

Detailed evidence is packaged as compressed JSON; the [readable summary](performance/svg-final-summary.json) retains full ranges and acceptance. Defaults are pinned to `c0274ba`, loopback ports 8824/8825 and a fresh review directory. LAN previews keep both footers visible on 8826/8827. The native helper is a macOS measurement CLI under `scripts/`, not an iOS app or runtime dependency.

```sh
# Serve unmodified c0274ba and the reconciled optimized checkout:
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
  ../jiangshan-map-svg-final-c0274ba-review docs/performance
```

Build the native helper with `xcrun swiftc -O -parse-as-library -swift-version 5 scripts/capture_window_frames.swift -o /tmp/capture-window`; it requires existing screen-recording access. Supply `WEB_BASE_REF=c0274ba` and a separate `SVG_REVIEW_DIR` explicitly to preserve an existing collection when rerunning. The runner continues after a fresh, completed 60 FPS acceptance failure while refusing collection errors or changed validated sources.
