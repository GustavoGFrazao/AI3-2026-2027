// Módulo principal da PWA Reporta.

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registo = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker registado:', registo);
        } catch (erro) {
            console.error('Erro ao registar o Service Worker:', erro);
        }
    });
}