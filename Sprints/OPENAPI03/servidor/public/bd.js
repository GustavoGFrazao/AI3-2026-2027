const NOME_BD = 'sugestoes-bd';
const VERSAO_BD = 1;

let bdAberta = null;

function abrirBD() {
    return new Promise((resolve, reject) => {
        if (bdAberta) {
            resolve(bdAberta);
            return;
        }

        const pedido = indexedDB.open(NOME_BD, VERSAO_BD);

        pedido.onupgradeneeded = (evento) => {
            const bd = evento.target.result;

            if (!bd.objectStoreNames.contains('sugestoes')) {
                const storeSugestoes = bd.createObjectStore(
                    'sugestoes',
                    { keyPath: 'id' }
                );

                storeSugestoes.createIndex(
                    'porEstado',
                    'estado',
                    { unique: false }
                );

                storeSugestoes.createIndex(
                    'porData',
                    'dataCriacao',
                    { unique: false }
                );
            }

            if (!bd.objectStoreNames.contains('pendentes')) {
                bd.createObjectStore(
                    'pendentes',
                    {
                        keyPath: 'idLocal',
                        autoIncrement: true
                    }
                );
            }

            if (!bd.objectStoreNames.contains('meta')) {
                bd.createObjectStore(
                    'meta',
                    { keyPath: 'chave' }
                );
            }
        };

        pedido.onsuccess = () => {
            bdAberta = pedido.result;

            bdAberta.onclose = () => {
                bdAberta = null;
            };

            resolve(bdAberta);
        };

        pedido.onerror = () => {
            reject(
                pedido.error ||
                new Error('Não foi possível abrir a base de dados.')
            );
        };

        pedido.onblocked = () => {
            reject(
                new Error('A abertura da base de dados está bloqueada.')
            );
        };
    });
}

function substituirSugestoes(sugestoes) {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                ['sugestoes', 'meta'],
                'readwrite'
            );

            const storeSugestoes = transacao.objectStore('sugestoes');
            const storeMeta = transacao.objectStore('meta');

            storeSugestoes.clear();

            for (const sugestao of sugestoes) {
                storeSugestoes.put(sugestao);
            }

            storeMeta.put({
                chave: 'ultimaAtualizacao',
                valor: new Date().toISOString()
            });

            transacao.oncomplete = () => {
                resolve();
            };

            transacao.onerror = () => {
                reject(
                    transacao.error ||
                    new Error('Não foi possível guardar as sugestões.')
                );
            };

            transacao.onabort = () => {
                reject(
                    transacao.error ||
                    new Error('A operação foi cancelada.')
                );
            };
        });
    });
}

const ORDEM_ESTADOS = [
    'submetida',
    'em_analise',
    'aceite',
    'rejeitada',
    'resolvida'
];

function lerSugestoes(ordenacao = 'recentes') {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                'sugestoes',
                'readonly'
            );

            const store = transacao.objectStore('sugestoes');
            const pedido = store.getAll();

            pedido.onsuccess = () => {
                const sugestoes = pedido.result || [];

                if (ordenacao === 'estado') {
                    sugestoes.sort((a, b) => {
                        const estadoA = ORDEM_ESTADOS.indexOf(a.estado);
                        const estadoB = ORDEM_ESTADOS.indexOf(b.estado);

                        if (estadoA !== estadoB) {
                            return estadoA - estadoB;
                        }

                        return (
                            new Date(b.dataCriacao) -
                            new Date(a.dataCriacao)
                        );
                    });
                } else {
                    sugestoes.sort((a, b) => {
                        return (
                            new Date(b.dataCriacao) -
                            new Date(a.dataCriacao)
                        );
                    });
                }

                resolve(sugestoes);
            };

            pedido.onerror = () => {
                reject(
                    pedido.error ||
                    new Error('Não foi possível ler as sugestões.')
                );
            };
        });
    });
}

function guardarPendente(dados, utilizador) {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                'pendentes',
                'readwrite'
            );

            const store = transacao.objectStore('pendentes');

            const pendente = {
                utilizador: utilizador,
                titulo: dados.titulo,
                descricao: dados.descricao,
                categoria: dados.categoria,
                criadaEm: new Date().toISOString(),
                erro: null
            };

            const pedido = store.add(pendente);
            let idLocal;

            pedido.onsuccess = () => {
                idLocal = pedido.result;
            };

            transacao.oncomplete = () => {
                resolve(idLocal);
            };

            transacao.onerror = () => {
                reject(
                    transacao.error ||
                    new Error('Não foi possível guardar a sugestão pendente.')
                );
            };

            transacao.onabort = () => {
                reject(
                    transacao.error ||
                    new Error('A operação foi cancelada.')
                );
            };
        });
    });
}

function lerPendentes() {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                'pendentes',
                'readonly'
            );

            const store = transacao.objectStore('pendentes');
            const pedido = store.getAll();

            pedido.onsuccess = () => {
                resolve(pedido.result || []);
            };

            pedido.onerror = () => {
                reject(
                    pedido.error ||
                    new Error('Não foi possível ler as sugestões pendentes.')
                );
            };
        });
    });
}

function removerPendente(idLocal) {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                'pendentes',
                'readwrite'
            );

            const store = transacao.objectStore('pendentes');
            const pedido = store.delete(idLocal);

            pedido.onsuccess = () => {
                resolve();
            };

            pedido.onerror = () => {
                reject(
                    pedido.error ||
                    new Error('Não foi possível remover a sugestão pendente.')
                );
            };
        });
    });
}

function guardarUtilizadorLocal(utilizador) {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                'meta',
                'readwrite'
            );

            const store = transacao.objectStore('meta');

            store.put({
                chave: 'utilizador',
                valor: utilizador
            });

            transacao.oncomplete = () => {
                resolve();
            };

            transacao.onerror = () => {
                reject(
                    transacao.error ||
                    new Error('Não foi possível guardar o utilizador local.')
                );
            };
        });
    });
}

function lerUtilizadorLocal() {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                'meta',
                'readonly'
            );

            const store = transacao.objectStore('meta');
            const pedido = store.get('utilizador');

            pedido.onsuccess = () => {
                resolve(pedido.result?.valor ?? null);
            };

            pedido.onerror = () => {
                reject(
                    pedido.error ||
                    new Error('Não foi possível ler o utilizador local.')
                );
            };
        });
    });
}

function limparUtilizadorLocal() {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                'meta',
                'readwrite'
            );

            const store = transacao.objectStore('meta');
            const pedido = store.delete('utilizador');

            pedido.onsuccess = () => {
                resolve();
            };

            pedido.onerror = () => {
                reject(
                    pedido.error ||
                    new Error('Não foi possível remover o utilizador local.')
                );
            };
        });
    });
}

function marcarErro(idLocal, mensagem) {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                'pendentes',
                'readwrite'
            );

            const store = transacao.objectStore('pendentes');
            const pedido = store.get(idLocal);

            pedido.onsuccess = () => {
                const pendente = pedido.result;

                if (!pendente) {
                    return;
                }

                pendente.erro = mensagem;

                store.put(pendente);
            };

            transacao.oncomplete = () => {
                resolve();
            };

            transacao.onerror = () => {
                reject(
                    transacao.error ||
                    new Error('Não foi possível guardar o erro.')
                );
            };

            transacao.onabort = () => {
                reject(
                    transacao.error ||
                    new Error('A operação foi cancelada.')
                );
            };
        });
    });
}

function confirmarPendente(idLocal, sugestao) {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                ['pendentes', 'sugestoes'],
                'readwrite'
            );

            const pendentes = transacao.objectStore('pendentes');
            const sugestoes = transacao.objectStore('sugestoes');

            pendentes.delete(idLocal);
            sugestoes.put(sugestao);

            transacao.oncomplete = () => resolve();

            transacao.onerror = () => {
                reject(
                    transacao.error ||
                    new Error('Não foi possível confirmar a sugestão.')
                );
            };

            transacao.onabort = () => {
                reject(
                    transacao.error ||
                    new Error('A operação foi cancelada.')
                );
            };
        });
    });
}

function guardarProprietario(sessao) {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction('meta', 'readwrite');
            const store = transacao.objectStore('meta');

            store.put({
                chave: 'proprietario',
                utilizador: sessao.utilizador,
                nome: sessao.nome,
                papel: sessao.papel,
                expiracao: sessao.expiracao,
                atualizadoEm: new Date().toISOString()
            });

            transacao.oncomplete = () => resolve();

            transacao.onerror = () => {
                reject(
                    transacao.error ||
                    new Error('Não foi possível guardar o proprietário.')
                );
            };

            transacao.onabort = () => {
                reject(
                    transacao.error ||
                    new Error('A operação foi cancelada.')
                );
            };
        });
    });
}

function lerProprietario() {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction('meta', 'readonly');
            const store = transacao.objectStore('meta');
            const pedido = store.get('proprietario');

            pedido.onsuccess = () => resolve(pedido.result || null);

            pedido.onerror = () => {
                reject(
                    pedido.error ||
                    new Error('Não foi possível ler o proprietário.')
                );
            };
        });
    });
}

function limparBD() {
    return abrirBD().then((bd) => {
        return new Promise((resolve, reject) => {
            const transacao = bd.transaction(
                ['sugestoes', 'pendentes', 'meta'],
                'readwrite'
            );

            transacao.objectStore('sugestoes').clear();
            transacao.objectStore('pendentes').clear();
            transacao.objectStore('meta').clear();

            transacao.oncomplete = () => resolve();

            transacao.onerror = () => {
                reject(
                    transacao.error ||
                    new Error('Não foi possível limpar a base de dados.')
                );
            };

            transacao.onabort = () => {
                reject(
                    transacao.error ||
                    new Error('A operação foi cancelada.')
                );
            };
        });
    });
}

export {
    abrirBD,
    substituirSugestoes,
    lerSugestoes,
    guardarPendente,
    lerPendentes,
    removerPendente,
    guardarUtilizadorLocal,
    lerUtilizadorLocal,
    limparUtilizadorLocal,
    marcarErro,
    confirmarPendente,
    guardarProprietario,
    lerProprietario,
    limparBD
};