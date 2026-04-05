'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Heart, ShoppingBag, Eye, Star } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { addToCart } from '@/store/slices/cartSlice';
import { toggleWishlist, selectIsWishlisted } from '@/store/slices/wishlistSlice';
import { addToast } from '@/store/slices/uiSlice';

// ── Star Rating ───────────────────────────────────────────────
export function StarRating({ rating, count, size = 'sm' }: { rating: number; count?: number; size?: 'xs' | 'sm' | 'md' }) {
  const sizes = { xs: 'w-3 h-3', sm: 'w-3.5 h-3.5', md: 'w-4 h-4' };
  const textSizes = { xs: 'text-[10px]', sm: 'text-xs', md: 'text-sm' };

  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map(star => (
          <Star
            key={star}
            className={`${sizes[size]} ${star <= Math.round(rating) ? 'fill-kavox-accent text-kavox-accent' : 'text-kavox-tan fill-kavox-tan'}`}
          />
        ))}
      </div>
      {count !== undefined && (
        <span className={`${textSizes[size]} text-kavox-gray font-light`}>({count})</span>
      )}
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────
interface ProductCardProps {
  product: {
    _id: string; name: string; slug: string; brand?: string; category?: string;
    images: { url: string; isMain?: boolean }[];
    sellingPrice: number; discountedPrice?: number; discountPercent?: number;
    rating: number; reviewCount: number;
    availableSizes?: string[]; availableColors?: { name: string; hexCode: string }[];
    totalStock?: number; isPOD?: boolean;
  };
  variant?: 'default' | 'horizontal' | 'minimal';
  showQuickAdd?: boolean;
}

export function ProductCard({ product, variant = 'default', showQuickAdd = true }: ProductCardProps) {
  const dispatch = useAppDispatch();
  const isWishlisted = useAppSelector(selectIsWishlisted(product._id));
  const [imgError, setImgError] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);

  const mainImage = product.images?.find(i => i.isMain)?.url || product.images?.[0]?.url || '/placeholder.jpg';
  const effectivePrice = product.discountedPrice || product.sellingPrice;
  const inStock = (product.totalStock ?? 1) > 0;

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    dispatch(toggleWishlist({
      _id: product._id, name: product.name, slug: product.slug,
      image: mainImage, sellingPrice: product.sellingPrice,
      discountedPrice: product.discountedPrice, rating: product.rating,
    }));
    dispatch(addToast({ message: isWishlisted ? 'Removed from wishlist' : 'Added to wishlist', type: 'success' }));
  };

  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!inStock || addingToCart) return;
    setAddingToCart(true);
    dispatch(addToCart({
      productId: product._id, name: product.name, slug: product.slug,
      image: mainImage, price: effectivePrice,
      originalPrice: product.sellingPrice, quantity: 1,
      maxStock: product.totalStock || 99, seller: '',
    }));
    dispatch(addToast({ message: `${product.name} added to bag!`, type: 'success' }));
    setTimeout(() => setAddingToCart(false), 1000);
  };

  if (variant === 'minimal') {
    return (
      <Link href={`/product/${product.slug}`} className="group block">
        <div className="product-card-img mb-3 rounded overflow-hidden" style={{ aspectRatio: '1/1' }}>
          <img src={imgError ? '/placeholder.jpg' : mainImage} alt={product.name} onError={() => setImgError(true)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        </div>
        <p className="text-sm text-kavox-charcoal font-medium line-clamp-1">{product.name}</p>
        <p className="text-sm font-bold text-kavox-black mt-0.5">₹{effectivePrice.toLocaleString('en-IN')}</p>
      </Link>
    );
  }

  return (
    <Link href={`/product/${product.slug}`} className="product-card group block">
      {/* Image Container */}
      <div className="relative overflow-hidden rounded-sm bg-kavox-sand aspect-product mb-3">
        <img
          src={imgError ? '/placeholder.jpg' : mainImage}
          alt={product.name}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.04]"
        />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {!inStock && <span className="badge-black text-[10px]">Sold Out</span>}
          {inStock && product.discountPercent && product.discountPercent >= 5 && (
            <span className="badge-sale text-[10px]">{product.discountPercent}% OFF</span>
          )}
          {product.isPOD && <span className="badge-accent text-[10px]">Custom</span>}
        </div>

        {/* Action buttons */}
        <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
          <button
            onClick={handleWishlist}
            className={`w-8 h-8 rounded-full flex items-center justify-center shadow-kavox-sm transition-colors ${isWishlisted ? 'bg-red-50 text-red-500' : 'bg-white text-kavox-gray hover:text-kavox-black'}`}
            title={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-red-500' : ''}`} />
          </button>
          <Link href={`/product/${product.slug}`} className="w-8 h-8 rounded-full bg-white text-kavox-gray hover:text-kavox-black flex items-center justify-center shadow-kavox-sm">
            <Eye className="w-4 h-4" />
          </Link>
        </div>

        {/* Quick add */}
        {showQuickAdd && inStock && (
          <div className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
            <button
              onClick={handleQuickAdd}
              disabled={addingToCart}
              className="w-full bg-kavox-black text-white text-xs font-semibold tracking-widest uppercase py-3 hover:bg-kavox-accent transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-75"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              {addingToCart ? 'Added!' : 'Quick Add'}
            </button>
          </div>
        )}

        {/* Out of stock overlay */}
        {!inStock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <span className="text-sm font-semibold text-kavox-gray">Out of Stock</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div>
        {product.brand && (
          <p className="text-[10px] font-semibold tracking-widest uppercase text-kavox-silver mb-1">{product.brand}</p>
        )}
        <h3 className="text-sm font-semibold text-kavox-charcoal line-clamp-2 leading-snug mb-2 group-hover:text-kavox-accent transition-colors">
          {product.name}
        </h3>

        <StarRating rating={product.rating} count={product.reviewCount} />

        <div className="flex items-center gap-2 mt-2">
          <span className="text-base font-bold text-kavox-black">₹{effectivePrice.toLocaleString('en-IN')}</span>
          {product.discountedPrice && (
            <>
              <span className="text-sm text-kavox-silver line-through">₹{product.sellingPrice.toLocaleString('en-IN')}</span>
              {product.discountPercent && (
                <span className="text-xs font-bold text-red-500">{product.discountPercent}% off</span>
              )}
            </>
          )}
        </div>

        {/* Color swatches */}
        {product.availableColors && product.availableColors.length > 0 && (
          <div className="flex gap-1.5 mt-2">
            {product.availableColors.slice(0, 5).map(color => (
              <div
                key={color.name}
                className="w-3.5 h-3.5 rounded-full border border-white ring-1 ring-kavox-tan"
                style={{ backgroundColor: color.hexCode || '#ccc' }}
                title={color.name}
              />
            ))}
            {product.availableColors.length > 5 && (
              <span className="text-[10px] text-kavox-gray">+{product.availableColors.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Skeleton Card ─────────────────────────────────────────────
export function ProductCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="skeleton aspect-product rounded-sm mb-3 w-full" />
      <div className="space-y-2">
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-4 w-1/3 rounded" />
      </div>
    </div>
  );
}

// ── Products Grid ─────────────────────────────────────────────
export function ProductsGrid({ products, loading, cols = 4 }: { products: any[]; loading?: boolean; cols?: 2 | 3 | 4 }) {
  const gridCols = { 2: 'grid-cols-2', 3: 'grid-cols-2 md:grid-cols-3', 4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' };

  if (loading) {
    return (
      <div className={`grid ${gridCols[cols]} gap-x-5 gap-y-8`}>
        {Array.from({ length: cols * 2 }).map((_, i) => <ProductCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols[cols]} gap-x-5 gap-y-8`}>
      {products.map((product, i) => (
        <div key={product._id} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s`, animationFillMode: 'both' }}>
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}

// ── Toast Container ───────────────────────────────────────────
export function ToastContainer() {
  const toasts = useAppSelector(s => s.ui.toasts);
  const dispatch = useAppDispatch();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-sm shadow-kavox-xl text-sm font-medium text-white animate-fade-in-up min-w-[240px] max-w-sm
            ${toast.type === 'success' ? 'bg-kavox-charcoal' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'}
          `}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${toast.type === 'success' ? 'bg-green-400' : toast.type === 'error' ? 'bg-red-300' : 'bg-blue-300'}`} />
          {toast.message}
        </div>
      ))}
    </div>
  );
}
