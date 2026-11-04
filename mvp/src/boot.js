document.addEventListener('DOMContentLoaded', () => { try { HH.boot(); } catch (e) { console.error(e); document.getElementById('app').innerHTML = '<div class="container section"><p>Error al iniciar: ' + (e && e.message) + '</p></div>'; } });
if (document.readyState !== 'loading') { try { HH.boot(); } catch (e) { console.error(e); } }
