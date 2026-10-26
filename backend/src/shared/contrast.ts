/**
 * WCAG 2.1 / 2.2 Relative Luminance and Contrast Ratio calculation.
 * Spec P4-07: Automatic contrast check and suggested accessible alternative.
 * Colours failing 4.5:1 on white cannot be saved for buttons/links.
 */

export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    const c0 = clean.charAt(0);
    const c1 = clean.charAt(1);
    const c2 = clean.charAt(2);
    const r = parseInt(c0 + c0, 16);
    const g = parseInt(c1 + c1, 16);
    const b = parseInt(c2 + c2, 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

export function formatHexColor(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB component.
 */
function sRgbToLinear(c: number): number {
  const norm = c / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

/**
 * Returns relative luminance according to WCAG 2.1 definition (0 to 1).
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * sRgbToLinear(r) + 0.7152 * sRgbToLinear(g) + 0.0722 * sRgbToLinear(b);
}

/**
 * Calculates contrast ratio between two relative luminances (1:1 to 21:1).
 */
export function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * Calculates contrast ratio of a hex color against white (#FFFFFF).
 */
export function getContrastAgainstWhite(hex: string): { contrast: number; valid: boolean } {
  const rgb = parseHexColor(hex);
  if (!rgb) return { contrast: 1, valid: false };
  const lum = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
  const contrast = getContrastRatio(1, lum); // White has luminance 1.0
  return { contrast, valid: contrast >= 4.5 };
}

/**
 * Finds the closest accessible darkened alternative for a color failing 4.5:1 on white.
 */
export function findAccessibleAlternative(hex: string, targetRatio = 4.5): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return '#0F3D3E'; // Fallback to EveryVisitor high-contrast primary

  const { contrast } = getContrastAgainstWhite(hex);
  if (contrast >= targetRatio) {
    return hex.toUpperCase();
  }

  // Iteratively scale down RGB channels to darken the color while preserving hue
  let factor = 0.96;
  for (let i = 0; i < 50; i++) {
    const curR = Math.round(rgb.r * factor);
    const curG = Math.round(rgb.g * factor);
    const curB = Math.round(rgb.b * factor);
    const lum = getRelativeLuminance(curR, curG, curB);
    const curRatio = getContrastRatio(1, lum);
    if (curRatio >= targetRatio) {
      return formatHexColor(curR, curG, curB);
    }
    factor -= 0.02;
    if (factor <= 0) break;
  }

  return '#0F3D3E';
}
