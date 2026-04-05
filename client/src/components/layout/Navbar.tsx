'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, ShoppingBag, Heart, User, Menu, X, ChevronDown, LogOut, Package, Settings } from 'lucide-react';
import { useAppDispatch, useAppSelector, useDebounce } from '@/hooks';
import { toggleCart, selectCartCount } from '@/store/slices/cartSlice';
import { logoutUser } from '@/store/slices/authSlice';
import { productApi } from '@/lib/api';

const NAV_LINKS = [
  { label: 'Shop', href: '/shop' },
  { label: 'New Arrivals', href: '/shop?sort=-createdAt' },
  { label: 'Custom Design', href: '/design-studio' },
  {
    label: 'Categories', href: '#',
    children: [
      { label: 'T-Shirts', href: '/shop?category=T-Shirts' },
      { label: 'Oversized', href: '/shop?category=Oversized+T-Shirts' },
      { label: 'Graphic Tees', href: '/shop?category=Graphic+Tees' },
      { label: 'Hoodies', href: '/shop?category=Hoodies' },
      { label: 'Caps & Hats', href: '/shop?category=Caps+%26+Hats' },
    ],
  },
  { label: 'Sale', href: '/shop?sort=-discountPercent', className: 'text-red-500' },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const cartCount = useAppSelector(selectCartCount);
  const { user, isAuthenticated } = useAppSelector(s => s.auth);

  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounce(searchQuery, 350);

  // Scroll shadow
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on navigate
  useEffect(() => { setMobileOpen(false); setSearchOpen(false); }, [pathname]);

  // Debounced search
  useEffect(() => {
    if (!debounced.trim() || debounced.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    productApi.search({ q: debounced, limit: 6 })
      .then(res => setSearchResults(res.data.data.products || []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [debounced]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    setUserMenuOpen(false);
    router.push('/');
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '?');

  return (
    <>
      {/* Announcement Bar */}
      <div className="bg-kavox-black text-white text-center py-2.5 text-xs tracking-widest font-medium">
        🚚 Free shipping on orders over ₹499 &nbsp;·&nbsp;
        <span className="text-kavox-accent">Use KAVOX15</span> for 15% off
      </div>

      {/* Main Navbar */}
      <header className={`sticky top-0 z-50 bg-white transition-shadow duration-300 ${scrolled ? 'shadow-kavox' : 'border-b border-kavox-border'}`}>
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between h-16 md:h-[68px]">

            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <span className="font-display text-2xl font-bold tracking-tight text-kavox-black hover:text-kavox-accent transition-colors">
                KAVOX
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-8">
              {NAV_LINKS.map(link => (
                <div
                  key={link.label}
                  className="relative"
                  onMouseEnter={() => link.children && setActiveDropdown(link.label)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                  <Link
                    href={link.href}
                    className={`flex items-center gap-1 text-sm font-medium tracking-wide transition-colors duration-200
                      ${link.className || ''}
                      ${isActive(link.href) ? 'text-kavox-black font-semibold' : 'text-kavox-gray hover:text-kavox-black'}
                    `}
                  >
                    {link.label}
                    {link.children && <ChevronDown className="w-3.5 h-3.5" />}
                  </Link>

                  {/* Mega dropdown */}
                  {link.children && activeDropdown === link.label && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-kavox-border rounded-sm shadow-kavox w-52 py-2 z-50 animate-fade-in-up">
                      {link.children.map(child => (
                        <Link
                          key={child.label}
                          href={child.href}
                          className="block px-4 py-2.5 text-sm text-kavox-gray hover:text-kavox-black hover:bg-kavox-cream transition-colors"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {/* Search */}
              <div className="relative" ref={searchRef}>
                <button
                  onClick={() => setSearchOpen(!searchOpen)}
                  className="btn-icon"
                  aria-label="Search"
                >
                  <Search className="w-5 h-5" />
                </button>

                {searchOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-kavox-border rounded-sm shadow-kavox z-50 animate-scale-in">
                    <div className="flex items-center px-3 py-2.5 border-b border-kavox-border gap-2">
                      <Search className="w-4 h-4 text-kavox-silver flex-shrink-0" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search t-shirts, hoodies..."
                        className="flex-1 text-sm outline-none bg-transparent text-kavox-charcoal placeholder-kavox-silver"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && searchQuery.trim()) { router.push(`/shop?search=${encodeURIComponent(searchQuery)}`); setSearchOpen(false); } }}
                      />
                      {searchQuery && <button onClick={() => setSearchQuery('')}><X className="w-4 h-4 text-kavox-silver" /></button>}
                    </div>

                    {searchLoading && (
                      <div className="p-4 text-center text-sm text-kavox-gray">Searching...</div>
                    )}

                    {!searchLoading && searchResults.length > 0 && (
                      <div className="py-2 max-h-72 overflow-y-auto">
                        {searchResults.map(product => (
                          <Link
                            key={product._id}
                            href={`/product/${product.slug}`}
                            onClick={() => setSearchOpen(false)}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-kavox-cream transition-colors"
                          >
                            <div className="w-10 h-12 bg-kavox-sand rounded flex-shrink-0 overflow-hidden">
                              <img src={product.images?.[0]?.url || '/placeholder.jpg'} alt={product.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-kavox-black line-clamp-1">{product.name}</p>
                              <p className="text-xs text-kavox-accent font-bold">
                                ₹{(product.discountedPrice || product.sellingPrice).toLocaleString('en-IN')}
                              </p>
                            </div>
                          </Link>
                        ))}
                        <button
                          className="w-full text-center text-xs font-semibold text-kavox-accent py-2.5 border-t border-kavox-border hover:bg-kavox-cream"
                          onClick={() => { router.push(`/shop?search=${encodeURIComponent(searchQuery)}`); setSearchOpen(false); }}
                        >
                          See all results →
                        </button>
                      </div>
                    )}

                    {!searchLoading && searchQuery.length > 1 && searchResults.length === 0 && (
                      <div className="p-4 text-center text-sm text-kavox-gray">No products found for "{searchQuery}"</div>
                    )}
                  </div>
                )}
              </div>

              {/* Wishlist */}
              <Link href="/wishlist" className="btn-icon hidden sm:flex" aria-label="Wishlist">
                <Heart className="w-5 h-5" />
              </Link>

              {/* Cart */}
              <button onClick={() => dispatch(toggleCart())} className="btn-icon relative" aria-label="Cart">
                <ShoppingBag className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-kavox-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] min-h-[18px] px-1">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>

              {/* User menu */}
              <div className="relative hidden sm:block" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="btn-icon"
                  aria-label="Account"
                >
                  {isAuthenticated && user?.avatar?.url ? (
                    <img src={user.avatar.url} alt={user.firstName} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-kavox-border rounded-sm shadow-kavox z-50 py-1 animate-scale-in">
                    {isAuthenticated ? (
                      <>
                        <div className="px-4 py-3 border-b border-kavox-border">
                          <p className="text-sm font-semibold text-kavox-black">{user?.firstName} {user?.lastName}</p>
                          <p className="text-xs text-kavox-gray truncate">{user?.email}</p>
                        </div>
                        <Link href="/orders" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-kavox-gray hover:text-kavox-black hover:bg-kavox-cream" onClick={() => setUserMenuOpen(false)}>
                          <Package className="w-4 h-4" /> My Orders
                        </Link>
                        {user?.role === 'seller' && (
                          <Link href="/seller/dashboard" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-kavox-gray hover:text-kavox-black hover:bg-kavox-cream" onClick={() => setUserMenuOpen(false)}>
                            <Settings className="w-4 h-4" /> Seller Dashboard
                          </Link>
                        )}
                        {(user?.role === 'admin' || user?.role === 'super_admin') && (
                          <Link href="/admin/dashboard" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-kavox-gray hover:text-kavox-black hover:bg-kavox-cream" onClick={() => setUserMenuOpen(false)}>
                            <Settings className="w-4 h-4" /> Admin Panel
                          </Link>
                        )}
                        <Link href="/profile" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-kavox-gray hover:text-kavox-black hover:bg-kavox-cream" onClick={() => setUserMenuOpen(false)}>
                          <User className="w-4 h-4" /> Profile
                        </Link>
                        <div className="border-t border-kavox-border mt-1">
                          <button onClick={handleLogout} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 w-full text-left">
                            <LogOut className="w-4 h-4" /> Sign Out
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Link href="/auth/login" className="block px-4 py-2.5 text-sm text-kavox-charcoal hover:bg-kavox-cream font-medium" onClick={() => setUserMenuOpen(false)}>Sign In</Link>
                        <Link href="/auth/register" className="block px-4 py-2.5 text-sm text-kavox-gray hover:bg-kavox-cream" onClick={() => setUserMenuOpen(false)}>Create Account</Link>
                        <div className="border-t border-kavox-border mt-1 px-4 py-2.5">
                          <Link href="/auth/register?role=seller" className="text-xs text-kavox-accent font-semibold hover:underline" onClick={() => setUserMenuOpen(false)}>Sell on KAVOX →</Link>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Mobile hamburger */}
              <button
                className="lg:hidden btn-icon ml-1"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-kavox-border bg-white animate-slide-in-left">
            <div className="max-w-screen-xl mx-auto px-4 py-4 space-y-1">
              {NAV_LINKS.map(link => (
                <div key={link.label}>
                  <Link
                    href={link.href}
                    className={`block py-3 text-sm font-medium border-b border-kavox-border/50 ${link.className || 'text-kavox-charcoal'}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                  {link.children && (
                    <div className="pl-4 space-y-1 py-1">
                      {link.children.map(child => (
                        <Link key={child.label} href={child.href} className="block py-2 text-sm text-kavox-gray" onClick={() => setMobileOpen(false)}>{child.label}</Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="pt-4 space-y-2">
                {isAuthenticated ? (
                  <>
                    <Link href="/orders" className="block py-2 text-sm font-medium text-kavox-charcoal" onClick={() => setMobileOpen(false)}>My Orders</Link>
                    <button onClick={() => { handleLogout(); setMobileOpen(false); }} className="block py-2 text-sm text-red-500 font-medium">Sign Out</button>
                  </>
                ) : (
                  <>
                    <Link href="/auth/login" className="btn-primary w-full text-center" onClick={() => setMobileOpen(false)}>Sign In</Link>
                    <Link href="/auth/register" className="btn-secondary w-full text-center" onClick={() => setMobileOpen(false)}>Register</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
