/** Output aspect ratios the image backend renders (api/_shared/gptImage.js). */
const SUPPORTED_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9"];

/** Picks the supported output ratio closest to an image's own proportions. */
export const nearestAspectRatio = (width, height) => {
  if (!(width > 0) || !(height > 0)) return "1:1";
  const target = Math.log(width / height);
  let best = SUPPORTED_ASPECT_RATIOS[0];
  let bestDistance = Infinity;
  for (const ratio of SUPPORTED_ASPECT_RATIOS) {
    const [w, h] = ratio.split(":").map(Number);
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < bestDistance) {
      best = ratio;
      bestDistance = distance;
    }
  }
  return best;
};

/** Resolves an image's natural pixel size. */
export const readImageSize = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("無法讀取圖片尺寸，請換一張圖片。"));
    image.src = src;
  });

/** Turns a displayed image (data URL or fetchable URL) into a File that can be uploaded. */
export const imageUrlToFile = async (url, name) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("無法取得目前的圖片，請重新生成後再試。");
  const blob = await response.blob();
  const type = blob.type || "image/png";
  const extension = type.split("/")[1] || "png";
  return new File([blob], `${name}.${extension}`, { type });
};

export const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("無法讀取圖片，請換一張圖片。"));
    reader.readAsDataURL(file);
  });
