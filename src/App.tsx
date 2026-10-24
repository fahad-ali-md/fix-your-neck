// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  App — Orchestration Root
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    The TOP-LEVEL component that owns ALL application state and coordinates
//    between child components.
//
//    It does NOT render any UI directly — it delegates to sub-components:
//      - Header: title + toggle buttons
//      - CameraOverlay: webcam + skeleton canvas drawing + face mesh wireframe
//      - DebugPanel: real-time AI data overlay (neck angle, EAR, posture, hands)
//      - StartScreen: "Start Exercise" button shown before exercise begins
//      - ExerciseDisplay: exercise phase badge + instruction + progress bar
//      - AdminPanel: admin sidebar with all sub-panels (only when showSettings)
//
//  WHERE THE DATA COMES FROM:
//    - usePoseDetection() hook: manages webcam, MoveNet, FaceMesh lifecycle
//      Returns: videoRef, poses (detected keypoints), face (mesh data),
//               isModelLoaded (bool), error (string|null), detectFace (async fn)
//    - createEngine(): creates exercise state machine (exerciseLogic module)
//    - loadAdminConfig(): loads saved admin config from localStorage
//    - loadConfig(): loads ExerciseConfig (mutable global) from localStorage
//
//  REACT STATE (managed here):
//    | State | Type | Purpose |
//    |-------|------|---------|
//    | started | boolean | Is exercise running? |
//    | feedback | ExerciseFeedback | Current instruction + status + progress |
//    | state | ExerciseState | Current exercise phase (idle/look_right/look_left/...) |
//    | showDebug | boolean | Toggle debug panel overlay |
//    | showSettings | boolean | Toggle admin sidebar |
//    | forceRender | number | Dummy state to force re-render after config change |
//    | adminConfig | AdminExerciseConfig | All admin settings (poses, camera rules, etc.) |
//    | editingPose | SavedPose | Currently-being-edited pose in the admin panel |
//    | poseNameInput | string | Text input for pose name in admin panel |
//
//  REFS (high-frequency data, no re-render):
//    - engineRef: exercise state machine (ticked at 100ms)
//    - lastTimeRef: timestamp for delta-time calculations in game loop
//    - posesRef, faceRef: latest pose/face data for game loop (avoids deps)
//    - debugRef: latest computed debug values for DebugPanel (avoids re-renders)
//    - showDebugRef, startedRef: sync toggles for interval closure
//    - videoRef: from hook — the <video> element ref
//
//  DATA FLOW:
//    React render → passes state as props to children
//    Game loop interval (100ms) → reads from refs, updates engine, calls setState
//    CameraOverlay → receives poses+face, draws skeleton on <canvas> via useEffect
//    DebugPanel → reads debugRef.current (no state, no re-render)
//    AdminPanel → receives all admin state + setters, coordinates sub-panels
//
//  WHY THESE REFS EXIST (NOT STATE):
//    The game loop runs at ~100ms via setInterval. If it depended on React state
//    (like poses, face), the interval would need them in its dependency array,
//    causing it to restart every frame. Instead, the loop reads from refs which
//    are always up-to-date. This is the "ref pattern" for performance-critical
//    data that doesn't need synchronous rendering.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Imports ──────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, useCallback } from 'react'
import { usePoseDetection, PoseData, FaceData } from './hooks/usePoseDetection'
import {
  createEngine, tickEngine, getNeckAngle, eyeEAR,
  LEFT_EYE_EAR, RIGHT_EYE_EAR,
  ExerciseState, ExerciseFeedback, Keypoint, handDebug, HandDebug,
  ExerciseConfig,
} from './utils/exerciseLogic'
import { analyzePosture } from './utils/postureAnalyzer'
import {
  loadAdminConfig, saveAdminConfig, getActivePose,
} from './utils/adminExerciseConfig'
import type { AdminExerciseConfig, SavedPose } from './utils/adminExerciseConfig'
import { defaultEditablePose } from './utils/poseMatching'
import Header from './components/Header'
import StartScreen from './components/StartScreen'
import ExerciseDisplay from './components/ExerciseDisplay'
import CameraOverlay from './components/CameraOverlay'
import AdminPanel from './components/AdminPanel'
import './App.css'

// ──────────────────────────────────────────────────────────────────────────────
//  MODULE-LEVEL (not React state) — ExerciseConfig persistence
// ──────────────────────────────────────────────────────────────────────────────

// ExerciseConfig is a GLOBAL mutable object (defined in exerciseLogic.ts).
// It holds detection thresholds that the game loop reads on every tick.
// We persist it to localStorage separately from the admin config because it's
// a plain JS object — not React state — and the sliders write to it directly.
const CONFIG_KEY = 'fyn-exercise-config'
const READY_MAX_SHOULDER_RATIO = 0.48
const READY_CLEAR_SHOULDER_RATIO = 0.45
const READY_MIN_KEYPOINT_SCORE = 0.2
const READINESS_STABLE_FRAMES = 5

interface CameraReadiness {
  ready: boolean
  message: string | null
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) Object.assign(ExerciseConfig, JSON.parse(raw))
  } catch { /* ignore corrupt data */ }
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(ExerciseConfig, null, 2))
}

function getCameraReadiness(poses: PoseData[], previousReady = false): CameraReadiness {
  const keypoints = poses[0]?.keypoints
  if (!keypoints) {
    return { ready: false, message: 'Step back until your full upper body is visible.' }
  }

  const kp = (name: string) => keypoints.find(k => k.name === name)
  const nose = kp('nose')
  const leftShoulder = kp('left_shoulder')
  const rightShoulder = kp('right_shoulder')

  if (!nose || !leftShoulder || !rightShoulder ||
      nose.score < READY_MIN_KEYPOINT_SCORE ||
      leftShoulder.score < READY_MIN_KEYPOINT_SCORE ||
      rightShoulder.score < READY_MIN_KEYPOINT_SCORE) {
    return { ready: false, message: 'Keep your face and shoulders in the camera frame.' }
  }

  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x)
  const shoulderRatio = shoulderWidth / 640
  const maxRatio = previousReady ? READY_MAX_SHOULDER_RATIO : READY_CLEAR_SHOULDER_RATIO
  if (shoulderRatio > maxRatio) {
    return { ready: false, message: 'Please sit a little farther back.' }
  }

  return { ready: true, message: null }
}

// Sync-load before first render so ExerciseConfig has saved values immediately.
// This prevents a "flash" where the UI shows defaults for one frame then
// switches to saved values on the next.
loadConfig()

// ──────────────────────────────────────────────────────────────────────────────
//  COMPONENT
// ──────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Camera + AI model ──────────────────────────────────────────────────────
  const { videoRef, poses, face, isModelLoaded, error, detectFace } = usePoseDetection()

  // ── Exercise state machine ─────────────────────────────────────────────────
  const engineRef = useRef(createEngine())
  const [feedback, setFeedback] = useState<ExerciseFeedback>(engineRef.current.feedback)
  const [state, setState] = useState<ExerciseState>('idle')
  const [started, setStarted] = useState(false)
  const lastTimeRef = useRef(performance.now())

  // ── Refs for high-frequency pose/face data ──
  // Written every render (React), read by the game loop interval (refs).
  // This avoids putting `poses` and `face` in the interval's dependency array,
  // which would cause it to be re-created on every camera frame.
  const posesRef = useRef<PoseData[]>([])
  const faceRef = useRef<FaceData | null>(null)

  // ── Debug ref — written by game loop, read by DebugPanel (no re-render) ──
  const debugRef = useRef({
    angle: '—', leftEAR: '—', rightEAR: '—', avgEAR: '—', threshold: '—', face: '—',
    leftEyeOpen: null as boolean | null, rightEyeOpen: null as boolean | null,
    leftHand: null as HandDebug | null, rightHand: null as HandDebug | null,
    posture: '—' as string,
    nose: '—' as string, leftShoulder: '—' as string, rightShoulder: '—' as string,
    // Face-anchored metrics
    faceHeight: '—', shoulderWidth: '—',
    noseOffset: '—', neckLength: '—', forwardHead: '—',
    score: '—', holdMs: '—',
    // Rejection info
    rejection: '—', shoulderSymmetry: '—', faceRoll: '—', torsoAngle: '—',
  })

  // ── UI toggle state ────────────────────────────────────────────────────────
  const [showDebug, setShowDebug] = useState(false)
  const showDebugRef = useRef(showDebug)
  const [showSettings, setShowSettings] = useState(false)
  const startedRef = useRef(started)
  startedRef.current = started
  const lastFaceDetectRef = useRef(0)
  const [, forceRender] = useState(0)  // dummy — forces re-render after ExerciseConfig change

  // ── Admin config (persisted to localStorage) ──
  const [adminConfig, setAdminConfig] = useState<AdminExerciseConfig>(() => loadAdminConfig())
  const [editingPose, setEditingPose] = useState<SavedPose>(
    () => getActivePose(adminConfig) ?? defaultEditablePose(),
  )
  const [poseNameInput, setPoseNameInput] = useState(editingPose.name)
  const [cameraReadiness, setCameraReadiness] = useState<CameraReadiness>({
    ready: false,
    message: 'Step back until your full upper body is visible.',
  })
  const rawReadinessRef = useRef<CameraReadiness>(cameraReadiness)
  const readinessStreakRef = useRef(0)

  // Write pose/face data to refs on every render so the game loop
  // always has the latest data without depending on React state.
  posesRef.current = poses
  showDebugRef.current = showDebug

  useEffect(() => {
    const raw = getCameraReadiness(poses, cameraReadiness.ready)
    const previousRaw = rawReadinessRef.current
    const sameRaw =
      raw.ready === previousRaw.ready &&
      raw.message === previousRaw.message

    readinessStreakRef.current = sameRaw ? readinessStreakRef.current + 1 : 1
    rawReadinessRef.current = raw

    if (
      readinessStreakRef.current >= READINESS_STABLE_FRAMES &&
      (raw.ready !== cameraReadiness.ready || raw.message !== cameraReadiness.message)
    ) {
      setCameraReadiness(raw)
    }
  }, [poses, cameraReadiness])

  // ── Sync admin config to localStorage ──
  function updateConfig(next: AdminExerciseConfig) {
    setAdminConfig(next)
    saveAdminConfig(next)
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  GAME LOOP — runs every 100ms
  // ────────────────────────────────────────────────────────────────────────────
  // Reads pose data from REFS (not state) to avoid dependency churn.
  // Updates:
  //   1. debugRef — neck angle, EAR values, posture, hand data
  //   2. engine state + feedback (when exercise is running)
  //   3. faceRef — FaceMesh data (only when debug is on)
  useEffect(() => {
    if (!started && !showDebug) return  // nothing to compute when idle + no debug

    const interval = setInterval(async () => {
      const now = performance.now()
      const dt = now - lastTimeRef.current
      lastTimeRef.current = now

      const currentPoses = posesRef.current
      if (currentPoses.length > 0 && currentPoses[0].keypoints) {
        const kps = currentPoses[0].keypoints as Keypoint[]

        // ── Face detection (throttled) ──
        // FaceMesh is expensive. This first exercise does not need it, so only
        // refresh face landmarks occasionally for debug/diagnostics.
        if (showDebugRef.current && now - lastFaceDetectRef.current >= 1000) {
          try {
            lastFaceDetectRef.current = now
            const f = await detectFace()
            if (f) faceRef.current = f
          } catch {
            /* ignore transient WASM errors during hot-reload */
          }
        }

        const faceKps = faceRef.current?.keypoints
        const angle = getNeckAngle(kps)
        const le = faceKps ? eyeEAR(faceKps, LEFT_EYE_EAR) : -1
        const re = faceKps ? eyeEAR(faceKps, RIGHT_EYE_EAR) : -1
        const EAR_THRESHOLD = engineRef.current.eyeThreshold
        const avgEAR = le >= 0 && re >= 0 ? (le + re) / 2 : -1

        const fmtKp = (name: string) => {
          const kp = kps.find(k => k.name === name)
          return kp ? `${Math.round(kp.x)}, ${Math.round(kp.y)} (${kp.score.toFixed(2)})` : '—'
        }

        // ── Posture analysis (face-height normalized, 4-signal weighted) ──────
        // Passes the full keypoints array so the analyzer extracts what it needs
        // including eyes, ears, shoulders, and hips for rejection gates.
        const pa = analyzePosture(kps, angle, now)

        // Posture label with color indicator
        const postureLabel = !pa.calibrated
          ? `Calibrating… ${pa.pct}%`
          : pa.frameRejected
            ? `— (${pa.rejectReason})`
            : pa.posture === 'GOOD_POSTURE'
              ? `✅ Good (${pa.score})`
              : `🔴 Slouched (${pa.score})`

        // Write to ref — DebugPanel reads this directly (no state, no re-render)
        debugRef.current = {
          angle: angle !== null ? Math.round(angle) + '°' : '—',
          leftEAR: le >= 0 ? le.toFixed(3) : '—',
          rightEAR: re >= 0 ? re.toFixed(3) : '—',
          avgEAR: avgEAR >= 0 ? avgEAR.toFixed(3) : '—',
          threshold: EAR_THRESHOLD.toFixed(3),
          face: faceKps ? String(faceKps.length) + ' pts' : 'off',
          leftEyeOpen: le >= 0 ? le >= EAR_THRESHOLD : null,
          rightEyeOpen: re >= 0 ? re >= EAR_THRESHOLD : null,
          leftHand: handDebug(kps, 'left'),
          rightHand: handDebug(kps, 'right'),
          posture: postureLabel,
          nose: fmtKp('nose'),
          leftShoulder: fmtKp('left_shoulder'),
          rightShoulder: fmtKp('right_shoulder'),
          // Face-anchored metrics
          faceHeight: pa.faceHeight.toFixed(1),
          shoulderWidth: pa.shoulderWidth.toFixed(1),
          noseOffset: pa.calibrated ? pa.smoothedNoseOffset.toFixed(4) : pa.noseOffset.toFixed(4),
          neckLength: pa.calibrated ? pa.smoothedNeckLength.toFixed(4) : pa.neckLength.toFixed(4),
          forwardHead: pa.calibrated ? pa.smoothedForwardHead.toFixed(4) : pa.forwardHead.toFixed(4),
          score: pa.calibrated ? String(pa.score) : '—',
          holdMs: pa.holdMs.toFixed(0),
          // Rejection info
          rejection: pa.frameRejected ? pa.rejectReason : '—',
          shoulderSymmetry: pa.shoulderSymmetry.toFixed(3),
          faceRoll: pa.faceRoll.toFixed(1) + '°',
          torsoAngle: pa.torsoAngle.toFixed(1) + '°',
        }

        // ── Tick the state machine (only when exercise is running) ──
        if (started) {
          engineRef.current = tickEngine(engineRef.current, kps, dt, faceKps)
          setFeedback({ ...engineRef.current.feedback })
          setState(engineRef.current.current)
        }

        if (showDebugRef.current) {
          console.debug(
            `neck:${debugRef.current.angle}` +
            ` posture:${debugRef.current.posture}` +
            ` state:${engineRef.current.current}`,
          )
        }
      }
    }, 100)

    return () => clearInterval(interval)
  }, [started, detectFace, showDebug])

  // ────────────────────────────────────────────────────────────────────────────
  //  EVENT HANDLERS
  // ────────────────────────────────────────────────────────────────────────────

  // Called when user clicks "Start Exercise"
  const handleStart = useCallback(() => {
    if (!cameraReadiness.ready) return

    engineRef.current = createEngine()
    engineRef.current.current = 'calibrate'
    lastTimeRef.current = performance.now()
    setStarted(true)
    setState('calibrate')
    setFeedback({
      instruction: 'Look straight at the camera',
      status: 'waiting',
      progress: 0,
      label: 'Center',
      routineTitle: `Day ${engineRef.current.routineDay}: ${engineRef.current.routineTitle}`,
      voice: 'Look straight at the camera.',
    })
  }, [cameraReadiness.ready])

  // Called when user clicks "Restart" after exercise completes
  const handleRestart = useCallback(() => {
    setStarted(false)
    setState('idle')
    setFeedback({ instruction: 'Click Start to begin', status: 'waiting' })
  }, [])

  // ────────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ────────────────────────────────────────────────────────────────────────────
  // App does NOT render any JSX directly — it delegates to 6 sub-components.
  // Each component receives only the props it needs (no over-propagation).
  return (
    <div className="app">

      {/* ── Header: title bar + toggle buttons ── */}
      <Header
        showSettings={showSettings}
        showDebug={showDebug}
        onToggleSettings={() => setShowSettings(s => !s)}
        onToggleDebug={() => setShowDebug(d => !d)}
      />

      <div className="main-area">

        {/* ── Camera area ── */}
        {/* CameraOverlay renders its own .camera-container wrapper internally */}
        <CameraOverlay
          videoRef={videoRef}
          poses={poses}
          face={face}
          showDebug={showDebug}
          state={state}
          isModelLoaded={isModelLoaded}
          error={error}
          started={started}
          debugRef={debugRef}
          readinessMessage={!started ? cameraReadiness.message : null}
        />

        {/* ── Right panel: start screen / exercise display / admin sidebar ── */}
        <div className={`guide-panel${showSettings ? ' admin-open' : ''}`}>

          {/* Before exercise starts (and admin panel is closed) */}
          {!started && !showSettings && (
            <StartScreen
              onStart={handleStart}
              disabled={!cameraReadiness.ready}
              readinessMessage={cameraReadiness.message}
              routineTitle={`Day ${engineRef.current.routineDay}: ${engineRef.current.routineTitle}`}
            />
          )}

          {/* During exercise (admin panel is closed) */}
          {started && !showSettings && (
            <ExerciseDisplay
              state={state}
              feedback={feedback}
              onRestart={handleRestart}
            />
          )}

          {/* Admin panel open */}
          {showSettings && (
            <AdminPanel
              adminConfig={adminConfig}
              editingPose={editingPose}
              poseNameInput={poseNameInput}
              onNameChange={setPoseNameInput}
              onForceRender={forceRender}
              onSaveConfig={saveConfig}
              onSetEditingPose={setEditingPose}
              onUpdateConfig={updateConfig}
            />
          )}
        </div>
      </div>
    </div>
  )
}
