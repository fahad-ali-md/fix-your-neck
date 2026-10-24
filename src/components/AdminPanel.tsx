// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AdminPanel — Wrapper for all admin sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    Renders the full admin sidebar (LiveCalibrations + PoseBuilder + SavedPoseList
//    + CameraRules + MatchingSettings + Data management).
//    Acts as the state coordinator between sub-components — it defines the actual
//    callback functions for New/Save/Revert/Edit/Select/Delete so that the
//    sub-components stay "dumb display" components.
//
//  WHERE THE DATA COMES FROM:
//    Everything is passed as props from App.tsx:
//    - adminConfig, editingPose → the admin state
//    - onSetEditingPose, onNameChange, onUpdateConfig → state setters from App
//    - onForceRender → used by LiveCalibrations (triggers React re-render)
//    - onSaveConfig → persists ExerciseConfig to localStorage (called after slider change)
//
//  WHY SEPARATE:
//    Keeps all the admin logic coordination in one place (~70 lines)
//    instead of bloating App.tsx with callback definitions for 5 sub-components.
//    The sub-components themselves are purely presentational.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import LiveCalibrations from './LiveCalibrations'
import PoseEditor from './PoseEditor'
import SavedPoseList from './SavedPoseList'
import CameraRules from './CameraRules'
import MatchingSettings from './MatchingSettings'
import type { AdminExerciseConfig, SavedPose } from '../utils/adminExerciseConfig'
import { upsertPose, deletePose, resetAdminConfig } from '../utils/adminExerciseConfig'
import { defaultEditablePose, updateJoint } from '../utils/poseMatching'

// ── PROPS ──────────────────────────────────────────────────────────────────────
interface AdminPanelProps {
  adminConfig: AdminExerciseConfig
  editingPose: SavedPose
  poseNameInput: string
  onNameChange: (name: string) => void
  onForceRender: React.Dispatch<React.SetStateAction<number>>
  onSaveConfig: () => void               // persists ExerciseConfig (global mutable)
  onSetEditingPose: React.Dispatch<React.SetStateAction<SavedPose>>
  onUpdateConfig: (next: AdminExerciseConfig) => void
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function AdminPanel({
  adminConfig,
  editingPose,
  poseNameInput,
  onNameChange,
  onForceRender,
  onSaveConfig,
  onSetEditingPose,
  onUpdateConfig,
}: AdminPanelProps) {

  // ── Pose editor callbacks ──────────────────────────────────────────────────
  // These coordinate between editingPose state, adminConfig, and poseNameInput.

  const handleNewPose = () => {
    const p = defaultEditablePose(poseNameInput || 'New Pose')
    onSetEditingPose(p)
    onNameChange(p.name)
  }

  const handleSavePose = () => {
    const p = { ...editingPose, name: poseNameInput || 'Unnamed' }
    const next = upsertPose(adminConfig, p)
    onUpdateConfig(next)
    onSetEditingPose(p)
  }

  const handleRevertPose = () => {
    const p = adminConfig.poses.find(pp => pp.id === editingPose.id)
    if (p) {
      onSetEditingPose(p)
      onNameChange(p.name)
    }
  }

  const handleEditPose = (pose: SavedPose) => {
    onSetEditingPose(pose)
    onNameChange(pose.name)
  }

  const handleSelectPose = (poseId: string) => {
    onUpdateConfig({ ...adminConfig, activePoseId: poseId })
  }

  const handleDeletePose = (poseId: string) => {
    const next = deletePose(adminConfig, poseId)
    onUpdateConfig(next)
    // If the deleted pose was being edited, reset the editor to defaults
    if (editingPose.id === poseId) {
      const defaultPose = defaultEditablePose()
      onSetEditingPose(defaultPose)
      onNameChange(defaultPose.name)
    }
  }

  // ── Drag joint callback for PoseEditor ──
  // Uses function-updater form so React batches updates during drag.
  const handleDragJoint = (jointName: string, nx: number, ny: number) => {
    onSetEditingPose(prev => updateJoint(prev, jointName, nx, ny))
  }

  // ── Camera rules update ────────────────────────────────────────────────────
  const handleCameraRulesUpdate = (rules: AdminExerciseConfig['cameraRules']) => {
    onUpdateConfig({ ...adminConfig, cameraRules: rules })
  }

  // ── Matching settings update ────────────────────────────────────────────────
  const handleMatchingUpdate = (partial: { matchTolerance?: number; holdMs?: number }) => {
    onUpdateConfig({ ...adminConfig, ...partial })
  }

  return (
    <div className="admin-sidebar">

      {/* ── Live Calibrations ── sliders for detection parameters ── */}
      <LiveCalibrations
        onForceRender={onForceRender}
        onSaveConfig={onSaveConfig}
      />

      {/* ── Pose Builder ── draggable skeleton + name input ── */}
      <PoseEditor
        editingPose={editingPose}
        poseNameInput={poseNameInput}
        onNameChange={onNameChange}
        onNewPose={handleNewPose}
        onSavePose={handleSavePose}
        onRevertPose={handleRevertPose}
        onDragJoint={handleDragJoint}
      />

      {/* ── Saved Poses ── list with Edit/Select/Delete ── */}
      <SavedPoseList
        poses={adminConfig.poses}
        activePoseId={adminConfig.activePoseId}
        editingPoseId={editingPose.id}
        onEditPose={handleEditPose}
        onSelectPose={handleSelectPose}
        onDeletePose={handleDeletePose}
        onLoadDefaultPose={() => {
          const p = defaultEditablePose()
          onSetEditingPose(p)
          onNameChange(p.name)
        }}
      />

      {/* ── Camera Position Rules ── min/max shoulder, require wrists ── */}
      <CameraRules
        cameraRules={adminConfig.cameraRules}
        onUpdate={handleCameraRulesUpdate}
      />

      {/* ── Matching Settings ── tolerance + hold duration ── */}
      <MatchingSettings
        matchTolerance={adminConfig.matchTolerance}
        holdMs={adminConfig.holdMs}
        onUpdateConfig={handleMatchingUpdate}
      />

      {/* ── Data Management ── export + reset ── */}
      <section>
        <h4>Data</h4>
        <button className="btn-copy" onClick={() => {
          const json = JSON.stringify(adminConfig, null, 2)
          navigator.clipboard.writeText(json).catch(() => {})
        }}>
          📋 Export Admin Config
        </button>
        <button
          className="btn-copy btn-danger"
          style={{ marginTop: '8px' }}
          onClick={() => {
            if (window.confirm('Reset all admin data? This cannot be undone.')) {
              const next = resetAdminConfig()
              onUpdateConfig(next)
              const defaultPose = defaultEditablePose()
              onSetEditingPose(defaultPose)
              onNameChange(defaultPose.name)
            }
          }}
        >
          🗑️ Reset All Data
        </button>
      </section>

    </div>
  )
}
