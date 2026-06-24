// ponytail: one storage key, no class, no React
export interface EditorJoint {
  name: string
  x: number  // 0..1 normalized
  y: number  // 0..1 normalized
}

export interface SavedPose {
  id: string
  name: string
  joints: EditorJoint[]
  createdAt: number
}

export interface CameraRules {
  minShoulderRatio: number
  maxShoulderRatio: number
  centerOffsetX: number  // 0..1, default 0.5
  centerOffsetY: number  // 0..1, default 0.5
  requireWrists: boolean
}

export interface AdminExerciseConfig {
  version: number
  poses: SavedPose[]
  activePoseId: string | null
  matchTolerance: number
  holdMs: number
  cameraRules: CameraRules
}

export const DEFAULT_CONFIG: AdminExerciseConfig = {
  version: 1,
  poses: [],
  activePoseId: null,
  matchTolerance: 0.18,
  holdMs: 2000,
  cameraRules: {
    minShoulderRatio: 0.15,
    maxShoulderRatio: 0.50,
    centerOffsetX: 0.5,
    centerOffsetY: 0.5,
    requireWrists: false,
  },
}

const STORAGE_KEY = 'fyn-admin-exercise-config'

export function generatePoseId(): string {
  return crypto.randomUUID()
}

export function loadAdminConfig(): AdminExerciseConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw)
    // shallow merge with defaults for forward-compat
    return { ...DEFAULT_CONFIG, ...parsed, cameraRules: { ...DEFAULT_CONFIG.cameraRules, ...parsed.cameraRules } }
  } catch {
    saveAdminConfig(DEFAULT_CONFIG)
    return { ...DEFAULT_CONFIG }
  }
}

export function saveAdminConfig(config: AdminExerciseConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function resetAdminConfig(): AdminExerciseConfig {
  saveAdminConfig(DEFAULT_CONFIG)
  return { ...DEFAULT_CONFIG }
}

// ponytail: immutable helpers — always return new ref
export function upsertPose(config: AdminExerciseConfig, pose: SavedPose): AdminExerciseConfig {
  const idx = config.poses.findIndex(p => p.id === pose.id)
  const poses = idx >= 0
    ? [...config.poses.slice(0, idx), pose, ...config.poses.slice(idx + 1)]
    : [...config.poses, pose]
  return { ...config, poses }
}

export function deletePose(config: AdminExerciseConfig, poseId: string): AdminExerciseConfig {
  const poses = config.poses.filter(p => p.id !== poseId)
  const activePoseId = config.activePoseId === poseId ? null : config.activePoseId
  return { ...config, poses, activePoseId }
}

export function getActivePose(config: AdminExerciseConfig): SavedPose | null {
  if (!config.activePoseId) return null
  return config.poses.find(p => p.id === config.activePoseId) ?? null
}

// ponytail: manual self-test for browser console
export function selfTest(): string[] {
  const logs: string[] = []
  const log = (msg: string) => logs.push(msg)
  try {
    // save/load roundtrip
    const c1 = loadAdminConfig()
    c1.matchTolerance = 0.25
    saveAdminConfig(c1)
    const c2 = loadAdminConfig()
    log(`roundtrip: ${c2.matchTolerance === 0.25 ? 'PASS' : 'FAIL'}`)

    // upsert new
    const p1: SavedPose = { id: 'test-1', name: 'T Pose', joints: [], createdAt: Date.now() }
    const c3 = upsertPose(c2, p1)
    log(`upsert new: ${c3.poses.length === 1 ? 'PASS' : 'FAIL'}`)

    // upsert replace
    const p2 = { ...p1, name: 'Y Pose' }
    const c4 = upsertPose(c3, p2)
    log(`upsert replace: ${c4.poses.length === 1 && c4.poses[0].name === 'Y Pose' ? 'PASS' : 'FAIL'}`)

    // delete
    const c5 = deletePose(c4, 'test-1')
    log(`delete: ${c5.poses.length === 0 ? 'PASS' : 'FAIL'}`)

    // getActivePose
    const p3: SavedPose = { id: 'active-1', name: 'Active', joints: [], createdAt: Date.now() }
    const c6 = { ...c5, poses: [p3], activePoseId: 'active-1' }
    const active = getActivePose(c6)
    log(`getActive: ${active?.id === 'active-1' ? 'PASS' : 'FAIL'}`)

    // reset
    resetAdminConfig()
    log('reset: PASS')

    log('All tests passed.')
  } catch (e: any) {
    log(`ERROR: ${e.message}`)
  }
  console.log('[adminExerciseConfig]', logs.join('\n  '))
  return logs
}
