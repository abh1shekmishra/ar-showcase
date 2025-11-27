import { useEffect, useRef, useState } from 'react';
import '@google/model-viewer';
import './ARViewer.css';

const ARViewer = ({ modelSrc, showControls, onToggleControls }) => {
  const modelViewerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [rotationY, setRotationY] = useState(0);
  const [isARSupported, setIsARSupported] = useState(true);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [debugMessages, setDebugMessages] = useState([]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showInstructions, setShowInstructions] = useState(true);
  const [isInAR, setIsInAR] = useState(false);
  const [environment, setEnvironment] = useState('neutral');
  const [exposure, setExposure] = useState(1);
  const [skyboxImage, setSkyboxImage] = useState('');

  const environments = [
    { value: 'neutral', label: '⬜ Blank', exposure: 1, skybox: '' },
    { value: 'legacy', label: '☀️ Outdoor', exposure: 1.2, skybox: 'https://modelviewer.dev/shared-assets/environments/aircraft_workshop_01_1k.hdr' },
    { value: 'neutral', label: '🌅 Sunset', exposure: 0.9, skybox: 'https://modelviewer.dev/shared-assets/environments/spruit_sunrise_1k_HDR.hdr' },
    { value: 'legacy', label: '🌃 Night', exposure: 0.6, skybox: 'https://modelviewer.dev/shared-assets/environments/moon_1k.hdr' },
    { value: 'neutral', label: '🏭 Studio', exposure: 1.1, skybox: 'https://modelviewer.dev/shared-assets/environments/pillars_1k.hdr' },
  ];

  const handleEnvironmentChange = (env) => {
    setEnvironment(env.value);
    setExposure(env.exposure);
    setSkyboxImage(env.skybox);
  };

  const addDebugMessage = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const newMessage = { id: Date.now(), message, type, timestamp };
    setDebugMessages(prev => [...prev.slice(-4), newMessage]); // Keep last 5 messages
    
    // Auto-remove after 5 seconds for info messages
    if (type === 'info') {
      setTimeout(() => {
        setDebugMessages(prev => prev.filter(m => m.id !== newMessage.id));
      }, 5000);
    }
  };

  useEffect(() => {
    const modelViewer = modelViewerRef.current;
    
    if (modelViewer) {
      // Reset states on new model
      setModelLoaded(false);
      setError(null);
      setModelInfo(null);
      setLoadingProgress(0);
      setDebugMessages([]);
      
      // Detect device and browser
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isChrome = /CriOS/.test(navigator.userAgent);
      const isFirefox = /FxiOS/.test(navigator.userAgent);
      const isEdge = /EdgiOS/.test(navigator.userAgent);
      const userAgent = navigator.userAgent;
      
      // Safari detection: iOS device + NOT Chrome/Firefox/Edge
      const isSafari = isIOS && !isChrome && !isFirefox && !isEdge;
      
      let browserName = 'Unknown';
      if (isSafari) {
        browserName = 'Safari ✅';
      } else if (isChrome) {
        browserName = 'Chrome (AR not supported)';
      } else if (isFirefox) {
        browserName = 'Firefox (AR not supported)';
      } else if (isEdge) {
        browserName = 'Edge (AR not supported)';
      } else {
        browserName = 'Other';
      }
      
      addDebugMessage(`Device: ${isIOS ? 'iOS' : 'Android/Desktop'}`, 'info');
      addDebugMessage(`Browser: ${browserName}`, isSafari ? 'success' : 'warning');
      addDebugMessage(`UA: ${userAgent.substring(0, 50)}...`, 'info');
      
      if (isIOS && !isSafari) {
        addDebugMessage('🚨 MUST use Safari for iOS AR!', 'error');
        addDebugMessage('Copy URL and open in Safari app', 'warning');
      }
      
      addDebugMessage('Starting to load model...', 'info');
      
      console.log('User Agent:', userAgent);
      console.log('Model Source:', modelSrc);

      // Check AR support
      const checkARSupport = async () => {
        try {
          const arSupported = await modelViewer.canActivateAR;
          setIsARSupported(arSupported);
          console.log('AR Supported:', arSupported);
          console.log('Is Safari:', isSafari);
          console.log('User Agent:', userAgent);
          
          if (!arSupported && isIOS && !isSafari) {
            addDebugMessage('⚠️ iOS AR requires Safari browser', 'warning');
          } else if (!arSupported && isIOS && isSafari) {
            addDebugMessage('⚠️ AR Quick Look is DISABLED', 'error');
            addDebugMessage('📱 Fix: Settings > Safari > Advanced', 'warning');
            addDebugMessage('Enable "AR Quick Look for Websites"', 'warning');
            addDebugMessage('Then restart Safari and reload', 'info');
          } else {
            addDebugMessage(`AR Support: ${arSupported ? '✅ Yes' : '❌ No'}`, arSupported ? 'success' : 'warning');
          }
        } catch (err) {
          console.error('AR check error:', err);
          addDebugMessage(`❌ AR check failed: ${err.message}`, 'error');
        }
      };
      
      checkARSupport();

      // Model load event
      const handleLoad = () => {
        setModelLoaded(true);
        setError(null);
        setLoadingProgress(100);
        console.log('✅ Model loaded successfully');
        addDebugMessage('✅ Model loaded successfully!', 'success');
        
        // Get model info
        const model = modelViewer.model;
        if (model) {
          const info = {
            size: model.size,
            hasAnimations: modelViewer.availableAnimations?.length > 0
          };
          setModelInfo(info);
          addDebugMessage(`Animations: ${info.hasAnimations ? 'Yes' : 'None'}`, 'info');
        }

        // Hide model info after 5 seconds
        setTimeout(() => {
          setModelInfo(null);
        }, 5000);
      };

      // Error event
      const handleError = (event) => {
        console.error('❌ Model error:', event);
        console.error('Error detail:', event.detail);
        console.error('Model source:', modelSrc);
        
        let errorMsg = 'Failed to load model';
        let debugInfo = [];
        
        if (event.detail?.type === 'loadfailed') {
          errorMsg = 'Model load failed';
          debugInfo.push('File format issue or corruption');
          
          // Check if it's a blob URL (uploaded file)
          if (modelSrc.startsWith('blob:')) {
            debugInfo.push('Uploaded file - may be corrupted');
            debugInfo.push('Try: Re-upload or use different file');
          }
          
          // Check for iOS network issues
          if (isIOS && modelSrc.startsWith('http')) {
            debugInfo.push('iOS: External URL blocked by network');
            debugInfo.push('Try: Upload file directly from device');
          }
        } else if (event.detail?.message) {
          errorMsg = event.detail.message;
        }
        
        // Check if it's a CORS issue
        if (modelSrc && modelSrc.startsWith('http') && !modelSrc.startsWith('https://raw.githubusercontent.com') && !modelSrc.startsWith('blob:')) {
          debugInfo.push('⚠️ External URL - might need CORS');
        }
        
        // iOS-specific checks
        if (isIOS && isSafari) {
          debugInfo.push('iOS Safari: Try uploading from Files app');
        } else if (isIOS && !isSafari) {
          debugInfo.push('🚨 Must use Safari browser on iOS!');
        }
        
        setError(errorMsg);
        setModelLoaded(false);
        addDebugMessage(`❌ Error: ${errorMsg}`, 'error');
        debugInfo.forEach(info => addDebugMessage(info, 'warning'));
        
        // Add recommendation to try upload instead
        setTimeout(() => {
          addDebugMessage('💡 Try: Upload a GLB file from your device', 'info');
        }, 1000);
      };

      // Progress event
      const handleProgress = (event) => {
        const progress = event.detail.totalProgress;
        const percent = Math.round(progress * 100);
        setLoadingProgress(percent);
        console.log(`Loading: ${percent}%`);
        
        if (percent % 25 === 0 && percent > 0 && percent < 100) {
          addDebugMessage(`Loading: ${percent}%`, 'info');
        }
      };

      // AR status events
      const handleARStatus = (event) => {
        const status = event.detail.status;
        console.log('AR Status:', status);
        
        if (status === 'session-started') {
          addDebugMessage('🎯 AR session started!', 'success');
          setIsInAR(true);
        } else if (status === 'not-presenting') {
          addDebugMessage('AR session ended', 'info');
          setIsInAR(false);
        } else if (status === 'failed') {
          const errorMsg = 'AR failed. Model may be too large or incompatible.';
          setError(errorMsg);
          addDebugMessage(`❌ ${errorMsg}`, 'error');
          setIsInAR(false);
          
          if (isIOS) {
            addDebugMessage('iOS: Try smaller model (<10MB)', 'warning');
          }
        }
      };

      modelViewer.addEventListener('load', handleLoad);
      modelViewer.addEventListener('error', handleError);
      modelViewer.addEventListener('progress', handleProgress);
      modelViewer.addEventListener('ar-status', handleARStatus);

      return () => {
        modelViewer.removeEventListener('load', handleLoad);
        modelViewer.removeEventListener('error', handleError);
        modelViewer.removeEventListener('progress', handleProgress);
        modelViewer.removeEventListener('ar-status', handleARStatus);
      };
    }
  }, [modelSrc]);

  // Update scale
  useEffect(() => {
    const modelViewer = modelViewerRef.current;
    if (modelViewer && modelLoaded) {
      modelViewer.scale = `${scale} ${scale} ${scale}`;
    }
  }, [scale, modelLoaded]);

  // Update rotation
  useEffect(() => {
    const modelViewer = modelViewerRef.current;
    if (modelViewer && modelLoaded) {
      modelViewer.orientation = `0deg ${rotationY}deg 0deg`;
    }
  }, [rotationY, modelLoaded]);

  const handleScaleChange = (newScale) => {
    setScale(Math.max(0.1, Math.min(5, newScale)));
  };

  const handleRotationChange = (newRotation) => {
    setRotationY(newRotation);
  };

  const resetView = () => {
    setScale(1);
    setRotationY(0);
    const modelViewer = modelViewerRef.current;
    if (modelViewer) {
      modelViewer.resetTurntableRotation();
    }
  };

  if (!modelSrc) {
    return (
      <div className="ar-viewer-empty">
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
          <h3>No Model Loaded</h3>
          <p>Upload or select a 3D model to view it in AR</p>
          
          {/* iOS Browser Warning */}
          {/iPad|iPhone|iPod/.test(navigator.userAgent) && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent) && (
            <div className="ios-warning">
              <p>⚠️ <strong>iOS Users:</strong> You must use Safari browser for AR features.</p>
              <p>Copy this URL and open in Safari app.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ar-viewer-container">
      <model-viewer
        ref={modelViewerRef}
        src={modelSrc}
        alt="3D Model"
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-placement="floor wall"
        camera-controls
        touch-action="pan-y"
        shadow-intensity="1"
        exposure={exposure}
        environment-image={environment}
        skybox-image={skyboxImage}
        auto-rotate
        camera-orbit="0deg 75deg 105%"
        min-camera-orbit="auto auto 5%"
        max-camera-orbit="auto auto 500%"
        interpolation-decay="200"
        ar-scale="auto"
        ios-src=""
        xr-environment
        disable-tap
        class="model-viewer"
      >
        {/* AR Button */}
        <button 
          slot="ar-button" 
          className="ar-button"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
          </svg>
          View in AR
        </button>

        {/* AR Prompt - Custom overlay for AR instructions */}
        <div id="ar-prompt" slot="ar-prompt">
          <div className="ar-prompt-content">
            <div className="scanning-indicator">
              <div className="scan-line"></div>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </div>
            <h3>Starting AR...</h3>
            <p>Point your camera at a flat surface</p>
            <p className="ar-tip">The model will appear - tap to place it where you want</p>
            <p className="ar-note">Move slowly for better surface detection</p>
          </div>
        </div>

        {/* Loading Indicator */}
        <div className="loading-indicator" slot="poster">
          <div className="spinner"></div>
          <p>Loading 3D Model...</p>
        </div>

        {/* Error Message */}
        <div className="error-message" slot="error">
          <p>❌ Failed to load model</p>
          <p>Please check:</p>
          <ul>
            <li>File format is GLB or GLTF</li>
            <li>File size is under 50MB</li>
            <li>URL is accessible (if loading from URL)</li>
          </ul>
        </div>
      </model-viewer>

      {/* Error Toast */}
      {error && (
        <div className="error-toast">
          <span>⚠️</span>
          <p>{error}</p>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Model Info */}
      {modelLoaded && modelInfo && (
        <div className="model-info">
          <p>✅ Model loaded</p>
          {modelInfo.hasAnimations && <p>🎬 Has animations</p>}
        </div>
      )}



      {/* Controls Overlay */}
      {showControls && modelLoaded && (
        <div className="controls-overlay">
          <button 
            className="close-controls-btn"
            onClick={onToggleControls}
            aria-label="Close controls"
          >
            ✕
          </button>
          <div className="control-group">
            <label>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"/>
              </svg>
              Scale: {scale.toFixed(2)}x
            </label>
            <div className="slider-container">
              <button 
                onClick={() => handleScaleChange(scale - 0.1)}
                className="slider-btn"
              >
                -
              </button>
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.1"
                value={scale}
                onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                className="slider"
              />
              <button 
                onClick={() => handleScaleChange(scale + 0.1)}
                className="slider-btn"
              >
                +
              </button>
            </div>
          </div>

          <div className="control-group">
            <label>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z"/>
              </svg>
              Rotation: {rotationY}°
            </label>
            <div className="slider-container">
              <button 
                onClick={() => handleRotationChange(rotationY - 15)}
                className="slider-btn"
              >
                ↺
              </button>
              <input
                type="range"
                min="0"
                max="360"
                step="15"
                value={rotationY}
                onChange={(e) => handleRotationChange(parseInt(e.target.value))}
                className="slider"
              />
              <button 
                onClick={() => handleRotationChange(rotationY + 15)}
                className="slider-btn"
              >
                ↻
              </button>
            </div>
          </div>

          <div className="control-group">
            <label>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
              </svg>
              Environment
            </label>
            <div className="environment-selector">
              {environments.map((env, idx) => (
                <button
                  key={`${env.value}-${idx}`}
                  onClick={() => handleEnvironmentChange(env)}
                  className={`env-btn ${environment === env.value && exposure === env.exposure ? 'active' : ''}`}
                  style={{
                    padding: '10px 8px',
                    margin: '4px',
                    background: (environment === env.value && exposure === env.exposure) ? '#ffffff' : 'rgba(255,255,255,0.1)',
                    color: (environment === env.value && exposure === env.exposure) ? '#000' : '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                    flex: '1 1 45%',
                    minWidth: '70px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {env.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={resetView} className="reset-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
            </svg>
            Reset View
          </button>
        </div>
      )}

      {/* Instructions */}
      {showInstructions && (
        <div className="instructions">
          <button 
            className="close-instructions-btn"
            onClick={() => setShowInstructions(false)}
            aria-label="Close instructions"
          >
            ✕
          </button>
          <h4>How to use:</h4>
          <ul>
            <li><strong>Desktop:</strong> Click and drag to rotate • Scroll to zoom • Right-click to pan</li>
            <li><strong>Mobile:</strong> Tap "View in AR" to place model in your space</li>
            <li><strong>AR Controls:</strong></li>
            <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
              <li>1 finger drag = Move model</li>
              <li>2 fingers rotate = Rotate model</li>
              <li>2 fingers pinch = Scale model up/down</li>
            </ul>
            <li><strong>AR Screenshot:</strong></li>
            <ul style={{ marginLeft: '20px', marginTop: '5px' }}>
              <li>Android: Look for camera/share button in Scene Viewer</li>
              <li>iOS: Press Side Button + Volume Up (device screenshot)</li>
            </ul>
          </ul>
        </div>
      )}
    </div>
  );
};

export default ARViewer;
