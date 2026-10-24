// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MatchingSettings — Pose Matching Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    Provides sliders for pose matching parameters. These control how strictly
//    a live pose must match a saved target pose before it counts as "matched".
//
//  WHERE THE DATA COMES FROM:
//    - matchTolerance: max average distance (normalized 0-1) between joint
//      positions. 0.18 means joints must be within 18% of the frame size.
//    - holdMs: how long (in milliseconds) the match must be sustained
//      before it counts as "held". Prevents brief accidental matches.
//    - onUpdate: callback that merges new values into adminConfig
//
//  THIS FEATURE IS CURRENTLY DISABLED:
//    The pose matching code exists but is commented out in App.tsx.
//    These settings do nothing right now. They were part of a planned
//    feature where users would match a saved "target pose" before
//    the exercise would start.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── PROPS ──────────────────────────────────────────────────────────────────────
interface MatchingSettingsProps {
  matchTolerance: number    // 0-1: how close joints must match (lower = stricter)
  holdMs: number            // ms: how long match must be sustained
  onUpdateConfig: (partial: { matchTolerance?: number; holdMs?: number }) => void
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function MatchingSettings({
  matchTolerance,
  holdMs,
  onUpdateConfig,
}: MatchingSettingsProps) {
  return (
    <section>
      <h4>Matching Settings</h4>

      {/* ── Match Tolerance ── how close the live pose must be to the saved pose.
           0.05 = almost perfect match (strict), 0.5 = very loose (forgiving). */}
      <div className="setting-row">
        <div>
          <label>Match Tolerance</label>
          <span>{matchTolerance.toFixed(2)}</span>
        </div>
        <input
          type="range" min="0.05" max="0.5" step="0.01"
          value={matchTolerance}
          onChange={e =>
            onUpdateConfig({ matchTolerance: Number(e.target.value) })
          }
        />
      </div>

      {/* ── Hold Duration ── how long the user must hold the matched pose.
           500ms = brief hold (easy), 5000ms = 5 second hold (hard). */}
      <div className="setting-row">
        <div>
          <label>Hold Duration</label>
          <span>{holdMs}ms</span>
        </div>
        <input
          type="range" min="500" max="5000" step="100"
          value={holdMs}
          onChange={e =>
            onUpdateConfig({ holdMs: Number(e.target.value) })
          }
        />
      </div>
    </section>
  )
}
