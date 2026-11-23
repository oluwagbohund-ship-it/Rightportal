import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, Sparkles, Upload } from 'lucide-react';
import { Alert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';

interface QrScannerInputProps {
  onScan: (decodedValue: string) => Promise<void> | void;
  busy?: boolean;
  helperText?: string;
}

export function QrScannerInput({
  onScan,
  busy = false,
  helperText = 'Point your camera at the Student Digital ID QR code or upload the saved QR card image to scan automatically.',
}: QrScannerInputProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [decodingImage, setDecodingImage] = useState(false);
  const [lastScannedText, setLastScannedText] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDecodedRef = useRef<{ value: string; at: number } | null>(null);

  const stopCamera = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const triggerScan = async (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    setScannerError(null);
    setLastScannedText(trimmed);
    await onScan(trimmed);
  };

  const startCamera = async () => {
    setScannerError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setScannerError('Live camera scanning is not supported in this browser. Please upload the QR image file instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);

      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play().catch(() => {});

        const tick = () => {
          if (!streamRef.current || !videoRef.current) return;
          const v = videoRef.current;
          if (v.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && v.videoWidth > 0 && v.videoHeight > 0) {
            const canvas = canvasRef.current ?? document.createElement('canvas');
            canvasRef.current = canvas;
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (decoded?.data) {
                const now = Date.now();
                const prev = lastDecodedRef.current;
                if (!prev || prev.value !== decoded.data || now - prev.at > 2500) {
                  lastDecodedRef.current = { value: decoded.data, at: now };
                  stopCamera();
                  void triggerScan(decoded.data);
                  return;
                }
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      });
    } catch {
      stopCamera();
      setScannerError('Camera access was denied or unavailable. Please upload the Digital ID card QR image file.');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setScannerError(null);
    setDecodingImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Unable to read image file.'));
        reader.readAsDataURL(file);
      });

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Unsupported or unreadable image format.'));
        el.src = dataUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Unable to initialize QR image decoder.');

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (!decoded?.data) {
        setScannerError('No readable QR code was detected in that image. Please upload the crisp QR PNG from the Digital ID Card.');
        return;
      }

      await triggerScan(decoded.data);
    } catch (err) {
      setScannerError(err instanceof Error ? err.message : 'Unable to decode QR image.');
    } finally {
      setDecodingImage(false);
    }
  };

  return (
    <div className="space-y-4">
      {scannerError ? <Alert variant="error">{scannerError}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        {cameraActive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={stopCamera}
            disabled={busy}
            className="whitespace-nowrap shrink-0"
          >
            <CameraOff className="h-4 w-4" aria-hidden="true" />
            <span>Stop Camera</span>
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void startCamera()}
            disabled={busy || decodingImage}
            className="whitespace-nowrap shrink-0 bg-[#1E3A8A] text-white hover:bg-[#1E40AF]"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            <span>Start Camera Scan</span>
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || decodingImage}
          onClick={() => fileInputRef.current?.click()}
          className="whitespace-nowrap shrink-0"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          <span>{decodingImage ? 'Scanning QR Image...' : 'Upload QR Image'}</span>
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => void handleImageUpload(e)}
          className="sr-only"
          aria-label="Upload Digital ID QR code image"
        />
      </div>

      {cameraActive ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-2">
          <div className="relative mx-auto aspect-video max-w-md overflow-hidden rounded-lg bg-slate-900">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-48 w-48 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-500/10 shadow-sm animate-pulse" />
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-emerald-300 font-medium">
            Camera active — point lens at Student Digital ID QR code.
          </p>
        </div>
      ) : null}

      {lastScannedText ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span className="font-mono font-medium truncate">Scanned: {lastScannedText}</span>
        </div>
      ) : null}

      <p className="text-xs text-slate-500 leading-relaxed">{helperText}</p>
    </div>
  );
}
