import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// ── UI Slice ──────────────────────────────────────────────────
interface Toast { id: string; message: string; type: 'success' | 'error' | 'info'; }
interface UIState { toasts: Toast[]; searchOpen: boolean; mobileMenuOpen: boolean; pageLoading: boolean; }

const uiSlice = createSlice({
  name: 'ui',
  initialState: { toasts: [], searchOpen: false, mobileMenuOpen: false, pageLoading: false } as UIState,
  reducers: {
    addToast: (state, action: PayloadAction<Omit<Toast, 'id'>>) => {
      const id = Date.now().toString();
      state.toasts.push({ ...action.payload, id });
      if (state.toasts.length > 3) state.toasts.shift();
    },
    removeToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter(t => t.id !== action.payload);
    },
    toggleSearch: (state) => { state.searchOpen = !state.searchOpen; },
    closeSearch: (state) => { state.searchOpen = false; },
    toggleMobileMenu: (state) => { state.mobileMenuOpen = !state.mobileMenuOpen; },
    closeMobileMenu: (state) => { state.mobileMenuOpen = false; },
    setPageLoading: (state, action: PayloadAction<boolean>) => { state.pageLoading = action.payload; },
  },
});

export const { addToast, removeToast, toggleSearch, closeSearch, toggleMobileMenu, closeMobileMenu, setPageLoading } = uiSlice.actions;
export default uiSlice.reducer;
