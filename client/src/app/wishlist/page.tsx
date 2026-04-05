'use client';

import Link from 'next/link';
import { Heart, ShoppingBag } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { removeFromWishlist, selectWishlistItems } from '@/store/slices/wishlistSlice';
import { addToCart, openCart } from '@/store/slices/cartSlice';
import { addToast } from '@/store/slices/uiSlice';
import { StarRating } from '@/components/ui';

export default function WishlistPage() {
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectWishlistItems);

  const handleAddToCart = (item: any) => {
    dispatch(addToCart({
      productId: item._id, name: item.name, slug: item.slug,
      image: item.image, price: item.discountedPrice || item.sellingPrice,
      originalPrice: item.sellingPrice, quantity: 1, maxStock: 99, seller: '',
    }));
    dispatch(openCart());
    dispatch(addToast({ message: `${item.name} added to bag!`, type: 'success' }));
  };

  return (
    <div className="min-h-screen bg-kavox-cream">
      <div className="bg-white border-b border-kavox-border">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
          <div className="flex items-center gap-3">
            <Heart className="w-5 h-5 text-kavox-accent" />
            <h1 className="text-2xl font-bold text-kavox-black">Wishlist</h1>
            {items.length > 0 && <span className="text-sm text-kavox-gray font-light">({items.length} items)</span>}
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
        {items.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-sm border border-kavox-border">
            <Heart className="w-16 h-16 text-kavox-tan mx-auto mb-4" />
            <h3 className="text-xl font-bold text-kavox-charcoal mb-2">Your wishlist is empty</h3>
            <p className="text-kavox-gray mb-6 font-light">Save items you love and shop them later</p>
            <Link href="/shop" className="btn-primary">Browse Products</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {items.map((item, i) => (
              <div key={item._id} className="group bg-white rounded-sm border border-kavox-border overflow-hidden hover:shadow-kavox transition-all duration-300 animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s`, animationFillMode: 'both' }}>
                <Link href={`/product/${item.slug}`} className="block relative aspect-[3/4] bg-kavox-sand overflow-hidden">
                  <img src={item.image || '/placeholder.jpg'} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </Link>
                <div className="p-4">
                  <Link href={`/product/${item.slug}`}>
                    <h3 className="text-sm font-semibold text-kavox-charcoal line-clamp-2 hover:text-kavox-accent transition-colors mb-2">{item.name}</h3>
                  </Link>
                  <StarRating rating={item.rating} size="xs" />
                  <div className="flex items-center gap-2 mt-2 mb-3">
                    <span className="font-bold text-kavox-black">₹{(item.discountedPrice || item.sellingPrice).toLocaleString('en-IN')}</span>
                    {item.discountedPrice && <span className="text-xs text-kavox-silver line-through">₹{item.sellingPrice.toLocaleString('en-IN')}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleAddToCart(item)} className="flex-1 btn-primary btn-sm flex items-center justify-center gap-1">
                      <ShoppingBag className="w-3.5 h-3.5" /> Add
                    </button>
                    <button onClick={() => dispatch(removeFromWishlist(item._id))} className="w-9 h-9 flex items-center justify-center border border-kavox-border rounded-sm text-red-400 hover:border-red-300 hover:bg-red-50 transition-colors">
                      <Heart className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
