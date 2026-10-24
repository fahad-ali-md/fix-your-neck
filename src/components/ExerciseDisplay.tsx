// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ExerciseDisplay — Active Exercise UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    Shows the current exercise state while the user is doing exercises:
//    - Exercise badge (e.g. "Look Right", "Look Down")
//    - Instruction text (e.g. "Turn your head LEFT ← (15°)")
//    - Progress bar (for timed exercises like eye closure)
//    - Restart button (when exercise is complete)
//
//  WHERE THE DATA COMES FROM:
//    - feedback: from the exercise engine (exerciseLogic.ts → tickEngine())
//      Contains the instruction string, status, and progress (0-1)
//    - state: the current ExerciseState ('look_right' | 'look_left' | etc)
//    - onRestart: callback to reset everything back to idle
//
//  DATA FLOW:
//    App.tsx (game loop) → tickEngine() → new feedback + state
//    → setFeedback() + setState() → React re-renders → this component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef } from 'react'
import type { ExerciseFeedback, ExerciseState } from '../utils/exerciseLogic'

// ── PROPS ──────────────────────────────────────────────────────────────────────
interface ExerciseDisplayProps {
  feedback: ExerciseFeedback   // Current instruction, status, and progress
  state: ExerciseState         // Which exercise phase we're in
  onRestart: () => void        // Callback for the Restart button
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function ExerciseDisplay({
  feedback,
  state,
  onRestart,
}: ExerciseDisplayProps) {
  const lastSpokenStateRef = useRef<ExerciseState | null>(null)

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    if (lastSpokenStateRef.current === state) return

    const prompts: Partial<Record<ExerciseState, string>> = {
      calibrate: 'Look straight at the camera.',
      look_right: 'Look right and hold for two seconds.',
      look_left: 'Look left and hold for two seconds.',
      look_down: 'Look down and hold for two seconds.',
      look_up: 'Look up and hold for two seconds.',
      arms_up: 'Stage two. Raise both hands beside your head and hold.',
      arms_look_right: 'Keep your hands up. Look right and hold for two seconds.',
      arms_look_left: 'Keep your hands up. Look left and hold for two seconds.',
      complete: 'Exercise complete. Great job.',
    }

    const text = feedback.voice ?? prompts[state]
    if (!text) return

    lastSpokenStateRef.current = state
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 0.9
    utterance.pitch = 1
    window.speechSynthesis.speak(utterance)
  }, [state, feedback.voice])

  // Calculate progress percentage for the progress bar width.
  // feedback.progress is 0-1 (nullable), so we default to 0.
  const progressPct = feedback.progress ? Math.round(feedback.progress * 100) : 0

  return (
    <div className="exercise-display">
      {feedback.routineTitle && (
        <div className="routine-title">{feedback.routineTitle}</div>
      )}

      {/* ── Exercise Badge ── shows the current exercise name with color coding
           Each state gets a different CSS class that sets background/text color */}
      <div className={`exercise-badge ${state}`}>
        {feedback.label ?? (state === 'complete' ? '🎉 Complete!' : state)}
      </div>

      {/* ── Instruction Text ── the main feedback from tickEngine()
           Status class changes color: 'waiting'=dim, 'success'=green */}
      <div className={`instruction ${feedback.status}`}>
        {feedback.instruction}
      </div>

      {/* ── Progress Bar ── shown during calibration and movement holds
           Hidden when exercise is complete (no point showing a full bar) */}
      {feedback.progress !== undefined && state !== 'complete' && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {/* ── Restart Button ── only shown after all exercises are complete */}
      {state === 'complete' && (
        <button className="btn-restart" onClick={onRestart}>
          Restart
        </button>
      )}
    </div>
  )
}
