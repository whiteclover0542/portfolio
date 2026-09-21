document.querySelectorAll('.evidence-toggle').forEach((button) => {
  const detail = document.getElementById(button.getAttribute('aria-controls'));
  if (!detail) return;

  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    detail.hidden = expanded;
    button.textContent = expanded ? '자세히 보기' : '접기';
  });
});

const contactToggle = document.getElementById('contact-toggle');
if (contactToggle) {
  contactToggle.addEventListener('click', () => {
    contactToggle.textContent = contactToggle.getAttribute('href').replace('mailto:', '');
  });
}

// hero spotlight follows the pointer (mouse only, skipped for reduced motion)
const hero = document.getElementById('intro');
if (hero && matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
  let tx = 72, ty = 38, x = tx, y = ty, raf = 0;
  const tick = () => {
    x += (tx - x) * 0.12;
    y += (ty - y) * 0.12;
    hero.style.setProperty('--mx', x + '%');
    hero.style.setProperty('--my', y + '%');
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.05 ? requestAnimationFrame(tick) : 0;
  };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width) * 100;
    ty = ((e.clientY - r.top) / r.height) * 100;
    if (!raf) raf = requestAnimationFrame(tick);
  });
}
