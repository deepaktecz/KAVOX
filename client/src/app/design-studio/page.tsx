'use client';

import { useState, useRef } from 'react';
import { Upload, Type, Palette, RotateCcw, ShoppingBag, Eye, Download } from 'lucide-react';
import { useAppDispatch, useToast } from '@/hooks';
import { addToCart } from '@/store/slices/cartSlice';
import { productApi, designApi, qikinkApi, getErrorMessage } from '@/lib/api';

const TSHIRT_COLORS = [
  { name: 'Black', hex: '#1C1C1C' }, { name: 'White', hex: '#F5F5F5' },
  { name: 'Navy', hex: '#1B3A6B' }, { name: 'Forest Green', hex: '#2D5A27' },
  { name: 'Maroon', hex: '#6B1B1B' }, { name: 'Camel', hex: '#C8956C' },
  { name: 'Charcoal', hex: '#4A4A4A' }, { name: 'Lavender', hex: '#8B7BB8' },
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const PRINT_AREAS = ['Front', 'Back', 'Left Sleeve', 'Right Sleeve', 'Front + Back'];
const BASE_PRICE = 499;
const PRINT_PRICE = 200;

export default function DesignStudioPage() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedColor, setSelectedColor] = useState(TSHIRT_COLORS[0]);
  const [selectedSize, setSelectedSize] = useState('M');
  const [printArea, setPrintArea] = useState('Front');
  const [quantity, setQuantity] = useState(1);
  const [designText, setDesignText] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [uploadedDesign, setUploadedDesign] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'text'>('upload');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const totalPrice = (BASE_PRICE + PRINT_PRICE) * quantity;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUploadExtended(e);
  };

  const [designFile, setDesignFile] = useState<File | null>(null);
  const [savedDesignId, setSavedDesignId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Enhanced file upload that also stores file reference
  const handleFileUploadExtended = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('File must be under 10MB'); return; }
    setDesignFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setUploadedDesign(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // Save design to backend + Cloudinary
  const handleSaveDesign = async (sendToQikink = false) => {
    if (!designFile && !designText) {
      toast.error('Please add a design image or text first');
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      if (designFile) formData.append('file', designFile);
      // If only text, we need a placeholder — skip file requirement for text-only
      formData.append('name', `Custom ${selectedColor.name} ${selectedSize} Tee`);
      formData.append('printArea', printArea.toLowerCase().replace(/ /g, '-').replace('+', '').trim());
      formData.append('selectedSize', selectedSize);
      formData.append('selectedColor', JSON.stringify({ name: selectedColor.name, hexCode: selectedColor.hex }));
      if (designText) {
        const textLayer = [{
          id: 'txt_main', content: designText, fontFamily: 'Arial',
          fontSize: 36, fontWeight: 'bold', color: textColor,
          positionX: 50, positionY: 50,
        }];
        formData.append('textLayers', JSON.stringify(textLayer));
      }

      let designId = savedDesignId;
      if (!designId && designFile) {
        const res = await designApi.create(formData);
        designId = res.data.data?.design?._id;
        setSavedDesignId(designId || null);
        toast.success('Design saved!');
      }

      if (sendToQikink && designId) {
        await designApi.uploadToQikink(designId);
        toast.success('Design sent to Qikink — ready to order!');
      }
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAddToCart = () => {
    if (!uploadedDesign && !designText) { toast.error('Please add a design or text first'); return; }
    dispatch(addToCart({
      productId: `custom-design-${Date.now()}`,
      name: `Custom T-Shirt (${selectedColor.name} / ${selectedSize})`,
      slug: 'custom-design',
      image: '/custom-tshirt-placeholder.jpg',
      price: totalPrice / quantity,
      quantity,
      maxStock: 100,
      seller: 'kavox',
      variant: { size: selectedSize, color: { name: selectedColor.name, hexCode: selectedColor.hex } },
    }));
    toast.success('Custom design added to bag!');
    // Auto-save design to backend after adding to cart
    if (designFile && !savedDesignId) {
      handleSaveDesign(false).catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-kavox-cream">
      {/* Header */}
      <div className="bg-kavox-charcoal text-white py-10 md:py-14">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 text-center">
          <div className="section-eyebrow text-kavox-accent/70 justify-center mb-3">Design Studio</div>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold mb-3">
            Design Your Own T-Shirt
          </h1>
          <p className="text-kavox-silver font-light text-lg max-w-xl mx-auto">
            Upload your art, add custom text — we'll print and deliver it to your door.
          </p>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
        <div className="grid lg:grid-cols-[1fr_480px] gap-10 items-start">

          {/* ── PREVIEW PANEL ─────────────────────────────── */}
          <div>
            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden sticky top-24">
              <div className="px-6 py-4 border-b border-kavox-border flex items-center gap-2">
                <Eye className="w-4 h-4 text-kavox-accent" />
                <span className="font-bold text-kavox-black text-sm">Live Preview</span>
                <span className="text-xs text-kavox-gray font-light ml-auto">Print area: {printArea}</span>
              </div>

              {/* T-shirt mockup — CSS art */}
              <div className="flex items-center justify-center p-10 bg-kavox-sand min-h-[400px]">
                <div className="relative">
                  {/* T-shirt shape */}
                  <div
                    className="w-64 h-72 rounded-t-[80px] relative shadow-kavox-xl transition-colors duration-500"
                    style={{ backgroundColor: selectedColor.hex }}
                  >
                    {/* Collar */}
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-20 h-12 rounded-b-full" style={{ backgroundColor: selectedColor.hex }} />
                    {/* Left sleeve */}
                    <div className="absolute top-6 -left-10 w-12 h-20 rounded-l-[30px] rotate-12" style={{ backgroundColor: selectedColor.hex }} />
                    {/* Right sleeve */}
                    <div className="absolute top-6 -right-10 w-12 h-20 rounded-r-[30px] -rotate-12" style={{ backgroundColor: selectedColor.hex }} />

                    {/* Design overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pt-16 px-8">
                      {uploadedDesign ? (
                        <img src={uploadedDesign} alt="Your design" className="max-w-[120px] max-h-[140px] object-contain drop-shadow-lg" />
                      ) : designText ? (
                        <div className="text-center" style={{ color: textColor }}>
                          <p className="font-display text-xl font-bold leading-tight whitespace-pre-wrap break-words max-w-[160px]">
                            {designText}
                          </p>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-white/20 rounded w-28 h-32 flex items-center justify-center">
                          <p className="text-white/30 text-xs text-center font-light">Your design<br />appears here</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Color indicator badge */}
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-kavox px-4 py-1.5 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: selectedColor.hex }} />
                    <span className="text-xs font-medium text-kavox-charcoal">{selectedColor.name}</span>
                  </div>
                </div>
              </div>

              {/* Price summary */}
              <div className="px-6 py-4 border-t border-kavox-border bg-kavox-cream">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-kavox-gray font-light">Base Tee</span><span>₹{BASE_PRICE}</span>
                </div>
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-kavox-gray font-light">Custom Print</span><span>₹{PRINT_PRICE}</span>
                </div>
                <div className="flex justify-between font-bold text-kavox-black border-t border-kavox-border pt-3">
                  <span>Total ({quantity} pcs)</span>
                  <span className="text-lg">₹{totalPrice.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── CONTROLS PANEL ────────────────────────────── */}
          <div className="space-y-5">

            {/* Design Tool Tabs */}
            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="flex border-b border-kavox-border">
                {[{ id: 'upload', label: 'Upload Design', icon: Upload }, { id: 'text', label: 'Add Text', icon: Type }].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold transition-colors ${activeTab === tab.id ? 'bg-kavox-black text-white' : 'text-kavox-gray hover:text-kavox-black'}`}
                  >
                    <tab.icon className="w-4 h-4" />{tab.label}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {activeTab === 'upload' ? (
                  <div>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-kavox-border rounded-sm p-10 text-center cursor-pointer hover:border-kavox-accent hover:bg-kavox-cream transition-all duration-200 group"
                    >
                      <Upload className="w-8 h-8 text-kavox-tan group-hover:text-kavox-accent mx-auto mb-3 transition-colors" />
                      <p className="text-sm font-semibold text-kavox-charcoal mb-1">Click to upload your design</p>
                      <p className="text-xs text-kavox-gray font-light">PNG, JPG, SVG · Max 10MB · Transparent PNG recommended</p>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    </div>
                    {uploadedDesign && (
                      <div className="mt-4 flex items-center gap-3">
                        <img src={uploadedDesign} alt="Preview" className="w-12 h-12 object-contain border border-kavox-border rounded" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-kavox-black">Design uploaded ✓</p>
                          <p className="text-xs text-kavox-gray">Will be printed on {printArea}</p>
                        </div>
                        <button onClick={() => setUploadedDesign(null)} className="text-xs text-red-500 hover:underline">Remove</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="label">Your Text</label>
                      <textarea
                        className="input resize-none"
                        rows={3}
                        placeholder="Enter text to print (e.g., your brand name, motto...)"
                        value={designText}
                        onChange={e => setDesignText(e.target.value)}
                        maxLength={50}
                      />
                      <p className="text-xs text-kavox-gray mt-1">{designText.length}/50 characters</p>
                    </div>
                    <div className="form-group">
                      <label className="label">Text Color</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-10 h-10 rounded border border-kavox-border cursor-pointer" />
                        <span className="text-sm text-kavox-gray font-mono">{textColor}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* T-shirt Color */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-kavox-charcoal mb-4 flex items-center gap-2">
                <Palette className="w-4 h-4 text-kavox-accent" /> T-Shirt Color
              </h3>
              <div className="flex flex-wrap gap-3">
                {TSHIRT_COLORS.map(color => (
                  <button
                    key={color.name}
                    title={color.name}
                    onClick={() => setSelectedColor(color)}
                    className={`w-9 h-9 rounded-full transition-all duration-200 ${selectedColor.name === color.name ? 'ring-2 ring-offset-2 ring-kavox-charcoal scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: color.hex, border: color.hex === '#F5F5F5' ? '1px solid #ddd' : 'none' }}
                  />
                ))}
              </div>
              <p className="text-xs text-kavox-gray mt-3 font-light">Selected: <strong className="font-medium text-kavox-charcoal">{selectedColor.name}</strong></p>
            </div>

            {/* Print Area */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-kavox-charcoal mb-4">Print Area</h3>
              <div className="grid grid-cols-3 gap-2">
                {PRINT_AREAS.map(area => (
                  <button
                    key={area}
                    onClick={() => setPrintArea(area)}
                    className={`py-2.5 px-3 text-xs font-semibold border rounded-sm transition-all ${printArea === area ? 'bg-kavox-black text-white border-kavox-black' : 'border-kavox-border text-kavox-gray hover:border-kavox-charcoal hover:text-kavox-charcoal'}`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>

            {/* Size & Quantity */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-kavox-charcoal mb-4">Size</h3>
                  <div className="flex flex-wrap gap-2">
                    {SIZES.map(s => (
                      <button
                        key={s}
                        onClick={() => setSelectedSize(s)}
                        className={`w-10 h-10 text-xs font-bold border rounded-sm transition-all ${selectedSize === s ? 'bg-kavox-black text-white border-kavox-black' : 'border-kavox-border text-kavox-gray hover:border-kavox-charcoal'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-kavox-charcoal mb-4">Quantity</h3>
                  <div className="qty-control w-fit">
                    <button className="qty-btn" onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1}>−</button>
                    <span className="qty-display">{quantity}</span>
                    <button className="qty-btn" onClick={() => setQuantity(q => Math.min(100, q + 1))}>+</button>
                  </div>
                  {quantity >= 10 && <p className="text-xs text-green-600 mt-2 font-medium">🎉 Bulk discount applied!</p>}
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="space-y-3">
              <button onClick={handleAddToCart} className="btn-primary w-full py-4 text-sm flex items-center justify-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                Add Custom Tee to Bag — ₹{totalPrice.toLocaleString('en-IN')}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSaveDesign(false)}
                  disabled={saving || (!uploadedDesign && !designText)}
                  className="py-2.5 px-3 border border-kavox-border rounded-sm text-xs font-medium text-kavox-black hover:bg-kavox-sand disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5"
                >
                  {saving ? (
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Save Design
                </button>
                <button
                  onClick={() => handleSaveDesign(true)}
                  disabled={saving || !uploadedDesign}
                  className="py-2.5 px-3 bg-kavox-charcoal text-white rounded-sm text-xs font-medium hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {savedDesignId ? 'Send to Qikink' : 'Save & Order'}
                </button>
              </div>
              <p className="text-center text-xs text-kavox-gray font-light">
                🖨️ Printed by Qikink · Ships in 5–7 days · Free returns
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
