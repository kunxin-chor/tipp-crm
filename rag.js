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

async function answerQuestion(question, pdfId, connection) {
    const { ai, MODEL } = require('./gemini');
    
    const questionEmbedding = await generateEmbedding(question);
    const vectorString = '[' + questionEmbedding.join(',') + ']';
    
    const [relevantChunks] = await connection.execute(`
        SELECT chunk_text, VEC_DISTANCE(embedding, VEC_FromText(?)) as distance
        FROM PDFChunks
        WHERE pdf_id = ?
        ORDER BY distance ASC
        LIMIT 5
    `, [vectorString, pdfId]);
    
    if (relevantChunks.length === 0) {
        return "I don't have enough information to answer that question.";
    }
    
    const context = relevantChunks.map(chunk => chunk.chunk_text).join('\n\n');
    
    const prompt = `You are a helpful financial product assistant. Answer the user's question based on the following information from the product documentation.

Context from product documentation:
${context}

User question: ${question}

Instructions:
- Answer based ONLY on the provided context
- If the context doesn't contain the answer, say "I don't have that information in the product documentation"
- Be concise and helpful
- Cite specific details from the context when possible

Answer:`;

    const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt
    });
    
    return response.text;
}

module.exports = {
    chunkPDF,
    generateEmbedding,
    answerQuestion
};
