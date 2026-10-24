// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PoseEditor — Drag-to-Move Joint Skeleton Canvas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    Renders a small canvas showing an editable skeleton where you can
//    CLICK AND DRAG individual joints to create custom poses.
//    Used in the Admin Panel's "Pose Builder" section.
//
//  WHERE THE DATA COMES FROM:
//    - editingPose: a SavedPose object with named joints and normalized (0-1) positions
//    - poseNameInput: current text in the pose name field
//    - onDragJoint: callback( jointName, normalizedX, normalizedY ) — parent calls
//      setEditingPose(prev => updateJoint(prev, name, nx, ny)) using the function
//      updater form so React batches high-frequency drag events efficiently
//
//  HOW THE CANVAS WORKS (no local React state — pure Canvas2D + pointer events):
//    1. useEffect draws the skeleton from editingPose.joints
//       - Scales normalized (0-1) positions to canvas pixel coords
//       - Draws green lines for bones, green dots for joints
//    2. Pointer events handle drag-to-move:
//       - onPointerDown: hit-test to find which joint user clicked
//       - onPointerMove: if dragging, compute new normalized position (clamped 0-1)
//         and call onDragJoint — parent calls setEditingPose with function updater
//       - onPointerUp: release pointer capture
//
//  WHY USE onDragJoint INSTEAD OF MANUAL REF DRAWING:
//    Canvas calls onDragJoint on every pointer move during drag. The parent
//    calls setEditingPose with function-updater form (prev => ...) so React
//    processes the update on the next render, not synchronously. The overhead
//    is ~0.05ms per call — imperceptible even at 60fps pointer moves.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef } from 'react'
import type { SavedPose } from '../utils/adminExerciseConfig'
import { scalePoseToCanvas, hitTestJoint } from '../utils/poseMatching'

// ── PROPS ──────────────────────────────────────────────────────────────────────
interface PoseEditorProps {
  editingPose: SavedPose         // The pose currently being edited
  poseNameInput: string          // Text in the name input field
  onNameChange: (name: string) => void
  onNewPose: (name: string) => void          // Creates fresh default pose, sets as editing
  onSavePose: (pose: SavedPose) => void      // Persists to admin config (localStorage)
  onRevertPose: () => void                   // Reloads saved version from admin config
  onDragJoint: (jointName: string, nx: number, ny: number) => void
  // onDragJoint is called on every pointer move during drag.
  // Parent implements as: setEditingPose(prev => updateJoint(prev, name, nx, ny))
}

// ── CANVAS DIMENSIONS ──────────────────────────────────────────────────────────
// Fixed size to match CSS styling. These are the *canvas element* dimensions,
// not CSS display size. The CSS aspect-ratio 380/360 matches this.
const EDITOR_W = 380
const EDITOR_H = 360

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function PoseEditor({
  editingPose,
  poseNameInput,
  onNameChange,
  onNewPose,
  onSavePose,
  onRevertPose,
  onDragJoint,
}: PoseEditorProps) {
  const editorCanvasRef = useRef<HTMLCanvasElement>(null)

  // ── Ref for tracking drag state ──
  // We use ref (not state) because pointer events fire at high frequency
  // and we don't need React re-renders to manage drag state — just the
  // pointer capture reference.
  const dragRef = useRef<{ jointName: string | null; dragging: boolean }>({
    jointName: null,
    dragging: false,
  })

  // ── DRAW THE SKELETON ──────────────────────────────────────────────────────
  // Redraws whenever editingPose changes (i.e. after each onDragJoint update).
  useEffect(() => {
    const canvas = editorCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Size the canvas element to match CSS display dimensions
    canvas.width = EDITOR_W
    canvas.height = EDITOR_H

    // Clear and fill with dark background
    ctx.clearRect(0, 0, EDITOR_W, EDITOR_H)
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, EDITOR_W, EDITOR_H)

    // Scale joints from normalized (0-1) to pixel coordinates
    const scaled = scalePoseToCanvas(editingPose, EDITOR_W, EDITOR_H)
    const kpMap = new Map(scaled.map(j => [j.name, j]))

    // ── Skeleton edges (same MoveNet connectivity) ──
    // These define which joints connect to form bones.
    const edges: [string, string][] = [
      ['left_ear', 'left_eye'], ['right_ear', 'right_eye'],
      ['left_eye', 'nose'], ['right_eye', 'nose'],
      ['nose', 'left_shoulder'], ['nose', 'right_shoulder'],
      ['left_shoulder', 'right_shoulder'],
      ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
      ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
      ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
      ['left_hip', 'right_hip'],
      ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
      ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
    ]

    // Draw green bones
    ctx.strokeStyle = '#00ff88'
    ctx.lineWidth = 2
    for (const [a, b] of edges) {
      const p1 = kpMap.get(a)
      const p2 = kpMap.get(b)
      if (p1 && p2) {
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      }
    }

    // Draw green joint dots (clickable/draggable)
    for (const j of scaled) {
      ctx.beginPath()
      ctx.arc(j.x, j.y, 6, 0, 2 * Math.PI)
      ctx.fillStyle = '#00ff88'
      ctx.fill()
      ctx.strokeStyle = '#007744'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }, [editingPose])

  return (
    <section>
      <h4>Pose Builder</h4>

      {/* ── Pose name input + action buttons ── */}
      <div className="pose-editor-controls">
        <input
          className="pose-name-input"
          value={poseNameInput}
          placeholder="Pose name"
          onChange={e => onNameChange(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <button className="btn-small" onClick={() => onNewPose(poseNameInput)}>
            New Pose
          </button>
          <button className="btn-small" onClick={() => onSavePose(editingPose)}>
            Save
          </button>
          <button className="btn-small" onClick={onRevertPose}>
            Revert
          </button>
        </div>
      </div>

      {/* ── Draggable skeleton canvas ──
           Pointer events handle joint dragging:
           1. onPointerDown: hit-test which joint was clicked
           2. onPointerMove: if dragging, compute normalized position and call onDragJoint
           3. onPointerUp: release the drag (pointer capture) */}
      <canvas
        ref={editorCanvasRef}
        className="editor-canvas"
        onPointerDown={e => {
          const canvas = editorCanvasRef.current!
          const rect = canvas.getBoundingClientRect()
          // Convert screen coordinates to canvas-element coordinates
          const px = (e.clientX - rect.left) * (EDITOR_W / rect.width)
          const py = (e.clientY - rect.top) * (EDITOR_H / rect.height)
          const hit = hitTestJoint(editingPose, px, py, EDITOR_W, EDITOR_H)
          if (hit) {
            dragRef.current = { jointName: hit.name, dragging: true }
            canvas.setPointerCapture(e.pointerId)
          }
        }}
        onPointerMove={e => {
          if (!dragRef.current.dragging || !dragRef.current.jointName) return
          const canvas = editorCanvasRef.current!
          const rect = canvas.getBoundingClientRect()
          // Convert screen coords to canvas coords, then normalize (0-1)
          const px = (e.clientX - rect.left) * (EDITOR_W / rect.width)
          const py = (e.clientY - rect.top) * (EDITOR_H / rect.height)
          // Clamp to 0-1 so joints can't go off-canvas accidentally
          const nx = Math.max(0, Math.min(1, px / EDITOR_W))
          const ny = Math.max(0, Math.min(1, py / EDITOR_H))
          // Parent calls setEditingPose(prev => updateJoint(prev, name, nx, ny))
          // which uses the function-updater form — React batches these into
          // a single render instead of re-rendering on every pointer move.
          onDragJoint(dragRef.current.jointName, nx, ny)
        }}
        onPointerUp={e => {
          if (dragRef.current.dragging) {
            dragRef.current = { jointName: null, dragging: false }
            editorCanvasRef.current!.releasePointerCapture(e.pointerId)
          }
        }}
      />
    </section>
  )
}
