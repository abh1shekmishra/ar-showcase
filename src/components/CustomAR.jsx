import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import './CustomAR.css';

// Median of a numeric array
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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

  // Outlier rejection buffer
  const HIT_BUFFER_SIZE = 5;
  const hitPosBuffer = useRef([]);
  const hitQuatBuffer = useRef([]);

  // Tracking
  const lastHitTime = useRef(0);
  const consecutiveHits = useRef(0);

  // Touch gesture tracking
  const touchStartDist = useRef(0);
  const touchStartAngle = useRef(0);
  const touchStartScale = useRef(1);
  const touchStartRot = useRef(0);
  const singleTouchStartY = useRef(0);
  const singleTouchStartHeight = useRef(0);
  const activeTouches = useRef(0);

  // Throttle UI updates
  const lastUIUpdate = useRef(0);
  const surfaceInfoRef = useRef('');

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
    } else if (e.touches.length === 1) {
      // Single finger: vertical drag for height
      singleTouchStartY.current = e.touches[0].clientY;
      singleTouchStartHeight.current = heightRef.current;
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
    } else if (e.touches.length === 1 && activeTouches.current === 1) {
      // Single finger vertical drag → height
      const deltaY = singleTouchStartY.current - e.touches[0].clientY;
      const heightDelta = deltaY * 0.005; // 5mm per pixel
      heightRef.current = singleTouchStartHeight.current + heightDelta;
      heightRef.current = Math.max(-3, Math.min(5, heightRef.current));
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

        // Reticle
        const reticle = new THREE.Group();
        const outerRing = new THREE.Mesh(
          new THREE.RingGeometry(0.09, 0.11, 64),
          new THREE.MeshBasicMaterial({ color: 0x00e676, side: THREE.DoubleSide })
        );
        outerRing.rotation.x = -Math.PI / 2;
        reticle.add(outerRing);
        const innerDot = new THREE.Mesh(
          new THREE.CircleGeometry(0.015, 24),
          new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        );
        innerDot.rotation.x = -Math.PI / 2;
        reticle.add(innerDot);
        reticle.visible = false;
        scene.add(reticle);
        reticleRef.current = reticle;

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
        optionalFeatures: ['dom-overlay', 'light-estimation', 'anchors'],
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

      // Touch gestures on overlay
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.addEventListener('touchstart', handleTouchStart, { passive: true });
        overlay.addEventListener('touchmove', handleTouchMove, { passive: true });
        overlay.addEventListener('touchend', handleTouchEnd, { passive: true });
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
          const hts = hitTestSourceRef.current;
          if (hts) {
            const results = frame.getHitTestResults(hts);
            if (results.length > 0 && ret) {
              const pose = results[0].getPose(localSpaceRef.current);
              if (pose) {
                lastHitTime.current = now;
                consecutiveHits.current++;

                const m4 = new THREE.Matrix4().fromArray(pose.transform.matrix);
                const rawPos = new THREE.Vector3();
                const rawQuat = new THREE.Quaternion();
                const rawSc = new THREE.Vector3();
                m4.decompose(rawPos, rawQuat, rawSc);

                // Median filter
                const pb = hitPosBuffer.current;
                const qb = hitQuatBuffer.current;
                pb.push(rawPos.clone());
                qb.push(rawQuat.clone());
                if (pb.length > HIT_BUFFER_SIZE) pb.shift();
                if (qb.length > HIT_BUFFER_SIZE) qb.shift();

                let fPos = rawPos, fQuat = rawQuat;
                if (pb.length >= 3) {
                  fPos = new THREE.Vector3(median(pb.map(p => p.x)), median(pb.map(p => p.y)), median(pb.map(p => p.z)));
                  let bi = 0, bd = Infinity;
                  for (let i = 0; i < pb.length; i++) { const d = pb[i].distanceToSquared(fPos); if (d < bd) { bd = d; bi = i; } }
                  fQuat = qb[bi];
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

                // Pulse
                const pulse = 0.9 + 0.15 * Math.sin(now * 0.004);
                ret.scale.set(pulse, pulse, pulse);

                // Throttled surface info (max 2x/sec)
                if (now - lastUIUpdate.current > 500) {
                  lastUIUpdate.current = now;
                  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(fQuat);
                  let info;
                  if (up.y > 0.7) info = 'Floor detected — tap to place';
                  else if (up.y < -0.7) info = 'Ceiling detected — tap to place';
                  else info = 'Wall detected — tap to place';
                  if (info !== surfaceInfoRef.current) {
                    surfaceInfoRef.current = info;
                    setSurfaceInfo(info);
                  }
                }
              }
            } else if (ret) {
              consecutiveHits.current = 0;
              if (now - lastHitTime.current > 300) ret.visible = false;
              if (now - lastUIUpdate.current > 500) {
                lastUIUpdate.current = now;
                if (surfaceInfoRef.current !== 'Scanning for surfaces...') {
                  surfaceInfoRef.current = 'Scanning for surfaces...';
                  setSurfaceInfo('Scanning for surfaces...');
                }
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
          mg.position.y = placedPosRef.current.y + heightRef.current;

          // Anchor drift correction
          if (anchorRef.current) {
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

    hitPosBuffer.current = [];
    hitQuatBuffer.current = [];

    // Show gesture hint briefly
    setGestureHint('Pinch to resize • Twist to rotate • Drag to adjust height');
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
          <div className="car-scan-hud">
            <div className="car-scan-pill">
              <div className="car-pulse-dot" />
              <span>{surfaceInfo || 'Scanning...'}</span>
            </div>
            <p className="car-scan-hint">
              Point camera at a floor, wall, or ceiling.
              <br />
              Tap the green circle to place.
            </p>
          </div>
        )}

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
