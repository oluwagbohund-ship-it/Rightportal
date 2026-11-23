import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, Sparkles } from 'lucide-react';
import { Alert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';

interface QrCameraScannerProps {
  onScan: (decodedValue: string) => Promise<void> | void;
  busy?: boolean;
  helperText?: string;
  autoStart?: boolean;
}

export function QrCameraScanner({
  onScan,
  busy = false,
  helperText = 'Position the Student Digital ID QR code within the camera frame to log in automatically.',
  autoStart = true,
}: QrCameraScannerProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
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

  const startCamera = async () => {
    setScannerError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setScannerError('Live camera scanning is not supported in this browser environment.');
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
                  setLastScannedText(decoded.data);
                  stopCamera();
                  void onScan(decoded.data);
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
      setScannerError('Camera access was denied or unavailable. Please check camera permissions in your browser settings.');
    }
  };

  useEffect(() => {
    if (autoStart) {
      void startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [autoStart]);

  return (
    <div className="space-y-4">
      {scannerError ? <Alert variant="error">{scannerError}</Alert> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3 shadow-sm">
        <div className="relative mx-auto aspect-video max-w-lg overflow-hidden rounded-xl bg-slate-900">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-56 w-56 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-500/10 shadow-lg animate-pulse" />
          </div>
          {!cameraActive ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center">
              <Camera className="mb-3 h-10 w-10 text-slate-400 animate-bounce" aria-hidden="true" />
              <p className="text-sm font-semibold text-white">Camera Scanner Paused</p>
              <p className="mt-1 text-xs text-slate-400 max-w-xs">
                Click below to activate your camera and scan your Student Digital ID card.
              </p>
              <Button
                type="button"
                onClick={() => void startCamera()}
                disabled={busy}
                className="mt-4 bg-[#1E3A8A] text-white hover:bg-[#1E40AF]"
              >
                Start Camera Scan
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between px-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
            <span className={`h-2 w-2 rounded-full ${cameraActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-500'}`} />
            {cameraActive ? 'Live Camera Scanning Active' : 'Camera Ready'}
          </span>
          {cameraActive ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={stopCamera}
              disabled={busy}
              className="h-7 text-xs border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            >
              <CameraOff className="h-3 w-3 mr-1.5" aria-hidden="true" />
              <span>Pause Camera</span>
            </Button>
          ) : null}
        </div>
      </div>

      {lastScannedText ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span className="font-mono font-medium truncate">Scanned Token: {lastScannedText}</span>
        </div>
      ) : null}

      <p className="text-center text-xs text-slate-500 leading-relaxed">{helperText}</p>
    </div>
  );
}
