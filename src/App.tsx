import { useEffect, useRef, useState, useCallback } from 'react'
import { usePoseDetection, PoseData, FaceData } from './hooks/usePoseDetection'
import { createEngine, tickEngine, getNeckAngle, eyeEAR, LEFT_EYE_EAR, RIGHT_EYE_EAR, ExerciseState, ExerciseFeedback, Keypoint, handDebug, HandDebug, detectSlouch, ExerciseConfig, checkPosition, PositionCheck } from './utils/exerciseLogic'
import { loadAdminConfig, saveAdminConfig, resetAdminConfig, upsertPose, deletePose, getActivePose } from './utils/adminExerciseConfig'
import type { AdminExerciseConfig, SavedPose } from './utils/adminExerciseConfig'
import { defaultEditablePose, scalePoseToCanvas, hitTestJoint, updateJoint, compareSavedPoseToLive } from './utils/poseMatching'
import './App.css'

const SKELETON_EDGES: [number, number][] = [
  [0,1],[0,2],[1,3],[2,4],[0,5],[0,6],[5,6],[5,7],[7,9],[6,8],[8,10],
  [5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]
]

// MediaPipe FaceMesh contour connections (face oval + lips + eyes + eyebrows)
const FACE_CONTOURS: [number, number][] = [
  [61,146],[146,91],[91,181],[181,84],[84,17],[17,314],[314,405],[405,321],[321,375],[375,291],
  [61,185],[185,40],[40,39],[39,37],[37,0],[0,267],[267,269],[269,270],[270,409],[409,291],
  [78,95],[95,88],[88,178],[178,87],[87,14],[14,317],[317,402],[402,318],[318,324],[324,308],
  [78,191],[191,80],[80,81],[81,82],[82,13],[13,312],[312,311],[311,310],[310,415],[415,308],
  [263,249],[249,390],[390,373],[373,374],[374,380],[380,381],[381,382],[382,362],
  [263,466],[466,388],[388,387],[387,386],[386,385],[385,384],[384,398],[398,362],
  [276,283],[283,282],[282,295],[295,285],[300,293],[293,334],[334,296],[296,336],
  [33,7],[7,163],[163,144],[144,145],[145,153],[153,154],[154,155],[155,133],
  [33,246],[246,161],[161,160],[160,159],[159,158],[158,157],[157,173],[173,133],
  [46,53],[53,52],[52,65],[65,55],[70,63],[63,105],[105,66],[66,107],
  [10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],[356,454],
  [454,323],[323,361],[361,288],[288,397],[397,365],[365,379],[379,378],[378,400],
  [400,377],[377,152],[152,148],[148,176],[176,149],[149,150],[150,136],[136,172],
  [172,58],[58,132],[132,93],[93,234],[234,127],[127,162],[162,21],[21,54],
  [54,103],[103,67],[67,109],[109,10],
  // nose bridge
  [168,6],[6,197],[197,195],[195,5],[5,4],[4,1],[1,19],[19,94],[94,2],
]

// ponytail: module-level config persistence, no hook needed
const CONFIG_KEY = 'fyn-exercise-config'
function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) Object.assign(ExerciseConfig, JSON.parse(raw))
  } catch { /* ignore corrupt data */ }
}
function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(ExerciseConfig, null, 2))
}

// ponytail: sync load before first render — no flash
loadConfig()

export default function App() {
  const { videoRef, poses, face, isModelLoaded, error, detectFace } = usePoseDetection()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [started, setStarted] = useState(false)
  const engineRef = useRef(createEngine())
  const [feedback, setFeedback] = useState<ExerciseFeedback>(engineRef.current.feedback)
  const [state, setState] = useState<ExerciseState>('idle')
  const lastTimeRef = useRef(performance.now())
  // ponytail: ref keeps latest poses without triggering re-render effects
  const posesRef = useRef<PoseData[]>([])
  const faceRef = useRef<FaceData | null>(null)
  const debugRef = useRef({
    angle: '—', leftEAR: '—', rightEAR: '—', avgEAR: '—', threshold: '—', face: '—',
    leftEyeOpen: null as boolean | null, rightEyeOpen: null as boolean | null,
    leftHand: null as HandDebug | null, rightHand: null as HandDebug | null,
    posture: '—' as string,
  })
  const [showDebug, setShowDebug] = useState(false)
  const showDebugRef = useRef(showDebug)
  const [showSettings, setShowSettings] = useState(false)
  const startedRef = useRef(started)
  startedRef.current = started
  const [pos] = useState<PositionCheck>({ ok: true, message: '', blocked: '' })
  const [, forceRender] = useState(0) // dummy state to trigger re-render on slider change

  const [adminConfig, setAdminConfig] = useState<AdminExerciseConfig>(() => loadAdminConfig())
  const [editingPose, setEditingPose] = useState<SavedPose>(() => getActivePose(adminConfig) ?? defaultEditablePose())
  const [poseNameInput, setPoseNameInput] = useState(editingPose.name)
  const editorCanvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ jointName: string | null; dragging: boolean }>({ jointName: null, dragging: false })

  function updateConfig(next: AdminExerciseConfig) {
    setAdminConfig(next)
    saveAdminConfig(next)
  }

  function loadPoseIntoEditor(pose: SavedPose) {
    setEditingPose(pose)
    setPoseNameInput(pose.name)
  }

  // ponytail: ref-based access to latest admin config + camera rules for effects
  const adminConfigRef = useRef(adminConfig)
  adminConfigRef.current = adminConfig
  // ponytail: sync to ExerciseConfig during render (no useEffect delay) so checkPosition
  // always reads current values even if the canvas effect hasnt re-run
  ExerciseConfig.posMinShoulderRatio = adminConfig.cameraRules.minShoulderRatio
  ExerciseConfig.posMaxShoulderRatio = adminConfig.cameraRules.maxShoulderRatio

  const matchHoldRef = useRef(0)
  const [matchScore, setMatchScore] = useState<number | null>(null)
  const [matchPassed, setMatchPassed] = useState(false)
  const matchPassedRef = useRef(false)
  const activeTargetNameRef = useRef<string | null>(null)
  const [activeTargetName, setActiveTargetName] = useState<string | null>(() => {
    const active = getActivePose(adminConfig)
    return active ? active.name : null
  })
  useEffect(() => {
    const active = getActivePose(adminConfig)
    const name = active ? active.name : null
    activeTargetNameRef.current = name
    setActiveTargetName(name)
    matchPassedRef.current = false
    setMatchPassed(false)
    matchHoldRef.current = 0
  }, [adminConfig.activePoseId, adminConfig.poses])

  // Keep refs in sync (no trigger)
  posesRef.current = poses
  showDebugRef.current = showDebug

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const vw = video.videoWidth || 640
    const vh = video.videoHeight || 480
    canvas.width = vw
    canvas.height = vh

    // Account for object-fit: contain letterboxing.
    // The video element fills its CSS box but the actual picture may be
    // smaller with black bars.  We size the canvas element to exactly
    // match the rendered picture area so coordinates don't drift.
    const containerW = video.clientWidth
    const containerH = video.clientHeight
    const scale = Math.min(containerW / vw, containerH / vh)
    const renderedW = vw * scale
    const renderedH = vh * scale
    const offsetX = (containerW - renderedW) / 2
    const offsetY = (containerH - renderedH) / 2
    canvas.style.width = renderedW + 'px'
    canvas.style.height = renderedH + 'px'
    canvas.style.left = offsetX + 'px'
    canvas.style.top = offsetY + 'px'
    canvas.style.right = 'unset'
    canvas.style.bottom = 'unset'

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (poses.length > 0 && poses[0].keypoints) {
      const kps = poses[0].keypoints
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 3
      for (const [i, j] of SKELETON_EDGES) {
        const a = kps[i]; const b = kps[j]
        if (a && b && a.score > 0.2 && b.score > 0.2) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
      }
      for (const kp of kps) {
        if (kp.score > 0.3) {
          ctx.beginPath(); ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI)
          ctx.fillStyle = kp.score > 0.5 ? '#00ff88' : '#ffaa00'
          ctx.fill()
        }
      }
      // ponytail: position check temporarily disabled
      // if (!startedRef.current) {
      //   const liveKps = poses[0].keypoints as unknown as Keypoint[]
      //   let next = checkPosition(liveKps, canvas.width)
      //   if (next.blocked === 'distance') {
      //     const ls = liveKps.find(k => k.name === 'left_shoulder')
      //     const rs = liveKps.find(k => k.name === 'right_shoulder')
      //     if (ls && rs) {
      //       const ratio = (Math.hypot(ls.x - rs.x, ls.y - rs.y) / canvas.width).toFixed(3)
      //       next.message += ` (ratio: ${ratio}, min: ${ExerciseConfig.posMinShoulderRatio}, max: ${ExerciseConfig.posMaxShoulderRatio})`
      //     }
      //   }
      //   const cfg = adminConfigRef.current
      //   if (next.ok && cfg.cameraRules.requireWrists) {
      //     const lw = liveKps.find((k: any) => k.name === 'left_wrist')
      //     const rw = liveKps.find((k: any) => k.name === 'right_wrist')
      //     if (!lw || lw.score < 0.2 || !rw || rw.score < 0.2) {
      //       next = { ok: false, message: 'Show both wrists to the camera', blocked: 'wrists' }
      //     }
      //   }
      //   if (next.ok) positionReadyRef.current = true
      //   setPos(p => p.ok === next.ok && p.message === next.message ? p : next)
      //   const activePose = getActivePose(cfg)
      //   if (activePose && next.ok) {
      //     const result = compareSavedPoseToLive(activePose, liveKps, cfg.matchTolerance)
      //     const held = result.matched ? matchHoldRef.current + 33 : 0
      //     matchHoldRef.current = held
      //     if (held >= cfg.holdMs) {
      //       if (!matchPassedRef.current) {
      //         matchPassedRef.current = true
      //         setMatchPassed(true)
      //       }
      //     }
      //     setMatchScore(result.matched ? Math.round((1 - result.score) * 100) : null)
      //   } else {
      //     if (!activePose) setMatchScore(null)
      //   }
      // }
    }
    // draw face mesh wireframe when debug is on
    if (showDebug && face && face.keypoints.length > 0) {
      const fkps = face.keypoints
      const fp = (i: number) => fkps[i] ? { x: fkps[i].x, y: fkps[i].y } : null
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.4)'
      ctx.lineWidth = 1
      for (const [i, j] of FACE_CONTOURS) {
        const a = fp(i); const b = fp(j)
        if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke() }
      }
      // highlight eye landmarks used for EAR
      for (let i = 0; i < fkps.length; i++) {
        if (LEFT_EYE_EAR.includes(i as never) || RIGHT_EYE_EAR.includes(i as never)) {
          const p = fp(i); if (!p) continue
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI)
          ctx.fillStyle = '#ff3366'; ctx.fill()
        }
      }
    }
  }, [poses, face, showDebug, videoRef])

  // ponytail: draw editor skeleton canvas (green, draggable joints)
  useEffect(() => {
    const canvas = editorCanvasRef.current
    if (!canvas || !showSettings) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // ponytail: match CSS size; admin sidebar is ~480px wide, canvas ~400px
    const EDITOR_W = 380
    const EDITOR_H = 360
    canvas.width = EDITOR_W
    canvas.height = EDITOR_H

    ctx.clearRect(0, 0, EDITOR_W, EDITOR_H)
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, EDITOR_W, EDITOR_H)

    const scaled = scalePoseToCanvas(editingPose, EDITOR_W, EDITOR_H)
    const kpMap = new Map(scaled.map(j => [j.name, j]))

    // skeleton edges from MoveNet layout
    const edges: [string, string][] = [
      ['left_ear', 'left_eye'], ['right_ear', 'right_eye'],
      ['left_eye', 'nose'], ['right_eye', 'nose'],
      ['nose', 'left_shoulder'], ['nose', 'right_shoulder'],
      ['left_shoulder', 'right_shoulder'],
      ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
      ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
      ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
      ['left_hip', 'right_hip'],
      ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
      ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
    ]

    ctx.strokeStyle = '#00ff88'
    ctx.lineWidth = 2
    for (const [a, b] of edges) {
      const p1 = kpMap.get(a)
      const p2 = kpMap.get(b)
      if (p1 && p2) {
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
      }
    }

    // joint dots
    for (const j of scaled) {
      ctx.beginPath(); ctx.arc(j.x, j.y, 6, 0, 2 * Math.PI)
      ctx.fillStyle = '#00ff88'
      ctx.fill()
      ctx.strokeStyle = '#007744'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }, [editingPose, showSettings])

  // ponytail: stable interval reads poses from ref, no dependency thrash
  useEffect(() => {
    if (!started && !showDebug) return
    const interval = setInterval(async () => {
      const now = performance.now()
      const dt = now - lastTimeRef.current
      lastTimeRef.current = now
      const currentPoses = posesRef.current
      if (currentPoses.length > 0 && currentPoses[0].keypoints) {
        const kps = currentPoses[0].keypoints as Keypoint[]
        
        if (showDebugRef.current) {
          try { const f = await detectFace(); if (f) faceRef.current = f }
          catch { /* ignore transient WASM errors during hot-reload */ }
        }
        const faceKps = faceRef.current?.keypoints
        const angle = getNeckAngle(kps)
        const slouch = detectSlouch(kps)
        const le = faceKps ? eyeEAR(faceKps, LEFT_EYE_EAR) : -1
        const re = faceKps ? eyeEAR(faceKps, RIGHT_EYE_EAR) : -1
        const EAR_THRESHOLD = engineRef.current.eyeThreshold
        const avgEAR = le >= 0 && re >= 0 ? (le + re) / 2 : -1
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
          posture: slouch.baseline > 0
            ? `${slouch.isSlouching ? '🔴 Slouch' : '✅ Upright'} (${slouch.ratio.toFixed(2)}/bl ${slouch.baseline.toFixed(2)})`
            : `Calibrating… (${slouch.ratio.toFixed(2)})`,
        }
        if (started) {
          engineRef.current = tickEngine(engineRef.current, kps, dt, faceKps)
          setFeedback({ ...engineRef.current.feedback })
          setState(engineRef.current.current)
        }
        console.log(`neck:${debugRef.current.angle} L-EAR:${debugRef.current.leftEAR} R-EAR:${debugRef.current.rightEAR} posture:${debugRef.current.posture} state:${engineRef.current.current}`)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [started, detectFace, showDebug])

  const handleStart = useCallback(() => {
    engineRef.current = createEngine()
    engineRef.current.current = 'head_turn'
    lastTimeRef.current = performance.now()
    setStarted(true)
    setState('head_turn')
    setFeedback({ instruction: 'Turn your head LEFT ←', status: 'waiting' })
  }, [])

  const handleRestart = useCallback(() => {
    setStarted(false); setState('idle')
    setFeedback({ instruction: 'Click Start to begin', status: 'waiting' })
  }, [])

  const progressPct = feedback.progress ? Math.round(feedback.progress * 100) : 0

  return (
    <div className="app">
      <header>
        <h1>Fix Your Neck</h1>
        <p className="subtitle">AI-powered neck exercise tracker</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-debug" onClick={() => setShowSettings(s => !s)}>
            {showSettings ? '⚙️ Admin Panel OPEN' : '⚙️ Admin Panel'}
          </button>
          <button className="btn-debug" onClick={() => setShowDebug(d => !d)}>
            {showDebug ? 'Debug ON' : 'Debug'}
          </button>
        </div>
      </header>

      <div className="main-area">
        <div className="camera-container">
          <div className={`zoom-wrapper${state === 'eyes_close' ? ' zoom-active' : ''}`}>
            <canvas ref={canvasRef} className="overlay" />
            {/* Added width and height so MediaPipe calculates coordinates accurately based on intrinsic video size, instead of CSS size */}
            <video ref={videoRef} width={640} height={480} playsInline muted className="webcam" />
          </div>
          {showDebug && (
            <div className="debug-panel">
              <div>Neck: {debugRef.current.angle}</div>
              <div>
                L-EAR: {debugRef.current.leftEAR}
                {debugRef.current.leftEyeOpen !== null && (
                  <span className={debugRef.current.leftEyeOpen ? 'ear-open' : 'ear-closed'}>
                    {debugRef.current.leftEyeOpen ? ' 👁 OPEN' : ' 🔴 CLOSED'}
                  </span>
                )}
              </div>
              <div>
                R-EAR: {debugRef.current.rightEAR}
                {debugRef.current.rightEyeOpen !== null && (
                  <span className={debugRef.current.rightEyeOpen ? 'ear-open' : 'ear-closed'}>
                    {debugRef.current.rightEyeOpen ? ' 👁 OPEN' : ' 🔴 CLOSED'}
                  </span>
                )}
              </div>
              <div>Avg EAR: <b>{debugRef.current.avgEAR}</b></div>
              <div>Threshold: <b>{debugRef.current.threshold}</b></div>
              <div>Face: {debugRef.current.face}</div>
              <div>Posture: {debugRef.current.posture}</div>
              <div className="debug-state">{state}</div>
            </div>
          )}
          
          {error && <div className="error-msg">{error}</div>}
          {!isModelLoaded && !error && (
            <div className="loading">
              <div className="spinner"></div>
              <p>{started ? 'Loading AI model...' : 'Starting camera...'}</p>
            </div>
          )}
        </div>

        <div className={`guide-panel${showSettings ? ' admin-open' : ''}`}>
          {!started && !showSettings && (
            <div className="start-screen">
              <button className="btn-start" onClick={handleStart}>
                Start Exercise
              </button>
            </div>
          )}

          {started && !showSettings && (
            <div className="exercise-display">
              <div className={`exercise-badge ${state}`}>
                {state === 'head_turn' && '🔄 Head Turns'}
                {state === 'eyes_close' && '😌 Eye Closure'}
                {state === 'hands_up' && '✋ Hands Up'}
                {state === 'complete' && '🎉 Complete!'}
              </div>

              <div className={`instruction ${feedback.status}`}>
                {feedback.instruction}
              </div>

              {feedback.progress !== undefined && state !== 'complete' && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progressPct}%` }}></div>
                </div>
              )}

              {state === 'complete' && (
                <button className="btn-restart" onClick={handleRestart}>Restart</button>
              )}
            </div>
          )}

          {showSettings && (
            <div className="admin-sidebar">
              <h3 style={{ margin: '0 0 16px', color: '#00ff88', fontSize: '1rem' }}>⚙️ Admin Panel</h3>

              <section>
                <h4>Live Calibrations</h4>
                <div className="setting-row">
                  <div><label>Hand-Ear Distance</label> <span>{ExerciseConfig.handEarMaxDist}px</span></div>
                  <input type="range" min="30" max="250" step="5" value={ExerciseConfig.handEarMaxDist} 
                    onChange={e => { ExerciseConfig.handEarMaxDist = Number(e.target.value); saveConfig(); forceRender(v => v+1) }} />
                </div>
                <div className="setting-row">
                  <div><label>Slouch Ratio Limit</label> <span>{ExerciseConfig.slouchRatioMultiplier}x</span></div>
                  <input type="range" min="0.6" max="1.0" step="0.01" value={ExerciseConfig.slouchRatioMultiplier} 
                    onChange={e => { ExerciseConfig.slouchRatioMultiplier = Number(e.target.value); saveConfig(); forceRender(v => v+1) }} />
                </div>
                <div className="setting-row">
                  <div><label>Eye Close EAR</label> <span>{ExerciseConfig.eyeCloseMultiplier}x</span></div>
                  <input type="range" min="0.5" max="0.9" step="0.01" value={ExerciseConfig.eyeCloseMultiplier} 
                    onChange={e => { ExerciseConfig.eyeCloseMultiplier = Number(e.target.value); saveConfig(); forceRender(v => v+1) }} />
                </div>
                <div className="setting-row">
                  <div><label>Head Turn Angle</label> <span>{ExerciseConfig.headTurnAngle}°</span></div>
                  <input type="range" min="10" max="60" step="1" value={ExerciseConfig.headTurnAngle} 
                    onChange={e => { ExerciseConfig.headTurnAngle = Number(e.target.value); saveConfig(); forceRender(v => v+1) }} />
                </div>
                <button className="btn-copy" onClick={() => {
                  const json = JSON.stringify(ExerciseConfig, null, 2)
                  navigator.clipboard.writeText(json).catch(() => {})
                  saveConfig()
                }}>📋 Copy Config</button>
              </section>

              <section>
                <h4>Pose Builder</h4>
                <div className="pose-editor-controls">
                  <input className="pose-name-input" value={poseNameInput} placeholder="Pose name"
                    onChange={e => setPoseNameInput(e.target.value)} />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button className="btn-small" onClick={() => {
                      const p = defaultEditablePose(poseNameInput || 'New Pose')
                      loadPoseIntoEditor(p)
                    }}>New Pose</button>
                    <button className="btn-small" onClick={() => {
                      const p = { ...editingPose, name: poseNameInput || 'Unnamed' }
                      const next = upsertPose(adminConfig, p)
                      updateConfig(next)
                      setEditingPose(p)
                    }}>Save</button>
                    <button className="btn-small" onClick={() => {
                      const p = adminConfig.poses.find(pp => pp.id === editingPose.id)
                      if (p) loadPoseIntoEditor(p)
                    }}>Revert</button>
                  </div>
                </div>
                <canvas ref={editorCanvasRef}
                  className="editor-canvas"
                  onPointerDown={e => {
                    const rect = editorCanvasRef.current!.getBoundingClientRect()
                    const EDITOR_W = 380, EDITOR_H = 360
                    const px = (e.clientX - rect.left) * (EDITOR_W / rect.width)
                    const py = (e.clientY - rect.top) * (EDITOR_H / rect.height)
                    const hit = hitTestJoint(editingPose, px, py, EDITOR_W, EDITOR_H)
                    if (hit) {
                      dragRef.current = { jointName: hit.name, dragging: true }
                      editorCanvasRef.current!.setPointerCapture(e.pointerId)
                    }
                  }}
                  onPointerMove={e => {
                    if (!dragRef.current.dragging || !dragRef.current.jointName) return
                    const rect = editorCanvasRef.current!.getBoundingClientRect()
                    const EDITOR_W = 380, EDITOR_H = 360
                    const px = (e.clientX - rect.left) * (EDITOR_W / rect.width)
                    const py = (e.clientY - rect.top) * (EDITOR_H / rect.height)
                    const nx = Math.max(0, Math.min(1, px / EDITOR_W))
                    const ny = Math.max(0, Math.min(1, py / EDITOR_H))
                    setEditingPose(prev => updateJoint(prev, dragRef.current.jointName!, nx, ny))
                  }}
                  onPointerUp={e => {
                    if (dragRef.current.dragging) {
                      dragRef.current = { jointName: null, dragging: false }
                      editorCanvasRef.current!.releasePointerCapture(e.pointerId)
                    }
                  }}
                />
              </section>

              <section>
                <h4>Saved Poses</h4>
                {adminConfig.poses.length === 0 && (
                  <p className="admin-placeholder">No saved poses yet</p>
                )}
                {adminConfig.poses.map(pose => (
                  <div key={pose.id} className={`saved-pose-row${adminConfig.activePoseId === pose.id ? ' active' : ''}`}>
                    <span className="saved-pose-name">{pose.name}</span>
                    <div className="saved-pose-actions">
                      <button className="btn-tiny" onClick={() => loadPoseIntoEditor(pose)}>Edit</button>
                      <button className="btn-tiny" onClick={() => {
                        const next = { ...adminConfig, activePoseId: pose.id }
                        updateConfig(next)
                      }}>{adminConfig.activePoseId === pose.id ? '✓ Active' : 'Select'}</button>
                      <button className="btn-tiny btn-danger" onClick={() => {
                        if (window.confirm(`Delete "${pose.name}"?`)) {
                          const next = deletePose(adminConfig, pose.id)
                          updateConfig(next)
                          if (editingPose.id === pose.id) loadPoseIntoEditor(defaultEditablePose())
                        }
                      }}>✕</button>
                    </div>
                  </div>
                ))}
              </section>

              <section>
                <h4>Camera Position Rules</h4>
                <div className="setting-row">
                  <div><label>Min Shoulder Ratio</label> <span>{adminConfig.cameraRules.minShoulderRatio.toFixed(2)}</span></div>
                  <input type="range" min="0.05" max="0.5" step="0.01" value={adminConfig.cameraRules.minShoulderRatio}
                    onChange={e => {
                      const rules = { ...adminConfig.cameraRules, minShoulderRatio: Number(e.target.value) }
                      updateConfig({ ...adminConfig, cameraRules: rules })
                    }} />
                </div>
                <div className="setting-row">
                  <div><label>Max Shoulder Ratio</label> <span>{adminConfig.cameraRules.maxShoulderRatio.toFixed(2)}</span></div>
                  <input type="range" min="0.2" max="0.8" step="0.01" value={adminConfig.cameraRules.maxShoulderRatio}
                    onChange={e => {
                      const rules = { ...adminConfig.cameraRules, maxShoulderRatio: Number(e.target.value) }
                      updateConfig({ ...adminConfig, cameraRules: rules })
                    }} />
                </div>
                <div className="setting-row">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={adminConfig.cameraRules.requireWrists}
                      onChange={e => {
                        const rules = { ...adminConfig.cameraRules, requireWrists: e.target.checked }
                        updateConfig({ ...adminConfig, cameraRules: rules })
                      }} />
                    Require Wrists Visible
                  </label>
                </div>
              </section>

              <section>
                <h4>Matching Settings</h4>
                <div className="setting-row">
                  <div><label>Match Tolerance</label> <span>{adminConfig.matchTolerance.toFixed(2)}</span></div>
                  <input type="range" min="0.05" max="0.5" step="0.01" value={adminConfig.matchTolerance}
                    onChange={e => updateConfig({ ...adminConfig, matchTolerance: Number(e.target.value) })} />
                </div>
                <div className="setting-row">
                  <div><label>Hold Duration</label> <span>{adminConfig.holdMs}ms</span></div>
                  <input type="range" min="500" max="5000" step="100" value={adminConfig.holdMs}
                    onChange={e => updateConfig({ ...adminConfig, holdMs: Number(e.target.value) })} />
                </div>
              </section>

              <section>
                <h4>Data</h4>
                <button className="btn-copy" onClick={() => {
                  const json = JSON.stringify(adminConfig, null, 2)
                  navigator.clipboard.writeText(json).catch(() => {})
                }}>📋 Export Admin Config</button>
                <button className="btn-copy btn-danger" style={{ marginTop: '8px' }} onClick={() => {
                  if (window.confirm('Reset all admin data? This cannot be undone.')) {
                    const next = resetAdminConfig()
                    setAdminConfig(next)
                    loadPoseIntoEditor(defaultEditablePose())
                  }
                }}>🗑️ Reset All Data</button>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
