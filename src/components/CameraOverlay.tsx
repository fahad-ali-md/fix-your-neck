// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CameraOverlay — Webcam + Skeleton Drawing Canvas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    Renders the webcam <video> element and a <canvas> overlay on top.
//    The canvas draws:
//      1. A GREEN skeleton (bones + joint dots) from MoveNet pose data
//      2. A BLUE face mesh wireframe from MediaPipe FaceMesh (when debug is ON)
//
//  WHERE THE DATA COMES FROM:
//    - videoRef: the <video> element (created by usePoseDetection hook)
//    - poses: array of detected pose keypoints from MoveNet
//    - face: face mesh landmarks from MediaPipe FaceMesh
//    - showDebug: whether to draw the face wireframe
//    - state: exercise state (used for the zoom effect on eye-close phase)
//
//  HOW THE CANVAS WORKS:
//    The video element uses object-fit: contain, which may add letterboxing
//    (black bars). The canvas MUST be sized to exactly match the rendered
//    video area, not the CSS box, otherwise skeleton coordinates drift.
//    This is handled by the letterbox math (lines 61-74).
//
//  DATA FLOW:
//    usePoseDetection hook → poses (every frame via requestAnimationFrame)
//    → App.tsx passes poses to CameraOverlay → useEffect redraws canvas
//    → user sees skeleton overlaid on their video
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef } from 'react'
import type { PoseData, FaceData } from '../hooks/usePoseDetection'
import type { ExerciseState } from '../utils/exerciseLogic'
import { SKELETON_EDGES, FACE_CONTOURS } from '../constants'
import { LEFT_EYE_EAR, RIGHT_EYE_EAR } from '../utils/exerciseLogic'
import DebugPanel from './DebugPanel'
import type { DebugData } from './DebugPanel'

// ── PROPS ──────────────────────────────────────────────────────────────────────
interface CameraOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  poses: PoseData[]           // Array of detected poses (usually 1 person)
  face: FaceData | null       // Face mesh keypoints (null if not loaded/disabled)
  showDebug: boolean          // Whether debug panel + face wireframe are shown
  state: ExerciseState        // Used for zoom animation during eye-close phase
  isModelLoaded: boolean      // Has the AI model finished loading?
  error: string | null        // Camera or model error message (null if OK)
  started: boolean            // Has the exercise started? (affects loading text)
  debugRef: { current: DebugData }  // Ref with live AI metrics (no re-render)
  readinessMessage: string | null
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function CameraOverlay({
  videoRef,
  poses,
  face,
  showDebug,
  state,
  isModelLoaded,
  error,
  started,
  debugRef,
  readinessMessage,
}: CameraOverlayProps) {
  // ── Canvas ref ── this canvas is drawn on by the useEffect below
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // ── DRAW SKELETON + FACE MESH ──────────────────────────────────────────────
  // This effect runs whenever the pose/face data changes (every frame).
  // It clears the canvas and redraws everything from scratch.
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ── Step 1: Get the video's intrinsic dimensions ──
    // videoWidth/videoHeight are the camera's actual resolution (e.g. 640x480),
    // NOT the CSS display size. We need BOTH for the letterbox math.
    const vw = video.videoWidth || 640
    const vh = video.videoHeight || 480

    // ── Step 2: Letterbox math ─────────────────────────────────────────────
    // The CSS sizes the video to fill its container with object-fit: contain.
    // This means the ACTUAL rendered picture may be smaller than the CSS box
    // (black bars on sides or top/bottom). We must size the canvas to match
    // the rendered picture area exactly so keypoint coordinates line up.
    const containerW = video.clientWidth
    const containerH = video.clientHeight
    const scale = Math.min(containerW / vw, containerH / vh)
    const renderedW = vw * scale
    const renderedH = vh * scale
    const offsetX = (containerW - renderedW) / 2
    const offsetY = (containerH - renderedH) / 2

    // ── Step 3: Size canvas to match rendered video ──
    canvas.width = vw                     // Intrinsic resolution
    canvas.height = vh
    canvas.style.width = renderedW + 'px' // CSS size matches rendered area
    canvas.style.height = renderedH + 'px'
    canvas.style.left = offsetX + 'px'    // Position to cover the rendered area
    canvas.style.top = offsetY + 'px'
    canvas.style.right = 'unset'
    canvas.style.bottom = 'unset'

    // ── Step 4: Clear previous frame ──
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // ═════════════════════════════════════════════════════════════════════
    //  DRAW SKELETON (MoveNet pose keypoints)
    // ═════════════════════════════════════════════════════════════════════
    if (poses.length > 0 && poses[0].keypoints) {
      const kps = poses[0].keypoints

      // ── Draw bones (lines connecting keypoints) ──
      // SKELETON_EDGES defines which keypoint indices connect to form bones.
      // Each edge is drawn as a thick green line.
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 3
      for (const [i, j] of SKELETON_EDGES) {
        const a = kps[i]
        const b = kps[j]
        // Only draw if both keypoints are confident enough (score > 0.2)
        if (a && b && a.score > 0.2 && b.score > 0.2) {
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }

      // ── Draw joints (dots at each keypoint) ──
      // Green dot if confident (>0.5), orange if marginal (>0.3)
      for (const kp of kps) {
        if (kp.score > 0.3) {
          ctx.beginPath()
          ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI)
          ctx.fillStyle = kp.score > 0.5 ? '#00ff88' : '#ffaa00'
          ctx.fill()
        }
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  DRAW FACE MESH (debug mode only)
    // ═════════════════════════════════════════════════════════════════════
    // This draws the 478-point face wireframe as faint blue lines.
    // It also highlights eye landmarks used for EAR (Eye Aspect Ratio)
    // in pink so you can see what the AI is tracking.
    if (showDebug && face && face.keypoints.length > 0) {
      const fkps = face.keypoints

      // Helper: get face landmark position by index (or null if missing)
      const fp = (i: number) =>
        fkps[i] ? { x: fkps[i].x, y: fkps[i].y } : null

      // ── Draw face wireframe ──
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.4)'
      ctx.lineWidth = 1
      for (const [i, j] of FACE_CONTOURS) {
        const a = fp(i)
        const b = fp(j)
        if (a && b) {
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }

      // ── Highlight eye landmarks used for EAR calculation ──
      // These are specific FaceMesh indices whose positions determine
      // whether the eyes are open or closed (Eye Aspect Ratio formula).
      for (let i = 0; i < fkps.length; i++) {
        if (
          (LEFT_EYE_EAR as readonly number[]).includes(i) ||
          (RIGHT_EYE_EAR as readonly number[]).includes(i)
        ) {
          const p = fp(i)
          if (!p) continue
          ctx.beginPath()
          ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI)
          ctx.fillStyle = '#ff3366'
          ctx.fill()
        }
      }
    }
  }, [poses, face, showDebug, videoRef])
  // ── End of draw effect ──
  // Triggers whenever poses, face, showDebug, or the video element changes.
  // This is typically every requestAnimationFrame (60fps) when poses update.

  return (
    <div className="camera-container">
      <div className="zoom-wrapper">
        {/* ── Canvas overlay ── drawn on by the useEffect above */}
        <canvas ref={canvasRef} className="overlay" />

        {/* ── Webcam video ──
             width/height attributes must match what getUserMedia requests
             (640x480) so MediaPipe calculates coordinates based on the
             intrinsic video size, not the CSS display size. */}
        <video
          ref={videoRef as React.Ref<HTMLVideoElement>}
          width={640}
          height={480}
          playsInline
          muted
          className="webcam"
        />
      </div>

      {/* ── Debug panel ── overlay with real-time AI metrics (ref-based, no re-render) */}
      {showDebug && <DebugPanel debugRef={debugRef} state={state} />}

      {readinessMessage && !error && isModelLoaded && (
        <div className="camera-readiness">
          {readinessMessage}
        </div>
      )}

      {/* ── Error message ── shown when camera or model fails */}
      {error && <div className="error-msg">{error}</div>}

      {/* ── Loading overlay ── spinner shown while camera or AI model loads */}
      {!isModelLoaded && !error && (
        <div className="loading">
          <div className="spinner" />
          <p>{started ? 'Loading AI model...' : 'Starting camera...'}</p>
        </div>
      )}
    </div>
  )
}
