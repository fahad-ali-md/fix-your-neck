// ponytail: one file for all exercise detection logic - no class, no OOP
export type ExerciseState = string

// Global mutable configuration for live tweaking
export const ExerciseConfig = {
  handEarMaxDist: 80,
  slouchRatioMultiplier: 0.85,
  eyeCloseMultiplier: 0.72,
  headTurnAngle: 25,
  lookSideOffsetRatio: 0.12,
  lookDownRatio: 0.65,
  lookUpRatio: 1.12,
  posMinShoulderRatio: 0.15,   // shoulder span / frame width — too far if below
  posMaxShoulderRatio: 0.50,   // too close if above
}

export interface ExerciseFeedback {
  instruction: string
  status: 'waiting' | 'in_progress' | 'success'
  progress?: number // 0-1 for timed exercises
  label?: string
  routineTitle?: string
  voice?: string
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

function isArmRaised(keypoints: Keypoint[], side: 'left' | 'right'): boolean {
  const shoulder = kp(keypoints, side === 'left' ? 'left_shoulder' : 'right_shoulder')
  const elbow = kp(keypoints, side === 'left' ? 'left_elbow' : 'right_elbow')
  const wrist = kp(keypoints, side === 'left' ? 'left_wrist' : 'right_wrist')
  if (!shoulder || !elbow || !wrist) return false
  if (shoulder.score < 0.2 || elbow.score < 0.2 || wrist.score < 0.2) return false

  const raised = elbow.y < shoulder.y + 35 && wrist.y < shoulder.y + 35
  const outside = side === 'left'
    ? wrist.x <= shoulder.x
    : wrist.x >= shoulder.x

  return raised && outside
}

function bothArmsRaised(keypoints: Keypoint[]): boolean {
  return isArmRaised(keypoints, 'left') && isArmRaised(keypoints, 'right')
}

export interface EngineState {
  current: ExerciseState
  holdTimer: number
  feedback: ExerciseFeedback
  calibSamples: number[]
  neutralHeadHeight: number
  routineDay: number
  routineTitle: string
  stepIndex: number
  repCount: number
  repPhase: 'down' | 'neutral'
  eyeThreshold: number   // dynamic per-user threshold (default 0.2, replaced after calib)
}

type LookDirection = 'right' | 'left' | 'down' | 'up'
type StepKind = 'calibrate' | 'look' | 'arms_up' | 'chin_tuck' | 'timed'

interface RoutineStep {
  id: ExerciseState
  label: string
  instruction: string
  voice: string
  kind: StepKind
  direction?: LookDirection
  holdMs?: number
  durationMs?: number
  reps?: number
  requireArms?: boolean
}

interface Routine {
  day: number
  title: string
  steps: RoutineStep[]
}

const HOLD_MS = 2000
const CALIBRATION_SAMPLES = 10

const calibrateStep: RoutineStep = {
  id: 'calibrate',
  label: 'Center',
  instruction: 'Look straight at the camera',
  voice: 'Look straight at the camera.',
  kind: 'calibrate',
}

const step = (stepConfig: RoutineStep): RoutineStep => stepConfig

const routines: Routine[] = [
  {
    day: 1,
    title: 'Mobility Baseline',
    steps: [
      calibrateStep,
      step({ id: 'look_right', label: 'Look Right', instruction: 'Look RIGHT', voice: 'Look right and hold for two seconds.', kind: 'look', direction: 'right', holdMs: HOLD_MS }),
      step({ id: 'look_left', label: 'Look Left', instruction: 'Look LEFT', voice: 'Look left and hold for two seconds.', kind: 'look', direction: 'left', holdMs: HOLD_MS }),
      step({ id: 'look_down', label: 'Look Down', instruction: 'Look DOWN', voice: 'Look down and hold for two seconds.', kind: 'look', direction: 'down', holdMs: HOLD_MS }),
      step({ id: 'look_up', label: 'Look Up', instruction: 'Look UP', voice: 'Look up and hold for two seconds.', kind: 'look', direction: 'up', holdMs: HOLD_MS }),
      step({ id: 'arms_up', label: 'Hands Up', instruction: 'Raise both hands beside your head', voice: 'Stage two. Raise both hands beside your head and hold.', kind: 'arms_up', holdMs: HOLD_MS }),
      step({ id: 'arms_look_right', label: 'Hands Up + Right', instruction: 'Keep arms up and look RIGHT', voice: 'Keep your hands up. Look right and hold for two seconds.', kind: 'look', direction: 'right', holdMs: HOLD_MS, requireArms: true }),
      step({ id: 'arms_look_left', label: 'Hands Up + Left', instruction: 'Keep arms up and look LEFT', voice: 'Keep your hands up. Look left and hold for two seconds.', kind: 'look', direction: 'left', holdMs: HOLD_MS, requireArms: true }),
    ],
  },
  {
    day: 2,
    title: 'Posture Reset',
    steps: [
      calibrateStep,
      step({ id: 'chin_tuck_5', label: 'Chin Tuck', instruction: 'Lower your chin, then return to neutral', voice: 'Do five chin tucks. Lower your chin, then return to neutral.', kind: 'chin_tuck', reps: 5 }),
      step({ id: 'shoulder_squeeze', label: 'Shoulder Squeeze', instruction: 'Squeeze shoulder blades gently', voice: 'Squeeze your shoulder blades gently and hold.', kind: 'timed', durationMs: 8000 }),
      step({ id: 'look_right', label: 'Look Right', instruction: 'Look RIGHT', voice: 'Look right and hold for two seconds.', kind: 'look', direction: 'right', holdMs: HOLD_MS }),
      step({ id: 'look_left', label: 'Look Left', instruction: 'Look LEFT', voice: 'Look left and hold for two seconds.', kind: 'look', direction: 'left', holdMs: HOLD_MS }),
    ],
  },
  {
    day: 3,
    title: 'Desk Neck Relief',
    steps: [
      calibrateStep,
      step({ id: 'look_down', label: 'Look Down', instruction: 'Look DOWN', voice: 'Look down and hold for two seconds.', kind: 'look', direction: 'down', holdMs: HOLD_MS }),
      step({ id: 'look_up', label: 'Look Up', instruction: 'Look UP', voice: 'Look up and hold for two seconds.', kind: 'look', direction: 'up', holdMs: HOLD_MS }),
      step({ id: 'right_side_relax', label: 'Right Side', instruction: 'Gently tilt toward your right shoulder', voice: 'Gently tilt toward your right shoulder.', kind: 'timed', durationMs: 6000 }),
      step({ id: 'left_side_relax', label: 'Left Side', instruction: 'Gently tilt toward your left shoulder', voice: 'Gently tilt toward your left shoulder.', kind: 'timed', durationMs: 6000 }),
    ],
  },
  {
    day: 4,
    title: 'Light Recovery',
    steps: [
      calibrateStep,
      step({ id: 'breathing', label: 'Breathing', instruction: 'Breathe slowly and relax your shoulders', voice: 'Breathe slowly and relax your shoulders.', kind: 'timed', durationMs: 10000 }),
      step({ id: 'look_right_easy', label: 'Easy Right', instruction: 'Gently look RIGHT', voice: 'Gently look right.', kind: 'look', direction: 'right', holdMs: 1000 }),
      step({ id: 'look_left_easy', label: 'Easy Left', instruction: 'Gently look LEFT', voice: 'Gently look left.', kind: 'look', direction: 'left', holdMs: 1000 }),
      step({ id: 'look_down_easy', label: 'Easy Down', instruction: 'Gently look DOWN', voice: 'Gently look down.', kind: 'look', direction: 'down', holdMs: 1000 }),
      step({ id: 'look_up_easy', label: 'Easy Up', instruction: 'Gently look UP', voice: 'Gently look up.', kind: 'look', direction: 'up', holdMs: 1000 }),
    ],
  },
  {
    day: 5,
    title: 'Hands + Neck Coordination',
    steps: [
      calibrateStep,
      step({ id: 'arms_up', label: 'Hands Up', instruction: 'Raise both hands beside your head', voice: 'Raise both hands beside your head and hold.', kind: 'arms_up', holdMs: HOLD_MS }),
      step({ id: 'arms_look_right', label: 'Hands Up + Right', instruction: 'Keep arms up and look RIGHT', voice: 'Keep your hands up. Look right and hold.', kind: 'look', direction: 'right', holdMs: HOLD_MS, requireArms: true }),
      step({ id: 'arms_look_left', label: 'Hands Up + Left', instruction: 'Keep arms up and look LEFT', voice: 'Keep your hands up. Look left and hold.', kind: 'look', direction: 'left', holdMs: HOLD_MS, requireArms: true }),
      step({ id: 'arms_look_down', label: 'Hands Up + Down', instruction: 'Keep arms up and look DOWN', voice: 'Keep your hands up. Look down and hold.', kind: 'look', direction: 'down', holdMs: HOLD_MS, requireArms: true }),
      step({ id: 'arms_look_up', label: 'Hands Up + Up', instruction: 'Keep arms up and look UP', voice: 'Keep your hands up. Look up and hold.', kind: 'look', direction: 'up', holdMs: HOLD_MS, requireArms: true }),
    ],
  },
  {
    day: 6,
    title: 'Strength & Control',
    steps: [
      calibrateStep,
      step({ id: 'chin_tuck_8', label: 'Chin Tuck', instruction: 'Lower your chin, then return to neutral', voice: 'Do eight chin tucks. Lower your chin, then return to neutral.', kind: 'chin_tuck', reps: 8 }),
      step({ id: 'neutral_hold', label: 'Neutral Hold', instruction: 'Hold a tall neutral posture', voice: 'Hold a tall neutral posture.', kind: 'timed', durationMs: 10000 }),
      step({ id: 'look_right', label: 'Look Right', instruction: 'Look RIGHT', voice: 'Look right and hold for two seconds.', kind: 'look', direction: 'right', holdMs: HOLD_MS }),
      step({ id: 'look_left', label: 'Look Left', instruction: 'Look LEFT', voice: 'Look left and hold for two seconds.', kind: 'look', direction: 'left', holdMs: HOLD_MS }),
    ],
  },
  {
    day: 7,
    title: 'Assessment Day',
    steps: [
      calibrateStep,
      step({ id: 'look_right', label: 'Look Right', instruction: 'Look RIGHT', voice: 'Look right and hold for two seconds.', kind: 'look', direction: 'right', holdMs: HOLD_MS }),
      step({ id: 'look_left', label: 'Look Left', instruction: 'Look LEFT', voice: 'Look left and hold for two seconds.', kind: 'look', direction: 'left', holdMs: HOLD_MS }),
      step({ id: 'look_down', label: 'Look Down', instruction: 'Look DOWN', voice: 'Look down and hold for two seconds.', kind: 'look', direction: 'down', holdMs: HOLD_MS }),
      step({ id: 'look_up', label: 'Look Up', instruction: 'Look UP', voice: 'Look up and hold for two seconds.', kind: 'look', direction: 'up', holdMs: HOLD_MS }),
      step({ id: 'neutral_hold', label: 'Posture Check', instruction: 'Hold a comfortable upright posture', voice: 'Hold a comfortable upright posture.', kind: 'timed', durationMs: 10000 }),
    ],
  },
]

export function getTodayRoutine(date = new Date()): Routine {
  let startDate = ''
  try {
    startDate = localStorage.getItem('fyn-routine-start-date') ?? ''
    if (!startDate) {
      startDate = date.toISOString().slice(0, 10)
      localStorage.setItem('fyn-routine-start-date', startDate)
    }
  } catch {
    const day = ((date.getDay() + 6) % 7) + 1
    return routines[day - 1]
  }

  const start = new Date(`${startDate}T00:00:00`)
  const today = new Date(date.toISOString().slice(0, 10) + 'T00:00:00')
  const elapsedDays = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86_400_000))
  const day = (elapsedDays % 7) + 1
  return routines[day - 1]
}

export function createEngine(): EngineState {
  const routine = getTodayRoutine()
  return {
    current: 'idle',
    holdTimer: 0,
    feedback: {
      instruction: 'Click Start to begin',
      status: 'waiting',
      routineTitle: `Day ${routine.day}: ${routine.title}`,
    },
    calibSamples: [],
    neutralHeadHeight: 0,
    routineDay: routine.day,
    routineTitle: routine.title,
    stepIndex: 0,
    repCount: 0,
    repPhase: 'down',
    eyeThreshold: 0.2,
  }
}

function headMetrics(keypoints: Keypoint[]): { xOffset: number; headHeight: number } | null {
  const nose = kp(keypoints, 'nose')
  const ls = kp(keypoints, 'left_shoulder')
  const rs = kp(keypoints, 'right_shoulder')
  if (!nose || !ls || !rs || nose.score < 0.2 || ls.score < 0.2 || rs.score < 0.2) return null

  const shoulderWidth = Math.max(Math.abs(ls.x - rs.x), 1)
  const shoulderCenterX = (ls.x + rs.x) / 2
  const shoulderCenterY = (ls.y + rs.y) / 2

  return {
    xOffset: (nose.x - shoulderCenterX) / shoulderWidth,
    headHeight: (shoulderCenterY - nose.y) / shoulderWidth,
  }
}

function setStepFeedback(e: EngineState, stepConfig: RoutineStep, status: ExerciseFeedback['status'], progress = 0) {
  e.feedback = {
    instruction: stepConfig.instruction,
    status,
    progress,
    label: stepConfig.label,
    routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
    voice: stepConfig.voice,
  }
}

function completeCurrentStep(e: EngineState, routine: Routine) {
  e.stepIndex += 1
  e.holdTimer = 0
  e.repCount = 0
  e.repPhase = 'down'

  const next = routine.steps[e.stepIndex]
  if (!next) {
    e.current = 'complete'
    e.feedback = {
      instruction: 'Exercise complete!',
      status: 'success',
      label: 'Complete!',
      routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
      voice: 'Exercise complete. Great job.',
    }
    return
  }

  e.current = next.id
  setStepFeedback(e, next, 'waiting', 0)
}

export function tickEngine(engine: EngineState, keypoints: Keypoint[], dt: number, faceKps?: Array<{x: number; y: number}>): EngineState {
  const e = { ...engine }
  
  if (e.current === 'idle' || e.current === 'complete') return e

  const routine = routines[e.routineDay - 1] ?? getTodayRoutine()
  const stepConfig = routine.steps[e.stepIndex]
  if (!stepConfig) {
    e.current = 'complete'
    e.feedback = {
      instruction: 'Exercise complete!',
      status: 'success',
      label: 'Complete!',
      routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
      voice: 'Exercise complete. Great job.',
    }
    return e
  }

  if (e.current !== stepConfig.id) {
    e.current = stepConfig.id
  }

  if (stepConfig.kind === 'timed') {
    const duration = stepConfig.durationMs ?? HOLD_MS
    e.holdTimer += dt
    const progress = Math.min(e.holdTimer / duration, 1)
    e.feedback = {
      instruction: stepConfig.instruction,
      status: 'in_progress',
      progress,
      label: stepConfig.label,
      routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
      voice: stepConfig.voice,
    }
    if (e.holdTimer >= duration) {
      completeCurrentStep(e, routine)
    }
    return e
  }

  const metrics = headMetrics(keypoints)
  if (!metrics) {
    e.holdTimer = 0
    e.feedback = {
      instruction: 'Keep your face and shoulders visible',
      status: 'in_progress',
      progress: 0,
      label: stepConfig.label,
      routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
    }
    return e
  }

  const side = ExerciseConfig.lookSideOffsetRatio
  const neutral = Math.max(e.neutralHeadHeight, 0.001)
  const downTarget = neutral * ExerciseConfig.lookDownRatio
  const upTarget = neutral * ExerciseConfig.lookUpRatio

  if (stepConfig.kind === 'calibrate') {
    e.calibSamples = [...e.calibSamples, metrics.headHeight]
    const progress = Math.min(e.calibSamples.length / 10, 1)
    setStepFeedback(e, stepConfig, 'waiting', progress)
    if (e.calibSamples.length >= CALIBRATION_SAMPLES) {
      e.neutralHeadHeight = e.calibSamples.reduce((a, b) => a + b, 0) / e.calibSamples.length
      completeCurrentStep(e, routine)
    }
    return e
  }

  if (stepConfig.kind === 'arms_up') {
    const armsOk = bothArmsRaised(keypoints)
    if (armsOk) {
      e.holdTimer += dt
      const progress = Math.min(e.holdTimer / (stepConfig.holdMs ?? HOLD_MS), 1)
      e.feedback = {
        instruction: 'Hold your arms up...',
        status: 'in_progress',
        progress,
        label: stepConfig.label,
        routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
        voice: stepConfig.voice,
      }
      if (e.holdTimer >= (stepConfig.holdMs ?? HOLD_MS)) {
        completeCurrentStep(e, routine)
      }
    } else {
      e.holdTimer = 0
      setStepFeedback(e, stepConfig, 'in_progress', 0)
    }
    return e
  }

  if (stepConfig.kind === 'chin_tuck') {
    const targetReps = stepConfig.reps ?? 5
    if (e.repPhase === 'down') {
      if (metrics.headHeight < downTarget) {
        e.repPhase = 'neutral'
      }
      e.feedback = {
        instruction: `Lower your chin (${e.repCount}/${targetReps})`,
        status: 'in_progress',
        progress: e.repCount / targetReps,
        label: stepConfig.label,
        routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
        voice: stepConfig.voice,
      }
      return e
    }

    if (metrics.headHeight > neutral * 0.9) {
      e.repCount += 1
      e.repPhase = 'down'
    }

    const progress = Math.min(e.repCount / targetReps, 1)
    e.feedback = {
      instruction: e.repCount >= targetReps
        ? 'Chin tucks complete'
        : `Return to neutral (${e.repCount}/${targetReps})`,
      status: 'in_progress',
      progress,
      label: stepConfig.label,
      routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
      voice: stepConfig.voice,
    }
    if (e.repCount >= targetReps) {
      completeCurrentStep(e, routine)
    }
    return e
  }

  if (stepConfig.kind === 'look') {
    if (stepConfig.requireArms && !bothArmsRaised(keypoints)) {
      e.holdTimer = 0
      e.feedback = {
        instruction: 'Keep both hands raised beside your head',
        status: 'in_progress',
        progress: 0,
        label: stepConfig.label,
        routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
        voice: stepConfig.voice,
      }
      return e
    }

    const ok =
      stepConfig.direction === 'right' ? metrics.xOffset < -side :
      stepConfig.direction === 'left' ? metrics.xOffset > side :
      stepConfig.direction === 'down' ? metrics.headHeight < downTarget :
      stepConfig.direction === 'up' ? metrics.headHeight > upTarget :
      false

    if (ok) {
      e.holdTimer += dt
      const progress = Math.min(e.holdTimer / (stepConfig.holdMs ?? HOLD_MS), 1)
      e.feedback = {
        instruction: `Hold for ${Math.round((stepConfig.holdMs ?? HOLD_MS) / 1000)} seconds...`,
        status: 'in_progress',
        progress,
        label: stepConfig.label,
        routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
        voice: stepConfig.voice,
      }
      if (e.holdTimer >= (stepConfig.holdMs ?? HOLD_MS)) {
        completeCurrentStep(e, routine)
      }
    } else {
      e.holdTimer = 0
      const value = stepConfig.direction === 'down' || stepConfig.direction === 'up'
        ? metrics.headHeight.toFixed(2)
        : metrics.xOffset.toFixed(2)
      e.feedback = {
        instruction: `${stepConfig.instruction} (${value})`,
        status: 'in_progress',
        progress: 0,
        label: stepConfig.label,
        routineTitle: `Day ${e.routineDay}: ${e.routineTitle}`,
        voice: stepConfig.voice,
      }
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
