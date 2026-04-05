import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { productApi, getErrorMessage } from '@/lib/api';

interface Product {
  _id: string; name: string; slug: string; brand: string; category: string;
  images: { url: string; isMain?: boolean }[];
  sellingPrice: number; discountedPrice?: number; discountPercent?: number;
  rating: number; reviewCount: number;
  availableSizes: string[]; availableColors: { name: string; hexCode: string }[];
  totalStock: number; isFeatures?: boolean; isPOD?: boolean;
  salesCount?: number; status?: string;
}

interface ProductState {
  items: Product[]; featured: Product[]; trending: Product[]; newArrivals: Product[];
  categories: { name: string; count: number }[];
  currentProduct: any; related: Product[];
  loading: boolean; error: string | null;
  total: number; page: number; pages: number;
  filters: { category: string; minPrice: string; maxPrice: string; size: string; color: string; sort: string; search: string; };
}

const initialFilters = { category: '', minPrice: '', maxPrice: '', size: '', color: '', sort: '-createdAt', search: '' };

export const fetchProducts = createAsyncThunk('product/fetchAll', async (params: any, { rejectWithValue }) => {
  try { const { data } = await productApi.getAll(params); return data; }
  catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

export const fetchFeatured = createAsyncThunk('product/fetchFeatured', async (_, { rejectWithValue }) => {
  try { const { data } = await productApi.getFeatured(12); return data.data.products; }
  catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

export const fetchTrending = createAsyncThunk('product/fetchTrending', async (_, { rejectWithValue }) => {
  try { const { data } = await productApi.getTrending(); return data.data.products; }
  catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

export const fetchNewArrivals = createAsyncThunk('product/fetchNewArrivals', async (_, { rejectWithValue }) => {
  try { const { data } = await productApi.getNewArrivals(); return data.data.products; }
  catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

export const fetchCategories = createAsyncThunk('product/fetchCategories', async (_, { rejectWithValue }) => {
  try { const { data } = await productApi.getCategories(); return data.data.categories; }
  catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

export const fetchProduct = createAsyncThunk('product/fetchOne', async (slugOrId: string, { rejectWithValue }) => {
  try { const { data } = await productApi.getOne(slugOrId); return data.data.product; }
  catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

export const fetchRelated = createAsyncThunk('product/fetchRelated', async (id: string, { rejectWithValue }) => {
  try { const { data } = await productApi.getRelated(id); return data.data.products; }
  catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

const productSlice = createSlice({
  name: 'product',
  initialState: {
    items: [], featured: [], trending: [], newArrivals: [], categories: [],
    currentProduct: null, related: [],
    loading: false, error: null,
    total: 0, page: 1, pages: 1,
    filters: initialFilters,
  } as ProductState,
  reducers: {
    setFilter: (state, action: PayloadAction<Partial<ProductState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    resetFilters: (state) => { state.filters = initialFilters; },
    clearCurrentProduct: (state) => { state.currentProduct = null; state.related = []; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (s) => { s.loading = true; s.error = null; })
      .addCase(fetchProducts.fulfilled, (s, a) => {
        s.loading = false; s.items = a.payload.data.products;
        s.total = a.payload.meta?.total || 0; s.page = a.payload.meta?.page || 1; s.pages = a.payload.meta?.pages || 1;
      })
      .addCase(fetchProducts.rejected, (s, a) => { s.loading = false; s.error = a.payload as string; })
      .addCase(fetchFeatured.fulfilled, (s, a) => { s.featured = a.payload; })
      .addCase(fetchTrending.fulfilled, (s, a) => { s.trending = a.payload; })
      .addCase(fetchNewArrivals.fulfilled, (s, a) => { s.newArrivals = a.payload; })
      .addCase(fetchCategories.fulfilled, (s, a) => { s.categories = a.payload; })
      .addCase(fetchProduct.pending, (s) => { s.loading = true; s.currentProduct = null; })
      .addCase(fetchProduct.fulfilled, (s, a) => { s.loading = false; s.currentProduct = a.payload; })
      .addCase(fetchProduct.rejected, (s, a) => { s.loading = false; s.error = a.payload as string; })
      .addCase(fetchRelated.fulfilled, (s, a) => { s.related = a.payload; });
  },
});

export const { setFilter, resetFilters, clearCurrentProduct } = productSlice.actions;
export default productSlice.reducer;
