const { readFile } = require('node:fs/promises');
const { PDFParse } = require('pdf-parse');
const { ai } = require('./gemini');
const EMBEDDING_MODEL = 'gemini-embedding-001';

async function chunkPDF(filePath, chunkSize = 1000, overlap = 200) {
    const buffer = await readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const fullText = result.text;

    const chunks = [];
    let startIndex = 0;
    let chunkOrder = 0;

    while (startIndex < fullText.length) {
        const endIndex = Math.min(startIndex + chunkSize, fullText.length);
        let chunkText = fullText.substring(startIndex, endIndex);

        if (endIndex < fullText.length) {
            const lastPeriod = chunkText.lastIndexOf('.');
            const lastNewline = chunkText.lastIndexOf('\n');
            const breakPoint = Math.max(lastPeriod, lastNewline);

            if (breakPoint > chunkSize * 0.5) {
                chunkText = chunkText.substring(0, breakPoint + 1);
                startIndex += breakPoint + 1;
            } else {
                startIndex += chunkSize;
            }
        } else {
            startIndex = fullText.length;
        }

        chunks.push({
            text: chunkText.trim(),
            order: chunkOrder++,
            startChar: startIndex - chunkText.length,
            endChar: startIndex
        });

        if (startIndex < fullText.length) {
            startIndex -= overlap;
        }
    }

    return chunks;
}

async function generateEmbedding(text) {
    const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        // note: documentation is wrong, this is correct
        // see: https://googleapis.github.io/js-genai/release_docs/classes/models.Models.html#generatecontent
        config: {
            outputDimensionality: 768
        }
    });

    return response.embeddings[0].values;
}

async function reRankWithLLM(query, results) {
    const { ai, MODEL } = require('./gemini');
    
    const resultsContext = results.map((r, idx) => {
        return `${idx + 1}. Product: ${r.name}
   Description: ${r.description}
   Relevant Content: ${r.chunk_text.substring(0, 300)}
   Vector Similarity Score: ${(1 - r.distance).toFixed(3)}`;
    }).join('\n\n');

    const rankingSchema = {
        type: "object",
        properties: {
            rankings: {
                type: "array",
                description: "Array of product indices ordered from most to least relevant",
                items: {
                    type: "integer",
                    minimum: 1,
                    maximum: results.length
                }
            },
            reasoning: {
                type: "string",
                description: "Brief explanation of the ranking decisions"
            }
        },
        required: ["rankings"]
    };

    const prompt = `You are a financial product search assistant. A user searched for: "${query}"

Here are the top matching products based on vector similarity:

${resultsContext}

Analyze the user's query intent and re-rank these products from most to least relevant. Consider:
1. Negative language (e.g., "not risky", "avoid volatility") - if user says "not X", rank products WITHOUT X higher
2. User intent and context - understand what they're actually looking for
3. Semantic meaning beyond keyword matching
4. The vector similarity scores as a baseline

Return the product indices in order of relevance (most relevant first).`;

    const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseJsonSchema: rankingSchema
        }
    });

    try {
        const result = JSON.parse(response.text);
        const rankings = result.rankings;
        const reranked = rankings.map(idx => results[idx - 1]).filter(r => r !== undefined);
        return reranked.length > 0 ? reranked : results;
    } catch (e) {
        console.error('LLM re-ranking failed:', e);
        return results;
    }
}

module.exports = {
    chunkPDF,
    generateEmbedding,
    reRankWithLLM
};
