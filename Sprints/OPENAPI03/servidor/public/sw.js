const CACHE_INTERFACE = 'interface-v1';

const FICHEIROS_INTERFACE = [
    './',
    './index.html',
    './estilos.css',
    './app.js',
    './configuracoes.js',
    './bd.js',
    './pendentes.js'
];

// Instalação do Service Worker
self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches.open(CACHE_INTERFACE).then((cache) => {
            return cache.addAll(FICHEIROS_INTERFACE);
        })
    );
});

// Ativação do Service Worker
self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches.keys().then((nomesCaches) => {
            return Promise.all(
                nomesCaches.map((nomeCache) => {
                    if (
                        nomeCache !== CACHE_INTERFACE &&
                        nomeCache !== 'dados-publicos'
                    ) {
                        return caches.delete(nomeCache);
                    }
                })
            );
        })
    );

    self.clients.claim();
});

// Interceção dos pedidos
self.addEventListener('fetch', (evento) => {
    const pedido = evento.request;
    const url = new URL(pedido.url);

    // Só tratamos pedidos do mesmo domínio
    if (url.origin !== self.location.origin) {
        return;
    }

    // Categorias públicas: rede com cache de apoio
    if (
        pedido.method === 'GET' &&
        url.pathname === '/v2/categorias'
    ) {
        evento.respondWith(
            obterCategorias(pedido, evento)
        );

        return;
    }

    // Restantes pedidos da API: apenas rede
    if (url.pathname.startsWith('/v2/')) {
        return;
    }

    // Pedidos que não sejam GET:
    // nunca guardar na Cache API
    if (pedido.method !== 'GET') {
        return;
    }

    // Ficheiros da interface: cache primeiro
    evento.respondWith(
        caches.match(pedido).then((respostaCache) => {
            if (respostaCache) {
                return respostaCache;
            }

            return fetch(pedido);
        })
    );
});


const CACHE_DADOS_PUBLICOS = 'dados-publicos';

async function obterCategorias(pedido, evento) {
    const cache = await caches.open(CACHE_DADOS_PUBLICOS);

    try {
        const resposta = await fetch(pedido);

        if (resposta.ok) {
            evento.waitUntil(
                cache.put(pedido, resposta.clone())
            );
        }

        return resposta;
    } catch (erro) {
        const respostaCache = await cache.match(pedido);

        if (respostaCache) {
            return respostaCache;
        }

        throw erro;
    }
}