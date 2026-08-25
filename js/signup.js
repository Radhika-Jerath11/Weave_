const USERS_KEY = 'weaveUsers';

function getUsers(){
  try{ return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
  catch(e){ return []; }
}
function saveUsers(users){ localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
function findUser(email){
  return getUsers().find(u => u.email.toLowerCase() === email.trim().toLowerCase());
}
function showToast(toastEl, textEl, message, type){
  textEl.textContent = message;
  toastEl.classList.toggle('toast-error', type === 'error');
  toastEl.classList.add('show');
  clearTimeout(toastEl._hideTimer);
  toastEl._hideTimer = setTimeout(() => toastEl.classList.remove('show'), 4500);
}

function getPasswordIssues(password) {
  const issues = [];
  if (password.length < 8) issues.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) issues.push('one uppercase letter');
  if (!/[0-9]/.test(password)) issues.push('one number');
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;'/]/.test(password)) issues.push('one special character');
  return issues;
}

document.getElementById('goLogin').addEventListener('click', () => {
  crossPageNavigate('login.html');
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

const signupName = document.getElementById('signupName');
const signupEmail = document.getElementById('signupEmail');
const signupPassword = document.getElementById('signupPassword');
const signupBtn = document.getElementById('signupBtn');
const signupForm = document.getElementById('signupForm');

const node1 = document.getElementById('node1'), check1 = document.getElementById('check1');
const node2 = document.getElementById('node2'), check2 = document.getElementById('check2');
const node3 = document.getElementById('node3'), check3 = document.getElementById('check3');
const seg1 = document.getElementById('seg1'), seg2 = document.getElementById('seg2'), seg3 = document.getElementById('seg3');
const lockBody = document.getElementById('lockBody'), lockShackle = document.getElementById('lockShackle');
const signupLabels = document.querySelectorAll('.node-label');

function refreshSignupChain(){
  const nameOk = signupName.value.trim().length > 1;
  const emailOk = signupEmail.value.trim().length > 3 && signupEmail.value.includes('@');
  const passOk = getPasswordIssues(signupPassword.value).length === 0;

  const issues = getPasswordIssues(signupPassword.value);
  const hintEl = document.getElementById('passwordHintText');
  if (issues.length > 0 && signupPassword.value.length > 0) {
    if (hintEl) hintEl.textContent = 'Needs: ' + issues.join(', ');
  } else {
    if (hintEl) hintEl.textContent = '';
  }

  signupName.classList.toggle('resolved', nameOk);
  signupEmail.classList.toggle('resolved', emailOk);
  signupPassword.classList.toggle('resolved', passOk);
  setNodeDone(node1, check1, seg1, nameOk);
  setNodeDone(node2, check2, seg2, emailOk);
  setNodeDone(node3, check3, seg3, passOk);
  signupLabels[0].classList.toggle('done', nameOk);
  signupLabels[1].classList.toggle('done', emailOk);
  signupLabels[2].classList.toggle('done', passOk);
  const ready = nameOk && emailOk && passOk;
  signupBtn.disabled = !ready;
  signupBtn.classList.toggle('ready', ready);
}
signupName.addEventListener('input', refreshSignupChain);
signupEmail.addEventListener('input', refreshSignupChain);
signupPassword.addEventListener('input', refreshSignupChain);

signupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if(signupBtn.disabled) return;

  const signupToast = document.getElementById('signupToast');
  const signupToastText = document.getElementById('signupToastText');

  const passwordIssues = getPasswordIssues(signupPassword.value);
  if (passwordIssues.length > 0) {
    showToast(signupToast, signupToastText, 'Password needs ' + passwordIssues.join(', ') + '.', 'error');
    return;
  }

  if(findUser(signupEmail.value)){
    showToast(signupToast, signupToastText, 'An account with this email already exists — sign in instead.', 'error');
    const emailField = document.getElementById('signupEmailField');
    emailField.classList.add('shake');
    setTimeout(() => emailField.classList.remove('shake'), 400);
    return;
  }

  const newUser = { name: signupName.value.trim(), email: signupEmail.value.trim(), password: signupPassword.value };
  const users = getUsers();
  users.push(newUser);
  saveUsers(users);

  signupBtn.classList.add('unlocking');
  signupBtn.textContent = 'Creating…';

  showToast(signupToast, signupToastText, 'Account created successfully — redirecting to sign in…', 'success');

  setTimeout(() => {
    lockBody.classList.add('unlocked');
    lockShackle.classList.add('unlocked');
    signupLabels[3].classList.add('done');
  }, 350);

  setTimeout(() => {
    sessionStorage.setItem('weaveHandoffEmail', newUser.email);
    crossPageNavigate('login.html');
  }, 1100);
});
