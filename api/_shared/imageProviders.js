const { generateGptImage } = require("./gptImage");
const { fetchImageSource } = require("./blobStorage");

/** Convert the configured Images v1 response into bytes for deck storage. */
const renderImage = async ({ config, prompt, aspectRatio, quality }) => {
  const { imageUrl } = await generateGptImage({ config, prompt, aspectRatio, quality });
  return fetchImageSource(imageUrl);
};

module.exports = { renderImage };
