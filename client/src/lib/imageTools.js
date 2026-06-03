function resizeImageSource(source, options = {}) {
  const maxSize = options.maxSize || 512;
  const quality = options.quality || 0.82;
  const minQuality = options.minQuality || 0.58;
  const maxBytes = options.maxBytes || 0;

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
      let nextQuality = quality;
      let dataUrl = canvas.toDataURL("image/jpeg", nextQuality);

      while (maxBytes && base64PayloadBytes(dataUrl) > maxBytes && nextQuality > minQuality) {
        nextQuality = Math.max(minQuality, nextQuality - 0.06);
        dataUrl = canvas.toDataURL("image/jpeg", nextQuality);
      }

      resolve(dataUrl);
    };

    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Gorsel okunamadi."));
    };

    image.src = objectUrl || source;
  });
}

function base64PayloadBytes(value = "") {
  const commaIndex = value.indexOf(",");
  const payload = commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
  return Math.ceil((payload.length * 3) / 4);
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

export async function preparePostImageSet(source, options = {}) {
  const image = await resizeImageSource(source, {
    maxSize: options.maxSize || 1280,
    quality: options.quality || 0.84,
    minQuality: options.minQuality || 0.64,
    maxBytes: options.maxBytes || 850 * 1024,
  });
  const imageThumbnail = await resizeImageSource(source, {
    maxSize: options.thumbnailMaxSize || 480,
    quality: options.thumbnailQuality || 0.72,
    minQuality: options.thumbnailMinQuality || 0.58,
    maxBytes: options.thumbnailMaxBytes || 110 * 1024,
  });

  return { image, imageThumbnail };
}
