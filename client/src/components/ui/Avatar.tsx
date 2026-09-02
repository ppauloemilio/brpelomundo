import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function Avatar({
  src,
  name,
  className,
  loading: externalLoading,
}: {
  src?: string | null;
  name: string;
  className?: string;
  loading?: boolean;
}) {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
  }, [src]);

  const showInitials = !src || imageFailed;
  const showSpinner = externalLoading || (src && !imageLoaded && !imageFailed);

  if (showInitials) {
    return (
      <div
        className={cn(
          'flex aspect-square shrink-0 items-center justify-center rounded-full bg-brand-200 font-semibold text-brand-800',
          className
        )}
      >
        {initials}
      </div>
    );
  }

  return (
    <div className={cn('relative aspect-square shrink-0 overflow-hidden rounded-full bg-brand-100', className)}>
      {showSpinner && (
        <div className="absolute inset-0 animate-pulse bg-brand-200" />
      )}
      <img
        src={src}
        alt={name}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageFailed(true)}
        className={cn(
          'h-full w-full object-cover object-center transition-opacity duration-300',
          imageLoaded ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}
