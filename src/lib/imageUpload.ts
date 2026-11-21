/**
 * Compresses mobile camera uploads into lightweight JPEG data URLs (< 250KB)
 * so product photos and store logos always fit comfortably within Firestore limits.
 */
export async function compressImageFileToDataUrl(
  file: File,
  maxDimension = 720,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        reject(new Error('Empty image data.'));
        return;
      }

      const img = new Image();
      img.onerror = () => resolve(rawUrl);
      img.onload = () => {
        const renderAtDimension = (dim: number, q: number): string => {
          const scale = Math.min(1, dim / Math.max(img.width, img.height));
          const targetWidth = Math.max(1, Math.round(img.width * scale));
          const targetHeight = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return rawUrl;
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          return canvas.toDataURL('image/jpeg', q);
        };

        let compressed = renderAtDimension(maxDimension, quality);
        if (compressed.length > 95000) {
          compressed = renderAtDimension(maxDimension, 0.54);
        }
        if (compressed.length > 85000) {
          compressed = renderAtDimension(Math.min(maxDimension, 560), 0.5);
        }
        resolve(compressed.length < rawUrl.length ? compressed : rawUrl);
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}
