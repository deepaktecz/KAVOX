'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, Plus, ArrowLeft, Info } from 'lucide-react';
import { useRequireRole, useToast } from '@/hooks';
import { productApi, getErrorMessage } from '@/lib/api';

const CATEGORIES = [
  'T-Shirts', 'Oversized T-Shirts', 'Polo T-Shirts', 'Graphic Tees',
  'Hoodies', 'Sweatshirts', 'Jackets', 'Shirts',
  'Shorts', 'Joggers', 'Caps & Hats', 'Accessories', 'Custom Design',
];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'];
const FIT_OPTIONS = ['Regular', 'Slim', 'Oversized', 'Relaxed'];

export default function AddProductPage() {
  const { user } = useRequireRole(['seller', 'admin']);
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [form, setForm] = useState({
    name: '', description: '', shortDescription: '', brand: 'KAVOX',
    category: '', subcategory: '', sellingPrice: '', discountedPrice: '',
    basePrice: '', gstPercent: '12', fabric: '', fit: '',
    washCare: '', weight: '', deliveryDays: '7',
    isPOD: false, qikinkProductId: '', lowStockThreshold: '5',
  });

  const update = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  const handleImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newPreviews = files.map(f => URL.createObjectURL(f));
    setImageFiles(prev => [...prev, ...files].slice(0, 10));
    setImagePreviews(prev => [...prev, ...newPreviews].slice(0, 10));
  };

  const removeImage = (idx: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleSize = (size: string) => {
    setSelectedSizes(prev => prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]);
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) { setTags(prev => [...prev, t]); setTagInput(''); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.category || !form.sellingPrice) { toast.error('Please fill required fields'); return; }
    if (imageFiles.length === 0) { toast.error('Please add at least one product image'); return; }

    setSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => formData.append(k, String(v)));
      imageFiles.forEach(f => formData.append('images', f));
      formData.append('availableSizes', JSON.stringify(selectedSizes));
      formData.append('tags', JSON.stringify(tags));

      await productApi.create(formData);
      toast.success('Product submitted for review!');
      router.push('/seller/dashboard');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally { setSubmitting(false); }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-kavox-cream">
      <div className="bg-white border-b border-kavox-border">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-5">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-kavox-gray hover:text-kavox-black mb-3 font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-2xl font-bold text-kavox-black">Add New Product</h1>
          <p className="text-sm text-kavox-gray font-light mt-0.5">Product will be reviewed by admin before going live.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
        <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">

          {/* Main form */}
          <div className="space-y-5">

            {/* Basic Info */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-5">Basic Information</h2>
              <div className="space-y-4">
                <div className="form-group">
                  <label className="label">Product Name <span className="text-red-500">*</span></label>
                  <input className="input" placeholder="e.g., Classic Oversized Tee — Black" value={form.name} onChange={e => update('name', e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="label">Category <span className="text-red-500">*</span></label>
                    <select className="input" value={form.category} onChange={e => update('category', e.target.value)} required>
                      <option value="">Select category</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Brand</label>
                    <input className="input" placeholder="KAVOX" value={form.brand} onChange={e => update('brand', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="label">Short Description</label>
                  <input className="input" placeholder="One-liner for product cards (max 150 chars)" maxLength={150} value={form.shortDescription} onChange={e => update('shortDescription', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label">Full Description <span className="text-red-500">*</span></label>
                  <textarea className="input resize-none" rows={5} placeholder="Describe your product — material, fit, occasion, care instructions..." value={form.description} onChange={e => update('description', e.target.value)} required />
                </div>
              </div>
            </div>

            {/* Images */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-5">Product Images <span className="text-red-500">*</span></h2>
              <div className="grid grid-cols-4 gap-3">
                {imagePreviews.map((src, i) => (
                  <div key={i} className="relative aspect-square rounded-sm overflow-hidden border border-kavox-border group">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    {i === 0 && <span className="absolute top-1 left-1 text-[9px] bg-kavox-accent text-white px-1.5 py-0.5 rounded font-bold">MAIN</span>}
                    <button type="button" onClick={() => removeImage(i)} className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                {imagePreviews.length < 10 && (
                  <button type="button" onClick={() => fileRef.current?.click()} className="aspect-square rounded-sm border-2 border-dashed border-kavox-border hover:border-kavox-accent flex flex-col items-center justify-center gap-1 text-kavox-gray hover:text-kavox-accent transition-colors">
                    <Plus className="w-5 h-5" />
                    <span className="text-[10px] font-medium">Add Photo</span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={handleImages} />
              <p className="text-xs text-kavox-gray font-light mt-3">Upload up to 10 images. First image will be the main product photo.</p>
            </div>

            {/* Variants */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-5">Sizes Available</h2>
              <div className="flex flex-wrap gap-2">
                {SIZES.map(size => (
                  <button key={size} type="button" onClick={() => toggleSize(size)}
                    className={`px-4 py-2 text-sm font-semibold border rounded-sm transition-all ${selectedSizes.includes(size) ? 'bg-kavox-black text-white border-kavox-black' : 'border-kavox-border text-kavox-gray hover:border-kavox-charcoal'}`}>
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Material & Care */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-5">Material & Care</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Fabric</label>
                  <input className="input" placeholder="e.g., 100% Cotton, 220 GSM" value={form.fabric} onChange={e => update('fabric', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label">Fit Type</label>
                  <select className="input" value={form.fit} onChange={e => update('fit', e.target.value)}>
                    <option value="">Select fit</option>
                    {FIT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="form-group col-span-2">
                  <label className="label">Wash Care</label>
                  <input className="input" placeholder="e.g., Machine wash cold, do not bleach" value={form.washCare} onChange={e => update('washCare', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-4">Tags (for search)</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                {tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 text-xs bg-kavox-cream border border-kavox-border px-2.5 py-1 rounded-sm font-medium">
                    {tag}<button type="button" onClick={() => setTags(p => p.filter(t => t !== tag))}><X className="w-3 h-3 text-kavox-gray" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="e.g., oversized, streetwear, black" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
                <button type="button" onClick={addTag} className="btn-secondary btn-sm">Add</button>
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="lg:sticky lg:top-24 space-y-5">

            {/* Pricing */}
            <div className="bg-white rounded-sm border border-kavox-border p-5">
              <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-4">Pricing</h2>
              <div className="space-y-3">
                <div className="form-group">
                  <label className="label">Selling Price (₹) <span className="text-red-500">*</span></label>
                  <input type="number" className="input" placeholder="999" value={form.sellingPrice} onChange={e => update('sellingPrice', e.target.value)} required min="1" />
                </div>
                <div className="form-group">
                  <label className="label">Discounted Price (₹)</label>
                  <input type="number" className="input" placeholder="799 (optional)" value={form.discountedPrice} onChange={e => update('discountedPrice', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label flex items-center gap-1">
                    Base / Cost Price (₹)
                    <Info className="w-3.5 h-3.5 text-kavox-silver" title="Used for profit tracking. Not shown to customers." />
                  </label>
                  <input type="number" className="input" placeholder="Qikink cost / your cost" value={form.basePrice} onChange={e => update('basePrice', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label">GST %</label>
                  <select className="input" value={form.gstPercent} onChange={e => update('gstPercent', e.target.value)}>
                    {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                  </select>
                </div>
              </div>

              {/* Profit preview */}
              {form.sellingPrice && form.basePrice && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-sm">
                  <p className="text-xs font-semibold text-green-700">
                    Est. profit per unit: ₹{(Number(form.discountedPrice || form.sellingPrice) - Number(form.basePrice)).toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-green-600 font-light">
                    Margin: {Math.round(((Number(form.discountedPrice || form.sellingPrice) - Number(form.basePrice)) / Number(form.discountedPrice || form.sellingPrice)) * 100)}%
                  </p>
                </div>
              )}
            </div>

            {/* Qikink POD */}
            <div className="bg-white rounded-sm border border-kavox-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider">Print-on-Demand</h2>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-kavox-gray">Qikink POD</span>
                  <div className="relative">
                    <input type="checkbox" className="sr-only" checked={form.isPOD} onChange={e => update('isPOD', e.target.checked)} />
                    <div className={`w-10 h-6 rounded-full transition-colors ${form.isPOD ? 'bg-kavox-accent' : 'bg-kavox-border'}`} />
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isPOD ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                </label>
              </div>
              {form.isPOD && (
                <div className="form-group">
                  <label className="label">Qikink Product ID</label>
                  <input className="input" placeholder="From Qikink catalog" value={form.qikinkProductId} onChange={e => update('qikinkProductId', e.target.value)} />
                  <p className="text-xs text-kavox-gray font-light mt-1">Orders for this product will be auto-submitted to Qikink after payment.</p>
                </div>
              )}
            </div>

            {/* Delivery */}
            <div className="bg-white rounded-sm border border-kavox-border p-5">
              <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-4">Delivery</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="label">Delivery Days</label>
                  <input type="number" className="input" value={form.deliveryDays} onChange={e => update('deliveryDays', e.target.value)} min="1" />
                </div>
                <div className="form-group">
                  <label className="label">Low Stock Alert</label>
                  <input type="number" className="input" value={form.lowStockThreshold} onChange={e => update('lowStockThreshold', e.target.value)} min="1" />
                </div>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={submitting} className="btn-primary w-full py-4 text-sm">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting…
                </span>
              ) : 'Submit for Review →'}
            </button>
            <p className="text-center text-xs text-kavox-gray font-light">Product will be reviewed by KAVOX admin before going live.</p>
          </div>
        </div>
      </form>
    </div>
  );
}
