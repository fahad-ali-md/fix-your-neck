# Draft: Neck Exercise App

**Intent**: CLEAR
**Status**: awaiting-approval
**Pending action**: Write `.omo/plans/neck-exercise-app.md`
**Approach**: Transform the existing Chrome extension into a full-screen webcam-based neck exercise web app

---

## User needs (from prompt)

1. TensorFlow.js via webcam → track head/neck
2. Exercise 1: **Head turn left/right** — detect when user turns head fully left / fully right
3. Exercise 2: **Close eyes for 5 seconds** — detect eye closure and hold timer
4. Exercise 3: **Hands beside ears** — raise arms, check if wrists are level with ears (straight line)
5. Visual feedback showing webcam + skeleton overlay + exercise guidance
6. Neck pain relief from monitor posture — simple exercises anyone can do at a desk

## Existing project

- **Type**: Chrome extension (Vite + React 18 + Manifest v3 + @crxjs/vite-plugin)
- **Root**: `/Users/macm1/Desktop/fix-your-neck/fix-your-neck`
- **Has**: popup, newtab, options, sidepanel, devtools pages (all placeholder)
- **Dependencies**: react 18, react-dom 18, typescript, vite 5
- **Plan**: Repurpose as standalone web app. Remove Chrome-extension cruft. Add TF.js + webcam exercise page.

## Technical decisions (researched, defaults adopted)

### Model: MoveNet Lightning (`@tensorflow-models/pose-detection`)

| Factor | Decision | Why |
|--------|----------|-----|
| Model | **MoveNet Lightning** (SINGLEPOSE_LIGHTNING) | 30-50+ FPS on modern laptops, 17 keypoints, best speed/accuracy balance |
| Alternative considered | BlazePose (33 keypoints) | More keypoints but heavier; not needed for our 3 exercises |
| Fallback | **SINGLEPOSE_THUNDER** if Lightning is inaccurate | User can toggle in settings |
| Smoothing | Enable built-in temporal filter (`enableSmoothing: true`) | Reduces flicker without custom code |
| Backend | WebGL (automatic with TF.js) | GPU acceleration in browser |

### Keypoint usage (MoveNet COCO keypoints, 0-16)

| Index | Name | Used for |
|-------|------|----------|
| 0 | nose | Head position center |
| 1 | left_eye | Blink detection (L) |
| 2 | right_eye | Blink detection (R) |
| 3 | left_ear | Ear level reference for hand raise |
| 4 | right_ear | Ear level reference for hand raise |
| 5 | left_shoulder | Shoulder baseline, neck angle |
| 6 | right_shoulder | Shoulder baseline, neck angle |
| 9 | left_wrist | Hand position for ear-level check |
| 10 | right_wrist | Hand position for ear-level check |

### Exercise detection logic

**1. Head Turn (left/right)**
- Take shoulder midpoint: `mx = (left_shoulder.x + right_shoulder.x) / 2`
- Neck angle = angle between nose, shoulder_midpoint, and horizontal
- Head forward: nose near shoulder midpoint
- Head turned left: nose.x significantly left of left_shoulder.x
- Head turned right: nose.x significantly right of right_shoulder.x
- Use angle threshold (e.g., ±30° from center = "turned")

**2. Eye Closure (5 second hold)**
- Use eye keypoint confidence scores
- Left eye closed: `left_eye.score < threshold` (default 0.3)
- Right eye closed: `right_eye.score < threshold`
- Both eyes closed → start timer → hold 5 seconds → success
- Show countdown (1s... 2s... 3s...)

**3. Hands Beside Ears (straight line check)**
- Hand is "raised": wrist.y < shoulder.y (hand above shoulder)
- Hand is "beside ear": |wrist.y - ear.y| < threshold (vertical alignment)
- Also check wrist.x is outside shoulder.x (arm extended outward, not crossed)
- Left hand: compare left_wrist to left_ear
- Right hand: compare right_wrist to right_ear
- Both sides must pass → success

### App architecture

```
fix-your-neck/
├── index.html              # NEW: entry point for web app (was newtab.html)
├── src/
│   ├── App.tsx             # NEW: main exercise app component
│   ├── App.css             # NEW: styles
│   ├── hooks/
│   │   └── usePoseDetection.ts  # NEW: TF.js detector + webcam hook
│   ├── components/
│   │   ├── WebcamView.tsx      # NEW: webcam + canvas overlay
│   │   ├── ExerciseGuide.tsx   # NEW: exercise instructions UI
│   │   └── ExerciseEngine.ts   # NEW: detection logic for all 3 exercises
│   └── utils/
│       └── poseUtils.ts        # NEW: angle calc, normalization helpers
├── vite.config.ts          # MODIFIED: remove crx plugin, add SPA mode
├── package.json            # MODIFIED: remove crx deps, add @tensorflow/tfjs + pose-detection
└── tsconfig.json           # KEEP same
```

### Must-NOT-Have (out of scope for MVP)
- No Chrome extension APIs (remove crx plugin)
- No background scripts, content scripts, or service workers
- No user accounts or Firebase
- No exercise history/logging
- No audio feedback (just visual)
- No PWA service worker for offline

---

## Questions for user (just 2 genuine owner-decisions)

1. **Full-screen web app vs keep Chrome extension shell?** — We can either (a) strip the Chrome extension and make it a standalone web app served on localhost, or (b) add the exercise page as a new page within the extension. I recommend **(a)** since webcam + TF.js is heavy and Chrome extensions have strict CSP/permissions.
2. **Should we add any exercises beyond the 3 described?** — E.g., chin tucks, shoulder rolls, neck tilts. The plan will include the 3 you mentioned; extras are easy to add later.