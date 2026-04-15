import { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import './ModelGallery.css';

const CATALOGUE = [
  {
    category: 'Ceiling Lamps',
    items: [
      { name: 'Ceiling Lamp', uid: 'a91c1806d0ee44b0a3db7490ae1c9695' },
      { name: 'Ceiling Lights', uid: '99041d3a77794b30bbc814e14010db69' },
      { name: 'Luminaria Mantra 6127', uid: '66835907849a498f959ddbc0bb3bdae3' },
      { name: 'Pendente Mantra', uid: '83a6c210d5bc4efda2bf410fa5241a5b' },
    ],
  },
  {
    category: 'Chandeliers',
    items: [
      { name: 'Chandelier', uid: '1c8a5e7069294d3e8bd9c96a4dffca62' },
      { name: 'Chandelier Black', uid: 'c66c187d0ed44d759d2b6564fbc83a9c' },
    ],
  },
  {
    category: 'Wall Lights',
    items: [
      { name: 'Outdoor Wall Light Boston', uid: 'bf3663e0b7d245269bceb81733e7594a' },
      { name: 'Wall Light 01', uid: '813a31583a2d47d7b7695338c457ab38' },
      { name: '5 Modern Wall Lights', uid: 'f519418d54934e77966aa9fae3bb4fb7' },
    ],
  },
];

const SKETCHFAB_API = 'https://api.sketchfab.com/v3/models';
const SKETCHFAB_TOKEN = import.meta.env.VITE_SKETCHFAB_TOKEN || '';

const ModelGallery = ({ onSelect }) => {
  const [thumbnails, setThumbnails] = useState({});
  const [activeUid, setActiveUid] = useState(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [canCancel, setCanCancel] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef(null);

  // Fetch thumbnails from Sketchfab public API
  useEffect(() => {
    const allUids = CATALOGUE.flatMap(g => g.items.map(i => i.uid));
    allUids.forEach(async (uid) => {
      try {
        const res = await fetch(`${SKETCHFAB_API}/${uid}`);
        if (!res.ok) return;
        const data = await res.json();
        const thumbUrl = data.thumbnails?.images?.find(
          img => img.width >= 200
        )?.url || data.thumbnails?.images?.[0]?.url || '';
        setThumbnails(prev => ({ ...prev, [uid]: thumbUrl }));
      } catch {
        // silent
      }
    });
  }, []);

  /* ───── click handler: download → extract → load ───── */
  const handleModelClick = async (item) => {
    if (activeUid) return;

    if (!SKETCHFAB_TOKEN) {
      setErrorMsg('Sketchfab API token not configured. Add VITE_SKETCHFAB_TOKEN to your .env file.');
      setTimeout(() => setErrorMsg(''), 6000);
      return;
    }

    setActiveUid(item.uid);
    setProgress(0);
    setCanCancel(false);
    setErrorMsg('');

    try {
      // Step 1 — Handshake
      setStatusText('Reaching out to Sketchfab…');
      setProgress(2);

      const dlRes = await fetch(`${SKETCHFAB_API}/${item.uid}/download`, {
        headers: { Authorization: `Token ${SKETCHFAB_TOKEN}` },
      });

      if (!dlRes.ok) {
        throw new Error(dlRes.status === 401
          ? 'Invalid Sketchfab API token.'
          : dlRes.status === 403
            ? 'Model download not permitted (license not accepted on Sketchfab).'
            : `Download API returned ${dlRes.status}`);
      }

      setStatusText('Access granted — preparing download…');
      setProgress(5);

      const dlData = await dlRes.json();
      const zipUrl = dlData.gltf?.url || dlData.glb?.url;
      if (!zipUrl) throw new Error('No downloadable format found.');

      // Step 2 — Download with progress
      setStatusText('Fetching model archive…');
      setProgress(8);
      setCanCancel(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const zipRes = await fetch(zipUrl, { signal: controller.signal });
      if (!zipRes.ok) throw new Error(`Archive fetch failed (${zipRes.status}).`);

      const contentLength = parseInt(zipRes.headers.get('content-length') || '0', 10);
      const totalMB = contentLength > 0 ? (contentLength / 1024 / 1024).toFixed(1) : null;
      const reader = zipRes.body.getReader();
      const chunks = [];
      let received = 0;

      setStatusText(totalMB ? `Downloading ${totalMB} MB…` : 'Downloading model…');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;

        const recvMB = (received / 1024 / 1024).toFixed(1);

        if (contentLength > 0) {
          const pct = Math.min(Math.round((received / contentLength) * 80), 80);
          setProgress(10 + pct);  // 10-90 range
          setStatusText(`Pulling data — ${recvMB} / ${totalMB} MB`);
        } else {
          setProgress(Math.min(85, 10 + Math.round(received / 1024 / 10)));
          setStatusText(`Streaming — ${recvMB} MB received`);
        }
      }

      const zipBlob = new Blob(chunks);
      setCanCancel(false);

      // Step 3 — Unpack
      setStatusText('Unpacking archive…');
      setProgress(92);

      const zip = await JSZip.loadAsync(zipBlob);
      const files = Object.keys(zip.files);
      const fileCount = files.filter(f => !zip.files[f].dir).length;

      setStatusText(`Found ${fileCount} files — locating 3D model…`);
      setProgress(94);

      const glbFile = files.find(f => f.toLowerCase().endsWith('.glb'));
      const gltfFile = files.find(f => f.toLowerCase().endsWith('.gltf'));

      if (!glbFile && !gltfFile) {
        throw new Error('No GLB or glTF found in the archive.');
      }

      // Step 4 — Extract
      setStatusText('Extracting geometry & textures…');
      setProgress(96);

      if (glbFile) {
        const data = await zip.file(glbFile).async('blob');
        const blob = new Blob([data], { type: 'model/gltf-binary' });

        setStatusText('Preparing your model…');
        setProgress(98);
        await tick();

        setStatusText('Launching viewer — enjoy ✦');
        setProgress(100);
        await tick();

        onSelect(URL.createObjectURL(blob), item.name || glbFile);
      } else {
        setStatusText('Parsing scene graph…');
        setProgress(95);

        const gltfContent = await zip.file(gltfFile).async('string');
        const gltfDir = gltfFile.includes('/')
          ? gltfFile.substring(0, gltfFile.lastIndexOf('/') + 1)
          : '';
        const gltfJson = JSON.parse(gltfContent);

        setStatusText('Resolving textures & materials…');
        setProgress(96);

        const resourceMap = {};
        for (const fn of files) {
          if (fn === gltfFile || zip.files[fn].dir) continue;
          const rel = fn.startsWith(gltfDir) ? fn.slice(gltfDir.length) : fn;
          const data = await zip.file(fn).async('blob');
          resourceMap[rel] = URL.createObjectURL(data);
        }

        if (gltfJson.buffers) {
          gltfJson.buffers.forEach(b => {
            if (b.uri && resourceMap[b.uri]) b.uri = resourceMap[b.uri];
          });
        }
        if (gltfJson.images) {
          gltfJson.images.forEach(i => {
            if (i.uri && resourceMap[i.uri]) i.uri = resourceMap[i.uri];
          });
        }

        setStatusText('Assembling final model…');
        setProgress(98);
        await tick();

        const gltfBlob = new Blob([JSON.stringify(gltfJson)], { type: 'model/gltf+json' });

        setStatusText('Launching viewer — enjoy ✦');
        setProgress(100);
        await tick();

        onSelect(URL.createObjectURL(gltfBlob), item.name || gltfFile);
      }

      // brief flash of 100% before viewer takes over
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Download cancelled');
      } else {
        console.error('Catalogue download error:', err);
        setErrorMsg(err.message || 'Something went wrong.');
        setTimeout(() => setErrorMsg(''), 6000);
      }
    } finally {
      setActiveUid(null);
      setProgress(0);
      setStatusText('');
      setCanCancel(false);
      abortRef.current = null;
    }
  };

  /** Let React flush before continuing */
  const tick = () => new Promise(r => setTimeout(r, 150));

  const cancelDownload = () => {
    abortRef.current?.abort();
  };

  /* ───── render ───── */

  return (
    <section className="model-gallery">
      <div className="gallery-header">
        <div>
          <h2>Our Catalogue</h2>
          <p className="gallery-sub">Tap any model to load it instantly</p>
        </div>
      </div>

      {errorMsg && (
        <div className="gallery-toast error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <p>{errorMsg}</p>
        </div>
      )}

      {CATALOGUE.map(group => (
        <div className="gallery-group" key={group.category}>
          <h3 className="group-title">{group.category}</h3>
          <div className="card-grid">
            {group.items.map(item => {
              const isActive = activeUid === item.uid;
              const isBusy = !!activeUid;

              return (
                <button
                  key={item.uid}
                  className={`model-card${isActive ? ' downloading' : ''}${isBusy && !isActive ? ' dimmed' : ''}`}
                  onClick={() => handleModelClick(item)}
                  title={isActive ? statusText : `Load ${item.name}`}
                  disabled={isBusy}
                >
                  <div className={`thumb-wrap ${thumbnails[item.uid] ? 'loaded' : ''}`}>
                    {thumbnails[item.uid] ? (
                      <img
                        className="thumb-img"
                        src={thumbnails[item.uid]}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="thumb-placeholder">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                      </div>
                    )}

                    {/* Download overlay with progress */}
                    {isActive && (
                      <div className="card-download-overlay">
                        <div className="progress-ring-wrap">
                          <svg className="progress-ring" viewBox="0 0 48 48">
                            <circle className="progress-ring-bg" cx="24" cy="24" r="20" />
                            <circle
                              className="progress-ring-fill"
                              cx="24" cy="24" r="20"
                              style={{
                                strokeDasharray: `${2 * Math.PI * 20}`,
                                strokeDashoffset: `${2 * Math.PI * 20 * (1 - progress / 100)}`,
                              }}
                            />
                          </svg>
                          <span className="progress-pct">{progress}%</span>
                        </div>
                        <p className="progress-label">{statusText}</p>
                        {canCancel && (
                          <button className="cancel-btn" onClick={(e) => { e.stopPropagation(); cancelDownload(); }}>
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Progress bar under thumbnail */}
                  {isActive && (
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                  )}

                  <div className="meta">
                    <span className="name below">{item.name}</span>
                    {!isActive && <span className="source-badge">Sketchfab</span>}
                    {isActive && <span className="status-badge">{statusText}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <details className="gallery-notes">
        <summary>About this catalogue</summary>
        <ul>
          <li>Click any model — it downloads, extracts, and loads automatically.</li>
          <li>Once loaded, hit <strong>Start AR</strong> to place it in your space.</li>
          <li>You can also upload your own GLB/glTF/ZIP in the area above.</li>
        </ul>
      </details>
    </section>
  );
};

export default ModelGallery;
