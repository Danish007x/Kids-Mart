const mongoose = require('mongoose');

// =========================
// PRODUCT SCHEMA
// =========================

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [150, 'Name cannot exceed 150 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price must be a positive number'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: [
          'Clothing',
          'Kids',
          'Suiting',
          'Seasonal',
          'Outfit',
          'Girls',
          'Boys',
          'Uncategorized',
        ],
        message: '{VALUE} is not a valid category',
      },
      default: 'Uncategorized',
    },
    stock: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    image: {
      type: String,
      default: 'default-product.png', // or a placeholder URL
      validate: {
        validator: function (v) {
          // Basic URL validation (optional)
          return /^(https?:\/\/|\/|.*\.(png|jpg|jpeg|gif|webp))$/i.test(v) || v.length > 0;
        },
        message: 'Please provide a valid image path or URL',
      },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt
  }
);

// Optional: index for faster search by name or category
productSchema.index({ name: 'text', category: 1 });

// =========================
// USER SCHEMA
// =========================
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password: { type: String, required: true }
}, { timestamps: true });

// =========================
// WISHLIST SCHEMA
// =========================
const wishlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },

  isAvailable: {
    type: Boolean,
    default: true
  }
});

wishlistSchema.index({ userId: 1, productId: 1 }, { unique: true });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Wishlist = mongoose.models.Wishlist || mongoose.model('Wishlist', wishlistSchema);

module.exports = { Product, User, Wishlist };
