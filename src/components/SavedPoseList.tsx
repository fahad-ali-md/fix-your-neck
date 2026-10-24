// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SavedPoseList — Saved Poses Management List
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    Shows a list of all saved poses from the admin config. Each row has:
//    - Edit: load the pose into the editor canvas
//    - Select / ✓ Active: mark this pose as the one to match against live poses
//    - ✕ Delete: remove the pose (with confirmation)
//
//  WHERE THE DATA COMES FROM:
//    - poses: array of SavedPose objects from adminConfig (localStorage)
//    - activePoseId: which pose is currently the active target
//    - editingPoseId: which pose is being edited (to know if delete should reset)
//    - callbacks for each action
//
//  DATA FLOW:
//    AdminPanel → SavedPoseList → user clicks → AdminPanel calls updateConfig
//    → new adminConfig saved to localStorage → component re-renders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { SavedPose } from '../utils/adminExerciseConfig'

// ── PROPS ──────────────────────────────────────────────────────────────────────
interface SavedPoseListProps {
  poses: SavedPose[]             // All saved poses from admin config
  activePoseId: string | null    // Which pose ID is currently active target
  editingPoseId: string          // Which pose is in the editor (for delete handling)
  onEditPose: (pose: SavedPose) => void
  onSelectPose: (poseId: string) => void
  onDeletePose: (poseId: string) => void
  onLoadDefaultPose: () => void  // Reset editor to default after deleting edited pose
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function SavedPoseList({
  poses,
  activePoseId,
  editingPoseId,
  onEditPose,
  onSelectPose,
  onDeletePose,
  onLoadDefaultPose,
}: SavedPoseListProps) {
  return (
    <section>
      <h4>Saved Poses</h4>

      {/* ── Empty state ── shown when no poses exist yet */}
      {poses.length === 0 && (
        <p className="admin-placeholder">No saved poses yet</p>
      )}

      {/* ── Pose list ── one row per saved pose */}
      {poses.map(pose => (
        <div
          key={pose.id}
          className={`saved-pose-row${activePoseId === pose.id ? ' active' : ''}`}
        >
          {/* Pose name */}
          <span className="saved-pose-name">{pose.name}</span>

          {/* Action buttons */}
          <div className="saved-pose-actions">
            <button className="btn-tiny" onClick={() => onEditPose(pose)}>
              Edit
            </button>
            <button
              className="btn-tiny"
              onClick={() => onSelectPose(pose.id)}
            >
              {activePoseId === pose.id ? '✓ Active' : 'Select'}
            </button>
            <button
              className="btn-tiny btn-danger"
              onClick={() => {
                if (window.confirm(`Delete "${pose.name}"?`)) {
                  onDeletePose(pose.id)
                }
              }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}
