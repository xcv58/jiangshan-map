# Zoom slowdown diagnosis — 2026-11-04

Removing the permanent `will-change: transform` hint from `#svg-stage-wrap` is the strongest isolated improvement found. It raises native SVG `viewBox` zoom presentation from roughly 39–41 FPS to roughly 57 FPS on this Chrome/Apple M4 setup, with an independently observed increase in map-pixel changes. This hint is inherited from main. The experiments therefore identify a shared bottleneck; they do not establish the exact cause of the earlier 13.2% main-versus-PR median difference.

PR #255 remains unchanged at `0f3c1b6cca732045f650003c9301639417444c13`. All interventions and harness changes are isolated on `codex/svg-zoom-cause` and local diagnostic shadow roots. Main is pinned to `49ae5edeea316af1a223d7727554bc597ea314be`. No iOS, onboarding, label-culling, worker, or CSS camera-transform changes were introduced into the PR.

## Method

- Visible Chrome 156.0.8078.79, Apple M4, 16 GiB memory, 1280 × 720 CSS viewport, DPR 2; Metal through ANGLE.
- Each four-second zoom wave sends 240 trusted wheel inputs at year 1415 with the same waveform, initial camera, fonts, and data. Native SVG `viewBox` rendering and per-frame typography stay active.
- Six cyclic order rotations per experiment; every variant occupies every order position in the six-variant batches. In the three-variant confirmation each position occurs twice. These are sequential, counterbalanced runs, not simultaneous browser comparisons or randomized trials.
- Jellyfin PID 12908 and LogiPluginService PID 81073 remain running throughout all samples; CPU/load snapshots are recorded before and after each wave. Their presence does not imply constant CPU utilization.
- FPS counts unique page presentation-feedback times matched to Chrome display feedback, using the existing parser unchanged. Independent ScreenCaptureKit map-region pixel changes corroborate visible content delivery. Native changed-pixel Hz can undercount through capture coalescing and is not physical display FPS.
- All 90 trace digests were verified and reparsed with the original parser. All 18 native capture digests and clock windows were verified. Served asset hashes, identical shared data, focus/visibility, error-free runs, current typography, restored final camera and wheel delta, and absence of stage CSS transforms were checked.
- The final confirmation uses one origin/page URL and the same JS/data URLs, with a local request header selecting the server response. The stylesheet version query changes with the stylesheet content hash; not literally every resource URL is identical. The raw manifest's shorthand “identical resource URLs” should be read with this qualification.

## Single-component reversions did not isolate a PR regression

Six runs per row; FPS values are medians and full ranges. All low samples are retained.

| Variant | Median FPS | Range | Faster than subset in matched rotations |
| --- | ---: | ---: | ---: |
| Main | 41.44 | 36.70–47.50 | 4/6 |
| Published subset | 38.50 | 36.26–45.08 | — |
| Revert attribute guards | 38.58 | 35.92–47.57 | 2/6 |
| Revert timeline JS/CSS/markup | 38.55 | 31.07–46.42 | 3/6 |
| Revert boundary builder | 40.17 | 37.20–44.91 | 3/6 |
| Revert dictionary cache | 41.01 | 30.87–46.13 | 3/6 |

Separate instrumented call counts show no `_hasEnDict`, `_buildRegionBoundaryPath`, or `_syncScrubberUi` calls during the zoom wave. `_applyCamera` and `_rescaleSvgTypography` are active. The counters add overhead and their timings are not FPS evidence. This rules out direct hot-path calls to those three methods in this scenario; it does not exclude indirect initialization, heap, or composition effects.

The settled SVG hash and camera are identical across all six variants. Paused footer geometry is equivalent within 0.51 CSS pixels, without overflow or errors.

## Permanent compositor-hint control

The intervention changes one CSS declaration to an inert comment and synchronizes the stylesheet's HTML version. JS and data remain byte-identical to the corresponding control. Each A/B pair below has identical source and asset hashes.

| Variant | Median FPS | Range |
| --- | ---: | ---: |
| Main A | 41.48 | 37.67–47.96 |
| Main B, identical code | 41.23 | 38.67–45.79 |
| Subset A | 41.12 | 37.97–43.20 |
| Subset B, identical code | 37.36 | 35.96–44.81 |
| Main without stage hint | 57.22 | 55.42–57.81 |
| Subset without stage hint | 56.63 | 53.74–57.86 |

Both hint-removal variants exceed every promoted control run in this batch. Identical subset code also differs by several FPS between A and B medians, demonstrating that a single main/subset median difference is not a clean causal estimate.

CDP reports the stage compositing reason as `WillChangeTransform` with the hint. Without it, the recorded reasons become `RootScroller` and `OverflowScrolling`. Total reported layer count stays at 26, and the settled SVG hash remains identical. This supports a browser compositing-path explanation, but does not identify a particular GPU saturation mechanism or prove that fewer layers are involved.

## Same-origin confirmation with independent native capture

Six runs per row, including the slow first intervention sample.

| Variant | Chrome median FPS | Chrome range | Native median changed-pixel Hz |
| --- | ---: | ---: | ---: |
| Published subset A | 39.19 | 36.93–43.64 | 38.35 |
| Published subset B, identical code | 39.31 | 37.48–43.10 | 38.94 |
| Subset without stage hint | 56.57 | 40.98–57.62 | 52.72 |

The intervention beats both controls in five of six matched rotations and one control in the remaining rotation. Its 40.98 FPS run remains in all calculations. Native changed-pixel frequency ranges from 40.98 to 55.89 Hz; complete native sample delivery also varies, so it is corroborating evidence rather than a precise physical-refresh count.

The median per-run 95th-percentile presentation interval improves from about 50 ms to 33.33 ms under native capture. In the batch without native capture it improves to 25 ms. This still does not establish every-run 58 or 60 FPS.

In this confirmation the largest recorded Dawn scheduling wait is 1.399 ms and the largest swap span is 1.635 ms across all variants. No >25 ms feedback gap overlaps a Dawn wait of at least 8 ms. These selected trace events do not support blaming long Dawn waits; they do not rule out other browser/GPU scheduling work.

## Recommendation and limits

The next minimal candidate is to remove only the permanent `#svg-stage-wrap` hint and update the stylesheet version. Keep native SVG camera updates and the maintainer's requested PR scope. Before adding that candidate to the PR, rerun pan/playback, startup/memory, and functional/visual checks, including mobile Safari. This diagnostic only measures zoom and does not establish those other results or cross-device behavior.

The earlier published 46.66 → 40.49 FPS comparison remains valid as an observation of that batch. The new experiments do not justify assigning its precise 13.2% difference to one PR change, nor replacing that published result with a best run. No production fix has been pushed during this diagnosis.

## Evidence and verification

Compact verified results: [svg-zoom-cause-summary.json](performance/svg-zoom-cause-summary.json).

Raw evidence root: `/Users/yihong/work/jiangshan-map-svg-zoom-cause-review`. Retained files include:

- `frames.json`, `variants.json`, `traces/`, `ablation-summary.json`, `equivalence.json`, and `instrumented-calls.json`.
- `compositor-control/frames.json`, `variants.json`, `traces/`, and `layers.json`.
- `compositor-control/native-confirmation/frames.json`, `variants.json`, `traces/`, `captures/`, and `frame-delivery.json`.
- Per-batch run metadata and benchmark logs. All raw measurements are preserved.

From this diagnostic checkout, with collection stopped:

```sh
node --expose-gc scripts/analyze_zoom_causes.cjs /Users/yihong/work/jiangshan-map-svg-zoom-cause-review
```

This verifies recorded trace/capture digests, reruns the original presentation parser, checks immutable source/data identities and run conditions, and regenerates `cause-summary.json` in the raw evidence root. The diagnostic harness is kept outside the upstream PR.
