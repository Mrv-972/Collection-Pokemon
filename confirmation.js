// Fenêtre de confirmation, partagée par tout ce qui est difficile à défaire.
//
// Une fenêtre à nous plutôt que celle du navigateur : celle-ci se traduit,
// se met aux couleurs du site, et certains navigateurs bloquent l'autre.
//
// Sortie de tags.js le jour où la suppression de compte en a eu besoin :
// c'est le même geste — annoncer ce qui va se passer avant que ça arrive.

const STYLE_CONFIRMATION = `
  .confirmation{position:fixed;inset:0;z-index:75;display:flex;align-items:center;
                justify-content:center;padding:24px;background:rgba(10,11,13,0.72);
                opacity:0;transition:opacity .15s;}
  .confirmation.vue{opacity:1}
  .confirmation .boite{background:#15171B;border:1px solid rgba(237,234,224,0.14);
                       border-radius:10px;padding:22px 24px;max-width:420px;width:100%;
                       box-shadow:0 24px 60px rgba(0,0,0,0.55);
                       font-family:'IBM Plex Sans',sans-serif;}
  .confirmation h2{font-family:'Newsreader',serif;font-size:20px;font-weight:500;
                   color:var(--text-on-ink,#EDEAE0);margin:0 0 10px;}
  .confirmation p{font-size:13.5px;line-height:1.6;color:var(--text-on-ink-dim,#9B9E9C);margin:0}
  .confirmation p b{color:var(--text-on-ink,#EDEAE0);font-weight:600}
  .confirmation .boutons{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
  .confirmation button{font-family:inherit;font-size:13.5px;padding:9px 18px;border-radius:5px;
                       cursor:pointer;border:1px solid rgba(237,234,224,0.16);
                       background:transparent;color:var(--text-on-ink,#EDEAE0);transition:.12s;}
  .confirmation button:hover{background:rgba(237,234,224,0.07)}
  .confirmation button.principal{background:var(--gold,#C9A227);border-color:transparent;
                                 color:var(--ink,#15171B);font-weight:600;}
  .confirmation button.principal:hover{filter:brightness(1.1);background:var(--gold,#C9A227)}
  .confirmation button.principal:disabled{opacity:.4;cursor:default;filter:none}
  /* Rouge pour ce qui détruit : la couleur dit ce que le texte annonce. */
  .confirmation button.principal.danger{background:#C0392B;color:#fff}
  .confirmation button.principal.danger:hover{background:#D0463A}
  .confirmation .recopie{display:block;font-size:13px;line-height:1.5;margin:16px 0 7px;
                         color:var(--text-on-ink-dim,#9B9E9C);}
  .confirmation .recopie b{color:var(--text-on-ink,#EDEAE0);font-weight:600;
                           font-family:'IBM Plex Mono',monospace;letter-spacing:.5px;}
  .confirmation input{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;
                      padding:10px 12px;border-radius:5px;background:rgba(237,234,224,0.05);
                      border:1px solid rgba(237,234,224,0.16);color:var(--text-on-ink,#EDEAE0);}
  @media(max-width:520px){
    .confirmation .boutons{flex-direction:column-reverse}
    .confirmation button{width:100%;min-height:44px}
  }
  @media(prefers-reduced-motion:reduce){ .confirmation{transition:none} }
`;

// « saisieAttendue » ajoute un champ où il faut recopier un mot avant que le
// bouton s'active. Réservé à ce qui ne se défait pas : on ne supprime pas un
// compte par un clic de trop.
function demanderConfirmation({ titre, message, action, saisieAttendue = null, danger = false }){
  return new Promise(resolve => {
    if(!document.getElementById('style-confirmation')){
      const style = document.createElement('style');
      style.id = 'style-confirmation';
      style.textContent = STYLE_CONFIRMATION;
      document.head.appendChild(style);
    }

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
      // Le focus revient au bouton d'où l'on vient : sans cela, il repartait
      // en haut de page et la navigation au clavier perdait le fil.
      if(rendreLaMain?.focus) rendreLaMain.focus();
      resolve(reponse);
    }
    function auClavier(e){
      if(e.key === 'Escape') fermer(false);
      // Entrée confirme : le bouton principal a le focus, mais on couvre
      // aussi le cas où il l'aurait perdu.
      if(e.key === 'Enter' && !e.target.classList?.contains('annuler') && !principal.disabled) fermer(true);
    }

    const principal = voile.querySelector('.principal');
    const saisie = voile.querySelector('#confirmation-saisie');
    if(saisie){
      // Le bouton reste éteint tant que le mot n'est pas recopié exactement.
      saisie.addEventListener('input', () => {
        principal.disabled = saisie.value.trim() !== saisieAttendue;
      });
    }

    voile.querySelector('.annuler').addEventListener('click', () => fermer(false));
    principal.addEventListener('click', () => { if(!principal.disabled) fermer(true); });
    // Cliquer à côté vaut annulation : c'est le geste de qui se ravise.
    voile.addEventListener('click', e => { if(e.target === voile) fermer(false); });
    document.addEventListener('keydown', auClavier);

    document.body.appendChild(voile);
    requestAnimationFrame(() => {
      voile.classList.add('vue');
      (saisie ?? principal).focus();
    });
  });
}

