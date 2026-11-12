const MAX_CAPTURE_IMAGE_DIMENSION = 1568;
const CAPTURE_JPEG_QUALITY = 0.85;

export const prepareCaptureImage = (file: File): Promise<{ mediaType: string; dataBase64: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode_failed'));
      img.onload = () => {
        const scale = Math.min(1, MAX_CAPTURE_IMAGE_DIMENSION / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas_failed'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', CAPTURE_JPEG_QUALITY);
        resolve({ mediaType: 'image/jpeg', dataBase64: dataUrl.split(',')[1] ?? '' });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
