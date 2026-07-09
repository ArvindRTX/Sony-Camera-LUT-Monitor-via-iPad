import React, { useEffect, useRef } from "react";

export default function Histogram({ sourceRef, active }) {
  const canvasRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!active || !sourceRef) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Initialize hidden helper canvas for fast, low-overhead pixel sampling (128x72)
    const hiddenCanvas = hiddenCanvasRef.current || document.createElement("canvas");
    hiddenCanvas.width = 128;
    hiddenCanvas.height = 72;
    hiddenCanvasRef.current = hiddenCanvas;
    const hiddenCtx = hiddenCanvas.getContext("2d");

    let isDestroyed = false;

    const drawHistogram = () => {
      if (isDestroyed) return;

      const source = sourceRef.current;
      if (!source) {
        // Source not ready, request next frame
        animationRef.current = requestAnimationFrame(drawHistogram);
        return;
      }

      try {
        let isReady = false;
        if (source instanceof HTMLVideoElement) {
          isReady = source.readyState >= source.HAVE_CURRENT_DATA;
        } else if (source instanceof HTMLImageElement) {
          isReady = source.complete && source.naturalWidth > 0;
        }

        if (isReady) {
          // Draw video/image frame to tiny hidden canvas for downsampling
          hiddenCtx.drawImage(source, 0, 0, 128, 72);
          const imgData = hiddenCtx.getImageData(0, 0, 128, 72);
          const data = imgData.data;

          // Initialize 256-bin buckets
          const rBins = new Array(256).fill(0);
          const gBins = new Array(256).fill(0);
          const bBins = new Array(256).fill(0);
          const lBins = new Array(256).fill(0);

          let maxCount = 0;

          // Sample pixels and distribute into buckets
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Rec.709 Luma coefficients
            const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

            rBins[r]++;
            gBins[g]++;
            bBins[b]++;
            lBins[l]++;

            if (rBins[r] > maxCount) maxCount = rBins[r];
            if (gBins[g] > maxCount) maxCount = gBins[g];
            if (bBins[b] > maxCount) maxCount = bBins[b];
            if (lBins[l] > maxCount) maxCount = lBins[l];
          }

          // Clear visual canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Render background card
          ctx.fillStyle = "rgba(10, 11, 16, 0.45)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw gridlines (Quarter exposure markers: 25%, 50%, 75%)
          ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
          ctx.lineWidth = 1;
          for (let pct = 0.25; pct < 1.0; pct += 0.25) {
            const x = canvas.width * pct;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }

          // Curve drawing helper
          const drawChannel = (bins, strokeColor, fillColor) => {
            ctx.beginPath();
            const scaleX = canvas.width / 256;
            // Prevent division by zero and apply padding
            const denominator = maxCount || 1;
            const scaleY = (canvas.height - 4) / denominator;

            ctx.moveTo(0, canvas.height);
            for (let i = 0; i < 256; i++) {
              const x = i * scaleX;
              const y = canvas.height - bins[i] * scaleY;
              ctx.lineTo(x, y);
            }
            ctx.lineTo(canvas.width, canvas.height);
            ctx.closePath();

            if (fillColor) {
              ctx.fillStyle = fillColor;
              ctx.fill();
            }
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          };

          // Render stacked colored channels with alpha transparency
          drawChannel(rBins, "rgba(239, 68, 68, 0.8)", "rgba(239, 68, 68, 0.15)"); // Red
          drawChannel(gBins, "rgba(16, 185, 129, 0.8)", "rgba(16, 185, 129, 0.15)"); // Green
          drawChannel(bBins, "rgba(59, 130, 246, 0.8)", "rgba(59, 130, 246, 0.15)"); // Blue
          drawChannel(lBins, "rgba(243, 244, 246, 0.7)", null); // Luma overlay line
        }
      } catch (e) {
        // Silent catch for initial frame state drawing failures
      }

      // Schedule next sample after 50ms (~20 FPS) to maintain high system throughput
      setTimeout(() => {
        if (!isDestroyed && active) {
          animationRef.current = requestAnimationFrame(drawHistogram);
        }
      }, 50);
    };

    animationRef.current = requestAnimationFrame(drawHistogram);

    return () => {
      isDestroyed = true;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [sourceRef, active]);

  return (
    <div
      className="histogram-container"
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "8px",
        overflow: "hidden",
        backgroundColor: "rgba(10, 11, 16, 0.65)",
        backdropFilter: "blur(12px)",
        pointerEvents: "none",
        boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
      }}
    >
      <canvas
        ref={canvasRef}
        width="200"
        height="85"
        style={{ display: "block" }}
      />
    </div>
  );
}
