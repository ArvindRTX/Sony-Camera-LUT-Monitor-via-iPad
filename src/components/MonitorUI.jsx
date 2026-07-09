import React, { useState } from "react";

// Inline SVG Icons
const GearIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const ResetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
  </svg>
);

const FullscreenIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

const ExitFullscreenIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export default function MonitorUI({
  devices,
  selectedDeviceId,
  onSelectDevice,
  sourceType,
  onChangeSourceType,
  streamUrl,
  onChangeStreamUrl,
  activeLUTName,
  onUploadLUT,
  onResetLUT,
  fps,
  resolution,
  isFullscreen,
  onToggleFullscreen,
  toast,
  directWiFiMode,
  onChangeDirectWiFiMode,
  onConnectStream,
  
  // Advanced control states
  lutEnabled,
  onChangeLutEnabled,
  lutList,
  selectedLutId,
  onSelectLut,
  uvcResolution,
  onChangeUvcResolution,
  uvcFrameRate,
  onChangeUvcFrameRate,
  sonyLiveviewSize,
  onChangeSonyLiveviewSize,
  showHistogram,
  onChangeShowHistogram,
  cameraStatus
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onUploadLUT(file);
    }
  };

  return (
    <div className="overlay-container">
      {/* Top Status HUD */}
      <div className="status-bar">
        <div className="live-badge">
          <div className="pulse-dot"></div>
          {sourceType === "uvc" ? "Live UVC Feed" : "Live Network Feed"}
        </div>
        
        {/* Camera Settings Overlay Bar (for active Sony WiFi Stream) */}
        {sourceType === "network" && cameraStatus && (
          <div className="camera-metrics-bar" style={{ display: "flex", gap: "10px", marginLeft: "14px", color: "var(--color-accent)", fontSize: "11px", fontFamily: "monospace", letterSpacing: "0.5px" }}>
            <span style={{ backgroundColor: "rgba(10, 11, 16, 0.6)", padding: "4px 8px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(6px)" }}>ISO {cameraStatus.iso}</span>
            <span style={{ backgroundColor: "rgba(10, 11, 16, 0.6)", padding: "4px 8px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(6px)" }}>SS {cameraStatus.shutter}</span>
            <span style={{ backgroundColor: "rgba(10, 11, 16, 0.6)", padding: "4px 8px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(6px)" }}>AV {cameraStatus.aperture}</span>
            <span style={{ 
              backgroundColor: "rgba(10, 11, 16, 0.6)", 
              padding: "4px 8px", 
              borderRadius: "4px", 
              border: "1px solid rgba(255,255,255,0.06)", 
              backdropFilter: "blur(6px)",
              color: (cameraStatus.battery !== "N/A" && cameraStatus.battery !== "Offline" && parseInt(cameraStatus.battery) <= 20) ? "var(--color-warning)" : "var(--color-accent)" 
            }}>BAT {cameraStatus.battery}</span>
          </div>
        )}

        <div className="info-badges">
          <div className="badge badge-accent">
            LUT: {lutEnabled ? activeLUTName : "BYPASSED (S-Log3)"}
          </div>
          <div className="badge">
            {resolution}
          </div>
          <div className="badge">
            {fps} FPS
          </div>
        </div>
      </div>

      {/* Floating Gear Settings Toggle */}
      <div className="settings-trigger">
        <button
          className={`icon-btn ${isOpen ? "active" : ""}`}
          onClick={() => setIsOpen(!isOpen)}
          title="Adjust Settings"
        >
          <GearIcon />
        </button>
      </div>

      {/* Glassmorphic Settings Drawer */}
      <div className={`settings-drawer ${!isOpen ? "collapsed" : ""}`}>
        <div className="drawer-header">
          <span className="drawer-title">Monitor Settings</span>
          <button className="drawer-close" onClick={() => setIsOpen(false)}>
            <CloseIcon />
          </button>
        </div>

        {/* Connection Type Switcher */}
        <div className="control-group">
          <label className="control-label">Signal Input Mode</label>
          <div className="actions-row">
            <button
              className={`btn ${sourceType === "uvc" ? "btn-accent" : ""}`}
              onClick={() => onChangeSourceType("uvc")}
            >
              USB Capture
            </button>
            <button
              className={`btn ${sourceType === "network" ? "btn-accent" : ""}`}
              onClick={() => onChangeSourceType("network")}
            >
              WiFi Stream
            </button>
          </div>
        </div>

        {/* Conditional Input Settings */}
        {sourceType === "uvc" ? (
          <>
            {/* USB UVC Device select list */}
            <div className="control-group">
              <label className="control-label">Video Input Device</label>
              <select
                className="custom-select"
                value={selectedDeviceId}
                onChange={(e) => onSelectDevice(e.target.value)}
              >
                {devices.length === 0 ? (
                  <option value="">Searching for capture cards...</option>
                ) : (
                  devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera Source (${device.deviceId.slice(0, 5)})`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* UVC Resolution and Framerate Format Controls */}
            <div className="control-group" style={{ display: "flex", gap: "10px" }}>
              <div style={{ flex: 1 }}>
                <label className="control-label">Capture Resolution</label>
                <select
                  className="custom-select"
                  value={uvcResolution}
                  onChange={(e) => onChangeUvcResolution(Number(e.target.value))}
                >
                  <option value={1080}>1920x1080 (1080p)</option>
                  <option value={720}>1280x720 (720p)</option>
                  <option value={480}>640x480 (480p)</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="control-label">Target Framerate</label>
                <select
                  className="custom-select"
                  value={uvcFrameRate}
                  onChange={(e) => onChangeUvcFrameRate(Number(e.target.value))}
                >
                  <option value={60}>60 FPS</option>
                  <option value={30}>30 FPS</option>
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Network URL Text input */}
            <div className="control-group">
              <label className="control-label">Stream URL (MJPEG / HLS)</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                <input
                  type="text"
                  className="custom-select"
                  placeholder="e.g. http://192.168.122.1:8080/liveview.mjpg"
                  value={streamUrl}
                  onChange={(e) => onChangeStreamUrl(e.target.value)}
                  style={{ paddingRight: "16px", backgroundImage: "none", flex: 1, margin: 0 }}
                />
                <button
                  type="button"
                  className="btn btn-accent"
                  style={{ flex: "none", width: "90px", padding: "0 12px", height: "auto", margin: 0 }}
                  onClick={onConnectStream}
                >
                  Connect
                </button>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "4px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: "6px 12px", fontSize: "11px", height: "auto", flex: "none" }}
                  onClick={() => onChangeStreamUrl("sony://192.168.122.1")}
                >
                  🎥 Sony WiFi Preset
                </button>
                
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "11.5px", color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={directWiFiMode}
                    onChange={(e) => onChangeDirectWiFiMode(e.target.checked)}
                    style={{ accentColor: "var(--color-accent)", cursor: "pointer" }}
                  />
                  <span>Direct Mode (No PC)</span>
                </label>
              </div>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px", lineHeight: "1.3" }}>
                {directWiFiMode ? (
                  <span style={{ color: "var(--color-warning)", display: "block" }}>
                    ⚠️ Direct Mode runs 100% on the iPad. Since the camera does not support CORS, you must open this app in an iOS developer browser with CORS disabled (e.g. Inspect Browser).
                  </span>
                ) : (
                  <span>
                    💡 PC Proxy Mode handles camera handshakes and CORS bypass automatically. Connect iPad to PC's Mobile Hotspot or USB network.
                  </span>
                )}
              </span>
            </div>

            {/* Sony Liveview stream size option */}
            <div className="control-group">
              <label className="control-label">Liveview Stream Resolution</label>
              <select
                className="custom-select"
                value={sonyLiveviewSize}
                onChange={(e) => onChangeSonyLiveviewSize(e.target.value)}
              >
                <option value="L">High Quality (L)</option>
                <option value="M">Medium Quality (M)</option>
                <option value="S">Low Quality/Fast (S)</option>
              </select>
            </div>
          </>
        )}

        {/* 3D LUT Actions & Dropdowns */}
        <div className="control-group">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <label className="control-label" style={{ margin: 0 }}>Hardware 3D LUT (.cube)</label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "11.5px", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={lutEnabled}
                onChange={(e) => onChangeLutEnabled(e.target.checked)}
                style={{ accentColor: "var(--color-accent)", cursor: "pointer" }}
              />
              <span>Enable 3D LUT</span>
            </label>
          </div>

          <select
            className="custom-select"
            value={selectedLutId}
            onChange={(e) => onSelectLut(e.target.value)}
            style={{ marginBottom: "10px" }}
            disabled={!lutEnabled}
          >
            {lutList && lutList.map((lut) => (
              <option key={lut.id} value={lut.id}>
                {lut.name}
              </option>
            ))}
          </select>

          <div className="actions-row">
            {/* Custom File Upload Button */}
            <div className="file-upload-wrapper" style={{ flex: 1 }}>
              <button className="btn btn-accent" style={{ width: "100%" }}>
                <UploadIcon />
                Upload LUT
              </button>
              <input
                type="file"
                accept=".cube"
                className="file-upload-input"
                onChange={handleFileChange}
              />
            </div>
            {/* Reset to Default S-Log3 converter */}
            <button className="btn" onClick={onResetLUT} title="Restore default Rec.709 lut" style={{ flex: 1 }}>
              <ResetIcon />
              Reset Default
            </button>
          </div>
        </div>

        {/* Screen Layout & Exposure overlays */}
        <div className="control-group">
          <label className="control-label">Screen Layout & Overlays</label>
          <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "11.5px", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={showHistogram}
                onChange={(e) => onChangeShowHistogram(e.target.checked)}
                style={{ accentColor: "var(--color-accent)", cursor: "pointer" }}
              />
              <span>Show Exposure Histogram</span>
            </label>
          </div>
          <div className="actions-row">
            <button className="btn" onClick={onToggleFullscreen} style={{ width: "100%" }}>
              {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
            </button>
          </div>
        </div>
      </div>

      {/* Toast Notifications Panel */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type === "success" ? "toast-success" : ""}`}>
            <span className="toast-icon">
              {toast.type === "success" ? <CheckIcon /> : <AlertIcon />}
            </span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
