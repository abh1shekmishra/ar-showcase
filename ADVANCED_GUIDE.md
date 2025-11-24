# Advanced Usage Guide

## 🎓 Detailed Feature Documentation

### Model Viewer Configuration

The AR Viewer uses Google's Model Viewer with extensive customization options. Here are the key attributes you can modify:

#### Camera Controls

```jsx
camera-orbit="<horizontal> <vertical> <radius>"
```
- **horizontal**: Rotation around Y-axis (e.g., "0deg")
- **vertical**: Elevation angle (e.g., "75deg")
- **radius**: Distance from model (e.g., "105%" or "2m")

```jsx
min-camera-orbit="auto auto 5%"    // Minimum zoom distance
max-camera-orbit="auto auto 500%"  // Maximum zoom distance
```

#### Lighting & Shadows

```jsx
shadow-intensity="1"        // Shadow darkness (0-1)
exposure="1"                // Overall brightness (0-2)
environment-image="neutral" // HDR lighting environment
```

Available environments:
- `neutral` - Balanced lighting
- `legacy` - Classic look
- Custom HDR file URL

#### Interaction

```jsx
camera-controls              // Enable mouse/touch controls
touch-action="pan-y"        // Allow page scrolling
auto-rotate                 // Automatically spin model
rotation-per-second="30deg" // Auto-rotation speed
interaction-prompt="auto"   // Show interaction hints
```

#### AR Settings

```jsx
ar                                          // Enable AR
ar-modes="webxr scene-viewer quick-look"   // AR platforms
ar-scale="fixed"                           // Scale behavior (fixed/auto)
ar-placement="floor"                       // Placement type (floor/wall)
```

Placement options:
- `floor` - Horizontal surfaces (default)
- `wall` - Vertical surfaces

### Model Optimization Tips

#### File Size Optimization

1. **Use GLB instead of GLTF**
   - GLB is binary and more compact
   - Single file vs. multiple files
   - Faster loading

2. **Compress Textures**
   - Use tools like [glTF-Transform](https://gltf-transform.donmccurdy.com/)
   - Reduce texture resolution
   - Use JPG instead of PNG when possible

3. **Reduce Polygon Count**
   - Decimate meshes in Blender
   - Remove hidden geometry
   - Use LOD (Level of Detail) models

4. **Optimize Materials**
   - Limit number of materials
   - Use texture atlases
   - Remove unnecessary animations

#### Recommended Model Specifications

| Device | Max Polygons | Max Texture Size | Max File Size |
|--------|--------------|------------------|---------------|
| Mobile | 100k         | 2048x2048        | 3 MB          |
| Desktop| 500k         | 4096x4096        | 10 MB         |
| High-end| 1M          | 8192x8192        | 25 MB         |

### Custom Model Loading

#### Loading from Different Sources

**1. Local File System**
```javascript
const handleFileUpload = (file) => {
  const url = URL.createObjectURL(file);
  setModelSrc(url);
};
```

**2. External URL**
```javascript
const url = 'https://example.com/model.glb';
setModelSrc(url);
```

**3. Base64 Encoded**
```javascript
const base64 = 'data:model/gltf-binary;base64,...';
setModelSrc(base64);
```

**4. Cloud Storage (Firebase, AWS S3)**
```javascript
// Firebase Storage example
const storage = firebase.storage();
const url = await storage.ref('models/mymodel.glb').getDownloadURL();
setModelSrc(url);
```

### Advanced AR Features

#### Custom AR Buttons

Replace the default AR button with custom styling:

```jsx
<button slot="ar-button" className="custom-ar-button">
  <img src="/ar-icon.png" alt="AR" />
  Launch AR Experience
</button>
```

#### AR Session Events

Monitor AR state:

```javascript
useEffect(() => {
  const modelViewer = modelViewerRef.current;
  
  modelViewer.addEventListener('ar-status', (event) => {
    if (event.detail.status === 'session-started') {
      console.log('AR session started');
    }
  });
  
  return () => {
    modelViewer.removeEventListener('ar-status');
  };
}, []);
```

#### Programmatic AR Launch

```javascript
const launchAR = async () => {
  const modelViewer = modelViewerRef.current;
  try {
    await modelViewer.activateAR();
  } catch (error) {
    console.error('Failed to launch AR:', error);
  }
};
```

### Animation Control

#### Playing Animations

```javascript
const modelViewer = modelViewerRef.current;

// Get available animations
const animations = modelViewer.availableAnimations;
console.log('Available animations:', animations);

// Play specific animation
modelViewer.animationName = 'Walk';
modelViewer.play();

// Pause animation
modelViewer.pause();

// Set playback speed
modelViewer.timeScale = 0.5; // Half speed
```

#### Animation Loop Control

```jsx
<model-viewer
  animation-name="Walk"
  autoplay
  loop
/>
```

### Material & Texture Manipulation

#### Change Materials Dynamically

```javascript
// Get material
const material = modelViewer.model.materials[0];

// Change color
material.pbrMetallicRoughness.setBaseColorFactor([1, 0, 0, 1]); // Red

// Change metalness
material.pbrMetallicRoughness.setMetallicFactor(0.8);

// Change roughness
material.pbrMetallicRoughness.setRoughnessFactor(0.2);
```

### Environment Customization

#### Custom HDR Environments

```jsx
<model-viewer
  environment-image="/path/to/environment.hdr"
  skybox-image="/path/to/skybox.hdr"
/>
```

Where to get HDR files:
- [Poly Haven](https://polyhaven.com/hdris)
- [HDRI Haven](https://hdrihaven.com/)

### Performance Monitoring

#### Track Loading Performance

```javascript
useEffect(() => {
  const modelViewer = modelViewerRef.current;
  
  const startTime = performance.now();
  
  modelViewer.addEventListener('load', () => {
    const loadTime = performance.now() - startTime;
    console.log(`Model loaded in ${loadTime}ms`);
  });
  
  modelViewer.addEventListener('progress', (event) => {
    const progress = event.detail.totalProgress;
    console.log(`Loading: ${(progress * 100).toFixed(0)}%`);
  });
}, []);
```

### Cross-Platform Considerations

#### iOS Specific

- **USDZ Format**: iOS prefers USDZ for AR Quick Look
- **Convert GLB to USDZ**: Use Reality Converter (macOS only)
- **File Size Limits**: Keep under 50MB for optimal performance
- **Texture Formats**: Use PNG or JPEG

#### Android Specific

- **ARCore Requirements**: Android 7.0+ with ARCore support
- **Scene Viewer**: Handles GLB natively
- **Material Support**: PBR materials work best
- **Lighting**: Uses environmental lighting automatically

### Accessibility Features

#### Add ARIA Labels

```jsx
<model-viewer
  alt="3D model of a chair"
  aria-label="Interactive 3D chair model"
  role="img"
/>
```

#### Keyboard Controls

```jsx
<model-viewer
  keyboard-controls  // Enable keyboard navigation
/>
```

### Error Handling

#### Comprehensive Error Detection

```javascript
useEffect(() => {
  const modelViewer = modelViewerRef.current;
  
  modelViewer.addEventListener('error', (event) => {
    console.error('Model error:', event.detail);
    
    // Show user-friendly message
    if (event.detail.type === 'loadfailed') {
      alert('Failed to load model. Please check the file format.');
    }
  });
  
  modelViewer.addEventListener('ar-tracking-failed', () => {
    console.warn('AR tracking lost');
  });
}, []);
```

### Integration Examples

#### With React Router

```jsx
import { useParams } from 'react-router-dom';

function ModelView() {
  const { modelId } = useParams();
  const [modelSrc, setModelSrc] = useState(null);
  
  useEffect(() => {
    // Fetch model based on ID
    fetchModel(modelId).then(url => setModelSrc(url));
  }, [modelId]);
  
  return <ARViewer modelSrc={modelSrc} />;
}
```

#### With State Management (Redux)

```javascript
import { useSelector, useDispatch } from 'react-redux';

function ARViewerContainer() {
  const modelSrc = useSelector(state => state.models.currentModel);
  const dispatch = useDispatch();
  
  const handleModelLoad = (url) => {
    dispatch({ type: 'SET_MODEL', payload: url });
  };
  
  return <ARViewer modelSrc={modelSrc} />;
}
```

### Security Considerations

#### Content Security Policy

Add to your HTML `<head>`:

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline' https://ajax.googleapis.com; 
               style-src 'self' 'unsafe-inline';
               img-src 'self' data: https:;
               connect-src 'self' https:;">
```

#### Validate File Types

```javascript
const validateModel = (file) => {
  const validTypes = ['model/gltf-binary', 'model/gltf+json'];
  const validExtensions = ['.glb', '.gltf'];
  
  const hasValidType = validTypes.includes(file.type);
  const hasValidExtension = validExtensions.some(ext => 
    file.name.toLowerCase().endsWith(ext)
  );
  
  return hasValidType || hasValidExtension;
};
```

### Testing

#### Unit Testing with Jest

```javascript
import { render, screen } from '@testing-library/react';
import ARViewer from './ARViewer';

test('renders AR viewer with model', () => {
  render(<ARViewer modelSrc="test.glb" />);
  const viewer = screen.getByRole('img');
  expect(viewer).toBeInTheDocument();
});
```

#### E2E Testing with Cypress

```javascript
describe('AR Viewer', () => {
  it('loads a model successfully', () => {
    cy.visit('/');
    cy.get('.drop-zone').click();
    cy.get('input[type="file"]').attachFile('test-model.glb');
    cy.get('model-viewer').should('be.visible');
  });
});
```

## 🔗 Useful Resources

- [Model Viewer Documentation](https://modelviewer.dev/)
- [glTF Tutorial](https://www.khronos.org/gltf/)
- [Three.js Documentation](https://threejs.org/docs/)
- [ARCore Supported Devices](https://developers.google.com/ar/devices)
- [WebXR Device API](https://www.w3.org/TR/webxr/)

## 📊 Browser Support

| Browser | Desktop | Mobile | AR Support |
|---------|---------|--------|------------|
| Chrome  | ✅      | ✅     | ✅ (Android) |
| Safari  | ✅      | ✅     | ✅ (iOS)     |
| Firefox | ✅      | ✅     | ❌          |
| Edge    | ✅      | ✅     | ✅ (Android) |

---

For more questions, refer to the main README.md or open an issue on GitHub.
