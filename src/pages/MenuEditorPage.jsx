import React, { useState, useRef, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrder } from "../context/OrderContext";
import { useAuth } from "../context/AuthContext";
import {
  ArrowLeft, Plus, Pencil, Trash2, Save, X, Upload, Image,
  CheckCircle, AlertCircle, Eye, EyeOff,
  Loader2, BookOpen, FolderPlus, Search, Sparkles, ShieldCheck, Lock
} from "lucide-react";
import ImageCropperModal from "../components/ImageCropperModal";
import SubscriptionModal from "../components/SubscriptionModal";
import { supabase } from "../lib/supabaseClient";
import { getBackendBaseUrl } from '../utils/apiConfig';

const DEFAULT_CATEGORIES = [];

const EMPTY_ITEM = {
  id: "",
  name: "",
  category: "Nasi",
  price: "",
  description: "",
  image: "",
  isActive: true,
  optionGroups: []
};

function Toast({ msg, type, onClose }) {
  if (!msg) return null;
  return (
    <div className={`fixed top-6 right-4 left-4 sm:left-auto sm:w-96 z-[999] flex items-start gap-3 p-4 rounded-2xl shadow-2xl border animate-slideUpLight ${type === "ok" ? "bg-emerald-950 border-emerald-500/50 text-emerald-300" : "bg-rose-950 border-rose-500/50 text-rose-300"}`}>
      {type === "ok" ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />}
      <p className="text-sm font-medium flex-1">{msg}</p>
      <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
    </div>
  );
}

// resolveImageUrl: Memastikan URL gambar yang menggunakan path relatif (/uploads/...) dihala ke backend yang betul.
function resolveImageUrl(uploadPath) {
  if (!uploadPath) return null;
  if (uploadPath.startsWith('http://') || uploadPath.startsWith('https://') || uploadPath.startsWith('data:')) {
    return uploadPath; // Sudah pun URL mutlak atau Base64
  }
  if (uploadPath.startsWith('/uploads/')) {
    return `${getBackendBaseUrl()}${uploadPath}`;
  }
  return uploadPath;
}

function ImageUploadZone({ currentImage, onImageUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentImage || "");
  const [imgError, setImgError] = useState(false);
  const inputRef = useRef(null);
  const { tenant } = useAuth();

  useEffect(() => {
    setPreviewUrl(currentImage || "");
    setImgError(false);
  }, [currentImage]);

  const handleUrlChange = (val) => {
    setPreviewUrl(val);
    setImgError(false);
    onImageUploaded(val);
  };

  const getBaseUrl = () => {
    return getBackendBaseUrl();
  };

  const handleUpload = async (file) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      alert(`Format tidak disokong (${file.type}). Sila pilih JPG, PNG, atau WEBP.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert(`Saiz fail terlalu besar (${(file.size / 1024 / 1024).toFixed(2)}MB). Maksimum 5MB sahaja.`);
      return;
    }

    // Preview blob tempatan dahulu (selalu berjaya paparkan segera)
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setImgError(false);
    setUploading(true);

    const tenantId = tenant?.id || localStorage.getItem('fb_tenant_id') || 'demo-tenant';

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("tenant_id", tenantId);

      const targetApi = `${getBaseUrl()}/api/menu/upload-image`;
      console.log("📡 [UPLOAD] Menghantar gambar ke VPS:", targetApi);

      const res = await fetch(targetApi, {
        method: "POST",
        headers: { "x-tenant-id": tenantId },
        body: formData
      });

      const data = await res.json();
      console.log("📦 [UPLOAD] Respons VPS backend:", res.status, data);

      if (res.ok && data.status === "OK" && data.url) {
        const resolved = resolveImageUrl(data.url);
        console.log("✅ [UPLOAD] Gambar disimpan di VPS:", data.url, "-> Resolved:", resolved);
        setPreviewUrl(resolved);
        setImgError(false);
        onImageUploaded(resolved);
      } else {
        const msg = data.message || 'Ralat muat naik backend';
        console.error("❌ [UPLOAD] Gagal:", msg);
        alert(`❌ Muat naik gambar gagal: ${msg}`);
        setPreviewUrl(currentImage || "");
      }
    } catch (e) {
      console.warn("💥 [UPLOAD] Backend unavailable, converting to Base64 fallback:", e.message);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64Url = evt.target.result;
        setPreviewUrl(base64Url);
        setImgError(false);
        onImageUploaded(base64Url);
      };
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) handleUpload(file); };

  const finalSrc = resolveImageUrl(previewUrl);

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5"><Image className="w-3.5 h-3.5 text-rose-400" /> Gambar Hidangan</label>

      <div
        className={`relative border-2 border-dashed rounded-2xl transition cursor-pointer overflow-hidden ${dragging ? "border-rose-400 bg-rose-500/10" : "border-slate-700 hover:border-slate-500 bg-slate-950/60"}`}
        style={{ minHeight: "160px" }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {finalSrc && !imgError ? (
          <div className="relative group">
            <img
              src={finalSrc}
              alt="Preview"
              className="w-full h-48 object-cover"
              onError={() => {
                console.warn('⚠️ Gagal muat imej preview dari URL:', finalSrc);
                setImgError(true);
              }}
            />
            <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-2">
              <Upload className="w-7 h-7 text-white" />
              <p className="text-white text-xs font-bold">Klik atau seret gambar baharu</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
            {uploading ? <Loader2 className="w-10 h-10 text-rose-400 animate-spin" /> : (
              <>
                <div className="h-14 w-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-slate-400" />
                </div>
                <div>
                  <p className="text-slate-200 text-sm font-bold">
                    {imgError ? '⚠️ Gagal Muat Gambar (Format/URL Salah)' : 'Seret & Lepas Gambar Di Sini'}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">atau klik untuk pilih fail dari komputer/telefon anda</p>
                  <p className="text-slate-600 text-[10px] mt-2 font-mono">JPG / PNG / WEBP — Maksimum 5MB</p>
                </div>
              </>
            )}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-8 h-8 text-rose-400 animate-spin" />
            <p className="text-slate-200 text-xs font-bold">Sedang muat naik gambar ke VPS...</p>
          </div>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => handleUpload(e.target.files[0])} />
      
      <div className="flex items-center gap-2 pt-1">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-[10px] text-slate-600 font-mono">atau pastekan pautan URL gambar</span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      <input
        type="url"
        value={previewUrl}
        onChange={(e) => handleUrlChange(e.target.value)}
        placeholder="https://contoh.com/gambar.jpg"
        className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-rose-500 transition placeholder-slate-600 font-mono"
      />
    </div>
  );
}

function parseOptionString(optStr) {
  if (typeof optStr !== 'string') return { text: '', price: '' };
  const match = optStr.match(/^(.*?)\s*\(\+RM\s*([\d.]+)\)$/i);
  if (match) {
    return { text: match[1].trim(), price: match[2] };
  }
  return { text: optStr.trim(), price: '' };
}

function OptionGroupEditor({ groups, onChange }) {
  const addGroup = () => onChange([...groups, { name: "", required: false, options: [""] }]);
  const removeGroup = (gi) => onChange(groups.filter((_, i) => i !== gi));
  const updateGroup = (gi, field, value) => onChange(groups.map((g, i) => i === gi ? { ...g, [field]: value } : g));

  const toggleRequired = (gi, isRequired) => {
    onChange(groups.map((g, i) => {
      if (i !== gi) return g;
      // If toggling to Wajib (required = true), strip (+RM...) extra price from options
      const cleanOpts = isRequired
        ? g.options.map(o => parseOptionString(o).text)
        : g.options;
      return { ...g, required: isRequired, options: cleanOpts };
    }));
  };

  const addOption = (gi) => onChange(groups.map((g, i) => i === gi ? { ...g, options: [...g.options, ""] } : g));
  const removeOption = (gi, oi) => onChange(groups.map((g, i) => i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g));

  const updateOptionText = (gi, oi, newText) => {
    onChange(groups.map((g, i) => {
      if (i !== gi) return g;
      const parsed = parseOptionString(g.options[oi] || "");
      const price = parsed.price;
      const p = parseFloat(price);
      const formatted = !g.required && !isNaN(p) && p > 0
        ? `${newText.trim()} (+RM${p.toFixed(2)})`
        : newText;
      return {
        ...g,
        options: g.options.map((o, j) => j === oi ? formatted : o)
      };
    }));
  };

  const updateOptionPrice = (gi, oi, newPrice) => {
    onChange(groups.map((g, i) => {
      if (i !== gi) return g;
      const parsed = parseOptionString(g.options[oi] || "");
      const text = parsed.text;
      const p = parseFloat(newPrice);
      const formatted = !g.required && !isNaN(p) && p > 0
        ? `${text} (+RM${p.toFixed(2)})`
        : text;
      return {
        ...g,
        options: g.options.map((o, j) => j === oi ? formatted : o)
      };
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-300">Pilihan Pelanggan (Option Groups / Add-ons)</label>
        <button type="button" onClick={addGroup} className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold rounded-lg transition">
          <Plus className="w-3.5 h-3.5" /> Tambah Kumpulan
        </button>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-900/60 border border-slate-800 rounded-xl p-3">
        Contoh Add-on: "Tambahan" dengan pilihan "Telur (+RM1.50)". Jika tidak diisi Wajib, anda boleh masukkan Harga Tambahan (RM).
      </p>
      {groups.length === 0 && <p className="text-center text-slate-600 text-xs py-4 border border-dashed border-slate-800 rounded-xl">Tiada pilihan. Tekan butang di atas untuk tambah. (Contoh: Saiz, Tahap Pedas, Add-ons)</p>}
      {groups.map((grp, gi) => (
        <div key={gi} className="border border-slate-700 rounded-2xl p-4 space-y-3 bg-slate-900/40">
          <div className="flex items-center gap-2">
            <input type="text" value={grp.name} onChange={(e) => updateGroup(gi, "name", e.target.value)} placeholder="Nama kumpulan (cth: Tambahan / Add-ons)" className="flex-1 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-rose-500 transition placeholder-slate-600" />
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
              <input type="checkbox" checked={grp.required} onChange={(e) => toggleRequired(gi, e.target.checked)} className="accent-rose-500 w-3.5 h-3.5" />
              <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">Wajib pilih</span>
            </label>
            <button type="button" onClick={() => removeGroup(gi)} className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-lg transition"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <div className="space-y-2 pl-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">Senarai Pilihan:</p>
              {!grp.required && <span className="text-[10px] text-emerald-400 font-mono">Harga Tambahan (RM)</span>}
            </div>
            {grp.options.map((opt, oi) => {
              const { text, price } = parseOptionString(opt);

              return (
                <div key={oi} className="flex items-center gap-2">
                  <span className="text-slate-600 text-[10px] font-mono w-4 text-right shrink-0">{oi + 1}.</span>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => updateOptionText(gi, oi, e.target.value)}
                    placeholder={`Pilihan ${oi + 1} (cth: ${grp.required ? 'Pedas Biasa' : 'Telur Masak Kicap'})`}
                    className="flex-1 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 outline-none focus:border-rose-500 transition placeholder-slate-600"
                  />
                  {!grp.required && (
                    <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 shrink-0">
                      <span className="text-[11px] font-mono text-emerald-400 font-bold">+RM</span>
                      <input
                        type="number"
                        step="0.10"
                        min="0"
                        value={price}
                        onChange={(e) => updateOptionPrice(gi, oi, e.target.value)}
                        placeholder="0.00"
                        className="w-16 bg-transparent text-slate-200 text-xs font-mono font-bold outline-none placeholder-slate-600"
                      />
                    </div>
                  )}
                  {grp.options.length > 1 && (
                    <button type="button" onClick={() => removeOption(gi, oi)} className="p-1.5 text-slate-600 hover:text-rose-400 transition shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={() => addOption(gi)} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition ml-5"><Plus className="w-3.5 h-3.5" /> Tambah pilihan</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemFormModal({ item, isNew, onSave, onClose, allCategories = DEFAULT_CATEGORIES, onAddNewCategory }) {
  const [form, setForm] = useState({ ...EMPTY_ITEM, ...item, price: item?.price !== undefined ? String(item.price) : "", optionGroups: item?.optionGroups ? JSON.parse(JSON.stringify(item.optionGroups)) : [] });
  const [saving, setSaving] = useState(false);
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [customCatInput, setCustomCatInput] = useState("");

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleAddCustomCat = () => {
    const trimmed = customCatInput.trim();
    if (!trimmed) return;
    if (onAddNewCategory) onAddNewCategory(trimmed);
    set("category", trimmed);
    setShowNewCatInput(false);
    setCustomCatInput("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert("Sila masukkan nama hidangan.");
    const generateUUID = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });
    const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const finalId = (form.id && isUUID(form.id)) ? form.id : generateUUID();
    const cleaned = { ...form, id: finalId, price: parseFloat(Number(form.price).toFixed(2)), optionGroups: (form.optionGroups || []).filter(g => g?.name?.trim()).map(g => ({ ...g, options: (g.options || []).filter(o => typeof o === 'string' && o.trim()) })) };
    await onSave(cleaned);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md overflow-y-auto">
      <div className="min-h-screen flex items-start justify-center p-4 py-8">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 rounded-t-3xl z-10">
            <div>
              <p className="text-[11px] font-bold text-rose-400 uppercase tracking-widest">{isNew ? "Tambah Hidangan Baharu" : "Edit Maklumat Hidangan"}</p>
              <h3 className="font-extrabold text-lg text-white mt-0.5">{isNew ? "Isi Maklumat Hidangan" : form.name || "Edit Hidangan"}</h3>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800 text-slate-400 transition"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-5">
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-1">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Langkah 1 — Gambar Hidangan</p>
              <ImageUploadZone currentImage={form.image} onImageUploaded={(url) => set("image", url)} />
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Langkah 2 — Maklumat Hidangan</p>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Nama Hidangan <span className="text-rose-400">*</span></label>
                <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Contoh: Nasi Ayam Hainan Steam" maxLength={80} className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-rose-500 transition placeholder-slate-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">Kategori <span className="text-rose-400">*</span></label>
                    <button type="button" onClick={() => setShowNewCatInput(!showNewCatInput)} className="text-[10px] text-rose-400 hover:underline font-bold flex items-center gap-0.5">
                      <Plus className="w-3 h-3" /> Baharu
                    </button>
                  </div>
                  {!showNewCatInput ? (
                    <select value={form.category} onChange={(e) => {
                      if (e.target.value === "__ADD_NEW__") {
                        setShowNewCatInput(true);
                      } else {
                        set("category", e.target.value);
                      }
                    }} className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-3 py-3 outline-none focus:border-rose-500 transition">
                      {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__ADD_NEW__">+ Tambah Kategori Baharu...</option>
                    </select>
                  ) : (
                    <div className="flex gap-1">
                      <input type="text" value={customCatInput} onChange={(e) => setCustomCatInput(e.target.value)} placeholder="Kategori baharu" className="w-full bg-slate-950 border border-rose-500 text-slate-200 text-xs rounded-xl px-2.5 py-2.5 outline-none" autoFocus />
                      <button type="button" onClick={handleAddCustomCat} className="px-2.5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shrink-0">Guna</button>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Harga (RM) <span className="text-rose-400">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-mono font-bold">RM</span>
                    <input type="number" min="0" step="0.10" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="0.00" className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl pl-10 pr-3 py-3 outline-none focus:border-rose-500 transition placeholder-slate-600" />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Penerangan Ringkas <span className="text-slate-500 font-normal">(optional)</span></label>
                <textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Terangkan bahan utama atau cara penyediaan hidangan ini..." rows={3} maxLength={200} className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-rose-500 transition placeholder-slate-600 resize-none" />
                <p className="text-[10px] text-slate-600 text-right font-mono">{form.description.length}/200</p>
              </div>
              <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-slate-200">Paparkan di Menu Pelanggan</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Jika dimatikan, hidangan ini tidak akan nampak di menu</p>
                </div>
                <button type="button" onClick={() => set("isActive", !form.isActive)} className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${form.isActive ? "bg-emerald-500" : "bg-slate-700"}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300 ${form.isActive ? "left-7" : "left-1"}`} />
                </button>
              </div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Langkah 3 — Pilihan Pelanggan (Jika Ada)</p>
              <OptionGroupEditor groups={form.optionGroups} onChange={(grps) => set("optionGroups", grps)} />
            </div>
          </div>
          <div className="px-6 pb-6 flex gap-3">
            <button onClick={onClose} className="flex-1 py-3.5 border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold rounded-2xl text-sm transition">Batal</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-3.5 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-black rounded-2xl text-sm flex items-center justify-center gap-2 transition shadow-xl shadow-rose-600/20">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Menyimpan..." : isNew ? "Tambah ke Menu" : "Simpan Perubahan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MenuEditorPage() {
  const navigate = useNavigate();
  const { menuItems = [], updateMenuItems = () => {}, receiptSettings = {}, updateReceiptSettings = () => {} } = useOrder() || {};
  const { tenant } = useAuth();
  const isSubscribed = tenant?.subscription_status === 'active';
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);

  const [localMenu, setLocalMenu] = useState(() => {
    return Array.isArray(menuItems) ? JSON.parse(JSON.stringify(menuItems)) : [];
  });
  const [isLoading, setIsLoading] = useState(() => !Array.isArray(menuItems) || menuItems.length === 0);

  // Keep localMenu synced when menuItems loads or updates from backend
  useEffect(() => {
    if (Array.isArray(menuItems)) {
      setLocalMenu(JSON.parse(JSON.stringify(menuItems)));
      setIsLoading(false);
    }
  }, [menuItems]);

  const [addedCategories, setAddedCategories] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "ok" });
  const [filterCat, setFilterCat] = useState("Semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddCatModalOpen, setIsAddCatModalOpen] = useState(false);
  const [newCatModalInput, setNewCatModalInput] = useState("");
  const [rawBannerSrc, setRawBannerSrc] = useState(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);

  const handleBannerFileChange = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('❌ Sila pilih fail gambar sahaja (JPG, PNG, WEBP).', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setRawBannerSrc(e.target.result);
      setIsCropperOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const [isBannerUploading, setIsBannerUploading] = useState(false);

  const handleSaveCroppedBanner = async (croppedDataUrl) => {
    setIsCropperOpen(false);
    setRawBannerSrc(null);
    setIsBannerUploading(true);

    try {
      const tenantId = tenant?.id || localStorage.getItem('fb_tenant_id') || 'demo-tenant';
      const BASE = getBackendBaseUrl();

      console.log('🖼️ Uploading cropped welcome banner for tenant:', tenantId);

      let savedUrl = null;
      try {
        const res = await fetch(`${BASE}/api/banner/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
          body: JSON.stringify({ imageBase64: croppedDataUrl, tenant_id: tenantId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'OK' && data.url) {
            savedUrl = data.url;
          }
        }
      } catch (backendErr) {
        console.warn('Backend banner upload endpoint unavailable, falling back to direct Supabase save:', backendErr);
      }

      // Fallback: Use croppedDataUrl directly if backend is unavailable (e.g. Vercel static hosting)
      const finalBannerUrl = savedUrl || croppedDataUrl;
      if (updateReceiptSettings) {
        await updateReceiptSettings({ welcomeBannerUrl: finalBannerUrl });
      }
      showToast('✨ Gambar Banner Selamat Datang berjaya disimpan & dikongsi ke semua peranti!', 'ok');
    } catch (err) {
      showToast('❌ Gagal muat naik banner.', 'error');
      console.error('Banner upload error:', err);
    } finally {
      setIsBannerUploading(false);
    }
  };

  const handleResetBanner = async () => {
    if (updateReceiptSettings) {
      updateReceiptSettings({ welcomeBannerUrl: null });
    }

    // Kemaskini Supabase tenant_settings.welcome_banner_url = null
    try {
      const tenantId = tenant?.id;
      if (tenantId) {
        const BASE = getBackendBaseUrl();
        await fetch(`${BASE}/api/banner/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
          body: JSON.stringify({ tenant_id: tenantId })
        });
      }
    } catch (_) {}

    showToast('🗑️ Gambar Banner Selamat Datang dipadam. Menggunakan paparan lalai.', 'ok');
  };

  const currentTemplate = receiptSettings?.customerMenuTemplate || 'modern';
  const currentViewMode = receiptSettings?.customerMenuViewMode || localStorage.getItem('fb_customer_menu_view_mode') || 'grid';

  const handleSelectTemplate = (tpl) => {
    if (updateReceiptSettings) {
      updateReceiptSettings({ customerMenuTemplate: tpl });
    }
    
    showToast(`✨ Template Web Pelanggan diubah ke: ${tpl === 'kopitiam' ? 'MEJA Kopitiam Docket' : 'Modern Dynamic'}!`, "ok");
  };

  const handleSelectViewMode = (mode) => {
    if (updateReceiptSettings) {
      updateReceiptSettings({ customerMenuViewMode: mode });
    }
    localStorage.setItem('fb_customer_menu_view_mode', mode);
    showToast(`✨ Gaya Susunan Menu Pelanggan diubah ke: ${mode === 'book' ? '📖 Mode Buku Menu (Klasik)' : '🖼️ Mode Kad (Grid)'}!`, "ok");
  };

  const [removedCategories, setRemovedCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('fb_removed_categories');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [catToDelete, setCatToDelete] = useState(null);

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast({ msg: "", type: "ok" }), 4000); };

  // Compute all available categories dynamically with safe array guards
  const allCategories = useMemo(() => {
    const safeMenu = Array.isArray(localMenu) ? localMenu : [];
    const fromMenu = safeMenu.map(i => i?.category).filter(Boolean);
    const safeAdded = Array.isArray(addedCategories) ? addedCategories : [];
    const safeRemoved = Array.isArray(removedCategories) ? removedCategories : [];
    const combined = Array.from(new Set([...fromMenu, ...safeAdded]));
    return combined.filter(c => c && !safeRemoved.includes(c));
  }, [localMenu, addedCategories, removedCategories]);

  const handleAddNewCategory = (newCat) => {
    const trimmed = (newCat || "").trim();
    if (!trimmed) return;
    const safeAdded = Array.isArray(addedCategories) ? addedCategories : [];
    const safeRemoved = Array.isArray(removedCategories) ? removedCategories : [];
    if (!safeAdded.includes(trimmed)) {
      setAddedCategories(prev => [...(Array.isArray(prev) ? prev : []), trimmed]);
    }
    // If it was previously removed, un-remove it
    if (safeRemoved.includes(trimmed)) {
      const newRemoved = safeRemoved.filter(c => c !== trimmed);
      setRemovedCategories(newRemoved);
      localStorage.setItem('fb_removed_categories', JSON.stringify(newRemoved));
    }
    setFilterCat(trimmed);
    showToast(`✨ Kategori "${trimmed}" ditambah!`, "ok");
  };

  const handleCreateCategoryFromModal = () => {
    try {
      const trimmed = (newCatModalInput || "").trim();
      if (!trimmed) return alert("Sila masukkan nama kategori.");
      handleAddNewCategory(trimmed);
      setNewCatModalInput("");
      setIsAddCatModalOpen(false);
    } catch (err) {
      console.error("Gagal menambah kategori:", err);
      showToast("❌ Gagal menambah kategori.", "error");
    }
  };

  const handleSaveItem = async (updatedItem) => {
    let newMenu;
    const existingIdx = localMenu.findIndex(i => i.id === updatedItem.id);
    if (existingIdx >= 0) { newMenu = localMenu.map((item, idx) => idx === existingIdx ? updatedItem : item); }
    else { newMenu = [...localMenu, updatedItem]; }
    setLocalMenu(newMenu);
    setEditingItem(null);
    setIsAddingNew(false);
    setSaving(true);
    const result = await updateMenuItems(newMenu);
    setSaving(false);
    if (result?.status === "OK") showToast("Menu berjaya disimpan dan dikemas kini!", "ok");
    else showToast(result?.message || "Gagal simpan ke server.", "err");
  };

  const handleToggleActive = async (id) => {
    const newMenu = localMenu.map(item => item.id === id ? { ...item, isActive: !item.isActive } : item);
    setLocalMenu(newMenu);
    setSaving(true);
    const result = await updateMenuItems(newMenu);
    setSaving(false);
    if (result?.status === "OK") { const item = newMenu.find(i => i.id === id); showToast(item.isActive ? "Hidangan kini dipaparkan di menu." : "Hidangan disembunyikan dari menu.", "ok"); }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    const newMenu = (localMenu || []).filter(i => i?.id !== confirmDelete);
    setLocalMenu(newMenu);
    setConfirmDelete(null);
    setSaving(true);
    const result = await updateMenuItems(newMenu);
    setSaving(false);
    if (result?.status === "OK") showToast("Hidangan berjaya dipadam.", "ok");
  };

  const safeLocalMenu = Array.isArray(localMenu) ? localMenu : [];
  const filtered = safeLocalMenu.filter(item => {
    if (!item) return false;
    const matchCat = filterCat === "Semua" || item.category === filterCat;
    const q = (searchQuery || "").trim().toLowerCase();
    const matchSearch = !q ||
      (item.name || "").toLowerCase().includes(q) ||
      (item.description && String(item.description).toLowerCase().includes(q)) ||
      (item.category && String(item.category).toLowerCase().includes(q));
    return matchCat && matchSearch;
  });
  const activeCount = safeLocalMenu.filter(i => i && i.isActive !== false).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-rose-500 selection:text-white">
      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: "", type: "ok" })} />
      <header className="bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-30 px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/staff")} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Kembali ke Dashboard"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-widest">Pengurusan Menu</span>
              <h1 className="font-extrabold text-lg text-white leading-tight">Edit Menu Restoran</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && <div className="flex items-center gap-1.5 text-xs text-amber-400 font-mono"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline">Menyimpan...</span></div>}
            <button
              onClick={() => {
                if (!isSubscribed) {
                  setToast({ msg: "🔒 Mod Demo / Pelan Percuma: Sila Upgrade Langganan untuk menambah kategori baharu!", type: "error" });
                  setIsSubModalOpen(true);
                  return;
                }
                setNewCatModalInput("");
                setIsAddCatModalOpen(true);
              }}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-2 border text-xs font-bold rounded-xl transition ${
                !isSubscribed
                  ? "bg-slate-900 border-amber-500/40 text-amber-300 hover:bg-slate-800 cursor-pointer"
                  : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-rose-400"
              }`}
            >
              {!isSubscribed ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <FolderPlus className="w-4 h-4" />}
              <span>+ Kategori Baharu</span>
            </button>
            <button
              onClick={() => {
                if (!isSubscribed) {
                  setToast({ msg: "🔒 Mod Demo / Pelan Percuma: Sila Upgrade Langganan untuk menambah hidangan baharu!", type: "error" });
                  setIsSubModalOpen(true);
                  return;
                }
                setIsAddingNew(true);
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black rounded-2xl shadow-lg transition ${
                !isSubscribed
                  ? "bg-slate-800 text-slate-200 border border-amber-500/50 hover:bg-slate-700 cursor-pointer"
                  : "bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 shadow-rose-600/20"
              }`}
            >
              {!isSubscribed ? <Lock className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4" />}
              <span>+ Tambah Hidangan</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 border border-dashed border-slate-800 rounded-3xl">
            <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
            <p className="text-slate-400 font-bold text-sm">Memuatkan Senarai Menu & Kategori...</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Free Plan / Demo Sekatan Notice Banner */}
            {!isSubscribed && (
              <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-900 border-2 border-amber-500/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-amber-500/20 border border-amber-500/40 rounded-xl flex items-center justify-center text-amber-400 shrink-0 shadow-md">
                    <ShieldCheck className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-amber-300">Mod Demo / Pelan Percuma Restoran</span>
                      <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-mono font-bold rounded-full">Sekatan Aktif</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Kerana akaun ini belum mengesahkan langganan aktif, fungsi <strong>+ Kategori Baharu</strong>, <strong>+ Tambah Hidangan</strong>, <strong>Edit</strong>, <strong>Sembunyikan</strong>, dan <strong>Padam</strong> dikunci secara automatik. Sila langgan untuk menyahkunci kawalan menu.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSubModalOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] hover:brightness-110 text-white font-extrabold text-xs rounded-full shadow-lg shadow-[#F04D23]/30 flex items-center gap-1.5 shrink-0 transition transform hover:-translate-y-0.5 active:scale-95"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Upgrade Langganan</span>
                </button>
              </div>
            )}
            <div className="bg-gradient-to-r from-blue-950/60 to-slate-900 border border-blue-500/30 rounded-2xl p-4 flex gap-3">
          <div className="h-8 w-8 bg-blue-500/20 border border-blue-500/30 rounded-xl flex items-center justify-center shrink-0 mt-0.5"><BookOpen className="w-4 h-4 text-blue-400" /></div>
          <div>
            <p className="text-sm font-bold text-blue-200">Cara Menggunakan Panel Ini</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Tekan <strong className="text-white">Edit</strong> untuk ubah maklumat atau gambar hidangan.
              Tekan <strong className="text-rose-400">+ Kategori Baharu</strong> untuk cipta kategori baharu.
              Tekan <strong className="text-white">+ Tambah Hidangan</strong> untuk masukkan hidangan baharu.
              Semua perubahan <strong className="text-emerald-400">disimpan secara automatik</strong>.
            </p>
          </div>
        </div>

        {/* Template Selector Card (Pilihan Template Web Pelanggan) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white">Template / Reka Bentuk Web Pelanggan</h3>
                <p className="text-[11px] text-slate-400">Pilih susun atur & gaya tema paparan menu yang dilihat pelanggan pada telefon mereka.</p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-mono font-bold rounded-full">
              AKTIF: {currentTemplate === 'kopitiam' ? 'Kopitiam Docket' : 'Modern Dynamic'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Option 1: Modern Dynamic */}
            <div 
              onClick={() => handleSelectTemplate('modern')}
              className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-center gap-3.5 ${
                currentTemplate !== 'kopitiam'
                  ? 'bg-slate-950 border-rose-500 shadow-lg shadow-rose-500/10 ring-2 ring-rose-500/30'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-80'
              }`}
            >
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center text-2xl shrink-0 shadow">
                📱
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-xs text-white">Modern Dynamic (Sedia Ada)</h4>
                  {currentTemplate !== 'kopitiam' && <CheckCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Gaya moden bersih dengan mod Dark/Light, badge bercahaya, dan troli melayang.</p>
              </div>
            </div>

            {/* Option 2: Kopitiam Docket (MEJA Terrazzo) */}
            <div 
              onClick={() => handleSelectTemplate('kopitiam')}
              className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-center gap-3.5 ${
                currentTemplate === 'kopitiam'
                  ? 'bg-[#FAF7EF] text-[#22262B] border-[#1F5B4A] shadow-lg ring-2 ring-[#1F5B4A]/40'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-80'
              }`}
            >
              <div className="h-12 w-12 rounded-2xl bg-[#1F5B4A] text-[#FAF7EF] flex items-center justify-center text-2xl shrink-0 shadow font-zilla font-bold">
                🍵
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className={`font-black text-xs ${currentTemplate === 'kopitiam' ? 'text-[#22262B]' : 'text-white'}`}>MEJA Kopitiam Docket</h4>
                  {currentTemplate === 'kopitiam' && <CheckCircle className="w-4 h-4 text-[#1F5B4A] shrink-0" />}
                </div>
                <p className={`text-[11px] mt-0.5 leading-snug ${currentTemplate === 'kopitiam' ? 'text-[#6B6F66]' : 'text-slate-400'}`}>Gaya Terrazzo Klasik, tiket dapur bertindih, warna enamel hijau & mustard, animasi lancar.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Menu View Mode Selector Card (Mode Kad vs Mode Buku Menu) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white">Gaya Susunan Menu Pelanggan (Mode Kad / Mode Buku)</h3>
                <p className="text-[11px] text-slate-400">Pilih sama ada menu dipaparkan secara Kad Gambar atau Buku Menu Animasi 3D Selak Kertas.</p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold rounded-full">
              MODE: {currentViewMode === 'book' ? '📖 Buku Menu' : '🖼️ Mode Kad'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Mode 1: Grid / Kad */}
            <div 
              onClick={() => handleSelectViewMode('grid')}
              className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-center gap-3.5 ${
                currentViewMode !== 'book'
                  ? 'bg-slate-950 border-emerald-500 shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-500/30'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-80'
              }`}
            >
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-2xl shrink-0 shadow">
                🖼️
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-xs text-white">Mode Kad (Grid View)</h4>
                  {currentViewMode !== 'book' && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Paparan kad hidangan visual mengikut grid petak bersama gambar/emoji & lencana.</p>
              </div>
            </div>

            {/* Mode 2: Book / Buku Menu (Animasi Selak 3D) */}
            <div 
              onClick={() => handleSelectViewMode('book')}
              className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-center gap-3.5 ${
                currentViewMode === 'book'
                  ? 'bg-[#FDFBF7] text-[#22262B] border-[#163F35] shadow-lg ring-2 ring-[#163F35]/40'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-80'
              }`}
            >
              <div className="h-12 w-12 rounded-2xl bg-[#163F35] text-[#FDFBF7] flex items-center justify-center text-2xl shrink-0 shadow font-zilla font-bold">
                📖
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className={`font-black text-xs ${currentViewMode === 'book' ? 'text-[#22262B]' : 'text-white'}`}>Mode Buku Menu (Klasik)</h4>
                  {currentViewMode === 'book' && <CheckCircle className="w-4 h-4 text-[#163F35] shrink-0" />}
                </div>
                <p className={`text-[11px] mt-0.5 leading-snug ${currentViewMode === 'book' ? 'text-[#6B6F66]' : 'text-slate-400'}`}>Paparan selak buku menu berhalaman klasik dengan animasi selak kertas 3D & dotted leaders.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Welcome Banner Card (Screen 1 Custom Image Upload & Cropper) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold">
                <Image className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white">Gambar Banner Selamat Datang (Screen 1 - Nama)</h3>
                <p className="text-[11px] text-slate-400">Muat naik & potong (crop) gambar header tersuai yang dipaparkan pada bahagian atas Skrin 1 Pelanggan.</p>
              </div>
            </div>
            {receiptSettings?.welcomeBannerUrl && (
              <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold rounded-full flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Custom Banner Aktif
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* Banner Preview Box */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[16/9] flex items-center justify-center group shadow-inner">
              {receiptSettings?.welcomeBannerUrl ? (
                <>
                  <img
                    src={resolveImageUrl(receiptSettings.welcomeBannerUrl)}
                    alt="Custom Welcome Banner"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.warn('⚠️ Gagal muat banner imej:', receiptSettings.welcomeBannerUrl);
                      e.target.onerror = null;
                      e.target.src = 'https://placehold.co/800x450/0f172a/rose?text=Gagal+Muat+Banner';
                    }}
                  />
                  <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 backdrop-blur-xs">
                    <button
                      onClick={handleResetBanner}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Reset
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center p-4 space-y-1 text-slate-500">
                  <Image className="w-8 h-8 mx-auto opacity-50 text-slate-600" />
                  <p className="text-xs font-bold text-slate-400">Tiada Gambar Banner Tersuai</p>
                  <p className="text-[10px] opacity-75">Sistem menggunakan grafik lalai.</p>
                </div>
              )}
            </div>

            {/* Upload & Drag Drop Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleBannerFileChange(e.dataTransfer.files[0]);
                }
              }}
              className="border-2 border-dashed border-slate-800 hover:border-rose-500/60 rounded-2xl p-5 text-center space-y-3 bg-slate-950/50 transition flex flex-col items-center justify-center min-h-[160px]"
            >
              <div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">Tarik & Lepaskan gambar di sini</p>
                <p className="text-[11px] text-slate-400 mt-0.5">atau pilih fail dari komputer / telefon anda</p>
              </div>

              <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl cursor-pointer transition flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-rose-400" />
                <span>Pilih Fail Gambar</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleBannerFileChange(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama hidangan, kategori, atau penerangan..."
            className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-sm rounded-2xl pl-11 pr-10 py-3 outline-none focus:border-rose-500 transition placeholder-slate-500 shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Filter Tabs with Add Category Button */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {["Semua", ...allCategories].map(cat => {
            const isSelected = filterCat === cat;
            const count = (localMenu || []).filter(i => i?.category === cat).length;

            return (
              <div key={cat} className="flex items-center shrink-0">
                <button
                  onClick={() => setFilterCat(cat)}
                  className={`px-4 py-2 rounded-2xl text-xs font-black whitespace-nowrap transition border ${
                    isSelected
                      ? "bg-gradient-to-r from-rose-600 to-amber-500 text-slate-950 border-transparent shadow-lg shadow-rose-600/20"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600 hover:text-slate-200"
                  } ${cat !== "Semua" ? "rounded-r-none border-r-0" : ""}`}
                >
                  {cat}
                  {cat !== "Semua" && <span className="ml-1.5 text-[10px] opacity-70">({count})</span>}
                </button>

                {/* TRASH BUTTON FOR CATEGORY (Except 'Semua') */}
                {cat !== "Semua" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isSubscribed) {
                        setToast({ msg: "🔒 Mod Demo / Pelan Percuma: Sila Upgrade Langganan untuk memadam kategori!", type: "error" });
                        setIsSubModalOpen(true);
                        return;
                      }
                      setCatToDelete({ name: cat, count });
                    }}
                    className={`px-2.5 py-2 rounded-r-2xl border text-xs transition cursor-pointer ${
                      isSelected
                        ? "bg-amber-500 text-slate-950 border-amber-400 hover:bg-rose-600 hover:text-white hover:border-rose-500"
                        : "bg-slate-900 border-slate-800 text-slate-500 hover:text-rose-400 hover:border-rose-500/40"
                    }`}
                    title={`Padam kategori "${cat}"`}
                  >
                    {!isSubscribed ? <Lock className="w-3 h-3 text-amber-400" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            );
          })}
          <button 
            onClick={() => {
              if (!isSubscribed) {
                setToast({ msg: "🔒 Mod Demo / Pelan Percuma: Sila Upgrade Langganan untuk menambah kategori baharu!", type: "error" });
                setIsSubModalOpen(true);
                return;
              }
              setNewCatModalInput(""); 
              setIsAddCatModalOpen(true); 
            }} 
            className="px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 shrink-0 cursor-pointer"
          >
            {!isSubscribed ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Plus className="w-3.5 h-3.5" />} Kategori Baharu
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-3xl space-y-3">
            <div className="text-4xl">🔍</div>
            <p className="text-slate-400 font-bold">
              {searchQuery ? `Tiada carian dijumpai untuk "${searchQuery}"` : `Tiada hidangan dalam kategori "${filterCat}"`}
            </p>
            <p className="text-slate-600 text-xs">
              {searchQuery ? "Cuba kata kunci carian yang lain" : "Tekan '+ Tambah Hidangan' untuk masukkan hidangan di bawah kategori ini"}
            </p>
            {searchQuery ? (
              <button onClick={() => setSearchQuery("")} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition border border-slate-700">
                Padam Carian
              </button>
            ) : (
              <button 
                onClick={() => {
                  if (!isSubscribed) {
                    setToast({ msg: "🔒 Mod Demo / Pelan Percuma: Sila Upgrade Langganan untuk menambah hidangan baharu!", type: "error" });
                    setIsSubModalOpen(true);
                    return;
                  }
                  setIsAddingNew(true);
                }} 
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 mx-auto cursor-pointer"
              >
                {!isSubscribed ? <Lock className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4" />} + Tambah Hidangan Sekarang
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((item) => {
              const isHidden = item.isActive === false;
              return (
                <div key={item.id} className={`bg-slate-900 border rounded-3xl overflow-hidden transition group ${isHidden ? "border-slate-800 opacity-60" : "border-slate-800 hover:border-slate-600"}`}>
                  <div className="relative h-36 bg-slate-800 overflow-hidden">
                    {item.image ? <img src={resolveImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} /> : <div className="w-full h-full flex items-center justify-center text-4xl text-slate-700">🍽️</div>}
                    {isHidden && <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center"><span className="px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold rounded-full flex items-center gap-1.5"><EyeOff className="w-3.5 h-3.5" /> Disembunyikan</span></div>}
                    <span className="absolute top-3 left-3 px-2.5 py-1 bg-slate-950/80 border border-slate-700 text-slate-300 text-[10px] font-bold rounded-full backdrop-blur-sm">{item.category}</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-sm text-white leading-tight truncate">{item.name}</h3>
                        <p className="text-slate-500 text-[11px] mt-1 line-clamp-2">{item.description || "(Tiada penerangan)"}</p>
                      </div>
                      <p className="font-mono font-black text-rose-400 text-sm shrink-0">RM {Number(item.price).toFixed(2)}</p>
                    </div>
                    {Array.isArray(item.optionGroups) && item.optionGroups.length > 0 && <div className="flex flex-wrap gap-1">{(item.optionGroups || []).map((g, i) => <span key={i} className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 text-[10px] rounded-full font-mono">{g?.name || "Pilihan"} ({(g?.options || []).length} pilihan)</span>)}</div>}
                    <div className="flex gap-2 pt-1">
                      <button 
                        onClick={() => {
                          if (!isSubscribed) {
                            setToast({ msg: "🔒 Mod Demo / Pelan Percuma: Sila Upgrade Langganan untuk mengedit hidangan ini!", type: "error" });
                            setIsSubModalOpen(true);
                            return;
                          }
                          setEditingItem(item);
                        }} 
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
                      >
                        {!isSubscribed ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Pencil className="w-3.5 h-3.5" />} Edit
                      </button>
                      <button 
                        onClick={() => {
                          if (!isSubscribed) {
                            setToast({ msg: "🔒 Mod Demo / Pelan Percuma: Sila Upgrade Langganan untuk menyembunyikan/mempamerkan hidangan!", type: "error" });
                            setIsSubModalOpen(true);
                            return;
                          }
                          handleToggleActive(item.id);
                        }} 
                        title={isHidden ? "Paparkan semula" : "Sembunyikan dari menu"} 
                        className={`px-3 py-2.5 border text-xs font-bold rounded-xl transition flex items-center justify-center cursor-pointer ${isHidden ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-500/40"}`}
                      >
                        {!isSubscribed ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button 
                        onClick={() => {
                          if (!isSubscribed) {
                            setToast({ msg: "🔒 Mod Demo / Pelan Percuma: Sila Upgrade Langganan untuk memadam hidangan!", type: "error" });
                            setIsSubModalOpen(true);
                            return;
                          }
                          setConfirmDelete(item.id);
                        }} 
                        title="Padam hidangan" 
                        className="px-3 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold rounded-xl transition flex items-center justify-center cursor-pointer"
                      >
                        {!isSubscribed ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-center py-4 border-t border-slate-900 text-xs text-slate-600 font-mono">
            {(localMenu || []).length} hidangan dalam menu • {activeCount} dipaparkan • {(localMenu || []).length - activeCount} disembunyikan
          </div>
        </div>
      )}
    </div>
  )}
</main>

      {(isAddingNew || editingItem) && (
        <ItemFormModal
          item={editingItem || { ...EMPTY_ITEM, category: filterCat !== "Semua" ? filterCat : "Nasi" }}
          isNew={isAddingNew}
          onSave={handleSaveItem}
          onClose={() => { setEditingItem(null); setIsAddingNew(false); }}
          allCategories={allCategories}
          onAddNewCategory={handleAddNewCategory}
        />
      )}

      {/* Add New Category Modal */}
      {isAddCatModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-400 font-extrabold text-sm">
                <FolderPlus className="w-5 h-5" />
                <span>Tambah Kategori Baharu</span>
              </div>
              <button onClick={() => setIsAddCatModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">Masukkan nama kategori hidangan baharu untuk disusun dalam menu restoran.</p>
            <input
              type="text"
              value={newCatModalInput || ""}
              onChange={(e) => setNewCatModalInput(e.target.value)}
              placeholder="Contoh: Burger & Sandwich / Tomyam"
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-rose-500 transition placeholder-slate-600"
              autoFocus
            />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setIsAddCatModalOpen(false)} className="flex-1 py-3 border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs transition">Batal</button>
              <button onClick={handleCreateCategoryFromModal} className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-lg transition">Tambah Kategori</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (() => {
        const item = (localMenu || []).find(i => i?.id === confirmDelete);
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-7 max-w-sm w-full text-center space-y-5 shadow-2xl">
              <div className="h-16 w-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-3xl">🗑️</div>
              <div>
                <h3 className="font-extrabold text-lg text-white">Padam Hidangan?</h3>
                <p className="text-slate-400 text-sm mt-2">Adakah anda pasti mahu memadam <strong className="text-white">"{item?.name}"</strong> dari senarai menu?</p>
                <p className="text-rose-400 text-xs mt-2 font-mono">Tindakan ini tidak boleh dibatalkan.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold rounded-2xl text-sm transition">Batal</button>
                <button onClick={handleDeleteConfirmed} className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-sm transition">Ya, Padam</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* CATEGORY DELETE CONFIRMATION & DATA SAFETY MODAL */}
      {catToDelete && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-rose-500/50 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 text-slate-100 font-sans">
            
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/20">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider block">PENGESAHAN PEMBATALAN</span>
                <h3 className="font-extrabold text-lg text-white">Padam Kategori "{catToDelete.name}"?</h3>
              </div>
            </div>

            {catToDelete.count > 0 ? (
              /* DATA SAFETY WARNING: Category has linked menu items! */
              <div className="space-y-3">
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2 text-xs text-amber-200">
                  <p className="font-extrabold flex items-center gap-1.5 text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>KAWALAN KESELAMATAN DATA AKTIF!</span>
                  </p>
                  <p className="leading-relaxed">
                    Kategori <strong>"{catToDelete.name}"</strong> mempunyai <strong className="text-white font-mono font-bold text-sm bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/40">{catToDelete.count} hidangan</strong> yang masih berangkai.
                  </p>
                  <p className="text-[11px] opacity-90 leading-relaxed">
                    Sistem tidak boleh memadam kategori yang mengandungi hidangan aktif secara melulu untuk mengelakkan kehilangan data menu.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      // Move items to 'Lain-lain' and delete category
                      const updatedMenu = (localMenu || []).map(item =>
                        item.category === catToDelete.name ? { ...item, category: "Lain-lain" } : item
                      );
                      const newRemoved = Array.from(new Set([...removedCategories, catToDelete.name]));
                      setRemovedCategories(newRemoved);
                      localStorage.setItem('fb_removed_categories', JSON.stringify(newRemoved));
                      setLocalMenu(updatedMenu);
                      setFilterCat("Semua");
                      const targetCatName = catToDelete.name;
                      const targetCount = catToDelete.count;
                      setCatToDelete(null);
                      setSaving(true);
                      const res = await updateMenuItems(updatedMenu);
                      setSaving(false);
                      if (res?.status === "OK") {
                        showToast(`📦 Kategori "${targetCatName}" dipadam & ${targetCount} hidangan dialihkan ke "Lain-lain"!`, "ok");
                      }
                    }}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer"
                  >
                    <span>📦 Alih {catToDelete.count} Hidangan ke "Lain-lain" & Padam</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCatToDelete(null)}
                    className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl text-xs transition cursor-pointer"
                  >
                    Batal (Alih Secara Manual Dulu)
                  </button>
                </div>
              </div>
            ) : (
              /* NO ITEMS IN CATEGORY: Safe to delete immediately */
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                  Adakah anda pasti mahu memadam kategori <strong className="text-white">"{catToDelete.name}"</strong>? Kategori ini tiada sebarang hidangan aktif.
                </p>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCatToDelete(null)}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl text-xs transition cursor-pointer"
                  >
                    Batal
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const targetCatName = catToDelete.name;
                      const newRemoved = Array.from(new Set([...removedCategories, targetCatName]));
                      setRemovedCategories(newRemoved);
                      localStorage.setItem('fb_removed_categories', JSON.stringify(newRemoved));
                      if (filterCat === targetCatName) setFilterCat("Semua");
                      setCatToDelete(null);
                      showToast(`🗑️ Kategori "${targetCatName}" berjaya dipadam!`, "ok");
                    }}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-2xl text-xs shadow-lg shadow-rose-600/30 transition active:scale-95 cursor-pointer"
                  >
                    🗑️ Ya, Padam Kategori
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Interactive Image Cropper Modal */}
      {isCropperOpen && rawBannerSrc && (
        <ImageCropperModal
          imageSrc={rawBannerSrc}
          onCropComplete={handleSaveCroppedBanner}
          onClose={() => { setIsCropperOpen(false); setRawBannerSrc(null); }}
          targetAspect={16 / 9}
        />
      )}

      {/* SaaS Subscription Modal for Upgrade Notice */}
      <SubscriptionModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        currentTenantId={tenant?.id || 'restoran-nasi-kandar-aman'}
        subscriptionStatus={tenant?.subscription_status || 'trialing'}
        planType={tenant?.plan_type || 'starter'}
      />

    </div>
  );
}
