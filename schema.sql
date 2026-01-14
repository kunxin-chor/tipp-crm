-- SQL Schema for Financial Advising Company

CREATE DATABASE IF NOT EXISTS crm;
USE crm;

-- Companies
CREATE TABLE IF NOT EXISTS Companies (
    company_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

-- Departments
CREATE TABLE IF NOT EXISTS Departments (
    department_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- Employees
CREATE TABLE IF NOT EXISTS Employees (
    employee_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    department_id INT,
    FOREIGN KEY (department_id) REFERENCES Departments(department_id)
);

-- Customers
-- Each customer is associated with ONLY ONE employee
CREATE TABLE IF NOT EXISTS Customers (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    company_id INT NOT NULL,
    employee_id INT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES Companies(company_id),
    FOREIGN KEY (employee_id) REFERENCES Employees(employee_id)
);

-- Products
CREATE TABLE IF NOT EXISTS Products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

-- Customer to Product (many-to-many)
CREATE TABLE IF NOT EXISTS CustomerProduct (
    customer_id INT,
    product_id INT,
    PRIMARY KEY (customer_id, product_id),
    FOREIGN KEY (customer_id) REFERENCES Customers(customer_id),
    FOREIGN KEY (product_id) REFERENCES Products(product_id)
);

-- Employee to Product (many-to-many)
CREATE TABLE IF NOT EXISTS EmployeeProduct (
    employee_id INT,
    product_id INT,
    PRIMARY KEY (employee_id, product_id),
    FOREIGN KEY (employee_id) REFERENCES Employees(employee_id),
    FOREIGN KEY (product_id) REFERENCES Products(product_id)
);
