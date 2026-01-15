const express = require('express');
const router = express.Router();
const connection = require('./db');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

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
        if (!req.files || !req.files.pdf) {
            throw new Error('No file uploaded');
        }

        const pdfFile = req.files.pdf;
        if (path.extname(pdfFile.name).toLowerCase() !== '.pdf') {
            throw new Error('Only PDF files are allowed');
        }

        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = uniqueSuffix + path.extname(pdfFile.name);
        const filePath = path.join(uploadDir, filename);
        
        await pdfFile.mv(filePath);

        const productId = req.params.productId;
        const [result] = await conn.execute(
            'INSERT INTO PDF (filename, original_filename, file_path, file_size) VALUES (?, ?, ?, ?)',
            [filename, pdfFile.name, filePath, pdfFile.size]
        );
        const newPdfId = result.insertId;

        await conn.execute(
            'UPDATE Products SET pdf_id = ? WHERE product_id = ?',
            [newPdfId, productId]
        );

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