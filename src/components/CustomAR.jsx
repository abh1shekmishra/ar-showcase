import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import './CustomAR.css';

const ENABLE_PLANE_VISUALIZATION = false;

const classifySurface = (quaternion, upVector) => {
  const up = upVector.set(0, 1, 0).applyQuaternion(quaternion);
  if (up.y > 0.7) return 'floor';
  if (up.y < -0.7) return 'ceiling';
  return 'wall';
};

const pointInPolygonXZ = (polygon, x, z) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const denom = Math.abs(zj - zi) < 1e-6 ? 1e-6 : (zj - zi);
    const intersects = ((zi > z) !== (zj > z)) && (x < (((xj - xi) * (z - zi)) / denom) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
};

const CustomAR = ({ modelSrc, modelCategory, onClose }) => {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);

  // ── Core refs ──
  const phaseRef = useRef('loading');
  const modelGroupRef = useRef(null);
  const reticleRef = useRef(null);
  const hitTestSourceRef = useRef(null);
  const sessionRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const localSpaceRef = useRef(null);
  const shadowPlaneRef = useRef(null);
  const dirLightRef = useRef(null);
  const ambientRef = useRef(null);
  const cancelledRef = useRef(false);
  const anchorRef = useRef(null);
  const anchorRefreshPendingRef = useRef(false);
  const anchorCreatePendingRef = useRef(false);
  const anchorRevisionRef = useRef(0);

  // Transform refs (updated by touch gestures + render loop reads these)
  const scaleRef = useRef(1);
  const rotationRef = useRef(0);
  const heightRef = useRef(0);
  const placedPosRef = useRef(new THREE.Vector3());
  const placementQuatRef = useRef(new THREE.Quaternion());

  // Reticle smoothing
  const reticlePosSmoothed = useRef(new THREE.Vector3());
  const reticleQuatSmoothed = useRef(new THREE.Quaternion());
  const reticleHasFirstPose = useRef(false);
  const lastFrameTime = useRef(0);

  // Outlier rejection buffer size
  const HIT_BUFFER_SIZE = 5;

  // Tracking
  const lastHitTime = useRef(0);
  const consecutiveHits = useRef(0);

  // Touch gesture tracking
  const touchStartDist = useRef(0);
  const touchStartAngle = useRef(0);
  const touchStartScale = useRef(1);
  const touchStartRot = useRef(0);
  const singleTouchStartX = useRef(0);
  const singleTouchStartY = useRef(0);
  const isDraggingModel = useRef(false);
  const activeTouches = useRef(0);
  const touchCaptureRef = useRef(null);

  // Throttle UI updates
  const lastUIUpdate = useRef(0);
  const surfaceInfoRef = useRef('');

  // Pre-allocated reusable objects (avoid GC pressure in render loop)
  const _tmpMat4 = useRef(new THREE.Matrix4());
  const _tmpPos = useRef(new THREE.Vector3());
  const _tmpQuat = useRef(new THREE.Quaternion());
  const _tmpScale = useRef(new THREE.Vector3());
  const _tmpUp = useRef(new THREE.Vector3());
  const _tmpSurfaceNormal = useRef(new THREE.Vector3());
  const _tmpUserRotationQuat = useRef(new THREE.Quaternion());
  const _rayOrigin = useRef(new THREE.Vector3());
  const _rayDirection = useRef(new THREE.Vector3());
  const _planeOrigin = useRef(new THREE.Vector3());
  const _planeQuaternion = useRef(new THREE.Quaternion());
  const _planeDelta = useRef(new THREE.Vector3());
  const _planeIntersection = useRef(new THREE.Vector3());
  const _planeLocalPoint = useRef(new THREE.Vector3());
  const _planeLocalInverse = useRef(new THREE.Quaternion());

  // Pre-allocated hit buffer entries (avoid per-frame cloning)
  const _hitBufPos = useRef(Array.from({ length: 5 }, () => new THREE.Vector3()));
  const _hitBufQuat = useRef(Array.from({ length: 5 }, () => new THREE.Quaternion()));
  const _hitBufIdx = useRef(0);
  const _hitBufCount = useRef(0);
  const _filteredPos = useRef(new THREE.Vector3());
  // Pre-allocated sort buffers (avoid Array.slice().sort() per frame)
  const _sortBufX = useRef(new Float64Array(5));
  const _sortBufY = useRef(new Float64Array(5));
  const _sortBufZ = useRef(new Float64Array(5));

  // Cached reticle child refs (avoid getObjectByName per frame)
  const _scanArcRef = useRef(null);
  const _glowRef = useRef(null);
  const _diamondRef = useRef(null);

  // Pre-allocated drag vectors
  const _dragRight = useRef(new THREE.Vector3());
  const _dragForward = useRef(new THREE.Vector3());

  // Plane viz optimization: skip iteration once all planes are hidden in placed mode
  const _planesAllHidden = useRef(false);

  // Frame counter for throttling expensive XR API calls
  const _frameCounter = useRef(0);
  // Cached filtered quaternion for reticle (persists between hit-test frames)
  const _filteredQuat = useRef(new THREE.Quaternion());
  // Direct DOM ref for surface info text (bypasses React re-renders)
  const surfaceTextRef = useRef(null);

  // Transient (touch) hit-test
  const transientHitSourceRef = useRef(null);
  const lastSurfaceTypeRef = useRef('floor'); // floor | wall | ceiling

  // Plane visualization (ARCore-style grid overlay)
  const planeMeshesRef = useRef(new Map()); // XRPlane → THREE.Mesh
  const planeGroupRef = useRef(null);

  // Surface placement mode: floor (scan-based), wall/ceiling (camera-ray based)
  const surfaceModeRef = useRef('floor'); // floor | wall | ceiling
  // Camera pose cached from render loop (for DOM click handler placement)
  const _lastCamOrigin = useRef(new THREE.Vector3());
  const _lastCamDir = useRef(new THREE.Vector3(0, 0, -1));
  const _lastCamPoseValid = useRef(false);
  // Flag: DOM click requests placement in next frame (needs XR frame context)
  const _pendingPlacement = useRef(false);

  // ── UI state (minimal — only for phase transitions + errors) ──
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [gestureHint, setGestureHint] = useState('');
  const [surfaceMode, setSurfaceMode] = useState('floor');

  const isCeiling = modelCategory === 'Ceiling Lamps' || modelCategory === 'Chandeliers';

  const updatePhase = useCallback((p) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const updateSurfaceMode = useCallback((mode) => {
    surfaceModeRef.current = mode;
    setSurfaceMode(mode);
  }, []);

  // Camera-ray placement: place model at a fixed distance along the camera direction
  // Uses cached camera pose from render loop (always up-to-date)
  // Returns { position: Vector3, quaternion: Quaternion } or null
  const computeCameraRayPlacement = useCallback((frame, mode) => {
    if (!_lastCamPoseValid.current || !localSpaceRef.current) return null;

    _rayOrigin.current.copy(_lastCamOrigin.current);
    _rayDirection.current.copy(_lastCamDir.current);

    // Try to snap to a real detected plane first
    const detectedPlanes = frame.detectedPlanes;
    if (detectedPlanes) {
      let bestDist = Infinity;
      let snapped = false;

      for (const plane of detectedPlanes) {
        const isWallMode = mode === 'wall';
        const isCeilingMode = mode === 'ceiling';
        if (isWallMode && plane.orientation !== 'vertical') continue;
        if (isCeilingMode && plane.orientation === 'vertical') continue;

        const polygon = plane.polygon;
        if (!polygon || polygon.length < 3) continue;

        const planePose = frame.getPose(plane.planeSpace, localSpaceRef.current);
        if (!planePose) continue;

        _tmpMat4.current.fromArray(planePose.transform.matrix);
        _tmpMat4.current.decompose(_planeOrigin.current, _planeQuaternion.current, _tmpScale.current);

        // For ceiling mode, check if this plane is actually above the camera
        if (isCeilingMode) {
          const planeUp = _tmpSurfaceNormal.current.set(0, 1, 0).applyQuaternion(_planeQuaternion.current);
          if (planeUp.y > -0.5) continue; // Not a ceiling
        }

        const planeNormal = _tmpSurfaceNormal.current.set(0, 1, 0).applyQuaternion(_planeQuaternion.current).normalize();
        const denom = planeNormal.dot(_rayDirection.current);
        if (Math.abs(denom) < 0.02) continue;

        const dist = planeNormal.dot(_planeDelta.current.copy(_planeOrigin.current).sub(_rayOrigin.current)) / denom;
        if (dist <= 0.1 || dist > 6 || dist >= bestDist) continue;

        const intersection = _planeIntersection.current.copy(_rayDirection.current).multiplyScalar(dist).add(_rayOrigin.current);
        const localPt = _planeLocalPoint.current
          .copy(intersection).sub(_planeOrigin.current)
          .applyQuaternion(_planeLocalInverse.current.copy(_planeQuaternion.current).invert());

        if (!pointInPolygonXZ(polygon, localPt.x, localPt.z)) continue;

        _tmpPos.current.copy(intersection);
        _tmpQuat.current.copy(_planeQuaternion.current);
        bestDist = dist;
        snapped = true;
      }

      if (snapped) {
        return { position: _tmpPos.current, quaternion: _tmpQuat.current };
      }
    }

    // No real plane found — use synthetic placement
    if (mode === 'wall') {
      // Place 1.5m along camera ray, oriented facing the user
      const placeDist = 1.5;
      _tmpPos.current.copy(_rayDirection.current).multiplyScalar(placeDist).add(_rayOrigin.current);

      // Wall quaternion: normal facing toward camera (back against wall)
      // The wall plane's "up" should be world up, normal = -cameraDirection projected to XZ
      const wallNormal = _tmpSurfaceNormal.current.set(-_rayDirection.current.x, 0, -_rayDirection.current.z).normalize();
      // Build a rotation from Y-up plane to face us: the plane's local Y is world Y, local Z is wallNormal
      const wallRight = _dragRight.current.crossVectors(new THREE.Vector3(0, 1, 0), wallNormal).normalize();
      const m = _tmpMat4.current.makeBasis(wallRight, new THREE.Vector3(0, 1, 0), wallNormal);
      _tmpQuat.current.setFromRotationMatrix(m);
      // Convert to surface quaternion convention (Y-up becomes the wall normal)
      // Our classifySurface expects: applying quat to (0,1,0) should give the surface normal
      // For a wall, the surface normal is the wallNormal (horizontal)
      _tmpQuat.current.setFromUnitVectors(new THREE.Vector3(0, 1, 0), wallNormal);

      return { position: _tmpPos.current, quaternion: _tmpQuat.current };
    }

    if (mode === 'ceiling') {
      // Place 2.5m above camera position
      const ceilingHeight = 2.5;
      _tmpPos.current.set(_rayOrigin.current.x, _rayOrigin.current.y + ceilingHeight, _rayOrigin.current.z);
      // Ceiling quaternion: surface normal points down → applying quat to (0,1,0) should give (0,-1,0)
      _tmpQuat.current.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));

      return { position: _tmpPos.current, quaternion: _tmpQuat.current };
    }

    return null;
  }, []);

  const primeReticlePose = useCallback((position, quaternion, now = performance.now()) => {
    _filteredPos.current.copy(position);
    _filteredQuat.current.copy(quaternion);
    reticlePosSmoothed.current.copy(position);
    reticleQuatSmoothed.current.copy(quaternion);
    reticleHasFirstPose.current = true;
    lastHitTime.current = now;
    consecutiveHits.current = Math.max(consecutiveHits.current, 1);
    lastSurfaceTypeRef.current = classifySurface(quaternion, _tmpUp.current);
  }, []);

  const resolveVerticalPlaneFallbackPose = useCallback((frame, camera) => {
    const detectedPlanes = frame.detectedPlanes;
    const localSpace = localSpaceRef.current;
    if (!detectedPlanes || !localSpace || !camera) return false;

    camera.getWorldPosition(_rayOrigin.current);
    camera.getWorldDirection(_rayDirection.current).normalize();

    let found = false;
    let bestDistance = Infinity;

    for (const plane of detectedPlanes) {
      if (plane.orientation !== 'vertical') continue;
      const polygon = plane.polygon;
      if (!polygon || polygon.length < 3) continue;

      const planePose = frame.getPose(plane.planeSpace, localSpace);
      if (!planePose) continue;

      _tmpMat4.current.fromArray(planePose.transform.matrix);
      _tmpMat4.current.decompose(_planeOrigin.current, _planeQuaternion.current, _tmpScale.current);

      const planeNormal = _tmpSurfaceNormal.current.set(0, 1, 0).applyQuaternion(_planeQuaternion.current).normalize();
      const denom = planeNormal.dot(_rayDirection.current);
      if (Math.abs(denom) < 0.05) continue;

      const distance = planeNormal.dot(_planeDelta.current.copy(_planeOrigin.current).sub(_rayOrigin.current)) / denom;
      if (distance <= 0.05 || distance >= bestDistance) continue;

      const intersection = _planeIntersection.current.copy(_rayDirection.current).multiplyScalar(distance).add(_rayOrigin.current);
      const localPoint = _planeLocalPoint.current
        .copy(intersection)
        .sub(_planeOrigin.current)
        .applyQuaternion(_planeLocalInverse.current.copy(_planeQuaternion.current).invert());

      if (!pointInPolygonXZ(polygon, localPoint.x, localPoint.z)) continue;

      _tmpPos.current.copy(intersection);
      _tmpQuat.current.copy(_planeQuaternion.current);
      bestDistance = distance;
      found = true;
    }

    return found;
  }, []);

  const refreshAnchorAtPlacement = useCallback((xrFrame, localSpace) => {
    anchorRefreshPendingRef.current = false;
    if (!xrFrame?.createAnchor || !localSpace || anchorCreatePendingRef.current) return;

    const previousAnchor = anchorRef.current;
    const revision = anchorRevisionRef.current;
    const position = placedPosRef.current;
    const quaternion = placementQuatRef.current;

    anchorRef.current = null;
    anchorCreatePendingRef.current = true;

    try {
      const pose = new XRRigidTransform(
        { x: position.x, y: position.y, z: position.z, w: 1 },
        { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }
      );

      xrFrame.createAnchor(pose, localSpace).then((nextAnchor) => {
        anchorCreatePendingRef.current = false;
        if (cancelledRef.current || revision !== anchorRevisionRef.current) {
          try { nextAnchor.delete(); } catch {}
          return;
        }
        if (previousAnchor) {
          try { previousAnchor.delete(); } catch {}
        }
        anchorRef.current = nextAnchor;
      }).catch(() => {
        anchorCreatePendingRef.current = false;
      });
    } catch {
      anchorCreatePendingRef.current = false;
    }
  }, []);

  // ══════════════════════════════════════════════════════════════
  // TOUCH GESTURE HANDLERS (pinch-scale, two-finger-rotate, drag-height)
  // ══════════════════════════════════════════════════════════════
  const handleTouchStart = useCallback((e) => {
    if (phaseRef.current !== 'placed') return;
    activeTouches.current = e.touches.length;

    if (e.touches.length === 2) {
      // Pinch + rotate: record initial distance and angle
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      touchStartDist.current = Math.hypot(dx, dy);
      touchStartAngle.current = Math.atan2(dy, dx);
      touchStartScale.current = scaleRef.current;
      touchStartRot.current = rotationRef.current;
      isDraggingModel.current = false;
    } else if (e.touches.length === 1) {
      // Single finger: drag to reposition model in space
      singleTouchStartX.current = e.touches[0].clientX;
      singleTouchStartY.current = e.touches[0].clientY;
      isDraggingModel.current = true;
      anchorRevisionRef.current += 1;
      anchorRefreshPendingRef.current = false;
      if (anchorRef.current) {
        try { anchorRef.current.delete(); } catch {}
        anchorRef.current = null;
      }
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (phaseRef.current !== 'placed') return;

    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      // Pinch → scale
      if (touchStartDist.current > 0) {
        const ratio = dist / touchStartDist.current;
        scaleRef.current = Math.max(0.1, Math.min(5, touchStartScale.current * ratio));
      }

      // Two-finger twist → rotation
      const angleDelta = (angle - touchStartAngle.current) * (180 / Math.PI);
      rotationRef.current = touchStartRot.current + angleDelta;
    } else if (e.touches.length === 1 && activeTouches.current === 1 && isDraggingModel.current) {
      // Fallback drag when transient hit-test drag is unavailable on the device
      if (transientHitSourceRef.current) return;

      // Single finger drag → move model in camera-relative XZ plane
      const deltaX = e.touches[0].clientX - singleTouchStartX.current;
      const deltaY = e.touches[0].clientY - singleTouchStartY.current;
      singleTouchStartX.current = e.touches[0].clientX;
      singleTouchStartY.current = e.touches[0].clientY;

      // Convert screen-space pixels to world-space movement
      // Use camera orientation to determine movement direction
      const cam = cameraRef.current;
      if (cam) {
        // Scale speed with distance from camera to model (farther = faster drag)
        const dx2 = cam.position.x - placedPosRef.current.x;
        const dz2 = cam.position.z - placedPosRef.current.z;
        const dist = Math.sqrt(dx2 * dx2 + dz2 * dz2);
        const speed = Math.max(0.003, dist * 0.004); // scales with distance

        const right = _dragRight.current;
        const forward = _dragForward.current;
        cam.getWorldDirection(forward);
        right.crossVectors(forward, cam.up).normalize();
        forward.y = 0;
        forward.normalize();

        placedPosRef.current.x += right.x * deltaX * speed + forward.x * deltaY * speed;
        placedPosRef.current.z += right.z * deltaX * speed + forward.z * deltaY * speed;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    activeTouches.current = e.touches.length;
    if (e.touches.length === 0) {
      isDraggingModel.current = false;
      anchorRefreshPendingRef.current = true;
    }
  }, []);

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: Mount — set up Three.js + load model (no XR yet)
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    cancelledRef.current = false;

    const setup = async () => {
      if (!navigator.xr) {
        setError('WebXR is not available. Use Chrome 79+ on Android.');
        return;
      }
      try {
        const ok = await navigator.xr.isSessionSupported('immersive-ar');
        if (!ok) { setError('AR not supported. Use Chrome on Android.'); return; }
      } catch {
        setError('Could not check AR support.'); return;
      }

      try {
        // Renderer
        const renderer = new THREE.WebGLRenderer({
          alpha: true, antialias: false, powerPreference: 'high-performance',
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        sceneRef.current = scene;
        const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40);
        cameraRef.current = camera;

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambient);
        ambientRef.current = ambient;

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(1, 4, 2);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(1024, 1024);
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 15;
        dirLight.shadow.camera.left = -3;
        dirLight.shadow.camera.right = 3;
        dirLight.shadow.camera.top = 3;
        dirLight.shadow.camera.bottom = -3;
        dirLight.shadow.bias = -0.0005;
        dirLight.shadow.normalBias = 0.02;
        scene.add(dirLight);
        dirLightRef.current = dirLight;

        // Shadow plane
        const shadowPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(20, 20),
          new THREE.ShadowMaterial({ opacity: 0.35 })
        );
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.receiveShadow = true;
        shadowPlane.visible = false;
        scene.add(shadowPlane);
        shadowPlaneRef.current = shadowPlane;

        // Reticle — sleek diamond + glow indicator
        const reticle = new THREE.Group();

        // Outer diamond shape (rotated square)
        const diamondShape = new THREE.Shape();
        const ds = 0.12;
        diamondShape.moveTo(0, ds);
        diamondShape.lineTo(ds, 0);
        diamondShape.lineTo(0, -ds);
        diamondShape.lineTo(-ds, 0);
        diamondShape.closePath();
        // Inner hole
        const hole = new THREE.Path();
        const hs = 0.095;
        hole.moveTo(0, hs);
        hole.lineTo(hs, 0);
        hole.lineTo(0, -hs);
        hole.lineTo(-hs, 0);
        hole.closePath();
        diamondShape.holes.push(hole);

        const diamondGeo = new THREE.ShapeGeometry(diamondShape);
        const diamond = new THREE.Mesh(diamondGeo, new THREE.MeshBasicMaterial({
          color: 0x00e676, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
        }));
        diamond.rotation.x = -Math.PI / 2;
        diamond.name = 'diamond';
        reticle.add(diamond);

        // Soft glow circle behind diamond
        const glowGeo = new THREE.CircleGeometry(0.18, 32);
        const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
          color: 0x00e676, side: THREE.DoubleSide, transparent: true, opacity: 0.08,
        }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = -0.001;
        glow.name = 'glow';
        reticle.add(glow);

        // Center dot
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(0.012, 16),
          new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        );
        dot.rotation.x = -Math.PI / 2;
        dot.position.y = 0.001;
        reticle.add(dot);

        // Outer spinning arc
        const arcGeo = new THREE.RingGeometry(0.2, 0.21, 32, 1, 0, Math.PI * 0.5);
        const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({
          color: 0x00e676, side: THREE.DoubleSide, transparent: true, opacity: 0.4,
        }));
        arc.rotation.x = -Math.PI / 2;
        arc.name = 'scanArc';
        reticle.add(arc);

        reticle.visible = false;
        scene.add(reticle);
        reticleRef.current = reticle;

        // Cache child references for render loop (avoid getObjectByName)
        _scanArcRef.current = reticle.getObjectByName('scanArc');
        _glowRef.current = reticle.getObjectByName('glow');
        _diamondRef.current = reticle.getObjectByName('diamond');

        // Plane visualization group (ARCore-style surface overlay)
        if (ENABLE_PLANE_VISUALIZATION) {
          const planeGroup = new THREE.Group();
          planeGroup.name = 'planeVisualization';
          scene.add(planeGroup);
          planeGroupRef.current = planeGroup;
        }

        // Load model
        const draco = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        const loader = new GLTFLoader();
        loader.setDRACOLoader(draco);
        setLoadProgress(5);

        const gltf = await new Promise((resolve, reject) => {
          loader.load(modelSrc,
            g => resolve(g),
            p => { if (p.total > 0) setLoadProgress(5 + Math.round((p.loaded / p.total) * 85)); },
            err => reject(err)
          );
        });
        if (cancelledRef.current) return;
        setLoadProgress(95);

        const model = gltf.scene;
        model.traverse(c => {
          if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
        });

        // Center + bottom at y=0
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += size.y / 2;

        // Auto-scale
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 4) model.scale.multiplyScalar(1.5 / maxDim);
        else if (maxDim < 0.03) model.scale.multiplyScalar(0.3 / maxDim);

        if (isCeiling) model.rotation.x = Math.PI;

        const group = new THREE.Group();
        group.add(model);
        group.visible = false;
        scene.add(group);
        modelGroupRef.current = group;

        setLoadProgress(100);
        updatePhase('ready');
      } catch (err) {
        setError(`Failed to load model: ${err.message || 'Unknown error'}`);
      }
    };

    setup();
    return () => {
      cancelledRef.current = true;
      if (anchorRef.current) { try { anchorRef.current.delete(); } catch {} }
      // Dispose plane meshes
      for (const [, mesh] of planeMeshesRef.current) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      planeMeshesRef.current.clear();
      if (sessionRef.current) { sessionRef.current.end().catch(() => {}); sessionRef.current = null; }
      if (rendererRef.current) { rendererRef.current.setAnimationLoop(null); rendererRef.current.dispose(); rendererRef.current = null; }
    };
  }, [modelSrc, isCeiling, updatePhase]);

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: "Enter AR" — user gesture starts XR session
  // ══════════════════════════════════════════════════════════════
  const startARSession = useCallback(async () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) { setError('Scene not initialized.'); return; }

    try {
      updatePhase('loading');
      if (containerRef.current) containerRef.current.appendChild(renderer.domElement);

      const sessionInit = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'anchors', 'plane-detection'],
      };
      if (overlayRef.current) sessionInit.domOverlay = { root: overlayRef.current };

      const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
      sessionRef.current = session;
      renderer.xr.setReferenceSpaceType('local');
      await renderer.xr.setSession(session);

      const viewerSpace = await session.requestReferenceSpace('viewer');
      const localSpace = await session.requestReferenceSpace('local');
      localSpaceRef.current = localSpace;

      const hitTestSource = await session.requestHitTestSource({ space: viewerSpace, entityTypes: ['plane'] });
      hitTestSourceRef.current = hitTestSource;

      // Transient input hit-test: detects surfaces where user taps (better for walls)
      try {
        const transientSource = await session.requestHitTestSourceForTransientInput({
          profile: 'generic-touchscreen',
          entityTypes: ['plane'],
        });
        transientHitSourceRef.current = transientSource;
      } catch {} // Not available on all devices

      updatePhase('scanning');

      session.addEventListener('end', () => {
        hitTestSourceRef.current = null;
        sessionRef.current = null;
        if (!cancelledRef.current) onClose();
      });

      // TAP = place model (scanning only, NOT in placed mode)
      session.addEventListener('select', (event) => {
        if (phaseRef.current !== 'scanning') return;

        const mode = surfaceModeRef.current;

        // Wall/Ceiling mode: handled by DOM click + render loop, skip select
        if (mode === 'wall' || mode === 'ceiling') return;

        // Floor mode: existing scan-and-place behavior
        if (reticleRef.current && reticleRef.current.visible) {
          placeModelAtReticle(event.frame, localSpace);
          return;
        }

        if (transientHitSourceRef.current) {
          const transientResults = event.frame.getHitTestResultsForTransientInput(transientHitSourceRef.current);
          if (transientResults && transientResults.length > 0) {
            for (let i = 0; i < transientResults.length; i++) {
              const inputResults = transientResults[i].results;
              if (!inputResults || inputResults.length === 0) continue;

              const tappedPose = inputResults[0].getPose(localSpace);
              if (!tappedPose) continue;

              _tmpMat4.current.fromArray(tappedPose.transform.matrix);
              _tmpMat4.current.decompose(_tmpPos.current, _tmpQuat.current, _tmpScale.current);
              primeReticlePose(_tmpPos.current, _tmpQuat.current);
              placeModelAtReticle(event.frame, localSpace);
              return;
            }
          }
        }

        if (resolveVerticalPlaneFallbackPose(event.frame, cameraRef.current)) {
          primeReticlePose(_tmpPos.current, _tmpQuat.current);
          placeModelAtReticle(event.frame, localSpace);
        }
      });

      // Prevent XR from consuming touches in placed mode
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.addEventListener('beforexrselect', (e) => {
          if (phaseRef.current === 'placed') e.preventDefault();
        });
      }

      // Touch gestures on the capture layer (pointer-events:auto div)
      const capture = touchCaptureRef.current;
      if (capture) {
        capture.addEventListener('touchstart', handleTouchStart, { passive: true });
        capture.addEventListener('touchmove', handleTouchMove, { passive: true });
        capture.addEventListener('touchend', handleTouchEnd, { passive: true });
        capture.addEventListener('touchcancel', handleTouchEnd, { passive: true });
      }

      const SMOOTH_SPEED = 14;

      renderer.setAnimationLoop((timestamp, frame) => {
        if (cancelledRef.current || !frame) return;

        const now = performance.now();
        const dt = lastFrameTime.current > 0 ? Math.min((now - lastFrameTime.current) / 1000, 0.1) : 0.016;
        lastFrameTime.current = now;
        const alpha = 1 - Math.exp(-SMOOTH_SPEED * dt);

        const currentPhase = phaseRef.current;
        const ret = reticleRef.current;
        const mg = modelGroupRef.current;
        const fc = ++_frameCounter.current;

        // ── SCANNING ──
        if (currentPhase === 'scanning') {
          const mode = surfaceModeRef.current;

          // Wall/Ceiling mode: cache camera pose + handle pending placement
          if (mode === 'wall' || mode === 'ceiling') {
            if (ret) ret.visible = false;

            // Cache viewer pose every frame for the DOM click handler
            const viewerPose = frame.getViewerPose(localSpaceRef.current);
            if (viewerPose) {
              const vt = viewerPose.transform;
              _lastCamOrigin.current.set(vt.position.x, vt.position.y, vt.position.z);
              const ori = vt.orientation;
              _tmpQuat.current.set(ori.x, ori.y, ori.z, ori.w);
              _lastCamDir.current.set(0, 0, -1).applyQuaternion(_tmpQuat.current).normalize();
              _lastCamPoseValid.current = true;
            }

            // Check if DOM click requested placement
            if (_pendingPlacement.current && _lastCamPoseValid.current) {
              _pendingPlacement.current = false;
              const result = computeCameraRayPlacement(frame, mode);
              if (result) {
                primeReticlePose(result.position, result.quaternion);
                placeModelAtReticle(frame, localSpaceRef.current);
              }
            }

            // Update hint text periodically
            if (now - lastUIUpdate.current > 500) {
              lastUIUpdate.current = now;
              const stRef = surfaceTextRef.current;
              if (stRef) {
                const hint = mode === 'wall'
                  ? '◧ Point at wall and tap to place'
                  : '⬆ Point at ceiling and tap to place';
                if (hint !== surfaceInfoRef.current) {
                  surfaceInfoRef.current = hint;
                  stRef.textContent = hint;
                }
              }
            }
          } else {
          // Floor mode: existing hit-test + median filter scan loop
          // Hit-test + median filter: every 2nd frame (halves XR API object allocations)
          // Reticle lerp runs every frame for smooth motion regardless
          if (fc & 1) {
            let hasPose = false;

            const hts = hitTestSourceRef.current;
            if (hts) {
              const results = frame.getHitTestResults(hts);
              if (results.length > 0) {
                const pose = results[0].getPose(localSpaceRef.current);
                if (pose) {
                  _tmpMat4.current.fromArray(pose.transform.matrix);
                  _tmpMat4.current.decompose(_tmpPos.current, _tmpQuat.current, _tmpScale.current);
                  hasPose = true;
                }
              }
            }

            if (!hasPose && transientHitSourceRef.current) {
              const transientResults = frame.getHitTestResultsForTransientInput(transientHitSourceRef.current);
              if (transientResults && transientResults.length > 0) {
                for (let i = 0; i < transientResults.length && !hasPose; i++) {
                  const inputResults = transientResults[i].results;
                  if (!inputResults || inputResults.length === 0) continue;
                  const pose = inputResults[0].getPose(localSpaceRef.current);
                  if (pose) {
                    _tmpMat4.current.fromArray(pose.transform.matrix);
                    _tmpMat4.current.decompose(_tmpPos.current, _tmpQuat.current, _tmpScale.current);
                    hasPose = true;
                  }
                }
              }
            }

            if (!hasPose && resolveVerticalPlaneFallbackPose(frame, camera)) {
              hasPose = true;
            }

            if (hasPose) {
              lastHitTime.current = now;
              consecutiveHits.current++;

              // Ring buffer median filter (zero allocation)
              const bufPos = _hitBufPos.current;
              const bufQuat = _hitBufQuat.current;
              const idx = _hitBufIdx.current % HIT_BUFFER_SIZE;
              bufPos[idx].copy(_tmpPos.current);
              bufQuat[idx].copy(_tmpQuat.current);
              _hitBufIdx.current++;
              const count = Math.min(_hitBufIdx.current, HIT_BUFFER_SIZE);
              _hitBufCount.current = count;

              const fPos = _filteredPos.current;
              let fQuat = bufQuat[idx];

              if (count >= 3) {
                const sx = _sortBufX.current;
                const sy = _sortBufY.current;
                const sz = _sortBufZ.current;
                for (let i = 0; i < count; i++) { sx[i] = bufPos[i].x; sy[i] = bufPos[i].y; sz[i] = bufPos[i].z; }
                for (let k = 0; k < 3; k++) {
                  const arr = k === 0 ? sx : k === 1 ? sy : sz;
                  for (let i = 1; i < count; i++) {
                    const v = arr[i];
                    let j = i - 1;
                    while (j >= 0 && arr[j] > v) { arr[j + 1] = arr[j]; j--; }
                    arr[j + 1] = v;
                  }
                }
                const mid = count >> 1;
                fPos.set(
                  count & 1 ? sx[mid] : (sx[mid - 1] + sx[mid]) * 0.5,
                  count & 1 ? sy[mid] : (sy[mid - 1] + sy[mid]) * 0.5,
                  count & 1 ? sz[mid] : (sz[mid - 1] + sz[mid]) * 0.5
                );
                let bi = 0, bd = Infinity;
                for (let i = 0; i < count; i++) { const d = bufPos[i].distanceToSquared(fPos); if (d < bd) { bd = d; bi = i; } }
                fQuat = bufQuat[bi];
              } else {
                fPos.copy(_tmpPos.current);
              }

              _filteredQuat.current.copy(fQuat);

              if (!reticleHasFirstPose.current) {
                reticlePosSmoothed.current.copy(fPos);
                reticleQuatSmoothed.current.copy(fQuat);
                reticleHasFirstPose.current = true;
              }
            } else {
              consecutiveHits.current = 0;
            }
          }

          // Reticle visual update — runs EVERY frame for buttery smooth motion
          if (ret) {
            if (!reticleHasFirstPose.current || now - lastHitTime.current > 300) {
              ret.visible = false;
            } else {
              // Smooth interpolation toward last filtered target (even on skip frames)
              reticlePosSmoothed.current.lerp(_filteredPos.current, alpha);
              reticleQuatSmoothed.current.slerp(_filteredQuat.current, alpha);
              ret.position.copy(reticlePosSmoothed.current);
              ret.quaternion.copy(reticleQuatSmoothed.current);
              ret.visible = true;

              const confidence = Math.min(1, consecutiveHits.current / 10);
              const pulse = 0.85 + 0.2 * confidence + 0.08 * Math.sin(now * 0.005);
              ret.scale.set(pulse, pulse, pulse);
              if (_scanArcRef.current) _scanArcRef.current.rotation.z = now * 0.003;
              if (_glowRef.current) _glowRef.current.material.opacity = 0.05 + confidence * 0.12;
              if (_diamondRef.current) _diamondRef.current.material.opacity = 0.6 + confidence * 0.4;
            }

            // Surface info — direct DOM update (zero React re-renders)
            if (now - lastUIUpdate.current > 500) {
              lastUIUpdate.current = now;
              const stRef = surfaceTextRef.current;
              if (stRef) {
                if (reticleHasFirstPose.current && now - lastHitTime.current <= 300) {
                  let info;
                  lastSurfaceTypeRef.current = classifySurface(_filteredQuat.current, _tmpUp.current);
                  if (lastSurfaceTypeRef.current === 'floor') info = '⬇ Floor detected — tap to place';
                  else if (lastSurfaceTypeRef.current === 'ceiling') info = '⬆ Ceiling detected — tap to place';
                  else info = '◧ Wall detected — tap to place';
                  if (info !== surfaceInfoRef.current) { surfaceInfoRef.current = info; stRef.textContent = info; }
                } else if (surfaceInfoRef.current !== 'Move slowly to scan surfaces...') {
                  surfaceInfoRef.current = 'Move slowly to scan surfaces...';
                  stRef.textContent = 'Move slowly to scan surfaces...';
                }
              }
            }
          }
          } // close floor-mode else branch
        }

        // ── PLACED: apply gesture transforms ──
        if (currentPhase === 'placed' && mg) {
          if (ret) ret.visible = false;

          if ((fc & 1) && isDraggingModel.current && transientHitSourceRef.current) {
            const transientResults = frame.getHitTestResultsForTransientInput(transientHitSourceRef.current);
            if (transientResults && transientResults.length > 0) {
              let dragPose = null;
              for (let i = 0; i < transientResults.length; i++) {
                const inputResults = transientResults[i].results;
                if (inputResults && inputResults.length > 0) {
                  dragPose = inputResults[0].getPose(localSpaceRef.current);
                  if (dragPose) break;
                }
              }

              if (dragPose) {
                _tmpMat4.current.fromArray(dragPose.transform.matrix);
                _tmpMat4.current.decompose(_tmpPos.current, _tmpQuat.current, _tmpScale.current);
                const dragAlpha = Math.min(1, alpha * 2.4);
                placedPosRef.current.lerp(_tmpPos.current, dragAlpha);
                placementQuatRef.current.slerp(_tmpQuat.current, dragAlpha);
              }
            }
          }

          const s = scaleRef.current;
          mg.scale.set(s, s, s);

          const surfaceNormal = _tmpSurfaceNormal.current.set(0, 1, 0).applyQuaternion(placementQuatRef.current).normalize();
          const userRotationQuat = _tmpUserRotationQuat.current.setFromAxisAngle(surfaceNormal, (rotationRef.current * Math.PI) / 180);
          mg.quaternion.copy(placementQuatRef.current);
          mg.quaternion.premultiply(userRotationQuat);

          mg.position.x = placedPosRef.current.x;
          mg.position.y = placedPosRef.current.y + heightRef.current;
          mg.position.z = placedPosRef.current.z;

          if (!isDraggingModel.current && anchorRefreshPendingRef.current && !anchorCreatePendingRef.current) {
            refreshAnchorAtPlacement(frame, localSpace);
          }

          // Anchor drift correction — every 8th frame, only >5mm drift, gentle
          if (fc % 8 === 0 && anchorRef.current && !isDraggingModel.current && !anchorRefreshPendingRef.current) {
            try {
              const ap = frame.getPose(anchorRef.current.anchorSpace, localSpace);
              if (ap) {
                const a = ap.transform.position;
                const dx = a.x - placedPosRef.current.x;
                const dy = a.y - placedPosRef.current.y;
                const dz = a.z - placedPosRef.current.z;
                // Only correct if drift > 5mm (avoids jitter from sensor noise)
                if (dx * dx + dy * dy + dz * dz > 0.000025) {
                  placedPosRef.current.x += dx * 0.08;
                  placedPosRef.current.y += dy * 0.08;
                  placedPosRef.current.z += dz * 0.08;
                  mg.position.x = placedPosRef.current.x;
                  mg.position.y = placedPosRef.current.y + heightRef.current;
                  mg.position.z = placedPosRef.current.z;
                }
              }
            } catch {}
          }

          if (shadowPlaneRef.current) {
            if (surfaceNormal.y > 0.7) {
              shadowPlaneRef.current.visible = true;
              shadowPlaneRef.current.position.y = placedPosRef.current.y;
            } else {
              shadowPlaneRef.current.visible = false;
            }
          }
        }

        // ── PLANE VISUALIZATION: every 5th frame in scanning, skip entirely once placed+hidden ──
        if (ENABLE_PLANE_VISUALIZATION && fc % 5 === 0 && frame.detectedPlanes && planeGroupRef.current && !_planesAllHidden.current) {
          const existingPlanes = planeMeshesRef.current;
          const detectedPlanes = frame.detectedPlanes;

          for (const [plane, mesh] of existingPlanes) {
            if (!detectedPlanes.has(plane)) {
              planeGroupRef.current.remove(mesh);
              mesh.geometry.dispose();
              mesh.material.dispose();
              existingPlanes.delete(plane);
            }
          }

          for (const plane of detectedPlanes) {
            const planePose = frame.getPose(plane.planeSpace, localSpaceRef.current);
            if (!planePose) continue;

            let mesh = existingPlanes.get(plane);
            const polygon = plane.polygon;
            if (!polygon || polygon.length < 3) continue;

            const needsCreate = !mesh;
            const needsUpdate = mesh && mesh.userData.lastChanged !== plane.lastChangedTime;

            if (needsCreate || needsUpdate) {
              if (mesh) {
                planeGroupRef.current.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
              }

              const verts = [];
              for (const p of polygon) {
                verts.push(p.x, p.y, p.z);
              }
              const geo = new THREE.BufferGeometry();
              const positions = new Float32Array(verts);
              geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

              const indices = [];
              for (let i = 1; i < polygon.length - 1; i++) {
                indices.push(0, i, i + 1);
              }
              geo.setIndex(indices);
              geo.computeVertexNormals();

              const isVertical = plane.orientation === 'vertical';
              const color = isVertical ? 0x42a5f5 : 0x00e676;
              const mat = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: currentPhase === 'placed' ? 0 : 0.12,
                side: THREE.DoubleSide,
                depthWrite: false,
              });

              mesh = new THREE.Mesh(geo, mat);
              mesh.userData.lastChanged = plane.lastChangedTime;
              mesh.userData.isVertical = isVertical;
              existingPlanes.set(plane, mesh);
              planeGroupRef.current.add(mesh);
            }

            const poseMatrix = _tmpMat4.current.fromArray(planePose.transform.matrix);
            mesh.matrix.copy(poseMatrix);
            mesh.matrixAutoUpdate = false;

            if (mesh.material) {
              const targetOpacity = currentPhase === 'placed' ? 0 : 0.12;
              mesh.material.opacity += (targetOpacity - mesh.material.opacity) * 0.3;
              if (mesh.material.opacity < 0.005) mesh.visible = false;
              else mesh.visible = true;
            }
          }

          if (currentPhase === 'placed') {
            let allHidden = true;
            for (const [, m] of existingPlanes) {
              if (m.visible) { allHidden = false; break; }
            }
            if (allHidden && existingPlanes.size > 0) {
              _planesAllHidden.current = true;
              planeGroupRef.current.visible = false;
            }
          }
        }

        renderer.render(scene, camera);
      });
    } catch (err) {
      console.error('AR session error:', err);
      if (err.message && err.message.includes('user activation')) {
        setError('Please tap "Enter AR" to start.'); updatePhase('ready');
      } else {
        setError(err.message || 'Failed to start AR session.');
      }
    }
  }, [
    onClose,
    updatePhase,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    primeReticlePose,
    resolveVerticalPlaneFallbackPose,
    computeCameraRayPlacement,
  ]);

  // Place model at reticle
  const placeModelAtReticle = useCallback((xrFrame, localSpace) => {
    const mg = modelGroupRef.current;
    if (!mg) return;

    placedPosRef.current.copy(reticlePosSmoothed.current);
    placementQuatRef.current.copy(reticleQuatSmoothed.current);
    mg.position.copy(placedPosRef.current);
    mg.visible = true;

    // Reset gesture state
    scaleRef.current = 1;
    rotationRef.current = 0;
    heightRef.current = 0;

    if (shadowPlaneRef.current) {
      shadowPlaneRef.current.position.copy(placedPosRef.current);
      shadowPlaneRef.current.visible = lastSurfaceTypeRef.current === 'floor';
    }
    if (dirLightRef.current) dirLightRef.current.target = mg;

    // Create anchor at the placed pose
    anchorRevisionRef.current += 1;
    anchorRefreshPendingRef.current = false;
    refreshAnchorAtPlacement(xrFrame, localSpace);

    _hitBufIdx.current = 0;
    _hitBufCount.current = 0;
    // Immediately hide plane overlays (avoids per-frame iteration during placed mode)
    _planesAllHidden.current = true;
    if (planeGroupRef.current) planeGroupRef.current.visible = false;

    // Show gesture hint briefly
    setGestureHint('Drag to move • Pinch to resize • Twist to rotate');
    setTimeout(() => setGestureHint(''), 4000);

    updatePhase('placed');
  }, [refreshAnchorAtPlacement, updatePhase]);

  const exitAR = useCallback(() => {
    if (sessionRef.current) sessionRef.current.end().catch(() => {});
    else onClose();
  }, [onClose]);

  return (
    <div className="car-container" ref={containerRef}>
      <div className="car-overlay" ref={overlayRef}>
        <button className="car-exit" onClick={exitAR}>✕</button>

        {phase === 'loading' && !error && (
          <div className="car-loading">
            <div className="car-spinner" />
            <p>Loading model...</p>
            <div className="car-progress-bar">
              <div className="car-progress-fill" style={{ width: `${loadProgress}%` }} />
            </div>
            <span className="car-progress-pct">{loadProgress}%</span>
          </div>
        )}

        {phase === 'ready' && !error && (
          <div className="car-ready">
            <div className="car-ready-icon">✓</div>
            <p className="car-ready-text">Model loaded</p>
            <button className="car-enter-btn" onClick={startARSession}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
              </svg>
              Enter AR
            </button>
            <p className="car-ready-hint">Camera will open for surface scanning</p>
          </div>
        )}

        {phase === 'scanning' && (
          <>
            {/* Scanning HUD overlay */}
            <div className="car-scan-overlay">
              <svg className="car-scan-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Corner brackets */}
                <path d="M10 40 L10 10 L40 10" stroke="rgba(0,230,118,0.8)" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M160 10 L190 10 L190 40" stroke="rgba(0,230,118,0.8)" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M190 160 L190 190 L160 190" stroke="rgba(0,230,118,0.8)" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M40 190 L10 190 L10 160" stroke="rgba(0,230,118,0.8)" strokeWidth="2.5" strokeLinecap="round"/>
                {/* Center crosshair */}
                <line x1="100" y1="85" x2="100" y2="95" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
                <line x1="100" y1="105" x2="100" y2="115" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
                <line x1="85" y1="100" x2="95" y2="100" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
                <line x1="105" y1="100" x2="115" y2="100" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
                {/* Center dot */}
                <circle cx="100" cy="100" r="2" fill="rgba(255,255,255,0.9)"/>
                {/* Rotating scan arc — only in floor mode */}
                {surfaceMode === 'floor' && (
                  <>
                    <circle cx="100" cy="100" r="60" stroke="rgba(0,230,118,0.2)" strokeWidth="1" strokeDasharray="8 12" className="car-scan-ring-slow"/>
                    <path d="M100 30 A70 70 0 0 1 170 100" stroke="rgba(0,230,118,0.5)" strokeWidth="2" strokeLinecap="round" className="car-scan-arc"/>
                  </>
                )}
                {/* Aiming circle for wall/ceiling mode */}
                {surfaceMode !== 'floor' && (
                  <circle cx="100" cy="100" r="40" stroke="rgba(0,230,118,0.5)" strokeWidth="1.5" strokeDasharray="6 4" className="car-aim-ring"/>
                )}
                {/* Tick marks */}
                <line x1="100" y1="35" x2="100" y2="42" stroke="rgba(0,230,118,0.4)" strokeWidth="1"/>
                <line x1="100" y1="158" x2="100" y2="165" stroke="rgba(0,230,118,0.4)" strokeWidth="1"/>
                <line x1="35" y1="100" x2="42" y2="100" stroke="rgba(0,230,118,0.4)" strokeWidth="1"/>
                <line x1="158" y1="100" x2="165" y2="100" stroke="rgba(0,230,118,0.4)" strokeWidth="1"/>
              </svg>
            </div>

            {/* Surface mode selector */}
            <div className="car-mode-selector">
              <button
                className={`car-mode-btn ${surfaceMode === 'floor' ? 'car-mode-active' : ''}`}
                onClick={() => updateSurfaceMode('floor')}
              >
                ⬇ Floor
              </button>
              <button
                className={`car-mode-btn ${surfaceMode === 'wall' ? 'car-mode-active' : ''}`}
                onClick={() => updateSurfaceMode('wall')}
              >
                ◧ Wall
              </button>
              <button
                className={`car-mode-btn ${surfaceMode === 'ceiling' ? 'car-mode-active' : ''}`}
                onClick={() => updateSurfaceMode('ceiling')}
              >
                ⬆ Ceiling
              </button>
            </div>

            <div className="car-scan-hud">
              <div className="car-scan-pill">
                <div className="car-pulse-dot" />
                <span ref={surfaceTextRef}>
                  {surfaceMode === 'floor' ? 'Move slowly to scan...' : surfaceMode === 'wall' ? '◧ Point at wall and tap to place' : '⬆ Point at ceiling and tap to place'}
                </span>
              </div>
              <p className="car-scan-hint">
                {surfaceMode === 'floor' ? (
                  <>Point camera at floor and move slowly.<br />Tap when the reticle locks on.</>
                ) : surfaceMode === 'wall' ? (
                  <>Point camera at a wall.<br />Tap to place — snaps to real wall if detected.</>
                ) : (
                  <>Point camera upward at ceiling.<br />Tap to place — snaps to real ceiling if detected.</>
                )}
              </p>
            </div>
          </>
        )}

        {/* Full-screen tap target for wall/ceiling placement (DOM click, not XR select) */}
        {phase === 'scanning' && surfaceMode !== 'floor' && (
          <div
            className="car-placement-tap"
            onClick={() => { _pendingPlacement.current = true; }}
          />
        )}

        {/* Touch capture layer — full-screen, pointer-events:auto in placed mode */}
        <div
          ref={touchCaptureRef}
          className={`car-touch-capture ${phase === 'placed' ? 'car-touch-active' : ''}`}
        />

        {phase === 'placed' && gestureHint && (
          <div className="car-gesture-hint">
            {gestureHint}
          </div>
        )}

        {error && (
          <div className="car-error">
            <p>{error}</p>
            <button onClick={exitAR}>Go Back</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomAR;
