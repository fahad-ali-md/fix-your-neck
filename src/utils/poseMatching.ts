import type { SavedPose, EditorJoint } from './adminExerciseConfig'
import { generatePoseId } from './adminExerciseConfig'

// ponytail: joints we compare for matching — upper body is enough
export const REQUIRED_MATCH_JOINS = [
  'nose', 'left_shoulder', 'right_shoulder', 'left_ear', 'right_ear',
  'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
]

export function defaultEditablePose(name = 'New Pose'): SavedPose {
  return {
    id: generatePoseId(),
    name,
    joints: [
      { name: 'nose', x: 0.5, y: 0.10 },
      { name: 'left_eye', x: 0.46, y: 0.08 },
      { name: 'right_eye', x: 0.54, y: 0.08 },
      { name: 'left_ear', x: 0.42, y: 0.10 },
      { name: 'right_ear', x: 0.58, y: 0.10 },
      { name: 'left_shoulder', x: 0.35, y: 0.22 },
      { name: 'right_shoulder', x: 0.65, y: 0.22 },
      { name: 'left_elbow', x: 0.25, y: 0.38 },
      { name: 'right_elbow', x: 0.75, y: 0.38 },
      { name: 'left_wrist', x: 0.20, y: 0.52 },
      { name: 'right_wrist', x: 0.80, y: 0.52 },
      { name: 'left_hip', x: 0.40, y: 0.52 },
      { name: 'right_hip', x: 0.60, y: 0.52 },
      { name: 'left_knee', x: 0.40, y: 0.72 },
      { name: 'right_knee', x: 0.60, y: 0.72 },
      { name: 'left_ankle', x: 0.40, y: 0.92 },
      { name: 'right_ankle', x: 0.60, y: 0.92 },
    ],
    createdAt: Date.now(),
  }
}

export function normalizeLivePose(
  keypoints: Array<{ x: number; y: number; score: number; name: string }>,
  minScore = 0.2,
): EditorJoint[] {
  const valid = keypoints.filter(k => k.score >= minScore)
  if (valid.length === 0) return []

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const k of valid) {
    if (k.x < minX) minX = k.x
    if (k.y < minY) minY = k.y
    if (k.x > maxX) maxX = k.x
    if (k.y > maxY) maxY = k.y
  }

  const w = Math.max(maxX - minX, 1)
  const h = Math.max(maxY - minY, 1)

  return valid.map(k => ({
    name: k.name,
    x: (k.x - minX) / w,
    y: (k.y - minY) / h,
  }))
}

export function compareSavedPoseToLive(
  savedPose: SavedPose,
  keypoints: Array<{ x: number; y: number; score: number; name: string }>,
  tolerance = 0.18,
): { matched: boolean; score: number; missingJoints: string[] } {
  const liveJoints = normalizeLivePose(keypoints)
  const liveMap = new Map(liveJoints.map(j => [j.name, j]))
  const savedMap = new Map(savedPose.joints.map(j => [j.name, j]))

  const common: string[] = []
  const missingJoints: string[] = []
  for (const saved of savedPose.joints) {
    if (liveMap.has(saved.name)) common.push(saved.name)
    else missingJoints.push(saved.name)
  }

  if (common.length < 5) return { matched: false, score: Infinity, missingJoints }

  let sumSq = 0
  for (const name of common) {
    const s = savedMap.get(name)!
    const l = liveMap.get(name)!
    const dx = s.x - l.x
    const dy = s.y - l.y
    sumSq += dx * dx + dy * dy
  }

  const avgDist = Math.sqrt(sumSq / common.length)
  return { matched: avgDist <= tolerance, score: avgDist, missingJoints }
}

export function scalePoseToCanvas(
  pose: SavedPose,
  width: number,
  height: number,
): { name: string; x: number; y: number }[] {
  return pose.joints.map(j => ({ name: j.name, x: j.x * width, y: j.y * height }))
}

export function hitTestJoint(
  pose: SavedPose,
  px: number,
  py: number,
  width: number,
  height: number,
  radius = 15,
): EditorJoint | null {
  let closest: EditorJoint | null = null
  let closestDist = radius
  for (const j of pose.joints) {
    const jx = j.x * width
    const jy = j.y * height
    const d = Math.hypot(px - jx, py - jy)
    if (d <= closestDist) {
      closestDist = d
      closest = j
    }
  }
  return closest
}

export function updateJoint(
  pose: SavedPose,
  jointName: string,
  normalizedX: number,
  normalizedY: number,
): SavedPose {
  return {
    ...pose,
    joints: pose.joints.map(j =>
      j.name === jointName ? { ...j, x: normalizedX, y: normalizedY } : j,
    ),
  }
}

// ponytail: manual self-test for browser console
export function selfTest(): string[] {
  const logs: string[] = []
  const log = (msg: string) => logs.push(msg)
  try {
    const pose = defaultEditablePose('Test')
    log(`default pose: ${pose.joints.length} joints — ${pose.joints.length === 17 ? 'PASS' : 'FAIL'}`)

    // simulate live keypoints at same positions
    const liveKps = pose.joints.map(j => ({ name: j.name, x: j.x * 640, y: j.y * 480, score: 0.9 }))
    const result = compareSavedPoseToLive(pose, liveKps, 0.18)
    log(`match same pose: ${result.matched ? 'PASS' : 'FAIL'} (score: ${result.score.toFixed(3)})`)

    // shift right wrist far away
    const offKps = liveKps.map(k =>
      k.name === 'right_wrist' ? { ...k, x: k.x + 300, y: k.y + 200 } : k,
    )
    const result2 = compareSavedPoseToLive(pose, offKps, 0.18)
    log(`mismatch shifted wrist: ${!result2.matched ? 'PASS' : 'FAIL'} (score: ${result2.score.toFixed(3)})`)

    // hit test
    const scaled = scalePoseToCanvas(pose, 640, 480)
    const nosePx = scaled.find(j => j.name === 'nose')!
    const hit = hitTestJoint(pose, nosePx.x, nosePx.y, 640, 480)
    log(`hit test nose: ${hit?.name === 'nose' ? 'PASS' : 'FAIL'}`)

    // update joint
    const updated = updateJoint(pose, 'nose', 0.9, 0.9)
    const updatedNose = updated.joints.find(j => j.name === 'nose')
    log(`update joint: ${updatedNose?.x === 0.9 && updatedNose?.y === 0.9 ? 'PASS' : 'FAIL'}`)

    log('All tests passed.')
  } catch (e: any) {
    log(`ERROR: ${e.message}`)
  }
  console.log('[poseMatching]', logs.join('\n  '))
  return logs
}
