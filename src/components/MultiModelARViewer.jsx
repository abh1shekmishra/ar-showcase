import { useState, Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { XR, createXRStore, useXR } from '@react-three/xr';
import { useGLTF, OrbitControls } from '@react-three/drei'; 
import './MultiModelARViewer.css';

// Create XR store outside component
const store = createXRStore();

// Interactive model component
function Model({ url, position = [0, 0, 0], scale = 1, id }) {
  const gltf = useGLTF(url);
  const meshRef = useRef();
  const [isSelected, setIsSelected] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(position);
  const [currentScale, setCurrentScale] = useState(scale);
  const [currentRotation, setCurrentRotation] = useState([0, 0, 0]);
  
  // Clone the scene to avoid sharing materials
  const clonedScene = useRef(gltf.scene.clone()).current;
  
  // Handle pointer events for selection
  const handlePointerDown = (e) => {
    e.stopPropagation();
    setIsSelected(prev => !prev);
  };
  
  return (
    <group 
      ref={meshRef}
      position={currentPosition}
      scale={currentScale}
      rotation={currentRotation}
      onPointerDown={handlePointerDown}
    >
      <primitive object={clonedScene}>
        {/* Add outline when selected */}
        {isSelected && (
          <meshBasicMaterial 
            attach="material" 
            color="#00ff00" 
            transparent 
            opacity={0.2}
          />
        )}
      </primitive>
    </group>
  );
}

// Scene with all loaded models
function ModelScene({ models }) {
  const { isPresenting } = useXR();
  
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <hemisphereLight intensity={0.5} />
      
      {models.map((model, index) => {
        const offset = index * 0.8;
        return (
          <Suspense key={model.id} fallback={null}>
            <Model 
              id={model.id}
              url={model.url} 
              position={[offset - (models.length - 1) * 0.4, 0, -1.5]}
              scale={0.3}
            />
          </Suspense>
        );
      })}
      
      {!isPresenting && (
        <OrbitControls 
          enableDamping
          dampingFactor={0.05}
          minDistance={2}
          maxDistance={20}
        />
      )}
    </>
  );
}

const MultiModelARViewer = ({ models, showControls }) => {
  const [error, setError] = useState(null);
  const [isARSupported, setIsARSupported] = useState(false);

  useEffect(() => {
    // Check WebXR support on mount
    if ('xr' in navigator && navigator.xr) {
      navigator.xr.isSessionSupported('immersive-ar')
        .then(supported => {
          setIsARSupported(supported);
          console.log('WebXR AR supported:', supported);
        })
        .catch(err => {
          console.warn('WebXR check failed:', err);
          setIsARSupported(false);
        });
    }
  }, []);

  const handleARError = (err) => {
    console.error('Canvas Error:', err);
    setError('Error loading 3D viewer. Please refresh the page.');
  };

  const enterAR = async () => {
    try {
      await store.enterAR();
    } catch (err) {
      console.error('Failed to enter AR:', err);
      setError('Could not start AR. Make sure you\'re on Chrome Android with WebXR enabled.');
    }
  };

  if (models.length === 0) {
    return (
      <div className="multi-ar-viewer-empty">
        <div className="empty-state">
          <svg 
            width="120" 
            height="120" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <h3>No Models Loaded</h3>
          <p>Load multiple models to view them together in AR</p>
        </div>
      </div>
    );
  }

  return (
    <div className="multi-ar-viewer-container">
      {/* AR Button */}
      <button 
        className="ar-button multi-ar-button"
        onClick={enterAR}
        disabled={!isARSupported}
        style={{
          opacity: isARSupported ? 1 : 0.5,
          cursor: isARSupported ? 'pointer' : 'not-allowed'
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
        </svg>
        {isARSupported ? `View ${models.length} Models in AR` : 'AR Not Supported'}
      </button>

      <Canvas
        camera={{ position: [0, 2, 8], fov: 50 }}
        style={{ width: '100%', height: '100%', background: '#1a1a1a' }}
        onCreated={() => console.log('✅ Multi-model viewer ready')}
        onError={handleARError}
      >
        <XR store={store}>
          <ModelScene models={models} />
        </XR>
      </Canvas>

      {/* Error Message */}
      {error && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ff4444',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          maxWidth: '90%',
          textAlign: 'center'
        }}>
          {error}
          <button 
            onClick={() => setError(null)}
            style={{
              marginLeft: '10px',
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >✕</button>
        </div>
      )}

      {/* Info Text */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'white',
        background: 'rgba(0,0,0,0.7)',
        padding: '12px 20px',
        borderRadius: '8px',
        fontSize: '14px',
        textAlign: 'center',
        maxWidth: '90%'
      }}>
        <strong>Multi-Model {isARSupported ? 'AR' : '3D'} Viewer</strong> - {models.length} models loaded
        <br/>
        <small>
          {isARSupported 
            ? 'Desktop: Drag to rotate • Scroll to zoom | Mobile: Tap button to enter AR'
            : 'Drag to rotate • Scroll to zoom • AR requires Chrome Android'
          }
        </small>
      </div>

      {/* Error Toast */}
      {error && (
        <div className="error-toast">
          <span>⚠️</span>
          <p>{error}</p>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Info Panel */}
      <div className="multi-ar-info">
        <h4>Multi-Model AR (Experimental)</h4>
        <ul>
          <li><strong>Requirements:</strong> Chrome on Android with WebXR support</li>
          <li><strong>Models loaded:</strong> {models.length}</li>
          <li><strong>Preview:</strong> Drag to rotate, scroll to zoom</li>
          <li><strong>AR Mode:</strong> Models will appear side-by-side</li>
        </ul>
        <p className="ar-warning">
          ⚠️ This feature is experimental. For best compatibility, use the standard AR viewer for single models.
        </p>
      </div>

      {/* Instructions */}
      <div className="instructions multi-ar-instructions">
        <h4>How to use Multi-Model AR:</h4>
        <ul>
          <li><strong>Desktop:</strong> Preview models in 3D - drag to rotate</li>
          <li><strong>Chrome Android:</strong> Tap "View All in AR" to see models together</li>
          <li><strong>In AR:</strong> Models appear in a row - walk around to view them</li>
          <li><strong>Tip:</strong> Load 2-4 small models for best performance</li>
        </ul>
      </div>
    </div>
  );
};

export default MultiModelARViewer;
