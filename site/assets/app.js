const header = document.querySelector('.site-header');
const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
const modal = document.querySelector('.modal');
const form = document.querySelector('[data-lead-form]');

const syncHeader = () => {
  if (!header) return;
  header.classList.toggle('scrolled', window.scrollY > 24);
};

syncHeader();
window.addEventListener('scroll', syncHeader, { passive: true });

menuButton?.addEventListener('click', () => {
  const open = nav?.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(Boolean(open)));
  document.body.classList.toggle('menu-open', Boolean(open));
});

document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    nav?.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  });
});

const openModal = () => {
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setTimeout(() => modal.querySelector('input')?.focus(), 50);
};

const closeModal = () => {
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
};

document.addEventListener('click', (event) => {
  const trigger = event.target.closest?.('[data-open-form]');
  if (!trigger) return;
  event.preventDefault();
  openModal();
}, true);
modal?.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
modal?.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const name = data.get('name') || 'клиент';
  form.hidden = true;
  const success = document.querySelector('.form-success');
  if (success) {
    success.classList.add('show');
    success.querySelector('[data-client-name]').textContent = String(name);
  }
});

document.querySelectorAll('[data-contact-form]').forEach((contactForm) => {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = contactForm.querySelector('button[type="submit"]');
    if (button) {
      button.textContent = 'Заявка принята ✓';
      button.disabled = true;
    }
  });
});

const calculator = document.querySelector('[data-calculator]');
if (calculator) {
  const updateEstimate = () => {
    const area = Math.max(20, Number(calculator.querySelector('[name="area"]')?.value) || 20);
    const type = calculator.querySelector('[name="object"]')?.value || 'house';
    const base = type === 'house' ? 90000 : 45000;
    let perMeter = 0;
    calculator.querySelectorAll('[name="system"]:checked').forEach((input) => { perMeter += Number(input.value); });
    const center = base + area * Math.max(perMeter, 900);
    const low = Math.round(center * .82 / 10000) * 10000;
    const high = Math.round(center * 1.18 / 10000) * 10000;
    const formatter = new Intl.NumberFormat('ru-RU');
    calculator.querySelector('[data-estimate]').textContent = `${formatter.format(low)}–${formatter.format(high)} ₽`;
  };
  calculator.addEventListener('input', updateEstimate);
  updateEstimate();
}
