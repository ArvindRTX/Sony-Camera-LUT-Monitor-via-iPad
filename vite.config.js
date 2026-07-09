import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import http from 'http'
import https from 'https'
import { URL } from 'url'
import { Transform } from 'stream'

// Transform stream parser to strip Sony proprietary headers and serve standard MJPEG
class SonyLiveviewParser extends Transform {
  constructor() {
    super();
    this.buffer = Buffer.alloc(0);
    this.state = 'common_header'; // States: 'common_header', 'payload_header', 'jpeg_data', 'padding'
    this.jpegSize = 0;
    this.paddingSize = 0;
  }

  _transform(chunk, encoding, callback) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    
    let processing = true;
    while (processing) {
      if (this.state === 'common_header') {
        if (this.buffer.length >= 8) {
          // Read 8 bytes common header, discard it
          this.buffer = this.buffer.slice(8);
          this.state = 'payload_header';
        } else {
          processing = false;
        }
      } else if (this.state === 'payload_header') {
        if (this.buffer.length >= 128) {
          // Verify payload start code: 0x24, 0x35, 0x68, 0x79
          const startCode = this.buffer.readUInt32BE(0);
          if (startCode !== 0x24356879) {
            // Out of sync! Search for the next start code to realign
            const idx = this.buffer.indexOf(Buffer.from([0x24, 0x35, 0x68, 0x79]));
            if (idx !== -1) {
              this.buffer = this.buffer.slice(idx);
              continue; // loop again with new alignment
            } else {
              // Wait for more data, keep only the end bytes to check split boundaries
              this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - 3));
              processing = false;
              break;
            }
          }
          
          // Parse JPEG data size (indices 4, 5, 6 of payload header as 24-bit int)
          this.jpegSize = (this.buffer[4] << 16) | (this.buffer[5] << 8) | this.buffer[6];
          // Parse padding size (index 7)
          this.paddingSize = this.buffer[7];
          
          this.buffer = this.buffer.slice(128);
          this.state = 'jpeg_data';
        } else {
          processing = false;
        }
      } else if (this.state === 'jpeg_data') {
        if (this.buffer.length >= this.jpegSize) {
          const jpegFrame = this.buffer.slice(0, this.jpegSize);
          this.buffer = this.buffer.slice(this.jpegSize);
          
          // Output the extracted JPEG frame wrapped in standard multipart MJPEG formatting
          this.push(`--boundary\r\n`);
          this.push(`Content-Type: image/jpeg\r\n`);
          this.push(`Content-Length: ${jpegFrame.length}\r\n\r\n`);
          this.push(jpegFrame);
          this.push(`\r\n`);
          
          this.state = 'padding';
        } else {
          processing = false;
        }
      } else if (this.state === 'padding') {
        if (this.buffer.length >= this.paddingSize) {
          this.buffer = this.buffer.slice(this.paddingSize);
          this.state = 'common_header';
        } else {
          processing = false;
        }
      }
    }
    
    callback();
  }
}

// Custom Vite plugin to handle CORS proxies and Sony WiFi direct liveview streams
const corsProxyPlugin = () => ({
  name: 'vite-plugin-cors-proxy',
  configureServer(server) {
    
    // Route 1: Standard CORS Proxy Server
    server.middlewares.use('/api/proxy', (req, res) => {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const targetUrl = urlObj.searchParams.get('url');

      if (!targetUrl) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Error: Missing "url" parameter in query string.');
        return;
      }

      try {
        const parsed = new URL(targetUrl);
        const protocol = parsed.protocol === 'https:' ? https : http;

        const targetHeaders = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (key !== 'host' && key !== 'origin' && key !== 'referer') {
            targetHeaders[key] = value;
          }
        }
        targetHeaders['host'] = parsed.host;

        const proxyReq = protocol.request(targetUrl, {
          method: 'GET',
          headers: targetHeaders,
          rejectUnauthorized: false
        }, (proxyRes) => {
          const responseHeaders = { ...proxyRes.headers };
          responseHeaders['Access-Control-Allow-Origin'] = '*';
          responseHeaders['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
          responseHeaders['Access-Control-Allow-Headers'] = '*';

          res.writeHead(proxyRes.statusCode || 200, responseHeaders);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'text/plain');
          res.end(`CORS Proxy Connection Failed: ${err.message}`);
        });

        proxyReq.end();
      } catch (err) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain');
        res.end(`Invalid target stream URL: ${err.message}`);
      }
    });

    // Route 2: Sony Camera Remote WiFi Liveview Server
    server.middlewares.use('/api/sony-liveview', (req, res) => {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const cameraIp = urlObj.searchParams.get('ip') || '192.168.122.1';
      const size = urlObj.searchParams.get('size') || 'L'; // L, M, S
      
      // Set headers for MJPEG multipart streaming
      res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=boundary',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });

      const sendRPC = (method, params, callback) => {
        const payload = JSON.stringify({
          method: method,
          params: params,
          id: 1,
          version: '1.0'
        });

        const rpcReq = http.request({
          host: cameraIp,
          port: 10000,
          path: '/sony/camera',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, (rpcRes) => {
          let body = '';
          rpcRes.on('data', chunk => body += chunk);
          rpcRes.on('end', () => {
            try {
              callback(null, JSON.parse(body));
            } catch (e) {
              callback(e, null);
            }
          });
        });

        rpcReq.on('error', (err) => {
          callback(err, null);
        });

        rpcReq.write(payload);
        rpcReq.end();
      };

      // Chained execution: 1. startRecMode -> 2. startLiveviewWithSize (falling back to startLiveview if needed)
      console.log(`[Sony WiFi] Initializing session on ${cameraIp}:10000 (Size: ${size})...`);
      sendRPC('startRecMode', [], (err, recResult) => {
        if (err) {
          console.log(`[Sony WiFi] startRecMode failed: ${err.message}. Proceeding to startLiveview...`);
        } else {
          console.log(`[Sony WiFi] startRecMode initialized successfully.`);
        }

        // Wait a short moment for mode transition, then trigger liveview stream
        setTimeout(() => {
          sendRPC('startLiveviewWithSize', [size], (err, lvResult) => {
            let streamUrl = `http://${cameraIp}:10000/liveview/liveviewstream`;
            
            if (err || (lvResult && lvResult.error)) {
              console.log(`[Sony WiFi] startLiveviewWithSize failed. Attempting standard startLiveview...`);
              sendRPC('startLiveview', [], (err2, lvResult2) => {
                if (lvResult2 && lvResult2.result && lvResult2.result[0]) {
                  streamUrl = lvResult2.result[0];
                  console.log(`[Sony WiFi] Stream URL retrieved: ${streamUrl}`);
                } else {
                  console.log(`[Sony WiFi] Standard startLiveview failed, using default stream path.`);
                }
                startStreaming(streamUrl);
              });
            } else if (lvResult && lvResult.result && lvResult.result[0]) {
              streamUrl = lvResult.result[0];
              console.log(`[Sony WiFi] Stream URL retrieved: ${streamUrl}`);
              startStreaming(streamUrl);
            } else {
              console.log(`[Sony WiFi] No stream URL returned, using default stream path.`);
              startStreaming(streamUrl);
            }
          });
        }, 100);
      });

      // 2. Fetch the binary liveview stream and pipe through parsing middleware
      function startStreaming(url) {
        try {
          const parsed = new URL(url);
          const getReq = http.request({
            host: parsed.hostname,
            port: parsed.port || 10000,
            path: parsed.pathname + parsed.search,
            method: 'GET'
          }, (getRes) => {
            const parser = new SonyLiveviewParser();
            getRes.pipe(parser).pipe(res);
            
            // Clean up when the client closes the connection (e.g. settings drawer changes source)
            req.on('close', () => {
              getReq.destroy();
              parser.destroy();
            });
          });

          getReq.on('error', (err) => {
            console.error("[Sony WiFi] Streaming GET failed:", err.message);
            res.end(`Streaming failed: ${err.message}`);
          });

          getReq.end();
        } catch (e) {
          console.error("[Sony WiFi] Stream setup error:", e.message);
          res.end(`Streaming setup error: ${e.message}`);
        }
      }
    });

    // Route 3: Sony Camera Status Metrics (ISO, Shutter, Aperture, Battery)
    server.middlewares.use('/api/sony-status', (req, res) => {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const cameraIp = urlObj.searchParams.get('ip') || '192.168.122.1';

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });

      const payload = JSON.stringify({
        method: 'getEvent',
        params: [false],
        id: 1,
        version: '1.0'
      });

      const rpcReq = http.request({
        host: cameraIp,
        port: 10000,
        path: '/sony/camera',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (rpcRes) => {
        let body = '';
        rpcRes.on('data', chunk => body += chunk);
        rpcRes.on('end', () => {
          let status = { iso: 'N/A', shutter: 'N/A', aperture: 'N/A', battery: 'N/A' };
          try {
            const json = JSON.parse(body);
            if (json.result && Array.isArray(json.result)) {
              json.result.forEach(item => {
                if (!item) return;
                if (item.type === 'isoSpeedRate' && item.currentIsoSpeedRate) {
                  status.iso = item.currentIsoSpeedRate;
                } else if (item.type === 'shutterSpeed' && item.currentShutterSpeed) {
                  status.shutter = item.currentShutterSpeed;
                } else if (item.type === 'fNumber' && item.currentFNumber) {
                  status.aperture = `f/${item.currentFNumber}`;
                } else if (item.type === 'batteryInfo' && item.batteryInfo) {
                  if (item.batteryInfo[0]) {
                    status.battery = `${item.batteryInfo[0].batteryLevelPct}%`;
                  }
                }
              });
            }
          } catch (e) {
            // Silence JSON parse error if camera returns HTML or garbage
          }
          res.end(JSON.stringify(status));
        });
      });

      rpcReq.on('error', (err) => {
        res.end(JSON.stringify({ iso: 'Offline', shutter: 'Offline', aperture: 'Offline', battery: 'Offline' }));
      });

      rpcReq.write(payload);
      rpcReq.end();
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), corsProxyPlugin()],
})
