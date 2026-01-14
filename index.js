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

// app.get('/customers', async (req, res) => {
//   const [customers] = await connection.execute({
//     sql: `
//     SELECT * from Customers
//     JOIN Companies ON Customers.company_id = Companies.company_id`,
//     nestTables: true
//   });
//   res.render('customers/index', {
//     customers: customers
//   });
// });

app.get('/customers', async (req, res) => {
  const firstName = req.query.first_name;
  const lastName = req.query.last_name;
  const email = req.query.email;
  let sql = `
    SELECT * FROM Customers
      JOIN Companies
    ON Customers.company_id = Companies.company_id WHERE 1
  `;
  const bindings = [];
  if (firstName) {
    sql += ' AND first_name LIKE ?';
    bindings.push('%' + firstName + '%');
  }
  if (lastName) {
    sql += ' AND last_name LIKE ?';
    bindings.push('%' + lastName + '%');
  }
  if (email) {
    sql += ' AND email LIKE ?';
    bindings.push('%' + email + '%');
  }
  const [customers] = await connection.execute({
    sql, nestTables: true
  }, bindings);
  res.render('customers/index', {
    customers: customers,
    searchParams: req.query
  });
});

app.get('/customers/create', async (req, res) => {
  const [companies] = await connection.query('SELECT * from Companies');
  const [employees] = await connection.query('SELECT * from Employees');
  const [products] = await connection.query('SELECT * from Products');
  res.render('customers/add', {
    companies: companies,
    employees: employees,
    products: products
  });
});

app.post('/customers/create', async (req, res, next) => {
  const conn = await connection.getConnection();
  await conn.beginTransaction();
  try {
    let { first_name, last_name, email, company_id, employee_id, product_id } = req.body;
    let query = `INSERT INTO Customers (first_name, last_name, email, company_id, employee_id) 
            VALUES (?, ?, ?, ?, ?)`;
    let bindings = [first_name, last_name, email, company_id, employee_id];
    const [result] = await conn.execute({

    }, bindings);
    const newCustomerId = result.insertId;
    if (product_id) {
      const productIds = Array.isArray(product_id) ? product_id : [product_id];
      for (const productId of productIds) {
        await conn.execute('INSERT INTO CustomerProduct (customer_id, product_id) VALUES (?, ?)', [newCustomerId, productId]);
      }
    }
    await conn.commit();
    res.redirect('/customers');
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

});

app.get('/customers/:customer_id/edit', async (req, res) => {
  let [customers] = await connection.execute('SELECT * from Customers WHERE customer_id = ?', [req.params.customer_id]);
  let [companies] = await connection.execute('SELECT * from Companies');
  let [employees] = await connection.execute('SELECT * from Employees');
  let [products] = await connection.execute('SELECT * from Products');
  let [customerProducts] = await connection.execute('SELECT * from CustomerProduct WHERE customer_id = ?', [req.params.customer_id]);

  // customers will be an array, so we take the first element as we are only expecting one customer
  let customer = customers[0];
  let relatedProducts = customerProducts.map(product => product.product_id);

  res.render('customers/edit', {
    customer: customer,
    companies: companies,
    employees: employees,
    products: products,
    relatedProducts: relatedProducts
  });
});

app.post('/customers/:customer_id/edit', async (req, res, next) => {
  const conn = await connection.getConnection();
  await conn.beginTransaction();
  try {
    let { first_name, last_name, email, company_id, employee_id, product_id } = req.body;
    let query = 'UPDATE Customers SET first_name=?, last_name=?, email=?, company_id=?, employee_id=? WHERE customer_id=?';
    let bindings = [first_name, last_name, email, company_id, employee_id, req.params.customer_id];
    await conn.execute(query, bindings);

    // update many to many relationships with products

    // ...delete all products associated with the customers
    await conn.execute('DELETE FROM CustomerProduct WHERE customer_id=?', [req.params.customer_id]);

    // ...re-add the relationships
    if (product_id) {
      const productIds = Array.isArray(product_id) ? product_id : [product_id];
      for (const productId of productIds) {
        await conn.execute('INSERT INTO CustomerProduct (customer_id, product_id) VALUES (?, ?)', [req.params.customer_id, productId]);
      }
    }

    await conn.commit();
    res.redirect('/customers');
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

app.get('/customers/:customer_id/delete', async (req, res) => {
  // display a confirmation form
  const [customers] = await connection.execute(
    'SELECT * FROM Customers WHERE customer_id = ?',
    [req.params.customer_id]
  );
  const customer = customers[0];
  res.render('customers/delete', {
    customer: customer
  });
});

app.post('/customers/:customer_id/delete', async (req, res) => {
  await connection.execute('DELETE FROM CustomerProduct WHERE customer_id = ?', [req.params.customer_id]);
  await connection.execute('DELETE FROM Customers WHERE customer_id = ?', [req.params.customer_id]);
  res.redirect('/customers');
});



app.listen(3000, () => {
  console.log('Server is running');
});