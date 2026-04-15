import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import './CustomAR.css';

const CustomAR = ({ modelSrc, modelCategory, onClose }) => {
  const containerRef = useRef(null);
  const overlayRef = useRef(null);

  // Refs for render-loop access (state is stale inside animation loop)
  const phaseRef = useRef('init');
  const modelGroupRef = useRef(null);
  const reticleRef = useRef(null);
  const hitTestSourceRef = useRef(null);
  const sessionRef = useRef(null);
  const rendererRef = useRef(null);
  const localSpaceRef = useRef(null);
  const scaleRef = useRef(1);
  const rotationRef = useRef(0);
  const heightRef = useRef(0);
  const placedPosRef = useRef(new THREE.Vector3());
  const shadowPlaneRef = useRef(null);

  // UI state
  const [phase, setPhase] = useState('init');
  const [surfaceInfo, setSurfaceInfo] = useState('');
  const [arScale, setArScale] = useState(1);
  const [arRotation, setArRotation] = useState(0);
  const [arHeight, setArHeight] = useState(0);
  const [error, setError] = useState(null);
  const [loadProgress, setLoadProgress] = useState(0);

  const isCeiling = modelCategory === 'Ceiling Lamps' || modelCategory === 'Chandeliers';

  // Sync state → refs
  useEffect(() => { scaleRef.current = arScale; }, [arScale]);
  useEffect(() => { rotationRef.current = arRotation; }, [arRotation]);
  useEffect(() => { heightRef.current = arHeight; }, [arHeight]);

  const updatePhase = useCallback((p) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      // ── 1. Check WebXR support ──
      if (!navigator.xr) {
        setError('WebXR is not available. Use Chrome on Android.');
        return;
      }

      const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
      if (!isSupported) {
        setError('AR is not supported on this device or browser.');
        return;
      }

      try {
        // ── 2. Three.js renderer ──
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          70, window.innerWidth / window.innerHeight, 0.01, 40
        );

        // ── 3. Lighting ──
        const ambient = new THREE.AmbientLight(0xffffff, 1.8);
        scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(1, 4, 2);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 10;
        dirLight.shadow.bias = -0.001;
        scene.add(dirLight);

        // Shadow-catching plane (invisible, receives shadow only)
        const shadowPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(20, 20),
          new THREE.ShadowMaterial({ opacity: 0.3 })
        );
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.receiveShadow = true;
        shadowPlane.visible = false;
        scene.add(shadowPlane);
        shadowPlaneRef.current = shadowPlane;

        // ── 4. Reticle (green ring on detected surface) ──
        const reticle = new THREE.Group();

        const outerRing = new THREE.Mesh(
          new THREE.RingGeometry(0.09, 0.11, 48),
          new THREE.MeshBasicMaterial({ color: 0x00e676, side: THREE.DoubleSide })
        );
        outerRing.rotation.x = -Math.PI / 2;
        reticle.add(outerRing);

        const innerRing = new THREE.Mesh(
          new THREE.RingGeometry(0.04, 0.05, 48),
          new THREE.MeshBasicMaterial({
            color: 0x00e676,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.4,
          })
        );
        innerRing.rotation.x = -Math.PI / 2;
        reticle.add(innerRing);

        const centerDot = new THREE.Mesh(
          new THREE.CircleGeometry(0.012, 16),
          new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        );
        centerDot.rotation.x = -Math.PI / 2;
        reticle.add(centerDot);

        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        scene.add(reticle);
        reticleRef.current = reticle;

        // ── 5. Load GLB/glTF model ──
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(
          'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'
        );

        const gltfLoader = new GLTFLoader();
        gltfLoader.setDRACOLoader(dracoLoader);

        setLoadProgress(10);

        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.load(
            modelSrc,
            (g) => resolve(g),
            (progress) => {
              if (progress.total > 0) {
                setLoadProgress(
                  10 + Math.round((progress.loaded / progress.total) * 60)
                );
              }
            },
            (err) => reject(err)
          );
        });

        if (cancelled) return;
        setLoadProgress(80);

        const model = gltf.scene;

        // Enable shadows on all meshes
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Center model on its bounding box
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);

        // Put bottom of model at y=0
        model.position.y += size.y / 2;

        // Auto-scale if wildly out of range
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 4) {
          const s = 1.5 / maxDim;
          model.scale.multiplyScalar(s);
        } else if (maxDim < 0.03) {
          const s = 0.3 / maxDim;
          model.scale.multiplyScalar(s);
        }

        // For ceiling fixtures, flip upside down
        if (isCeiling) {
          model.rotation.x = Math.PI;
        }

        const modelGroup = new THREE.Group();
        modelGroup.add(model);
        modelGroup.visible = false;
        scene.add(modelGroup);
        modelGroupRef.current = modelGroup;

        setLoadProgress(90);

        // ── 6. Append canvas to DOM ──
        if (containerRef.current && !cancelled) {
          containerRef.current.appendChild(renderer.domElement);
        }

        // ── 7. Request XR session ──
        const sessionInit = {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay', 'light-estimation'],
        };
        if (overlayRef.current) {
          sessionInit.domOverlay = { root: overlayRef.current };
        }

        const session = await navigator.xr.requestSession(
          'immersive-ar',
          sessionInit
        );
        sessionRef.current = session;

        renderer.xr.setReferenceSpaceType('local');
        await renderer.xr.setSession(session);

        // ── 8. Hit-test source ──
        const viewerSpace = await session.requestReferenceSpace('viewer');
        const localSpace = await session.requestReferenceSpace('local');
        localSpaceRef.current = localSpace;

        const hitTestSource = await session.requestHitTestSource({
          space: viewerSpace,
        });
        hitTestSourceRef.current = hitTestSource;

        setLoadProgress(100);
        updatePhase('scanning');

        // ── 9. Session lifecycle ──
        session.addEventListener('end', () => {
          if (!cancelled) onClose();
        });

        // ── 10. TAP TO PLACE ──
        session.addEventListener('select', () => {
          if (
            phaseRef.current === 'scanning' &&
            reticleRef.current &&
            reticleRef.current.visible
          ) {
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            const sc = new THREE.Vector3();
            reticleRef.current.matrix.decompose(pos, quat, sc);

            placedPosRef.current.copy(pos);

            const mg = modelGroupRef.current;
            mg.position.copy(pos);
            mg.visible = true;

            // Position shadow plane at model base
            shadowPlaneRef.current.position.set(pos.x, pos.y, pos.z);
            shadowPlaneRef.current.visible = true;

            // Move directional light relative to model
            dirLight.position.set(pos.x + 1, pos.y + 4, pos.z + 2);
            dirLight.target = mg;

            reticleRef.current.visible = false;
            updatePhase('placed');
          }
        });

        // ── 11. Render loop ──
        renderer.setAnimationLoop((timestamp, frame) => {
          if (cancelled) return;

          // Pulsing reticle animation
          if (reticleRef.current && reticleRef.current.visible) {
            const t = performance.now() * 0.003;
            const pulse = 0.85 + 0.3 * Math.sin(t);
            reticleRef.current.scale.set(pulse, pulse, pulse);
          }

          // Hit-test during scanning
          if (frame && phaseRef.current === 'scanning') {
            const hts = hitTestSourceRef.current;
            if (hts) {
              const results = frame.getHitTestResults(hts);
              const ret = reticleRef.current;

              if (results.length > 0 && ret) {
                const hit = results[0];
                const pose = hit.getPose(localSpaceRef.current);

                if (pose) {
                  ret.visible = true;
                  ret.matrix.fromArray(pose.transform.matrix);

                  // Determine surface type from pose normal
                  const m4 = new THREE.Matrix4().fromArray(
                    pose.transform.matrix
                  );
                  const up = new THREE.Vector3(0, 1, 0).applyMatrix4(
                    new THREE.Matrix4().extractRotation(m4)
                  );

                  if (Math.abs(up.y) > 0.7) {
                    setSurfaceInfo(
                      up.y > 0
                        ? 'Floor detected — tap to place'
                        : 'Ceiling detected — tap to place'
                    );
                  } else {
                    setSurfaceInfo('Wall detected — tap to place');
                  }
                }
              } else if (ret) {
                ret.visible = false;
                setSurfaceInfo('Scanning for surfaces...');
              }
            }
          }

          // Apply live adjustments to placed model
          if (phaseRef.current === 'placed' && modelGroupRef.current) {
            const s = scaleRef.current;
            modelGroupRef.current.scale.set(s, s, s);
            modelGroupRef.current.rotation.y =
              (rotationRef.current * Math.PI) / 180;

            // Height offset from original placement point
            const baseY = placedPosRef.current.y;
            modelGroupRef.current.position.y = baseY + heightRef.current;
          }

          renderer.render(scene, camera);
        });
      } catch (err) {
        console.error('Custom AR error:', err);
        setError(err.message || 'Failed to start AR.');
      }
    };

    start();

    return () => {
      cancelled = true;
      if (sessionRef.current) {
        sessionRef.current.end().catch(() => {});
      }
      if (rendererRef.current) {
        rendererRef.current.setAnimationLoop(null);
        rendererRef.current.dispose();
      }
    };
  }, [modelSrc, isCeiling, onClose, updatePhase]);

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
        <button className="car-exit" onClick={exitAR}>
          ✕
        </button>

        {/* ── INIT: Loading ── */}
        {phase === 'init' && !error && (
          <div className="car-loading">
            <div className="car-spinner" />
            <p>Loading model & starting AR...</p>
            <div className="car-progress-bar">
              <div
                className="car-progress-fill"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
            <span className="car-progress-pct">{loadProgress}%</span>
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
            <div className="car-badge">✓ Placed — adjust below</div>

            <div className="car-panel">
              {/* Height */}
              <div className="car-row">
                <span className="car-label">Height</span>
                <button
                  className="car-btn"
                  onClick={() =>
                    setArHeight((h) => +(h - 0.1).toFixed(1))
                  }
                >
                  −
                </button>
                <input
                  type="range"
                  min={isCeiling ? 0 : -2}
                  max={isCeiling ? 4 : 2}
                  step="0.05"
                  value={arHeight}
                  onChange={(e) => setArHeight(parseFloat(e.target.value))}
                />
                <button
                  className="car-btn"
                  onClick={() =>
                    setArHeight((h) => +(h + 0.1).toFixed(1))
                  }
                >
                  +
                </button>
                <span className="car-val">{arHeight.toFixed(1)}m</span>
              </div>

              {/* Scale */}
              <div className="car-row">
                <span className="car-label">Scale</span>
                <button
                  className="car-btn"
                  onClick={() =>
                    setArScale((s) => Math.max(0.1, +(s - 0.1).toFixed(1)))
                  }
                >
                  −
                </button>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.05"
                  value={arScale}
                  onChange={(e) => setArScale(parseFloat(e.target.value))}
                />
                <button
                  className="car-btn"
                  onClick={() =>
                    setArScale((s) => Math.min(3, +(s + 0.1).toFixed(1)))
                  }
                >
                  +
                </button>
                <span className="car-val">{arScale.toFixed(1)}x</span>
              </div>

              {/* Rotation */}
              <div className="car-row">
                <span className="car-label">Rotate</span>
                <button
                  className="car-btn"
                  onClick={() => setArRotation((r) => r - 15)}
                >
                  ↺
                </button>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  value={arRotation % 360}
                  onChange={(e) =>
                    setArRotation(parseInt(e.target.value))
                  }
                />
                <button
                  className="car-btn"
                  onClick={() => setArRotation((r) => r + 15)}
                >
                  ↻
                </button>
                <span className="car-val">{arRotation % 360}°</span>
              </div>

              {/* Quick actions */}
              <div className="car-actions">
                <button
                  onClick={() => {
                    setArScale(1);
                    setArRotation(0);
                    setArHeight(0);
                  }}
                >
                  Reset
                </button>
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
