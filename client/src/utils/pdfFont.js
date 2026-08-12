const FONT_URL = '/fonts/Ramabhadra-Regular.ttf';
export const RAMABHADRA = 'Ramabhadra';

let cachedBase64 = null;
let cachedCssUrl = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Load Ramabhadra TTF as base64 (cached). */
export async function loadRamabhadraBase64() {
  if (cachedBase64) return cachedBase64;
  const res = await fetch(FONT_URL);
  if (!res.ok) throw new Error('Failed to load Ramabhadra font');
  cachedBase64 = arrayBufferToBase64(await res.arrayBuffer());
  return cachedBase64;
}

/** CSS @font-face block with embedded Ramabhadra (works in blob / Electron). */
export async function ramabhadraFontFaceCss() {
  const b64 = await loadRamabhadraBase64();
  return `
@font-face {
  font-family: '${RAMABHADRA}';
  src: url(data:font/ttf;base64,${b64}) format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
`.trim();
}

/** Ensure Ramabhadra is available to the current document for measuring/rendering. */
export async function ensureRamabhadraInDocument() {
  if (cachedCssUrl) {
    await document.fonts.load(`16px ${RAMABHADRA}`);
    return;
  }
  const css = await ramabhadraFontFaceCss();
  const blob = new Blob([css], { type: 'text/css' });
  cachedCssUrl = URL.createObjectURL(blob);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cachedCssUrl;
  document.head.appendChild(link);
  await document.fonts.load(`16px ${RAMABHADRA}`);
  await document.fonts.ready;
}
