// Fiş fotoğrafları: sıkıştırılıp telefonda (IndexedDB) saklanır; hesap açıksa
// buluta da yazılır (users/{uid}/receipts/{harcamaId}).

import * as cloud from './cloud.js';

const DB_NAME = 'harcama-agaci';
const STORE = 'receipts';
const MAX_SIDE = 1400;
const MAX_BYTES = 800_000; // Firestore belge sınırının (1 MB) altında kalsın

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

async function idb(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

const local = {
  get: (id) => idb('readonly', (s) => s.get(id)).catch(() => null),
  put: (id, v) => idb('readwrite', (s) => s.put(v, id)).catch(() => null),
  del: (id) => idb('readwrite', (s) => s.delete(id)).catch(() => null),
};

/** Kameradan/galeriden gelen dosyayı küçültüp JPEG data URL'e çevirir. */
export async function compress(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let src = bitmap;
  let w;
  let hgt;
  if (bitmap) {
    w = bitmap.width;
    hgt = bitmap.height;
  } else {
    // Eski tarayıcılar için yedek yol
    src = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Fotoğraf okunamadı'));
      img.src = URL.createObjectURL(file);
    });
    w = src.naturalWidth;
    hgt = src.naturalHeight;
  }
  let scale = Math.min(1, MAX_SIDE / Math.max(w, hgt));
  let quality = 0.7;
  for (let i = 0; i < 6; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(hgt * scale);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(src, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_BYTES) return url;
    quality = Math.max(0.4, quality - 0.1);
    scale *= 0.8;
  }
  throw new Error('Fotoğraf çok büyük');
}

export async function putReceipt(id, dataUrl, account) {
  await local.put(id, dataUrl);
  if (account) await cloud.saveReceipt(account.uid, id, dataUrl);
}

export async function getReceipt(id, account) {
  const cached = await local.get(id);
  if (cached) return cached;
  if (!account) return null;
  const remote = await cloud.loadReceipt(account.uid, id).catch(() => null);
  if (remote) local.put(id, remote);
  return remote;
}

export async function deleteReceipt(id, account) {
  await local.del(id);
  if (account) await cloud.deleteReceipt(account.uid, id).catch(() => {});
}

/** Fişi tam ekran gösterir; dokununca kapanır. */
export function showReceipt(dataUrl) {
  const el = document.createElement('div');
  el.className = 'receipt-viewer';
  const img = document.createElement('img');
  img.alt = 'Fiş';
  img.src = dataUrl;
  const hint = document.createElement('span');
  hint.textContent = 'Kapatmak için dokun';
  el.append(img, hint);
  el.addEventListener('click', () => {
    el.classList.remove('open');
    setTimeout(() => el.remove(), 250);
  });
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('open'));
}
