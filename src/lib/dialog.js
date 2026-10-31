// Accessible in-page confirm dialog (replaces window.confirm). Cancel is focused first and is the default.
// Returns a promise resolving true (confirmed) / false (cancelled, Esc, backdrop). Lives on <body>, so
// app re-renders do not remove it. Focus is trapped inside and restored on close.
let seq = 0;
export function confirmDialog({ title, html, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, warning = '' }) {
  return new Promise((resolve) => {
    const id = 'dlg' + ++seq, opener = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal-scrim" data-x></div>
<div class="modal ${danger ? 'danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}d">
  <h2 id="${id}t">${title}</h2>
  <div id="${id}d">${warning ? `<p class="alert" role="alert">${warning}</p>` : ''}${html}</div>
  <div class="row end"><button type="button" class="primary" data-x>${cancelLabel}</button>
  <button type="button" class="${danger ? 'danger-solid' : ''}" data-ok>${confirmLabel}</button></div>
</div>`;
    const app = document.getElementById('app');
    document.body.append(wrap);
    app?.setAttribute('inert', ''); document.body.style.overflow = 'hidden';
    const done = (v) => {
      document.removeEventListener('keydown', onKey, true);
      wrap.remove(); app?.removeAttribute('inert'); document.body.style.overflow = '';
      opener?.isConnected && opener.focus?.();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Tab') {
        const f = [...wrap.querySelectorAll('button')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    wrap.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => done(false)));
    wrap.querySelector('[data-ok]').onclick = () => done(true);
    wrap.querySelector('[data-x]:not(.modal-scrim)').focus();
  });
}
