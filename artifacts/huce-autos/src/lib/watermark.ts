export async function applyWatermark(
  file: File,
  text: string = "HUCE AUTOMART"
): Promise<File> {
  // Only process images
  if (!file.type.startsWith("image/")) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return resolve(file);
      }

      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Setup watermark style
      // The overlay uses font-size clamp(7px, 1.4vw, 13px) but for the actual image size
      // we need to scale it based on the image dimensions.
      // Let's make it proportional to the image width.
      const fontSize = Math.max(12, Math.floor(canvas.width * 0.025)); 
      ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowOffsetY = 1;
      ctx.shadowBlur = 3;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // POSITIONS from WatermarkOverlay
      const POSITIONS = [
        { left: 0.24, top: 0.30 },
        { left: 0.72, top: 0.22 },
        { left: 0.22, top: 0.68 },
        { left: 0.70, top: 0.72 },
      ];

      // Draw watermark text at positions
      POSITIONS.forEach((pos) => {
        ctx.save();
        ctx.translate(canvas.width * pos.left, canvas.height * pos.top);
        ctx.rotate((-32 * Math.PI) / 180);
        // extra shadow layer like the overlay
        ctx.shadowColor = "rgba(0,0,0,0.2)";
        ctx.shadowBlur = 8;
        
        // Let's space out the letters like tracking-[4px]
        // Since canvas doesn't support letter-spacing directly well in all browsers,
        // we'll just draw it. modern browsers support canvas letterSpacing, but it's experimental.
        // As a fallback, we just draw the text directly.
        if ('letterSpacing' in ctx) {
          (ctx as any).letterSpacing = `${Math.floor(fontSize * 0.3)}px`;
        }
        
        ctx.fillText(text, 0, 0);
        ctx.restore();
      });

      // Convert back to File
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            return resolve(file);
          }
          const watermarkedFile = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now(),
          });
          resolve(watermarkedFile);
        },
        file.type,
        0.92 // quality for jpeg/webp
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // Fallback to original if error
    };

    img.src = url;
  });
}
