const { signGeneratedBlobUrl } = require("./blobStorage");

const createVideoPlayback = (blobName) => {
  const expiresInMs = 60 * 60 * 1000;
  return {
    url: signGeneratedBlobUrl({ blobName, permissions: "r", expiresInMs }),
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  };
};

module.exports = { createVideoPlayback };
