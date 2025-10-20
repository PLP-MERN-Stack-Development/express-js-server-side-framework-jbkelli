const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware: parse JSON
app.use(bodyParser.json());

// Simple async handler to forward errors
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}
class NotFoundError extends AppError {
  constructor(message = 'Not Found') { super(message, 404); }
}
class ValidationError extends AppError {
  constructor(message = 'Validation Error') { super(message, 400); }
}

// In-memory products "DB"
let products = [
  {
    id: '1',
    name: 'Laptop',
    description: 'High-performance laptop with 16GB RAM',
    price: 1200,
    category: 'electronics',
    inStock: true
  },
  {
    id: '2',
    name: 'Smartphone',
    description: 'Latest model with 128GB storage',
    price: 800,
    category: 'electronics',
    inStock: true
  },
  {
    id: '3',
    name: 'Coffee Maker',
    description: 'Programmable coffee maker with timer',
    price: 50,
    category: 'kitchen',
    inStock: false
  }
];

// Logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Authentication middleware (expects header 'x-api-key' or env API_KEY)
const requireApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'];
  const expected = process.env.API_KEY || 'secret-key';
  if (!key || key !== expected) return next(new AppError('Invalid or missing API key', 401));
  next();
};

// Validation middleware for create/update
const validateProduct = (req, res, next) => {
  const { name, price, category, inStock } = req.body;
  const errors = [];
  if (typeof name !== 'string' || !name.trim()) errors.push('name (string) is required');
  if (typeof price !== 'number' || Number.isNaN(price)) errors.push('price (number) is required');
  if (typeof category !== 'string' || !category.trim()) errors.push('category (string) is required');
  if (typeof inStock !== 'boolean') errors.push('inStock (boolean) is required');
  if (errors.length) return next(new ValidationError(errors.join('; ')));
  next();
};

// Root
app.get('/', (req, res) => {
  res.send('Hello World — Product API. Use /api/products');
});

// GET /api/products
// Supports: ?category=..., ?q=search, ?page=1&limit=10
app.get('/api/products', asyncHandler(async (req, res) => {
  const { category, q, page = 1, limit = 10 } = req.query;
  let results = products.slice();

  if (category) {
    const cat = String(category).toLowerCase();
    results = results.filter(p => String(p.category).toLowerCase() === cat);
  }
  if (q) {
    const term = String(q).toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.description || '').toLowerCase().includes(term)
    );
  }

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, parseInt(limit, 10) || 10);
  const start = (p - 1) * l;
  const paged = results.slice(start, start + l);

  res.json({
    status: 'success',
    results: paged.length,
    page: p,
    total: results.length,
    data: { products: paged }
  });
}));

// GET /api/products/:id
app.get('/api/products/:id', asyncHandler(async (req, res, next) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) return next(new NotFoundError('Product not found'));
  res.json({ status: 'success', data: { product } });
}));

// POST /api/products (protected)
app.post('/api/products', requireApiKey, validateProduct, asyncHandler(async (req, res) => {
  const { name, description = '', price, category, inStock } = req.body;
  const newProduct = { id: uuidv4(), name, description, price, category, inStock };
  products.push(newProduct);
  res.status(201).json({ status: 'success', data: { product: newProduct } });
}));

// PUT /api/products/:id (protected)
app.put('/api/products/:id', requireApiKey, validateProduct, asyncHandler(async (req, res, next) => {
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return next(new NotFoundError('Product not found'));
  const { name, description = '', price, category, inStock } = req.body;
  products[idx] = { ...products[idx], name, description, price, category, inStock };
  res.json({ status: 'success', data: { product: products[idx] } });
}));

// DELETE /api/products/:id (protected)
app.delete('/api/products/:id', requireApiKey, asyncHandler(async (req, res, next) => {
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return next(new NotFoundError('Product not found'));
  const removed = products.splice(idx, 1)[0];
  res.json({ status: 'success', data: { product: removed } });
}));

// GET /api/products/stats - count by category
app.get('/api/products/stats', asyncHandler(async (req, res) => {
  const stats = products.reduce((acc, p) => { acc[p.category] = (acc[p.category] || 0) + 1; return acc; }, {});
  res.json({ status: 'success', data: { countByCategory: stats, total: products.length } });
}));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const statusCode = err.statusCode || 500;
  const payload = { status: err.isOperational ? 'fail' : 'error', message: err.message || 'Internal Server Error' };
  res.status(statusCode).json(payload);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Export for tests
module.exports = app;