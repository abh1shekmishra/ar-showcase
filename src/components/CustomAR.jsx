import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import './CustomAR.css';

// Median filter: returns median of a sorted copy of the array
const median = (arr) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

const CustomAR = ({ modelSrc, modelCategory, onClose }) => {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);

  // ── Refs for render-loop access (React state is stale inside rAF) ──
  const phaseRef = useRef('loading'); // loading → ready → scanning → placed
  const modelGroupRef = useRef(null);
  const reticleRef = useRef(null);
  const hitTestSourceRef = useRef(null);
  const sessionRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const localSpaceRef = useRef(null);
  const scaleRef = useRef(1);
  const rotationRef = useRef(0);
  const heightRef = useRef(0);
  const placedPosRef = useRef(new THREE.Vector3());
  const shadowPlaneRef = useRef(null);
  const dirLightRef = useRef(null);
  const ambientRef = useRef(null);
  const cancelledRef = useRef(false);

  // Smoothing: lerp targets for reticle to eliminate jitter
  const reticlePosTarget = useRef(new THREE.Vector3());
  const reticleQuatTarget = useRef(new THREE.Quaternion());
  const reticlePosSmoothed = useRef(new THREE.Vector3());
  const reticleQuatSmoothed = useRef(new THREE.Quaternion());
  const reticleHasFirstPose = useRef(false);
  const lastFrameTime = useRef(0); // for frame-rate independent smoothing

  // Hit-test outlier rejection: rolling buffer of recent positions
  const HIT_BUFFER_SIZE = 7;
  const hitPosBuffer = useRef([]); // array of THREE.Vector3
  const hitQuatBuffer = useRef([]); // array of THREE.Quaternion

  // XR anchor for drift-proof placement
  const anchorRef = useRef(null);

  // Tracking quality
  const lastHitTime = useRef(0);
  const consecutiveHits = useRef(0);
  const surfaceConfidence = useRef(0); // 0-1

  // ── UI state ──
  const [phase, setPhase] = useState('loading'); // loading | ready | scanning | placed
  const [surfaceInfo, setSurfaceInfo] = useState('');
  const [arScale, setArScale] = useState(1);
  const [arRotation, setArRotation] = useState(0);
  const [arHeight, setArHeight] = useState(0);
  const [error, setError] = useState(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [trackingStatus, setTrackingStatus] = useState('good'); // good | limited | lost

  const isCeiling = modelCategory === 'Ceiling Lamps' || modelCategory === 'Chandeliers';

  // Sync state → refs for render loop
  useEffect(() => { scaleRef.current = arScale; }, [arScale]);
  useEffect(() => { rotationRef.current = arRotation; }, [arRotation]);
  useEffect(() => { heightRef.current = arHeight; }, [arHeight]);

  const updatePhase = useCallback((p) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: On mount — set up Three.js scene + load model
  //          (NO XR session here — that needs user activation)
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    cancelledRef.current = false;

    const setup = async () => {
      // ── 1. Check WebXR support ──
      if (!navigator.xr) {
        setError('WebXR is not available. Use Chrome 79+ on Android.');
        return;
      }

      try {
        const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
        if (!isSupported) {
          setError('AR is not supported on this device/browser. Use Chrome on Android.');
          return;
        }
      } catch {
        setError('Could not check AR support. Use Chrome on Android.');
        return;
      }

      try {
        // ── 2. Three.js renderer ──
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap for perf
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

        const camera = new THREE.PerspectiveCamera(
          70, window.innerWidth / window.innerHeight, 0.01, 40
        );
        cameraRef.current = camera;

        // ── 3. Lighting (will be adjusted by light estimation if available) ──
        const ambient = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambient);
        ambientRef.current = ambient;

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(1, 4, 2);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
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

        // Shadow-catching plane
        const shadowPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(20, 20),
          new THREE.ShadowMaterial({ opacity: 0.35 })
        );
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.receiveShadow = true;
        shadowPlane.visible = false;
        scene.add(shadowPlane);
        shadowPlaneRef.current = shadowPlane;

        // ── 4. Reticle — stabilized green ring ──
        const reticle = new THREE.Group();

        // Outer ring
        const outerRing = new THREE.Mesh(
          new THREE.RingGeometry(0.09, 0.11, 64),
          new THREE.MeshBasicMaterial({ color: 0x00e676, side: THREE.DoubleSide })
        );
        outerRing.rotation.x = -Math.PI / 2;
        reticle.add(outerRing);

        // Inner ring
        const innerRing = new THREE.Mesh(
          new THREE.RingGeometry(0.04, 0.05, 64),
          new THREE.MeshBasicMaterial({
            color: 0x00e676, side: THREE.DoubleSide,
            transparent: true, opacity: 0.4,
          })
        );
        innerRing.rotation.x = -Math.PI / 2;
        reticle.add(innerRing);

        // Center dot
        const centerDot = new THREE.Mesh(
          new THREE.CircleGeometry(0.012, 24),
          new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        );
        centerDot.rotation.x = -Math.PI / 2;
        reticle.add(centerDot);

        reticle.visible = false;
        scene.add(reticle);
        reticleRef.current = reticle;

        // ── 5. Load model ──
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

        const gltfLoader = new GLTFLoader();
        gltfLoader.setDRACOLoader(dracoLoader);

        setLoadProgress(5);

        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.load(
            modelSrc,
            (g) => resolve(g),
            (progress) => {
              if (progress.total > 0) {
                setLoadProgress(5 + Math.round((progress.loaded / progress.total) * 85));
              }
            },
            (err) => reject(err)
          );
        });

        if (cancelledRef.current) return;
        setLoadProgress(95);

        const model = gltf.scene;

        // Enable shadows + fix materials
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Ensure proper material encoding
            if (child.material) {
              child.material.needsUpdate = true;
            }
          }
        });

        // Center model on bounding box, put bottom at y=0
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += size.y / 2;

        // Auto-scale if out of range (real-world meters)
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 4) {
          model.scale.multiplyScalar(1.5 / maxDim);
        } else if (maxDim < 0.03) {
          model.scale.multiplyScalar(0.3 / maxDim);
        }

        // Ceiling fixtures: flip upside down
        if (isCeiling) {
          model.rotation.x = Math.PI;
        }

        const modelGroup = new THREE.Group();
        modelGroup.add(model);
        modelGroup.visible = false;
        scene.add(modelGroup);
        modelGroupRef.current = modelGroup;

        setLoadProgress(100);

        // Model loaded — show "Enter AR" button (phase: ready)
        updatePhase('ready');

      } catch (err) {
        console.error('Model load error:', err);
        setError(`Failed to load model: ${err.message || 'Unknown error'}`);
      }
    };

    setup();

    return () => {
      cancelledRef.current = true;
      if (anchorRef.current) {
        try { anchorRef.current.delete(); } catch {}
        anchorRef.current = null;
      }
      if (sessionRef.current) {
        sessionRef.current.end().catch(() => {});
        sessionRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.setAnimationLoop(null);
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, [modelSrc, isCeiling, updatePhase]);

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: "Enter AR" button click — requestSession (user gesture!)
  // ══════════════════════════════════════════════════════════════
  const startARSession = useCallback(async () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) {
      setError('Scene not initialized.');
      return;
    }

    try {
      updatePhase('loading'); // brief transition

      // Append canvas
      if (containerRef.current) {
        containerRef.current.appendChild(renderer.domElement);
      }

      // ── Request XR session (MUST be in user-gesture call stack) ──
      const sessionInit = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'light-estimation', 'anchors'],
      };
      if (overlayRef.current) {
        sessionInit.domOverlay = { root: overlayRef.current };
      }

      const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
      sessionRef.current = session;

      renderer.xr.setReferenceSpaceType('local');
      await renderer.xr.setSession(session);

      // ── Reference spaces ──
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const localSpace = await session.requestReferenceSpace('local');
      localSpaceRef.current = localSpace;

      // ── Hit-test source ──
      let hitTestSource;
      try {
        hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
        hitTestSourceRef.current = hitTestSource;
      } catch (htErr) {
        console.warn('Hit-test source failed, retrying...', htErr);
        // Retry once after brief delay
        await new Promise(r => setTimeout(r, 500));
        hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
        hitTestSourceRef.current = hitTestSource;
      }

      // ── Light estimation (if supported) ──
      let lightProbe = null;
      try {
        lightProbe = await session.requestLightProbe();
      } catch {
        // light estimation not available — use static lighting
      }

      updatePhase('scanning');

      // ── Session lifecycle ──
      session.addEventListener('end', () => {
        hitTestSourceRef.current = null;
        sessionRef.current = null;
        if (!cancelledRef.current) onClose();
      });

      // Re-request hit-test if it gets cancelled (error recovery)
      if (hitTestSource) {
        hitTestSource.addEventListener('cancel', async () => {
          console.warn('Hit-test source cancelled, re-requesting...');
          hitTestSourceRef.current = null;
          try {
            const newViewerSpace = await session.requestReferenceSpace('viewer');
            const newHts = await session.requestHitTestSource({ space: newViewerSpace });
            hitTestSourceRef.current = newHts;
          } catch (e) {
            console.error('Failed to re-create hit-test source:', e);
          }
        });
      }

      // ── Visibility change: handle tab switch / lock screen ──
      session.addEventListener('visibilitychange', () => {
        if (session.visibilityState === 'hidden') {
          setTrackingStatus('lost');
        } else {
          setTrackingStatus('limited');
          // Tracking will recover — consecutive hits will restore 'good'
        }
      });

      // ── TAP handler: place or reposition ──
      session.addEventListener('select', (event) => {
        const currentPhase = phaseRef.current;
        const ret = reticleRef.current;
        const xrFrame = event.frame;

        // Scanning: place model at reticle
        if (currentPhase === 'scanning' && ret && ret.visible) {
          placeModelAtReticle(xrFrame);
        }
        // Already placed: reposition (tap to move)
        else if (currentPhase === 'placed' && ret && ret.visible) {
          placeModelAtReticle(xrFrame);
        }
      });

      // ── Render loop ──
      // Smoothing constant: higher = snappier, lower = smoother
      // Using frame-rate independent formula: 1 - e^(-speed * dt)
      const SMOOTH_SPEED = 12; // ~0.25 at 60fps, adapts to any frame rate

      renderer.setAnimationLoop((timestamp, frame) => {
        if (cancelledRef.current || !frame) return;

        // ── Frame-rate independent delta time ──
        const now = performance.now();
        const dt = lastFrameTime.current > 0
          ? Math.min((now - lastFrameTime.current) / 1000, 0.1) // cap at 100ms
          : 0.016; // assume 60fps on first frame
        lastFrameTime.current = now;

        const lerpAlpha = 1 - Math.exp(-SMOOTH_SPEED * dt);

        const currentPhase = phaseRef.current;
        const ret = reticleRef.current;
        const mg = modelGroupRef.current;

        // ── Light estimation: update scene lighting from real world ──
        if (lightProbe && frame.getLightEstimate) {
          try {
            const estimate = frame.getLightEstimate(lightProbe);
            if (estimate) {
              const intensity = estimate.primaryLightIntensity;
              if (intensity) {
                const lum = Math.max(intensity.x, intensity.y, intensity.z);
                if (ambientRef.current) {
                  // Smooth light changes to avoid flickering
                  const targetAmbient = Math.min(lum * 0.6, 2.5);
                  ambientRef.current.intensity += (targetAmbient - ambientRef.current.intensity) * lerpAlpha * 0.3;
                }
                if (dirLightRef.current) {
                  const targetDir = Math.min(lum * 0.8, 3.0);
                  dirLightRef.current.intensity += (targetDir - dirLightRef.current.intensity) * lerpAlpha * 0.3;
                  dirLightRef.current.color.lerp(
                    new THREE.Color(
                      intensity.x / (lum || 1),
                      intensity.y / (lum || 1),
                      intensity.z / (lum || 1)
                    ),
                    lerpAlpha * 0.3
                  );
                }
              }
              const dir = estimate.primaryLightDirection;
              if (dir && dirLightRef.current && mg && mg.visible) {
                dirLightRef.current.position.set(
                  mg.position.x - dir.x * 4,
                  mg.position.y - dir.y * 4 + 2,
                  mg.position.z - dir.z * 4
                );
              }
            }
          } catch {
            // Ignore light estimation errors
          }
        }

        // ── Update model from anchor (drift correction) ──
        if (currentPhase === 'placed' && anchorRef.current && mg) {
          try {
            const anchorPose = frame.getPose(anchorRef.current.anchorSpace, localSpace);
            if (anchorPose) {
              const aPos = anchorPose.transform.position;
              // Smoothly correct any drift between anchor and placed position
              placedPosRef.current.x += (aPos.x - placedPosRef.current.x) * lerpAlpha;
              placedPosRef.current.z += (aPos.z - placedPosRef.current.z) * lerpAlpha;
              // Don't correct Y from anchor — user controls height
              mg.position.x = placedPosRef.current.x;
              mg.position.z = placedPosRef.current.z;
            }
          } catch {
            // Anchor pose unavailable this frame — no correction
          }
        }

        // ── Hit-test: scanning or placed (for repositioning) ──
        if (currentPhase === 'scanning' || currentPhase === 'placed') {
          const hts = hitTestSourceRef.current;
          if (hts) {
            const results = frame.getHitTestResults(hts);

            if (results.length > 0 && ret) {
              const hit = results[0];
              const pose = hit.getPose(localSpaceRef.current);

              if (pose) {
                lastHitTime.current = now;
                consecutiveHits.current++;
                surfaceConfidence.current = Math.min(1, consecutiveHits.current / 15);

                // Extract position + rotation from hit pose
                const m4 = new THREE.Matrix4().fromArray(pose.transform.matrix);
                const rawPos = new THREE.Vector3();
                const rawQuat = new THREE.Quaternion();
                const rawScale = new THREE.Vector3();
                m4.decompose(rawPos, rawQuat, rawScale);

                // ── Outlier rejection: median filter on rolling buffer ──
                const posBuf = hitPosBuffer.current;
                const quatBuf = hitQuatBuffer.current;
                posBuf.push(rawPos.clone());
                quatBuf.push(rawQuat.clone());
                if (posBuf.length > HIT_BUFFER_SIZE) posBuf.shift();
                if (quatBuf.length > HIT_BUFFER_SIZE) quatBuf.shift();

                let filteredPos = rawPos;
                let filteredQuat = rawQuat;

                if (posBuf.length >= 3) {
                  // Median of each axis independently (rejects single-frame spikes)
                  const medX = median(posBuf.map(p => p.x));
                  const medY = median(posBuf.map(p => p.y));
                  const medZ = median(posBuf.map(p => p.z));
                  filteredPos = new THREE.Vector3(medX, medY, medZ);

                  // For quaternion: use the buffer entry closest to the median position
                  // (pure median of quaternion components isn't valid)
                  let bestIdx = 0;
                  let bestDist = Infinity;
                  for (let i = 0; i < posBuf.length; i++) {
                    const d = posBuf[i].distanceToSquared(filteredPos);
                    if (d < bestDist) { bestDist = d; bestIdx = i; }
                  }
                  filteredQuat = quatBuf[bestIdx];
                }

                reticlePosTarget.current.copy(filteredPos);
                reticleQuatTarget.current.copy(filteredQuat);

                // First hit: snap immediately
                if (!reticleHasFirstPose.current) {
                  reticlePosSmoothed.current.copy(filteredPos);
                  reticleQuatSmoothed.current.copy(filteredQuat);
                  reticleHasFirstPose.current = true;
                } else {
                  // Frame-rate independent lerp
                  reticlePosSmoothed.current.lerp(reticlePosTarget.current, lerpAlpha);
                  reticleQuatSmoothed.current.slerp(reticleQuatTarget.current, lerpAlpha);
                }

                // Apply smoothed transform
                ret.position.copy(reticlePosSmoothed.current);
                ret.quaternion.copy(reticleQuatSmoothed.current);

                // Show reticle
                if (currentPhase === 'scanning') {
                  ret.visible = true;
                } else if (currentPhase === 'placed') {
                  ret.visible = true;
                  ret.children.forEach(c => {
                    if (c.material) c.material.opacity = 0.3;
                  });
                }

                // Surface type detection from normal
                const up = new THREE.Vector3(0, 1, 0).applyQuaternion(filteredQuat);
                if (Math.abs(up.y) > 0.7) {
                  setSurfaceInfo(up.y > 0 ? 'Floor detected — tap to place' : 'Ceiling detected — tap to place');
                } else {
                  setSurfaceInfo('Wall detected — tap to place');
                }

                setTrackingStatus('good');
              }
            } else if (ret) {
              consecutiveHits.current = 0;
              surfaceConfidence.current = 0;

              // Don't hide reticle immediately — 300ms grace period
              if (now - lastHitTime.current > 300) {
                if (currentPhase === 'scanning') {
                  ret.visible = false;
                }
                setSurfaceInfo('Scanning for surfaces...');
              }

              if (now - lastHitTime.current > 3000) {
                setTrackingStatus('limited');
              }
            }
          }
        }

        // ── Pulsing reticle animation (scale by confidence) ──
        if (ret && ret.visible && currentPhase === 'scanning') {
          const t = now * 0.003;
          const confidence = surfaceConfidence.current;
          const baseScale = 0.8 + confidence * 0.2;
          const pulse = baseScale + 0.15 * Math.sin(t);
          ret.scale.set(pulse, pulse, pulse);
          ret.children.forEach(c => {
            if (c.material && c.material.opacity !== undefined) {
              if (c === ret.children[1]) c.material.opacity = 0.4;
              else c.material.opacity = 1;
            }
          });
        }

        // ── Apply live adjustments to placed model ──
        if (currentPhase === 'placed' && mg) {
          const s = scaleRef.current;
          mg.scale.set(s, s, s);
          mg.rotation.y = (rotationRef.current * Math.PI) / 180;
          mg.position.y = placedPosRef.current.y + heightRef.current;

          if (shadowPlaneRef.current) {
            shadowPlaneRef.current.position.y = placedPosRef.current.y;
          }
        }

        renderer.render(scene, camera);
      });
    } catch (err) {
      console.error('AR session error:', err);
      if (err.message && err.message.includes('user activation')) {
        setError('Please tap the "Enter AR" button to start.');
        updatePhase('ready');
      } else {
        setError(err.message || 'Failed to start AR session.');
      }
    }
  }, [onClose, updatePhase]);

  // ── Place (or reposition) model at current reticle position ──
  const placeModelAtReticle = useCallback((xrFrame) => {
    const mg = modelGroupRef.current;
    const ret = reticleRef.current;
    if (!mg || !ret) return;

    const pos = reticlePosSmoothed.current.clone();
    placedPosRef.current.copy(pos);

    mg.position.copy(pos);
    mg.visible = true;

    // Shadow plane
    if (shadowPlaneRef.current) {
      shadowPlaneRef.current.position.set(pos.x, pos.y, pos.z);
      shadowPlaneRef.current.visible = true;
    }

    // Light target
    if (dirLightRef.current) {
      dirLightRef.current.target = mg;
    }

    // Reset reticle opacity for placed mode
    ret.children.forEach(c => {
      if (c.material) c.material.opacity = 0.3;
    });

    // ── Create XR anchor for drift-proof placement ──
    if (anchorRef.current) {
      try { anchorRef.current.delete(); } catch {}
      anchorRef.current = null;
    }

    if (xrFrame && xrFrame.createAnchor && localSpaceRef.current) {
      try {
        const anchorPose = new XRRigidTransform(
          { x: pos.x, y: pos.y, z: pos.z, w: 1 },
          { x: reticleQuatSmoothed.current.x, y: reticleQuatSmoothed.current.y, z: reticleQuatSmoothed.current.z, w: reticleQuatSmoothed.current.w }
        );
        xrFrame.createAnchor(anchorPose, localSpaceRef.current).then(anchor => {
          anchorRef.current = anchor;
        }).catch(() => {
          // Anchors not supported — model works fine, just no drift correction
        });
      } catch {
        // Anchors not available — graceful degradation
      }
    }

    // Clear hit buffer for fresh data if user repositions
    hitPosBuffer.current = [];
    hitQuatBuffer.current = [];

    updatePhase('placed');
  }, [updatePhase]);

  // ── Exit ──
  const exitAR = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.end().catch(() => {});
    } else {
      onClose();
    }
  }, [onClose]);

  return (
    <div className="car-container" ref={containerRef}>
      <div className="car-overlay" ref={overlayRef}>
        {/* Exit button */}
        <button className="car-exit" onClick={exitAR}>✕</button>

        {/* Tracking indicator */}
        {(phase === 'scanning' || phase === 'placed') && trackingStatus !== 'good' && (
          <div className={`car-tracking car-tracking-${trackingStatus}`}>
            {trackingStatus === 'limited' && '⚠ Limited tracking — move slowly'}
            {trackingStatus === 'lost' && '✕ Tracking lost — return to the area'}
          </div>
        )}

        {/* ── LOADING: Model loading ── */}
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

        {/* ── READY: Model loaded — user must tap to start AR ── */}
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

        {/* ── SCANNING: Surface detection HUD ── */}
        {phase === 'scanning' && (
          <div className="car-scan-hud">
            <div className="car-scan-pill">
              <div className="car-pulse-dot" />
              <span>{surfaceInfo || 'Scanning...'}</span>
            </div>
            <p className="car-scan-hint">
              Point your camera at a flat surface.
              <br />
              Tap the green circle to place the model.
            </p>
          </div>
        )}

        {/* ── PLACED: Adjustment controls ── */}
        {phase === 'placed' && (
          <div className="car-controls">
            <div className="car-badge">✓ Placed — tap surface to reposition</div>

            <div className="car-panel">
              {/* Height */}
              <div className="car-row">
                <span className="car-label">Height</span>
                <button className="car-btn" onClick={() => setArHeight((h) => +(h - 0.1).toFixed(1))}>−</button>
                <input
                  type="range"
                  min={isCeiling ? 0 : -2}
                  max={isCeiling ? 4 : 2}
                  step="0.05"
                  value={arHeight}
                  onChange={(e) => setArHeight(parseFloat(e.target.value))}
                />
                <button className="car-btn" onClick={() => setArHeight((h) => +(h + 0.1).toFixed(1))}>+</button>
                <span className="car-val">{arHeight.toFixed(1)}m</span>
              </div>

              {/* Scale */}
              <div className="car-row">
                <span className="car-label">Scale</span>
                <button className="car-btn" onClick={() => setArScale((s) => Math.max(0.1, +(s - 0.1).toFixed(1)))}>−</button>
                <input
                  type="range" min="0.1" max="3" step="0.05"
                  value={arScale}
                  onChange={(e) => setArScale(parseFloat(e.target.value))}
                />
                <button className="car-btn" onClick={() => setArScale((s) => Math.min(3, +(s + 0.1).toFixed(1)))}>+</button>
                <span className="car-val">{arScale.toFixed(1)}x</span>
              </div>

              {/* Rotation */}
              <div className="car-row">
                <span className="car-label">Rotate</span>
                <button className="car-btn" onClick={() => setArRotation((r) => r - 15)}>↺</button>
                <input
                  type="range" min="0" max="360" step="5"
                  value={arRotation % 360}
                  onChange={(e) => setArRotation(parseInt(e.target.value))}
                />
                <button className="car-btn" onClick={() => setArRotation((r) => r + 15)}>↻</button>
                <span className="car-val">{arRotation % 360}°</span>
              </div>

              {/* Quick actions */}
              <div className="car-actions">
                <button onClick={() => { setArScale(1); setArRotation(0); setArHeight(0); }}>Reset</button>
                {isCeiling && (
                  <>
                    <button onClick={() => setArHeight(2.4)}>2.4m</button>
                    <button onClick={() => setArHeight(2.7)}>2.7m</button>
                    <button onClick={() => setArHeight(3.0)}>3.0m</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
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
