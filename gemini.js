require('dotenv').config(); // read the GEMINI_API_KEY and the GEMINI_MODEL from the .env file
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

module.exports = {
  ai,
  MODEL
};
