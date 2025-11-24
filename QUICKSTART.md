# 🚀 Quick Start Guide

Get your AR application up and running in 2 minutes!

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173/ in your browser

## First Steps

### 1. Load a Sample Model
- Click **"Load Sample Model"** button
- A 3D astronaut will appear in the viewer

### 2. Try Desktop Controls
- **Drag** to rotate the model
- **Scroll** to zoom in/out
- **Right-click + drag** to pan
- Use the **Scale** and **Rotation** sliders on the right

### 3. Test AR on Mobile
- Open the app on your iPhone or Android phone
- Load a model
- Tap **"View in AR"** button
- Point camera at floor/table
- Tap to place the model
- Pinch to scale, two-finger rotation

## Loading Your Own Models

### Option 1: Drag & Drop
1. Find a GLB or GLTF file
2. Drag it onto the drop zone
3. Done!

### Option 2: From URL
1. Click the URL input field
2. Paste a link to a GLB/GLTF file
3. Click "Load URL"

### Option 3: Browse Files
1. Click the drop zone
2. Select a file from your computer
3. Model loads automatically

## Where to Get 3D Models

Free 3D model resources:
- **[Sketchfab](https://sketchfab.com/)** - Thousands of free models
- **[Poly Pizza](https://poly.pizza/)** - Google Poly Archive
- **[Free3D](https://free3d.com/)** - Free models library
- **[Clara.io](https://clara.io/)** - Free 3D modeling + models

**Important:** Download models in **GLB** format for best compatibility!

## Testing AR

### On iPhone/iPad (iOS 12+)
1. Open Safari (not Chrome!)
2. Navigate to your app URL
3. Load a model
4. Tap "View in AR"
5. Use AR Quick Look

### On Android (ARCore devices)
1. Open Chrome
2. Navigate to your app URL
3. Load a model
4. Tap "View in AR"
5. Use Scene Viewer

### Check AR Support
- iPhone 6S and newer (iOS 12+)
- ARCore-compatible Android devices
- Must use HTTPS in production

## Common Issues

### Model not showing?
- ✅ Check file format (must be .glb or .gltf)
- ✅ Try the sample model first
- ✅ Check browser console for errors

### AR button not appearing?
- ✅ Test on a mobile device (not desktop)
- ✅ Use Safari on iOS, Chrome on Android
- ✅ Ensure device supports AR

### Slow loading?
- ✅ Check model file size (< 5MB recommended)
- ✅ Try a smaller model
- ✅ Check internet connection

## Build for Production

```bash
# Create production build
npm run build

# Preview production build locally
npm run preview
```

Deploy the `dist` folder to:
- Vercel
- Netlify
- GitHub Pages
- Your own server

**Important:** Must use HTTPS for AR features!

## Next Steps

1. ✅ Read [README.md](./README.md) for full documentation
2. ✅ Check [ADVANCED_GUIDE.md](./ADVANCED_GUIDE.md) for customization
3. ✅ Experiment with different 3D models
4. ✅ Deploy to production

## Need Help?

- Check the README for troubleshooting
- Review the Advanced Guide for customization
- Open an issue on GitHub

---

**You're ready to go! 🎉**

Start by loading a sample model, then try your own 3D files!
