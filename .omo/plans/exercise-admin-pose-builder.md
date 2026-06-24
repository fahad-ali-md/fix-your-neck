# exercise-admin-pose-builder - Work Plan

## TL;DR (For humans)
**What you'll get:** A Settings/admin sidebar where you can create/edit a green skeleton pose on a separate canvas, save many poses in browser storage, choose one as the exercise target, and make the webcam user copy it. The main camera stays as it is now: live webcam, live pose skeleton, and face mask/debug overlay.

**Why this approach:** The app already has MoveNet body keypoints, canvas drawing, localStorage config, and camera readiness checks. The shortest reliable path is to add a small pose-admin data model, a right-sidebar editor canvas, and normalized pose matching on top of the existing keypoints—no new AI library needed.

**What it will NOT do:** It will not drag/edit skeletons directly on the main webcam canvas. It will not add backend/database/accounts. It will not remove the current neck/head/eyes/hands exercise flow unless you later choose to replace it.

**Effort:** Medium
**Risk:** Medium - canvas drag editing plus pose matching needs careful coordinate normalization and browser QA.
**Decisions to sanity-check:** Default pose matching tolerance, default camera distance/centering thresholds, and whether the custom pose step runs before or after the existing exercise sequence.

Your next move: Run `$start-work .omo/plans/exercise-admin-pose-builder.md` when you want the worker to implement it. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, medium risk. Add admin sidebar pose editor + localStorage exercise definitions + camera positioning rules + selected-pose matching while preserving current webcam/facemask flow.

## Scope
### Must have
- A right-side Settings/admin panel opened by the existing Settings button, not a tiny bottom-left overlay.
- Main camera area remains live and keeps drawing webcam, live body skeleton, and existing face mask/debug overlay behavior.
- A separate manual pose editor canvas inside the right admin panel.
- Editable green skeleton on the admin canvas with draggable joints.
- Pose controls: new pose, edit selected pose, duplicate/copy optional if cheap, delete pose, save pose, select active pose.
- Pose data saved to localStorage and reloaded on refresh.
- Active saved pose can be used by the main webcam exercise/player as a target.
- Main webcam compares the live user pose to the selected saved target pose and reports “match/pass” when the tolerance is satisfied.
- Admin controls for pose matching sensitivity/tolerance and hold duration before pass.
- Admin controls for camera readiness rules: too close/too far, centered left/right, required visible body parts.
- Camera readiness messages update from saved admin rules: move closer, move back, move left/right, show required parts, ready.
- Export/copy and reset controls for admin data to recover from bad localStorage state.
- Build/typecheck must pass.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not edit target skeleton directly on top of the main webcam canvas; editing is only in the admin sidebar canvas.
- Do not remove the current live skeleton drawing or face mesh/debug behavior.
- Do not add backend, database, accounts, remote sync, or cloud storage.
- Do not introduce a new pose-detection library. Existing TensorFlow MoveNet keypoints are enough.
- Do not add a large UI framework or state-management library.
- Do not store raw webcam frames/images in localStorage.
- Do not break the existing `npm run build` flow.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: Tests-after. No test runner exists; use pure utility assertions where possible plus `npm run build` and browser QA through the dev server.
- Evidence: `.omo/evidence/task-<N>-exercise-admin-pose-builder.txt`, screenshots when browser QA is run, and final build logs.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1: Data model + pose utility foundation + CSS/layout shell can proceed independently after reading current code.
- Wave 2: Admin sidebar/editor UI + localStorage persistence + camera rule plumbing.
- Wave 3: Webcam player integration + matching feedback + end-to-end QA.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. Define admin data model and storage | — | 4, 6, 7, 8 | 2, 3 |
| 2. Build normalized pose utility functions | — | 5, 7, 8 | 1, 3 |
| 3. Convert settings into right admin shell | — | 4, 6 | 1, 2 |
| 4. Add manual pose editor canvas | 1, 2, 3 | 6, 7 | 5 |
| 5. Add configurable camera readiness rules | 1, 2 | 8 | 4, 6 |
| 6. Add saved-pose list and active target controls | 1, 3, 4 | 7, 8 | 5 |
| 7. Integrate active target pose into main webcam matching | 2, 4, 6 | 9 | 8 |
| 8. Integrate admin camera rules into start readiness | 1, 5, 6 | 9 | 7 |
| 9. Final browser QA and build cleanup | 7, 8 | — | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. **Define admin pose/exercise data model and localStorage storage helpers**
  What to do / Must NOT do: Create a focused utility module, recommended path `src/utils/adminExerciseConfig.ts`, that owns all admin-created exercise data. Define types for `EditorJoint`, `SavedPose`, `CameraRules`, and `AdminExerciseConfig`. Store poses in normalized editor coordinates (`x`/`y` in `0..1`) plus joint `name`, not raw webcam pixels. Include `version`, `poses`, `activePoseId`, `matchTolerance`, `holdMs`, and `cameraRules`. Implement `loadAdminExerciseConfig()`, `saveAdminExerciseConfig()`, `resetAdminExerciseConfig()`, `upsertPose()`, `deletePose()`, and `getActivePose()`. Use localStorage key `fyn-admin-exercise-config`. Use defensive parsing and defaults if localStorage is corrupt. Do NOT store image/video data. Do NOT mutate React state inside this utility.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 6, 7, 8
  References (executor has NO interview context - be exhaustive): `src/utils/exerciseLogic.ts:5-12` current global config/localStorage-adjacent calibration; `src/utils/exerciseLogic.ts:289-375` current locked-pose prototype to replace/avoid depending on; `src/hooks/usePoseDetection.ts:6-8` keypoint shape; `src/App.tsx:32-42` existing config localStorage pattern.
  Acceptance criteria (agent-executable): Add a small inline/self-test function or exported pure defaults that can be imported by `node`/`tsx` if available; at minimum `npm run build` compiles and a manual browser console check can call config save/load without throwing. Evidence file must include before/after localStorage key names and build output.
  QA scenarios (name the exact tool + invocation): Happy: run `npm run build` and record success to `.omo/evidence/task-1-exercise-admin-pose-builder.txt`. Failure: temporarily set `localStorage['fyn-admin-exercise-config']='bad-json'` in browser devtools, refresh, verify defaults load and app does not crash; record notes in same evidence file.
  Commit: Y | feat(admin): add exercise config storage model

- [ ] 2. **Build normalized pose utility functions for editor-to-webcam matching**
  What to do / Must NOT do: Add pure utility functions, either in `src/utils/adminExerciseConfig.ts` or a new `src/utils/poseMatching.ts`. Required functions: `defaultEditablePose()` returns a reasonable standing skeleton in normalized coordinates; `normalizeLivePose(keypoints)` converts MoveNet keypoints to a comparable normalized pose using body bounding box/shoulder center; `compareSavedPoseToLive(savedPose, keypoints, tolerance)` returns `{ matched, score, missingJoints }`; `scalePoseToCanvas(pose, width, height)` maps normalized editor pose to canvas pixels; `hitTestJoint(pose, x, y, width, height)` finds closest draggable joint; `updateJoint(pose, jointName, normalizedX, normalizedY)` returns immutable updated pose. Prefer matching only body joints that exist in both saved and live pose and have score above confidence threshold. Do NOT compare absolute webcam pixels directly because camera distance changes.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 7, 8
  References (executor has NO interview context - be exhaustive): `src/utils/exerciseLogic.ts:47-49` distance helper style; `src/utils/exerciseLogic.ts:318-375` existing bbox-normalized compare prototype; `src/App.tsx:6-9` skeleton edges; `src/hooks/usePoseDetection.ts:6-8` live keypoints shape.
  Acceptance criteria (agent-executable): Utility functions compile and are pure. Add mock-data assertions in a dev-only function or simple comments with runnable snippet showing same pose matches and deliberately shifted wrist does not match at default tolerance. `npm run build` passes.
  QA scenarios (name the exact tool + invocation): Happy: `npm run build` plus run the mock assertion snippet via `node`/browser console if feasible; save output to `.omo/evidence/task-2-exercise-admin-pose-builder.txt`. Failure: compare a pose missing shoulders/wrists and verify `matched=false` with non-empty `missingJoints`; record result.
  Commit: Y | feat(pose): add normalized pose matching utilities

- [ ] 3. **Replace current settings popover with a right-side admin sidebar shell**
  What to do / Must NOT do: Update `src/App.tsx` and `src/App.css` so the existing Settings button opens a right-side admin panel/sidebar. Keep Debug button behavior. Move the current calibration sliders into this admin panel under a “Live Calibrations” section. The panel should not cover the main camera center; it should sit to the right or overlay from the right with scroll. Add section headings for “Pose Builder”, “Saved Poses”, “Camera Position Rules”, and “Data”. Preserve current `.guide-panel` exercise instruction panel unless layout needs a responsive wrap. Do NOT remove current calibration sliders or copy config button; they can move inside the sidebar.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 4, 6
  References (executor has NO interview context - be exhaustive): `src/App.tsx:223-235` Settings/Debug buttons; `src/App.tsx:271-301` current settings panel contents; `src/App.css:144-178` current bottom-left settings popover CSS; `src/App.css:24-36` current main area/camera layout; `src/App.css:92-101` current guide panel width.
  Acceptance criteria (agent-executable): `npm run build` passes. With `npm run dev`, clicking Settings opens/closes a right admin sidebar and current calibration controls are still visible and usable.
  QA scenarios (name the exact tool + invocation): Happy: use Playwright/manual browser to click Settings, capture screenshot `.omo/evidence/task-3-exercise-admin-pose-builder.png`, and record build log `.txt`. Failure: Settings closed state should restore camera/guide view without hiding Start button; record screenshot or note.
  Commit: Y | feat(admin): add right settings sidebar shell

- [ ] 4. **Implement the manual green skeleton pose editor canvas**
  What to do / Must NOT do: In the admin sidebar, add a separate `<canvas>` for editing target poses. Render a green skeleton using the same `SKELETON_EDGES` concepts as the main canvas, but from normalized editable pose data rather than webcam. Support pointer/mouse/touch dragging of joints: pointer down selects nearest joint, pointer move updates that joint, pointer up releases. Show visible circular joint handles. Add “New Pose” to reset to defaultEditablePose and an input for pose name. Keep editor state in React until saved. Do NOT attach pointer events to the main webcam overlay canvas; only the admin editor canvas is editable.
  Parallelization: Wave 2 | Blocked by: 1, 2, 3 | Blocks: 6, 7
  References (executor has NO interview context - be exhaustive): `src/App.tsx:76-150` current drawing pattern and canvas context usage; `src/App.tsx:108-124` live skeleton drawing; `src/App.css:48-54` main overlay pointer-events disabled, which must remain for webcam; new editor canvas needs pointer-events enabled; `src/utils/adminExerciseConfig.ts` and/or `src/utils/poseMatching.ts` from todos 1-2.
  Acceptance criteria (agent-executable): `npm run build` passes. In browser, user can drag at least wrist/elbow/shoulder joints on the sidebar canvas, and the green skeleton updates immediately. Main webcam skeleton remains unaffected by dragging.
  QA scenarios (name the exact tool + invocation): Happy: browser QA drag a wrist to form a T-like arm and capture `.omo/evidence/task-4-exercise-admin-pose-builder.png`. Failure: drag outside canvas should not crash or move unrelated joints; record result in `.txt`.
  Commit: Y | feat(admin): add manual pose editor canvas

- [ ] 5. **Add configurable camera readiness rules**
  What to do / Must NOT do: Extend admin config with camera positioning controls and update readiness logic. Rules should include shoulder width min/max ratio (too far/too close), target body center X with allowed offset, and required visible joints/body parts (at minimum face/nose, shoulders, ears; optionally wrists/hands as checkbox). Refactor `checkPosition` in `src/utils/exerciseLogic.ts` or create a new wrapper so it can accept saved `CameraRules` instead of hard-coded `ExerciseConfig.posMinShoulderRatio` and `posMaxShoulderRatio` only. Display sliders/checkboxes in the admin sidebar. Do NOT remove existing `ExerciseConfig` sliders; bridge old settings where sensible.
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `src/utils/exerciseLogic.ts:5-12` current position distance thresholds; `src/utils/exerciseLogic.ts:377-403` current checkPosition; `src/App.tsx:125-129` where checkPosition is called; `src/App.tsx:317-322` readiness message/start disabled UI.
  Acceptance criteria (agent-executable): `npm run build` passes. Changing camera min/max shoulder sliders changes readiness messages without page reload. Requiring wrists/hands blocks readiness when wrists are low-confidence/missing; disabling that requirement allows readiness based on shoulders/face only.
  QA scenarios (name the exact tool + invocation): Happy: browser QA adjust “min shoulder width” slider high enough to force “Move closer”, then reset to allow ready; save notes to `.omo/evidence/task-5-exercise-admin-pose-builder.txt`. Failure: corrupt/missing camera rules should fall back to defaults and not crash.
  Commit: Y | feat(admin): add camera readiness controls

- [ ] 6. **Add saved poses list, active target controls, and persistence UI**
  What to do / Must NOT do: Add sidebar controls for saved poses. Required UI: pose name input, Save Pose, Saved Poses list, Select/Use as Target, Edit selected pose, Delete pose, and Reset Admin Data. Save updates to localStorage via todo 1 helpers. On selecting a pose, load it into editor canvas and set `activePoseId`. Show current active pose name. Add copy/export JSON button similar to existing config copy, but for admin config. Do NOT silently delete all poses without a confirmation prompt/window confirm or obvious two-step reset.
  Parallelization: Wave 2 | Blocked by: 1, 3, 4 | Blocks: 7, 8
  References (executor has NO interview context - be exhaustive): `src/App.tsx:295-299` current Copy Config button pattern; `src/App.tsx:66-70` settings state pattern; `src/utils/adminExerciseConfig.ts` from todo 1; `src/App.css:159-178` current setting/button styling to extend.
  Acceptance criteria (agent-executable): `npm run build` passes. A pose edited in the canvas can be named, saved, selected as active, survive browser refresh, and be deleted. Export JSON includes saved poses and camera rules.
  QA scenarios (name the exact tool + invocation): Happy: browser QA create “T Pose”, save it, refresh, confirm it remains in Saved Poses; evidence `.omo/evidence/task-6-exercise-admin-pose-builder.txt` plus screenshot if possible. Failure: delete active pose and verify active target is cleared or switches to a valid remaining pose without crash.
  Commit: Y | feat(admin): persist saved target poses

- [ ] 7. **Integrate active saved pose into main webcam pose matching and pass feedback**
  What to do / Must NOT do: Use the active saved pose from admin config in the main webcam flow. Main camera should continue drawing live skeleton and optional face mask exactly as before. Add a target/matching status in the guide panel: if active pose exists, show instruction like `Copy: <pose name>` and live match percentage/score. Apply `compareSavedPoseToLive` every pose frame. Use configured tolerance and hold duration before declaring pass/success to avoid one-frame false positives. On pass, show success. Decide minimally how it coexists with existing built-in exercise flow: default to a “Custom Pose” pre-start/readiness mode when activePoseId exists and not started; do not rip out head_turn/eyes_close/hands_up. If custom pose matching is active during exercise, keep it as an additional/first step only if simple; otherwise expose a clear “Practice selected pose” button.
  Parallelization: Wave 3 | Blocked by: 2, 4, 6 | Blocks: 9
  References (executor has NO interview context - be exhaustive): `src/App.tsx:108-124` current live skeleton draw must stay; `src/App.tsx:152-205` current exercise tick loop; `src/App.tsx:311-349` current guide panel UI; `src/utils/exerciseLogic.ts:318-375` existing compare prototype can inform but new normalized editor compare should be used; `src/hooks/usePoseDetection.ts:16-17` live pose state.
  Acceptance criteria (agent-executable): `npm run build` passes. With an active saved pose, guide panel shows target pose name and match state. Holding the matching pose for configured duration marks pass. Non-matching pose does not pass.
  QA scenarios (name the exact tool + invocation): Happy: browser QA select an easy standing pose, stand similarly, verify progress reaches pass; evidence `.omo/evidence/task-7-exercise-admin-pose-builder.txt`. Failure: select a T-pose but keep arms down; verify it does not pass and shows score/mismatch.
  Commit: Y | feat(exercise): match webcam pose against saved target

- [ ] 8. **Wire admin camera rules into start positioning and user guidance**
  What to do / Must NOT do: Make the existing pre-start `Position Ready / Adjust Position` panel use the saved camera rules from admin config. It should say exactly what is wrong: too far, too close, move left/right, face/shoulders/ears/wrists missing, or ready. If active target pose exists, readiness can also mention the selected target but should not require matching target before pressing Start unless implementing “Practice selected pose” mode intentionally. Keep Start button disabled only for camera readiness failures, not for not-yet-matching custom target unless the UI explicitly says so.
  Parallelization: Wave 3 | Blocked by: 1, 5, 6 | Blocks: 9
  References (executor has NO interview context - be exhaustive): `src/App.tsx:125-129` position check call; `src/App.tsx:313-322` start screen readiness UI; `src/utils/exerciseLogic.ts:377-403` readiness logic; `src/utils/adminExerciseConfig.ts` camera rules from todo 1.
  Acceptance criteria (agent-executable): `npm run build` passes. Adjusting camera rules changes pre-start guidance. Start remains possible when camera is positioned correctly. If no saved admin config exists, current default behavior remains usable.
  QA scenarios (name the exact tool + invocation): Happy: browser QA set strict center rule, move off-center, verify “move left/right” appears; evidence `.omo/evidence/task-8-exercise-admin-pose-builder.txt`. Failure: no active pose/no saved config still shows normal ready/start behavior.
  Commit: Y | feat(exercise): apply admin camera readiness rules

- [ ] 9. **Final cleanup, build, and browser QA evidence**
  What to do / Must NOT do: Remove unused imports/state, resolve TypeScript issues, ensure no accidental console spam beyond existing debug if intentionally kept, and document the admin flow in a concise comment or README note if helpful. Run full build. Run browser QA covering: open Settings admin panel, edit green skeleton in sidebar, save pose, refresh and reload pose, select active pose, camera readiness sliders, custom pose match pass/fail, existing Debug/facemask still works, existing exercise flow still starts. Do NOT commit generated `dist/` changes unless the repo already intentionally tracks them and the user expects it; prefer source-only changes.
  Parallelization: Wave 3 | Blocked by: 7, 8 | Blocks: —
  References (executor has NO interview context - be exhaustive): `package.json:9-12` scripts; `src/App.tsx` full integration surface; `src/App.css` layout/styling; `src/hooks/usePoseDetection.ts:103-116` face detection path to verify debug/facemask still works.
  Acceptance criteria (agent-executable): `npm run build` exits 0. Browser QA evidence files exist for admin open, saved pose persistence, active pose matching, camera readiness, and debug/facemask unchanged.
  QA scenarios (name the exact tool + invocation): Happy: run `npm run build > .omo/evidence/task-9-exercise-admin-pose-builder-build.txt 2>&1`; run `npm run dev` and use browser/Playwright screenshots for `.omo/evidence/task-9-admin.png`, `.omo/evidence/task-9-match.png`, `.omo/evidence/task-9-debug-face.png`. Failure: corrupt localStorage JSON + refresh should not crash; record result.
  Commit: Y | chore(admin): verify pose builder integration

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: Verify every Must Have is implemented and every Must NOT Have is absent. Evidence: `.omo/evidence/f1-exercise-admin-pose-builder.txt`.
- [ ] F2. Code quality review: Verify no oversized tangled component if avoidable, no unused imports, no fragile localStorage parsing, no direct mutation bugs in pose editor state, and no webcam/facemask regressions. Evidence: `.omo/evidence/f2-exercise-admin-pose-builder.txt`.
- [ ] F3. Real manual QA: Use browser with webcam to create/save/select a pose, refresh persistence, match/pass selected pose, fail non-match, adjust camera readiness, and toggle Debug face mesh. Evidence screenshots/logs under `.omo/evidence/f3-*`.
- [ ] F4. Scope fidelity: Confirm no backend/database/new pose-detection library/UI framework was added and main camera is not used as the manual editing surface. Evidence: `.omo/evidence/f4-exercise-admin-pose-builder.txt`.

## Commit strategy

Atomic commits per todo are preferred, following the commit lines above. If the executor cannot commit because this directory is not a git repo, write a clear summary of changed source files instead and do not attempt to initialize git.

## Success criteria

- Settings opens a right-side admin panel.
- Main webcam view still displays live video, body skeleton, and face mask/debug behavior.
- Admin panel has a separate green skeleton editor canvas.
- Joints in the admin editor canvas can be manually moved.
- A custom pose can be named, saved, selected as active, deleted, and persisted in localStorage.
- Saved pose data uses normalized coordinates, not raw camera images or video frames.
- Active saved pose can be used as a webcam target.
- Webcam user gets feedback to copy the active saved pose and passes only after matching for the configured hold duration.
- Camera positioning rules are configurable and drive readiness messages.
- App survives corrupt/missing localStorage by loading defaults.
- `npm run build` passes.
