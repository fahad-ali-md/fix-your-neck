import { useEffect, useRef, useState, useCallback } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as poseDetection from '@tensorflow-models/pose-detection'
import * as faceLandmarks from '@tensorflow-models/face-landmarks-detection'

export interface PoseData {
  keypoints: Array<{ x: number; y: number; score: number; name: string }>
}

export interface FaceData {
  keypoints: Array<{ x: number; y: number; z: number }>
}

export function usePoseDetection() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [poses, setPoses] = useState<PoseData[]>([])
  const [face, setFace] = useState<FaceData | null>(null)
  const [isModelLoaded, setIsModelLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null)
  const faceDetectorRef = useRef<faceLandmarks.FaceLandmarksDetector | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef<number>(0)

  const startCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    })
    streamRef.current = stream
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try { await startCamera() }
      catch (e: any) {
        if (cancelled) return
        if (e?.name === 'NotAllowedError')
          setError('Camera blocked — click the lock icon in your URL bar to allow camera, then refresh.')
        else if (e?.name === 'NotFoundError')
          setError('No camera found.')
        else
          setError(`Camera error: ${e?.message || 'unknown'}`)
        return
      }

      try { await tf.ready() }
      catch (e: any) {
        if (!cancelled) setError(`TF backend init failed: ${e?.message}`)
        return
      }

      try {
        const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet)
        if (cancelled) { detector.dispose(); return }
        detectorRef.current = detector
        setIsModelLoaded(true)
      } catch (e: any) {
        if (!cancelled) setError(`Model error: ${e?.message || e}. Check internet and refresh.`)
        return
      }

      const detect = async () => {
        if (!detectorRef.current || !videoRef.current || cancelled) return
        const [posesResult] = await Promise.all([
          detectorRef.current.estimatePoses(videoRef.current),
        ])
        if (!cancelled) {
          setPoses(posesResult as unknown as PoseData[])
        }
        animRef.current = requestAnimationFrame(detect)
      }
      animRef.current = requestAnimationFrame(detect)
    }
    init()

    return () => {
      cancelled = true
      cancelAnimationFrame(animRef.current)
      detectorRef.current?.dispose()
      faceDetectorRef.current?.dispose()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [startCamera])

  // pony: load face detector on demand, cache it
  const getFaceDetector = useCallback(async () => {
    if (faceDetectorRef.current) return faceDetectorRef.current
    if (!videoRef.current) return null
    const detector = await faceLandmarks.createDetector(
      faceLandmarks.SupportedModels.MediaPipeFaceMesh,
      { runtime: 'mediapipe', refineLandmarks: false, solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh' }
    )
    faceDetectorRef.current = detector
    return detector
  }, [])

  const detectFace = useCallback(async () => {
    if (!videoRef.current) return null
    const detector = await getFaceDetector()
    if (!detector) return null
    const faces = await detector.estimateFaces(videoRef.current)
    if (faces.length > 0) {
      const f = { keypoints: faces[0].keypoints as Array<{ x: number; y: number; z: number }> }
      setFace(f)
      return f
    }
    return null
  }, [getFaceDetector])

  return { videoRef, poses, face, isModelLoaded, error, detectFace }
}
