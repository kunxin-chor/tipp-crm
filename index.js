const express = require('express');
const ejs = require('ejs');
const expressLayouts = require('express-ejs-layouts');
require('dotenv').config();
const { createPool } = require('mysql2/promise');

const app = express();
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

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

app.get('/customers', async (req, res) => {
  const [customers] = await connection.query({
    sql: `
    SELECT * from Customers
    JOIN Companies ON Customers.company_id = Companies.company_id`,
    nestTables: true
  });
  res.render('customers/index', {
    customers: customers
  });
});

app.get('/customers/create', async (req, res) => {
  let [companies] = await connection.query('SELECT * from Companies');
  res.render('customers/add', {
    companies: companies
  });
});

app.post('/customers/create', async (req, res) => {
  let { first_name, last_name, email, company_id } = req.body;
  let query = 'INSERT INTO Customers (first_name, last_name, email, company_id) VALUES (?, ?, ?, ?)';
  let bindings = [first_name, last_name, email, company_id];
  await connection.execute(query, bindings);
  res.redirect('/customers');
});


app.listen(3000, () => {
  console.log('Server is running');
});