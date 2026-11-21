const mongoose = require('mongoose');
const { Product, Wishlist } = require('./schemas');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveProduct(productIdentifier) {
  const value = String(productIdentifier || '').trim();
  if (!value) return null;

  if (mongoose.Types.ObjectId.isValid(value)) {
    const byId = await Product.findById(value);
    if (byId) return byId;
  }

  return Product.findOne({ name: new RegExp(`^${escapeRegExp(value)}$`, 'i') });
}

// =========================
// PRODUCT FUNCTIONS
// =========================
async function getProducts(name = null) {
  try {
    if (name) {
      const product = await resolveProduct(name);
      return product ? product.toObject() : null;
    }

    return Product.find({}).sort({ createdAt: -1 }).lean();
  } catch (error) {
    console.error('Error in getProducts:', error);
    return { error: error.message };
  }
}

async function setProducts(productData) {
  try {
    const clean = {
      name: String(productData.name || '').trim(),
      price: Number(productData.price),
      originalPrice: productData.originalPrice ? Number(productData.originalPrice) : undefined,
      quantity: productData.quantity === undefined ? 1 : Number(productData.quantity),
      isNewArrival: Boolean(productData.isNewArrival),
      isBestSeller: Boolean(productData.isBestSeller),
      images: Array.isArray(productData.images) ? productData.images : (productData.image ? [productData.image] : []),
      category: productData.category || undefined,
      description: productData.description || ''
    };

    if (!clean.name || Number.isNaN(clean.price)) {
      return { error: 'Product name and price are required' };
    }

    const product = await Product.create(clean);
    return product.toObject();
  } catch (error) {
    console.error('Error in setProducts:', error);
    return { error: error.message };
  }
}

// =========================
// WISHLIST FUNCTIONS
// =========================
async function getWishlist(userId) {
  try {
    const wishlist = await Wishlist.find({ userId })
      .populate('productId')
      .sort({ addedAt: -1 })
      .lean();
    
    console.log(wishlist)

    const products = wishlist
      .map(item => item.productId)
      .filter(Boolean);

    return { products };
  } catch (error) {
    console.error('Error in getWishlist:', error);
    return { error: error.message, products: [] };
  }
}

async function addToWishlist(userId, productIdentifier) {
  try {
    const product = await resolveProduct(productIdentifier);
    if (!product) {
      return { error: 'Product not found' };
    }

    const existing = await Wishlist.findOne({ userId, productId: product._id });
    console.log('Existing wishlist item:', existing);

    if (existing) {
      return { alreadyExists: true, product: product.toObject?.() || product };
    }

    await Wishlist.create({ userId, productId: product._id });
    return { product: product.toObject?.() || product };
  } catch (error) {
    console.error('Error in addToWishlist:', error);

    if (error.code === 11000) {
      return { alreadyExists: true, details: error.message };
    }

    return { error: error.message };
  }
}

async function removeFromWishlist(userId, productIdentifier) {
  try {
    const product = await resolveProduct(productIdentifier);
    if (!product) {
      return { deleted: false };
    }

    const result = await Wishlist.deleteOne({ userId, productId: product._id });
    return { deleted: result.deletedCount > 0 };
  } catch (error) {
    console.error('Error in removeFromWishlist:', error);
    return { error: error.message };
  }
}

module.exports = {
  getProducts,
  setProducts,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  resolveProduct,
  Product,
  Wishlist
};
