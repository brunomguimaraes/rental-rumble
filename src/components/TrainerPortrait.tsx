import { DEFAULT_PORTRAIT_ID, findTrainerPortrait } from '../game/trainer-identity';
import { useEffect, useRef, type CSSProperties } from 'react';
import { ORIGINAL_COLORS, recolorTrainerPixels, type TrainerColors } from '../game/trainer-colors';
import { PixelSprite } from './ui/PixelSprite';

const images = new Map<string, Promise<HTMLImageElement>>();
const SOURCE_SIZE = 256;
function loadImage(src: string): Promise<HTMLImageElement> {
  const existing = images.get(src);
  if (existing) return existing;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { images.delete(src); reject(new Error('Portrait unavailable')); };
    image.src = src;
  });
  images.set(src, promise);
  return promise;
}

export function TrainerPortrait({ avatarId, colors = ORIGINAL_COLORS, size = 64, alt = '', className = '' }: {
  avatarId?: string | null;
  colors?: TrainerColors | null;
  size?: 64 | 128 | 256;
  alt?: string;
  className?: string;
}) {
  const id = findTrainerPortrait(avatarId)?.id ?? DEFAULT_PORTRAIT_ID;
  const base = `${import.meta.env.BASE_URL}sprites/trainer-portraits/v4/`;
  const canvas = useRef<HTMLCanvasElement>(null);
  const skinTone = colors?.skinTone ?? 'original';
  const hairColor = colors?.hairColor ?? 'original';
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    let cancelled = false;
    context.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);
    if (skinTone === 'original' && hairColor === 'original') return;
    void Promise.all([loadImage(`${base}${id}.png`), loadImage(`${base}${id}-mask.png`)]).then(([source, mask]) => {
      if (cancelled) return;
      const buffer = document.createElement('canvas');
      buffer.width = buffer.height = SOURCE_SIZE;
      const temporary = buffer.getContext('2d');
      if (!temporary) return;
      temporary.drawImage(mask, 0, 0);
      const materials = temporary.getImageData(0, 0, SOURCE_SIZE, SOURCE_SIZE);
      temporary.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);
      temporary.drawImage(source, 0, 0);
      const pixels = temporary.getImageData(0, 0, SOURCE_SIZE, SOURCE_SIZE);
      pixels.data.set(recolorTrainerPixels(pixels.data, materials.data, { skinTone, hairColor }));
      context.putImageData(pixels, 0, 0);
    }).catch(() => { /* Keep the original portrait visible if an asset is unavailable. */ });
    return () => { cancelled = true; };
  }, [base, id, skinTone, hairColor]);

  return <span className={`relative inline-block h-[var(--portrait-size)] w-[var(--portrait-size)] shrink-0 ${className}`} style={{ '--portrait-size': `${size}px` } as CSSProperties}>
    <PixelSprite src={`${base}${id}.png`} fallback={`${base}${DEFAULT_PORTRAIT_ID}.png`} size={size} alt={alt} className="h-full w-full" />
    <canvas ref={canvas} width={SOURCE_SIZE} height={SOURCE_SIZE} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]" />
  </span>;
}
