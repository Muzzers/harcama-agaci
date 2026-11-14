// Giriş / hesap oluşturma ekranı.

import { signIn, signUp, resetPassword, errorText } from './cloud.js';
import { h, esc, toast } from './ui.js';

let screen = null;

export function showLoading(text = 'Yükleniyor…') {
  hideAuth();
  screen = h(`<div class="auth-screen loading"><div class="auth-orb"></div><p>${esc(text)}</p></div>`);
  document.body.append(screen);
}

export function hideAuth() {
  if (!screen) return;
  const el = screen;
  screen = null;
  el.classList.add('leaving');
  setTimeout(() => el.remove(), 350);
}

export function showLogin({ notice = '' } = {}) {
  hideAuth();
  let mode = 'in';
  screen = h(`
    <div class="auth-screen">
      <form class="auth-card" autocomplete="on" novalidate>
        <div class="auth-orb" aria-hidden="true"><span></span><span></span><span></span></div>
        <h1>Harcama Ağacı</h1>
        <p class="auth-lead">Verilerin hesabında saklanır; telefon değişse de kaybolmaz.</p>
        <div class="seg" role="tablist">
          <button type="button" data-mode="in" class="on">Giriş yap</button>
          <button type="button" data-mode="up">Hesap oluştur</button>
        </div>
        <label class="field"><span class="lbl">Kullanıcı adı</span>
          <input name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="örn. mustafa" enterkeyhint="next"></label>
        <label class="field"><span class="lbl">Şifre</span>
          <input name="password" type="password" autocomplete="current-password" placeholder="En az 6 karakter" enterkeyhint="go"></label>
        <label class="field confirm" hidden><span class="lbl">Şifre (tekrar)</span>
          <input name="password2" type="password" autocomplete="new-password" enterkeyhint="go"></label>
        <p class="auth-error" role="alert">${esc(notice)}</p>
        <button class="primary" type="submit">Giriş yap</button>
        <p class="auth-note up-only" hidden>Kullanıcı adı yerine e-posta da yazabilirsin; o zaman şifreni unutursan sıfırlayabilirsin. Kullanıcı adıyla açılan hesapta şifre sıfırlanamaz, bir yere not et.</p>
        <button class="link forgot in-only" type="button">Şifremi unuttum</button>
      </form>
    </div>`);
  document.body.append(screen);

  const form = screen.querySelector('form');
  const $ = (s) => form.querySelector(s);
  const err = $('.auth-error');
  const submit = $('button[type=submit]');

  const setMode = (m) => {
    mode = m;
    for (const b of form.querySelectorAll('.seg button')) b.classList.toggle('on', b.dataset.mode === m);
    $('.confirm').hidden = m !== 'up';
    $('.up-only').hidden = m !== 'up';
    $('.in-only').hidden = m !== 'in';
    $('[name=password]').autocomplete = m === 'up' ? 'new-password' : 'current-password';
    submit.textContent = m === 'up' ? 'Hesap oluştur' : 'Giriş yap';
    err.textContent = '';
  };
  form.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) setMode(b.dataset.mode);
  });

  $('.forgot').addEventListener('click', async () => {
    try {
      await resetPassword($('[name=username]').value);
      toast('Şifre sıfırlama bağlantısı e-postana gönderildi');
    } catch (e) {
      err.textContent = errorText(e);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = $('[name=username]').value.trim();
    const pass = $('[name=password]').value;
    err.textContent = '';
    if (!user) return (err.textContent = 'Kullanıcı adını yaz.');
    if (pass.length < 6) return (err.textContent = 'Şifre en az 6 karakter olmalı.');
    if (mode === 'up' && pass !== $('[name=password2]').value) return (err.textContent = 'Şifreler aynı değil.');
    submit.disabled = true;
    submit.textContent = 'Bekle…';
    try {
      if (mode === 'up') await signUp(user, pass);
      else await signIn(user, pass);
      // Oturum açılınca app.js'teki dinleyici devam eder.
    } catch (ex) {
      err.textContent = errorText(ex);
      submit.disabled = false;
      submit.textContent = mode === 'up' ? 'Hesap oluştur' : 'Giriş yap';
    }
  });

  setTimeout(() => $('[name=username]').focus(), 50);
}
