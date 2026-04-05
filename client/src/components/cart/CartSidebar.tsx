'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { X, ShoppingBag, Plus, Minus, Trash2, ArrowRight } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { closeCart, removeFromCart, updateQuantity, selectCartItems, selectCartTotal, selectCartOpen } from '@/store/slices/cartSlice';

export function CartSidebar() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectCartOpen);
  const items = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectCartTotal);

  // Lock scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') dispatch(closeCart()); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dispatch]);

  const shipping = subtotal >= 499 ? 0 : 49;
  const total = subtotal + shipping;

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => dispatch(closeCart())}
      />

      {/* Sidebar */}
      <aside className={`fixed top-0 right-0 h-full w-full max-w-[420px] bg-white z-50 flex flex-col shadow-kavox-xl transition-transform duration-400 ease-kavox ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-kavox-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-kavox-charcoal" />
            <h2 className="text-lg font-bold text-kavox-black">Your Bag</h2>
            {items.length > 0 && (
              <span className="bg-kavox-accent text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {items.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </div>
          <button onClick={() => dispatch(closeCart())} className="btn-icon" aria-label="Close cart">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-20 h-20 bg-kavox-sand rounded-full flex items-center justify-center mb-5">
                <ShoppingBag className="w-9 h-9 text-kavox-tan" />
              </div>
              <h3 className="font-display text-xl font-semibold text-kavox-charcoal mb-2">Your bag is empty</h3>
              <p className="text-sm text-kavox-gray mb-6 font-light">Looks like you haven't added anything yet.</p>
              <button onClick={() => dispatch(closeCart())} className="btn-primary btn-sm">
                Start Shopping
              </button>
            </div>
          ) : (
            <ul className="space-y-5">
              {items.map(item => (
                <li key={item.id} className="flex gap-4">
                  {/* Image */}
                  <Link href={`/product/${item.slug}`} onClick={() => dispatch(closeCart())} className="flex-shrink-0">
                    <div className="w-20 h-24 bg-kavox-sand rounded-sm overflow-hidden">
                      <img src={item.image || '/placeholder.jpg'} alt={item.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                    </div>
                  </Link>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <Link href={`/product/${item.slug}`} onClick={() => dispatch(closeCart())}>
                      <h4 className="text-sm font-semibold text-kavox-black line-clamp-2 hover:text-kavox-accent transition-colors">{item.name}</h4>
                    </Link>

                    {/* Variant */}
                    {(item.variant?.size || item.variant?.color?.name) && (
                      <p className="text-xs text-kavox-gray mt-1">
                        {[item.variant.size, item.variant.color?.name].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    {/* Price */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-sm font-bold text-kavox-black">₹{item.price.toLocaleString('en-IN')}</span>
                      {item.originalPrice && item.originalPrice > item.price && (
                        <span className="text-xs text-kavox-silver line-through">₹{item.originalPrice.toLocaleString('en-IN')}</span>
                      )}
                    </div>

                    {/* Qty + Remove */}
                    <div className="flex items-center justify-between mt-3">
                      <div className="qty-control">
                        <button
                          className="qty-btn"
                          onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity - 1 }))}
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="qty-display text-xs">{item.quantity}</span>
                        <button
                          className="qty-btn"
                          onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity + 1 }))}
                          disabled={item.quantity >= item.maxStock}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => dispatch(removeFromCart(item.id))}
                        className="text-kavox-silver hover:text-red-500 transition-colors p-1"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-6 py-5 border-t border-kavox-border flex-shrink-0 bg-white">
            {/* Shipping notice */}
            {shipping === 0 ? (
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-sm px-3 py-2.5 mb-4">
                <span className="text-green-600 text-xs font-semibold">🎉 You've unlocked free shipping!</span>
              </div>
            ) : (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-kavox-gray mb-2">
                  <span>Add ₹{(499 - subtotal).toLocaleString('en-IN')} more for free shipping</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${Math.min((subtotal / 499) * 100, 100)}%` }} />
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-kavox-gray">Subtotal</span>
                <span className="font-medium text-kavox-charcoal">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-kavox-gray">Shipping</span>
                <span className={shipping === 0 ? 'text-green-600 font-semibold' : 'font-medium text-kavox-charcoal'}>
                  {shipping === 0 ? 'FREE' : `₹${shipping}`}
                </span>
              </div>
              <div className="divider" />
              <div className="flex justify-between">
                <span className="font-bold text-kavox-black">Total</span>
                <span className="font-bold text-lg text-kavox-black">₹{total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* CTA */}
            <Link href="/checkout" onClick={() => dispatch(closeCart())} className="btn-primary w-full flex items-center justify-center gap-2">
              Checkout <ArrowRight className="w-4 h-4" />
            </Link>
            <button onClick={() => dispatch(closeCart())} className="w-full text-center text-sm text-kavox-gray mt-3 hover:text-kavox-black transition-colors font-light py-2">
              Continue Shopping
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
