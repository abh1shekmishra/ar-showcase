import { useState, useRef } from 'react';
import JSZip from 'jszip';
import './ModelUploader.css';

const ModelUploader = ({ onModelLoad }) => {
  const [modelUrl, setModelUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef(null);

  const extractZip = async (file) => {
    setIsExtracting(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const files = Object.keys(zip.files);

      const glbFile = files.find(f => f.toLowerCase().endsWith('.glb'));
      const gltfFile = files.find(f => f.toLowerCase().endsWith('.gltf'));
      const targetFile = glbFile || gltfFile;

      if (!targetFile) {
        alert('No GLB or glTF file found inside the .zip archive.');
        setIsExtracting(false);
        return;
      }

      if (glbFile) {
        const data = await zip.file(glbFile).async('blob');
        const blob = new Blob([data], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        setModelUrl(url);
        onModelLoad(url, glbFile.split('/').pop());
        console.log('✅ Extracted GLB from zip:', glbFile);
      } else {
        const gltfContent = await zip.file(gltfFile).async('string');
        const gltfDir = gltfFile.includes('/') ? gltfFile.substring(0, gltfFile.lastIndexOf('/') + 1) : '';

        let gltfJson;
        try {
          gltfJson = JSON.parse(gltfContent);
        } catch {
          alert('Failed to parse glTF file inside the zip.');
          setIsExtracting(false);
          return;
        }

        const resourceMap = {};
        for (const fileName of files) {
          if (fileName === gltfFile || zip.files[fileName].dir) continue;
          const relativePath = fileName.startsWith(gltfDir) ? fileName.slice(gltfDir.length) : fileName;
          const data = await zip.file(fileName).async('blob');
          resourceMap[relativePath] = URL.createObjectURL(data);
        }

        if (gltfJson.buffers) {
          gltfJson.buffers.forEach(buf => {
            if (buf.uri && resourceMap[buf.uri]) buf.uri = resourceMap[buf.uri];
          });
        }
        if (gltfJson.images) {
          gltfJson.images.forEach(img => {
            if (img.uri && resourceMap[img.uri]) img.uri = resourceMap[img.uri];
          });
        }

        const gltfBlob = new Blob([JSON.stringify(gltfJson)], { type: 'model/gltf+json' });
        const url = URL.createObjectURL(gltfBlob);
        setModelUrl(url);
        onModelLoad(url, gltfFile.split('/').pop());
        console.log('✅ Extracted glTF from zip:', gltfFile);
      }
    } catch (err) {
      console.error('❌ Zip extraction error:', err);
      alert('Failed to extract model from zip. The file may be corrupted.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isGLB = fileName.endsWith('.glb');
    const isGLTF = fileName.endsWith('.gltf');
    const isZIP = fileName.endsWith('.zip');

    if (!isGLB && !isGLTF && !isZIP) {
      alert('Please upload a GLB, GLTF, or ZIP file.\n\nSketchfab downloads come as .zip — just drop the whole zip here.');
      return;
    }

    if (isZIP) {
      await extractZip(file);
      return;
    }

    // Check file size
    const fileSizeMB = file.size / (1024 * 1024);
    console.log(`📦 Model size: ${fileSizeMB.toFixed(2)}MB`);
    console.log(`📦 Model name: ${file.name}`);
    console.log(`📦 Model type: ${file.type}`);
    
    if (fileSizeMB > 50) {
      alert(`⚠️ Warning: Large file (${fileSizeMB.toFixed(1)}MB). AR may not work on mobile devices. Recommended: < 10MB`);
    } else if (fileSizeMB > 10) {
      console.warn(`⚠️ File size ${fileSizeMB.toFixed(1)}MB may cause issues on some devices`);
    }

    try {
      const blob = new Blob([file], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);

      setModelUrl(url);
      onModelLoad(url, file.name);
      console.log('✅ Model file loaded:', file.name);
      console.log('✅ Blob URL:', url);
    } catch (error) {
      console.error('❌ Error loading model:', error);
      alert('Failed to load model. Please try a different file.');
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
        const fileName = urlInput.split('/').pop() || 'URL Model';
        setModelUrl(urlInput);
        onModelLoad(urlInput, fileName);
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

  return (
    <div className="model-uploader">
      <h2>Load 3D Model</h2>
      
      <div 
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${isExtracting ? 'extracting' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isExtracting && fileInputRef.current?.click()}
      >
        {isExtracting ? (
          <>
            <div className="extract-spinner"></div>
            <p>Extracting model from zip...</p>
            <p className="file-types">Finding GLB/glTF files and textures</p>
          </>
        ) : (
          <>
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
            <p className="file-types">GLB, GLTF, or ZIP (Sketchfab downloads)</p>
            <p className="file-types" style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#999' }}>
              Drop a Sketchfab .zip — we'll extract the model automatically
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.zip"
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

      {modelUrl && (
        <div className="current-model">
          <p>✓ Model loaded successfully</p>
        </div>
      )}
    </div>
  );
};

export default ModelUploader;
