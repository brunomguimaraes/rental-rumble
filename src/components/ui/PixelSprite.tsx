/**
 * Pixel art drawn crisp. `size` is the rendered edge in px: the art's native
 * size or a whole multiple of it (.agents/rules/styling.md). A `className`
 * width/height (e.g. `sm:h-48 sm:w-48`) may step it up at a breakpoint.
 *
 * `sheet` sprites are 2-frame icon sheets (width = 2 × height), drawn as a
 * background so only the first frame shows. `silhouette` blacks the art out
 * for an uncaught species. `fallback` replaces a failed image once.
 */
export function PixelSprite({
  src,
  size,
  alt,
  fallback,
  sheet = false,
  silhouette = false,
  className = '',
}: {
  src: string;
  size: number;
  alt: string;
  fallback?: string;
  sheet?: boolean;
  silhouette?: boolean;
  className?: string;
}) {
  const tint = silhouette ? 'brightness-0 opacity-40' : '';
  if (sheet) {
    return (
      <div
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={`shrink-0 bg-no-repeat [image-rendering:pixelated] ${tint} ${className}`}
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${src})`,
          backgroundSize: '200% 100%',
          backgroundPosition: 'left center',
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        if (!fallback || img.dataset.fellBack) return;
        img.dataset.fellBack = '1';
        img.src = fallback;
      }}
      className={`shrink-0 object-contain [image-rendering:pixelated] ${tint} ${className}`}
    />
  );
}
