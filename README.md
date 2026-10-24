# Fix Your Neck

A webcam neck-exercise coach that runs entirely in your browser. It watches you with an on-device pose model, tells you what to do (on screen and by voice), and only moves to the next step when it sees you actually do it. It also warns you when you slouch.

No server, no account, no upload. Video never leaves your machine.

## Features

- **Guided daily routines.** Seven routines rotate by day, counted from your first launch:
  1. Mobility Baseline
  2. Posture Reset
  3. Desk Neck Relief
  4. Light Recovery
  5. Hands + Neck Coordination
  6. Strength & Control
  7. Assessment Day
- **Step detection.** Each step finishes only when the pose is held:
  - look right, left, down, up (hold 2 s)
  - hands raised beside the head, alone or combined with a head turn
  - chin tucks (counted reps)
  - timed holds (shoulder squeeze, side tilt, breathing)
- **Voice prompts.** Each instruction is spoken with the browser Web Speech API.
- **Posture check.** A multi-signal slouch detector calibrates to your own upright posture for 3 seconds, then scores nose offset, neck length, forward head and torso lean. Measurements are normalized by face height or shoulder width, so distance from the camera does not matter. Frames where you lean sideways are skipped.
- **Camera readiness check.** Asks you to move back or into frame before a routine starts.
- **Live overlay.** Skeleton and face-mesh wireframe drawn on the video, plus a debug panel with neck angle, eye aspect ratio, posture score and hand data.
- **Admin panel.** Tune detection thresholds with sliders, edit camera rules, and build custom reference poses by dragging joints in a pose editor. Saved poses are matched against your live pose with a score.
- **Everything persists locally** in `localStorage` (thresholds, saved poses, routine start date).

## How it works

| Layer | Tech |
|-------|------|
| UI | React 18, TypeScript, plain CSS |
| Build | Vite 5 |
| Body pose | TensorFlow.js + MoveNet (17 keypoints) |
| Face / eyes | MediaPipe FaceMesh via `@tensorflow-models/face-landmarks-detection` (478 landmarks, loaded on demand) |
| Speech | Web Speech API |

The camera hook (`usePoseDetection`) feeds keypoints into a state machine (`tickEngine`) that runs on a 100 ms tick. Hot values live in refs, not React state, so the loop never restarts on re-render.

```
src/
├── newtab/index.tsx          entry, mounts <App />
├── App.tsx                   state owner and game loop
├── constants.ts              skeleton and face-mesh topology
├── hooks/usePoseDetection.ts camera, MoveNet, FaceMesh, rAF loop
├── components/               Header, StartScreen, ExerciseDisplay, CameraOverlay,
│                             DebugPanel, AdminPanel, PoseEditor, SavedPoseList, ...
└── utils/
    ├── exerciseLogic.ts      routines, step engine, neck angle, eye aspect ratio
    ├── postureAnalyzer.ts    slouch detector
    ├── poseMatching.ts       saved-pose vs live-pose comparison
    └── adminExerciseConfig.ts admin config persistence
```

## Getting started

Requirements: Node.js 18+ and a webcam.

```shell
npm install
npm run dev
```

Open the URL Vite prints and allow camera access. Camera access needs `localhost` or HTTPS.

Other scripts:

```shell
npm run build     # type-check, then production build into dist/
npm run preview   # serve the production build
```

## Tips

- Sit so your head and both shoulders are in frame, with some space around you.
- Good front lighting improves eye and face detection.
- If a step does not register, open the admin panel and adjust the matching threshold for it, or use the debug panel to see what the model measures.
- To restart the 7-day rotation, clear `fyn-routine-start-date` from `localStorage`.

## Privacy

All inference runs locally in the browser through TensorFlow.js. The app makes no network calls of its own. The model files are downloaded from their CDN on first load.

## Disclaimer

This is not medical advice. Stop if you feel pain, dizziness or numbness, and see a professional for persistent neck problems.

## License

MIT
