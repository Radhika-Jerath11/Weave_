/* Google sign-in / sign up for Weave.
   Works on both login.html and signup.html. */

// >>> PASTE YOUR GOOGLE CLIENT ID BETWEEN THE QUOTES (see the guide, Part 1) <<<
const GOOGLE_CLIENT_ID = '823744007661-uh1en1q0s4d4kcphkjt7507atqneuacu.apps.googleusercontent.com';

(function () {
  const btn = document.getElementById('googleBtn');
  if (!btn) return;
  const label = document.getElementById('googleBtnText');
  const toast = document.getElementById('loginToast') || document.getElementById('signupToast');
  const toastText = document.getElementById('loginToastText') || document.getElementById('signupToastText');

  function say(message) {
    if (!toast || !toastText) { alert(message); return; }
    toastText.textContent = message;
    toast.classList.add('toast-error', 'show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 4500);
  }
  function reset() { btn.disabled = false; label.textContent = 'Continue with Google'; }

  async function finish(accessToken) {
    let data;
    try {
      const res = await fetch('http://localhost:5000/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken })
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Google sign-in failed');
    } catch (err) {
      say(err instanceof TypeError ? "Can't reach the server — is the backend running?" : err.message);
      reset();
      return;
    }
    // Same things Weave.login() saves, so every other page sees you as signed in
    localStorage.setItem('weave_token', data.token);
    localStorage.setItem('weave_user', JSON.stringify(data.user));
    sessionStorage.setItem('weaveSession', JSON.stringify({ name: data.user.name, email: data.user.email }));
    label.textContent = 'Welcome to Weave';
    setTimeout(() => crossPageNavigate('index.html'), 400);
  }

  btn.addEventListener('click', () => {
    if (!window.google || !google.accounts) {
      say("Couldn't load Google. Check your internet connection and try again.");
      return;
    }
    if (GOOGLE_CLIENT_ID.startsWith('PASTE_YOUR')) {
      say('Google Client ID is missing in js/google-auth.js');
      return;
    }
    btn.disabled = true;
    label.textContent = 'Opening Google…';
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      callback: (resp) => {
        if (resp.error || !resp.access_token) { say('Google sign-in was cancelled.'); reset(); return; }
        label.textContent = 'Signing you in…';
        finish(resp.access_token);
      },
      error_callback: () => { reset(); } // popup closed or blocked
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
})();