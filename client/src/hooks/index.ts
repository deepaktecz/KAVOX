// hooks/index.ts  — all custom hooks
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { useCallback, useRef } from 'react';
import { addToast, removeToast } from '../store/slices/uiSlice';

// ── Typed Redux hooks ─────────────────────────────────────────
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ── Toast hook ────────────────────────────────────────────────
export function useToast() {
  const dispatch = useAppDispatch();

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3500) => {
    const id = Date.now().toString();
    dispatch(addToast({ message, type }));
    setTimeout(() => dispatch(removeToast(id)), duration);
  }, [dispatch]);

  return {
    success: (msg: string) => toast(msg, 'success'),
    error: (msg: string) => toast(msg, 'error'),
    info: (msg: string) => toast(msg, 'info'),
  };
}

// ── Currency formatter ─────────────────────────────────────────
export function useFormatPrice() {
  return (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

// ── Debounce hook ──────────────────────────────────────────────
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── Local storage hook ─────────────────────────────────────────
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : initialValue; }
    catch { return initialValue; }
  });

  const set = useCallback((val: T | ((prev: T) => T)) => {
    try {
      const toStore = val instanceof Function ? val(value) : val;
      setValue(toStore);
      localStorage.setItem(key, JSON.stringify(toStore));
    } catch {}
  }, [key, value]);

  return [value, set] as const;
}

// ── Auth guard hook ────────────────────────────────────────────
import { useRouter } from 'next/navigation';
import { useEffect as useEff } from 'react';

export function useRequireAuth(redirectTo = '/auth/login') {
  const router = useRouter();
  const { isAuthenticated, initialized } = useAppSelector(s => s.auth);

  useEff(() => {
    if (initialized && !isAuthenticated) router.push(redirectTo);
  }, [initialized, isAuthenticated, router, redirectTo]);

  return { isAuthenticated, initialized };
}

export function useRequireRole(role: string | string[], redirectTo = '/') {
  const router = useRouter();
  const { user, initialized } = useAppSelector(s => s.auth);
  const roles = Array.isArray(role) ? role : [role];

  useEff(() => {
    if (initialized && user && !roles.includes(user.role)) router.push(redirectTo);
    if (initialized && !user) router.push('/auth/login');
  }, [initialized, user, router]);

  return { user, initialized };
}

// ── Socket.io connection hook ──────────────────────────────────
// Feature 5: Real-time tracking via Socket.io
// Usage: const { socket, connected } = useSocket();
export function useSocket() {
  const socketRef = useRef<any>(null);
  const [connected, setConnected] = useState(false);
  const { user } = useAppSelector((s) => s.auth);

  useEff(() => {
    // Dynamically import socket.io-client to avoid SSR issues
    let cleanup: (() => void) | undefined;

    const initSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';
        const token = typeof window !== 'undefined' ? sessionStorage.getItem('kavox_token') : null;

        const socket = io(SOCKET_URL, {
          transports: ['websocket', 'polling'],
          auth: { token },
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
        });

        socketRef.current = socket;

        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));

        cleanup = () => {
          socket.disconnect();
          socketRef.current = null;
          setConnected(false);
        };
      } catch {
        // socket.io-client not installed or SSR — fail silently
      }
    };

    if (typeof window !== 'undefined') {
      initSocket();
    }

    return () => { cleanup?.(); };
  }, [user]);

  return { socket: socketRef.current, connected };
}

// ── Real-time order tracking hook ──────────────────────────────
// Feature 5: Subscribe to live order status updates
// Usage: const { status, trackingEvents } = useOrderTracking(orderId);
export function useOrderTracking(orderId: string | null) {
  const { socket } = useSocket();
  const [status, setStatus] = useState<string | null>(null);
  const [trackingInfo, setTrackingInfo] = useState<any>(null);
  const [lastEvent, setLastEvent] = useState<any>(null);

  useEff(() => {
    if (!socket || !orderId) return;

    // Join the order-specific room
    socket.emit('track_order', { orderId });

    // Listen for status updates
    const handleUpdate = (data: any) => {
      if (data.orderId === orderId || data.orderId?.toString() === orderId) {
        setStatus(data.kavoxStatus || data.status || null);
        setTrackingInfo(data.trackingInfo || null);
        setLastEvent(data);
      }
    };

    // Feature 5 events
    socket.on('order_status_updated', handleUpdate);  // order_shipped, order_delivered mapped here
    socket.on('payment_confirmed', (data: any) => {
      if (data.orderId === orderId) setStatus('confirmed');
    });
    socket.on('order_created', (data: any) => {
      if (data.orderId === orderId) setStatus('pending_payment');
    });

    return () => {
      socket.off('order_status_updated', handleUpdate);
      socket.off('payment_confirmed');
      socket.off('order_created');
    };
  }, [socket, orderId]);

  return { status, trackingInfo, lastEvent };
}

