// Kategori simgeleri: tek tip çizgi ikonlar (emoji yok).

export const CAT_ICONS = {
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.3l2.6 12h11.3L21 7.5H6"/>',
  coffee: '<path d="M4 9h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2.5v3M12 2.5v3"/><path d="M4 21h13"/>',
  bus: '<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 10h16M8 17v3M16 17v3"/><path d="M8 13.5h.01M16 13.5h.01"/>',
  bolt: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  bag: '<path d="M5 8h14l-1.2 13H6.2z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7.5 4v16M16.5 4v16M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21"/>',
  heart: '<path d="M20.4 5.6a5 5 0 0 0-7.4.4L12 7.2 11 6a5 5 0 0 0-7.4 6.8L12 21l8.4-8.2a5 5 0 0 0 0-7.2z"/>',
  dots: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
  home: '<path d="M3 11 12 3.5 21 11"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  car: '<path d="M5 16H3v-4.5L5.2 6h13.6l2.2 5.5V16h-2"/><path d="M3 11.5h18"/><circle cx="7.5" cy="16.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/><path d="M9.5 16.5h5"/>',
  plane: '<path d="M21.5 2.5 10.5 13.5"/><path d="M21.5 2.5 15 21.5l-4.5-8-8-4.5z"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>',
  book: '<path d="M3 4.5h6a3 3 0 0 1 3 3V20a2 2 0 0 0-2-2H3z"/><path d="M21 4.5h-6a3 3 0 0 0-3 3V20a2 2 0 0 1 2-2h7z"/>',
  gift: '<rect x="3" y="8" width="18" height="4.5" rx="1"/><path d="M5 12.5V21h14v-8.5M12 8v13"/><path d="M12 8C10.5 4 6.5 4 6.5 6.3S12 8 12 8s5.5.6 5.5-1.7S13.5 4 12 8z"/>',
  paw: '<circle cx="5.5" cy="10" r="1.8"/><circle cx="9.5" cy="5.5" r="1.8"/><circle cx="14.5" cy="5.5" r="1.8"/><circle cx="18.5" cy="10" r="1.8"/><path d="M8 17.5c0-3 1.8-5.5 4-5.5s4 2.5 4 5.5c0 2-1.8 2.5-4 2.5s-4-.5-4-2.5z"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  school: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3.5 2.5 8.5 2.5 12 0v-5M22 9v6"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6l9-3 1.5 3"/>',
  tag: '<path d="M20.5 12.5 12 21 3 12V3h9z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  baby: '<circle cx="12" cy="8" r="4.5"/><path d="M10.3 8h.01M13.7 8h.01"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/>',
};

export const ICON_KEYS = Object.keys(CAT_ICONS);

const EMOJI_TO_KEY = { '🛒': 'cart', '☕': 'coffee', '🚌': 'bus', '💡': 'bolt', '🛍️': 'bag', '🛍': 'bag', '🎬': 'film', '💊': 'heart', '✨': 'dots' };

/** Eski (emoji) kayıtları ikon anahtarına çevirir. */
export function iconKey(v) {
  if (CAT_ICONS[v]) return v;
  return EMOJI_TO_KEY[v] || 'tag';
}

export function catIcon(key, cls = '') {
  return `<svg class="ci ${cls}" viewBox="0 0 24 24" aria-hidden="true">${CAT_ICONS[key] || CAT_ICONS.tag}</svg>`;
}
