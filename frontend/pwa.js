/* =============================================================
   PWA: instalar na tela de início e funcionar com internet ruim.
   O service worker (sw.js) guarda a casca do app (HTML, CSS, JS e ícones)
   para abrir rápido mesmo offline. Os dados continuam vindo da API.
   ============================================================= */

let installPrompt = null;

function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  // file:// não aceita service worker (abrir o index.html direto no navegador).
  if(location.protocol === 'file:') return;
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{ /* sem cache offline */ });
  });
}

// O navegador avisa quando o app pode ser instalado; guardamos o convite para
// mostrar o botão "Instalar" no Perfil.
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  const row = document.getElementById('install-row');
  if(row) row.classList.remove('hidden');
});

window.addEventListener('appinstalled', ()=>{
  installPrompt = null;
  const row = document.getElementById('install-row');
  if(row) row.classList.add('hidden');
  showToast('Trifarmas instalado! Abra pelo ícone na sua tela de início.');
});

async function installApp(){
  if(!installPrompt){
    // iPhone/iPad não oferecem o convite automático.
    showModal(ICON_CHECK, 'Instalar o Trifarmas',
      `No <b>Android (Chrome)</b>: toque no menu ⋮ e escolha <b>Instalar aplicativo</b>.<br><br>
       No <b>iPhone (Safari)</b>: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.`);
    return;
  }
  installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if(choice.outcome !== 'accepted') showToast('Você pode instalar depois, aqui no Perfil.');
  installPrompt = null;
  const row = document.getElementById('install-row');
  if(row) row.classList.add('hidden');
}
