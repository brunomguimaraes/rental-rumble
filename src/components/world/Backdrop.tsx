import { useState } from 'react';

/**
 * A route's battle backdrop as a scene. The files are 4× pixel art of varying
 * sizes (1024×768, 1280×768, 1288×780, 1292×780), so the image is drawn at
 * exactly half its file size — 2× the art, whole pixels — and cropped by its
 * container. `anchor` picks which band shows: 0 the top, 1 the bottom.
 */
export function Backdrop({ src, anchor = 0.4 }: { src: string; anchor?: number }) {
  const [size, setSize] = useState<{ src: string; w: number; h: number } | null>(null);
  const known = size?.src === src ? size : null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      onLoad={(e) => setSize({ src, w: e.currentTarget.naturalWidth / 2, h: e.currentTarget.naturalHeight / 2 })}
      className="pointer-events-none absolute left-1/2 max-w-none -translate-x-1/2 [image-rendering:pixelated]"
      style={
        known
          ? { width: known.w, height: known.h, top: `calc((100% - ${known.h}px) * ${anchor})` }
          : { visibility: 'hidden' }
      }
    />
  );
}
