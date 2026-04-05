'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, LogOut, MapPin, Lock, Heart, Package, Settings } from 'lucide-react';
import { useAppDispatch, useAppSelector, useRequireAuth, useToast } from '@/hooks';
import { logoutUser } from '@/store/slices/authSlice';
import { authApi, getErrorMessage } from '@/lib/api';

const MENU_ITEMS = [
  { icon: User, label: 'Profile', href: '/account' },
  { icon: MapPin, label: 'Addresses', href: '/account/addresses' },
  { icon: Package, label: 'My Orders', href: '/orders' },
  { icon: Heart, label: 'Wishlist', href: '/wishlist' },
  { icon: Lock, label: 'Change Password', href: '/account/password' },
  { icon: Settings, label: 'Settings', href: '/account/settings' },
];

export default function AccountPage() {
  useRequireAuth();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAppSelector(s => s.auth);

  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [loading, setLoading] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await authApi.updateProfile(formData);
      if (response.data.success) {
        toast.success('Profile updated successfully!');
        setEditing(false);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    dispatch(logoutUser());
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-kavox-charcoal mb-8">My Account</h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Menu */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              {MENU_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-kavox-accent hover:text-white transition border-b border-gray-200 last:border-b-0"
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition border-t border-gray-200 font-semibold"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </div>

          {/* Profile Section */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-sm p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-kavox-charcoal">Profile Information</h2>
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="bg-kavox-accent text-white px-4 py-2 rounded-lg font-semibold hover:bg-kavox-accent-dark transition"
                  >
                    Edit Profile
                  </button>
                )}
              </div>

              {editing ? (
                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-kavox-accent focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-kavox-accent focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-kavox-accent focus:border-transparent"
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-kavox-accent text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-kavox-accent-dark transition disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-semibold hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="pb-4 border-b border-gray-200">
                    <p className="text-gray-600 text-sm mb-1">Full Name</p>
                    <p className="text-lg font-semibold text-kavox-charcoal">{user?.fullName}</p>
                  </div>
                  <div className="pb-4 border-b border-gray-200">
                    <p className="text-gray-600 text-sm mb-1">Email Address</p>
                    <p className="text-lg font-semibold text-kavox-charcoal">{user?.email}</p>
                  </div>
                  <div className="pb-4 border-b border-gray-200">
                    <p className="text-gray-600 text-sm mb-1">Phone Number</p>
                    <p className="text-lg font-semibold text-kavox-charcoal">{user?.phone}</p>
                  </div>
                  <div className="pb-4">
                    <p className="text-gray-600 text-sm mb-1">Account Status</p>
                    <p className="text-lg font-semibold text-kavox-charcoal">
                      {user?.isEmailVerified ? '✓ Verified' : 'Pending Verification'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4 mt-8">
              <div className="bg-white rounded-lg shadow-sm p-6 text-center">
                <p className="text-3xl font-bold text-kavox-accent mb-1">0</p>
                <p className="text-sm text-gray-600">Total Orders</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-6 text-center">
                <p className="text-3xl font-bold text-kavox-accent mb-1">0</p>
                <p className="text-sm text-gray-600">Wishlist Items</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-6 text-center">
                <p className="text-3xl font-bold text-kavox-accent mb-1">0</p>
                <p className="text-sm text-gray-600">Saved Addresses</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
