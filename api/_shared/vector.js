const defaultDim = Number(process.env.EMBEDDING_DIM || 1536);

const toVectorString = (embedding, dim = defaultDim) => {
  if (!Array.isArray(embedding)) return null;
  if (embedding.length !== dim) {
    throw new Error("Embedding 維度不正確");
  }
  if (!embedding.every((value) => Number.isFinite(value))) {
    throw new Error("Embedding 含非數字");
  }
  return `[${embedding.join(",")}]`;
};

module.exports = { toVectorString, defaultDim };
