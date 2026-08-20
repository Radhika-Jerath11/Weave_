// Navbar background on scroll
const header = document.getElementById('siteHeader');
const onScroll = () => {
  if (window.scrollY > 24) header.classList.add('scrolled');
  else header.classList.remove('scrolled');
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Smooth-scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Scroll-reveal via IntersectionObserver
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
revealEls.forEach(el => io.observe(el));

// "Get Started" routing logic: check session state
function routeGetStarted() {
  const loggedIn = localStorage.getItem('taskflow_current_user') || sessionStorage.getItem('taskflow_session');
  if (loggedIn) {
    window.location.href = 'index.html';
  } else {
    window.location.href = 'signup.html';
  }
}

['navGetStarted', 'heroGetStarted', 'footerGetStarted'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      routeGetStarted();
    });
  }
});

// Hero mini-board: looping lock -> unlock animation with leaf burst
const lockedCard = document.getElementById('lockedCard');
const finalDone = document.getElementById('finalDone');

function spawnLeafBurst(target) {
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const panel = target.closest('.panel') || target.parentElement;
  const panelRect = panel.getBoundingClientRect();
  const burst = document.createElement('div');
  burst.className = 'leaf-burst';
  burst.style.left = (rect.left - panelRect.left + rect.width / 2) + 'px';
  burst.style.top = (rect.top - panelRect.top + rect.height / 2) + 'px';
  panel.appendChild(burst);

  const leafCount = 8;
  for (let i = 0; i < leafCount; i++) {
    const leaf = document.createElement('span');
    leaf.className = 'leaf';
    const angle = (Math.PI * 2 * i) / leafCount;
    const dist = 34 + Math.random() * 18;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    leaf.style.setProperty('--dx', dx + 'px');
    leaf.style.setProperty('--dy', dy + 'px');
    leaf.animate([
      { transform: 'translate(0,0) scale(0.4) rotate(0deg)', opacity: 0 },
      { transform: 'translate(' + (dx * 0.4) + 'px,' + (dy * 0.4) + 'px) scale(1) rotate(90deg)', opacity: 1, offset: 0.35 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.7) rotate(180deg)', opacity: 0 }
    ], { duration: 900, easing: 'ease-out' });
    burst.appendChild(leaf);
  }
  setTimeout(() => burst.remove(), 950);
}

function playHeroLoop() {
  if (!lockedCard) return;
  setTimeout(() => {
    lockedCard.classList.add('unlocking');
    lockedCard.innerHTML = 'Deploy to staging';
    spawnLeafBurst(lockedCard);
    if (finalDone) finalDone.style.display = 'flex';
    setTimeout(() => {
      lockedCard.classList.remove('unlocking');
    }, 3600);
  }, 1800);
}

playHeroLoop();
setInterval(() => {
  if (lockedCard) {
    lockedCard.classList.remove('unlocking');
    lockedCard.innerHTML = '<span class="lock">🔒</span> Deploy to staging';
  }
  if (finalDone) finalDone.style.display = 'none';
  playHeroLoop();
}, 6200);

// Live interactive demo: mark QA sign-off done -> unlock Ship v1.2
const demoLockedCard = document.getElementById('demoLockedCard');
const demoQaCard = document.getElementById('demoQaCard');
const demoMarkDone = document.getElementById('demoMarkDone');
const demoDoneCol = document.getElementById('demoDoneCol');
const demoNote = document.getElementById('demoNote');

if (demoMarkDone) {
  demoMarkDone.addEventListener('click', () => {
    demoMarkDone.disabled = true;
    demoMarkDone.textContent = 'Done';
    demoQaCard?.classList.add('done');
    const smallText = demoQaCard?.querySelector('small');
    if (smallText) smallText.textContent = 'Completed';

    setTimeout(() => {
      if (demoQaCard && demoDoneCol) {
        const moved = demoQaCard.cloneNode(true);
        moved.querySelector('button')?.remove();
        demoDoneCol.appendChild(moved);
        demoQaCard.remove();
      }
    }, 350);

    if (demoLockedCard) {
      demoLockedCard.classList.remove('locked');
      demoLockedCard.innerHTML = '<div>Ship v1.2<small>Ready to start</small></div>';
      spawnLeafBurst(demoLockedCard);
    }
    if (demoNote) {
      demoNote.textContent = 'Unlocked: "Ship v1.2" no longer depends on anything unfinished — it just moved from locked to available.';
      demoNote.style.background = 'rgba(139,154,107,0.16)';
      demoNote.style.borderColor = 'var(--sage-400)';
    }
  });
}