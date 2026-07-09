/**
 * S-Log3 to Scene-Linear Reflection conversion formula.
 * Standard Sony S-Log3 curves are piecewise: linear for dark shadows, logarithmic elsewhere.
 * Input 'v' is in [0.0, 1.0] range.
 */
export function slog3ToLinear(v) {
  const SLog = v * 1023.0; // scale to 10-bit code values
  if (SLog >= 171.2102946469) {
    return Math.pow(10.0, (SLog - 420.0) / 261.5) * 0.19 - 0.01;
  } else {
    return ((SLog - 95.0) * 0.01125) / (171.2102946469 - 95.0);
  }
}

/**
 * Standard Rec.709 Opto-Electronic Transfer Function (OETF) for display encoding.
 * Input 'x' is linear light in [0.0, 1.0].
 */
export function rec709OETF(x) {
  if (x <= 0.0) return 0.0;
  if (x <= 0.018) return 4.5 * x;
  return 1.099 * Math.pow(x, 0.45) - 0.099;
}

/**
 * Generates a default 33x33x33 S-Log3 to Rec.709 conversion LUT.
 * Uses exact S-Gamut3.Cine to Rec.709 3x3 conversion matrix.
 */
export function generateDefaultLUT() {
  const size = 33;
  const data = new Float32Array(size * size * size * 4); // RGBA format
  let index = 0;

  // S-Gamut3.Cine to Rec.709 3x3 Conversion Matrix (Linear)
  const m = [
    [1.626947, -0.540139, -0.086809],
    [-0.178516, 1.417941, -0.239425],
    [-0.044436, -0.195920, 1.240356]
  ];

  // In .cube files, Red loops fastest, then Green, then Blue.
  for (let z = 0; z < size; z++) {
    const b_in = z / (size - 1);
    for (let y = 0; y < size; y++) {
      const g_in = y / (size - 1);
      for (let x = 0; x < size; x++) {
        const r_in = x / (size - 1);

        // 1. Linearize S-Log3
        const linR = slog3ToLinear(r_in);
        const linG = slog3ToLinear(g_in);
        const linB = slog3ToLinear(b_in);

        // 2. Convert from S-Gamut3.Cine to Rec.709
        const recR = m[0][0] * linR + m[0][1] * linG + m[0][2] * linB;
        const recG = m[1][0] * linR + m[1][1] * linG + m[1][2] * linB;
        const recB = m[2][0] * linR + m[2][1] * linG + m[2][2] * linB;

        // 3. Apply Rec.709 OETF (gamma mapping) & clamp
        const outR = Math.max(0.0, Math.min(1.0, rec709OETF(recR)));
        const outG = Math.max(0.0, Math.min(1.0, rec709OETF(recG)));
        const outB = Math.max(0.0, Math.min(1.0, rec709OETF(recB)));

        // 4. Pack into RGBA Float32Array (Alpha = 1.0)
        data[index] = outR;
        data[index + 1] = outG;
        data[index + 2] = outB;
        data[index + 3] = 1.0;
        index += 4;
      }
    }
  }

  return {
    size,
    data,
    domainMin: [0.0, 0.0, 0.0],
    domainMax: [1.0, 1.0, 1.0],
    title: "Default S-Log3 to Rec.709"
  };
}

/**
 * Parses standard .cube LUT files.
 * Supports arbitrary sizes (usually 17, 33, or 65).
 * Pads to RGBA array to ensure hardware compatibility and alignment.
 */
export function parseCubeFile(text, fileName = "Custom LUT") {
  const lines = text.split("\n");
  let size = 0;
  let domainMin = [0.0, 0.0, 0.0];
  let domainMax = [1.0, 1.0, 1.0];
  const rgbValues = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    const upper = line.toUpperCase();
    if (upper.startsWith("LUT_3D_SIZE")) {
      const match = line.match(/LUT_3D_SIZE\s+(\d+)/i);
      if (match) {
        size = parseInt(match[1], 10);
      }
      continue;
    }

    if (upper.startsWith("LUT_1D_SIZE")) {
      throw new Error("This application only supports 3D LUTs. 1D LUTs are not supported.");
    }

    if (upper.startsWith("DOMAIN_MIN")) {
      const match = line.match(/DOMAIN_MIN\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/i);
      if (match) {
        domainMin = [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])];
      }
      continue;
    }

    if (upper.startsWith("DOMAIN_MAX")) {
      const match = line.match(/DOMAIN_MAX\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/i);
      if (match) {
        domainMax = [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])];
      }
      continue;
    }

    // Skip other potential header variables like TITLE
    if (upper.startsWith("TITLE")) continue;

    // Parsed color values: R G B
    const tokens = line.split(/\s+/);
    if (tokens.length >= 3) {
      const r = parseFloat(tokens[0]);
      const g = parseFloat(tokens[1]);
      const b = parseFloat(tokens[2]);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        rgbValues.push(r, g, b);
      }
    }
  }

  if (size === 0) {
    // If size not found in header, estimate it based on cube root of number of points
    const pointsCount = rgbValues.length / 3;
    const estimatedSize = Math.round(Math.pow(pointsCount, 1 / 3));
    if (estimatedSize * estimatedSize * estimatedSize === pointsCount) {
      size = estimatedSize;
    } else {
      throw new Error("Invalid .cube file: Cannot determine 3D LUT size.");
    }
  }

  const expectedPoints = size * size * size;
  const parsedPoints = rgbValues.length / 3;
  if (parsedPoints !== expectedPoints) {
    throw new Error(`Invalid .cube file: Expected ${expectedPoints} color points, but parsed ${parsedPoints}.`);
  }

  // Convert to flat RGBA Float32Array (adding Alpha = 1.0 channel)
  const rgbaData = new Float32Array(expectedPoints * 4);
  for (let i = 0; i < expectedPoints; i++) {
    rgbaData[i * 4] = rgbValues[i * 3];
    rgbaData[i * 4 + 1] = rgbValues[i * 3 + 1];
    rgbaData[i * 4 + 2] = rgbValues[i * 3 + 2];
    rgbaData[i * 4 + 3] = 1.0; // Alpha
  }

  return {
    size,
    data: rgbaData,
    domainMin,
    domainMax,
    title: fileName.replace(/\.[^/.]+$/, "") // Strip extension for title display
  };
}
