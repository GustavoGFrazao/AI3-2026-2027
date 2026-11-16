const NOME_BD = 'sugestoes-bd';
const VERSAO_BD = 2;

let bdAberta = null;
let aberturaEmCurso = null;
let aoMudarVersao = null;

function abrirBD() {
    if (bdAberta) return Promise.resolve(bdAberta);
    if (aberturaEmCurso) return aberturaEmCurso;

    aberturaEmCurso = new Promise((resolve, reject) => {
        const pedido = indexedDB.open(NOME_BD, VERSAO_BD);

        pedido.onupgradeneeded = (evento) => {
            const bd = pedido.result;

            if (evento.oldVersion < 1) {
                const sugestoes = bd.createObjectStore(
                    'sugestoes',
                    { keyPath: 'id' }
                );

                sugestoes.createIndex(
                    'porEstado',
                    'estado',
                    { unique: false }
                );

                sugestoes.createIndex(
                    'porData',
                    'dataCriacao',
                    { unique: false }
                );

                bd.createObjectStore('pendentes', {
                    keyPath: 'idLocal',
                    autoIncrement: true
                });

                bd.createObjectStore('meta', {
                    keyPath: 'chave'
                });
            }

            if (evento.oldVersion < 2) {
                const pendentes = pedido.transaction
                    .objectStore('pendentes');

                pendentes.createIndex(
                    'porUtilizador',
                    'utilizador',
                    { unique: false }
                );

                const cursor = pendentes.openCursor();

                cursor.onsuccess = () => {
                    const registo = cursor.result;
                    if (!registo) return;

                    registo.update({
                        ...registo.value,
                        chave: registo.value.chave || crypto.randomUUID(),
                        tentativas: registo.value.tentativas ?? 0,
                        ultimaTentativa:
                            registo.value.ultimaTentativa ?? null
                    });

                    registo.continue();
                };
            }
        };

        pedido.onblocked = () => {
            console.warn(
                'sugestoes-bd: aguarda que outra ligação seja fechada.'
            );
        };

        pedido.onerror = () => {
            reject(
                pedido.error ||
                new Error('Não foi possível abrir a base de dados.')
            );
        };

        pedido.onsuccess = () => {
            bdAberta = pedido.result;

            bdAberta.onversionchange = () => {
                bdAberta.close();
                bdAberta = null;

                if (typeof aoMudarVersao === 'function') {
                    aoMudarVersao();
                }
            };

            bdAberta.onclose = () => {
                bdAberta = null;
            };

            resolve(bdAberta);
        };
    }).finally(() => {
        aberturaEmCurso = null;
    });

    return aberturaEmCurso;
}

// Resolve a Promise apenas quando a transação termina.
function transacionar(lojas, modo, executar) {
    return abrirBD().then(bd => new Promise((resolve, reject) => {
        const tx = bd.transaction(lojas, modo);
        let resultado;

        tx.oncomplete = () => resolve(resultado);

        tx.onerror = () => {
            reject(
                tx.error ||
                new Error('Erro na transação IndexedDB.')
            );
        };

        tx.onabort = () => {
            reject(
                tx.error ||
                new Error('Transação IndexedDB cancelada.')
            );
        };

        try {
            executar(tx, valor => {
                resultado = valor;
            });
        } catch (erro) {
            try {
                tx.abort();
            } catch (_) {
                // A transação pode já estar terminada.
            }

            reject(erro);
        }
    }));
}

const ORDEM_ESTADOS = [
    'submetida',
    'em_analise',
    'aceite',
    'rejeitada',
    'resolvida'
];

function substituirSugestoes(sugestoes) {
    return transacionar(
        ['sugestoes', 'meta'],
        'readwrite',
        tx => {
            const loja = tx.objectStore('sugestoes');

            loja.clear();

            for (const sugestao of sugestoes) {
                loja.put(sugestao);
            }

            tx.objectStore('meta').put({
                chave: 'ultimaAtualizacao',
                valor: new Date().toISOString()
            });
        }
    );
}

function lerSugestoes(ordenacao = 'recentes') {
    return transacionar(
        'sugestoes',
        'readonly',
        (tx, guardar) => {
            tx.objectStore('sugestoes')
                .getAll()
                .onsuccess = e => {
                const sugestoes = e.target.result || [];

                sugestoes.sort((a, b) => {
                    if (ordenacao === 'estado') {
                        const diferenca =
                            ORDEM_ESTADOS.indexOf(a.estado) -
                            ORDEM_ESTADOS.indexOf(b.estado);

                        if (diferenca) return diferenca;
                    }

                    return (
                        new Date(b.dataCriacao) -
                        new Date(a.dataCriacao)
                    );
                });

                guardar(sugestoes);
            };
        }
    );
}

// Cria uma pendente com UUID atribuído imediatamente.
function acrescentarPendente(dados, utilizador) {
    return transacionar(
        'pendentes',
        'readwrite',
        (tx, guardar) => {
            tx.objectStore('pendentes').add({
                utilizador: String(utilizador),
                titulo: dados.titulo,
                descricao: dados.descricao,
                categoria: dados.categoria,
                criadaEm: new Date().toISOString(),
                erro: null,
                chave: crypto.randomUUID(),
                tentativas: 0,
                ultimaTentativa: null
            }).onsuccess = e => {
                guardar(e.target.result);
            };
        }
    );
}

// Mantém o nome utilizado na API04.
function guardarPendente(dados, utilizador) {
    return acrescentarPendente(dados, utilizador);
}

function lerPendentes() {
    return transacionar(
        'pendentes',
        'readonly',
        (tx, guardar) => {
            tx.objectStore('pendentes')
                .getAll()
                .onsuccess = e => {
                guardar(e.target.result || []);
            };
        }
    );
}

// Lê as pendentes de um utilizador, sem erros.
function lerPendentesDe(utilizador) {
    return transacionar(
        'pendentes',
        'readonly',
        (tx, guardar) => {
            const encontrados = [];

            const pedido = tx.objectStore('pendentes')
                .index('porUtilizador')
                .openCursor(
                    IDBKeyRange.only(String(utilizador))
                );

            pedido.onsuccess = () => {
                const cursor = pedido.result;

                if (!cursor) return;

                if (!cursor.value.erro) {
                    encontrados.push(cursor.value);
                }

                cursor.continue();
            };

            guardar(encontrados);
        }
    );
}

function contarPendentes(utilizador) {
    return transacionar(
        'pendentes',
        'readonly',
        (tx, guardar) => {
            tx.objectStore('pendentes')
                .index('porUtilizador')
                .count(IDBKeyRange.only(String(utilizador)))
                .onsuccess = e => {
                guardar(e.target.result);
            };
        }
    );
}

// Incrementa o número de tentativas antes do envio.
function registarTentativa(idLocal) {
    return transacionar(
        'pendentes',
        'readwrite',
        tx => {
            const loja = tx.objectStore('pendentes');

            loja.get(idLocal).onsuccess = e => {
                const pendente = e.target.result;

                if (!pendente) return;

                pendente.tentativas =
                    (pendente.tentativas || 0) + 1;

                pendente.ultimaTentativa =
                    new Date().toISOString();

                loja.put(pendente);
            };
        }
    );
}

function removerPendente(idLocal) {
    return transacionar(
        'pendentes',
        'readwrite',
        tx => {
            tx.objectStore('pendentes').delete(idLocal);
        }
    );
}

function marcarErro(idLocal, mensagem) {
    return transacionar(
        'pendentes',
        'readwrite',
        tx => {
            const loja = tx.objectStore('pendentes');

            loja.get(idLocal).onsuccess = e => {
                const pendente = e.target.result;

                if (!pendente) return;

                pendente.erro = mensagem;
                loja.put(pendente);
            };
        }
    );
}

// Confirma o envio e remove a pendente na mesma transação.
function confirmarPendente(idLocal, sugestao) {
    return transacionar(
        ['pendentes', 'sugestoes'],
        'readwrite',
        tx => {
            tx.objectStore('pendentes').delete(idLocal);
            tx.objectStore('sugestoes').put(sugestao);
        }
    );
}

function guardarUtilizadorLocal(utilizador) {
    return transacionar(
        'meta',
        'readwrite',
        tx => {
            tx.objectStore('meta').put({
                chave: 'utilizador',
                valor: utilizador
            });
        }
    );
}

function lerUtilizadorLocal() {
    return transacionar(
        'meta',
        'readonly',
        (tx, guardar) => {
            tx.objectStore('meta')
                .get('utilizador')
                .onsuccess = e => {
                guardar(e.target.result?.valor ?? null);
            };
        }
    );
}

function limparUtilizadorLocal() {
    return transacionar(
        'meta',
        'readwrite',
        tx => {
            tx.objectStore('meta').delete('utilizador');
        }
    );
}

function guardarProprietario(sessao) {
    return transacionar(
        'meta',
        'readwrite',
        tx => {
            tx.objectStore('meta').put({
                chave: 'proprietario',
                utilizador: String(sessao.utilizador),
                nome: sessao.nome,
                papel: sessao.papel,
                expiracao: sessao.expiracao,
                atualizadoEm: new Date().toISOString()
            });
        }
    );
}

function lerProprietario() {
    return transacionar(
        'meta',
        'readonly',
        (tx, guardar) => {
            tx.objectStore('meta')
                .get('proprietario')
                .onsuccess = e => {
                guardar(e.target.result || null);
            };
        }
    );
}

function lerUltimaAtualizacao() {
    return transacionar(
        'meta',
        'readonly',
        (tx, guardar) => {
            tx.objectStore('meta')
                .get('ultimaAtualizacao')
                .onsuccess = e => {
                guardar(e.target.result?.valor || null);
            };
        }
    );
}

// Obtém a última versão sincronizada para o utilizador.
function lerCursor(utilizador) {
    return transacionar(
        'meta',
        'readonly',
        (tx, guardar) => {
            tx.objectStore('meta')
                .get(`cursor:${utilizador}`)
                .onsuccess = e => {
                guardar(e.target.result?.valor ?? 0);
            };
        }
    );
}

// Grava alterações e cursor numa única transação.
function aplicarAlteracoes(utilizador, alteracoes, cursor) {
    return transacionar(
        ['sugestoes', 'meta'],
        'readwrite',
        tx => {
            const loja = tx.objectStore('sugestoes');

            for (const sugestao of alteracoes) {
                if (
                    String(sugestao.numeroAluno) ===
                    String(utilizador)
                ) {
                    loja.put(sugestao);
                }
            }

            tx.objectStore('meta').put({
                chave: `cursor:${utilizador}`,
                valor: cursor
            });
        }
    );
}

// Limpa todas as lojas, incluindo os cursores.
function limparBD() {
    return transacionar(
        ['sugestoes', 'pendentes', 'meta'],
        'readwrite',
        tx => {
            tx.objectStore('sugestoes').clear();
            tx.objectStore('pendentes').clear();
            tx.objectStore('meta').clear();
        }
    );
}
