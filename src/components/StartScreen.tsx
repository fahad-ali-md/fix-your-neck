// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  StartScreen — Pre-Exercise Landing Screen
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    Shows the "Start Exercise" button before the user begins.
//    This is the first thing the user sees after the camera loads.
//
//  WHERE THE DATA COMES FROM:
//    - onStart: a function passed from App.tsx that initializes the exercise
//      engine (creates a new EngineState, starts neutral calibration).
//
//  WHY THIS IS A SEPARATE COMPONENT:
//    It's conditionally rendered only when !started && !showSettings.
//    Keeping it separate avoids cluttering App.tsx with conditional JSX.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── PROPS ──────────────────────────────────────────────────────────────────────
interface StartScreenProps {
  onStart: () => void   // Callback: user clicked "Start Exercise"
  disabled?: boolean
  readinessMessage?: string | null
  routineTitle?: string
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function StartScreen({
  onStart,
  disabled = false,
  readinessMessage = null,
  routineTitle,
}: StartScreenProps) {
  return (
    <div className="start-screen">
      {routineTitle && (
        <div className="routine-title">{routineTitle}</div>
      )}

      {readinessMessage && (
        <p className="start-hint">{readinessMessage}</p>
      )}

      {/* ── Start button ── kicks off the exercise flow */}
      <button className="btn-start" onClick={onStart} disabled={disabled}>
        Start Exercise
      </button>
    </div>
  )
}
