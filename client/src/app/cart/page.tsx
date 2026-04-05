'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ShoppingCart, Trash2, Plus, Minus, ArrowLeft } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { selectCartItems, selectCartTotal, removeFromCart, updateQuantity } from '@/store/slices/cartSlice';

export default function CartPage() {
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectCartTotal);

  const shipping = subtotal >= 499 ? 0 : 49;
  const tax = Math.round(subtotal * 0.12);
  const total = subtotal + shipping + tax;

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-kavox-charcoal mb-8">Shopping Cart</h1>
          
          <div className="text-center py-20">
            <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-700 mb-2">Your cart is empty</h2>
            <p className="text-gray-600 mb-8">Start shopping to add items to your cart!</p>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-kavox-accent text-white px-8 py-3 rounded-lg font-semibold hover:bg-kavox-accent-dark transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-kavox-charcoal mb-2">Shopping Cart</h1>
          <p className="text-gray-600">{items.length} item{items.length !== 1 ? 's' : ''} in your cart</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 pb-4 border-b border-gray-200 last:border-b-0">
                  {/* Product Image */}
                  <div className="flex-shrink-0">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-24 h-24 object-cover rounded bg-gray-100"
                      />
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <Link
                        href={`/product/${item.slug || item.productId}`}
                        className="font-semibold text-kavox-charcoal hover:text-kavox-accent transition"
                      >
                        {item.name}
                      </Link>
                      {item.variant && (
                        <p className="text-sm text-gray-600 mt-1">
                          Size: <span className="font-medium">{item.variant.size}</span> | Color: <span className="font-medium">{item.variant.color?.name}</span>
                        </p>
                      )}
                      <p className="text-sm text-gray-500 mt-1">SKU: {item.productId}</p>
                    </div>
                    <p className="font-semibold text-kavox-charcoal mt-2">
                      ₹{(item.price * item.quantity).toLocaleString()}
                    </p>
                  </div>

                  {/* Quantity & Actions */}
                  <div className="flex flex-col items-end justify-between">
                    <button
                      onClick={() => dispatch(removeFromCart(item.id))}
                      className="text-red-500 hover:text-red-700 transition p-1"
                      title="Remove from cart"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>

                    {/* Quantity Controls */}
                    <div className="flex items-center border border-gray-300 rounded-lg">
                      <button
                        onClick={() => dispatch(updateQuantity({ id: item.id, quantity: Math.max(1, item.quantity - 1) }))}
                        className="px-3 py-1 hover:bg-gray-100 transition"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="px-4 py-1 font-semibold text-center w-12">{item.quantity}</span>
                      <button
                        onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity + 1 }))}
                        className="px-3 py-1 hover:bg-gray-100 transition"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Continue Shopping */}
            <div className="mt-6">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 text-kavox-accent font-semibold hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Continue Shopping
              </Link>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-6">
              <h2 className="text-xl font-bold text-kavox-charcoal mb-6">Order Summary</h2>

              <div className="space-y-3 mb-6 pb-6 border-b border-gray-200">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal ({items.length} items)</span>
                  <span className="font-semibold">₹{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span className="font-semibold">
                    {shipping === 0 ? (
                      <span className="text-green-600">FREE</span>
                    ) : (
                      `₹${shipping}`
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Tax (12%)</span>
                  <span className="font-semibold">₹{tax.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex justify-between text-lg font-bold text-kavox-charcoal mb-6">
                <span>Total</span>
                <span>₹{total.toLocaleString()}</span>
              </div>

              {subtotal < 499 && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-6 text-xs text-blue-800">
                  ✨ Add ₹{(499 - subtotal).toLocaleString()} more for free shipping!
                </div>
              )}

              <Link
                href="/checkout"
                className="w-full bg-kavox-accent hover:bg-kavox-accent-dark text-white font-semibold py-3 rounded-lg transition block text-center mb-3"
              >
                Proceed to Checkout
              </Link>

              <button className="w-full border border-gray-300 text-gray-700 font-semibold py-2 rounded-lg hover:bg-gray-50 transition">
                Continue Shopping
              </button>

              <div className="mt-6 p-4 bg-gray-50 rounded text-sm text-gray-600 space-y-2">
                <p>✓ Free shipping on orders above ₹499</p>
                <p>✓ 7-day easy returns</p>
                <p>✓ Brand new, original products</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
