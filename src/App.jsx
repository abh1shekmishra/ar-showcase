import { useState } from 'react'
import ModelUploader from './components/ModelUploader'
import ARViewer from './components/ARViewer'
import './App.css'

function App() {
  const [modelSrc, setModelSrc] = useState(null)
  const [showControls, setShowControls] = useState(true)

  const handleModelLoad = (url) => {
    setModelSrc(url)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          AR Showcase
        </h1>
        <p className="subtitle">Universal Web-Based AR Viewer for iOS & Android</p>
      </header>

      <main className="app-main">
        <div className="app-container">
          {!modelSrc ? (
            <ModelUploader onModelLoad={handleModelLoad} />
          ) : (
            <div className="viewer-section">
              <div className="viewer-header">
                <button 
                  onClick={() => setModelSrc(null)} 
                  className="back-btn"
                >
                  ← Load Different Model
                </button>
                <label className="toggle-controls">
                  <input
                    type="checkbox"
                    checked={showControls}
                    onChange={(e) => setShowControls(e.target.checked)}
                  />
                  Show Controls
                </label>
              </div>
              <ARViewer 
                modelSrc={modelSrc} 
                showControls={showControls}
                onToggleControls={() => setShowControls(!showControls)}
              />
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>
          Supports GLB & GLTF formats • Works on iOS (AR Quick Look) & Android (Scene Viewer)
        </p>
      </footer>
    </div>
  )
}

export default App
