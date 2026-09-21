import React, { useRef, useEffect, useState, useMemo } from "react";
import { X, Plus as PlusIcon } from "lucide-react";

/**
 * Per-variant image picker.
 *
 * Deliberately mirrors the parent item's own picker in ItemForm.jsx rather than introducing a
 * new upload mechanism: already-uploaded URLs live in `variant.images` (the "kept" set, posted
 * back so the backend knows which S3 objects survived), and freshly picked File objects live in
 * `variant._newImageFiles`. The underscore marks it as form-only state — handleSubmit strips it
 * out and appends the files under the multipart field `variantImages_<index>`, which
 * itemController partitions back onto this variant.
 *
 * A variant with no images of its own falls back to the parent item's images on the read side
 * (utils/variantResolve.js), so leaving this empty is a valid, non-destructive choice.
 */
const VariantImagePicker = ({ variant, onChange, max = 10 }) => {
  const inputRef = useRef(null);
  const existing = variant?.images || [];
  // Memoized on the stored reference, not re-created each render: `|| []` would hand useEffect
  // below a brand-new array every render, revoking and re-creating every object URL in a loop.
  const newFiles = useMemo(() => variant?._newImageFiles || [], [variant?._newImageFiles]);
  const [previews, setPreviews] = useState([]);

  // Object URLs must be revoked when the file list changes or the picker unmounts, or each
  // re-pick leaks a blob for the lifetime of the page.
  useEffect(() => {
    const urls = newFiles.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [newFiles]);

  const total = existing.length + newFiles.length;

  const handleSelect = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length) {
      onChange({ _newImageFiles: [...newFiles, ...picked].slice(0, max) });
    }
    e.target.value = "";
  };

  const removeExisting = (url) => {
    onChange({ images: existing.filter((u) => u !== url) });
  };

  const removeNew = (index) => {
    onChange({ _newImageFiles: newFiles.filter((_, i) => i !== index) });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {existing.map((url) => (
          <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeExisting(url)}
              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {previews.map((url, i) => (
          <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeNew(i)}
              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {total < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-16 h-16 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-100 hover:border-gray-300 transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5 mb-0.5" />
            <span className="text-[10px] font-medium">Upload</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleSelect}
          className="hidden"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400">
        {total > 0 ? `${total} of ${max}` : "Falls back to the item's images"}
      </p>
    </div>
  );
};

export default VariantImagePicker;
