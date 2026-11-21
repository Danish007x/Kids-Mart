require('dotenv').config();

// Prevent unhandled exceptions from crashing the server
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server stays up):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (server stays up):', reason && reason.message ? reason.message : reason);
});

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');

// ============================================================
// SAMPLE PRODUCTS — used when MongoDB is not connected
// ============================================================
const SAMPLE_PRODUCTS = [
  { _id: 'sample1', name: 'Rainbow Kids Hoodie', price: 950, originalPrice: 1200, stock: 20, category: 'Girls', images: ['images/product-item-1.jpg'], description: 'Soft, bright hoodie for everyday adventures.', isNewArrival: true },
  { _id: 'sample2', name: 'Little Star T-Shirt', price: 550, originalPrice: 700, stock: 35, category: 'Boys', images: ['images/product-item-2.jpg'], description: 'Comfortable cotton t-shirt for active kids.' },
  { _id: 'sample3', name: 'Playtime Sneakers', price: 650, stock: 18, category: 'Kids', images: ['images/product-item-3.jpg'], description: 'Lightweight sneakers designed for play.' },
  { _id: 'sample4', name: 'Tiny Explorer Backpack', price: 500, stock: 25, category: 'Kids', images: ['images/product-item-4.jpg'], description: 'A cheerful backpack for school and trips.', isNewArrival: true },
  { _id: 'sample5', name: 'Cozy Bear Pajamas', price: 700, originalPrice: 850, stock: 22, category: 'Boys', images: ['images/product-item-5.jpg'], description: 'Soft nightwear with a cozy bear print.' },
  { _id: 'sample6', name: 'Princess Party Dress', price: 1250, originalPrice: 1500, stock: 12, category: 'Girls', images: ['images/product-item-6.jpg'], description: 'A sweet dress for birthdays and celebrations.', isNewArrival: true },
  { _id: 'sample7', name: 'Building Blocks Set', price: 750, stock: 30, category: 'Kids', images: ['images/product-item-7.jpg'], description: 'Creative blocks for imaginative play.' },
  { _id: 'sample8', name: 'Dino Toy Car', price: 600, stock: 28, category: 'Kids', images: ['images/product-item-8.jpg'], description: 'Fun toy car with a playful dinosaur design.' }
];

// In-memory order store (fallback when no DB)
const memoryOrders = [];

const { Product, User, Wishlist } = require('./schemas');
const {
  getProducts,
  addToWishlist,
  getWishlist,
  removeFromWishlist,
  setProducts
} = require('./helper');

// =========================
// ADD ORDER SCHEMA (since it's not in schemas.js)
// =========================
const orderSchema = new mongoose.Schema({
    orderId: { 
      type: String, 
      required: true,
      unique: true 
    },
    customer: { type: String, required: true },
    customerEmail: String,
    customerPhone: String,
    shippingAddress: String,
    notes: String,
    products: [{
        productId: String,
        name: String,
        quantity: Number,
        price: Number
    }],
    total: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'shipped', 'delivered', 'cancelled'],
        default: 'pending' 
    }
}, { 
  timestamps: true 
});

const Order = mongoose.model('Order', orderSchema);

const app = express();

// =========================
// CONFIG
// =========================
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kidsmart';
const SESSION_SECRET = process.env.SESSION_SECRET || 'kidsmart-dev-session-secret';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || `http://localhost:${PORT}`;

// =========================
// MIDDLEWARE
// =========================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin(origin, callback) {
    const allowedOrigins = new Set([
      CLIENT_ORIGIN,
      `http://localhost:${PORT}`,
      'http://127.0.0.1:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:8080',
      'http://127.0.0.1:8080'
    ]);

    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(null, true);
  },
  credentials: true
}));

// Use MongoStore only when an external MONGO_URI is provided
const isExternalMongo = process.env.MONGO_URI && !process.env.MONGO_URI.includes('127.0.0.1') && !process.env.MONGO_URI.includes('localhost');
const sessionStore = isExternalMongo
  ? MongoStore.create({ mongoUrl: MONGO_URI, collectionName: 'sessions', ttl: 14 * 24 * 60 * 60 })
  : undefined; // use default in-memory store

app.use(session({
  name: 'kidsmart.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  ...(sessionStore ? { store: sessionStore } : {}),
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// =========================
// HELPERS
// =========================
function publicUser(user) {
  if (!user) return null;
  return {
    _id: user._id,
    id: user._id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function createLoginSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user._id.toString();
      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr);
        resolve();
      });
    });
  });
}

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

// =========================
// AUTH
// =========================
app.post('/api/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });
    await createLoginSession(req, user);

    res.status(201).json({
      success: true,
      message: 'User registered',
      user: publicUser(user)
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await createLoginSession(req, user);

    res.json({
      success: true,
      message: 'Login successful',
      user: publicUser(user)
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/me', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const user = await User.findById(req.session.userId).select('-password');
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error('Current user error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/verify', requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).select('-password');
  res.json({ success: true, user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('kidsmart.sid', { path: '/' });
    res.json({ success: true, message: 'Logged out' });
  });
});

// =========================
// USERS / ADMIN DEMO DATA
// =========================
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, users });
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================
// PRODUCTS - ENHANCED CRUD OPERATIONS
// =========================

// GET - Fetch all products (for website & dashboard)
app.get('/api/products', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, products: SAMPLE_PRODUCTS });
    }
    if (req.query.name) {
      const products = await getProducts(req.query.name);
      if (products && products.error) {
        return res.status(500).json({ success: false, message: products.error });
      }
      return res.json({ success: true, products: Array.isArray(products) ? products : [products].filter(Boolean) });
    }
    const products = await Product.find({}).sort({ createdAt: -1 });
    if (products.length === 0) return res.json({ success: true, products: SAMPLE_PRODUCTS });
    res.json({ success: true, products });
  } catch (err) {
    console.error('Products error:', err);
    res.json({ success: true, products: SAMPLE_PRODUCTS });
  }
});

// GET - Fetch single product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, product });
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST - Add new product (Admin Dashboard)
app.post('/api/products', async (req, res) => {
  try {
    const { name, price, category, stock, image, description } = req.body;
    
    // Validation
    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Name and price are required' });
    }
    
    const product = new Product({
      name,
      price: parseFloat(price),
      category: category || 'Uncategorized',
      stock: stock || 0,
      image: image || 'https://via.placeholder.com/80?text=Product',
      description: description || '',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await product.save();
    res.json({ success: true, product, message: 'Product added successfully' });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT - Update product
app.put('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, product, message: 'Product updated successfully' });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE - Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================
// ORDERS MANAGEMENT API
// =========================

// GET - Fetch all orders (Admin Dashboard)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET - Fetch orders by customer email (for website)
// GET - Fetch orders by customer email
app.get('/api/orders/customer/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email); // Important fix

    if (mongoose.connection.readyState !== 1) {
      const orders = memoryOrders.filter(o => o.customerEmail === email).reverse();
      return res.json({ success: true, orders });
    }

    const orders = await Order.find({ customerEmail: email })
      .sort({ createdAt: -1 });

    res.json({ success: true, orders });
  } catch (err) {
    console.error('Get customer orders error:', err);
    
    // Only fallback in development or when DB is down
    const email = decodeURIComponent(req.params.email);
    const orders = memoryOrders.filter(o => o.customerEmail === email).reverse();
    res.json({ success: true, orders });
  }
});

// GET - Fetch single order by ID
app.get('/api/orders/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      const order = memoryOrders.find(o => o._id === req.params.id || o.orderId === req.params.id);
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
      return res.json({ success: true, order });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST - Create new order (from website checkout or admin)
// POST - Create new order
app.post('/api/orders', async (req, res) => {
  try {
    const { customer, customerEmail, customerPhone, shippingAddress, notes, products, total, status } = req.body;
    
    if (!customer || !total) {
      return res.status(400).json({ success: false, message: 'Customer and total are required' });
    }
    
    const orderId = 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

    const orderData = {
      orderId,                    // Keep this as custom readable ID
      customer,
      customerEmail: customerEmail || '',
      customerPhone: customerPhone || '',
      shippingAddress: shippingAddress || '',
      notes: notes || '',
      products: products || [],
      total: parseFloat(total),
      status: status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    let savedOrder;

    if (mongoose.connection.readyState !== 1) {
      // In-memory fallback
      memoryOrders.push(orderData);
      savedOrder = orderData;
    } else {
      // MongoDB
      const order = new Order(orderData);  // Do NOT set _id manually
      savedOrder = await order.save();
    }
    
    // Reduce stock
    if (products && products.length > 0) {
      for (const item of products) {
        if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { stock: -(item.quantity || 1) }
          }).catch(() => {});
        }
      }
    }
    
    res.json({ 
      success: true, 
      order: savedOrder, 
      message: 'Order placed successfully' 
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT - Update order status (Admin Dashboard)
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: new Date() },
      { new: true }
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, order, message: 'Order status updated' });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT - Update entire order
app.put('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, order, message: 'Order updated successfully' });
  } catch (err) {
    console.error('Update order error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE - Delete/cancel order
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    console.error('Delete order error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================
// ENHANCED STATS API
// =========================
app.get('/api/stats', async (req, res) => {
  try {
    const [users, products, orders, wishlistItems] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      Wishlist.countDocuments()
    ]);
    
    // Calculate total revenue from non-cancelled orders
    const revenueData = await Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const revenue = revenueData[0]?.total || 0;
    
    // Get today's registrations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayUsers = await User.countDocuments({ createdAt: { $gte: today } });
    
    // Get today's orders
    const todayOrders = await Order.countDocuments({ createdAt: { $gte: today } });

    res.json({ 
      success: true, 
      users,
      todayUsers,
      products,
      orders,
      todayOrders,
      wishlistItems,
      revenue
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================
// WISHLIST
// =========================
app.post('/api/wishlist/:productId', requireAuth, async (req, res) => {
  const result = await addToWishlist(req.session.userId, req.params.productId);
  console.log(req.session.userId, req.params.productId)

  if (result.error) {
    return res.status(400).json({ success: false, message: result.error });
  }

  res.json({ success: true, message: result.alreadyExists ? 'Product already in wishlist' : 'Added to wishlist', product: result.product });
});

app.get('/api/wishlist', requireAuth, async (req, res) => {
  const result = await getWishlist(req.session.userId);
  console.log(result)

  if (result.error) {
    return res.status(500).json({ success: false, message: result.error, products: [] });
  }

  res.json({ success: true, products: result.products || [] });
});

app.delete('/api/wishlist/:productId', requireAuth, async (req, res) => {
  const result = await removeFromWishlist(req.session.userId, req.params.productId);

  if (result.error) {
    return res.status(400).json({ success: false, message: result.error });
  }

  res.json({ success: true, deleted: Boolean(result.deleted) });
});

// =========================
// HEALTH CHECK
// =========================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'not connected'
  });
});

// =========================
// STATIC SITE
// =========================
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));

const htmlPages = new Set([
  'index.html',
  'about.html',
  'contact.html',
  'shop.html',
  'wishlist.html',
  'login.html',
  'register.html',
  'navigation.html',
  'checkout.html',
  'orders.html',
  'admin panel.html'
]);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  if (!htmlPages.has(page)) return next();
  res.sendFile(path.join(__dirname, page));
});

// =========================
// SEED PRODUCTS
// =========================
// async function seedProductsIfEmpty() {
//   const count = await Product.countDocuments();
//   if (count > 0) return;

//   const sampleProducts = [
//     { name: 'Rainbow Kids Hoodie', price: 950, originalPrice: 1200, stock: 20, category: 'girls', image: 'images/product-item-1.jpg', description: 'Soft, bright hoodie for everyday adventures.' },
//     { name: 'Little Star T-Shirt', price: 550, originalPrice: 700, stock: 35, category: 'boys', image: 'images/product-item-2.jpg', description: 'Comfortable cotton t-shirt for active kids.' },
//     { name: 'Playtime Sneakers', price: 650, stock: 18, category: 'accessories', image: 'images/product-item-3.jpg', description: 'Lightweight sneakers designed for play.' },
//     { name: 'Tiny Explorer Backpack', price: 500, stock: 25, category: 'accessories', image: 'images/product-item-4.jpg', description: 'A cheerful backpack for school and trips.' },
//     { name: 'Cozy Bear Pajamas', price: 700, originalPrice: 850, stock: 22, category: 'boys', image: 'images/product-item-5.jpg', description: 'Soft nightwear with a cozy bear print.' },
//     { name: 'Princess Party Dress', price: 1250, originalPrice: 1500, stock: 12, category: 'girls', image: 'images/product-item-6.jpg', description: 'A sweet dress for birthdays and celebrations.' },
//     { name: 'Building Blocks Set', price: 750, stock: 30, category: 'toys', image: 'images/product-item-7.jpg', description: 'Creative blocks for imaginative play.' },
//     { name: 'Dino Toy Car', price: 600, stock: 28, category: 'toys', image: 'images/product-item-8.jpg', description: 'Fun toy car with a playful dinosaur design.' }
//   ];

//   await Product.insertMany(sampleProducts);
//   console.log(' Seeded sample KidsMart products');
// }

// =========================
// START SERVER
// =========================
// Always start the HTTP server; DB connection is attempted in the background
app.listen(PORT, () => {
  console.log(` KidsMart server running on http://localhost:${PORT}`);
});

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log(' MongoDB connected');
  })
  .catch(err => {
    console.error(' MongoDB connection error (API routes may not work):', err.message);
    console.error(' Set MONGO_URI environment variable to connect to MongoDB');
  });