const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
menuButton?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('.main-nav a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('.main-nav a').forEach(item => item.classList.remove('active'));
    link.classList.add('active');
  });
});
const modal = document.querySelector('#site-modal');
const modalTitle = document.querySelector('#modal-title');
const modalCopy = document.querySelector('#modal-copy');
document.querySelectorAll('[data-modal]').forEach(button => {
  button.addEventListener('click', () => {
    const isLink = button.dataset.modal === 'link';
    modalTitle.textContent = isLink ? 'LINK YOUR ACCOUNT' : 'SIGN IN TO VANDAL';
    modalCopy.textContent = isLink
      ? 'Account linking will be enabled after the game-account and backend integration is configured.'
      : 'Discord sign-in will be enabled after OAuth is configured for your VANDAL application.';
    modal.showModal();
  });
});
modal?.addEventListener('click', event => {
  if (event.target === modal) modal.close();
});

// Demo population only. Replace this with your server query/API before publishing.
const demoPopulation = 0;
document.querySelector('#server-online').textContent = demoPopulation;
document.querySelector('#total-online').textContent = demoPopulation;
document.querySelector('#population-bar').style.width = `${Math.min(100, Math.max(0, demoPopulation))}%`;
