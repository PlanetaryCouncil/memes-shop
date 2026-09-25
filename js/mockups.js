// Flat SVG product mockups: a silhouette with the design placed on the print area.
// Deliberately simple — swap for real product photos once you have samples.

const INK = '#111';

const shapes = {
  tshirt: (d) => `
    <path d="M140 60 L200 40 Q250 75 300 40 L360 60 L450 130 L400 200 L360 175 L360 460 L140 460 L140 175 L100 200 L50 130 Z"
      fill="#f6f1e7" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M200 40 Q250 90 300 40" fill="none" stroke="${INK}" stroke-width="6"/>
    <image href="${d}" x="175" y="120" width="150" height="150"/>`,

  jumper: (d) => `
    <path d="M150 60 L205 45 Q250 70 295 45 L350 60 L420 110 L470 390 L420 400 L360 180 L360 440 L140 440 L140 180 L80 400 L30 390 L80 110 Z"
      fill="#2b2b2b" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M205 45 Q250 85 295 45" fill="none" stroke="#555" stroke-width="10"/>
    <rect x="140" y="425" width="220" height="30" rx="6" fill="#222" stroke="${INK}" stroke-width="6"/>
    <rect x="28" y="385" width="55" height="28" rx="6" fill="#222" stroke="${INK}" stroke-width="6"/>
    <rect x="417" y="385" width="55" height="28" rx="6" fill="#222" stroke="${INK}" stroke-width="6"/>
    <image href="${d}" x="180" y="115" width="140" height="140"/>`,

  sticker: (d) => `
    <g transform="rotate(-6 250 250)">
      <rect x="95" y="105" width="310" height="310" rx="40" fill="#0002"/>
      <rect x="85" y="90" width="310" height="310" rx="40" fill="#fff" stroke="#ddd" stroke-width="2"/>
      <clipPath id="sc"><rect x="100" y="105" width="280" height="280" rx="28"/></clipPath>
      <image href="${d}" x="100" y="105" width="280" height="280" clip-path="url(#sc)"/>
      <path d="M395 330 L395 360 Q395 400 355 400 L325 400 Z" fill="#e9e4da"/>
    </g>`,

  poster: (d) => `
    <rect x="95" y="30" width="310" height="440" fill="#0002" transform="translate(8 8)"/>
    <rect x="95" y="30" width="310" height="440" fill="#fff" stroke="${INK}" stroke-width="6"/>
    <image href="${d}" x="115" y="95" width="270" height="270"/>
    <rect x="115" y="385" width="270" height="4" fill="${INK}"/>
    <rect x="115" y="400" width="160" height="4" fill="#bbb"/>`,

  mug: (d) => `
    <path d="M370 180 Q470 180 470 270 Q470 360 370 360" fill="none" stroke="${INK}" stroke-width="30"/>
    <path d="M370 180 Q470 180 470 270 Q470 360 370 360" fill="none" stroke="#fff" stroke-width="18"/>
    <rect x="90" y="110" width="290" height="330" rx="18" fill="#fff" stroke="${INK}" stroke-width="6"/>
    <ellipse cx="235" cy="112" rx="145" ry="14" fill="#eee" stroke="${INK}" stroke-width="6"/>
    <image href="${d}" x="140" y="175" width="190" height="190"/>`,
};

export function mockup(productId, designUrl, label = '') {
  const draw = shapes[productId] || shapes.poster;
  return `<svg viewBox="0 0 500 500" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${draw(designUrl)}</svg>`;
}
