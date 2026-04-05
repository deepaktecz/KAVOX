// ════════════════════════════════════════════════════════════
// cartSlice.ts
// ════════════════════════════════════════════════════════════
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CartVariant { variantId?: string; size?: string; color?: { name: string; hexCode?: string }; }
interface CartItem {
  id: string; productId: string; name: string; slug: string; image: string;
  price: number; originalPrice?: number; quantity: number; variant?: CartVariant;
  maxStock: number; seller: string;
}
interface CartState { items: CartItem[]; isOpen: boolean; lastAdded: string | null; }

const CART_KEY = 'kavox_cart';
const loadCart = (): CartItem[] => {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
};
const saveCart = (items: CartItem[]) => {
  if (typeof window !== 'undefined') localStorage.setItem(CART_KEY, JSON.stringify(items));
};

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: loadCart(), isOpen: false, lastAdded: null } as CartState,
  reducers: {
    addToCart: (state, action: PayloadAction<Omit<CartItem, 'id'>>) => {
      const id = `${action.payload.productId}-${action.payload.variant?.size || ''}-${action.payload.variant?.color?.name || ''}`;
      const existing = state.items.find(i => i.id === id);
      if (existing) {
        existing.quantity = Math.min(existing.quantity + action.payload.quantity, action.payload.maxStock);
      } else {
        state.items.push({ ...action.payload, id });
      }
      state.lastAdded = id;
      state.isOpen = true;
      saveCart(state.items);
    },
    removeFromCart: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(i => i.id !== action.payload);
      saveCart(state.items);
    },
    updateQuantity: (state, action: PayloadAction<{ id: string; quantity: number }>) => {
      const item = state.items.find(i => i.id === action.payload.id);
      if (item) {
        if (action.payload.quantity <= 0) {
          state.items = state.items.filter(i => i.id !== action.payload.id);
        } else {
          item.quantity = Math.min(action.payload.quantity, item.maxStock);
        }
        saveCart(state.items);
      }
    },
    clearCart: (state) => { state.items = []; saveCart([]); },
    openCart: (state) => { state.isOpen = true; },
    closeCart: (state) => { state.isOpen = false; },
    toggleCart: (state) => { state.isOpen = !state.isOpen; },
  },
});

export const { addToCart, removeFromCart, updateQuantity, clearCart, openCart, closeCart, toggleCart } = cartSlice.actions;

export const selectCartItems = (state: any) => state.cart.items as CartItem[];
export const selectCartCount = (state: any) => (state.cart.items as CartItem[]).reduce((s: number, i: CartItem) => s + i.quantity, 0);
export const selectCartTotal = (state: any) => (state.cart.items as CartItem[]).reduce((s: number, i: CartItem) => s + i.price * i.quantity, 0);
export const selectCartOpen = (state: any) => state.cart.isOpen;

export default cartSlice.reducer;

// ════════════════════════════════════════════════════════════
// wishlistSlice.ts  (separate file — kept here for brevity)
// ════════════════════════════════════════════════════════════
export {};
