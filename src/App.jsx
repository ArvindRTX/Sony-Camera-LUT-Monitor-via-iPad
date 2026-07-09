import React, { useState, useEffect, useRef } from "react";
import MonitorUI from "./components/MonitorUI";
import Histogram from "./components/Histogram";
import { useWebGLRenderer } from "./hooks/useWebGLRenderer";
import { generateDefaultLUT, parseCubeFile } from "./utils/lutParser";

export default function App() {
  // Input configuration states
  const [sourceType, setSourceType] = useState("uvc"); // 'uvc' or 'network'
  const [streamUrl, setStreamUrl] = useState("");
  const [activeStreamUrl, setActiveStreamUrl] = useState("");
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  
  // App UI/LUT states
  const [lutList, setLutList] = useState([]);
  const [selectedLutId, setSelectedLutId] = useState("default");
  const [lutEnabled, setLutEnabled] = useState(true);
  const [resolution, setResolution] = useState("0x0");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState(null);
  const [directWiFiMode, setDirectWiFiMode] = useState(false);
  const [directBlobUrl, setDirectBlobUrl] = useState(null);

  // Advanced Overlay & Format Toggles
  const [showHistogram, setShowHistogram] = useState(true);
  const [uvcResolution, setUvcResolution] = useState(1080); // 1080, 720, 480
  const [uvcFrameRate, setUvcFrameRate] = useState(60);     // 60, 30
  const [sonyLiveviewSize, setSonyLiveviewSize] = useState("L"); // L, M, S
  const [cameraStatus, setCameraStatus] = useState(null); // { iso, shutter, aperture, battery }

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const readerRef = useRef(null);

  // Initialize the default mathematically computed S-Log3 to Rec.709 LUT
  useEffect(() => {
    const defaultLUT = generateDefaultLUT();
    const defaultItem = { id: "default", name: "S-Log3 to Rec.709 (Default)", data: defaultLUT };
    setLutList([defaultItem]);
    setSelectedLutId("default");
  }, []);

  // Helper to show auto-expiring toast messages
  const showToast = (message, type = "error") => {
    setToast({ message, type });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Get CORS-bypassed proxy URL for local WiFi streams
  const getProxiedUrl = (url) => {
    if (!url) return null;
    // If it's already a relative path or proxied URL, return it
    if (url.startsWith("/") || url.startsWith("blob:")) return url;
    
    // Route Sony WiFi direct streams to our specialized parser with dynamic size parameters
    if (url.startsWith("sony://")) {
      const ip = url.replace("sony://", "") || "192.168.122.1";
      return `/api/sony-liveview?ip=${ip}&size=${sonyLiveviewSize}`;
    }

    // Encode the target URL and wrap it in our server proxy endpoint
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  };

  // Determine active source element based on selected input mode
  const activeSourceRef = sourceType === "uvc" ? videoRef : imageRef;

  // Derive current active LUT data
  const activeLUTItem = lutList.find(item => item.id === selectedLutId);
  const activeLUT = activeLUTItem ? activeLUTItem.data : null;

  // Bind WebGL Rendering Engine to our canvas & active input source with bypass uniform support
  const { error: webGLError, fps } = useWebGLRenderer(canvasRef, activeSourceRef, sourceType, activeLUT, lutEnabled);

  // Monitor WebGL errors and report via toast
  useEffect(() => {
    if (webGLError) {
      showToast(webGLError, "error");
    }
  }, [webGLError]);

  // Request camera permissions on load and list available capture devices
  useEffect(() => {
    async function initCameraPermissions() {
      if (!navigator.mediaDevices) {
        showToast("Note: UVC camera input requires a Secure Context (HTTPS/localhost). Switch to WiFi Stream mode to monitor feeds over raw HTTP network IPs.", "warning");
        return;
      }
      try {
        // Request temporary stream to trigger browser webcam prompt.
        const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        // Release initial stream tracks immediately
        initialStream.getTracks().forEach(track => track.stop());

        // Enumerate input devices
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(device => device.kind === "videoinput");
        setDevices(videoDevices);

        if (videoDevices.length > 0) {
          // Select the first device by default (or attempt to find standard capture cards)
          const captureCard = videoDevices.find(d => 
            d.label.toLowerCase().includes("capture") || 
            d.label.toLowerCase().includes("hdmi") ||
            d.label.toLowerCase().includes("uvc")
          );
          const defaultDevice = captureCard ? captureCard.deviceId : videoDevices[0].deviceId;
          setSelectedDeviceId(defaultDevice);
        }
      } catch (err) {
        showToast("Webcam permissions were denied. USB Capture mode is disabled. Connect via WiFi stream instead.", "warning");
      }
    }

    initCameraPermissions();

    // Listen for device changes (plugs/unplugs of UVC capture cards)
    const handleDeviceChange = async () => {
      if (!navigator.mediaDevices) return;
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(device => device.kind === "videoinput");
        setDevices(videoDevices);
      } catch (err) {
        console.error("Error enumerating devices on change:", err);
      }
    };

    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    }
    return () => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      }
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Listen for fullscreen change events triggered by browser controls / gestures
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange); // Support Safari legacy

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Stop UVC streams when switching to Network/WiFi mode to release camera hardware
  useEffect(() => {
    setActiveStreamUrl("");
    if (sourceType !== "uvc" && streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setResolution("0x0");
    }
  }, [sourceType]);

  // Manage UVC capture stream based on selected device ID, active source type, resolution, and frame rate
  useEffect(() => {
    if (sourceType !== "uvc" || !selectedDeviceId || !navigator.mediaDevices) return;

    async function startStreaming() {
      // Release active camera hardware lock
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const targetWidth = uvcResolution === 1080 ? 1920 : uvcResolution === 720 ? 1280 : 640;

      const constraints = {
        video: {
          deviceId: { exact: selectedDeviceId },
          width: { ideal: targetWidth },
          height: { ideal: uvcResolution },
          frameRate: { ideal: uvcFrameRate }
        },
        audio: false
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        showToast(`Failed to open camera stream: ${err.message}`, "error");
      }
    }

    startStreaming();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedDeviceId, sourceType, uvcResolution, uvcFrameRate]);

  // Polling loop for active Sony camera status settings
  useEffect(() => {
    if (sourceType !== "network" || !activeStreamUrl) {
      setCameraStatus(null);
      return;
    }

    const ip = activeStreamUrl.replace("sony://", "").replace("sony-direct://", "") || "192.168.122.1";
    let active = true;
    let timer = null;

    async function fetchStatus() {
      try {
        const res = await fetch(`/api/sony-status?ip=${ip}`);
        if (!res.ok) throw new Error("HTTP error");
        const data = await res.json();
        if (active) {
          setCameraStatus(data);
        }
      } catch (err) {
        // Silently catch polling issues if camera goes offline temporarily
      }
    }

    fetchStatus();
    timer = setInterval(fetchStatus, 2000);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [activeStreamUrl, sourceType]);

  // Force reconnect on Sony liveview size change
  useEffect(() => {
    if (sourceType === "network" && activeStreamUrl) {
      const current = activeStreamUrl;
      setActiveStreamUrl("");
      setTimeout(() => {
        setActiveStreamUrl(current);
      }, 150);
    }
  }, [sonyLiveviewSize]);

  // Manage Direct Client-Side WiFi stream parsing (No PC Proxy)
  useEffect(() => {
    // Only run if we are in network mode, have a streamUrl, and direct mode is enabled
    if (sourceType !== "network" || !streamUrl || !directWiFiMode) {
      if (readerRef.current) {
        readerRef.current.cancel();
        readerRef.current = null;
      }
      setDirectBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    let active = true;

    async function startDirectStream() {
      const ip = activeStreamUrl.replace("sony://", "").replace("sony-direct://", "") || "192.168.122.1";
      
      // 1. Send startRecMode
      try {
        await fetch(`http://${ip}:10000/sony/camera`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "startRecMode",
            params: [],
            id: 1,
            version: "1.0"
          })
        });
      } catch (e) {
        console.log("Direct startRecMode failed/blocked (CORS likely).");
      }

      // 2. Send startLiveviewWithSize
      try {
        await fetch(`http://${ip}:10000/sony/camera`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "startLiveviewWithSize",
            params: [sonyLiveviewSize],
            id: 1,
            version: "1.0"
          })
        });
      } catch (e) {
        console.log("Direct startLiveviewWithSize failed/blocked (CORS likely).");
      }

      const streamAddr = `http://${ip}:60152/liveviewstream`;

      try {
        const response = await fetch(streamAddr);
        if (!response.body) {
          throw new Error("This browser does not support stream body reading.");
        }

        const reader = response.body.getReader();
        readerRef.current = reader;

        let buffer = new Uint8Array(0);
        let state = 'common_header';
        let jpegSize = 0;
        let paddingSize = 0;

        while (active) {
          const { value, done } = await reader.read();
          if (done) break;

          // Append chunk to buffer
          const newBuf = new Uint8Array(buffer.length + value.length);
          newBuf.set(buffer);
          newBuf.set(value, buffer.length);
          buffer = newBuf;

          let processing = true;
          while (processing && active) {
            if (state === 'common_header') {
              if (buffer.length >= 8) {
                buffer = buffer.subarray(8);
                state = 'payload_header';
              } else {
                processing = false;
              }
            } else if (state === 'payload_header') {
              if (buffer.length >= 128) {
                // Verify payload start code: 0x24, 0x35, 0x68, 0x79
                const startCode = (buffer[0] << 24) | (buffer[1] << 16) | (buffer[2] << 8) | buffer[3];
                if (startCode !== 0x24356879) {
                  // Out of sync! Search for the next start code to realign
                  let found = -1;
                  for (let i = 0; i < buffer.length - 3; i++) {
                    if (buffer[i] === 0x24 && buffer[i+1] === 0x35 && buffer[i+2] === 0x68 && buffer[i+3] === 0x79) {
                      found = i;
                      break;
                    }
                  }
                  if (found !== -1) {
                    buffer = buffer.subarray(found);
                    continue; // Loop again
                  } else {
                    buffer = buffer.subarray(Math.max(0, buffer.length - 3));
                    processing = false;
                    break;
                  }
                }

                // Read big-endian 24-bit JPEG length
                jpegSize = (buffer[4] << 16) | (buffer[5] << 8) | buffer[6];
                paddingSize = buffer[7];

                buffer = buffer.subarray(128);
                state = 'jpeg_data';
              } else {
                processing = false;
              }
            } else if (state === 'jpeg_data') {
              if (buffer.length >= jpegSize) {
                const jpegData = buffer.subarray(0, jpegSize);
                buffer = buffer.subarray(jpegSize);

                // Create Object URL from JPEG blob
                const blob = new Blob([jpegData], { type: "image/jpeg" });
                const blobUrl = URL.createObjectURL(blob);
                
                if (active) {
                  setDirectBlobUrl(prev => {
                    if (prev) URL.revokeObjectURL(prev); // Revoke old to prevent memory leaks
                    return blobUrl;
                  });
                } else {
                  URL.revokeObjectURL(blobUrl);
                }

                state = 'padding';
              } else {
                processing = false;
              }
            } else if (state === 'padding') {
              if (buffer.length >= paddingSize) {
                buffer = buffer.subarray(paddingSize);
                state = 'common_header';
              } else {
                processing = false;
              }
            }
          }
        }
      } catch (err) {
        if (active) {
          showToast(`Direct WiFi connection blocked. Verify you are using a CORS-disabled browser.`, "error");
        }
      }
    }

    startDirectStream();

    return () => {
      active = false;
      if (readerRef.current) {
        readerRef.current.cancel();
        readerRef.current = null;
      }
      setDirectBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [activeStreamUrl, sourceType, directWiFiMode, sonyLiveviewSize]);

  // Handle custom .cube LUT uploads
  const handleUploadLUT = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = parseCubeFile(text, file.name);
        const newItem = { id: file.name + Date.now(), name: parsed.title || file.name, data: parsed };
        setLutList(prev => [...prev, newItem]);
        setSelectedLutId(newItem.id);
        showToast(`LUT "${parsed.title || file.name}" loaded successfully.`, "success");
      } catch (err) {
        showToast(`Failed to parse LUT file: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
  };

  // Reset LUT selection
  const handleResetLUT = () => {
    setSelectedLutId("default");
    showToast("Reset to default mathematical S-Log3 to Rec.709 conversion.", "success");
  };

  // Toggle fullscreen using browser Fullscreen API
  const handleToggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen(); // Safari support
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen(); // Safari support
      }
    }
  };

  const handleConnectStream = () => {
    if (!streamUrl) {
      showToast("Please enter a valid Stream URL first.", "error");
      return;
    }
    showToast("Connecting to camera stream...", "success");
    setActiveStreamUrl(streamUrl);
  };

  const handleLoadedMetadata = () => {
    if (sourceType === "uvc" && videoRef.current) {
      setResolution(`${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);
      showToast("USB Camera connected successfully!", "success");
    } else if (sourceType === "network" && imageRef.current) {
      setResolution(`${imageRef.current.naturalWidth}x${imageRef.current.naturalHeight}`);
      showToast("WiFi Camera stream connected successfully!", "success");
    }
  };

  return (
    <div className="monitor-container" ref={containerRef}>
      {/* Real-time Hardware Accelerated WebGL Canvas */}
      <canvas ref={canvasRef} className="video-canvas" />

      {/* Hidden Video Feed Pipe (for local USB Capture / UVC) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden-video"
        onLoadedMetadata={handleLoadedMetadata}
      />

      {/* Hidden Image Feed Pipe (for WiFi MJPEG network streams) */}
      <img
        ref={imageRef}
        className="hidden-video"
        crossOrigin="anonymous" // required to bypass WebGL security restrictions on external feeds
        src={sourceType === "network" ? (directWiFiMode ? directBlobUrl : getProxiedUrl(activeStreamUrl)) : null}
        alt="Network Stream"
        onLoad={handleLoadedMetadata}
        onError={() => {
          if (sourceType === "network" && activeStreamUrl && !directWiFiMode) {
            showToast("Failed to load WiFi stream. Verify camera connection & URL.", "error");
          }
        }}
      />

      {/* Floating Histogram Overlay (Luma + RGB curves) */}
      {showHistogram && (
        <div style={{ position: "absolute", bottom: "90px", left: "20px", zIndex: 10, pointerEvents: "none" }}>
          <Histogram sourceRef={activeSourceRef} active={showHistogram} />
        </div>
      )}

      {/* Modern Cinema HUD and Controls Overlay */}
      <MonitorUI
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={setSelectedDeviceId}
        sourceType={sourceType}
        onChangeSourceType={setSourceType}
        streamUrl={streamUrl}
        onChangeStreamUrl={setStreamUrl}
        activeLUTName={activeLUTItem ? activeLUTItem.name : "Default S-Log3"}
        onUploadLUT={handleUploadLUT}
        onResetLUT={handleResetLUT}
        fps={fps}
        resolution={resolution}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        toast={toast}
        directWiFiMode={directWiFiMode}
        onChangeDirectWiFiMode={setDirectWiFiMode}
        onConnectStream={handleConnectStream}
        
        // Advanced Controls & Telemetry props
        lutEnabled={lutEnabled}
        onChangeLutEnabled={setLutEnabled}
        lutList={lutList}
        selectedLutId={selectedLutId}
        onSelectLut={setSelectedLutId}
        uvcResolution={uvcResolution}
        onChangeUvcResolution={setUvcResolution}
        uvcFrameRate={uvcFrameRate}
        onChangeUvcFrameRate={setUvcFrameRate}
        sonyLiveviewSize={sonyLiveviewSize}
        onChangeSonyLiveviewSize={setSonyLiveviewSize}
        showHistogram={showHistogram}
        onChangeShowHistogram={setShowHistogram}
        cameraStatus={cameraStatus}
      />
    </div>
  );
}
