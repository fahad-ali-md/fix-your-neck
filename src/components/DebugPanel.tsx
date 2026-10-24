// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DebugPanel — Live Debug Overlay
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  Shows real-time AI data on top of the camera feed: neck angle, EAR,
//  and posture metrics from the face-height-normalized algorithm.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { ExerciseState } from '../utils/exerciseLogic'

// ── TYPE ───────────────────────────────────────────────────────────────────────
export interface DebugData {
  angle: string
  leftEAR: string
  rightEAR: string
  avgEAR: string
  threshold: string
  face: string
  leftEyeOpen: boolean | null
  rightEyeOpen: boolean | null
  leftHand: { ok: boolean; reason: string } | null
  rightHand: { ok: boolean; reason: string } | null
  posture: string
  nose: string
  leftShoulder: string
  rightShoulder: string
  // Face-anchored posture metrics
  faceHeight: string
  shoulderWidth: string
  noseOffset: string
  neckLength: string
  forwardHead: string
  score: string
  holdMs: string
  // Rejection info
  rejection: string
  shoulderSymmetry: string
  faceRoll: string
  torsoAngle: string
}

// ── PROPS ──────────────────────────────────────────────────────────────────────
interface DebugPanelProps {
  debugRef: React.MutableRefObject<DebugData>
  state: ExerciseState
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function DebugPanel({ debugRef, state }: DebugPanelProps) {
  const d = debugRef.current

  const postureClass = d.posture.startsWith('✅') ? 'posture-good'
    : d.posture.startsWith('🔴') ? 'posture-poor'
    : d.posture.startsWith('—') ? 'posture-slight'
    : ''

  return (
    <div className="debug-panel">
      <div>Neck: {d.angle}</div>

      <div>
        L-EAR: {d.leftEAR}
        {d.leftEyeOpen !== null && (
          <span className={d.leftEyeOpen ? 'ear-open' : 'ear-closed'}>
            {d.leftEyeOpen ? ' 👁 OPEN' : ' 🔴 CLOSED'}
          </span>
        )}
      </div>
      <div>
        R-EAR: {d.rightEAR}
        {d.rightEyeOpen !== null && (
          <span className={d.rightEyeOpen ? 'ear-open' : 'ear-closed'}>
            {d.rightEyeOpen ? ' 👁 OPEN' : ' 🔴 CLOSED'}
          </span>
        )}
      </div>
      <div>Avg EAR: <b>{d.avgEAR}</b></div>
      <div>Threshold: <b>{d.threshold}</b></div>
      <div>Face: {d.face}</div>

      {/* ── Posture section: FaceHeight-anchored, 4-signal weighted ── */}
      <div className={`posture-row ${postureClass}`}>
        Posture: {d.posture}
      </div>

      <div className="posture-detail">
        <div>FH: {d.faceHeight}  Sh-W: {d.shoulderWidth}</div>
        <div>NOff: {d.noseOffset}  Neck: {d.neckLength}</div>
        <div>Fwd: {d.forwardHead}</div>
        <div>Score: <b>{d.score}</b>  Hold: {d.holdMs}ms</div>
      </div>

      {/* ── Rejection gate status ── */}
      {d.rejection !== '—' && (
        <div className="posture-sub" style={{ color: '#ffaa44' }}>
          Skipped: {d.rejection}
        </div>
      )}

      <div className="posture-sub" style={{ fontSize: '0.68rem', opacity: 0.5 }}>
        Sym: {d.shoulderSymmetry} Roll: {d.faceRoll} Torso: {d.torsoAngle}
      </div>

      <div className="kp-row">Nose: {d.nose}</div>
      <div className="kp-row">L-Sh: {d.leftShoulder}</div>
      <div className="kp-row">R-Sh: {d.rightShoulder}</div>

      <div className="debug-state">{state}</div>
    </div>
  )
}
