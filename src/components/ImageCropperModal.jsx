import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Check, Move } from 'lucide-react';

export default function ImageCropperModal({ imageSrc, onCropComplete, onClose, targetAspect = 16 / 9 }) {
  const canvasRef = useRef(null);
  const [imgObj, setImgObj] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Load image object on mount
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgObj(img);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Draw crop preview on canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgObj) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Calculate crop window size based on aspect ratio
    let cropWidth = width * 0.85;
    let cropHeight = cropWidth / targetAspect;

    if (cropHeight > height * 0.75) {
      cropHeight = height * 0.75;
      cropWidth = cropHeight * targetAspect;
    }

    const cropX = (width - cropWidth) / 2;
    const cropY = (height - cropHeight) / 2;

    // Draw background grid pattern
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Calculate scaled image dimensions
    const baseScale = Math.max(cropWidth / imgObj.width, cropHeight / imgObj.height);
    const finalScale = baseScale * zoom;

    const drawW = imgObj.width * finalScale;
    const drawH = imgObj.height * finalScale;

    // Center image + pan offset
    const drawX = cropX + (cropWidth - drawW) / 2 + pan.x;
    const drawY = cropY + (cropHeight - drawH) / 2 + pan.y;

    // Draw full image
    ctx.drawImage(imgObj, drawX, drawY, drawW, drawH);

    // Draw dark overlay outside crop box
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    // Top
    ctx.fillRect(0, 0, width, cropY);
    // Bottom
    ctx.fillRect(0, cropY + cropHeight, width, height - (cropY + cropHeight));
    // Left
    ctx.fillRect(0, cropY, cropX, cropHeight);
    // Right
    ctx.fillRect(cropX + cropWidth, cropY, width - (cropX + cropWidth), cropHeight);

    // Draw crop box border + grid lines
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cropX, cropY, cropWidth, cropHeight);

    // Rule of thirds grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    // Vertical lines
    ctx.moveTo(cropX + cropWidth / 3, cropY);
    ctx.lineTo(cropX + cropWidth / 3, cropY + cropHeight);
    ctx.moveTo(cropX + (cropWidth * 2) / 3, cropY);
    ctx.lineTo(cropX + (cropWidth * 2) / 3, cropY + cropHeight);

    // Horizontal lines
    ctx.moveTo(cropX, cropY + cropHeight / 3);
    ctx.lineTo(cropX + cropWidth, cropY + cropHeight / 3);
    ctx.moveTo(cropX, cropY + (cropHeight * 2) / 3);
    ctx.lineTo(cropX + cropWidth, cropY + (cropHeight * 2) / 3);
    ctx.stroke();

    // Draw Corner Handles
    const handleSize = 12;
    ctx.fillStyle = '#f43f5e';
    // TL
    ctx.fillRect(cropX - 2, cropY - 2, handleSize, 3);
    ctx.fillRect(cropX - 2, cropY - 2, 3, handleSize);
    // TR
    ctx.fillRect(cropX + cropWidth - handleSize + 2, cropY - 2, handleSize, 3);
    ctx.fillRect(cropX + cropWidth - 1, cropY - 2, 3, handleSize);
    // BL
    ctx.fillRect(cropX - 2, cropY + cropHeight - 1, handleSize, 3);
    ctx.fillRect(cropX - 2, cropY + cropHeight - handleSize + 2, 3, handleSize);
    // BR
    ctx.fillRect(cropX + cropWidth - handleSize + 2, cropY + cropHeight - 1, handleSize, 3);
    ctx.fillRect(cropX + cropWidth - 1, cropY + cropHeight - handleSize + 2, 3, handleSize);

  }, [imgObj, zoom, pan, targetAspect]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Mouse & Touch Drag Handlers
  const handleMouseDown = (e) => {
    setIsDragging(true);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - pan.x, y: clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setPan({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Perform Final Crop Output
  const handleSaveCrop = () => {
    if (!imgObj) return;

    const outCanvas = document.createElement('canvas');
    const outW = 800;
    const outH = Math.round(800 / targetAspect);
    outCanvas.width = outW;
    outCanvas.height = outH;

    const ctx = outCanvas.getContext('2d');

    // Get display bounds
    const displayCanvas = canvasRef.current;
    const width = displayCanvas.width;
    const height = displayCanvas.height;

    let cropWidth = width * 0.85;
    let cropHeight = cropWidth / targetAspect;

    if (cropHeight > height * 0.75) {
      cropHeight = height * 0.75;
      cropWidth = cropHeight * targetAspect;
    }

    const cropX = (width - cropWidth) / 2;
    const cropY = (height - cropHeight) / 2;

    const baseScale = Math.max(cropWidth / imgObj.width, cropHeight / imgObj.height);
    const finalScale = baseScale * zoom;

    const drawW = imgObj.width * finalScale;
    const drawH = imgObj.height * finalScale;

    const drawX = cropX + (cropWidth - drawW) / 2 + pan.x;
    const drawY = cropY + (cropHeight - drawH) / 2 + pan.y;

    // Calculate source rect in original image coordinates
    const sx = Math.max(0, (cropX - drawX) / finalScale);
    const sy = Math.max(0, (cropY - drawY) / finalScale);
    const sWidth = Math.min(imgObj.width - sx, cropWidth / finalScale);
    const sHeight = Math.min(imgObj.height - sy, cropHeight / finalScale);

    ctx.drawImage(imgObj, sx, sy, sWidth, sHeight, 0, 0, outW, outH);

    const croppedDataUrl = outCanvas.toDataURL('image/jpeg', 0.88);
    onCropComplete(croppedDataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Move className="w-4 h-4 text-rose-500" />
            <h3 className="font-extrabold text-sm text-white">Potong Banner Selamat Datang</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas Area */}
        <div className="relative bg-slate-950 flex items-center justify-center overflow-hidden cursor-move touch-none">
          <canvas
            ref={canvasRef}
            width={520}
            height={340}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
            className="w-full max-h-[380px] object-contain"
          />
          
          <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md border border-slate-700 px-2.5 py-1 rounded-full text-[10px] font-mono text-slate-300 pointer-events-none flex items-center gap-1.5">
            <Move className="w-3 h-3 text-rose-400" />
            <span>Tarik gambar untuk melaras kedudukan</span>
          </div>
        </div>

        {/* Zoom & Control Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-slate-400" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-rose-500 cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-slate-400" />
            <span className="font-mono text-xs text-rose-400 font-bold w-10 text-right">
              {zoom.toFixed(1)}x
            </span>

            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 transition"
              title="Reset Crop"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
            >
              Batal
            </button>
            <button
              onClick={handleSaveCrop}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-rose-600/20 flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Potong & Simpan Banner</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
