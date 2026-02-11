const { GoogleGenAI } = require("@google/genai");

const getClient = () => {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY");
  }
  return new GoogleGenAI({ apiKey });
};

const getModel = (modelName) => {
  const client = getClient();
  return {
    generateContent: (contents, config) =>
      client.models.generateContent({
        model: modelName,
        contents,
        config,
      }),
  };
};

const getEmbeddingModel = (modelName) => {
  const client = getClient();
  return {
    embedContent: (content) =>
      client.models.embedContent({
        model: modelName,
        content,
      }),
  };
};

const embedText = async (modelName, text) => {
  const model = getEmbeddingModel(modelName);
  const result = await model.embedContent(text);
  return result?.embedding?.values || null;
};

module.exports = { getModel, getEmbeddingModel, embedText };
