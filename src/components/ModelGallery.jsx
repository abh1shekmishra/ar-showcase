import React, { useMemo } from 'react';
import './ModelGallery.css';

const GALLERY = [
  {
    category: 'Furniture',
    items: [
      {
        name: 'Sheen Chair',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/SheenChair/glTF-Binary/SheenChair.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/SheenChair/screenshot/screenshot.jpg',
      },
      {
        name: 'Damaged Helmet (Decor)',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/screenshot/screenshot.jpg',
      },
    ],
  },
  {
    category: 'Home Decor',
    items: [
      {
        name: 'Lantern',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF-Binary/Lantern.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/screenshot/screenshot.jpg',
      },
      {
        name: 'Antique Camera',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/AntiqueCamera/glTF-Binary/AntiqueCamera.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/AntiqueCamera/screenshot/screenshot.jpg',
      },
    ],
  },
  {
    category: 'Vehicles',
    items: [
      {
        name: 'Milk Truck',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/screenshot/screenshot.jpg',
      },
      {
        name: 'Buggy',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Buggy/glTF-Binary/Buggy.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Buggy/screenshot/screenshot.jpg',
      },
    ],
  },
  {
    category: 'Toys',
    items: [
      {
        name: 'Toy Car',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/ToyCar/glTF-Binary/ToyCar.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/ToyCar/screenshot/screenshot.jpg',
      },
      {
        name: 'Duck',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/screenshot/screenshot.jpg',
      },
    ],
  },
  {
    category: 'Animals',
    items: [
      {
        name: 'Fox',
        url: 'https://modelviewer.dev/shared-assets/models/Fox.glb',
        thumb: 'https://modelviewer.dev/shared-assets/models/Fox.webp',
      },
      {
        name: 'Barramundi Fish',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BarramundiFish/glTF-Binary/BarramundiFish.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BarramundiFish/screenshot/screenshot.jpg',
      },
    ],
  },
  {
    category: 'Fashion',
    items: [
      {
        name: 'Corset',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Corset/glTF-Binary/Corset.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Corset/screenshot/screenshot.jpg',
      },
    ],
  },
  {
    category: 'Everyday',
    items: [
      {
        name: 'Water Bottle',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WaterBottle/glTF-Binary/WaterBottle.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WaterBottle/screenshot/screenshot.jpg',
      },
    ],
  },
  {
    category: 'Characters',
    items: [
      {
        name: 'Cesium Man',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMan/glTF-Binary/CesiumMan.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMan/screenshot/screenshot.jpg',
      },
      {
        name: 'Robot Expressive',
        url: 'https://modelviewer.dev/shared-assets/models/RobotExpressive.glb',
        thumb: 'https://modelviewer.dev/shared-assets/models/RobotExpressive.webp',
      },
    ],
  },
  {
    category: 'Space',
    items: [
      {
        name: 'Astronaut',
        url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
        thumb: 'https://modelviewer.dev/shared-assets/models/Astronaut.webp',
      },
    ],
  },
  {
    category: 'Electronics',
    items: [
      {
        name: 'BoomBox',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BoomBox/glTF-Binary/BoomBox.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BoomBox/screenshot/screenshot.jpg',
      },
      {
        name: 'Flight Helmet',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/FlightHelmet/glTF-Binary/FlightHelmet.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/FlightHelmet/screenshot/screenshot.jpg',
      },
    ],
  },
  {
    category: 'Abstract',
    items: [
      {
        name: 'Suzanne',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Suzanne/glTF-Binary/Suzanne.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Suzanne/screenshot/screenshot.jpg',
      },
    ],
  },
  {
    category: 'Food',
    items: [
      {
        name: 'Avocado',
        url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
        thumb: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/screenshot/screenshot.jpg',
      },
    ],
  },
];

const resolveThumb = (u) => {
  if (!u) return u;
  try {
    const url = new URL(u);
    if (url.host === 'raw.githubusercontent.com') {
      return u
        .replace('https://raw.githubusercontent.com/', 'https://cdn.jsdelivr.net/gh/')
        .replace('/master/', '@master/');
    }
  } catch {}
  return u;
};

const resolveSource = (item) => {
  const u = item.url || '';
  try {
    if (u.includes('KhronosGroup/glTF-Sample-Models')) {
      const match = u.match(/glTF-Sample-Models\/master\/2\.0\/([^/]+)/);
      const name = match?.[1];
      if (name) {
        return {
          href: `https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0/${name}`,
          label: 'Khronos',
        };
      }
      return { href: 'https://github.com/KhronosGroup/glTF-Sample-Models', label: 'Khronos' };
    }
    if (u.includes('modelviewer.dev/shared-assets/models')) {
      return {
        href: 'https://github.com/google/model-viewer/tree/main/packages/shared-assets/models',
        label: 'model-viewer',
      };
    }
  } catch {}
  return null;
};

const ModelGallery = ({ onSelect, title = 'Try a sample model' }) => {
  const flat = useMemo(() => GALLERY.flatMap(g => g.items), []);

  const handleClick = (item) => {
    if (onSelect) onSelect(item.url, `${item.name}.glb`);
  };

  return (
    <section className="model-gallery">
      <div className="gallery-header">
        <h2>{title}</h2>
        <p className="gallery-sub">Quickly load a curated 3D model.</p>
      </div>

      {GALLERY.map(group => (
        <div className="gallery-group" key={group.category}>
          <h3 className="group-title">{group.category}</h3>
          <div className="card-grid">
            {group.items.map(item => (
              <button
                key={item.name}
                className="model-card"
                onClick={() => handleClick(item)}
                title={`Load ${item.name}`}
              >
                <div className="thumb-wrap">
                  <img
                    className="thumb-img"
                    src={resolveThumb(item.thumb)}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    onLoad={(e) => {
                      e.currentTarget.parentElement?.classList?.add('loaded');
                    }}
                    onError={(e) => {
                      const el = e.currentTarget;
                      // Try simple .webp -> .png fallback if applicable
                      if (el.src.endsWith('.webp')) {
                        const png = el.src.replace('.webp', '.png');
                        el.onerror = () => {
                          el.style.display = 'none';
                          el.parentElement?.classList?.add('fallback','loaded');
                        };
                        el.src = png;
                      } else {
                        el.style.display = 'none';
                        el.parentElement?.classList?.add('fallback','loaded');
                      }
                    }}
                  />
                </div>
                <div className="meta">
                  <span className="name below">{item.name}</span>
                  {(() => {
                    const src = resolveSource(item);
                    return src ? (
                      <a
                        className="source-link"
                        href={src.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open source: ${src.label}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Source
                      </a>
                    ) : null;
                  })()}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      <details className="gallery-notes">
        <summary>About these models</summary>
        <ul>
          <li>Models are sourced from the Khronos glTF Sample Models and modelviewer.dev shared assets.</li>
          <li>They are hosted on public CDNs (GitHub raw/modelviewer) with CORS enabled.</li>
          <li>Use your own models for production or attribution-compliant demos.</li>
        </ul>
      </details>
    </section>
  );
};

export default ModelGallery;
