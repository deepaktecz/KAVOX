import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface WishlistItem {
  _id: string; name: string; slug: string; image: string;
  sellingPrice: number; discountedPrice?: number; rating: number;
}

const KEY = 'kavox_wishlist';
const load = (): WishlistItem[] => {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};
const save = (items: WishlistItem[]) => {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(items));
};

const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState: { items: load() } as { items: WishlistItem[] },
  reducers: {
    toggleWishlist: (state, action: PayloadAction<WishlistItem>) => {
      const idx = state.items.findIndex(i => i._id === action.payload._id);
      if (idx > -1) state.items.splice(idx, 1);
      else state.items.push(action.payload);
      save(state.items);
    },
    removeFromWishlist: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(i => i._id !== action.payload);
      save(state.items);
    },
    clearWishlist: (state) => { state.items = []; save([]); },
  },
});

export const { toggleWishlist, removeFromWishlist, clearWishlist } = wishlistSlice.actions;
export const selectWishlistItems = (s: any) => s.wishlist.items as WishlistItem[];
export const selectIsWishlisted = (id: string) => (s: any) => (s.wishlist.items as WishlistItem[]).some(i => i._id === id);
export default wishlistSlice.reducer;
