export function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

export function getLuminance(r: number, g: number, b: number) {
  const a = [r, g, b].map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function getContrastRatio(hex1: string, hex2: string) {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    if(!rgb1 || !rgb2) return 1; // Default to low contrast if invalid
    const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function isContrastPassable(ratio: number) {
    // WCAG AA for large text is 3:1
    return ratio >= 3;
}

export function getBestContrastingColor(hex: string, light = '#FFFFFF', dark = '#000000') {
    const contrastLight = getContrastRatio(hex, light);
    const contrastDark = getContrastRatio(hex, dark);
    return contrastLight > contrastDark ? light : dark;
}

// Specific helper for the application indicators
export function getGridColors(bgHex: string) {
    const contrastWithWhite = getContrastRatio(bgHex, '#FFFFFF');
    const contrastWithBlack = getContrastRatio(bgHex, '#000000');
    
    const brandOrange = '#FF4F00';
    const accentPurple = '#4E18FF';

    // Row Indicators (Grid Lines)
    // Rule: Black, Shades of Gray, or White
    let rowColor;
    if (contrastWithWhite > contrastWithBlack) {
        // Dark background -> White lines
        rowColor = 'rgba(255, 255, 255, 0.1)';
    } else {
        // Light background -> Black lines
        rowColor = 'rgba(0, 0, 0, 0.1)';
    }

    // Column Indicators
    // Rule: Vanilla Orange or Purple
    // We prefer Orange unless it has poor contrast (< 1.5 is very hard to see).
    const contrastOrange = getContrastRatio(bgHex, brandOrange);
    const contrastPurple = getContrastRatio(bgHex, accentPurple);
    
    let colHex = brandOrange;
    
    // If Orange is poor, check Purple
    if (contrastOrange < 1.5) {
         if (contrastPurple > contrastOrange) {
             colHex = accentPurple;
         } else {
             // Fallback if both colored accents are bad
             colHex = contrastWithWhite > contrastWithBlack ? '#FFFFFF' : '#000000';
         }
    } else if (contrastPurple > contrastOrange + 3.0) {
        // If Purple is significantly better (e.g. on an orange background), use purple
        colHex = accentPurple;
    }

    const colRgb = hexToRgb(colHex);
    const colColor = colRgb 
        ? `rgba(${colRgb.r}, ${colRgb.g}, ${colRgb.b}, 0.15)` 
        : rowColor;

    return { rowColor, colColor };
}