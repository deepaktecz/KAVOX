// ════════════════════════════════════════════════════════════
// authSlice.ts
// ════════════════════════════════════════════════════════════
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authApi, setAccessToken, clearTokens, getErrorMessage } from '@/lib/api';

interface Address {
  _id: string; label: string; fullName: string; phone: string;
  addressLine1: string; addressLine2?: string; city: string;
  state: string; pincode: string; country: string; isDefault: boolean;
}

interface User {
  _id: string; firstName: string; lastName: string; fullName: string;
  email: string; phone?: string; role: 'user' | 'seller' | 'admin' | 'super_admin';
  avatar?: { url: string }; isEmailVerified: boolean; addresses: Address[];
  sellerProfile?: { brandName?: string; isApproved: boolean };
  preferences?: { newsletter: boolean };
}

interface AuthState {
  user: User | null; isAuthenticated: boolean;
  loading: boolean; error: string | null; initialized: boolean;
}

const initialState: AuthState = {
  user: null, isAuthenticated: false, loading: false, error: null, initialized: false,
};

export const loginUser = createAsyncThunk('auth/login', async (credentials: { email: string; password: string }, { rejectWithValue }) => {
  try {
    const { data } = await authApi.login(credentials);
    setAccessToken(data.data.accessToken);
    return data.data.user;
  } catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

export const registerUser = createAsyncThunk('auth/register', async (userData: any, { rejectWithValue }) => {
  try {
    const { data } = await authApi.register(userData);
    return data.data;
  } catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

export const verifyEmail = createAsyncThunk('auth/verifyEmail', async (otpData: { email: string; otp: string }, { rejectWithValue }) => {
  try {
    const { data } = await authApi.verifyEmail(otpData);
    setAccessToken(data.data.accessToken);
    return data.data.user;
  } catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

export const logoutUser = createAsyncThunk('auth/logout', async (_, { rejectWithValue }) => {
  try {
    await authApi.logout();
    clearTokens();
  } catch (e) { clearTokens(); }
});

export const fetchCurrentUser = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
  try {
    const { data } = await authApi.getMe();
    return data.data.user;
  } catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

export const updateUserProfile = createAsyncThunk('auth/updateProfile', async (profileData: any, { rejectWithValue }) => {
  try {
    const { data } = await authApi.updateProfile(profileData);
    return data.data.user;
  } catch (e) { return rejectWithValue(getErrorMessage(e)); }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => { state.error = null; },
    setUser: (state, action: PayloadAction<User>) => { state.user = action.payload; state.isAuthenticated = true; },
    clearAuth: (state) => { state.user = null; state.isAuthenticated = false; clearTokens(); },
    setInitialized: (state) => { state.initialized = true; },
  },
  extraReducers: (builder) => {
    const pending = (state: AuthState) => { state.loading = true; state.error = null; };
    const rejected = (state: AuthState, action: any) => { state.loading = false; state.error = action.payload as string; };

    builder
      .addCase(loginUser.pending, pending)
      .addCase(loginUser.fulfilled, (state, action) => { state.loading = false; state.user = action.payload; state.isAuthenticated = true; state.initialized = true; })
      .addCase(loginUser.rejected, rejected)
      .addCase(registerUser.pending, pending)
      .addCase(registerUser.fulfilled, (state) => { state.loading = false; })
      .addCase(registerUser.rejected, rejected)
      .addCase(verifyEmail.pending, pending)
      .addCase(verifyEmail.fulfilled, (state, action) => { state.loading = false; state.user = action.payload; state.isAuthenticated = true; })
      .addCase(verifyEmail.rejected, rejected)
      .addCase(logoutUser.fulfilled, (state) => { state.user = null; state.isAuthenticated = false; state.initialized = true; })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => { state.user = action.payload; state.isAuthenticated = true; state.initialized = true; state.loading = false; })
      .addCase(fetchCurrentUser.rejected, (state) => { state.initialized = true; state.loading = false; })
      .addCase(fetchCurrentUser.pending, (state) => { state.loading = true; })
      .addCase(updateUserProfile.fulfilled, (state, action) => { state.user = action.payload; });
  },
});

export const { clearError, setUser, clearAuth, setInitialized } = authSlice.actions;
export default authSlice.reducer;
