'use client';

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import Cookies from 'js-cookie';

/**
 * KAVOX API CLIENT
 * Unified HTTP client for all microservices communication
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
const TOKEN_KEY = 'kavox_auth_token';
const REFRESH_TOKEN_KEY = 'kavox_refresh_token';

// ─── Create Axios Instance ────────────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Token Management ─────────────────────────────────────────
export function setTokens(accessToken: string, refreshToken: string) {
  Cookies.set(TOKEN_KEY, accessToken, { expires: 1 });
  Cookies.set(REFRESH_TOKEN_KEY, refreshToken, { expires: 7 });
}

export function getAccessToken(): string | null {
  if (typeof window !== 'undefined') {
    return Cookies.get(TOKEN_KEY) || null;
  }
  return null;
}

export function getRefreshToken(): string | null {
  if (typeof window !== 'undefined') {
    return Cookies.get(REFRESH_TOKEN_KEY) || null;
  }
  return null;
}

export function clearTokens() {
  Cookies.remove(TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

// ─── Request Interceptor ──────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor (token refresh) ─────────────────────
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(
          `${BASE_URL}/auth/refresh-token`,
          {},
          { withCredentials: true }
        );
        const { accessToken: newToken } = response.data.data;
        setAccessToken(newToken);

        pendingRequests.forEach(({ resolve }) => resolve(newToken));
        pendingRequests = [];

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        pendingRequests.forEach(({ reject }) => reject(refreshError));
        pendingRequests = [];
        clearTokens();

        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login?session=expired';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Helper to extract error message ─────────────────────────
export function getErrorMessage(error: any): string {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.errors?.[0]?.message ||
    error?.message ||
    'Something went wrong. Please try again.'
  );
}

// ─────────────────────────────────────────────────────────────
// AUTH API
// ─────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: any) => api.post('/auth/register', data),
  verifyEmail: (data: { email: string; otp: string }) => api.post('/auth/verify-email', data),
  resendOTP: (data: { email: string; purpose?: string }) => api.post('/auth/resend-otp', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  refreshToken: () => api.post('/auth/refresh-token'),
  logout: () => api.post('/auth/logout'),
  logoutAll: () => api.post('/auth/logout-all'),
  forgotPassword: (data: { email: string }) => api.post('/auth/forgot-password', data),
  resetPassword: (data: any) => api.post('/auth/reset-password', data),
  changePassword: (data: any) => api.post('/auth/change-password', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data: any) => api.patch('/auth/me', data),
  addAddress: (data: any) => api.post('/auth/addresses', data),
  updateAddress: (id: string, data: any) => api.patch(`/auth/addresses/${id}`, data),
  deleteAddress: (id: string) => api.delete(`/auth/addresses/${id}`),
};

// ─────────────────────────────────────────────────────────────
// PRODUCT API
// ─────────────────────────────────────────────────────────────
export const productApi = {
  getAll: (params?: any) => api.get('/products', { params }),
  getOne: (slugOrId: string) => api.get(`/products/${slugOrId}`),
  getFeatured: (limit?: number) => api.get('/products/featured', { params: { limit } }),
  getTrending: () => api.get('/products/trending'),
  getNewArrivals: () => api.get('/products/new-arrivals'),
  getCategories: () => api.get('/products/categories'),
  getRelated: (id: string) => api.get(`/products/${id}/related`),
  getRecommendations: (params?: any) => api.get('/products/recommendations', { params }),
  search: (params: { q: string; [key: string]: any }) => api.get('/products/search', { params }),
  create: (data: FormData) => api.post('/products', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id: string, data: FormData | any) => api.patch(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  addReview: (id: string, data: any) => api.post(`/products/${id}/reviews`, data),
  deleteReview: (productId: string, reviewId: string) => api.delete(`/products/${productId}/reviews/${reviewId}`),
  toggleWishlist: (id: string) => api.post(`/products/${id}/wishlist`),
  reviewProduct: (id: string, data: { action: 'approve' | 'reject'; rejectionReason?: string }) =>
    api.patch(`/products/${id}/review`, data),
};

// ─────────────────────────────────────────────────────────────
// ORDER API
// ─────────────────────────────────────────────────────────────
export const orderApi = {
  placeOrder: (data: any) => api.post('/orders', data),
  getMyOrders: (params?: any) => api.get('/orders/my-orders', { params }),
  getOrder: (id: string) => api.get(`/orders/my-orders/${id}`),
  cancelOrder: (id: string, data: { reason?: string }) => api.post(`/orders/my-orders/${id}/cancel`, data),
  requestReturn: (id: string, data: { reason: string }) => api.post(`/orders/my-orders/${id}/return`, data),
  trackOrder: (params: { orderNumber: string; phone: string }) => api.get('/orders/track', { params }),
  // Admin
  adminGetOrders: (params?: any) => api.get('/orders/admin/all', { params }),
  adminUpdateStatus: (id: string, data: any) => api.patch(`/orders/admin/${id}/status`, data),
  adminGetAnalytics: (params?: any) => api.get('/orders/admin/analytics', { params }),
};

// ─────────────────────────────────────────────────────────────
// PAYMENT API
// ─────────────────────────────────────────────────────────────
export const paymentApi = {
  createRazorpayOrder: (orderId: string) => api.post('/payments/create-order', { orderId }),
  verifyPayment: (data: any) => api.post('/payments/verify', data),
  getPaymentStatus: (orderId: string) => api.get(`/payments/status/${orderId}`),
  initiateRefund: (data: any) => api.post('/payments/refund', data),
};

// ─────────────────────────────────────────────────────────────
// QIKINK API
// ─────────────────────────────────────────────────────────────
export const qikinkApi = {
  getCatalog: (params?: any) => api.get('/qikink/catalog', { params }),
  syncProducts: () => api.post('/qikink/sync-products'),
  pollStatus: () => api.post('/qikink/poll-status'),
  submitOrder: (orderId: string) => api.post(`/qikink/orders/${orderId}/submit`),
  fetchOrderStatus: (orderId: string) => api.get(`/qikink/orders/${orderId}/status`),
};

// ─────────────────────────────────────────────────────────────
// DESIGN API
// ─────────────────────────────────────────────────────────────
export const designApi = {
  create: (data: FormData) =>
    api.post('/designs', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMyDesigns: (params?: any) => api.get('/designs', { params }),
  getDesign: (id: string) => api.get(`/designs/${id}`),
  update: (id: string, data: any) => api.patch(`/designs/${id}`, data),
  delete: (id: string) => api.delete(`/designs/${id}`),
  uploadToQikink: (id: string) => api.post(`/designs/${id}/upload-to-qikink`),
};

// ─────────────────────────────────────────────────────────────
// ADMIN API
// ─────────────────────────────────────────────────────────────
export const adminApi = {
  // Dashboard
  getDashboard: (params?: { period?: string }) => api.get('/admin/dashboard', { params }),
  getProfitReport: (params?: { period?: string }) => api.get('/admin/profit-report', { params }),
  // Orders
  getOrders: (params?: any) => api.get('/admin/orders', { params }),
  getOrder: (id: string) => api.get(`/admin/orders/${id}`),
  // Products
  getProducts: (params?: any) => api.get('/admin/products', { params }),
  updateProduct: (id: string, data: any) => api.patch(`/admin/products/${id}`, data),
  deleteProduct: (id: string) => api.delete(`/admin/products/${id}`),
  setMargin: (data: { productIds?: string[]; category?: string; marginPercent: number }) =>
    api.post('/admin/products/set-margin', data),
  // Designs
  getDesigns: (params?: any) => api.get('/admin/designs', { params }),
};

export default api;
