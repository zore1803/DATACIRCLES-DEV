import Checkbox from "../common/Checkbox";
import PlusIcon from "../common/PlusIcon";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import SignatureCanvas from "react-signature-canvas";
import { X, Type, Check, RefreshCw, Palette, Eraser, PenTool } from "lucide-react";
import toast from "react-hot-toast";
import UploadIcon from "../common/UploadIcon";
import EditIcon from "../common/EditIcon";

const FONT_FAMILIES = [
  { id: "dancing", name: "Dancing Script", fontName: "Dancing Script", className: "font-signature-dancing" },
  { id: "greatvibes", name: "Great Vibes", fontName: "Great Vibes", className: "font-signature-greatvibes" },
  { id: "pacifico", name: "Pacifico", fontName: "Pacifico", className: "font-signature-pacifico" },
  { id: "sacramento", name: "Sacramento", fontName: "Sacramento", className: "font-signature-sacramento" },
  { id: "satisfy", name: "Satisfy", fontName: "Satisfy", className: "font-signature-satisfy" },
  { id: "alex", name: "Alex Brush", fontName: "Alex Brush", className: "font-signature-alex" },
  { id: "caveat", name: "Caveat", fontName: "Caveat", className: "font-signature-caveat" },
  { id: "marck", name: "Marck Script", fontName: "Marck Script", className: "font-signature-marck" },
  { id: "meie", name: "Meie Script", fontName: "Meie Script", className: "font-signature-meie" },
];

const DEFAULT_SIGNATURE_COLORS = [
  { name: "Black", hex: "#0f172a" },
  { name: "Navy Blue", hex: "#1e3a8a" },
  { name: "Royal Blue", hex: "#2563eb" },
  { name: "Dark Red", hex: "#991b1b" },
  { name: "Forest Green", hex: "#166534" },
  { name: "Purple", hex: "#6b21a8" },
];

const DEFAULT_STROKE_WIDTH = 3;
const MIN_STROKE_WIDTH = 1;
const MAX_STROKE_WIDTH = 15;

const canvasHasContent = (canvas) => {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return imageData.data.some((_, i) => i % 4 === 3 && imageData.data[i] > 0);
};

export default function SignatureModal({ isOpen, onClose, onSave, initialData }) {
  const [activeTab, setActiveTab] = useState("upload"); // "upload" | "draw" | "type"
  const [sigName, setSigName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [penColor, setPenColor] = useState(DEFAULT_SIGNATURE_COLORS[0].hex);
  const [colorList, setColorList] = useState(DEFAULT_SIGNATURE_COLORS);

  // Custom color picker state
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customHexInput, setCustomHexInput] = useState("#2563eb");

  // Draw state
  const sigCanvasRef = useRef(null);
  const [isEraser, setIsEraser] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const previousColorRef = useRef(DEFAULT_SIGNATURE_COLORS[0].hex);
  const loadedInitialRef = useRef(false);
  const loadedFromBitmapRef = useRef(false);
  const strokeWidthRef = useRef(DEFAULT_STROKE_WIDTH);
  const isEraserRef = useRef(false);

  // Upload state
  const [uploadedImage, setUploadedImage] = useState(null);

  // Type state
  const [typedText, setTypedText] = useState("");
  const [selectedFont, setSelectedFont] = useState(FONT_FAMILIES[0]);

  // Reset form and initialize state on modal open
  useEffect(() => {
    if (isOpen) {
      loadedInitialRef.current = false;
      loadedFromBitmapRef.current = false;
      if (initialData) {
        setSigName(initialData.name || "");
        setActiveTab(initialData.type || "upload");
        setIsDefault(Boolean(initialData.isDefault));
        if (initialData.penColor) {
          setPenColor(initialData.penColor);
          previousColorRef.current = initialData.penColor;
        }
        if (initialData.type === "upload") {
          setUploadedImage(initialData.dataUrl || null);
        } else if (initialData.type === "type") {
          setTypedText(initialData.typedText || "");
          if (initialData.fontId) {
            const fontObj = FONT_FAMILIES.find((f) => f.id === initialData.fontId);
            if (fontObj) setSelectedFont(fontObj);
          }
        }
      } else {
        // Reset form for new signature
        setSigName("");
        setActiveTab("upload");
        setUploadedImage(null);
        setTypedText("");
        setIsDefault(false);
        setIsEraser(false);
        setPenColor(DEFAULT_SIGNATURE_COLORS[0].hex);
        previousColorRef.current = DEFAULT_SIGNATURE_COLORS[0].hex;
        setStrokeWidth(DEFAULT_STROKE_WIDTH);
      }
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);

  useEffect(() => {
    isEraserRef.current = isEraser;
  }, [isEraser]);

  const flattenCanvasState = useCallback(() => {
    try {
      const pad = sigCanvasRef.current?.getSignaturePad();
      const canvas = sigCanvasRef.current?.getCanvas();
      if (!pad || !canvas) return;

      pad._data = [];
      loadedFromBitmapRef.current = true;
      pad._isEmpty = !canvasHasContent(canvas);
    } catch (err) {
      console.error("Error flattening canvas state", err);
    }
  }, []);

  const applyStrokeWidth = useCallback((width) => {
    try {
      const pad = sigCanvasRef.current?.getSignaturePad();
      if (pad) {
        pad.minWidth = width;
        pad.maxWidth = width;
      }
    } catch (err) {
      console.error("Error applying stroke width", err);
    }
  }, []);

  const recolorExistingStrokes = useCallback((newHex) => {
    try {
      const pad = sigCanvasRef.current?.getSignaturePad();
      const canvas = sigCanvasRef.current?.getCanvas();
      if (!pad || !canvas || !canvasHasContent(canvas)) return;

      const ctx = pad._ctx || canvas.getContext("2d");
      if (!ctx) return;

      // Work in device-pixel space; the pad context is scaled by devicePixelRatio
      const offscreen = document.createElement("canvas");
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      const offCtx = offscreen.getContext("2d");
      offCtx.drawImage(canvas, 0, 0);
      offCtx.globalCompositeOperation = "source-in";
      offCtx.fillStyle = newHex;
      offCtx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0);
      ctx.restore();

      // signature_pad v2 stores per-point colors in nested arrays
      if (Array.isArray(pad._data) && pad._data.length > 0 && !loadedFromBitmapRef.current) {
        pad._data.forEach((pointGroup) => {
          if (Array.isArray(pointGroup)) {
            pointGroup.forEach((point) => {
              if (point && typeof point === "object") {
                point.color = newHex;
              }
            });
          }
        });
      }
    } catch (err) {
      console.error("Error recoloring signature", err);
    }
  }, []);

  // Resize canvas so internal resolution matches display size (prevents offset drawing)
  const resizeCanvas = useCallback(() => {
    if (!sigCanvasRef.current) return;
    try {
      const canvas = sigCanvasRef.current.getCanvas();
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const pad = sigCanvasRef.current.getSignaturePad();
      const hasContent = canvasHasContent(canvas) || (pad && !pad.isEmpty());
      const bitmapSnapshot = hasContent ? canvas.toDataURL("image/png") : null;

      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
      }

      if (pad) {
        pad.clear();
        if (bitmapSnapshot) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, rect.width, rect.height);
            pad._isEmpty = false;
            pad._data = [];
            loadedFromBitmapRef.current = true;
          };
          img.src = bitmapSnapshot;
        }
        pad.minWidth = strokeWidthRef.current;
        pad.maxWidth = strokeWidthRef.current;
      }
    } catch (err) {
      console.error("Canvas resize error:", err);
    }
  }, []);

  // Sync canvas size on mount or activeTab === "draw"
  useEffect(() => {
    if (isOpen && activeTab === "draw") {
      const timer = setTimeout(() => {
        resizeCanvas();
      }, 60);
      window.addEventListener("resize", resizeCanvas);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("resize", resizeCanvas);
      };
    }
  }, [isOpen, activeTab, resizeCanvas]);

  // Load saved draw signature onto canvas if editing
  useEffect(() => {
    if (isOpen && activeTab === "draw" && initialData?.type === "draw" && initialData?.dataUrl && !loadedInitialRef.current) {
      const timer = setTimeout(() => {
        if (sigCanvasRef.current) {
          try {
            sigCanvasRef.current.fromDataURL(initialData.dataUrl);
            loadedInitialRef.current = true;
            loadedFromBitmapRef.current = true;
          } catch (err) {
            console.error("Failed to load saved signature onto canvas", err);
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeTab, initialData]);

  useEffect(() => {
    if (isOpen && activeTab === "draw") {
      applyStrokeWidth(strokeWidth);
    }
  }, [isOpen, activeTab, strokeWidth, applyStrokeWidth]);

  const getCustomCursor = useCallback(() => {
    const diameter = Math.max(strokeWidth, 2);
    const padding = 2;
    const size = diameter + padding * 2;
    const center = size / 2;
    const radius = diameter / 2;
    const circleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="rgba(156,163,175,0.25)" stroke="#9ca3af" stroke-width="1"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(circleSvg)}") ${center} ${center}, crosshair`;
  }, [strokeWidth]);

  // Dynamically update canvas cursor on state changes
  useEffect(() => {
    if (activeTab === "draw" && sigCanvasRef.current) {
      try {
        const canvas = sigCanvasRef.current.getCanvas();
        if (canvas) {
          canvas.style.cursor = getCustomCursor();
        }
      } catch (err) {
        console.error("Failed to update canvas cursor", err);
      }
    }
  }, [activeTab, getCustomCursor]);

  // Handle stroke begin - configures destination-out for eraser or source-over for pen
  const handleBegin = () => {
    try {
      const pad = sigCanvasRef.current?.getSignaturePad();
      if (!pad) return;
      const ctx = pad._ctx || sigCanvasRef.current?.getCanvas()?.getContext("2d");
      if (!ctx) return;

      pad.minWidth = strokeWidthRef.current;
      pad.maxWidth = strokeWidthRef.current;

      if (isEraserRef.current) {
        ctx.globalCompositeOperation = "destination-out";
      } else {
        ctx.globalCompositeOperation = "source-over";
        pad.penColor = penColor;
      }
    } catch (err) {
      console.error("Error setting canvas mode on stroke begin", err);
    }
  };

  const handleEnd = () => {
    try {
      const pad = sigCanvasRef.current?.getSignaturePad();
      if (!pad) return;
      const ctx = pad._ctx || sigCanvasRef.current?.getCanvas()?.getContext("2d");
      if (ctx) ctx.globalCompositeOperation = "source-over";

      if (isEraserRef.current) {
        flattenCanvasState();
      }
    } catch (err) {
      console.error("Error resetting canvas mode on stroke end", err);
    }
  };

  // Update pen color on canvas directly without wiping canvas
  const handleColorChange = (hex) => {
    setIsEraser(false);
    setPenColor(hex);
    previousColorRef.current = hex;
    try {
      const pad = sigCanvasRef.current?.getSignaturePad();
      if (pad) {
        const ctx = pad._ctx || sigCanvasRef.current?.getCanvas()?.getContext("2d");
        if (ctx) ctx.globalCompositeOperation = "source-over";
        pad.penColor = hex;
      }
      if (activeTab === "draw") {
        recolorExistingStrokes(hex);
      }
    } catch (err) {
      console.error("Error updating pad color", err);
    }
  };

  const handleStrokeWidthChange = (width) => {
    setStrokeWidth(width);
    applyStrokeWidth(width);
  };

  // Toggle Eraser tool on drawing pad
  const toggleEraserMode = () => {
    try {
      const pad = sigCanvasRef.current?.getSignaturePad();
      if (!pad) return;
      const ctx = pad._ctx || sigCanvasRef.current?.getCanvas()?.getContext("2d");

      if (isEraser) {
        // Switch back to Pen mode
        setIsEraser(false);
        const restoreColor = previousColorRef.current || DEFAULT_SIGNATURE_COLORS[0].hex;
        if (ctx) ctx.globalCompositeOperation = "source-over";
        pad.penColor = restoreColor;
      } else {
        // Switch to Eraser mode
        setIsEraser(true);
        if (ctx) ctx.globalCompositeOperation = "destination-out";
      }
    } catch (err) {
      console.error("Error toggling eraser mode", err);
    }
  };

  // Add custom color from board / hex input
  const handleAddCustomColor = (hex) => {
    let formattedHex = hex.trim();
    if (!formattedHex.startsWith("#")) {
      formattedHex = `#${formattedHex}`;
    }
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexRegex.test(formattedHex)) {
      toast.error("Please enter a valid hex color code (e.g. #2563EB)");
      return;
    }

    if (!colorList.some((c) => c.hex.toLowerCase() === formattedHex.toLowerCase())) {
      setColorList((prev) => [...prev, { name: formattedHex, hex: formattedHex }]);
    }
    handleColorChange(formattedHex);
    setShowColorPicker(false);
  };

  if (!isOpen) return null;

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (PNG, JPG, SVG)");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("File size should be less than 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleClearDraw = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
      loadedFromBitmapRef.current = false;
    }
  };

  // Convert typed text + chosen font to a Base64 PNG dataUrl via canvas
  const generateTypedDataUrl = () => {
    if (!typedText.trim()) return null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Temporarily set font to measure text width
    ctx.font = `60px "${selectedFont.fontName}", cursive, sans-serif`;
    const textWidth = ctx.measureText(typedText).width;

    // Set tight dimensions with minimal padding
    canvas.width = textWidth + 40;
    canvas.height = 90;

    // Re-apply context styles after resizing canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `60px "${selectedFont.fontName}", cursive, sans-serif`;
    ctx.fillStyle = penColor || "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Draw text perfectly centered in the new tight canvas
    ctx.fillText(typedText, canvas.width / 2, canvas.height / 2);

    return canvas.toDataURL("image/png");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sigName.trim()) {
      toast.error("Please enter a label / owner name for this signature");
      return;
    }

    let dataUrl = null;
    if (activeTab === "upload") {
      if (!uploadedImage) {
        toast.error("Please upload a signature image");
        return;
      }
      dataUrl = uploadedImage;
    } else if (activeTab === "draw") {
      if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
        toast.error("Please draw a signature first on the pad");
        return;
      }
      try {
        const canvasObj = sigCanvasRef.current;
        if (typeof canvasObj.getTrimmedCanvas === "function") {
          const trimmed = canvasObj.getTrimmedCanvas();
          dataUrl = trimmed.toDataURL("image/png");
        } else if (typeof canvasObj.getCanvas === "function") {
          dataUrl = canvasObj.getCanvas().toDataURL("image/png");
        } else {
          dataUrl = canvasObj.toDataURL("image/png");
        }
      } catch (err) {
        console.warn("Trimmed canvas export failed, using standard canvas export:", err);
        try {
          dataUrl = sigCanvasRef.current.getCanvas().toDataURL("image/png");
        } catch (err2) {
          dataUrl = sigCanvasRef.current.toDataURL("image/png");
        }
      }
    } else if (activeTab === "type") {
      if (!typedText.trim()) {
        toast.error("Please enter text to generate signature");
        return;
      }
      dataUrl = generateTypedDataUrl();
    }

    if (!dataUrl) {
      toast.error("Failed to process signature image. Please try again.");
      return;
    }

    try {
      setLoading(true);
      await onSave({
        id: initialData?.id,
        name: sigName.trim(),
        type: activeTab,
        dataUrl,
        typedText: activeTab === "type" ? typedText.trim() : "",
        fontId: activeTab === "type" ? selectedFont.id : "",
        penColor,
        isDefault,
      });
      onClose();
    } catch (err) {
      console.error("Save signature error:", err);
      toast.error(err.response?.data?.error || err.message || "Failed to save signature");
    } finally {
      setLoading(false);
    }
  };

  // Close modal when clicking backdrop
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm animate-fadeIn font-inter"
      onClick={handleBackdropClick}
    >
      <div 
        className="w-full max-w-2xl bg-white shadow-2xl transition-all max-h-[92vh] flex flex-col overflow-hidden rounded-2xl animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D9D9D9] flex-shrink-0 bg-white">
          <h2 className="text-[15px] font-normal leading-6 text-[#78788D] uppercase tracking-wide">
            {initialData ? "Edit Digital Signature" : "Add Digital Signature"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="w-5 h-5 flex items-center justify-center text-[#1C1B1F] hover:opacity-70 transition-opacity"
            aria-label="Close"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Tab Selection */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-medium transition border-b-2 -mb-px ${
                activeTab === "upload" ? "border-[#158FFF] text-[#158FFF]" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <UploadIcon className="h-4 w-4" />
              Upload Image
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("draw")}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-medium transition border-b-2 -mb-px ${
                activeTab === "draw" ? "border-[#158FFF] text-[#158FFF]" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <EditIcon className="h-4 w-4" />
              Draw Signature
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("type")}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-medium transition border-b-2 -mb-px ${
                activeTab === "type" ? "border-[#158FFF] text-[#158FFF]" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Type className="h-4 w-4" />
              Type Text
            </button>
          </div>

        {/* Color Palette (for Draw and Type tabs) */}
        {(activeTab === "draw" || activeTab === "type") && (
          <div className="relative mt-4 flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Palette className="h-4 w-4 text-slate-500" />
              <span>Ink Color:</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {colorList.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  title={color.name}
                  onClick={() => handleColorChange(color.hex)}
                  className={`h-7 w-7 rounded-full transition-transform border border-black/10 flex items-center justify-center ${
                    !isEraser && penColor === color.hex ? "ring-2 ring-sky-500 ring-offset-2 scale-110 shadow-sm" : "hover:scale-105 opacity-90 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: color.hex }}
                >
                  {!isEraser && penColor === color.hex && <Check className="h-3.5 w-3.5 text-white drop-shadow-sm" />}
                </button>
              ))}

              {/* Add Custom Color Button */}
              <button
                type="button"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="h-7 w-7 rounded-full border border-dashed border-gray-400 bg-white flex items-center justify-center text-gray-600 hover:border-sky-500 hover:text-sky-600 transition"
                title="Add Custom Color"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Custom Color Picker Popover Board */}
            {showColorPicker && (
              <div className="absolute right-4 top-12 z-20 w-64 rounded-2xl bg-white p-4 shadow-xl border border-gray-200 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
                  <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5 text-sky-600" /> Choose Custom Color
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowColorPicker(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Color Palette Board</label>
                    <input
                      type="color"
                      value={customHexInput.startsWith("#") ? customHexInput : `#${customHexInput}`}
                      onChange={(e) => setCustomHexInput(e.target.value)}
                      className="h-10 w-full cursor-pointer rounded-xl border border-gray-200 bg-transparent p-1 shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Hex Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customHexInput}
                        onChange={(e) => setCustomHexInput(e.target.value)}
                        placeholder="#2563EB"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-mono outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddCustomColor(customHexInput)}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 shadow-sm"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form Wrap around entire tab body and action buttons */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="min-h-[260px]">
            {/* TAB 1: UPLOAD */}
            {activeTab === "upload" && (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 p-8 transition hover:border-sky-400 bg-slate-50/50">
                {uploadedImage ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="max-h-36 max-w-full overflow-hidden rounded-lg bg-white p-3 shadow-inner border border-gray-200">
                      <img src={uploadedImage} alt="Uploaded signature" className="h-28 object-contain" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setUploadedImage(null)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:underline"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Change Image
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center text-center">
                    <div className="rounded-full bg-sky-50 p-3 text-sky-600 shadow-sm">
                      <UploadIcon className="h-6 w-6" />
                    </div>
                    <span className="mt-2 text-sm font-semibold text-gray-700">Click to upload signature</span>
                    <span className="mt-1 text-xs text-gray-400">PNG, JPG, or SVG (Max 2MB)</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                )}
              </div>
            )}

            {/* TAB 2: DRAW */}
            {activeTab === "draw" && (
              <div className="relative rounded-xl border border-gray-300 bg-slate-50 p-2 shadow-inner">
                <div className="mb-2 flex items-center gap-3 rounded-lg bg-white/80 border border-slate-200 px-3 py-2">
                  <span className="shrink-0 text-xs font-semibold text-slate-700">Width:</span>
                  <input
                    type="range"
                    min={MIN_STROKE_WIDTH}
                    max={MAX_STROKE_WIDTH}
                    step={0.5}
                    value={strokeWidth}
                    onChange={(e) => handleStrokeWidthChange(Number(e.target.value))}
                    className="h-1.5 flex-1 cursor-pointer accent-sky-600"
                  />
                  <span className="shrink-0 w-10 text-right text-xs font-medium text-slate-500">{strokeWidth}px</span>
                  <div
                    className="shrink-0 rounded-full border border-gray-400 bg-gray-300/30"
                    style={{ width: strokeWidth, height: strokeWidth }}
                    aria-hidden="true"
                  />
                </div>

                {/* Drawing Controls Bar (Pen, Eraser, Clear Pad) */}
                <div className="absolute right-4 top-14 flex items-center gap-2 z-10">
                  <button
                    type="button"
                    onClick={toggleEraserMode}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-sm transition border ${
                      isEraser
                        ? "bg-amber-500 text-white border-amber-600 ring-2 ring-amber-300"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {isEraser ? <Eraser className="h-3.5 w-3.5" /> : <PenTool className="h-3.5 w-3.5" />}
                    {isEraser ? "Draw" : "Eraser"}
                  </button>

                  <button
                    type="button"
                    onClick={handleClearDraw}
                    className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow hover:bg-gray-100 border border-gray-200 transition"
                  >
                    Clear Pad
                  </button>
                </div>

                <SignatureCanvas
                  ref={sigCanvasRef}
                  penColor={penColor}
                  minWidth={strokeWidth}
                  maxWidth={strokeWidth}
                  onBegin={handleBegin}
                  onEnd={handleEnd}
                  canvasProps={{
                    className: "w-full max-w-[400px] mx-auto block h-48 rounded-lg bg-white border border-slate-200 touch-none",
                    style: { cursor: getCustomCursor() },
                  }}
                />
                <p className="mt-2 text-center text-xs text-gray-500 font-medium">
                  {isEraser ? "Eraser tool selected — drag over lines to erase" : "Draw your signature using mouse or touch"}
                </p>
              </div>
            )}

            {/* TAB 3: TYPE */}
            {activeTab === "type" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Enter Your Name or Initials</label>
                  <input
                    type="text"
                    value={typedText}
                    onChange={(e) => setTypedText(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 shadow-sm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-700">Select Signature Style Card</label>
                    <span className="text-[11px] text-gray-400">Scroll to view all 9 cursive styles</span>
                  </div>

                  <div className="bg-slate-100/70 border border-slate-200 rounded-xl p-2.5 max-h-64 overflow-y-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {FONT_FAMILIES.map((font) => (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => setSelectedFont(font)}
                          className={`group relative flex flex-col justify-between rounded-xl border-2 p-3.5 text-left transition-all bg-white min-h-[90px] shadow-sm ${
                            selectedFont.id === font.id
                              ? "border-sky-500 ring-2 ring-sky-500/20 bg-sky-50/30"
                              : "border-gray-200 hover:border-sky-300 hover:shadow"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full border-b border-gray-100 pb-1.5 mb-1.5">
                            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                              {font.name}
                            </span>
                            {selectedFont.id === font.id && (
                              <span className="rounded-full bg-sky-600 p-0.5 text-white">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-center py-1 overflow-hidden min-h-[44px]">
                            <span
                              className={`${font.className} text-2xl sm:text-3xl text-center truncate max-w-full`}
                              style={{ color: penColor }}
                            >
                              {typedText || font.name}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Common Form Fields */}
          <div className="border-t border-gray-100 mt-6 pt-5 space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="flex items-center gap-0.5 text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2">Signature Label / Owner Name <span className="text-[#FF4935]">*</span></label>
                <input
                  type="text"
                  value={sigName}
                  onChange={(e) => setSigName(e.target.value)}
                  placeholder="e.g. Authorized Signatory / CEO"
                  className="w-full border border-[#1F2937]/10 rounded-full px-4 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter"
                  required
                />
              </div>

              <div className="flex items-end pb-2">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#161618] tracking-[-0.05em]">
                  <Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                  Set as Default
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-white border border-[#1F2937]/10 px-4 py-2 rounded-lg text-sm font-medium text-[#1F2937] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-[#158FFF] text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {loading ? (initialData ? "Updating..." : "Saving...") : (initialData ? "Update Signature" : "Save Signature")}
              </button>
            </div>
          </div>
        </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
