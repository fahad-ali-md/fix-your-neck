// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CameraRules — Camera Positioning Requirements
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    Provides controls for camera positioning rules. These determine whether
//    the user is at the right distance from the camera before starting.
//
//  WHERE THE DATA COMES FROM:
//    - cameraRules: part of the adminConfig (persisted to localStorage)
//    - onUpdate: callback that merges the new rules into adminConfig
//
//  RULES:
//    - Min Shoulder Ratio: if shoulders appear too SMALL (far from camera), block start
//    - Max Shoulder Ratio: if shoulders appear too LARGE (too close), block start
//    - Require Wrists: if enabled, user must show both wrists to start
//      (This is currently disabled in the code — commented out in App.tsx)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { CameraRules as CameraRulesType } from '../utils/adminExerciseConfig'

// ── PROPS ──────────────────────────────────────────────────────────────────────
interface CameraRulesProps {
  cameraRules: CameraRulesType   // Current rule values
  onUpdate: (rules: CameraRulesType) => void   // Merge and save new rules
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function CameraRules({ cameraRules, onUpdate }: CameraRulesProps) {
  return (
    <section>
      <h4>Camera Position Rules</h4>

      {/* ── Min Shoulder Ratio ── lower bound for shoulder width / frame width.
           If the user is too far, shoulders appear small and ratio drops below this. */}
      <div className="setting-row">
        <div>
          <label>Min Shoulder Ratio</label>
          <span>{cameraRules.minShoulderRatio.toFixed(2)}</span>
        </div>
        <input
          type="range" min="0.05" max="0.5" step="0.01"
          value={cameraRules.minShoulderRatio}
          onChange={e => {
            onUpdate({ ...cameraRules, minShoulderRatio: Number(e.target.value) })
          }}
        />
      </div>

      {/* ── Max Shoulder Ratio ── upper bound. If user is too close,
           shoulders appear huge and ratio exceeds this. */}
      <div className="setting-row">
        <div>
          <label>Max Shoulder Ratio</label>
          <span>{cameraRules.maxShoulderRatio.toFixed(2)}</span>
        </div>
        <input
          type="range" min="0.2" max="0.8" step="0.01"
          value={cameraRules.maxShoulderRatio}
          onChange={e => {
            onUpdate({ ...cameraRules, maxShoulderRatio: Number(e.target.value) })
          }}
        />
      </div>

      {/* ── Require Wrists ── toggle. When enabled, user must show both wrists
           to the camera before the exercise can start. */}
      <div className="setting-row">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={cameraRules.requireWrists}
            onChange={e => {
              onUpdate({ ...cameraRules, requireWrists: e.target.checked })
            }}
          />
          Require Wrists Visible
        </label>
      </div>
    </section>
  )
}
