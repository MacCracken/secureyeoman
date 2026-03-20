import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Download, Maximize2 } from 'lucide-react';

export interface ImagePreviewProps {
  src: string;
  alt?: string;
  className?: string;
}

/**
 * Inline image preview with lightbox zoom.
 * Used in chat messages and gallery views for Rasa-generated images.
 */
export function ImagePreview({ src, alt, className }: ImagePreviewProps) {
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(1);

  return (
    <>
      {/* Inline thumbnail */}
      <button
        onClick={() => {
          setLightbox(true);
          setZoom(1);
        }}
        className={`relative group rounded overflow-hidden border border-border hover:border-primary/50 transition-colors ${className ?? ''}`}
      >
        <img
          src={src}
          alt={alt ?? 'Image'}
          className="max-w-full max-h-[300px] object-contain"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-md" />
        </div>
      </button>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => { setLightbox(false); }}
        >
          {/* Controls */}
          <div
            className="absolute top-4 right-4 flex items-center gap-2 z-10"
            onClick={(e) => { e.stopPropagation(); }}
          >
            <button
              onClick={() => { setZoom((z) => Math.max(0.25, z - 0.25)); }}
              className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-white text-xs font-mono min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => { setZoom((z) => Math.min(5, z + 0.25)); }}
              className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <a
              href={src}
              download
              className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              onClick={(e) => { e.stopPropagation(); }}
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={() => { setLightbox(false); }}
              className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Image */}
          <div
            onClick={(e) => { e.stopPropagation(); }}
            className="overflow-auto max-w-[90vw] max-h-[90vh]"
          >
            <img
              src={src}
              alt={alt ?? 'Image'}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              className="transition-transform duration-150"
              onWheel={(e) => {
                e.preventDefault();
                setZoom((z) => Math.max(0.25, Math.min(5, z + (e.deltaY > 0 ? -0.1 : 0.1))));
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Gallery grid for multiple images (e.g., Rasa batch export results).
 */
export function ImageGallery({
  images,
  className,
}: {
  images: { src: string; alt?: string }[];
  className?: string;
}) {
  if (images.length === 0) return null;

  return (
    <div
      className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : images.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'} ${className ?? ''}`}
    >
      {images.map((img, i) => (
        <ImagePreview key={i} src={img.src} alt={img.alt} />
      ))}
    </div>
  );
}
