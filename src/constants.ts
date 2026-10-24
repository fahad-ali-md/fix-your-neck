// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  What this file does:
//    Holds ALL hard-coded data arrays so they don't clutter App.tsx.
//    These are just static lookup tables — no logic, no React, no state.
//
//  Where this data comes from:
//    - SKELETON_EDGES: MoveNet 17-keypoint skeleton topology (index pairs)
//    - FACE_CONTOURS: MediaPipe FaceMesh 478-point face wireframe topology
//    Both are defined by the respective ML models, not our code.
//
//  How to read:
//    Each [a, b] pair means "draw a line from keypoint[a] to keypoint[b]".
//    The keypoint index → body part mapping is defined by MoveNet:
//      0=nose, 1=left_eye, 2=right_eye, 3=left_ear, 4=right_ear,
//      5=left_shoulder, 6=right_shoulder, 7=left_elbow, 8=right_elbow,
//      9=left_wrist, 10=right_wrist, 11=left_hip, 12=right_hip,
//      13=left_knee, 14=right_knee, 15=left_ankle, 16=right_ankle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** MoveNet skeleton: each pair [i,j] connects keypoint i to keypoint j.
 *  These are the "bones" drawn as green lines on the camera overlay. */
export const SKELETON_EDGES: [number, number][] = [
  // ── Head connections ──
  [0, 1], [0, 2],             // nose → left eye, nose → right eye
  [1, 3], [2, 4],             // left eye → left ear, right eye → right ear
  // ── Shoulders ──
  [0, 5], [0, 6],             // nose → left shoulder, nose → right shoulder
  [5, 6],                      // left shoulder ↔ right shoulder (connects torso top)
  // ── Arms ──
  [5, 7], [7, 9],             // left shoulder → left elbow → left wrist
  [6, 8], [8, 10],            // right shoulder → right elbow → right wrist
  // ── Torso ──
  [5, 11], [6, 12],           // left shoulder → left hip, right shoulder → right hip
  [11, 12],                    // left hip ↔ right hip (connects torso bottom)
  // ── Legs ──
  [11, 13], [13, 15],         // left hip → left knee → left ankle
  [12, 14], [14, 16],         // right hip → right knee → right ankle
]

/** MediaPipe FaceMesh face contour: each pair [i,j] connects landmark i to j.
 *  These draw the face wireframe (eyes, lips, nose, face oval) as blue lines
 *  on the camera overlay when debug mode is ON.
 *
 *  Landmark indices reference the 478-point MediaPipe FaceMesh topology.
 *  Groups: face oval (jawline), left eye, right eye, left eyebrow,
 *  right eyebrow, nose bridge, lips (inner + outer), nostrils. */
export const FACE_CONTOURS: [number, number][] = [
  // ── Left eye region ──
  [61, 146], [146, 91], [91, 181], [181, 84], [84, 17],
  [17, 314], [314, 405], [405, 321], [321, 375], [375, 291],
  // ── Left eye detail ──
  [61, 185], [185, 40], [40, 39], [39, 37], [37, 0],
  [0, 267], [267, 269], [269, 270], [270, 409], [409, 291],
  // ── Right eye region ──
  [78, 95], [95, 88], [88, 178], [178, 87], [87, 14],
  [14, 317], [317, 402], [402, 318], [318, 324], [324, 308],
  // ── Right eye detail ──
  [78, 191], [191, 80], [80, 81], [81, 82], [82, 13],
  [13, 312], [312, 311], [311, 310], [310, 415], [415, 308],
  // ── Left eyebrow ──
  [263, 249], [249, 390], [390, 373], [373, 374], [374, 380],
  [380, 381], [381, 382], [382, 362],
  // ── Left eyebrow detail ──
  [263, 466], [466, 388], [388, 387], [387, 386], [386, 385],
  [385, 384], [384, 398], [398, 362],
  // ── Right eyebrow ──
  [276, 283], [283, 282], [282, 295], [295, 285],
  [300, 293], [293, 334], [334, 296], [296, 336],
  // ── Left eye (inner corner → outer) ──
  [33, 7], [7, 163], [163, 144], [144, 145], [145, 153],
  [153, 154], [154, 155], [155, 133],
  // ── Left eye (inner corner → outer, upper lid) ──
  [33, 246], [246, 161], [161, 160], [160, 159], [159, 158],
  [158, 157], [157, 173], [173, 133],
  // ── Right eye (lower lid) ──
  [46, 53], [53, 52], [52, 65], [65, 55],
  [70, 63], [63, 105], [105, 66], [66, 107],
  // ── Nose bridge (upper) ──
  [10, 338], [338, 297], [297, 332], [332, 284],
  [284, 251], [251, 389], [389, 356], [356, 454],
  // ── Nose bridge (lower) ──
  [454, 323], [323, 361], [361, 288], [288, 397],
  [397, 365], [365, 379], [379, 378], [378, 400],
  // ── Nose bottom + upper lip ──
  [400, 377], [377, 152], [152, 148], [148, 176],
  [176, 149], [149, 150], [150, 136], [136, 172],
  // ── Nostril area ──
  [172, 58], [58, 132], [132, 93], [93, 234],
  [234, 127], [127, 162], [162, 21], [21, 54],
  // ── Upper lip outer ──
  [54, 103], [103, 67], [67, 109], [109, 10],
  // ── Nose bridge center line ──
  [168, 6], [6, 197], [197, 195], [195, 5],
  [5, 4], [4, 1], [1, 19], [19, 94], [94, 2],
]
