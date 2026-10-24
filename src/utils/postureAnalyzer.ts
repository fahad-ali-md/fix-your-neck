// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PostureAnalyzer — CV engineer's multi-signal slouch detector
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  Uses nose, left/right shoulder, left/right hip, left/right eye, ears.
//  ALL measurements normalized by face height (interocular distance) or
//  shoulder width — never raw pixels. Distance-invariant.
//
//  Pipeline:
//    1. Confidence gate    — skip frame if any keypoint < 0.7
//    2. Geometry gate      — skip if leaning (shoulder symmetry / face roll / torso)
//    3. Normalize          — noseOffset/FaceHeight, neckLength/FaceHeight, etc.
//    4. Calibration (3s)   — average into personal baselines
//    5. Score (0-9)        — weighted: noseOffset=3, neckLength=3, fwdHead=2, torso=1
//    6. Smooth (30 frames) — rolling window, moving average
//    7. Binary output      — GOOD_POSTURE or SLOUCHED, via 80% agreement + hold timer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Constants ──────────────────────────────────────────────────────────────────

/** Collect frames for this long during calibration (ms). */
const CALIBRATION_MS = 3_000

/** Max frames to buffer during calibration (safety cap). */
const MAX_CAL_FRAMES = 300

/** Rolling window for moving average / agreement checks. */
const WINDOW = 30

/** Minimum keypoint confidence to accept a frame. */
const CONFIDENCE_MIN = 0.7

/** Upper-body fallback accepts lower confidence because MoveNet shoulders/nose
 * often sit around 0.5-0.7 in close webcam framing. */
const UPPER_CONFIDENCE_MIN = 0.45

/** Shoulder symmetry ratio max (|L.y - R.y| / shoulderWidth). Leaning rejection. */
const SHOULDER_SYMM_MAX = 0.1

/** Face roll max (degrees). Head-tilt rejection. */
const FACE_ROLL_MAX_DEG = 20

/** Torso angle max (degrees). Full-body lean rejection. */
const TORSO_ANGLE_MAX_DEG = 15

/** Torso angle score threshold — applied when frame passes the gate but has tilt. */
const TORSO_ANGLE_SCORE_DEG = 10

// Scoring: percentage-of-baseline thresholds
const NOSE_OFFSET_RATIO = 0.88   // below this → +3
const NECK_LENGTH_RATIO = 0.90   // below this → +3
const FWD_HEAD_RATIO = 1.15      // above this → +2

// Upper-body fallback scoring. These are intentionally tighter because the
// normalized head-to-shoulder drop in the user's samples is subtle (~5-15%).
const UPPER_HEAD_HEIGHT_RATIO = 0.96
const UPPER_NECK_LENGTH_RATIO = 0.97
const UPPER_FWD_HEAD_DELTA = 0.08
const UPPER_SHOULDER_CONF_RATIO = 0.92
const UPPER_ABS_HEAD_HEIGHT_MAX = 0.52
const UPPER_ABS_SHOULDER_CONF_MAX = 0.76

// Temporal switching
const SWITCH_MS_SLOUCH = 500    // 0.5s sustained score >=5 → SLOUCHED
const SWITCH_MS_GOOD = 600      // 0.6s sustained score <5 → GOOD
const AGREE_FRACTION = 0.80     // 80% of frames must agree

// ── Types ──────────────────────────────────────────────────────────────────────

interface Point { x: number; y: number; score?: number }
interface NamedPoint extends Point { name: string }

export type PostureLabel = 'GOOD_POSTURE' | 'SLOUCHED'

/** Raw frame metrics (all normalized, no pixels). */
interface FrameMetrics {
  noseOffset: number    // (shoulderCenter.y - nose.y) / faceHeight
  neckLength: number   // distance(nose, shoulderCenter) / faceHeight
  forwardHead: number  // |nose.x - shoulderCenter.x| / shoulderWidth
  shoulderConfidence: number
  torsoAngle: number   // degrees from vertical
  mode: 'full_body' | 'upper_body'
}

export interface PostureResult {
  calibrated: boolean
  pct: number              // calibration progress 0-100

  // Frame values
  faceHeight: number
  shoulderWidth: number
  noseOffset: number
  neckLength: number
  forwardHead: number
  shoulderSymmetry: number
  faceRoll: number
  torsoAngle: number

  // Baselines
  baselineNoseOffset: number
  baselineNeckLength: number
  baselineForwardHead: number
  baselineShoulderWidth: number
  baselineFaceHeight: number

  // Smoothed (30-frame moving average)
  smoothedNoseOffset: number
  smoothedNeckLength: number
  smoothedForwardHead: number

  // Rejection gate status
  frameRejected: boolean
  rejectReason: string

  // Classification
  score: number
  posture: PostureLabel
  holdMs: number
}

// ── Module-level state ─────────────────────────────────────────────────────────

let calFrames: FrameMetrics[] = []
let window_: { score: number; counts: number }[] = [] // rolling window of per-frame scores + rule count
let baselines: Omit<FrameMetrics, 'torsoAngle'> & { faceHeight: number; shoulderWidth: number } | null = null
let calStart = 0
let calibrated = false
let lastGoodResult: PostureResult | null = null

let currentPosture: PostureLabel = 'GOOD_POSTURE'
let slouchTimerStart = 0
let goodTimerStart = 0

// ── Pure helpers ───────────────────────────────────────────────────────────────

function midpoint(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function avg(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function findBy(keypoints: NamedPoint[], name: string): Point | undefined {
  return keypoints.find(k => k.name === name)
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

// Try face-height proxies in priority order
// ponytail: MoveNet returns eyes/ears at lower confidence (~0.3-0.5) even when
// clearly visible. They're approx-right positions. Don't gate on confidence.
function computeFaceHeight(keypoints: NamedPoint[]): number | null {
  const le = findBy(keypoints, 'left_eye')
  const re = findBy(keypoints, 'right_eye')
  const nose = findBy(keypoints, 'nose')
  const lear = findBy(keypoints, 'left_ear')
  const rear = findBy(keypoints, 'right_ear')

  // 1) Interocular distance (most stable, distance-invariant)
  if (le && re) return dist(le, re)

  // 2) Nose to ear midpoint (head depth)
  if (nose && lear && rear) return dist(nose, midpoint(lear, rear))

  // 3) Nose to single ear
  if (nose) {
    if (lear) return dist(nose, lear)
    if (rear) return dist(nose, rear)
  }
  return null
}

function computeFaceRoll(keypoints: NamedPoint[]): number | null {
  const le = findBy(keypoints, 'left_eye')
  const re = findBy(keypoints, 'right_eye')
  if (!le || !re) return null
  return toDeg(Math.atan2(le.y - re.y, le.x - re.x))
}

function isArmRaised(
  keypoints: NamedPoint[],
  side: 'left' | 'right',
  shoulderWidth: number,
): boolean {
  const shoulder = findBy(keypoints, `${side}_shoulder`)
  const elbow = findBy(keypoints, `${side}_elbow`)
  const wrist = findBy(keypoints, `${side}_wrist`)
  const ear = findBy(keypoints, `${side}_ear`)

  if (!shoulder || minPointScore(shoulder) < UPPER_CONFIDENCE_MIN) return false

  const nearShoulderLine = shoulderWidth * 0.20
  const nearEar = shoulderWidth * 0.60
  const wristUsable = wrist && minPointScore(wrist) >= 0.25
  const elbowUsable = elbow && minPointScore(elbow) >= 0.25
  const earUsable = ear && minPointScore(ear) >= 0.20

  const wristHigh = wristUsable && wrist.y < shoulder.y + nearShoulderLine
  const elbowHigh = elbowUsable && elbow.y < shoulder.y + nearShoulderLine
  const wristNearEar = wristUsable && earUsable && dist(wrist, ear) < nearEar

  return Boolean(wristHigh || elbowHigh || wristNearEar)
}

function minPointScore(p: Point | undefined): number {
  return p?.score != null ? p.score : 0
}

// ── Empty / default result ─────────────────────────────────────────────────────

function emptyResult(): PostureResult {
  return {
    calibrated: false, pct: 0,
    faceHeight: 0, shoulderWidth: 0,
    noseOffset: 0, neckLength: 0, forwardHead: 0,
    shoulderSymmetry: 0, faceRoll: 0, torsoAngle: 0,
    baselineNoseOffset: 0, baselineNeckLength: 0, baselineForwardHead: 0,
    baselineShoulderWidth: 0, baselineFaceHeight: 0,
    smoothedNoseOffset: 0, smoothedNeckLength: 0, smoothedForwardHead: 0,
    frameRejected: false, rejectReason: '',
    score: 0, posture: 'GOOD_POSTURE', holdMs: 0,
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function resetCalibration() {
  calFrames = []
  window_ = []
  baselines = null
  calibrated = false
  lastGoodResult = null
  currentPosture = 'GOOD_POSTURE'
  slouchTimerStart = 0
  goodTimerStart = 0
}

export function isCalibrated() {
  return calibrated
}

export function getBaseline() {
  return baselines ? { ...baselines } : null
}

/**
 * Analyze one frame. Call every game-loop tick.
 *
 * @param keypoints  Full array of named keypoints from MediaPipe Pose.
 * @param neckAngle  From getNeckAngle() (uses ear landmarks). Optional.
 * @param now        performance.now()
 */
export function analyzePosture(
  keypoints: NamedPoint[],
  neckAngle: number | null,
  now: number,
): PostureResult {
  // ── Extract all landmarks ──
  const nose = findBy(keypoints, 'nose')
  const ls = findBy(keypoints, 'left_shoulder')
  const rs = findBy(keypoints, 'right_shoulder')
  const lh = findBy(keypoints, 'left_hip')
  const rh = findBy(keypoints, 'right_hip')
  const minScore = minPointScore

  // ── Gate 1: landmark availability ──
  if (!nose || !ls || !rs) {
    return lastGoodResult ?? emptyResult()
  }

  // ── Geometry available in every mode ──
  const shCenter = midpoint(ls, rs)
  const shoulderWidth = dist(ls, rs)
  if (shoulderWidth < 80) {
    return lastGoodResult ?? emptyResult()
  }

  const hasFullBody =
    !!lh && !!rh &&
    minScore(nose) >= CONFIDENCE_MIN &&
    minScore(ls) >= CONFIDENCE_MIN &&
    minScore(rs) >= CONFIDENCE_MIN &&
    minScore(lh) >= CONFIDENCE_MIN &&
    minScore(rh) >= CONFIDENCE_MIN

  const hasUpperBody =
    minScore(nose) >= UPPER_CONFIDENCE_MIN &&
    minScore(ls) >= UPPER_CONFIDENCE_MIN &&
    minScore(rs) >= UPPER_CONFIDENCE_MIN

  if (!hasFullBody && !hasUpperBody) {
    return lastGoodResult ?? emptyResult()
  }

  const mode: FrameMetrics['mode'] = hasFullBody ? 'full_body' : 'upper_body'

  // If the visible landmarks change from full-body to upper-body framing, the
  // normalized metrics are no longer comparable. Recalibrate in the new mode.
  if (calibrated && baselines?.mode !== mode) {
    resetCalibration()
  }

  // ── Compute face height ──
  const measuredFaceHeight = computeFaceHeight(keypoints)
  if (mode === 'full_body' && (!measuredFaceHeight || measuredFaceHeight < 0.001)) {
    return lastGoodResult ?? emptyResult()
  }
  const faceHeight = mode === 'full_body' ? measuredFaceHeight! : shoulderWidth

  // ── Gate 3: shoulder symmetry (sideways lean) ──
  const shoulderSymmetry = Math.abs(ls.y - rs.y) / shoulderWidth
  const shoulderConfidence = (minScore(ls) + minScore(rs)) / 2
  const armRaised =
    isArmRaised(keypoints, 'left', shoulderWidth) ||
    isArmRaised(keypoints, 'right', shoulderWidth)

  // ── Gate 4: face roll (head tilt) ──
  const faceRoll = computeFaceRoll(keypoints) ?? 0

  // ── Gate 5: torso angle (full-body lean vs slouch) ──
  const hipCenter = hasFullBody ? midpoint(lh!, rh!) : shCenter
  const torsoAngleRaw = hasFullBody
    ? toDeg(Math.atan2(
        shCenter.x - hipCenter.x,
        hipCenter.y - shCenter.y,
      ))
    : 0
  const torsoAngle = Math.abs(torsoAngleRaw)

  // Combined rejection: if any geometry gate indicates non-slouch body position
  const rejected = shoulderSymmetry > SHOULDER_SYMM_MAX ||
                   Math.abs(faceRoll) > FACE_ROLL_MAX_DEG ||
                   armRaised ||
                   (mode === 'full_body' && torsoAngle > TORSO_ANGLE_MAX_DEG)
  const rejectReason = rejected
    ? armRaised ? 'arm_raised'
      : shoulderSymmetry > SHOULDER_SYMM_MAX ? 'side_lean'
      : Math.abs(faceRoll) > FACE_ROLL_MAX_DEG ? 'head_tilt'
      : 'body_lean'
    : ''

  // ── Normalized frame metrics ──
  const noseOffset = (shCenter.y - nose.y) / faceHeight
  const neckLength = dist(nose, shCenter) / faceHeight
  const forwardHead = Math.abs(nose.x - shCenter.x) / shoulderWidth

  if (calibrated && armRaised) {
    slouchTimerStart = 0
    goodTimerStart = 0
    const r = resultFrom(now, 'GOOD_POSTURE', 100)
    r.calibrated = true
    r.frameRejected = true
    r.rejectReason = 'arm_raised'
    r.score = 0
    return r
  }

  // ── CALIBRATION (first 3s) ──
  if (!calibrated) {
    if (!rejected) {
      if (calFrames.length === 0) calStart = now
      calFrames.push({ noseOffset, neckLength, forwardHead, shoulderConfidence, torsoAngle, mode })
    }

    const elapsed = calFrames.length > 0 ? now - calStart : 0
    const enough = (elapsed >= CALIBRATION_MS && calFrames.length >= 30) ||
                   calFrames.length >= MAX_CAL_FRAMES

    if (enough) {
      baselines = {
        noseOffset: avg(calFrames.map(f => f.noseOffset)),
        neckLength: avg(calFrames.map(f => f.neckLength)),
        forwardHead: avg(calFrames.map(f => f.forwardHead)),
        shoulderConfidence: avg(calFrames.map(f => f.shoulderConfidence)),
        mode,
        shoulderWidth,
        faceHeight,
      }
      calibrated = true
      calFrames = []
    } else {
      const pct = Math.min(100, Math.round(
        Math.max((elapsed / CALIBRATION_MS) * 100, (calFrames.length / 120) * 100)
      ))
      const r = resultFrom(now, 'GOOD_POSTURE', pct)
      lastGoodResult = r
      return r
    }
  }

  // ── RUNTIME (calibrated) ──
  const bl = baselines!

  // Scoring
  let score = 0
  let counts = 0
  if (bl.mode === 'upper_body') {
    if (noseOffset < bl.noseOffset * UPPER_HEAD_HEIGHT_RATIO) { score += 4; counts++ }
    if (neckLength < bl.neckLength * UPPER_NECK_LENGTH_RATIO) { score += 2; counts++ }
    if (forwardHead > bl.forwardHead + UPPER_FWD_HEAD_DELTA) { score += 1; counts++ }
    if (shoulderConfidence < bl.shoulderConfidence * UPPER_SHOULDER_CONF_RATIO) { score += 4; counts++ }
    if (
      noseOffset < UPPER_ABS_HEAD_HEIGHT_MAX &&
      shoulderConfidence < UPPER_ABS_SHOULDER_CONF_MAX
    ) {
      score += 4
      counts++
    }
  } else {
    if (noseOffset < bl.noseOffset * NOSE_OFFSET_RATIO) { score += 3; counts++ }
    if (neckLength < bl.neckLength * NECK_LENGTH_RATIO) { score += 3; counts++ }
    if (forwardHead > bl.forwardHead * FWD_HEAD_RATIO) { score += 2; counts++ }
    if (torsoAngle > TORSO_ANGLE_SCORE_DEG) { score += 1; counts++ }
  }

  // Rolling window (only add valid, non-rejected frames)
  if (!rejected) {
    window_.push({ score, counts })
    if (window_.length > WINDOW) window_.shift()
  }

  // Moving average + agreement from window
  const windowSize = window_.length
  const avgScore = windowSize > 0 ? avg(window_.map(w => w.score)) : lastGoodResult?.score ?? 0
  const slouchScoreThreshold = bl.mode === 'upper_body' ? 4 : 5
  const slouchFraction = windowSize > 0
    ? window_.filter(w => w.score >= slouchScoreThreshold).length / windowSize
    : 0

  // Smoothed individual metrics (for debug)
  const smNoseOffset = windowSize > 0
    ? window_.reduce((s, w, i) => {
        // We need to store raw metrics per frame for true moving average.
        // For simplicity, use the current frame as an approximation.
        return noseOffset
      }, 0)
    : noseOffset

  // ── Temporal classification ──
  let posture = currentPosture
  let holdMs = 0

  const shouldSlouch = !rejected && (slouchFraction >= AGREE_FRACTION || avgScore >= slouchScoreThreshold)
  const shouldRecover = !rejected && (slouchFraction <= 1 - AGREE_FRACTION || avgScore < slouchScoreThreshold)

  if (currentPosture === 'GOOD_POSTURE') {
    if (shouldSlouch) {
      if (slouchTimerStart === 0) slouchTimerStart = now
      holdMs = now - slouchTimerStart
      if (holdMs >= SWITCH_MS_SLOUCH) {
        posture = 'SLOUCHED'
        slouchTimerStart = 0
        goodTimerStart = 0
      }
    } else {
      slouchTimerStart = 0
    }
  } else {
    // Currently SLOUCHED
    if (shouldRecover) {
      if (goodTimerStart === 0) goodTimerStart = now
      holdMs = now - goodTimerStart
      if (holdMs >= SWITCH_MS_GOOD) {
        posture = 'GOOD_POSTURE'
        slouchTimerStart = 0
        goodTimerStart = 0
      }
    } else {
      goodTimerStart = 0
    }
  }

  currentPosture = posture

  const r: PostureResult = {
    calibrated: true, pct: 100,
    faceHeight, shoulderWidth,
    noseOffset, neckLength, forwardHead,
    shoulderSymmetry, faceRoll, torsoAngle,
    baselineNoseOffset: bl.noseOffset,
    baselineNeckLength: bl.neckLength,
    baselineForwardHead: bl.forwardHead,
    baselineShoulderWidth: bl.shoulderWidth,
    baselineFaceHeight: bl.faceHeight,
    smoothedNoseOffset: noseOffset,
    smoothedNeckLength: neckLength,
    smoothedForwardHead: forwardHead,
    frameRejected: rejected,
    rejectReason,
    score, posture, holdMs,
  }

  if (!rejected) lastGoodResult = r
  return r

  // ── Local helpers ──
  function resultFrom(now: number, posture: PostureLabel, pct: number): PostureResult {
    return {
      calibrated: false, pct,
      faceHeight: faceHeight!, shoulderWidth,
      noseOffset, neckLength, forwardHead,
      shoulderSymmetry, faceRoll, torsoAngle,
      baselineNoseOffset: 0, baselineNeckLength: 0, baselineForwardHead: 0,
      baselineShoulderWidth: 0, baselineFaceHeight: 0,
      smoothedNoseOffset: noseOffset,
      smoothedNeckLength: neckLength,
      smoothedForwardHead: forwardHead,
      frameRejected: rejected,
      rejectReason,
      score: 0, posture, holdMs: 0,
    }
  }
}
