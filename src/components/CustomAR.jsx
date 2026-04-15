import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import './CustomAR.css';

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

  // Transform refs (updated by touch gestures + render loop reads these)
  const scaleRef = useRef(1);
  const rotationRef = useRef(0);
  const heightRef = useRef(0);
  const placedPosRef = useRef(new THREE.Vector3());

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

  // Transient (touch) hit-test
  const transientHitSourceRef = useRef(null);
  const lastSurfaceTypeRef = useRef('floor'); // floor | wall | ceiling

  // Plane visualization (ARCore-style grid overlay)
  const planeMeshesRef = useRef(new Map()); // XRPlane → THREE.Mesh
  const planeGroupRef = useRef(null);

  // ── UI state (minimal — only for phase transitions + errors) ──
  const [phase, setPhase] = useState('loading');
  const [surfaceInfo, setSurfaceInfo] = useState('');
  const [error, setError] = useState(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [gestureHint, setGestureHint] = useState('');

  const isCeiling = modelCategory === 'Ceiling Lamps' || modelCategory === 'Chandeliers';

  const updatePhase = useCallback((p) => {
    phaseRef.current = p;
    setPhase(p);
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
          alpha: true, antialias: true, powerPreference: 'high-performance',
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
        const planeGroup = new THREE.Group();
        planeGroup.name = 'planeVisualization';
        scene.add(planeGroup);
        planeGroupRef.current = planeGroup;

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
        optionalFeatures: ['dom-overlay', 'light-estimation', 'anchors', 'plane-detection'],
      };
      if (overlayRef.current) sessionInit.domOverlay = { root: overlayRef.current };

      const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
      sessionRef.current = session;
      renderer.xr.setReferenceSpaceType('local');
      await renderer.xr.setSession(session);

      const viewerSpace = await session.requestReferenceSpace('viewer');
      const localSpace = await session.requestReferenceSpace('local');
      localSpaceRef.current = localSpace;

      const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
      hitTestSourceRef.current = hitTestSource;

      // Transient input hit-test: detects surfaces where user taps (better for walls)
      try {
        const transientSource = await session.requestHitTestSourceForTransientInput({ profile: 'generic-touchscreen' });
        transientHitSourceRef.current = transientSource;
      } catch {} // Not available on all devices

      let lightProbe = null;
      try { lightProbe = await session.requestLightProbe(); } catch {}

      updatePhase('scanning');

      session.addEventListener('end', () => {
        hitTestSourceRef.current = null;
        sessionRef.current = null;
        if (!cancelledRef.current) onClose();
      });

      // TAP = place model (scanning only, NOT in placed mode)
      session.addEventListener('select', (event) => {
        if (phaseRef.current === 'scanning' && reticleRef.current && reticleRef.current.visible) {
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

        // Light estimation
        if (lightProbe && frame.getLightEstimate) {
          try {
            const est = frame.getLightEstimate(lightProbe);
            if (est) {
              const pi = est.primaryLightIntensity;
              if (pi) {
                const lum = Math.max(pi.x, pi.y, pi.z);
                if (ambientRef.current) ambientRef.current.intensity += (Math.min(lum * 0.6, 2.5) - ambientRef.current.intensity) * alpha * 0.2;
                if (dirLightRef.current) {
                  dirLightRef.current.intensity += (Math.min(lum * 0.8, 3.0) - dirLightRef.current.intensity) * alpha * 0.2;
                }
              }
            }
          } catch {}
        }

        // ── SCANNING: hit-test + reticle ──
        if (currentPhase === 'scanning') {
          let hitPose = null;

          // 1. Viewer-space hit-test (continuous ray from screen center)
          const hts = hitTestSourceRef.current;
          if (hts) {
            const results = frame.getHitTestResults(hts);
            if (results.length > 0) {
              hitPose = results[0].getPose(localSpaceRef.current);
            }
          }

          // 2. Transient input hit-test (touch-directed, better for walls)
          if (!hitPose && transientHitSourceRef.current) {
            const transientResults = frame.getHitTestResultsForTransientInput(transientHitSourceRef.current);
            if (transientResults && transientResults.length > 0) {
              const inputResults = transientResults[0].results;
              if (inputResults.length > 0) {
                hitPose = inputResults[0].getPose(localSpaceRef.current);
              }
            }
          }

          if (hitPose && ret) {
            lastHitTime.current = now;
            consecutiveHits.current++;

            _tmpMat4.current.fromArray(hitPose.transform.matrix);
            _tmpMat4.current.decompose(_tmpPos.current, _tmpQuat.current, _tmpScale.current);

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
            let fQuat = bufQuat[idx]; // default: latest

            if (count >= 3) {
              // Median per axis — zero allocation (insertion sort in-place on pre-allocated buffers)
              const sx = _sortBufX.current;
              const sy = _sortBufY.current;
              const sz = _sortBufZ.current;
              for (let i = 0; i < count; i++) { sx[i] = bufPos[i].x; sy[i] = bufPos[i].y; sz[i] = bufPos[i].z; }
              // Insertion sort (5 elements max, faster than .sort() and no allocation)
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
              // Pick quaternion closest to median position
              let bi = 0, bd = Infinity;
              for (let i = 0; i < count; i++) { const d = bufPos[i].distanceToSquared(fPos); if (d < bd) { bd = d; bi = i; } }
              fQuat = bufQuat[bi];
            } else {
              fPos.copy(_tmpPos.current);
            }

            if (!reticleHasFirstPose.current) {
              reticlePosSmoothed.current.copy(fPos);
              reticleQuatSmoothed.current.copy(fQuat);
              reticleHasFirstPose.current = true;
            } else {
              reticlePosSmoothed.current.lerp(fPos, alpha);
              reticleQuatSmoothed.current.slerp(fQuat, alpha);
            }

            ret.position.copy(reticlePosSmoothed.current);
            ret.quaternion.copy(reticleQuatSmoothed.current);
            ret.visible = true;

            // Animated reticle: pulse + rotate scan arc
            const confidence = Math.min(1, consecutiveHits.current / 10);
            const pulse = 0.85 + 0.2 * confidence + 0.08 * Math.sin(now * 0.005);
            ret.scale.set(pulse, pulse, pulse);

            // Rotate the scanning arc (cached ref, no traversal)
            if (_scanArcRef.current) _scanArcRef.current.rotation.z = now * 0.003;

            // Glow intensity grows with confidence
            if (_glowRef.current) _glowRef.current.material.opacity = 0.05 + confidence * 0.12;

            // Diamond brightness
            if (_diamondRef.current) _diamondRef.current.material.opacity = 0.6 + confidence * 0.4;

            // Throttled surface info (max 2x/sec)
            if (now - lastUIUpdate.current > 500) {
              lastUIUpdate.current = now;
              const up = _tmpUp.current.set(0, 1, 0).applyQuaternion(fQuat);
              let info, stype;
              if (up.y > 0.7) { info = '⬇ Floor detected — tap to place'; stype = 'floor'; }
              else if (up.y < -0.7) { info = '⬆ Ceiling detected — tap to place'; stype = 'ceiling'; }
              else { info = '◧ Wall detected — tap to place'; stype = 'wall'; }
              lastSurfaceTypeRef.current = stype;
              if (info !== surfaceInfoRef.current) {
                surfaceInfoRef.current = info;
                setSurfaceInfo(info);
              }
            }
          } else if (ret) {
            consecutiveHits.current = 0;
            if (now - lastHitTime.current > 300) ret.visible = false;
            // Keep arc rotating even without hit (cached ref)
            if (_scanArcRef.current) _scanArcRef.current.rotation.z = now * 0.003;
            if (now - lastUIUpdate.current > 500) {
              lastUIUpdate.current = now;
              if (surfaceInfoRef.current !== 'Move slowly to scan surfaces...') {
                surfaceInfoRef.current = 'Move slowly to scan surfaces...';
                setSurfaceInfo('Move slowly to scan surfaces...');
              }
            }
          }
        }

        // ── PLACED: apply gesture transforms, anchor drift correction ──
        if (currentPhase === 'placed' && mg) {
          // Hide reticle completely in placed mode
          if (ret) ret.visible = false;

          const s = scaleRef.current;
          mg.scale.set(s, s, s);
          mg.rotation.y = (rotationRef.current * Math.PI) / 180;
          mg.position.x = placedPosRef.current.x;
          mg.position.y = placedPosRef.current.y + heightRef.current;
          mg.position.z = placedPosRef.current.z;

          // Anchor drift correction — only when NOT being dragged
          if (anchorRef.current && !isDraggingModel.current) {
            try {
              const ap = frame.getPose(anchorRef.current.anchorSpace, localSpace);
              if (ap) {
                const a = ap.transform.position;
                placedPosRef.current.x += (a.x - placedPosRef.current.x) * alpha * 0.5;
                placedPosRef.current.z += (a.z - placedPosRef.current.z) * alpha * 0.5;
                mg.position.x = placedPosRef.current.x;
                mg.position.z = placedPosRef.current.z;
              }
            } catch {}
          }

          if (shadowPlaneRef.current) shadowPlaneRef.current.position.y = placedPosRef.current.y;
        }

        // ── PLANE VISUALIZATION: render detected planes as grid overlays ──
        if (frame.detectedPlanes && planeGroupRef.current) {
          const existingPlanes = planeMeshesRef.current;
          const detectedPlanes = frame.detectedPlanes;

          // Remove meshes for planes no longer detected
          for (const [plane, mesh] of existingPlanes) {
            if (!detectedPlanes.has(plane)) {
              planeGroupRef.current.remove(mesh);
              mesh.geometry.dispose();
              mesh.material.dispose();
              existingPlanes.delete(plane);
            }
          }

          // Add/update meshes for detected planes
          for (const plane of detectedPlanes) {
            const planePose = frame.getPose(plane.planeSpace, localSpaceRef.current);
            if (!planePose) continue;

            let mesh = existingPlanes.get(plane);
            const polygon = plane.polygon;
            if (!polygon || polygon.length < 3) continue;

            // Check if plane geometry needs update
            const needsCreate = !mesh;
            const needsUpdate = mesh && mesh.userData.lastChanged !== plane.lastChangedTime;

            if (needsCreate || needsUpdate) {
              if (mesh) {
                planeGroupRef.current.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
              }

              // Build geometry from plane polygon
              const verts = [];
              for (const p of polygon) {
                verts.push(p.x, p.y, p.z);
              }
              const geo = new THREE.BufferGeometry();
              const positions = new Float32Array(verts);
              geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

              // Triangulate (fan from first vertex)
              const indices = [];
              for (let i = 1; i < polygon.length - 1; i++) {
                indices.push(0, i, i + 1);
              }
              geo.setIndex(indices);
              geo.computeVertexNormals();

              // Determine surface type from plane orientation
              const normal = new THREE.Vector3(0, 1, 0);
              if (plane.orientation === 'vertical') {
                normal.set(0, 0, 1);
              }

              // ARCore-style dot grid material
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

            // Update transform
            const poseMatrix = _tmpMat4.current.fromArray(planePose.transform.matrix);
            mesh.matrix.copy(poseMatrix);
            mesh.matrixAutoUpdate = false;

            // Fade planes based on phase
            if (mesh.material) {
              const targetOpacity = currentPhase === 'placed' ? 0 : 0.12;
              mesh.material.opacity += (targetOpacity - mesh.material.opacity) * 0.1;
              if (mesh.material.opacity < 0.005) mesh.visible = false;
              else mesh.visible = true;
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
  }, [onClose, updatePhase, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Place model at reticle
  const placeModelAtReticle = useCallback((xrFrame, localSpace) => {
    const mg = modelGroupRef.current;
    if (!mg) return;

    const pos = reticlePosSmoothed.current.clone();
    placedPosRef.current.copy(pos);
    mg.position.copy(pos);
    mg.visible = true;

    // Reset gesture state
    scaleRef.current = 1;
    rotationRef.current = 0;
    heightRef.current = 0;

    if (shadowPlaneRef.current) {
      shadowPlaneRef.current.position.set(pos.x, pos.y, pos.z);
      shadowPlaneRef.current.visible = true;
    }
    if (dirLightRef.current) dirLightRef.current.target = mg;

    // Create anchor
    if (anchorRef.current) { try { anchorRef.current.delete(); } catch {} anchorRef.current = null; }
    if (xrFrame && xrFrame.createAnchor && localSpace) {
      try {
        const q = reticleQuatSmoothed.current;
        const pose = new XRRigidTransform(
          { x: pos.x, y: pos.y, z: pos.z, w: 1 },
          { x: q.x, y: q.y, z: q.z, w: q.w }
        );
        xrFrame.createAnchor(pose, localSpace).then(a => { anchorRef.current = a; }).catch(() => {});
      } catch {}
    }

    _hitBufIdx.current = 0;
    _hitBufCount.current = 0;

    // Show gesture hint briefly
    setGestureHint('Drag to move • Pinch to resize • Twist to rotate');
    setTimeout(() => setGestureHint(''), 4000);

    updatePhase('placed');
  }, [updatePhase]);

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
                {/* Rotating scan arc */}
                <circle cx="100" cy="100" r="60" stroke="rgba(0,230,118,0.2)" strokeWidth="1" strokeDasharray="8 12" className="car-scan-ring-slow"/>
                <path d="M100 30 A70 70 0 0 1 170 100" stroke="rgba(0,230,118,0.5)" strokeWidth="2" strokeLinecap="round" className="car-scan-arc"/>
                {/* Tick marks */}
                <line x1="100" y1="35" x2="100" y2="42" stroke="rgba(0,230,118,0.4)" strokeWidth="1"/>
                <line x1="100" y1="158" x2="100" y2="165" stroke="rgba(0,230,118,0.4)" strokeWidth="1"/>
                <line x1="35" y1="100" x2="42" y2="100" stroke="rgba(0,230,118,0.4)" strokeWidth="1"/>
                <line x1="158" y1="100" x2="165" y2="100" stroke="rgba(0,230,118,0.4)" strokeWidth="1"/>
              </svg>
            </div>

            <div className="car-scan-hud">
              <div className="car-scan-pill">
                <div className="car-pulse-dot" />
                <span>{surfaceInfo || 'Move slowly to scan...'}</span>
              </div>
              <p className="car-scan-hint">
                Point camera at a surface and move slowly.
                <br />
                Tap when the reticle locks on.
              </p>
            </div>
          </>
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
