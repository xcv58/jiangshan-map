**Final web SVG optimization batch — 2026-11-04**

**The selected SVG implementation improves zoom and playback against current main, while preserving the tested features and onboarding. It does not meet 60 FPS in every run.** Work is prepared on local branch `codex/svg-performance-final`, based directly on fetched upstream main **`d54411d`** (2026-11-04). The production change is limited to `js/app.js`, `css/style.css` and the timeline wrapper/asset versions in `index.html`. No iOS, data, locale, quiz or topic-page source changes are introduced. The original dirty checkout and earlier experiments remain preserved; nothing is pushed.

The measured implementation is commit **`f4a70c2`**. Controller `c41b76fb` and CSS `eed7e3eb` retain the selected SVG implementation; the current main HTML/SEO and updated datasets are retained, with synchronized asset versions. Main now includes 190 snapshot entries, 189 concrete snapshots and 498 historical milestones. Both comparison roots use these same upstream data. These measurements are a new paired cohort, not a continuation or pooling of the earlier optimized-SVG/MapLibre comparisons.

**Local comparison.** The LAN server is detached from the terminal and binds only the current LAN address. Both pages include an identical preview-only startup helper, which waits for loaded fonts/snapshots and a settled camera, then starts real 4× playback from 750. Space pauses/resumes; reload restarts. Compare one foreground tab at a time. The helper is absent from measured loopback pages and the production HTML.

- [Latest main — d54411d](http://192.168.8.31:8826/?year=750&compareplay=1)
- [Final SVG optimization](http://192.168.8.31:8827/?year=750&compareplay=1)

**Repeated actual FPS.** Three alternating pairs per pan, zoom and playback workload use visible Chrome 156 on Apple M4 / 16 GiB, 1280×720 CSS viewport, emulated DPR 2, default Metal/Graphite backend. Trusted four-second pan/zoom input and ten seconds of real 4× playback are unchanged. Chrome presented-page-frame feedback is parsed with the original counter and cross-checked against display feedback. No synthetic animation, RAF FPS proxy, hidden footer, skipped events or graphics-backend override is introduced. Values are medians with full ranges.

| Workload | Current main FPS | Final SVG FPS |
| --- | ---: | ---: |
| Pan | 59.85 (59.84–59.92) | 59.97 (59.94–60.00) |
| Zoom | 40.68 (39.41–44.15) | 57.41 (57.01–58.04) |
| Playback | 46.34 (46.03–46.42) | 57.57 (57.36–57.96) |

All three paired zoom and playback comparisons improve; the lowest candidate exceeds the highest main observation for those workloads. Pan stays approximately 60 FPS. Zoom frame-interval p95 improves **33.334 → 16.668 ms**, and playback **50.000 → 16.668 ms**. Playback still has occasional **66.7–83.3 ms maximum gaps**, so higher average FPS does not eliminate every visible hitch. The candidate primary-run minima are **59.94 pan, 57.01 zoom and 57.36 playback**. The literal every-run 60 FPS result remains `passed=false`, including the 59.9983 pan observation; rounding does not change acceptance. [Raw browser cohort](performance/svg-final-frames.json.gz), [verified analysis](performance/svg-final-frames-analysis.json.gz).

Native ScreenCaptureKit/GPU tracing is collected in a separate cohort so capture overhead does not affect the primary comparison. Native counts observe actual changed pixels in the map ROI, excluding footer/browser chrome. They are independent of Chrome page feedback, but not physical photon FPS or proof that every map layer refreshed. Delivery may coalesce samples; holds can legitimately produce identical content, and the first changed sample carries boundary uncertainty. Values are changed samples per second.

| Workload | Current main native changes, Hz | Final SVG native changes, Hz |
| --- | ---: | ---: |
| Pan | 59.35 (59.24–59.80) | 59.87 (59.84–59.95) |
| Zoom | 36.45 (35.77–38.97) | 53.23 (51.72–53.50) |
| Playback | 46.91 (45.75–47.94) | 58.34 (57.80–58.43) |

Both independent native zoom/playback ranges separate from their controls. Captured Chrome feedback remains separate: zoom **36.75 → 57.18 FPS**, playback **47.70 → 57.74 FPS**. Native changed-pixel rates and Chrome pipeline feedback describe different events and must not be substituted for each other. All 12 playback observations across both cohorts visit the same **22 historical event years**, from 751 through 885. [Raw captured cohort](performance/svg-final-native.json.gz), [aligned native/GPU analysis](performance/svg-final-native-analysis.json.gz), [native metadata archive](performance/svg-final-native-captures.json.gz).

**Startup and memory.** Three alternating fresh-browser pairs are measured after both FPS cohorts. Readiness requires complete snapshots, loaded UI fonts and a settled year-1415 camera. Samples are every 250 ms in a separate interaction workload. Values are medians with full ranges; memory is MiB.

| Metric | Current main | Final SVG |
| --- | ---: | ---: |
| Full-scene ready, ms | 822.2 (785.1–823.0) | 747.0 (695.5–754.4) |
| First contentful paint, ms | 392.0 (376.0–396.0) | 376.0 (372.0–388.0) |
| Startup main-page JS heap | 14.28 (14.28–14.30) | 13.93 (13.92–13.93) |
| Peak sampled main-page JS heap | 41.29 (32.79–41.31) | 29.83 (29.81–31.99) |
| Main-page JS heap after interactions | 22.62 (22.35–22.77) | 20.34 (20.27–20.38) |
| Startup owned-process RSS | 1483.94 (1475.70–1497.17) | 1492.50 (1480.02–1493.91) |
| Peak sampled owned-process RSS | 1781.61 (1714.11–1814.56) | 1612.12 (1573.83–1817.39) |
| Owned-process RSS after interactions | 1631.67 (1573.58–1737.14) | 1549.41 (1521.30–1665.61) |

Startup is faster in all three pairs; sampled peak main-page heaps are lower. Peak process RSS falls in median but its ranges overlap and one pair is slightly higher, so no consistent total-memory reduction is established. Browser/application profiles are fresh, while OS caches, remote UI-font/network timing and host load are uncontrolled. Main-page heap excludes worker isolates; summed owned-process RSS may double-count shared pages and does not measure unique physical or total GPU memory. [All six observations and resource timing](performance/svg-final-memory.json.gz).

**Changes included.** This is the aggregate selected optimization against stock current main, not just the last three changes relative to an already optimized baseline:

- Cache repeated geometry/boundary work and dictionary availability without changing source data or point-in-ring semantics. Exact boundary and anchor-predicate comparisons use current main.
- Retain unchanged native SVG polity/region nodes, avoid repeated attribute writes, and suppress only labels outside the viewport with a visibility margin. Revealed labels receive the current scale before painting.
- Reuse a bounded painted SVG plane during translation. Its 256 CSS px overscan rebases before exposing an edge; zoom/resize/settle commit the canonical camera. Logical hit-test coordinates and callouts remain stationary relative to the viewport.
- Lazily prepare upcoming boundary/polity paths in a background worker, using the existing projection functions and immutable caches. Cancellation, stale-result rejection and Worker/idle-unavailable fallbacks are retained.
- Move the timeline playhead with a transform, separate its unchanged frosted backdrop during autoplay, and isolate changing year surfaces. Promotion hints are released on pause. The existing 220 ms easing, timeline input, labels and onboarding remain.

Pan layout totals fall **237.27 → 80.85 ms** per four seconds, while whole-page Paint totals do not fall. Zoom/playback process more presented frames, so their aggregate trace totals are not direct per-frame cost comparisons. These observations do not isolate an individual optimization or prove a GPU-utilization reduction. All five later rejected SVG trials and the MapLibre engine prototype are excluded from this final branch.

**Responsive and feature verification.** All **15 final validation groups pass**: synchronized assets; full atlas/40 CUJs; current-main geometry equivalence; worker lifecycle/capability fallbacks; exact SVG scene equivalence; camera/pointer/mobile pinch; bounded-plane rebasing/layer reuse; viewport-label safety; callout motion; paired feature flows; timeline/onboarding; responsive controls; Chrome/native parser fixtures; LAN playback/source verification. [Complete verification record](performance/svg-final-verification.json.gz).

Current-main geometry is byte-identical across **189 concrete snapshots**, with **16,433 anchor comparisons** and six margin/threshold fixtures. Complete SVG scenes match in forward/reverse snapshot order. Feature checks cover real person search, person pins, routes, place history, Simplified/Traditional Chinese and English, polity links, quiz answer/next/exit, embed, actual playback and year navigation. First-visit onboarding DOM, hint markup, timeline ARIA and the existing easing remain equivalent.

Responsive checks run both versions at **320×568, 390×844, 640×900, 768×1024, 900×640, 1024×768, 1280×720, 1440×900 and 1920×1080**, followed by orientation swaps. Trusted interactions cover layer switches, chronology panels, rail/year navigation, pan, zoom and reset. Control geometry agrees within 0.51 CSS px, final cameras within 0.1 world unit, and no new horizontal overflow appears. These are functional/layout checks on emulated viewports and touch contexts; physical-phone/Safari FPS and production INP are not measured.

The initial callout test found a 0.03125 CSS px width discrepancy while newly loaded event text triggered additional font loading. Waiting for those fonts and restoring the canonical camera removes the discrepancy; exact callout equality remains required, with no relaxed tolerance. The preliminary failed log/check record is retained in the raw review directory. No production code was changed to resolve this test-settling issue.

Six screenshots come from the final paired responsive run. They are full, unmasked, unaligned images; animations are frozen only for deterministic visual validation, never during FPS collection. Mean RGB difference is **0.0313–0.0813 / 255**, with **0.0243–0.0374%** of pixels differing by more than 16 in a channel. This is close static rendering, not pixel identity during movement. [Screenshot hashes and pixel comparison](performance/svg-final-screenshots.json).

- Desktop: [main](performance/svg-final-main-1280x720.png), [optimized](performance/svg-final-optimized-1280x720.png).
- Tablet: [main](performance/svg-final-main-768x1024.png), [optimized](performance/svg-final-optimized-768x1024.png).
- Phone: [main](performance/svg-final-main-390x844.png), [optimized](performance/svg-final-optimized-390x844.png).

**Recorded host conditions.** Jellyfin and LogiPluginService are left running throughout collection. Their actual load is much lower than in the earlier experiments; no artificial workload is added.

One-minute load: 4.04 (3.13–5.24). Jellyfin PID 36851 CPU: 0.20 (0.00–14.20)%; LogiPluginService PID 40427: 0.00 (0.00–11.80)%. These loads are observed, not causally isolated. Do not pool this cohort with prior tests whose data, controls and background-service load differed.

**Reproduction.** Runtime sources are frozen before measurement, served assets verified at both ends and checked again offline. The offline assembler verifies all **36 trace digests**, recomputes FPS with the unchanged parser, aligns all **18 native captures**, retains all six startup/memory runs and checks each recorded validation/measurement script version and log against its recorded hash. Matching tool versions are resolved by content hash in this branch's history, so applying the patch with new commit IDs also works. Raw compressed traces, captures, all responsive screenshots and earlier failed validation logs remain in `../jiangshan-map-svg-final-review`. Every completed measurement is retained. Detailed raw/analysis/verification JSON is packaged as gzip archives; the [readable summary](performance/svg-final-summary.json) retains full ranges and acceptance results.

The tooling cleanup removes the unused footer-hiding preview mode. Both benchmark tools now default to pinned main `d54411d` and loopback ports 8824/8825; the LAN server always compares main and optimized SVG with visible footers on 8826/8827. Fixed source/parser fingerprints replace the analyzer's dependency on experimental branch history. Historical tool hashes are matched against file versions committed in this branch; no original experimental commit ID is required. The cleaned analyzer reproduces all eight generated evidence artifacts byte-for-byte; measured application assets and results remain unchanged.

Two subsequent review findings are fixed in the evidence tooling. Each FPS/native invocation receives a unique run ID. The phase runner requires that ID, a completed collection, all 18 distinct expected samples, the correct native/uncaptured cohort and a target verdict consistent with the samples before accepting either success or a completed 60 FPS target failure. Old, malformed or incomplete output stops the phase, including when a child exits zero. Phase records start as incomplete. A replay of the actual preflight fetch failure with an existing completed FPS file now stops before memory collection and preserves that file.

New native capture paths are relative to their measurement JSON. Both offline analyzers use the supplied cohort directory for captures and PNGs; legacy absolute paths under `captures/` are rebased there even when the original copy still exists. Legacy custom directories retain their absolute-path fallback. Recorded paths and hashes in the existing archives remain untouched. Reassembling the original evidence still produces all eight artifacts byte-for-byte. Reassembling a relocated copy with original capture reads blocked verifies all 36 traces, 18 native JSON/PNG captures and six startup/memory observations; seven artifacts are byte-identical and the verification archive differs only in `rawEvidenceDirectory`. Standalone native analysis also reproduces all 18 rows. Native counting, trace calculations, application assets and the measured results are unchanged; no new timed measurements are claimed.

`node scripts/validate_svg_evidence.cjs` runs offline regressions for 13 collection scenarios, relocated legacy/relative captures, missing/corrupt local captures, standalone CLI roots and relative path recording by the native helper. It is also included in future validation phases; the archived measurement's original 15 validation groups are preserved.

```sh
# Terminal 1: unmodified current-main and optimized worktrees, ports 8824/8825:
node scripts/serve_web_benchmark.cjs MAIN_CHECKOUT OPTIMIZED_CHECKOUT

# Terminal 2: LAN comparison on ports 8826/8827:
LAN_HOST=192.168.8.31 LAN_MAIN_ROOT=MAIN_CHECKOUT \
node scripts/serve_timeline_comparison.cjs

# Terminal 3: validation, then measurements:
PLAYWRIGHT_PATH=/path/to/playwright \
LAN_MAIN_URL=http://192.168.8.31:8826/ \
LAN_CANDIDATE_URL=http://192.168.8.31:8827/ \
node scripts/check_svg_final.cjs

# Sequentially, with visible/focused Chrome and services running:
PLAYWRIGHT_PATH=/path/to/playwright \
FRAME_CAPTURE_BINARY=/path/to/capture-window \
node scripts/check_svg_final.cjs --measure-only

# Offline after all timed collection:
node --expose-gc scripts/analyze_svg_final.cjs \
  ../jiangshan-map-svg-final-review docs/performance
```

The native helper is a macOS measurement CLI under `scripts/`, not an iOS app change or runtime dependency. It can be built with `xcrun swiftc -O -parse-as-library -swift-version 5 scripts/capture_window_frames.swift -o /tmp/capture-window` and requires existing screen-recording access. Pinned `WEB_BASE_REF=d54411d` and `SVG_REVIEW_DIR` can be supplied explicitly. The phase runner continues after a completed 60 FPS acceptance failure while refusing incomplete/invalid collections or changed validated sources.
