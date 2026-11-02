// Shared catalog for settings validation, studio preview, and OBS rendering.
export const captionFonts = Object.freeze([
  {
    "id": "sans",
    "name": "Inter",
    "group": "Clean",
    "family": "Inter",
    "weight": 700,
    "file": "/fonts/sans.ttf"
  },
  {
    "id": "dm-sans",
    "name": "DM Sans",
    "group": "Clean",
    "family": "DM Sans",
    "weight": 700,
    "file": "/fonts/dm-sans.ttf"
  },
  {
    "id": "manrope",
    "name": "Manrope",
    "group": "Clean",
    "family": "Manrope",
    "weight": 700,
    "file": "/fonts/manrope.ttf"
  },
  {
    "id": "space-grotesk",
    "name": "Space Grotesk",
    "group": "Clean",
    "family": "Space Grotesk",
    "weight": 700,
    "file": "/fonts/space-grotesk.ttf"
  },
  {
    "id": "montserrat",
    "name": "Montserrat",
    "group": "Clean",
    "family": "Montserrat",
    "weight": 700,
    "file": "/fonts/montserrat.ttf"
  },
  {
    "id": "poppins",
    "name": "Poppins",
    "group": "Clean",
    "family": "Poppins",
    "weight": 700,
    "file": "/fonts/poppins.ttf"
  },
  {
    "id": "rubik",
    "name": "Rubik",
    "group": "Clean",
    "family": "Rubik",
    "weight": 700,
    "file": "/fonts/rubik.ttf"
  },
  {
    "id": "nunito",
    "name": "Nunito",
    "group": "Rounded",
    "family": "Nunito",
    "weight": 700,
    "file": "/fonts/nunito.ttf"
  },
  {
    "id": "oswald",
    "name": "Oswald",
    "group": "Bold",
    "family": "Oswald",
    "weight": 700,
    "file": "/fonts/oswald.ttf"
  },
  {
    "id": "anton",
    "name": "Anton",
    "group": "Bold",
    "family": "Anton",
    "weight": 400,
    "file": "/fonts/anton.ttf"
  },
  {
    "id": "bebas-neue",
    "name": "Bebas Neue",
    "group": "Bold",
    "family": "Bebas Neue",
    "weight": 400,
    "file": "/fonts/bebas-neue.ttf"
  },
  {
    "id": "bungee",
    "name": "Bungee",
    "group": "Bold",
    "family": "Bungee",
    "weight": 400,
    "file": "/fonts/bungee.ttf"
  },
  {
    "id": "fredoka",
    "name": "Fredoka",
    "group": "Rounded",
    "family": "Fredoka",
    "weight": 700,
    "file": "/fonts/fredoka.ttf"
  },
  {
    "id": "lilita-one",
    "name": "Lilita One",
    "group": "Rounded",
    "family": "Lilita One",
    "weight": 400,
    "file": "/fonts/lilita-one.ttf"
  },
  {
    "id": "caveat",
    "name": "Caveat",
    "group": "Handwritten",
    "family": "Caveat",
    "weight": 700,
    "file": "/fonts/caveat.ttf"
  },
  {
    "id": "permanent-marker",
    "name": "Permanent Marker",
    "group": "Handwritten",
    "family": "Permanent Marker",
    "weight": 400,
    "file": "/fonts/permanent-marker.ttf"
  },
  {
    "id": "patrick-hand",
    "name": "Patrick Hand",
    "group": "Handwritten",
    "family": "Patrick Hand",
    "weight": 400,
    "file": "/fonts/patrick-hand.ttf"
  },
  {
    "id": "playfair-display",
    "name": "Playfair Display",
    "group": "Serif",
    "family": "Playfair Display",
    "weight": 700,
    "file": "/fonts/playfair-display.ttf"
  },
  {
    "id": "lora",
    "name": "Lora",
    "group": "Serif",
    "family": "Lora",
    "weight": 700,
    "file": "/fonts/lora.ttf"
  },
  {
    "id": "roboto-slab",
    "name": "Roboto Slab",
    "group": "Serif",
    "family": "Roboto Slab",
    "weight": 700,
    "file": "/fonts/roboto-slab.ttf"
  },
  {
    "id": "space-mono",
    "name": "Space Mono",
    "group": "Monospace",
    "family": "Space Mono",
    "weight": 700,
    "file": "/fonts/space-mono.ttf"
  },
  {
    "id": "jetbrains-mono",
    "name": "JetBrains Mono",
    "group": "Monospace",
    "family": "JetBrains Mono",
    "weight": 700,
    "file": "/fonts/jetbrains-mono.ttf"
  },
  {
    "id": "serif",
    "name": "Georgia",
    "group": "Serif",
    "family": "Georgia",
    "weight": 700
  },
  {
    "id": "mono",
    "name": "System monospace",
    "group": "Monospace",
    "family": "ui-monospace",
    "weight": 700
  }
]);
export const fontIds = [...captionFonts.map(font => font.id), 'custom'];
export function sanitizeFontName(value) {
  return typeof value === 'string' && /^[\p{L}\p{N} ._-]{1,80}$/u.test(value.trim()) ? value.trim() : '';
}
export function fontDefinition(design = {}) {
  if (design.font === 'custom' && sanitizeFontName(design.customFont)) return {id:'custom',name:sanitizeFontName(design.customFont),family:sanitizeFontName(design.customFont),weight:700};
  return captionFonts.find(font => font.id === design.font) || captionFonts[0];
}
export function fontStyle(design) {
  const font = fontDefinition(design);
  const family = font.file ? `AuraMax-${font.id}` : font.family;
  return {family: `${JSON.stringify(family)}, ${font.id === 'mono' ? 'monospace' : font.group === 'Serif' ? 'Georgia, serif' : 'system-ui, sans-serif'}`, weight:font.weight};
}
const loaded = new Map();
export function ensureCaptionFont(design) {
  const font = fontDefinition(design);
  if (!font.file || typeof FontFace === 'undefined') return Promise.resolve(true);
  if (!loaded.has(font.id)) {
    const face = new FontFace(`AuraMax-${font.id}`, `url("${font.file}")`, {weight:String(font.weight),style:'normal',display:'swap'});
    document.fonts.add(face);
    loaded.set(font.id, face.load().then(() => true, () => false));
  }
  return loaded.get(font.id);
}
