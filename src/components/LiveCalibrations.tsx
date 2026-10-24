// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LiveCalibrations — Exercise Config Sliders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    Shows 4 sliders that let you tweak exercise detection parameters IN REAL TIME
//    while the camera is running. Changes take effect immediately — no restart needed.
//
//  WHERE THE DATA COMES FROM:
//    - ExerciseConfig: a GLOBAL mutable object (defined in exerciseLogic.ts).
//      Not React state — it's a plain JS object. Sliders write directly to it.
//    - onForceRender: a callback that bumps React's render counter so the UI
//      updates to show the new slider values.
//    - onSaveConfig: persists the current config to localStorage.
//
//  WHY IS ExerciseConfig A GLOBAL AND NOT STATE?
//    Because the game loop (setInterval in App.tsx) reads config values like
//    headTurnAngle and eyeCloseMultiplier on every tick. If these were React
//    state, the interval would need them in its dependency array, causing it
//    to re-create every time a slider moves. Using a global mutable object
//    avoids this problem entirely.
//
//  HOW SLIDERS WORK:
//    onChange → writes new value to ExerciseConfig → saves → forces re-render
//    The "forces re-render" part is handled by the parent's forceRender state.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { ExerciseConfig } from '../utils/exerciseLogic'

// ── PROPS ──────────────────────────────────────────────────────────────────────
interface LiveCalibrationsProps {
  onForceRender: React.Dispatch<React.SetStateAction<number>>
  onSaveConfig: () => void
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function LiveCalibrations({
  onForceRender,
  onSaveConfig,
}: LiveCalibrationsProps) {
  return (
    <section>
      <h4>Live Calibrations</h4>

      {/* ── Hand-Ear Distance ── max vertical distance (px) between wrist and ear
           for "hands beside ears" detection. Higher = more forgiving. */}
      <div className="setting-row">
        <div>
          <label>Hand-Ear Distance</label>
          <span>{ExerciseConfig.handEarMaxDist}px</span>
        </div>
        <input
          type="range" min="30" max="250" step="5"
          value={ExerciseConfig.handEarMaxDist}
          onChange={e => {
            ExerciseConfig.handEarMaxDist = Number(e.target.value)
            onSaveConfig()
            onForceRender(v => v + 1)
          }}
        />
      </div>

      {/* ── Slouch Ratio Limit ── multiplier against baseline.
           Lower = stricter (must be MORE upright to not be "slouching").
           1.0 = must maintain max posture, 0.6 = very forgiving. */}
      <div className="setting-row">
        <div>
          <label>Slouch Ratio Limit</label>
          <span>{ExerciseConfig.slouchRatioMultiplier}x</span>
        </div>
        <input
          type="range" min="0.6" max="1.0" step="0.01"
          value={ExerciseConfig.slouchRatioMultiplier}
          onChange={e => {
            ExerciseConfig.slouchRatioMultiplier = Number(e.target.value)
            onSaveConfig()
            onForceRender(v => v + 1)
          }}
        />
      </div>

      {/* ── Eye Close EAR Multiplier ── fraction of baseline EAR to use as
           "eyes closed" threshold. Baseline is measured during the first 1.5s
           of the eye-close phase (user keeps eyes open, we measure normal EAR).
           Threshold = baseline × this multiplier.
           0.72 means "eyes closed when EAR drops to 72% of normal". */}
      <div className="setting-row">
        <div>
          <label>Eye Close EAR</label>
          <span>{ExerciseConfig.eyeCloseMultiplier}x</span>
        </div>
        <input
          type="range" min="0.5" max="0.9" step="0.01"
          value={ExerciseConfig.eyeCloseMultiplier}
          onChange={e => {
            ExerciseConfig.eyeCloseMultiplier = Number(e.target.value)
            onSaveConfig()
            onForceRender(v => v + 1)
          }}
        />
      </div>

      {/* ── Head Turn Angle ── degrees of neck rotation to count as a "turn".
           25° means you must turn at least 25° left/right. Lower = easier. */}
      <div className="setting-row">
        <div>
          <label>Head Turn Angle</label>
          <span>{ExerciseConfig.headTurnAngle}°</span>
        </div>
        <input
          type="range" min="10" max="60" step="1"
          value={ExerciseConfig.headTurnAngle}
          onChange={e => {
            ExerciseConfig.headTurnAngle = Number(e.target.value)
            onSaveConfig()
            onForceRender(v => v + 1)
          }}
        />
      </div>

      {/* ── Copy Config to Clipboard ── for debugging or sharing settings */}
      <button
        className="btn-copy"
        onClick={() => {
          const json = JSON.stringify(ExerciseConfig, null, 2)
          navigator.clipboard.writeText(json).catch(() => {})
          onSaveConfig()
        }}
      >
        📋 Copy Config
      </button>
    </section>
  )
}
