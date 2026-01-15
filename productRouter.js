const express = require('express');
const router = express.Router();
const connection = require('./db');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const { chunkPDF, generateEmbedding } = require('./rag');

router.use(fileUpload());

// your routes here
router.get('/', async function (req, res)  {
    const [products] = await connection.execute({
        sql: 'SELECT * from Products LEFT JOIN PDF ON Products.pdf_id = PDF.pdf_id',
        nestTables: true
    });
    res.render('products/index', {
        products: products
    });
});

router.get('/search', async function(req, res){
    const query = req.query.q;
    
    if (!query) {
        return res.redirect('/products');
    }

    const queryEmbedding = await generateEmbedding(query);
    const vectorString = '[' + queryEmbedding.join(',') + ']';

    const [results] = await connection.execute(`
        SELECT 
            Products.product_id,
            Products.name,
            Products.description,
            Products.pdf_id,
            PDF.filename,
            PDF.original_filename,
            MIN(VEC_DISTANCE(PDFChunks.embedding, VEC_FromText(?))) as best_distance,
            COUNT(CASE WHEN VEC_DISTANCE(PDFChunks.embedding, VEC_FromText(?)) < 0.5 THEN 1 END) as relevant_chunk_count,
            (MIN(VEC_DISTANCE(PDFChunks.embedding, VEC_FromText(?))) - (COUNT(CASE WHEN VEC_DISTANCE(PDFChunks.embedding, VEC_FromText(?)) < 0.5 THEN 1 END) * 0.05)) as combined_score,
            (SELECT chunk_text FROM PDFChunks pc 
             WHERE pc.pdf_id = PDF.pdf_id 
             ORDER BY VEC_DISTANCE(pc.embedding, VEC_FromText(?)) ASC 
             LIMIT 1) as best_chunk_text
        FROM PDFChunks
        JOIN PDF ON PDFChunks.pdf_id = PDF.pdf_id
        JOIN Products ON Products.pdf_id = PDF.pdf_id
        GROUP BY Products.product_id, Products.name, Products.description, Products.pdf_id, PDF.filename, PDF.original_filename
        ORDER BY combined_score ASC
        LIMIT 10
    `, [vectorString, vectorString, vectorString, vectorString, vectorString]);

    res.render('products/search', {
        query: query,
        results: results
    });
});

router.get('/:productId', async function(req, res){
    const [products] = await connection.execute({
        sql: 'SELECT * from Products LEFT JOIN PDF ON Products.pdf_id = PDF.pdf_id WHERE product_id = ?',
        nestTables: true
    }, [req.params.productId]);
    const product = products[0];
    res.render('products/details', {
        product: product
    });
});

router.get('/:productId/upload', async function(req, res){
    const [products] = await connection.execute('SELECT * from Products WHERE product_id = ?', [req.params.productId]);
    
    res.render('products/upload', {
        product: products[0]
    });
});

router.post('/:productId/upload', async function(req, res, next){
    const conn = await connection.getConnection();
    await conn.beginTransaction();
    try {
        // 1. check if a file is uploaded
        if (!req.files || !req.files.pdf) {
            throw new Error('No file uploaded');
        }

        // 2. check if the file is a pdf
        const pdfFile = req.files.pdf;
        if (path.extname(pdfFile.name).toLowerCase() !== '.pdf') {
            throw new Error('Only PDF files are allowed');
        }

        // 3. save the file; create a uploads directory if it doesn't exist
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // 4. generate a unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = uniqueSuffix + path.extname(pdfFile.name);
        const filePath = path.join(uploadDir, filename);
        
        // 5. move the file to the upload directory
        await pdfFile.mv(filePath);

        // 6. insert the file into the database
        const productId = req.params.productId;
        const [result] = await conn.execute(
            'INSERT INTO PDF (filename, original_filename, file_path, file_size) VALUES (?, ?, ?, ?)',
            [filename, pdfFile.name, filePath, pdfFile.size]
        );
        const newPdfId = result.insertId;

        // 7. update the product with the new pdf id
        await conn.execute(
            'UPDATE Products SET pdf_id = ? WHERE product_id = ?',
            [newPdfId, productId]
        );

        // 8. chunk the PDF and generate embeddings
        const chunks = await chunkPDF(filePath);
        for (const chunk of chunks) {
            const embeddingValues = await generateEmbedding(chunk.text);
            
            const vectorString = '[' + embeddingValues.join(',') + ']';
    
            await conn.execute(
                'INSERT INTO PDFChunks (pdf_id, chunk_text, chunk_order, embedding) VALUES (?, ?, ?, VEC_FromText(?))',  
                [newPdfId, chunk.text, chunk.order, vectorString]
            );
        }

        await conn.commit();
        res.redirect('/products/' + productId);
    } catch (e) {
        await conn.rollback();
        next(e);
    } finally {
        conn.release();
    }
});

module.exports = router;