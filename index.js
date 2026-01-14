const express = require('express');
const ejs = require('ejs');
const expressLayouts = require('express-ejs-layouts');
require('dotenv').config();
const { createPool } = require('mysql2/promise');

const app = express();
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true}));

app.set('layout', 'layouts/base');

const connection = createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

app.get('/', (req, res) => {
  res.render('landing')
});

app.listen(3000, () => {
  console.log('Server is running');
});