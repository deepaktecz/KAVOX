'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SlidersHorizontal, ChevronDown, X, LayoutGrid, LayoutList } from 'lucide-react';
import { useAppDispatch, useAppSelector, useDebounce } from '@/hooks';
import { fetchProducts, setFilter, resetFilters, fetchCategories } from '@/store/slices/productSlice';
import { ProductCard, ProductCardSkeleton } from '@/components/ui';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const SORT_OPTIONS = [
  { label: 'Featured', value: '-createdAt' },
  { label: 'Price: Low to High', value: 'price' },
  { label: 'Price: High to Low', value: '-price' },
  { label: 'Best Rating', value: '-rating' },
  { label: 'Best Selling', value: '-sales' },
  { label: 'Newest', value: '-createdAt' },
  { label: 'Most Discounted', value: '-discount' },
];
const PRICE_RANGES = [
  { label: 'Under ₹500', min: 0, max: 500 },
  { label: '₹500 – ₹1,000', min: 500, max: 1000 },
  { label: '₹1,000 – ₹2,000', min: 1000, max: 2000 },
  { label: 'Above ₹2,000', min: 2000, max: 10000 },
];

export default function ShopPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items: products, loading, total, page, pages, filters, categories } = useAppSelector(s => s.product);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [gridCols, setGridCols] = useState<3 | 4>(3);

  // Sync URL params → filters
  useEffect(() => {
    const params: Record<string, string> = {};
    searchParams.forEach((val, key) => { params[key] = val; });
    if (Object.keys(params).length > 0) dispatch(setFilter(params));
  }, []);

  useEffect(() => { dispatch(fetchCategories()); }, [dispatch]);

  const loadProducts = useCallback(() => {
    const params: any = { page: currentPage, limit: gridCols === 4 ? 16 : 12 };
    if (filters.category) params.category = filters.category;
    if (filters.minPrice) params.minPrice = filters.minPrice;
    if (filters.maxPrice) params.maxPrice = filters.maxPrice;
    if (filters.size) params.size = filters.size;
    if (filters.color) params.color = filters.color;
    if (filters.sort) params.sort = filters.sort;
    if (filters.search) params.search = filters.search;
    dispatch(fetchProducts(params));
  }, [dispatch, filters, currentPage, gridCols]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleFilterChange = (key: string, val: string) => {
    dispatch(setFilter({ [key]: val }));
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    dispatch(resetFilters());
    setCurrentPage(1);
  };

  const activeFilterCount = [filters.category, filters.minPrice, filters.size, filters.color]
    .filter(Boolean).length;

  return (
    <div className="min-h-screen bg-kavox-cream">
      {/* Page Header */}
      <div className="bg-white border-b border-kavox-border">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
          <nav className="text-xs text-kavox-gray mb-3 flex items-center gap-2">
            <a href="/" className="hover:text-kavox-accent transition-colors">Home</a>
            <span>/</span>
            <span className="text-kavox-charcoal font-medium">Shop</span>
            {filters.category && <><span>/</span><span className="text-kavox-charcoal font-medium">{filters.category}</span></>}
          </nav>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-bold text-kavox-black">
                {filters.category || 'All Products'}
              </h1>
              {!loading && <p className="text-sm text-kavox-gray mt-1 font-light">{total.toLocaleString()} products found</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
        <div className="flex gap-8">

          {/* ── FILTER SIDEBAR ──────────────────────────────── */}
          <aside className={`
            fixed lg:static inset-y-0 left-0 z-40 w-72 bg-white lg:bg-transparent overflow-y-auto
            transition-transform duration-300 lg:translate-x-0 shadow-kavox-xl lg:shadow-none
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            flex-shrink-0 lg:w-60 xl:w-64
          `}>
            <div className="lg:sticky lg:top-24 space-y-0 bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-kavox-border">
                <h3 className="font-bold text-sm uppercase tracking-wider text-kavox-charcoal">Filters</h3>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <button onClick={handleClearFilters} className="text-xs text-red-500 hover:text-red-700 font-medium">
                      Clear ({activeFilterCount})
                    </button>
                  )}
                  <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
                    <X className="w-5 h-5 text-kavox-gray" />
                  </button>
                </div>
              </div>

              {/* Category */}
              <FilterSection title="Category">
                <div className="space-y-1.5">
                  <button
                    onClick={() => handleFilterChange('category', '')}
                    className={`w-full text-left text-sm px-2 py-1.5 rounded transition-colors ${!filters.category ? 'font-semibold text-kavox-black bg-kavox-cream' : 'text-kavox-gray hover:text-kavox-black'}`}
                  >
                    All Categories
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.name}
                      onClick={() => handleFilterChange('category', cat.name)}
                      className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center justify-between transition-colors ${filters.category === cat.name ? 'font-semibold text-kavox-black bg-kavox-cream' : 'text-kavox-gray hover:text-kavox-black'}`}
                    >
                      <span>{cat.name}</span>
                      <span className="text-xs text-kavox-silver">{(cat as any).count}</span>
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Price */}
              <FilterSection title="Price Range">
                <div className="space-y-1.5">
                  {PRICE_RANGES.map(range => (
                    <label key={range.label} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="radio"
                        name="price"
                        className="accent-kavox-accent"
                        checked={filters.minPrice === String(range.min) && filters.maxPrice === String(range.max)}
                        onChange={() => { handleFilterChange('minPrice', String(range.min)); dispatch(setFilter({ maxPrice: String(range.max) })); }}
                      />
                      <span className="text-sm text-kavox-gray group-hover:text-kavox-black transition-colors">{range.label}</span>
                    </label>
                  ))}
                </div>
              </FilterSection>

              {/* Size */}
              <FilterSection title="Size">
                <div className="flex flex-wrap gap-2">
                  {SIZES.map(size => (
                    <button
                      key={size}
                      onClick={() => handleFilterChange('size', filters.size === size ? '' : size)}
                      className={`w-10 h-10 text-xs font-semibold border rounded-sm transition-all duration-200
                        ${filters.size === size ? 'bg-kavox-black text-white border-kavox-black' : 'border-kavox-border text-kavox-gray hover:border-kavox-black hover:text-kavox-black'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Rating */}
              <FilterSection title="Min Rating">
                <div className="space-y-2">
                  {[4, 3, 2].map(r => (
                    <label key={r} className="flex items-center gap-3 cursor-pointer group">
                      <input type="radio" name="rating" className="accent-kavox-accent" onChange={() => handleFilterChange('rating', String(r))} />
                      <span className="text-sm text-kavox-gray group-hover:text-kavox-black flex items-center gap-1">
                        {'★'.repeat(r)}{'☆'.repeat(5 - r)} <span className="text-kavox-silver">& above</span>
                      </span>
                    </label>
                  ))}
                </div>
              </FilterSection>
            </div>
          </aside>

          {/* Overlay for mobile sidebar */}
          {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

          {/* ── MAIN CONTENT ────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6 gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden flex items-center gap-2 text-sm font-medium text-kavox-charcoal border border-kavox-border rounded-sm px-4 py-2.5 hover:border-kavox-charcoal transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters {activeFilterCount > 0 && <span className="bg-kavox-accent text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">{activeFilterCount}</span>}
              </button>

              <div className="flex items-center gap-3 ml-auto">
                {/* Grid toggle */}
                <div className="hidden md:flex gap-1 border border-kavox-border rounded-sm overflow-hidden">
                  <button onClick={() => setGridCols(3)} className={`p-2 ${gridCols === 3 ? 'bg-kavox-charcoal text-white' : 'text-kavox-gray hover:bg-kavox-sand'}`}>
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button onClick={() => setGridCols(4)} className={`p-2 ${gridCols === 4 ? 'bg-kavox-charcoal text-white' : 'text-kavox-gray hover:bg-kavox-sand'}`}>
                    <LayoutList className="w-4 h-4" />
                  </button>
                </div>

                {/* Sort */}
                <div className="relative">
                  <select
                    value={filters.sort}
                    onChange={e => handleFilterChange('sort', e.target.value)}
                    className="appearance-none border border-kavox-border rounded-sm px-4 py-2.5 pr-8 text-sm text-kavox-charcoal bg-white cursor-pointer focus:outline-none focus:border-kavox-charcoal"
                  >
                    {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-kavox-gray pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Active filters chips */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {filters.category && (
                  <span className="flex items-center gap-1 text-xs bg-kavox-charcoal text-white px-3 py-1.5 rounded-full font-medium">
                    {filters.category}
                    <button onClick={() => handleFilterChange('category', '')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filters.size && (
                  <span className="flex items-center gap-1 text-xs bg-kavox-charcoal text-white px-3 py-1.5 rounded-full font-medium">
                    Size: {filters.size}
                    <button onClick={() => handleFilterChange('size', '')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {filters.minPrice && (
                  <span className="flex items-center gap-1 text-xs bg-kavox-charcoal text-white px-3 py-1.5 rounded-full font-medium">
                    ₹{filters.minPrice}–{filters.maxPrice}
                    <button onClick={() => { dispatch(setFilter({ minPrice: '', maxPrice: '' })); }}><X className="w-3 h-3" /></button>
                  </span>
                )}
              </div>
            )}

            {/* Product Grid */}
            {loading ? (
              <div className={`grid gap-x-5 gap-y-8 ${gridCols === 4 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'}`}>
                {Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="text-xl font-bold text-kavox-charcoal mb-2">No products found</h3>
                <p className="text-kavox-gray mb-6 font-light">Try adjusting your filters or search term.</p>
                <button onClick={handleClearFilters} className="btn-primary btn-sm">Clear All Filters</button>
              </div>
            ) : (
              <>
                <div className={`grid gap-x-5 gap-y-8 ${gridCols === 4 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'}`}>
                  {products.map((p, i) => (
                    <div key={p._id} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.04}s`, animationFillMode: 'both' }}>
                      <ProductCard product={p} />
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {pages > 1 && (
                  <div className="flex justify-center gap-2 mt-12">
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-4 py-2 border border-kavox-border rounded-sm text-sm hover:border-kavox-charcoal disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← Prev</button>
                    {Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1).map(p => (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`w-10 h-10 rounded-sm text-sm font-medium border transition-colors ${p === currentPage ? 'bg-kavox-black text-white border-kavox-black' : 'border-kavox-border text-kavox-gray hover:border-kavox-charcoal'}`}
                      >
                        {p}
                      </button>
                    ))}
                    <button disabled={currentPage === pages} onClick={() => setCurrentPage(p => p + 1)} className="px-4 py-2 border border-kavox-border rounded-sm text-sm hover:border-kavox-charcoal disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next →</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="px-5 py-4 border-b border-kavox-border">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-kavox-charcoal">{title}</span>
        <ChevronDown className={`w-4 h-4 text-kavox-gray transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && children}
    </div>
  );
}
