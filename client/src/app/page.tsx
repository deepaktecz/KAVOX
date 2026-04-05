'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Truck, RefreshCw, Shield, Star } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchFeatured, fetchTrending, fetchNewArrivals, fetchCategories } from '@/store/slices/productSlice';
import { ProductCard, ProductCardSkeleton, StarRating } from '@/components/ui';

// ── Marquee Strip ─────────────────────────────────────────────
const MARQUEE_ITEMS = [
  '100% Premium Cotton', 'Free Shipping ₹499+', 'Print on Demand', 'New Drop Every Week',
  'Easy Returns', '220 GSM Fabric', 'Custom Designs', 'Delivered in 7 Days',
];

function MarqueeStrip() {
  const all = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div className="bg-kavox-charcoal py-3 overflow-hidden">
      <div className="flex animate-[marquee_30s_linear_infinite] whitespace-nowrap" style={{ width: 'max-content' }}>
        {all.map((item, i) => (
          <span key={i} className="flex items-center gap-4 px-6 text-xs font-semibold tracking-widest uppercase text-white/60">
            <span className="w-1 h-1 rounded-full bg-kavox-accent flex-shrink-0" />
            {item}
          </span>
        ))}
      </div>
      <style>{`@keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

// ── Trust Badges ──────────────────────────────────────────────
const TRUST = [
  { icon: Truck, label: 'Free Shipping', sub: 'On orders above ₹499' },
  { icon: RefreshCw, label: '7-Day Returns', sub: 'No questions asked' },
  { icon: Shield, label: 'Secure Payment', sub: 'Razorpay protected' },
  { icon: Star, label: '4.9★ Rating', sub: 'From 10,000+ orders' },
];

// ── Category Data ─────────────────────────────────────────────
const CATEGORIES = [
  { name: 'T-Shirts', href: '/shop?category=T-Shirts', color: 'bg-kavox-sand', textColor: 'text-kavox-charcoal', count: '240+ styles' },
  { name: 'Oversized', href: '/shop?category=Oversized+T-Shirts', color: 'bg-kavox-charcoal', textColor: 'text-white', count: '120+ styles' },
  { name: 'Graphic Tees', href: '/shop?category=Graphic+Tees', color: 'bg-kavox-accent-light', textColor: 'text-kavox-dark', count: '80+ styles' },
  { name: 'Hoodies', href: '/shop?category=Hoodies', color: 'bg-kavox-dark', textColor: 'text-white', count: '60+ styles' },
  { name: 'Custom Design', href: '/design-studio', color: 'bg-kavox-accent', textColor: 'text-white', count: 'Unlimited' },
];

// ── Reviews ───────────────────────────────────────────────────
const REVIEWS = [
  { name: 'Arjun K.', role: 'Verified Buyer', rating: 5, text: 'The quality is unreal. I\'ve ordered from many brands but KAVOX fabric feels premium. Worth every rupee.' },
  { name: 'Priya S.', role: 'Verified Buyer', rating: 5, text: 'Custom design came out exactly as I expected! Great colors, no fading after 10+ washes.' },
  { name: 'Rahul M.', role: 'Verified Buyer', rating: 5, text: 'Fast delivery, amazing packaging. The oversized fit is perfect. Already ordered 3 more!' },
];

export default function HomePage() {
  const dispatch = useAppDispatch();
  const { featured, trending, newArrivals } = useAppSelector(s => s.product);
  const [featuredLoading, setFL] = useState(true);
  const [trendingLoading, setTL] = useState(true);

  useEffect(() => {
    dispatch(fetchFeatured()).finally(() => setFL(false));
    dispatch(fetchTrending()).finally(() => setTL(false));
    dispatch(fetchNewArrivals());
    dispatch(fetchCategories());
  }, [dispatch]);

  return (
    <div>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative bg-kavox-sand overflow-hidden">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="grid lg:grid-cols-2 gap-0 min-h-[calc(100vh-104px)]">
            {/* Left: Copy */}
            <div className="flex flex-col justify-center py-16 lg:py-24 lg:pr-16">
              <div className="section-eyebrow animate-fade-in-up stagger-1">
                New Collection — 2025
              </div>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold text-kavox-black leading-[0.95] tracking-tight mb-6 animate-fade-in-up stagger-2" style={{ animationFillMode: 'both' }}>
                Wear Your<br />
                <span className="italic text-kavox-accent">Story.</span>
              </h1>
              <p className="text-lg text-kavox-gray font-light leading-relaxed max-w-md mb-8 animate-fade-in-up stagger-3" style={{ animationFillMode: 'both' }}>
                Premium 100% cotton t-shirts. Design your own or shop our curated collections. Every piece made to last.
              </p>
              <div className="flex flex-wrap gap-4 animate-fade-in-up stagger-4" style={{ animationFillMode: 'both' }}>
                <Link href="/shop" className="btn-primary btn-lg">
                  Shop Now <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/design-studio" className="btn-secondary btn-lg">
                  Design Your Own
                </Link>
              </div>
              {/* Social proof */}
              <div className="flex items-center gap-4 mt-10 animate-fade-in-up stagger-5" style={{ animationFillMode: 'both' }}>
                <div className="flex -space-x-2">
                  {['bg-kavox-accent', 'bg-kavox-charcoal', 'bg-kavox-brown', 'bg-kavox-tan'].map((c, i) => (
                    <div key={i} className={`w-8 h-8 rounded-full ${c} border-2 border-kavox-sand`} />
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(s => <Star key={s} className="w-3.5 h-3.5 fill-kavox-accent text-kavox-accent" />)}
                    <span className="text-sm font-bold text-kavox-black ml-1">4.9</span>
                  </div>
                  <p className="text-xs text-kavox-gray font-light">From 10,000+ happy customers</p>
                </div>
              </div>
            </div>

            {/* Right: Hero visual — CSS art (no image) */}
            <div className="relative hidden lg:flex items-end justify-center overflow-hidden bg-gradient-to-br from-kavox-sand via-kavox-tan/30 to-kavox-cream pt-16">
              {/* Decorative circles */}
              <div className="absolute top-10 right-10 w-64 h-64 rounded-full bg-kavox-accent/8 animate-float" />
              <div className="absolute bottom-20 right-24 w-40 h-40 rounded-full bg-kavox-brown/10" />
              {/* T-shirt silhouette placeholder */}
              <div className="relative z-10 mb-0">
                <div className="w-80 h-96 bg-kavox-charcoal rounded-t-[140px] rounded-b-sm relative mx-auto shadow-kavox-xl">
                  {/* Collar */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-16 bg-kavox-charcoal rounded-b-full" />
                  {/* Sleeves */}
                  <div className="absolute top-8 -left-12 w-16 h-24 bg-kavox-charcoal rounded-l-full rotate-12" />
                  <div className="absolute top-8 -right-12 w-16 h-24 bg-kavox-charcoal rounded-r-full -rotate-12" />
                  {/* Text on shirt */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pt-20 gap-1">
                    <span className="font-display text-white/90 text-3xl font-bold tracking-wider">KAVOX</span>
                    <div className="w-8 h-px bg-white/40 my-1" />
                    <span className="text-white/50 text-xs tracking-widest font-light uppercase">Premium Cotton</span>
                  </div>
                </div>
              </div>
              {/* Floating badge */}
              <div className="absolute top-20 left-8 bg-white rounded-sm shadow-kavox px-4 py-3 animate-float" style={{ animationDelay: '1s' }}>
                <p className="text-xs font-bold text-kavox-black">New Drop 🔥</p>
                <p className="text-[10px] text-kavox-gray font-light">Every Friday</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE ─────────────────────────────────────────── */}
      <MarqueeStrip />

      {/* ── TRUST BADGES ────────────────────────────────────── */}
      <section className="bg-white border-b border-kavox-border">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {TRUST.map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-kavox-accent-light flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-kavox-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-kavox-black">{label}</p>
                  <p className="text-xs text-kavox-gray font-light">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CATEGORIES ──────────────────────────────────────── */}
      <section className="py-16 md:py-20">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-baseline justify-between mb-10">
            <div>
              <div className="section-eyebrow">Collections</div>
              <h2 className="section-title">Shop by Category</h2>
            </div>
            <Link href="/shop" className="hidden sm:flex items-center gap-2 text-sm font-semibold text-kavox-gray hover:text-kavox-black transition-colors">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Category Cards — CSS grid layout like references */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {CATEGORIES.map((cat, i) => (
              <Link
                key={cat.name}
                href={cat.href}
                className={`group relative rounded-sm overflow-hidden ${cat.color} transition-all duration-300 hover:-translate-y-1 hover:shadow-kavox`}
                style={{ minHeight: i === 0 ? 220 : 160 }}
              >
                <div className="absolute inset-0 flex flex-col justify-end p-5">
                  <h3 className={`font-display text-xl font-bold ${cat.textColor} mb-1`}>{cat.name}</h3>
                  <p className={`text-xs font-light opacity-70 ${cat.textColor} flex items-center gap-1`}>
                    {cat.count} <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED PRODUCTS ───────────────────────────────── */}
      <section className="py-16 bg-white">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-baseline justify-between mb-10">
            <div>
              <div className="section-eyebrow">Handpicked</div>
              <h2 className="section-title">Featured <span className="font-display italic font-normal text-kavox-accent">Drops</span></h2>
            </div>
            <Link href="/shop?sort=-salesCount" className="text-sm font-semibold text-kavox-gray hover:text-kavox-black flex items-center gap-1 transition-colors">
              All Products <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
            {featuredLoading
              ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : featured.slice(0, 8).map((p, i) => (
                <div key={p._id} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.06}s`, animationFillMode: 'both' }}>
                  <ProductCard product={p} />
                </div>
              ))
            }
          </div>
        </div>
      </section>

      {/* ── EDITORIAL BANNER ────────────────────────────────── */}
      <section className="grid lg:grid-cols-2 min-h-[480px]">
        {/* Left — dark editorial */}
        <div className="bg-kavox-charcoal flex flex-col justify-center px-10 md:px-16 py-16">
          <div className="section-eyebrow text-kavox-accent/70">Design Studio</div>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            These Are Not<br />Colors. These Are<br />
            <span className="italic text-kavox-accent">States of Being.</span>
          </h2>
          <p className="text-kavox-silver font-light text-sm leading-relaxed mb-8 max-w-md">
            Upload your design, choose your canvas, and wear your creativity. Our print-on-demand system handles the rest.
          </p>
          <Link href="/design-studio" className="btn-light inline-flex items-center gap-2 bg-white text-kavox-black px-8 py-4 font-semibold text-sm tracking-widest uppercase hover:bg-kavox-accent hover:text-white transition-all duration-300 w-fit rounded-sm">
            Start Designing <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Right — color rack CSS art */}
        <div className="bg-kavox-sand flex items-center justify-center py-16 overflow-hidden">
          <div className="relative">
            {/* Hanger rod */}
            <div className="w-72 h-1 bg-kavox-charcoal rounded-full mb-0 mx-auto" />
            {/* T-shirt silhouettes */}
            <div className="flex gap-3 mt-0 pt-0">
              {['#1C1C1C', '#6B7FA3', '#3D5A3E', '#C8956C', '#8B2635'].map((color, i) => (
                <div key={color} className="flex flex-col items-center">
                  {/* Hook */}
                  <div className="w-px h-4 bg-kavox-charcoal/40" />
                  {/* Shirt */}
                  <div
                    className="w-16 h-20 rounded-t-3xl relative shadow-kavox-sm hover:-translate-y-2 transition-transform duration-300 cursor-pointer"
                    style={{ backgroundColor: color, animationDelay: `${i * 0.1}s` }}
                  >
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-4 rounded-b-full" style={{ backgroundColor: color }} />
                    <div className="absolute top-2 -left-4 w-5 h-8 rounded-l-full rotate-6" style={{ backgroundColor: color }} />
                    <div className="absolute top-2 -right-4 w-5 h-8 rounded-r-full -rotate-6" style={{ backgroundColor: color }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-kavox-gray mt-4 font-light tracking-wider">10+ Colors Available</p>
          </div>
        </div>
      </section>

      {/* ── TRENDING ────────────────────────────────────────── */}
      <section className="py-16 md:py-20 bg-kavox-cream">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-baseline justify-between mb-10">
            <div>
              <div className="section-eyebrow">Bestsellers</div>
              <h2 className="section-title">Trending Now</h2>
            </div>
            <Link href="/shop?sort=-salesCount" className="text-sm font-semibold text-kavox-gray hover:text-kavox-black flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-8">
            {trendingLoading
              ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : trending.slice(0, 4).map((p, i) => (
                <div key={p._id} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.07}s`, animationFillMode: 'both' }}>
                  <ProductCard product={p} />
                </div>
              ))
            }
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────── */}
      <section className="py-16 bg-white">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="text-center mb-12">
            <div className="section-eyebrow justify-center">
              Customer Love
            </div>
            <h2 className="section-title">What They Say</h2>
            <div className="flex items-center justify-center gap-2 mt-3">
              <StarRating rating={4.9} size="md" />
              <span className="text-lg font-bold text-kavox-black">4.9</span>
              <span className="text-sm text-kavox-gray font-light">/ 5.0 from 10,000+ reviews</span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {REVIEWS.map((review, i) => (
              <div
                key={review.name}
                className="card p-6 animate-fade-in-up"
                style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'both' }}
              >
                <StarRating rating={review.rating} />
                <p className="text-sm text-kavox-gray font-light leading-relaxed mt-3 mb-4 italic">
                  "{review.text}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-kavox-accent-light flex items-center justify-center">
                    <span className="text-xs font-bold text-kavox-accent">{review.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-kavox-black">{review.name}</p>
                    <p className="text-xs text-kavox-gray font-light">{review.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NEWSLETTER ──────────────────────────────────────── */}
      <section className="bg-kavox-charcoal py-16 md:py-20">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-3">
            Get Early Access
          </h2>
          <p className="text-kavox-silver font-light mb-8">
            Join 50,000+ subscribers. Be first for new drops, exclusive offers & style tips.
          </p>
          <form className="flex gap-0 max-w-md mx-auto rounded-sm overflow-hidden shadow-kavox-xl" onSubmit={e => e.preventDefault()}>
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 px-5 py-4 bg-white text-kavox-charcoal text-sm outline-none placeholder:text-kavox-silver"
            />
            <button type="submit" className="bg-kavox-accent hover:bg-kavox-accent-dark text-white text-xs font-bold tracking-widest uppercase px-6 py-4 transition-colors whitespace-nowrap">
              Subscribe
            </button>
          </form>
          <p className="text-kavox-gray text-xs mt-3 font-light">No spam. Unsubscribe anytime.</p>
        </div>
      </section>
    </div>
  );
}

// need useState
import { useState } from 'react';
