# Fork vs Original TornTools (`upstream/master`) Summary

This repository’s current branch is ahead of `upstream/master` (Mephiles/torntools_extension). To see the exact number of commits ahead in your local clone, run: `git fetch upstream && git log --oneline upstream/master..HEAD | wc -l`.

## What changed

- Added a new Stocks feature: **Happy Jump Cash Planner**.
- Added feature UI styling for that planner.
- Added a settings toggle (`stocks.happyJumpCashPlanner`) enabled by default.
- Wired the planner CSS/JS into `manifest.json` for stock page injection.
- Simplified/fixed MV3 background manifest declaration.
- Minor housekeeping updates (`.DS_Store` ignore and lockfile metadata drift).

## Why these changes likely exist

1. **Feature expansion for stock workflow users**  
   The new planner provides immediate visibility into cash/networth/stock values and a manual input workflow for jump-related consumables, lowering spreadsheet friction.
2. **Progressive rollout strategy**  
   The planner text explicitly says full allocation math comes later, indicating an iterative release approach.
3. **Reliability over automation for owned item counts**  
   Final state uses manual-only source labeling for owned jump items, likely due instability/permissions/API completeness concerns for inventory reads.
4. **MV3 compliance/robustness**  
   The manifest background block removes the invalid MV2-style `background.scripts` list and keeps only `service_worker`, which aligns with Chrome MV3 behavior.

## Upstream reference

- Upstream remote: `https://github.com/Mephiles/torntools_extension.git`
- To compare the current state of this fork against upstream, run:
  ```
  git fetch upstream && git log --oneline upstream/master..HEAD
  ```
