# AR Showcase - Universal Web-Based AR Viewer

A full-featured web-based Augmented Reality application that works seamlessly on both iOS and Android devices. Load any 3D model and view it in AR with complete control over placement, rotation, and scaling.

## 🚀 Features

### Core Functionality
- ✅ **Universal AR Support**: Works on iOS (AR Quick Look) and Android (Scene Viewer)
- ✅ **Multiple Model Loading Options**:
  - Drag & drop GLB/GLTF files
  - Upload from device
  - Load from URL
  - Try with sample models
- ✅ **Full 3D Controls**:
  - Rotate models in 360°
  - Scale from 0.1x to 5x
  - Pan and zoom
  - Reset view
- ✅ **AR Capabilities**:
  - Scan floors, walls, and ceilings
  - Place models in real space
  - Move models after placement
  - Pinch to scale in AR
  - Two-finger rotation in AR
- ✅ **Desktop Preview**: Full 3D viewer with camera controls even without AR support

### Technical Features
- Built with React + Vite for fast development
- Google Model Viewer for robust AR support
- Responsive design for all screen sizes
- Real-time controls overlay
- Beautiful gradient UI
- Loading states and error handling

## 📱 Device Support

### iOS (iPhone/iPad)
- iOS 12+ with AR Quick Look
- Native AR experience
- Tap to place models
- Pinch to scale, rotate with two fingers

### Android
- ARCore-compatible devices (Android 7.0+)
- Scene Viewer integration
- Same interaction patterns as iOS

### Desktop
- Full 3D preview mode
- Mouse controls for rotation and zoom
- All manipulation features available

## 🛠️ Installation

1. **Clone or download the repository**

2. **Install dependencies**:
```bash
npm install
```

3. **Start development server**:
```bash
npm run dev
```

4. **Build for production**:
```bash
npm run build
```

5. **Preview production build**:
```bash
npm run preview
```

## 📦 Dependencies

- **React 19**: UI framework
- **@google/model-viewer**: AR and 3D model rendering
- **Three.js**: Additional 3D utilities
- **Vite**: Build tool and dev server

## 🎨 Project Structure

```
ar-showcase/
├── src/
│   ├── components/
│   │   ├── ModelUploader.jsx      # Model upload/selection UI
│   │   ├── ModelUploader.css      # Upload component styles
│   │   ├── ARViewer.jsx           # Main AR viewer component
│   │   └── ARViewer.css           # Viewer styles
│   ├── App.jsx                    # Main app component
│   ├── App.css                    # Global app styles
│   ├── main.jsx                   # App entry point
│   └── index.css                  # Base styles
├── public/                        # Static assets
├── index.html                     # HTML template
├── package.json                   # Dependencies
└── vite.config.js                 # Vite configuration
```

## 🎯 How to Use

### Loading a Model

1. **Drag & Drop**: Drag a GLB or GLTF file directly onto the drop zone
2. **Browse**: Click the drop zone to select a file from your device
3. **URL**: Enter a direct URL to a GLB/GLTF file
4. **Sample**: Click "Load Sample Model" to try with a demo model

### Desktop Controls

- **Rotate**: Click and drag
- **Zoom**: Scroll wheel or pinch
- **Pan**: Right-click and drag
- **Scale**: Use the scale slider
- **Rotate**: Use the rotation slider
- **Reset**: Click "Reset View" button

### AR Mode (Mobile)

1. Load a model using any method
2. Tap the "View in AR" button
3. Point your device at a surface (floor, table, wall)
4. Tap to place the model
5. Use pinch gestures to scale
6. Use two fingers to rotate
7. Drag to move the model

## 🔧 Customization

### Adding Your Own Models

Support formats: **GLB** (recommended) and **GLTF**

**Where to find 3D models:**
- [Sketchfab](https://sketchfab.com/) - Download GLB models
- [Google Poly Archive](https://poly.pizza/)
- [TurboSquid](https://www.turbosquid.com/)
- Create your own in Blender, Maya, or other 3D software

### Modifying AR Settings

Edit `ARViewer.jsx` to customize model-viewer attributes:

```jsx
<model-viewer
  camera-orbit="0deg 75deg 105%"    // Initial camera position
  shadow-intensity="1"               // Shadow strength
  exposure="1"                       // Lighting exposure
  auto-rotate                        // Auto-rotation on/off
  // ... more options
/>
```

## 🌐 Deployment

### Deploy to Vercel/Netlify

1. Build the project:
```bash
npm run build
```

2. Deploy the `dist` folder to your hosting provider

### Important Notes for Production

- **HTTPS Required**: AR features require HTTPS in production
- **CORS**: Ensure 3D model URLs support CORS if loading from external sources
- **File Size**: Optimize models (< 5MB recommended) for faster loading
- **Format**: GLB is preferred over GLTF for better compatibility

## 🐛 Troubleshooting

### Model not loading
- Check file format (must be GLB or GLTF)
- Verify URL is accessible and supports CORS
- Check browser console for errors

### AR button not appearing
- Ensure you're on a mobile device with AR support
- Check that the page is served over HTTPS
- Verify iOS 12+ (iPhone) or ARCore-compatible device (Android)

### Performance issues
- Reduce model polygon count
- Optimize textures (compress, reduce resolution)
- Remove unnecessary animations or materials

## 📄 License

MIT License - Feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## 📞 Support

For issues or questions:
- Check existing GitHub issues
- Create a new issue with detailed information
- Include browser/device information for bugs

## 🎉 Credits

- Built with [React](https://react.dev/)
- AR powered by [Google Model Viewer](https://modelviewer.dev/)
- 3D utilities from [Three.js](https://threejs.org/)

---

**Enjoy creating immersive AR experiences! 🚀**

