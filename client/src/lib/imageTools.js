function resizeImageSource(source, options = {}) {
  const maxSize = options.maxSize || 512;
  const quality = options.quality || 0.82;

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = typeof source === "string" ? "" : URL.createObjectURL(source);

    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);

      const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Profil fotografi hazirlanamadi."));
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Gorsel okunamadi."));
    };

    image.src = objectUrl || source;
  });
}

export function prepareProfilePhoto(file, options = {}) {
  if (!file?.type?.startsWith("image/")) {
    return Promise.reject(new Error("Profil fotografi icin gorsel dosyasi sec."));
  }

  return resizeImageSource(file, {
    maxSize: options.maxSize || 512,
    quality: options.quality || 0.82,
  });
}

export function preparePostImage(source, options = {}) {
  return resizeImageSource(source, {
    maxSize: options.maxSize || 1280,
    quality: options.quality || 0.78,
  });
}
