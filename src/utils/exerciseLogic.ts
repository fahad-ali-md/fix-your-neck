// ponytail: one file for all exercise detection logic - no class, no OOP
export type ExerciseState = 'idle' | 'head_turn' | 'eyes_close' | 'hands_up' | 'complete'

// Global mutable configuration for live tweaking
export const ExerciseConfig = {
  handEarMaxDist: 80,
  slouchRatioMultiplier: 0.85,
  eyeCloseMultiplier: 0.72,
  headTurnAngle: 25,
  posMinShoulderRatio: 0.15,   // shoulder span / frame width — too far if below
  posMaxShoulderRatio: 0.50,   // too close if above
}

export interface ExerciseFeedback {
  instruction: string
  status: 'waiting' | 'in_progress' | 'success'
  progress?: number // 0-1 for timed exercises
}

export interface Keypoint {
  x: number; y: number; score: number; name: string
}

function kp(keypoints: Keypoint[], name: string): Keypoint | undefined {
  return keypoints.find(k => k.name === name)
}

// Neck angle: angle of nose->shoulderMidpoint relative to vertical
// 0 = straight ahead, negative = left, positive = right
export function getNeckAngle(keypoints: Keypoint[]): number | null {
  const nose = kp(keypoints, 'nose')
  const ls = kp(keypoints, 'left_shoulder')
  const rs = kp(keypoints, 'right_shoulder')
  if (!nose || !ls || !rs || nose.score < 0.2 || ls.score < 0.2 || rs.score < 0.2) return null
  const mx = (ls.x + rs.x) / 2
  const my = (ls.y + rs.y) / 2
  const dx = nose.x - mx
  const dy = nose.y - my
  return Math.atan2(dx, dy) * (180 / Math.PI)
}

// Face mesh keypoint indices for EAR (Eye Aspect Ratio)
// MediaPipe FaceMesh: 478 points, indices mirrored left↔right
export const LEFT_EYE_EAR = [33, 159, 158, 133, 153, 145] as const  // outer, top-outer, top-inner, inner, bottom-inner, bottom-outer
export const RIGHT_EYE_EAR = [362, 385, 386, 263, 380, 374] as const

function dist(a: {x: number; y: number}, b: {x: number; y: number}) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|). ~0.25-0.35 when open, <0.15 when closed
export function eyeEAR(pts: Array<{x: number; y: number}>, indices: readonly number[]): number {
  const [p1, p2, p3, p4, p5, p6] = indices.map(i => pts[i])
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 1
  return (dist(p2, p6) + dist(p3, p5)) / (2 * dist(p1, p4))
}

export function areEyesClosed(keypoints: Keypoint[], threshold = 0.15): boolean {
  const le = kp(keypoints, 'left_eye')
  const re = kp(keypoints, 'right_eye')
  // ponytail: closed eyes = low confidence on eye keypoints, simple threshold
  return (le ? le.score < threshold : true) && (re ? re.score < threshold : true)
}

export function areEyesClosedFace(faceKps: Array<{x: number; y: number}>, threshold = 0.2): boolean {
  if (faceKps.length < 387) return false
  const left = eyeEAR(faceKps, LEFT_EYE_EAR)
  const right = eyeEAR(faceKps, RIGHT_EYE_EAR)
  // Use the average of both eyes against threshold
  const avg = (left + right) / 2
  return avg < threshold
}

export function isHandBesideEar(keypoints: Keypoint[], side: 'left' | 'right'): boolean {
  const ear = kp(keypoints, side === 'left' ? 'left_ear' : 'right_ear')
  const wrist = kp(keypoints, side === 'left' ? 'left_wrist' : 'right_wrist')
  const shoulder = kp(keypoints, side === 'left' ? 'left_shoulder' : 'right_shoulder')
  if (!ear || !wrist || !shoulder) return false
  if (ear.score < 0.2 || wrist.score < 0.2 || shoulder.score < 0.2) return false
  // hand raised: wrist above shoulder
  if (wrist.y > shoulder.y) return false
  // hand level with ear: vertical distance < Config px threshold
  if (Math.abs(wrist.y - ear.y) > ExerciseConfig.handEarMaxDist) return false
  // hand outside shoulder line (not crossed)
  if (side === 'left' && wrist.x > shoulder.x) return false
  if (side === 'right' && wrist.x < shoulder.x) return false
  return true
}

export function bothHandsBesideEars(keypoints: Keypoint[]): boolean {
  return isHandBesideEar(keypoints, 'left') && isHandBesideEar(keypoints, 'right')
}

export interface EngineState {
  current: ExerciseState
  eyeTimer: number       // ms eyes have been closed
  handTimer: number      // ms hands have been held
  headTurnPhase: 'left' | 'right' | 'done'
  feedback: ExerciseFeedback
  // markers: Record<string, AnchorMarker | undefined>;  
  // calibration
  calibSamples: number[] // open-eye EAR readings collected before eye-close
  eyeThreshold: number   // dynamic per-user threshold (default 0.2, replaced after calib)
}

export function createEngine(): EngineState {
  return {
    current: 'idle',
    eyeTimer: 0,
    handTimer: 0,
    headTurnPhase: 'left',
    feedback: { instruction: 'Click Start to begin', status: 'waiting' },
    calibSamples: [],
    eyeThreshold: 0.2,
  }
}

export function tickEngine(engine: EngineState, keypoints: Keypoint[], dt: number, faceKps?: Array<{x: number; y: number}>): EngineState {
  const e = { ...engine }
  
  if (e.current === 'idle') return e

  if (e.current === 'head_turn') {
    const angle = getNeckAngle(keypoints)
    if (angle === null) {
      e.feedback = { instruction: 'Look at the camera', status: 'in_progress' }
      return e
    }
      if (e.headTurnPhase === 'left') {
      if (angle < -ExerciseConfig.headTurnAngle) {
        e.headTurnPhase = 'right'
        e.feedback = { instruction: 'Good! Now turn RIGHT →', status: 'in_progress' }
      } else {
        e.feedback = { instruction: 'Turn your head LEFT ← (' + Math.round(angle) + '°)', status: 'in_progress' }
      }
    } else if (e.headTurnPhase === 'right') {
      if (angle > ExerciseConfig.headTurnAngle) {
        e.headTurnPhase = 'done'
        e.feedback = { instruction: 'Head turns complete!', status: 'success' }
      } else {
        e.feedback = { instruction: 'Now turn RIGHT → (' + Math.round(angle) + '°)', status: 'in_progress' }
      }
    } else {
      e.feedback = { instruction: 'Head turns complete!', status: 'success' }
      e.current = 'eyes_close'
      e.feedback = { instruction: 'Close your eyes for 5 seconds...', status: 'waiting' }
    }
    return e
  }

  if (e.current === 'eyes_close') {
    // ── Phase 1: calibrate open-eye EAR for 1.5 s (15 samples @ 100 ms) ──
    const CALIB_NEEDED = 15
    if (e.calibSamples.length < CALIB_NEEDED) {
      if (faceKps && faceKps.length >= 387) {
        const le = eyeEAR(faceKps, LEFT_EYE_EAR)
        const re = eyeEAR(faceKps, RIGHT_EYE_EAR)
        e.calibSamples = [...e.calibSamples, (le + re) / 2]
      }
      const pct = Math.round((e.calibSamples.length / CALIB_NEEDED) * 100)
      e.feedback = { instruction: `Calibrating... keep eyes open (${pct}%)`, status: 'waiting', progress: pct / 100 }
      return e
    }
    // compute threshold once calibration done
    if (e.calibSamples.length === CALIB_NEEDED) {
      const baseline = e.calibSamples.reduce((a, b) => a + b, 0) / e.calibSamples.length
      e.eyeThreshold = baseline * ExerciseConfig.eyeCloseMultiplier
      // push to > CALIB_NEEDED so we don't recompute
      e.calibSamples = [...e.calibSamples, -1]
    }

    // ── Phase 2: detect eyes closed ──
    const eyesClosed = faceKps ? areEyesClosedFace(faceKps, e.eyeThreshold) : areEyesClosed(keypoints)
    if (eyesClosed) {
      e.eyeTimer += dt
      const progress = Math.min(e.eyeTimer / 5000, 1)
      const remaining = Math.ceil((5000 - e.eyeTimer) / 1000)
      e.feedback = {
        instruction: remaining > 0 ? `Keep eyes closed... ${remaining}s` : ' 5 seconds!',
        status: 'in_progress',
        progress
      }
      if (e.eyeTimer >= 5000) {
        e.feedback = { instruction: 'Eyes closed! Great!', status: 'success' }
        e.current = 'hands_up'
        e.feedback = { instruction: 'Raise both hands beside your ears ', status: 'waiting' }
        e.eyeTimer = 0
      }
    } else {
      e.eyeTimer = 0
      e.feedback = { instruction: 'Close your eyes...', status: 'in_progress', progress: 0 }
    }
    return e
  }

  if (e.current === 'hands_up') {
    if (bothHandsBesideEars(keypoints)) {
      e.handTimer += dt
      const progress = Math.min(e.handTimer / 2000, 1)
      e.feedback = {
        instruction: e.handTimer >= 2000 ? 'Hands held! Perfect!' : 'Hold your hands up...',
        status: 'in_progress',
        progress
      }
      if (e.handTimer >= 2000) {
        e.feedback = { instruction: ' All exercises complete!', status: 'success' }
        e.current = 'complete'
      }
    } else {
      e.handTimer = 0
      const left = isHandBesideEar(keypoints, 'left')
      const right = isHandBesideEar(keypoints, 'right')
      let instr = 'Raise both hands beside your ears'
      if (!left && !right) instr = 'Raise BOTH hands up beside your ears'
      else if (!left) instr = 'Left hand needs to go up higher'
      else if (!right) instr = 'Right hand needs to go up higher'
      e.feedback = { instruction: instr, status: 'in_progress', progress: 0 }
    }
    return e
  }

  return e
}

// ponytail: module-level posture calibration — resets on page reload
let _postureBaseline = 0
let _postureSamples = 0

// slouch score = shoulderWidth / earDistance. Higher = more upright.
// When slouching, shoulders roll forward → shoulderWidth decreases.
// Auto-calibrates: baseline = max ratio seen in first 30 frames (upright).
export function detectSlouch(keypoints: Keypoint[]): { ratio: number; baseline: number; isSlouching: boolean } {
  const ls = kp(keypoints, 'left_shoulder')
  const rs = kp(keypoints, 'right_shoulder')
  const le = kp(keypoints, 'left_ear')
  const re = kp(keypoints, 'right_ear')
  if (!ls || !rs || !le || !re || ls.score < 0.2 || rs.score < 0.2 || le.score < 0.2 || re.score < 0.2)
    return { ratio: 0, baseline: _postureBaseline, isSlouching: false }
  const shoulderWidth = dist(ls, rs)
  const earDist = dist(le, re)
  if (earDist < 1) return { ratio: 0, baseline: _postureBaseline, isSlouching: false }
  const ratio = shoulderWidth / earDist
  if (_postureSamples < 30) { _postureBaseline = Math.max(_postureBaseline, ratio); _postureSamples++ }
  const isSlouching = _postureBaseline > 0 && ratio < _postureBaseline * ExerciseConfig.slouchRatioMultiplier
  return { ratio, baseline: _postureBaseline, isSlouching }
}

export interface HandDebug {
  ok: boolean
  raised: boolean | null
  leveled: boolean | null
  notCrossed: boolean | null
  vertDist: number | null
  reason: string
}

export function handDebug(keypoints: Keypoint[], side: 'left' | 'right'): HandDebug {
  const L = side === 'left' ? 'L' : 'R'
  const ear = kp(keypoints, side === 'left' ? 'left_ear' : 'right_ear')
  const wrist = kp(keypoints, side === 'left' ? 'left_wrist' : 'right_wrist')
  const shoulder = kp(keypoints, side === 'left' ? 'left_shoulder' : 'right_shoulder')

  const none = { ok: false, raised: null, leveled: null, notCrossed: null, vertDist: null }
  if (!ear || !wrist || !shoulder)
    return { ...none, reason: `${L}: keypoints missing` }
  if (ear.score < 0.2 || wrist.score < 0.2 || shoulder.score < 0.2)
    return { ...none, reason: `${L}: low conf (ear:${ear.score.toFixed(2)} wrist:${wrist.score.toFixed(2)})` }

  const raised = wrist.y < shoulder.y
  const vertDist = Math.abs(wrist.y - ear.y)
  const leveled = vertDist < ExerciseConfig.handEarMaxDist
  const notCrossed = side === 'left' ? wrist.x <= shoulder.x : wrist.x >= shoulder.x
  const ok = raised && leveled && notCrossed

  let reason = `${L}: OK`
  if (!raised)          reason = `${L}: raise wrist (${Math.round(wrist.y - shoulder.y)}px below shoulder)`
  else if (!leveled)    reason = `${L}: near ear (delta:${Math.round(vertDist)}px, need <${ExerciseConfig.handEarMaxDist})`
  else if (!notCrossed) reason = `${L}: move wrist outward`

  return { ok, raised, leveled, notCrossed, vertDist: Math.round(vertDist), reason }
}

export interface PositionCheck {
  ok: boolean
  message: string
  blocked: string // first thing wrong (for display)
}

// ── Locked Pose ──────────────────────────────────────
export interface LockedPose {
  keypoints: { name: string; x: number; y: number }[]
  timestamp: number
}

const LOCK_KEY = 'fyn-locked-pose'

export function saveLockedPose(keypoints: Keypoint[]) {
  const pose: LockedPose = {
    keypoints: keypoints.map(k => ({ name: k.name, x: k.x, y: k.y })),
    timestamp: Date.now()
  }
  localStorage.setItem(LOCK_KEY, JSON.stringify(pose))
  return pose
}

export function loadLockedPose(): LockedPose | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

export function clearLockedPose() {
  localStorage.removeItem(LOCK_KEY)
}

export function comparePose(
  liveKps: Keypoint[],
  locked: LockedPose,
  threshold = 0.18
): { matched: boolean; similarity: number } {
  if (!locked.keypoints || locked.keypoints.length === 0) {
    return { matched: false, similarity: Infinity }
  }

  const liveMap = new Map<string, Keypoint>()
  for (const k of liveKps) liveMap.set(k.name, k)

  const lockedMap = new Map<string, { name: string; x: number; y: number }>()
  for (const k of locked.keypoints) lockedMap.set(k.name, k)

  const common: string[] = []
  for (const name of liveMap.keys()) {
    if (lockedMap.has(name)) common.push(name)
  }
  if (common.length < 5) return { matched: false, similarity: Infinity }

  function bbox(pts: { x: number; y: number }[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
    }
    return { minX, minY, maxX, maxY }
  }

  const livePts = common.map(n => liveMap.get(n)!)
  const lockedPts = common.map(n => lockedMap.get(n)!)

  const liveB = bbox(livePts)
  const lockB = bbox(lockedPts)

  const liveW = Math.max(liveB.maxX - liveB.minX, 1)
  const liveH = Math.max(liveB.maxY - liveB.minY, 1)
  const lockW = Math.max(lockB.maxX - lockB.minX, 1)
  const lockH = Math.max(lockB.maxY - lockB.minY, 1)

  let sumSq = 0
  for (const name of common) {
    const l = liveMap.get(name)!
    const lk = lockedMap.get(name)!
    const nxL = (l.x - liveB.minX) / liveW
    const nyL = (l.y - liveB.minY) / liveH
    const nxK = (lk.x - lockB.minX) / lockW
    const nyK = (lk.y - lockB.minY) / lockH
    const dx = nxL - nxK
    const dy = nyL - nyK
    sumSq += dx * dx + dy * dy
  }

  const avgDist = Math.sqrt(sumSq / common.length)
  const matched = avgDist <= threshold
  return { matched, similarity: avgDist }
}

export function checkPosition(keypoints: Keypoint[], frameWidth: number, lockedPose?: LockedPose | null): PositionCheck {
  const ls = kp(keypoints, 'left_shoulder')
  const rs = kp(keypoints, 'right_shoulder')
  const le = kp(keypoints, 'left_ear')
  const re = kp(keypoints, 'right_ear')
  const nose = kp(keypoints, 'nose')
  const MIN_SCORE = 0.3

  if (!ls || !rs) return { ok: false, message: 'Move so both shoulders are visible', blocked: 'shoulders' }
  if (ls.score < MIN_SCORE || rs.score < MIN_SCORE) return { ok: false, message: 'Move so both shoulders are visible', blocked: 'shoulders' }
  if (!le || !re || le.score < MIN_SCORE || re.score < MIN_SCORE) return { ok: false, message: 'Move so both ears are visible', blocked: 'ears' }
  if (!nose || nose.score < MIN_SCORE) return { ok: false, message: 'Move so your face is visible', blocked: 'nose' }

  const ratio = dist(ls, rs) / frameWidth
  if (ratio < ExerciseConfig.posMinShoulderRatio) return { ok: false, message: 'Move closer to the camera', blocked: 'distance' }
  if (ratio > ExerciseConfig.posMaxShoulderRatio) return { ok: false, message: 'Move back from the camera', blocked: 'distance' }

  if (lockedPose && lockedPose.keypoints.length > 0) {
    const result = comparePose(keypoints, lockedPose)
    if (!result.matched) {
      return { ok: false, message: 'Move to match locked pose', blocked: 'pose' }
    }
    return { ok: true, message: 'Pose Matched!', blocked: '' }
  }

  return { ok: true, message: 'You are ready to start', blocked: '' }
}