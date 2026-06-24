---
slug: exercise-admin-pose-builder
status: drafting
intent: clear
pending-action: write .omo/plans/exercise-admin-pose-builder.md
approach: <fill: the approach you intend to plan>
---

# Draft: exercise-admin-pose-builder

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

## Findings (cited - path:lines)

## Decisions (with rationale)

## Scope IN

## Scope OUT (Must NOT have)

## Open questions

## Approval gate
status: drafting
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
# exercise-admin-pose-builder draft

status: plan-written
intent: CLEAR
classification: Architecture/Standard hybrid — one React screen, one logic utility layer, localStorage persistence, canvas editor, and exercise-player integration.

## User outcome

Build an admin/settings control panel for the existing webcam exercise app. The main camera remains live as-is with webcam video, live body skeleton, and face mask/face landmarks. The Settings/admin sidebar becomes the place where the exercise owner can manually create target poses, configure camera positioning rules, save all exercise definition data in localStorage, and make the webcam exercise ask the user to copy the saved pose.

## Topology lock

Components that can succeed/fail independently:

1. Admin shell/sidebar — Settings opens a real right-side admin panel instead of the current small calibration popover.
2. Manual pose editor canvas — separate sidebar canvas with an editable green skeleton; user can drag joints and save poses.
3. LocalStorage model — saved custom poses and camera rules persist across reloads with import/export/reset safety.
4. Webcam exercise player integration — main camera uses selected saved pose and reports match/pass without removing current live skeleton/facemask behavior.
5. Camera positioning rules — admin-controlled distance/centering/visibility rules drive “move closer/back/left/right/show shoulders” readiness.
6. Verification/QA — build/typecheck plus browser manual QA evidence for editor, persistence, camera readiness, and pose matching.

## Evidence collected

- `src/App.tsx:223-301`: Settings already exists, but it is an absolute overlay inside camera container with only calibration sliders.
- `src/App.tsx:108-149`: Main canvas already draws live body skeleton and optional face mesh when debug is on.
- `src/App.tsx:125-129`: readiness check currently calls `checkPosition(keypoints, canvas.width)` while not started.
- `src/App.tsx:152-205`: exercise engine tick loop only handles fixed built-in exercise flow.
- `src/utils/exerciseLogic.ts:5-12`: config already includes shoulder ratio min/max for camera distance.
- `src/utils/exerciseLogic.ts:289-375`: an earlier locked-pose prototype exists, but it only saves current camera keypoints; it is not a manual admin pose editor.
- `src/utils/exerciseLogic.ts:377-403`: `checkPosition` already accepts optional `lockedPose`, but `App.tsx` does not use this argument.
- `src/App.css:144-158`: current settings panel CSS is a small bottom-left popover, not a right admin panel.
- `src/hooks/usePoseDetection.ts:6-8`: live poses expose MoveNet keypoints with `{ x, y, score, name }`, enough for pose matching and editor normalization.
- `package.json:9-12`: available verification commands are `npm run build`, `npm run dev`, and `npm run preview`.

## Decisions/defaults adopted

- Manual pose editor is the main feature. “Pose library” is not a separate heavyweight module; it is the saved list of poses created/edited by the manual editor.
- No new pose-matching dependency. Existing MoveNet keypoints are enough; implement normalized point matching in app utilities.
- Main camera canvas must remain focused on live video, live skeleton, and face mask. Manual editing happens in the right admin sidebar canvas only.
- Use localStorage for all saved admin data because user explicitly asked for it.
- Save pose coordinates in normalized editor coordinates (`0..1`) so poses are independent of webcam/canvas pixel size.
- Camera rules should be editable sliders/checkboxes in the admin panel and reused by readiness logic.
- Tests-after strategy: add pure utility tests where feasible, plus build/typecheck and browser QA. Existing project has no test runner; do not add one unless needed.

## Pending action

Write/execute `.omo/plans/exercise-admin-pose-builder.md` through `$start-work` or an executor. Implementation is not performed by Prometheus/planner.
