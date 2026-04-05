'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Heart, ShoppingBag, Star, Truck, RefreshCw,
  Shield, ChevronDown, ChevronRight, Share2, ZoomIn
} from 'lucide-react';
import { useAppDispatch, useAppSelector, useToast } from '@/hooks';
import { fetchProduct, fetchRelated } from '@/store/slices/productSlice';
import { addToCart, openCart } from '@/store/slices/cartSlice';
import { toggleWishlist, selectIsWishlisted } from '@/store/slices/wishlistSlice';
import { ProductCard, ProductCardSkeleton, StarRating } from '@/components/ui';
import { productApi, getErrorMessage } from '@/lib/api';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const slug = params?.slug as string;

  const { currentProduct: product, related, loading } = useAppSelector(s => s.product);
  const { isAuthenticated } = useAppSelector(s => s.auth);
  const isWishlisted = useAppSelector(selectIsWishlisted(product?._id || ''));

  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'description' | 'reviews' | 'shipping'>('description');
  const [addingToCart, setAddingToCart] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string | null>('description');
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    if (slug) {
      dispatch(fetchProduct(slug));
    }
  }, [slug, dispatch]);

  useEffect(() => {
    if (product?._id) {
      dispatch(fetchRelated(product._id));
      // Set defaults
      if (product.availableSizes?.length) setSelectedSize(product.availableSizes[0]);
      if (product.availableColors?.length) setSelectedColor(product.availableColors[0].name);
    }
  }, [product?._id, dispatch]);

  const effectivePrice = product?.discountedPrice || product?.sellingPrice || 0;
  const mainImage = product?.images?.[selectedImage]?.url || product?.images?.[0]?.url;

  const handleAddToCart = async () => {
    if (!product) return;
    if (product.availableSizes?.length && !selectedSize) {
      toast.error('Please select a size'); return;
    }
    if (product.availableColors?.length && !selectedColor) {
      toast.error('Please select a color'); return;
    }
    setAddingToCart(true);
    const color = product.availableColors?.find(c => c.name === selectedColor);
    dispatch(addToCart({
      productId: product._id,
      name: product.name,
      slug: product.slug,
      image: mainImage || '',
      price: effectivePrice,
      originalPrice: product.sellingPrice,
      quantity,
      maxStock: product.totalStock ?? 99,
      seller: product.seller?._id || '',
      variant: {
        size: selectedSize || undefined,
        color: color ? { name: color.name, hexCode: color.hexCode } : undefined,
      },
    }));
    dispatch(openCart());
    toast.success(`${product.name} added to bag!`);
    setTimeout(() => setAddingToCart(false), 800);
  };

  const handleWishlist = () => {
    if (!product) return;
    if (!isAuthenticated) { router.push('/auth/login'); return; }
    dispatch(toggleWishlist({
      _id: product._id, name: product.name, slug: product.slug,
      image: mainImage || '', sellingPrice: product.sellingPrice,
      discountedPrice: product.discountedPrice, rating: product.rating,
    }));
    toast.success(isWishlisted ? 'Removed from wishlist' : 'Added to wishlist');
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) { router.push('/auth/login'); return; }
    if (!reviewForm.comment.trim()) { toast.error('Please write a review'); return; }
    setSubmittingReview(true);
    try {
      await productApi.addReview(product!._id, reviewForm);
      toast.success('Review submitted!');
      setReviewForm({ rating: 5, title: '', comment: '' });
      dispatch(fetchProduct(slug));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally { setSubmittingReview(false); }
  };

  if (loading || !product) {
    return (
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
        <div className="grid lg:grid-cols-2 gap-12">
          <div className="space-y-3">
            <div className="skeleton aspect-[4/5] rounded-sm w-full" />
            <div className="grid grid-cols-4 gap-2">
              {[1,2,3,4].map(i => <div key={i} className="skeleton aspect-square rounded-sm" />)}
            </div>
          </div>
          <div className="space-y-4 pt-4">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-8 w-3/4 rounded" />
            <div className="skeleton h-6 w-1/3 rounded" />
            <div className="skeleton h-16 w-full rounded" />
            <div className="skeleton h-12 w-full rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-kavox-cream min-h-screen">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-kavox-border">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-3">
          <nav className="flex items-center gap-2 text-xs text-kavox-gray">
            <Link href="/" className="hover:text-kavox-accent transition-colors">Home</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/shop" className="hover:text-kavox-accent transition-colors">Shop</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href={`/shop?category=${product.category}`} className="hover:text-kavox-accent transition-colors">{product.category}</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-kavox-charcoal font-medium line-clamp-1">{product.name}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-8 md:py-12">
        <div className="grid lg:grid-cols-[1fr_480px] gap-10 xl:gap-16">

          {/* ── GALLERY ───────────────────────────────────── */}
          <div className="space-y-3">
            {/* Main image */}
            <div className="relative bg-kavox-sand rounded-sm overflow-hidden aspect-[4/5] group cursor-zoom-in" onClick={() => setZoomOpen(true)}>
              <img
                src={mainImage || '/placeholder.jpg'}
                alt={product.name}
                className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
              />
              {/* Badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {product.discountPercent && product.discountPercent > 0 && (
                  <span className="badge-sale">{product.discountPercent}% OFF</span>
                )}
                {product.isPOD && <span className="badge-accent">Custom Print</span>}
                {product.totalStock === 0 && <span className="badge-black">Sold Out</span>}
              </div>
              {/* Zoom hint */}
              <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur-sm rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <ZoomIn className="w-4 h-4 text-kavox-charcoal" />
              </div>
            </div>

            {/* Thumbnails */}
            {product.images?.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {product.images.map((img: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(idx)}
                    className={`aspect-square rounded-sm overflow-hidden border-2 transition-all duration-200 ${selectedImage === idx ? 'border-kavox-charcoal' : 'border-transparent hover:border-kavox-tan'}`}
                  >
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── PRODUCT INFO ──────────────────────────────── */}
          <div className="space-y-6">
            {/* Brand + name */}
            <div>
              {product.brand && (
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-kavox-accent mb-2">{product.brand}</p>
              )}
              <h1 className="text-3xl md:text-4xl font-bold text-kavox-black leading-tight tracking-tight mb-3">
                {product.name}
              </h1>
              {/* Rating */}
              <div className="flex items-center gap-3">
                <StarRating rating={product.rating} count={product.reviewCount} size="md" />
                {product.salesCount > 0 && (
                  <span className="text-xs text-kavox-gray font-light">{product.salesCount}+ sold</span>
                )}
              </div>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3 py-4 border-y border-kavox-border">
              <span className="text-4xl font-bold text-kavox-black">
                ₹{effectivePrice.toLocaleString('en-IN')}
              </span>
              {product.discountedPrice && (
                <>
                  <span className="text-xl text-kavox-silver line-through font-light">
                    ₹{product.sellingPrice.toLocaleString('en-IN')}
                  </span>
                  <span className="badge-sale">Save {product.discountPercent}%</span>
                </>
              )}
            </div>

            {/* Short description */}
            {product.shortDescription && (
              <p className="text-sm text-kavox-gray font-light leading-relaxed">{product.shortDescription}</p>
            )}

            {/* Color selector */}
            {product.availableColors?.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-kavox-charcoal mb-3">
                  Color: <span className="font-semibold text-kavox-black normal-case tracking-normal">{selectedColor}</span>
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {product.availableColors.map((color: any) => (
                    <button
                      key={color.name}
                      title={color.name}
                      onClick={() => setSelectedColor(color.name)}
                      className={`w-8 h-8 rounded-full transition-all duration-200 ${selectedColor === color.name ? 'ring-2 ring-offset-2 ring-kavox-charcoal scale-110' : 'hover:scale-105 ring-1 ring-kavox-border'}`}
                      style={{ backgroundColor: color.hexCode || '#ccc' }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Size selector */}
            {product.availableSizes?.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-kavox-charcoal">
                    Size: <span className="font-semibold text-kavox-black normal-case tracking-normal">{selectedSize}</span>
                  </p>
                  <button className="text-xs text-kavox-accent hover:underline font-medium">Size Guide →</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.availableSizes.map((size: string) => {
                    const variant = product.variants?.find((v: any) => v.size === size && (!selectedColor || v.color?.name === selectedColor));
                    const outOfStock = variant ? variant.stock === 0 : false;
                    return (
                      <button
                        key={size}
                        onClick={() => !outOfStock && setSelectedSize(size)}
                        disabled={outOfStock}
                        className={`min-w-[48px] h-11 px-3 text-sm font-semibold border rounded-sm transition-all duration-200
                          ${selectedSize === size ? 'bg-kavox-black text-white border-kavox-black' : ''}
                          ${outOfStock ? 'opacity-30 cursor-not-allowed line-through border-kavox-border text-kavox-gray' : selectedSize !== size ? 'border-kavox-border text-kavox-gray hover:border-kavox-charcoal hover:text-kavox-charcoal' : ''}
                        `}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="flex items-center gap-4">
              <p className="text-xs font-bold uppercase tracking-widest text-kavox-charcoal">Qty:</p>
              <div className="qty-control">
                <button className="qty-btn" onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1}>−</button>
                <span className="qty-display">{quantity}</span>
                <button className="qty-btn" onClick={() => setQuantity(q => Math.min(product.totalStock || 99, q + 1))} disabled={quantity >= (product.totalStock || 99)}>+</button>
              </div>
              {product.totalStock > 0 && product.totalStock <= 5 && (
                <span className="text-xs text-red-500 font-semibold">Only {product.totalStock} left!</span>
              )}
            </div>

            {/* CTAs */}
            <div className="flex gap-3">
              <button
                onClick={handleAddToCart}
                disabled={addingToCart || product.totalStock === 0}
                className="flex-1 btn-primary py-4 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingToCart ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Added!</>
                ) : product.totalStock === 0 ? (
                  'Out of Stock'
                ) : (
                  <><ShoppingBag className="w-4 h-4" /> Add to Bag</>
                )}
              </button>
              <button
                onClick={handleWishlist}
                className={`w-14 h-14 flex items-center justify-center border-2 rounded-sm transition-all duration-200 flex-shrink-0 ${isWishlisted ? 'border-red-400 bg-red-50 text-red-500' : 'border-kavox-border text-kavox-gray hover:border-kavox-accent hover:text-kavox-accent'}`}
              >
                <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-red-500' : ''}`} />
              </button>
            </div>

            {/* Buy now */}
            {product.totalStock > 0 && (
              <button
                onClick={() => { handleAddToCart(); router.push('/checkout'); }}
                className="btn-secondary w-full py-3.5 text-sm"
              >
                Buy Now →
              </button>
            )}

            {/* Trust features */}
            <div className="grid grid-cols-3 gap-3 py-4 border-t border-kavox-border">
              {[
                { icon: Truck, label: 'Free Delivery', sub: 'Orders ₹499+' },
                { icon: RefreshCw, label: '7-Day Return', sub: 'Easy returns' },
                { icon: Shield, label: 'Genuine', sub: '100% authentic' },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex flex-col items-center text-center gap-1.5">
                  <div className="w-8 h-8 bg-kavox-accent-light rounded-full flex items-center justify-center">
                    <Icon className="w-4 h-4 text-kavox-accent" />
                  </div>
                  <p className="text-xs font-semibold text-kavox-charcoal">{label}</p>
                  <p className="text-[10px] text-kavox-gray font-light">{sub}</p>
                </div>
              ))}
            </div>

            {/* Share */}
            <button onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success('Link copied!'); }} className="flex items-center gap-2 text-sm text-kavox-gray hover:text-kavox-black transition-colors">
              <Share2 className="w-4 h-4" /> Share this product
            </button>
          </div>
        </div>

        {/* ── TABS: Description / Reviews / Shipping ──── */}
        <div className="mt-16 bg-white rounded-sm border border-kavox-border overflow-hidden">
          <div className="flex border-b border-kavox-border">
            {(['description', 'reviews', 'shipping'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-4 text-sm font-semibold uppercase tracking-wider transition-colors duration-200 ${activeTab === tab ? 'bg-kavox-black text-white' : 'text-kavox-gray hover:text-kavox-black'}`}
              >
                {tab === 'reviews' ? `Reviews (${product.reviewCount})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="p-6 md:p-10">
            {/* Description */}
            {activeTab === 'description' && (
              <div className="max-w-3xl space-y-6">
                <p className="text-kavox-gray leading-relaxed font-light">{product.description}</p>
                {product.specifications?.length > 0 && (
                  <div>
                    <h3 className="font-bold text-kavox-black mb-4 text-sm uppercase tracking-wider">Specifications</h3>
                    <div className="divide-y divide-kavox-border border border-kavox-border rounded-sm overflow-hidden">
                      {product.specifications.map((spec: any, i: number) => (
                        <div key={i} className="grid grid-cols-2 text-sm">
                          <span className="px-4 py-3 font-semibold text-kavox-charcoal bg-kavox-cream">{spec.key}</span>
                          <span className="px-4 py-3 text-kavox-gray font-light">{spec.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {product.fabric && (
                  <div className="bg-kavox-cream rounded-sm p-4 border border-kavox-border">
                    <p className="text-sm text-kavox-charcoal"><span className="font-semibold">Fabric:</span> {product.fabric}</p>
                    {product.fit && <p className="text-sm text-kavox-charcoal mt-1"><span className="font-semibold">Fit:</span> {product.fit}</p>}
                    {product.washCare && <p className="text-sm text-kavox-charcoal mt-1"><span className="font-semibold">Care:</span> {product.washCare}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Reviews */}
            {activeTab === 'reviews' && (
              <div className="max-w-3xl">
                {/* Summary */}
                <div className="flex flex-col sm:flex-row gap-8 mb-8 pb-8 border-b border-kavox-border">
                  <div className="text-center">
                    <div className="text-6xl font-bold text-kavox-black">{product.rating?.toFixed(1)}</div>
                    <StarRating rating={product.rating} size="md" />
                    <p className="text-sm text-kavox-gray mt-1 font-light">{product.reviewCount} reviews</p>
                  </div>
                  {product.ratingDistribution && (
                    <div className="flex-1 space-y-2">
                      {[5,4,3,2,1].map(star => {
                        const count = product.ratingDistribution?.[star] || 0;
                        const pct = product.reviewCount ? (count / product.reviewCount) * 100 : 0;
                        return (
                          <div key={star} className="flex items-center gap-3 text-sm">
                            <span className="text-xs text-kavox-gray w-4">{star}★</span>
                            <div className="flex-1 h-1.5 bg-kavox-sand rounded-full overflow-hidden">
                              <div className="h-full bg-kavox-accent rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-kavox-gray w-6">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Review list */}
                <div className="space-y-6 mb-10">
                  {product.reviews?.filter((r: any) => r.isVisible).slice(0, 5).map((review: any) => (
                    <div key={review._id} className="border-b border-kavox-border pb-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-kavox-accent-light flex items-center justify-center">
                          <span className="text-xs font-bold text-kavox-accent">{review.userName?.[0] || 'U'}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-kavox-black">{review.userName}</p>
                          <div className="flex items-center gap-2">
                            <StarRating rating={review.rating} size="xs" />
                            {review.isVerifiedPurchase && <span className="text-xs text-green-600 font-medium">✓ Verified</span>}
                          </div>
                        </div>
                        <span className="ml-auto text-xs text-kavox-silver font-light">
                          {new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {review.title && <p className="text-sm font-semibold text-kavox-charcoal mb-1">{review.title}</p>}
                      <p className="text-sm text-kavox-gray font-light leading-relaxed">{review.comment}</p>
                    </div>
                  ))}
                  {!product.reviews?.length && (
                    <p className="text-kavox-gray text-sm font-light text-center py-6">No reviews yet. Be the first!</p>
                  )}
                </div>

                {/* Write review */}
                <div className="bg-kavox-cream rounded-sm border border-kavox-border p-6">
                  <h3 className="font-bold text-kavox-black mb-4 text-sm uppercase tracking-wider">Write a Review</h3>
                  {!isAuthenticated ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-kavox-gray mb-3 font-light">Sign in to write a review</p>
                      <Link href="/auth/login" className="btn-primary btn-sm">Sign In</Link>
                    </div>
                  ) : (
                    <form onSubmit={handleReview} className="space-y-4">
                      <div>
                        <label className="label">Rating</label>
                        <div className="flex gap-2">
                          {[1,2,3,4,5].map(s => (
                            <button key={s} type="button" onClick={() => setReviewForm(p => ({ ...p, rating: s }))}>
                              <Star className={`w-7 h-7 transition-colors ${s <= reviewForm.rating ? 'fill-kavox-accent text-kavox-accent' : 'text-kavox-tan'}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="label">Title (optional)</label>
                        <input className="input" placeholder="Summarize your experience" value={reviewForm.title} onChange={e => setReviewForm(p => ({ ...p, title: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="label">Review</label>
                        <textarea className="input resize-none" rows={4} placeholder="What did you think? Quality, fit, delivery..." value={reviewForm.comment} onChange={e => setReviewForm(p => ({ ...p, comment: e.target.value }))} required />
                      </div>
                      <button type="submit" disabled={submittingReview} className="btn-primary btn-sm">
                        {submittingReview ? 'Submitting...' : 'Submit Review'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* Shipping */}
            {activeTab === 'shipping' && (
              <div className="max-w-2xl space-y-5">
                {[
                  { title: 'Delivery Timeline', items: ['Standard: 5–7 business days', 'Express: 2–3 business days (+ ₹99)', 'Custom/POD items: 7–10 business days', 'Metro cities: Usually 1–2 days faster'] },
                  { title: 'Shipping Charges', items: ['Free shipping on all orders above ₹499', 'Standard shipping: ₹49 for orders below ₹499', 'Express delivery: ₹99 extra'] },
                  { title: 'Return Policy', items: ['7-day easy returns from delivery date', 'Items must be unworn and with original tags', 'Initiate return from your Orders page', 'Refund within 5–7 business days after pickup'] },
                ].map(section => (
                  <div key={section.title} className="bg-kavox-cream rounded-sm border border-kavox-border p-5">
                    <h3 className="font-bold text-kavox-charcoal text-sm uppercase tracking-wider mb-3">{section.title}</h3>
                    <ul className="space-y-2">
                      {section.items.map(item => (
                        <li key={item} className="flex items-start gap-2 text-sm text-kavox-gray font-light">
                          <span className="text-kavox-accent mt-0.5 flex-shrink-0">✓</span>{item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RELATED PRODUCTS ──────────────────────────── */}
        {related.length > 0 && (
          <div className="mt-16">
            <div className="flex items-baseline justify-between mb-8">
              <div>
                <div className="section-eyebrow">You May Also Like</div>
                <h2 className="section-title">Similar Products</h2>
              </div>
              <Link href={`/shop?category=${product.category}`} className="text-sm font-semibold text-kavox-gray hover:text-kavox-black flex items-center gap-1">
                See all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-8">
              {related.slice(0, 4).map((p: any, i: number) => (
                <div key={p._id} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.07}s`, animationFillMode: 'both' }}>
                  <ProductCard product={p} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Image zoom modal */}
      {zoomOpen && mainImage && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setZoomOpen(false)}>
          <img src={mainImage} alt={product.name} className="max-w-full max-h-full object-contain rounded" />
          <button className="absolute top-4 right-4 text-white text-2xl hover:text-kavox-accent" onClick={() => setZoomOpen(false)}>✕</button>
        </div>
      )}
    </div>
  );
}
