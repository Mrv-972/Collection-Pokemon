const STYLE_CONFIRMATION = `
  .confirmation{position:fixed;inset:0;z-index:75;display:flex;align-items:center;
                justify-content:center;padding:24px;background:rgba(10,11,13,0.72);
                opacity:0;transition:opacity .15s;}
  .confirmation.vue{opacity:1}
  .confirmation .boite{background:var(--ink,#15171B);border:1px solid rgba(var(--trait-rgb,237,234,224),0.14);
                       border-radius:10px;padding:22px 24px;max-width:420px;width:100%;
                       box-shadow:0 24px 60px rgba(0,0,0,0.55);
                       font-family:'IBM Plex Sans',sans-serif;}
  .confirmation h2{font-family:'Newsreader',serif;font-size:20px;font-weight:500;
                   color:var(--text-on-ink,#EDEAE0);margin:0 0 10px;}
  .confirmation p{font-size:13.5px;line-height:1.6;color:var(--text-on-ink-dim,#9B9E9C);margin:0}
  .confirmation p b{color:var(--text-on-ink,#EDEAE0);font-weight:600}
  .confirmation .boutons{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
  .confirmation button{font-family:inherit;font-size:13.5px;padding:9px 18px;border-radius:5px;
                       cursor:pointer;border:1px solid rgba(var(--trait-rgb,237,234,224),0.16);
                       background:transparent;color:var(--text-on-ink,#EDEAE0);transition:.12s;}
  .confirmation button:hover{background:rgba(var(--trait-rgb,237,234,224),0.07)}
  .confirmation button.principal{background:var(--gold,#C9A227);border-color:transparent;
                                 color:var(--ink,#15171B);font-weight:600;}
  .confirmation button.principal:hover{filter:brightness(1.1);background:var(--gold,#C9A227)}
  .confirmation button.principal:disabled{opacity:.4;cursor:default;filter:none}
  .confirmation button.principal.danger{background:#C0392B;color:#fff}
  .confirmation button.principal.danger:hover{background:#D0463A}
  .confirmation .recopie{display:block;font-size:13px;line-height:1.5;margin:16px 0 7px;
                         color:var(--text-on-ink-dim,#9B9E9C);}
  .confirmation .recopie b{color:var(--text-on-ink,#EDEAE0);font-weight:600;
                           font-family:'IBM Plex Mono',monospace;letter-spacing:.5px;}
  .confirmation input{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;
                      padding:10px 12px;border-radius:5px;background:rgba(var(--trait-rgb,237,234,224),0.05);
                      border:1px solid rgba(var(--trait-rgb,237,234,224),0.16);color:var(--text-on-ink,#EDEAE0);}
  @media(max-width:520px){
    .confirmation .boutons{flex-direction:column-reverse}
    .confirmation button{width:100%;min-height:44px}
  }
  @media(prefers-reduced-motion:reduce){ .confirmation{transition:none} }
`;

function poserStyleConfirmation(){
  if(document.getElementById('style-confirmation')) return;
  const style = document.createElement('style');
  style.id = 'style-confirmation';
  style.textContent = STYLE_CONFIRMATION;
  document.head.appendChild(style);
}

function demanderConfirmation({ titre, message, action, saisieAttendue = null, danger = false }){
  return new Promise(resolve => {
    poserStyleConfirmation();

    const voile = document.createElement('div');
    voile.className = 'confirmation';
    voile.setAttribute('role', 'dialog');
    voile.setAttribute('aria-modal', 'true');
    voile.innerHTML = `
      <div class="boite">
        <h2>${titre}</h2>
        <p>${message}</p>
        ${saisieAttendue ? `
          <label class="recopie" for="confirmation-saisie">
            Pour confirmer, recopie <b>${saisieAttendue}</b> ci-dessous.
          </label>
          <input id="confirmation-saisie" type="text" autocomplete="off" spellcheck="false">` : ''}
        <div class="boutons">
          <button class="annuler" type="button">Annuler</button>
          <button class="principal${danger ? ' danger' : ''}" type="button"
                  ${saisieAttendue ? 'disabled' : ''}>${action}</button>
        </div>
      </div>`;

    const rendreLaMain = document.activeElement;
    function fermer(reponse){
      document.removeEventListener('keydown', auClavier);
      voile.classList.remove('vue');
      setTimeout(() => voile.remove(), 160);
      if(rendreLaMain?.focus) rendreLaMain.focus();
      resolve(reponse);
    }
    function auClavier(e){
      if(e.key === 'Escape'){ e.preventDefault(); fermer(false); }
      if(e.key === 'Enter' && !e.target.classList?.contains('annuler') && !principal.disabled) fermer(true);
    }

    const principal = voile.querySelector('.principal');
    const saisie = voile.querySelector('#confirmation-saisie');
    if(saisie){
      saisie.addEventListener('input', () => {
        principal.disabled = saisie.value.trim() !== saisieAttendue;
      });
    }

    voile.querySelector('.annuler').addEventListener('click', () => fermer(false));
    principal.addEventListener('click', () => { if(!principal.disabled) fermer(true); });
    voile.addEventListener('click', e => { if(e.target === voile) fermer(false); });
    document.addEventListener('keydown', auClavier);

    const modales = document.querySelectorAll('dialog[open]');
    (modales[modales.length - 1] ?? document.body).appendChild(voile);
    requestAnimationFrame(() => {
      voile.classList.add('vue');
      (saisie ?? principal).focus();
    });
  });
}

