import { useEffect, useRef, useState } from "react";

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  // Flip the Y coordinate because HTML video/image textures are upside down in WebGL
  v_texCoord = vec2(a_texCoord.x, 1.0 - a_texCoord.y);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
precision highp sampler3D; // required for sampler3D in WebGL2

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_videoFrame;
uniform sampler3D u_lutTexture;
uniform float u_lutSize;
uniform bool u_lutEnabled;

void main() {
  // Sample S-Log3 raw video/image color
  vec4 rawColor = texture(u_videoFrame, v_texCoord);

  if (u_lutEnabled) {
    // Coordinate transformation for exact 3D LUT mapping.
    // We map the range [0.0, 1.0] to [0.5 / size, (size - 0.5) / size]
    // to prevent bleeding at the boundaries and align with texel centers.
    vec3 lutCoord = rawColor.rgb * ((u_lutSize - 1.0) / u_lutSize) + (0.5 / u_lutSize);

    // Sample the color-corrected value from the 3D LUT texture
    vec3 correctedColor = texture(u_lutTexture, lutCoord).rgb;

    // Output color with original video alpha
    outColor = vec4(correctedColor, rawColor.a);
  } else {
    // Bypass LUT color grading, render raw S-Log3 feed directly
    outColor = rawColor;
  }
}
`;

function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation error: ${log}`);
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, vsSource, gl.VERTEX_SHADER);
  const fs = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

export function useWebGLRenderer(canvasRef, sourceRef, sourceType, lutData, lutEnabled) {
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(0);
  const requestRef = useRef(null);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const lutEnabledRef = useRef(lutEnabled);

  useEffect(() => {
    lutEnabledRef.current = lutEnabled;
  }, [lutEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceRef || !lutData) return;

    // 1. Initialize WebGL2 context
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      premultipliedAlpha: false,
      antialias: false,
      powerPreference: "high-performance"
    });

    if (!gl) {
      setError("WebGL 2 is not supported on this device. Please use iPadOS Safari or another WebGL2-enabled browser.");
      return;
    }

    let program;
    let positionBuffer;
    let texCoordBuffer;
    let videoTexture;
    let lutTexture;
    let vao;

    try {
      // 2. Initialize shaders & program
      program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
      gl.useProgram(program);

      // 3. Set up vertices (two triangles for full-screen quad)
      const positions = new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
      ]);

      const texCoords = new Float32Array([
        0.0, 0.0,
        1.0, 0.0,
        0.0, 1.0,
        0.0, 1.0,
        1.0, 0.0,
        1.0, 1.0,
      ]);

      // Create Vertex Array Object (VAO) to store attribute state
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      // Position Attribute
      const a_positionLoc = gl.getAttribLocation(program, "a_position");
      positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(a_positionLoc);
      gl.vertexAttribPointer(a_positionLoc, 2, gl.FLOAT, false, 0, 0);

      // TexCoord Attribute
      const a_texCoordLoc = gl.getAttribLocation(program, "a_texCoord");
      texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(a_texCoordLoc);
      gl.vertexAttribPointer(a_texCoordLoc, 2, gl.FLOAT, false, 0, 0);

      // 4. Set up Video/Image Frame Texture (2D)
      videoTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Initialize with an empty 1x1 black texture
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

      // 5. Set up 3D LUT Texture (3D sampler)
      lutTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, lutTexture);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // Enables trilinear hardware interpolation
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // 6. Bind Uniform Locations
      const u_videoFrameLoc = gl.getUniformLocation(program, "u_videoFrame");
      const u_lutTextureLoc = gl.getUniformLocation(program, "u_lutTexture");
      const u_lutSizeLoc = gl.getUniformLocation(program, "u_lutSize");
      const u_lutEnabledLoc = gl.getUniformLocation(program, "u_lutEnabled");

      gl.uniform1i(u_videoFrameLoc, 0); // maps to gl.TEXTURE0
      gl.uniform1i(u_lutTextureLoc, 1); // maps to gl.TEXTURE1
      gl.uniform1f(u_lutSizeLoc, lutData.size);
      gl.uniform1i(u_lutEnabledLoc, lutEnabledRef.current ? 1 : 0);

    } catch (err) {
      setError(err.message);
      return;
    }

    // 7. Upload S-Log3 to Rec.709 or Custom LUT data to GPU
    const uploadLUT = (lut) => {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, lutTexture);
      
      const size = lut.size;
      const totalElements = size * size * size * 4;
      const uint8Data = new Uint8Array(totalElements);

      // Convert floating-point LUT [0.0, 1.0] to performance-optimized UNSIGNED_BYTE [0, 255] on the CPU
      // before uploading. This guarantees trilinear filtering works natively on iPadOS Safari.
      for (let i = 0; i < totalElements; i++) {
        uint8Data[i] = Math.max(0, Math.min(255, Math.round(lut.data[i] * 255)));
      }

      gl.texImage3D(
        gl.TEXTURE_3D,
        0,                 // level
        gl.RGBA8,          // internalFormat
        size,              // width
        size,              // height
        size,              // depth
        0,                 // border
        gl.RGBA,           // format
        gl.UNSIGNED_BYTE,  // type
        uint8Data          // pixel data
      );

      // Update the LUT size uniform in case it changed
      const u_lutSizeLoc = gl.getUniformLocation(program, "u_lutSize");
      gl.useProgram(program);
      gl.uniform1f(u_lutSizeLoc, size);
    };

    // Initial LUT upload
    uploadLUT(lutData);

    // 8. Main Render Loop
    const render = () => {
      // Monitor performance and calculate FPS
      const now = performance.now();
      frameCountRef.current++;
      if (now - lastTimeRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (now - lastTimeRef.current)));
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      const sourceElement = sourceRef.current;
      let isReady = false;
      let width = 0;
      let height = 0;

      if (sourceElement) {
        if (sourceElement instanceof HTMLVideoElement) {
          isReady = sourceElement.readyState >= sourceElement.HAVE_CURRENT_DATA;
          width = sourceElement.videoWidth;
          height = sourceElement.videoHeight;
        } else if (sourceElement instanceof HTMLImageElement) {
          // Verify that the MJPEG network image has loaded and has dimensions
          isReady = sourceElement.complete && sourceElement.naturalWidth > 0;
          width = sourceElement.naturalWidth;
          height = sourceElement.naturalHeight;
        }
      }

      // Check if source is active and has valid dimensions
      if (isReady && width > 0 && height > 0) {
        // Auto-resize viewport and canvas buffer size if stream dimensions change
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(program);
        gl.bindVertexArray(vao);

        // Update LUT enabled uniform
        const u_lutEnabledLoc = gl.getUniformLocation(program, "u_lutEnabled");
        gl.uniform1i(u_lutEnabledLoc, lutEnabledRef.current ? 1 : 0);

        // Upload new video/image frame to GPU texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceElement);

        // Draw screen quad (two triangles)
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else {
        // Fallback: Clear canvas to soft obsidian dark when there is no active stream
        gl.clearColor(0.024, 0.024, 0.031, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }

      requestRef.current = requestAnimationFrame(render);
    };

    render();

    // Clean up WebGL resources on component unmount / LUT reset
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindTexture(gl.TEXTURE_3D, null);

      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (texCoordBuffer) gl.deleteBuffer(texCoordBuffer);
      if (videoTexture) gl.deleteTexture(videoTexture);
      if (lutTexture) gl.deleteTexture(lutTexture);
      if (vao) gl.deleteVertexArray(vao);
      if (program) gl.deleteProgram(program);
    };
  }, [canvasRef, sourceRef, sourceType, lutData]);

  return { error, fps };
}
