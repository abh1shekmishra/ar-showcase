import { useState, useRef } from 'react';
import './ModelUploader.css';

const ModelUploader = ({ onModelLoad }) => {
  const [modelUrl, setModelUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = (file) => {
    if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      // Check file size (warn if > 50MB)
      const fileSizeMB = file.size / (1024 * 1024);
      console.log(`📦 Model size: ${fileSizeMB.toFixed(2)}MB`);
      console.log(`📦 Model name: ${file.name}`);
      console.log(`📦 Model type: ${file.type}`);
      
      if (fileSizeMB > 50) {
        alert(`⚠️ Warning: Large file (${fileSizeMB.toFixed(1)}MB). AR may not work on mobile devices. Recommended: < 10MB`);
      } else if (fileSizeMB > 10) {
        console.warn(`⚠️ File size ${fileSizeMB.toFixed(1)}MB may cause issues on some devices`);
      }
      
      // Create blob URL with proper MIME type
      const blob = new Blob([file], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      setModelUrl(url);
      onModelLoad(url);
      console.log('✅ Model file loaded:', file.name);
      console.log('✅ Blob URL:', url);
    } else {
      alert('Please upload a valid GLB or GLTF file');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (urlInput.trim()) {
      console.log('🔗 Loading model from URL:', urlInput);
      
      // Basic URL validation
      try {
        new URL(urlInput);
        setModelUrl(urlInput);
        onModelLoad(urlInput);
      } catch (err) {
        alert('Invalid URL. Please enter a valid URL to a GLB or GLTF file.');
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const loadSampleModel = () => {
    // Using a smaller, more reliable sample model
    const sampleUrl = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb';
    setModelUrl(sampleUrl);
    onModelLoad(sampleUrl);
    console.log('Loading sample model:', sampleUrl);
  };

  return (
    <div className="model-uploader">
      <h2>Load 3D Model</h2>
      
      <div 
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <svg 
          width="64" 
          height="64" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p>Drag & Drop 3D Model Here</p>
        <p className="file-types">or click to browse (GLB, GLTF)</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div className="divider">
        <span>OR</span>
      </div>

      <form onSubmit={handleUrlSubmit} className="url-form">
        <input
          type="text"
          placeholder="Enter model URL (GLB/GLTF)"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          className="url-input"
        />
        <button type="submit" className="load-url-btn">
          Load URL
        </button>
      </form>

      <div className="divider">
        <span>OR</span>
      </div>

      <button onClick={loadSampleModel} className="sample-btn">
        Load Sample Model
      </button>

      {modelUrl && (
        <div className="current-model">
          <p>✓ Model loaded successfully</p>
        </div>
      )}
    </div>
  );
};

export default ModelUploader;
