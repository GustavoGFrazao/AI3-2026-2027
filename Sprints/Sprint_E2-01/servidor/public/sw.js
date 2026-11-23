self.addEventListener('install', (evento) => {
    console.log('Service Worker instalado.');
});

self.addEventListener('activate', (evento) => {
    console.log('Service Worker ativado.');
});