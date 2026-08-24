const USERS_KEY = 'weaveUsers';
const SESSION_KEY = 'weaveSession';

function getUsers(){
  try{ return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
  catch(e){ return []; }
}
function findUser(email){
  return getUsers().find(u => u.email.toLowerCase() === email.trim().toLowerCase());
}
function setSession(user){
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ name: user.name, email: user.email }));
}
function getSession(){
  try{ return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
  catch(e){ return null; }
}
function showToast(toastEl, textEl, message, type){
  textEl.textContent = message;
  toastEl.classList.toggle('toast-error', type === 'error');
  toastEl.classList.add('show');
  clearTimeout(toastEl._hideTimer);
  toastEl._hideTimer = setTimeout(() => toastEl.classList.remove('show'), 4500);
}

document.getElementById('goSignup').addEventListener('click', () => {
  crossPageNavigate('signup.html');
});

document.querySelectorAll('.toggle-vis').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.target);
    const isPass = target.type === 'password';
    target.type = isPass ? 'text' : 'password';
    btn.textContent = isPass ? 'Hide' : 'Show';
  });
});

function setNodeDone(node, check, seg, done){
  node.classList.toggle('done', done);
  check.classList.toggle('show', done);
  if(seg) seg.classList.toggle('done', done);
}

const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginForm = document.getElementById('loginForm');

const node1 = document.getElementById('node1'), check1 = document.getElementById('check1');
const node2 = document.getElementById('node2'), check2 = document.getElementById('check2');
const node3 = document.getElementById('node3'), check3 = document.getElementById('check3');
const seg1 = document.getElementById('seg1'), seg2 = document.getElementById('seg2'), seg3 = document.getElementById('seg3');
const lockBody = document.getElementById('lockBody'), lockShackle = document.getElementById('lockShackle');
const loginLabels = document.querySelectorAll('.node-label');

function refreshLoginChain(){
  const emailOk = loginEmail.value.trim().length > 3 && loginEmail.value.includes('@');
  const passOk = loginPassword.value.length >= 4;
  loginEmail.classList.toggle('resolved', emailOk);
  loginPassword.classList.toggle('resolved', passOk);
  setNodeDone(node1, check1, seg1, emailOk);
  setNodeDone(node2, check2, seg2, passOk);
  loginLabels[0].classList.toggle('done', emailOk);
  loginLabels[1].classList.toggle('done', passOk);
  const ready = emailOk && passOk;
  node3.classList.toggle('active-pulse', ready);
  loginBtn.disabled = !ready;
  loginBtn.classList.toggle('ready', ready);
}
loginEmail.addEventListener('input', refreshLoginChain);
loginPassword.addEventListener('input', refreshLoginChain);

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if(loginBtn.disabled) return;

  const user = findUser(loginEmail.value);
  const loginToast = document.getElementById('loginToast');
  const loginToastText = document.getElementById('loginToastText');
  const emailField = document.getElementById('loginEmailField');

  if(!user){
    showToast(loginToast, loginToastText, 'No user found with this email — create an account first.', 'error');
    emailField.classList.add('shake');
    setTimeout(() => emailField.classList.remove('shake'), 400);
    return;
  }

  if(user.password !== loginPassword.value){
    showToast(loginToast, loginToastText, 'Incorrect password — try again.', 'error');
    return;
  }

  setNodeDone(node3, check3, seg3, true);
  node3.classList.remove('active-pulse');
  loginLabels[2].classList.add('done');

  loginBtn.classList.add('unlocking');
  loginBtn.textContent = 'Unlocking…';

  setTimeout(() => {
    lockBody.classList.add('unlocked');
    lockShackle.classList.add('unlocked');
    loginLabels[3].classList.add('done');
    loginBtn.textContent = 'Welcome back';
  }, 400);

  setTimeout(() => {
    setSession(user);
    crossPageNavigate('index.html');
  }, 1050);
});

/* ---------- init ---------- */
(function init(){
  // Already signed in? Skip straight to the dashboard.
  if(getSession()){
    window.location.replace('index.html');
    return;
  }

  const handoff = sessionStorage.getItem('weaveHandoffEmail');
  if(handoff){
    loginEmail.value = handoff;
    refreshLoginChain();

    document.getElementById('loginToastText').textContent = `Account created for ${handoff} — sign in below.`;
    document.getElementById('loginToast').classList.remove('toast-error');
    sessionStorage.removeItem('weaveHandoffEmail');

    setTimeout(() => document.getElementById('loginToast').classList.add('show'), 550);
    setTimeout(() => document.getElementById('loginToast').classList.remove('show'), 5000);
  }
})();