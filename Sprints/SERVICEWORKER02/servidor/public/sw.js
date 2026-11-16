
const CACHE_INTERFACE = 'interface-v3';
const CACHE_DADOS_PUBLICOS = 'dados-publicos';

const FICHEIROS_INTERFACE = [
    './',
    './index.html',
    './estilos.css',
    './app.js',
    './configuracoes.js',
    './bd.js',
    './sincronizacao.js'
];

// Carrega a IndexedDB e a lógica de sincronização.
// Estes ficheiros são scripts clássicos, não módulos ES.
importScripts('/bd.js', '/sincronizacao.js');

// Impede duas sincronizações simultâneas neste Service Worker.
let emCurso = null;

async function notificarPaginas(mensagem) {
    const paginas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    });

    for (const pagina of paginas) {
        pagina.postMessage(mensagem);
    }
}

function sincronizar() {
    if (emCurso) {
        return emCurso;
    }

    emCurso = (async () => {
        try {
            const resultado = await executarSincronizacao();

            if (resultado) {
                await notificarPaginas(resultado);
            }

            return resultado;
        } catch (erro) {
            const tipo = erro?.tipo === 'erro-servidor'
                ? 'erro-servidor'
                : 'sem-rede';

            await notificarPaginas({
                tipo,
                mensagem: erro?.message ||
                    'Não foi possível sincronizar.'
            });

            // A rejeição permite ao Background Sync tentar novamente.
            throw erro;
        }
    })();

    emCurso.finally(() => {
        emCurso = null;
    }).catch(() => {});

    return emCurso;
}

// Instalação do Service Worker.
self.addEventListener('install', evento => {
    evento.waitUntil(
        caches.open(CACHE_INTERFACE).then(cache => {
            return cache.addAll(FICHEIROS_INTERFACE);
        })
    );
});

// Ativação: eliminar caches antigas e assumir o controlo.
self.addEventListener('activate', evento => {
    evento.waitUntil(
        (async () => {
            const nomes = await caches.keys();

            await Promise.all(
                nomes
                    .filter(nome =>
                        nome !== CACHE_INTERFACE &&
                        nome !== CACHE_DADOS_PUBLICOS
                    )
                    .map(nome => caches.delete(nome))
            );

            await self.clients.claim();
        })()
    );
});

// Background Sync: executado quando o browser permite.
self.addEventListener('sync', evento => {
    if (evento.tag !== 'sincronizar-sugestoes') {
        return;
    }

    evento.waitUntil(sincronizar());
});

// Mensagens enviadas pela página.
self.addEventListener('message', evento => {
    const tipo = evento.data?.tipo;

    if (tipo === 'ativar') {
        evento.waitUntil(self.skipWaiting());
        return;
    }

    if (tipo === 'sincronizar') {
        evento.waitUntil(sincronizar());
    }
});

// Interceção dos pedidos HTTP.
self.addEventListener('fetch', evento => {
    const pedido = evento.request;
    const url = new URL(pedido.url);

    // Não interferir com pedidos a outros domínios.
    if (url.origin !== self.location.origin) {
        return;
    }

    // Categorias públicas: cache com atualização em segundo plano.
    if (
        pedido.method === 'GET' &&
        url.pathname === '/v2/categorias'
    ) {
        evento.respondWith(obterCategorias(pedido, evento));
        return;
    }

    // Dados privados e restantes endpoints da API:
    // nunca guardar respostas na Cache API.
    if (url.pathname.startsWith('/v2/')) {
        return;
    }

    // Apenas pedidos GET podem utilizar a cache da interface.
    if (pedido.method !== 'GET') {
        return;
    }

    evento.respondWith(
        (async () => {
            const respostaCache = await caches.match(pedido);

            if (respostaCache) {
                return respostaCache;
            }

            return fetch(pedido);
        })()
    );
});

// Categorias públicas: stale-while-revalidate.
async function obterCategorias(pedido, evento) {
    const cache = await caches.open(CACHE_DADOS_PUBLICOS);

    const copia = await cache.match(pedido);

    const atualizacao = (async () => {
        const resposta = await fetch(pedido);

        if (resposta.ok) {
            await cache.put(pedido, resposta.clone());
        }

        return resposta;
    })();

    // Permite atualizar a cache mesmo depois de responder à página.
    evento.waitUntil(atualizacao.then(
        () => {},
        () => {}
    ));

    if (copia) {
        return copia;
    }

    return atualizacao;
}