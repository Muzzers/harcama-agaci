// Firebase ile hesap ve bulut eşitleme.
// Her kullanıcının tüm verisi tek bir Firestore belgesinde durur: users/{uid}.
// Telefonda da bir kopya tutulur; internet yokken uygulama yine açılır, bağlanınca eşitlenir.

import { FIREBASE_CONFIG } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
const USER_DOMAIN = 'kullanici.harcama-agaci.app';

let fb = null;
let loading = null;

// ?yerel ile açılırsa hesapsız yerel modda çalışır (geliştirme/deneme için; buluta dokunmaz).
const LOCAL_ONLY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('yerel');
export const cloudEnabled = () => !LOCAL_ONLY && !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

async function sdk() {
  if (fb) return fb;
  if (!loading) {
    loading = (async () => {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      const app = appMod.initializeApp(FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      const db = fsMod.getFirestore(app);
      fb = { auth, db, a: authMod, f: fsMod };
      return fb;
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

const TR = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c', İ: 'i' };

/** "Mustafa.G" → "mustafa.g@kullanici.harcama-agaci.app"; gerçek e-posta olduğu gibi kalır. */
export function toEmail(login) {
  const v = String(login || '').trim();
  if (v.includes('@')) return { email: v.toLowerCase(), real: true };
  const name = v.replace(/[ığüşöçİ]/g, (c) => TR[c]).toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(name)) return { error: 'Kullanıcı adı 3–30 karakter olmalı; harf, rakam, nokta, tire içerebilir.' };
  return { email: `${name}@${USER_DOMAIN}`, real: false };
}

export function displayName(user) {
  if (!user?.email) return '';
  return user.email.endsWith('@' + USER_DOMAIN) ? user.email.split('@')[0] : user.email;
}

const MESSAGES = {
  'auth/invalid-credential': 'Kullanıcı adı veya şifre hatalı.',
  'auth/wrong-password': 'Kullanıcı adı veya şifre hatalı.',
  'auth/user-not-found': 'Bu kullanıcı adıyla hesap yok. “Hesap oluştur”u dene.',
  'auth/invalid-email': 'Kullanıcı adı geçersiz.',
  'auth/email-already-in-use': 'Bu kullanıcı adı alınmış. Başka bir ad dene ya da giriş yap.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
  'auth/missing-password': 'Şifreni yaz.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.',
  'auth/network-request-failed': 'İnternet bağlantısı yok.',
  'auth/operation-not-allowed': 'Firebase’de Email/Password girişi açılmamış.',
  'auth/configuration-not-found': 'Firebase’de Authentication henüz açılmamış.',
  'permission-denied': 'Bulut erişimi reddedildi — Firestore kurallarını kontrol et.',
  unavailable: 'Buluta ulaşılamıyor, internetini kontrol et.',
};

export function errorText(err) {
  return MESSAGES[err?.code] || err?.message || 'Bir şeyler ters gitti.';
}

/** Oturum değişince cb(user|null) çağrılır. SDK yüklenemezse onError çağrılır. */
export async function watchAuth(cb, onError) {
  try {
    const { auth, a } = await sdk();
    return a.onAuthStateChanged(auth, cb, onError);
  } catch (err) {
    onError?.(err);
    return () => {};
  }
}

export async function signIn(login, password) {
  const e = toEmail(login);
  if (e.error) throw { message: e.error };
  const { auth, a } = await sdk();
  return (await a.signInWithEmailAndPassword(auth, e.email, password)).user;
}

export async function signUp(login, password) {
  const e = toEmail(login);
  if (e.error) throw { message: e.error };
  const { auth, a } = await sdk();
  return (await a.createUserWithEmailAndPassword(auth, e.email, password)).user;
}

export async function resetPassword(login) {
  const e = toEmail(login);
  if (!e.real) throw { message: 'Şifre sıfırlama yalnızca e-postayla açılan hesaplarda çalışır.' };
  const { auth, a } = await sdk();
  await a.sendPasswordResetEmail(auth, e.email);
}

export async function signOut() {
  const { auth, a } = await sdk();
  await a.signOut(auth);
}

// ---------- Veri ----------

/** Buluttaki durumu getirir: { state, updatedAt } ya da null (henüz yoksa). */
export async function loadRemote(uid) {
  const { db, f } = await sdk();
  const snap = await f.getDoc(f.doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { state: JSON.parse(d.state), updatedAt: Number(d.updatedAt) || 0 };
}

let timer = 0;
let pending = null;

/** Değişiklikleri kısa bir gecikmeyle buluta yazar (art arda düzenlemeleri birleştirir). */
export function saveRemote(uid, state, onResult) {
  pending = { uid, json: JSON.stringify(state), updatedAt: state.updatedAt || Date.now() };
  clearTimeout(timer);
  timer = setTimeout(flush, 700, onResult);
}

export async function flush(onResult) {
  clearTimeout(timer);
  const job = pending;
  pending = null;
  if (!job) return;
  try {
    const { db, f } = await sdk();
    await f.setDoc(f.doc(db, 'users', job.uid), { state: job.json, updatedAt: job.updatedAt, savedAt: f.serverTimestamp() });
    onResult?.(null);
  } catch (err) {
    if (!pending) pending = job; // bağlantı gelince tekrar denensin
    onResult?.(err);
  }
}

export const hasPending = () => !!pending;

// ---------- Fişler ----------

export async function saveReceipt(uid, id, dataUrl) {
  const { db, f } = await sdk();
  await f.setDoc(f.doc(db, 'users', uid, 'receipts', id), { data: dataUrl, savedAt: f.serverTimestamp() });
}

export async function loadReceipt(uid, id) {
  const { db, f } = await sdk();
  const snap = await f.getDoc(f.doc(db, 'users', uid, 'receipts', id));
  return snap.exists() ? snap.data().data : null;
}

export async function deleteReceipt(uid, id) {
  const { db, f } = await sdk();
  await f.deleteDoc(f.doc(db, 'users', uid, 'receipts', id));
}

/** Başka cihazdan gelen değişiklikleri dinler. */
export async function watchRemote(uid, cb) {
  const { db, f } = await sdk();
  return f.onSnapshot(
    f.doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const d = snap.data();
      try {
        cb({ state: JSON.parse(d.state), updatedAt: Number(d.updatedAt) || 0 });
      } catch {
        /* bozuk belge: yok say */
      }
    },
    () => {}
  );
}
