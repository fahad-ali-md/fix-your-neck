# neck-exercise-app - Work Plan

## TL;DR (For humans)

**What you'll get:** A full-screen web app that opens your webcam, uses AI to track your body, and guides you through 3 neck exercises: (1) turn your head left → right, (2) close your eyes for 5 seconds, (3) raise both hands beside your ears. You see yourself on screen with a skeleton overlay and get real-time "good / fix it" instructions.

**Why this approach:** MoveNet Lightning runs at 30+ FPS on any modern laptop — no server, no install, just open a browser tab. React + Vite means we reuse your existing project setup. 1 HTML page, 5 source files, zero backend.

**What it will NOT do:** No user accounts, no progress logging, no audio feedback, no mobile app, no extra exercises beyond the 3 you asked for (those are easy to add later).

**Effort:** Short (one session, ~200 lines of real code)
**Risk:** Low — MoveNet is production-stable and well-documented
**Decisions to sanity-check:** The eye blink threshold value (default 0.3 confidence) — may need tuning per user

Your next move: Read the brief below, then tell me **approve** to write the final plan, or answer the 2 questions.

---

> TL;DR (machine): Short effort, low risk. Convert Chrome extension → standalone web app with TF.js MoveNet. 3 exercises via 17 COCO keypoints. React + Vite, 5 new files.

## Scope
### Must have
- Webcam access with real-time pose detection (MoveNet Lightning)
- Exercise 1: Head turn left/right detection with visual guidance
- Exercise 2: Eye closure detection with 5-second hold timer
- Exercise 3: Hand raise beside ears with straight-line level check
- Skeleton overlay on webcam feed
- Exercise state machine (idle → exercise active → feedback → next)
- Visual feedback: instruction text, pass/fail indicators, countdown timer
- Clean, minimal dark UI suitable for desk use

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No Chrome extension APIs or background scripts
- No backend, no database, no user accounts
- No audio/speech feedback
- No PWA service workers
- No Firebase or any external services
- No React Router — single page, single route

## Verification strategy
- Test decision: **Tests-after** — manual verification via browser with webcam
- Evidence: Screenshots of each exercise state in .omo/evidence/

## Execution strategy
### Parallel execution waves
**Wave 1** (Todos 1-3): Project setup → can parallelize (package install / vite config / entry HTML)
**Wave 2** (Todos 4-5): Pose detection hook + pose utils → parallel
**Wave 3** (Todo 6): Exercise engine (depends on wave 2)
**Wave 4** (Todos 7-8): UI components → parallel (depend on wave 3)
**Wave 5** (Todo 9): Integration + test

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. Clean project | — | 2, 3 | — |
| 2. Install deps | — | 4 | 1, 3 |
| 3. Entry HTML + vite config | — | 7 | 1, 2 |
| 4. usePoseDetection hook | 2 | 6 | 5 |
| 5. poseUtils | — | 6 | 4 |
| 6. ExerciseEngine | 4, 5 | 7, 8 | — |
| 7. WebcamView | 3, 6 | 9 | 8 |
| 8. ExerciseGuide | 6 | 9 | 7 |
| 9. App integration + final QA | 7, 8 | — | — |

## Todos
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. **Clean Chrome extension boilerplate**
  What to do / Must NOT do: Remove Chrome-extension-specific files. Delete src/popup/, src/options/, src/sidepanel/, src/devtools/, src/background/, src/contentScript/. Remove manifest.ts. Delete popup.html, options.html, sidepanel.html, devtools.html. Remove @crxjs/vite-plugin from package.json and vite.config.ts. Keep: newtab.html (rename to index.html), src/newtab/ (repurpose as main app), package.json structure, tsconfig.json. Do NOT delete node_modules, .git, .omo/, or README.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 2, 3
  References: package.json:29-30 (@crxjs dep to remove), vite.config.ts:2,19 (crx plugin to remove), src/manifest.ts (delete)
  Acceptance criteria: `npm run dev` starts Vite dev server without crx errors; `ls src/` shows no popup/, options/, background/, contentScript/, devtools/, sidepanel/ directories
  QA scenarios: Run `npm run dev` → confirms Vite serves on localhost. Run `ls src/` → confirms only newtab/, assets/, global.d.ts remain. Evidence: .omo/evidence/task-1-clean-output.txt
  Commit: Y | chore: remove Chrome extension boilerplate

- [ ] 2. **Install TensorFlow.js + pose-detection dependencies**
  What to do / Must NOT do: Run `npm install @tensorflow/tfjs @tensorflow-models/pose-detection`. Run `npm uninstall @crxjs/vite-plugin @types/chrome`. Do NOT install any other packages. Do NOT install @mediapipe/* — we use TF.js backend only. Update import in vite.config.ts to remove crx plugin reference.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 4
  References: package.json dependencies (add tfjs, remove crx)
  Acceptance criteria: `node -e "require('@tensorflow/tfjs')"` and `node -e "require('@tensorflow-models/pose-detection')"` both resolve without error
  QA scenarios: Run both node require checks. Evidence: .omo/evidence/task-2-deps-check.txt
  Commit: Y | feat: add @tensorflow/tfjs and pose-detection packages

- [ ] 3. **Create entry HTML + configure Vite for SPA**
  What to do / Must NOT do: Rename newtab.html → index.html (or create fresh index.html). Update the page title to "Fix Your Neck — Exercise". Remove Chrome extension meta. Set Vite config to SPA mode (remove `crx()` plugin, keep only `react()`). Update src/newtab/index.tsx to mount to #app as before. The page must be a full-viewport (100vh, 100vw) page — no popup sizing.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 7
  References: newtab.html:1-14 (template to modify), vite.config.ts:19 (remove crx plugin)
  Acceptance criteria: `npm run dev` opens a blank fullscreen page at localhost:3000 with title "Fix Your Neck — Exercise"
  QA scenarios: Run `npm run dev` → open browser → check title and viewport. Evidence: .omo/evidence/task-3-entry.txt
  Commit: Y | feat: set up SPA entry HTML and Vite config

- [ ] 4. **Create usePoseDetection hook**
  What to do / Must NOT do: Create `src/hooks/usePoseDetection.ts`. Must export a hook that:
  - Loads MoveNet detector with `poseDetection.SupportedModels.MoveNet` and `modelType: SINGLEPOSE_LIGHTNING`, `enableSmoothing: true`
  - Takes a `videoRef: RefObject<HTMLVideoElement>` parameter
  - Returns `{ poses, detector, error, isModelLoaded }` where poses is the array from `detector.estimatePoses(videoRef.current)`
  - Runs detection in a requestAnimationFrame loop at ~30fps cap
  - Handles camera access via `navigator.mediaUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })`
  - Cleans up on unmount (stops video tracks, closes detector)
  - Do NOT implement smoothing or filtering beyond what enableSmoothing provides
  - Do NOT draw anything on canvas — this is pure detection
  Parallelization: Wave 2 | Blocked by: 2 | Blocks: 6
  References: https://github.com/tensorflow/tfjs-models/tree/master/pose-detection (MoveNet API), MoveNet COCO keypoints doc (17 keypoints)
  Acceptance criteria: Hook compiles, loads model, starts webcam, returns poses array with 17 keypoints each frame
  QA scenarios: Mount component with hook → console.log the keypoints → verify 17 keypoints with x, y, score, name. Evidence: .omo/evidence/task-4-pose-detection.txt
  Commit: Y | feat: add usePoseDetection hook with MoveNet

- [ ] 5. **Create pose utility functions**
  What to do / Must NOT do: Create `src/utils/poseUtils.ts`. Must export:
  - `getKeypoint(pose, name)`: returns keypoint by name from pose.keypoints array (name field)
  - `getShoulderMidpoint(keypoints)`: returns midpoint x,y of left/right shoulder
  - `getNeckAngle(keypoints)`: returns angle in degrees of nose→shoulderMidpoint relative to vertical. 0° = looking straight, negative = turned left, positive = turned right
  - `areEyesClosed(keypoints, threshold)`: returns boolean. left_eye.score < threshold && right_eye.score < threshold. Default threshold 0.3
  - `isHandBesideEar(keypoints, side)`: side='left' or 'right'. Checks: wrist.y < shoulder.y (arm raised) AND |wrist.y - ear.y| < 50px (level with ear) AND wrist.x outside shoulder.x. Returns boolean
  - `areBothHandsBesideEars(keypoints)`: returns boolean. Calls isHandBesideEar for both sides
  - All functions must check keypoint.score > 0.2 before trusting the coordinate. Return null/false if confidence too low.
  - Pure functions, no React, no side effects
  Parallelization: Wave 2 | Blocked by: — | Blocks: 6
  References: MoveNet COCO keypoint names: nose, left_eye, right_eye, left_ear, right_ear, left_shoulder, right_shoulder, left_wrist, right_wrist
  Acceptance criteria: Each function returns correct values for known keypoint positions; handles low-confidence keypoints gracefully
  QA scenarios: Write 5 inline assertions (could be a demo() function in the file) that test each function with mock keypoint data. Evidence: .omo/evidence/task-5-utils.txt
  Commit: Y | feat: add pose utility functions for exercise detection

- [ ] 6. **Create ExerciseEngine (state machine + detection logic)**
  What to do / Must NOT do: Create `src/components/ExerciseEngine.ts`. This is a pure logic module (not a React component). Must export:
  - `ExerciseState` type: `'idle' | 'head_turn' | 'eyes_close' | 'hands_up' | 'complete'`
  - `ExerciseFeedback` type: `{ instruction: string, status: 'waiting' | 'in_progress' | 'success' | 'fail', progress?: number }`
  - `getExerciseFeedback(state, keypoints)`: takes current state + pose keypoints → returns feedback:
    - **head_turn**: instruction "Turn your head to the LEFT →" when nose is left of left_shoulder by threshold. Then "Now turn to the RIGHT →" when nose is right of right_shoulder. Both done → success
    - **eyes_close**: instruction "Close your eyes...". When both eyes closed → start progress counter (0-5 seconds). Progress increments each ~1s of sustained closure. If eyes open before 5s → reset timer. At 5s → success
    - **hands_up**: instruction "Raise both hands beside your ears ✋". Check isBothHandsBesideEars. Once held for 2s → success
  - `transitionState(state, feedback)`: returns next state. success → next exercise. Complete → 'complete'
  - Timer management: accept `timestamp` param for frame-accurate timing
  - Pure logic, no UI. The UI component reads feedback and renders it.
  Parallelization: Wave 3 | Blocked by: 4, 5 | Blocks: 7, 8
  References: poseUtils.ts (all exported functions)
  Acceptance criteria: ExerciseEngine correctly detects each exercise state transition with mock keypoint sequences
  QA scenarios: Feed mock keypoint data sequences through engine → verify state transitions. Evidence: .omo/evidence/task-6-engine.txt
  Commit: Y | feat: add exercise engine with state machine

- [ ] 7. **Create WebcamView component**
  What to do / Must NOT do: Create `src/components/WebcamView.tsx`. Must:
  - Render a `<video>` element (hidden) for the webcam feed
  - Render a `<canvas>` overlay on top for pose skeleton drawing
  - Use usePoseDetection hook to get poses
  - Draw keypoints + skeleton on canvas each frame:
    - Keypoints: filled circles at (x, y) with radius 4, color based on score (>0.5 green, >0.3 yellow, else red)
    - Skeleton lines between connected keypoints (use a skeleton edges list matching MoveNet)
    - Only draw keypoints/edges with score > 0.2
  - Video mirrored (scaleX -1) for selfie view
  - Canvas same dimensions as video (640x480 default)
  - Props: `poses` (from hook), `videoRef` (from hook)
  - Must NOT have any exercise UI text — that goes in ExerciseGuide
  Parallelization: Wave 4 | Blocked by: 3, 6 | Blocks: 9
  References: MoveNet skeleton edges (from tfjs-models/pose-detection)
  Acceptance criteria: Webcam feed displays with skeleton overlay, keypoints track body movement in real-time
  QA scenarios: Open in browser → verify skeleton aligns with body. Evidence: .omo/evidence/task-7-webcam.png
  Commit: Y | feat: add WebcamView with skeleton overlay

- [ ] 8. **Create ExerciseGuide component**
  What to do / Must NOT do: Create `src/components/ExerciseGuide.tsx`. Must:
  - Display current exercise name as header (e.g., "Head Turns", "Eye Closure", "Hands Up")
  - Display instruction text from ExerciseFeedback
  - Show status indicator: colored badge (⏳ waiting / 🔄 in progress / ✅ success / ❌ fail)
  - Show progress bar/dots for timed exercises (eyes close 5s countdown)
  - Show a "Start" button when state is 'idle'
  - Clean, dark-theme UI. Large readable text (16px+). High contrast for desk use.
  - Props: `exerciseFeedback: ExerciseFeedback`, `state: ExerciseState`, `onStart: () => void`
  - Acceptable to use inline styles or create ExerciseGuide.css
  - Must NOT include webcam or canvas rendering
  Parallelization: Wave 4 | Blocked by: 6 | Blocks: 9
  References: ExerciseEngine types (ExerciseState, ExerciseFeedback)
  Acceptance criteria: Component renders all states correctly (idle, in progress, success, complete) with appropriate styling
  QA scenarios: Render component with mock feedback objects → verify each state renders correctly. Evidence: .omo/evidence/task-8-guide.png
  Commit: Y | feat: add ExerciseGuide UI component

- [ ] 9. **Create App.tsx integration + final QA**
  What to do / Must NOT do: Create `src/App.tsx` and `src/App.css`. Must:
  - Compose WebcamView + ExerciseGuide side by side (or webcam full-width, guide overlay)
  - Wire usePoseDetection hook and ExerciseEngine together
  - Handle loading state while TF.js model loads (show spinner)
  - Handle errors (no webcam, no model) with user-friendly message
  - Style: full viewport, dark background (#111), clean typography
  - Mount App in src/newtab/index.tsx (replace existing NewTab import with App)
  - Delete src/newtab/NewTab.tsx and NewTab.css (no longer needed)
  - Remove src/assets/logo.png if not used
  - Fix any TypeScript errors across all files
  - Run `npm run dev` and test: webcam loads, skeleton tracks, each exercise works
  - Delete .omo/evidence/ placeholder files
  Parallelization: Wave 5 | Blocked by: 7, 8 | Blocks: —
  References: All previous files, newtab.html entry point
  Acceptance criteria: `npm run dev` → app loads → webcam permission → skeleton visible → click Start → exercise flow works end-to-end
  QA scenarios: Full manual test in browser. All 3 exercises: turn head, close eyes, hands up. Verify state transitions and feedback. Evidence: .omo/evidence/task-9-integration.png
  Commit: Y | feat: integrate app with full exercise flow

## Final verification wave
- [ ] F1. Plan compliance audit: Every must-have delivered, no must-not-have present
- [ ] F2. Code quality review: No console.logs, no TODO comments, no unused imports/vars, proper cleanup in useEffect returns
- [ ] F3. Real manual QA: Open in browser, complete all 3 exercises, verify skeleton tracks correctly
- [ ] F4. Scope fidelity: No Chrome extension artifacts remain, no extra features added

## Commit strategy
Single commit chain: 1→2→3→4→5→6→7→8→9. Each commit is atomic (one concern per commit). No squashing.

## Success criteria
- App opens in browser without errors
- Webcam shows mirrored feed with skeleton overlay
- Click "Start" begins exercise 1 (head turns)
- Head turn left → detected, head turn right → detected, exercise completes
- Exercise 2 (eyes close): close eyes → countdown begins, hold 5s → success
- Exercise 3 (hands up): raise hands beside ears → both sides detected → success
- "All exercises complete" screen shown