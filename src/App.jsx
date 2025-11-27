import { useState } from 'react'
import ModelUploader from './components/ModelUploader'
import ModelGallery from './components/ModelGallery'
import ARViewer from './components/ARViewer'
import './App.css'

function App() {
  const [modelSrc, setModelSrc] = useState(null)
  const [showControls, setShowControls] = useState(true)
  const [modelLibrary, setModelLibrary] = useState([])

  const handleModelLoad = (url, name = 'Model') => {
    const newModel = {
      id: Date.now(),
      url,
      name,
      timestamp: new Date().toISOString()
    }
    setModelLibrary(prev => [...prev, newModel])  
    setModelSrc(url)
  }

  const handleSelectModel = (model) => {
    setModelSrc(model.url)
  }

  const handleDeleteModel = (id) => {
    setModelLibrary(prev => prev.filter(m => m.id !== id))
    if (modelLibrary.find(m => m.id === id)?.url === modelSrc) {
      const remaining = modelLibrary.filter(m => m.id !== id)
      setModelSrc(remaining.length > 0 ? remaining[0].url : null)
    }
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
          ARise
        </h1>
        <p className="subtitle">Universal Web-Based AR Viewer for iOS & Android</p>
      </header>

      <main className="app-main">
        <div className="app-container">
          {!modelSrc ? (
            <>
              <ModelUploader onModelLoad={handleModelLoad} />
              <ModelGallery onSelect={handleModelLoad} />
            </>
          ) : (
            <div className="viewer-section">
              <div className="viewer-header">
                <button 
                  onClick={() => setModelSrc(null)} 
                  className="back-btn"
                >
                  ← Load Different Model
                </button>
                <div className="viewer-header-controls">
                  <label className="toggle-controls">
                    <input
                      type="checkbox"
                      checked={showControls}
                      onChange={(e) => setShowControls(e.target.checked)}
                    />
                    Show Controls
                  </label>
                </div>
              </div>
              
              {/* Model Library */}
              {modelLibrary.length > 1 && (
                <div className="model-library">
                  <h3>Loaded Models ({modelLibrary.length})</h3>
                  <div className="model-list">
                    {modelLibrary.map(model => (
                      <div 
                        key={model.id} 
                        className={`model-item ${model.url === modelSrc ? 'active' : ''}`}
                        onClick={() => handleSelectModel(model)}
                      >
                        <div className="model-item-info">
                          <span className="model-name">{model.name}</span>
                          <span className="model-time">
                            {new Date(model.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <button 
                          className="delete-model-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteModel(model.id)
                          }}
                          aria-label="Delete model"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
