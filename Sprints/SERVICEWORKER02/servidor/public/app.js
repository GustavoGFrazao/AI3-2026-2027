
import {
    lerConfiguracoes,
    guardarConfiguracoes
} from './configuracoes.js';

// As funções de bd.js são globais porque o ficheiro também
// é carregado pelo service worker através de importScripts().

const $ = id => document.getElementById(id);

const elementoMensagem = $('mensagem');
const estadoLigacao = $('estadoLigacao');
const zonaAtualizacao = $('zonaAtualizacao');
const botaoAtualizar = $('botaoAtualizar');
const zonaLogin = $('zonaLogin');
const zonaSessao = $('zonaSessao');
const formLogin = $('formLogin');
const botaoLogin = $('botaoLogin');
const formSugestao = $('formSugestao');
const nomeUtilizador = $('nomeUtilizador');
const papelUtilizador = $('papelUtilizador');
const contador = $('contador');
const botaoSugestoes = $('botaoSugestoes');
const botaoLogout = $('botaoLogout');
const zonaNovaSugestao = $('zonaNovaSugestao');
const estadoLista = $('estadoLista');
const listaSugestoes = $('listaSugestoes');
const estadoPendentes = $('estadoPendentes');
const listaPendentes = $('listaPendentes');
const campoTema = $('tema');
const campoOrdenacao = $('ordenacao');
const campoTitulo = $('tituloSugestao');
const campoDescricao = $('descricaoSugestao');
const campoCategoria = $('categoriaSugestao');
const dialogLogout = $('dialogLogout');
const confirmarLogout = $('confirmarLogout');
const cancelarLogout = $('cancelarLogout');

let sessaoAtual = null;
let temporizador = null;
let sincronizacaoSolicitada = false;
let temporizadorRetry = null;
let numeroRetry = 0;
let paginaRecarregada = false;

const ESTADOS = [
    'submetida',
    'em_analise',
    'aceite',
    'rejeitada',
    'resolvida'
];

const NOMES_ESTADOS = {
    submetida: 'Submetida',
    em_analise: 'Em análise',
    aceite: 'Aceite',
    rejeitada: 'Rejeitada',
    resolvida: 'Resolvida'
};

function mostrarMensagem(texto, tipo = '') {
    elementoMensagem.textContent = texto;
    elementoMensagem.className = 'mensagem';

    if (tipo) elementoMensagem.classList.add(tipo);

    elementoMensagem.hidden = false;
}

function esconderMensagem() {
    elementoMensagem.hidden = true;
    elementoMensagem.textContent = '';
    elementoMensagem.className = 'mensagem';
}

function mudarEstado(estado) {
    document.body.dataset.estado = estado;

    estadoLigacao.textContent = {
        'a-verificar': 'A verificar sessão…',
        'sem-sessao': 'Sem sessão iniciada.',
        'com-sessao': 'Sessão iniciada.',
        'sem-ligacao': 'Sem ligação ao servidor.'
    }[estado] || '';

    zonaLogin.hidden = estado !== 'sem-sessao';
    zonaSessao.hidden = estado !== 'com-sessao';

    zonaNovaSugestao.hidden =
        estado !== 'com-sessao' ||
        sessaoAtual?.papel !== 'aluno';

    botaoLogout.disabled = estado === 'sem-ligacao';
}

function aplicarConfiguracoes(configuracoes) {
    document.documentElement.dataset.tema = configuracoes.tema;
    campoTema.value = configuracoes.tema;
    campoOrdenacao.value = configuracoes.ordenacao;
}

function iniciarConfiguracoes() {
    aplicarConfiguracoes(lerConfiguracoes());

    campoTema.addEventListener('change', () => {
        const configuracoes = {
            ...lerConfiguracoes(),
            tema: campoTema.value
        };

        guardarConfiguracoes(configuracoes);
        aplicarConfiguracoes(configuracoes);
    });

    campoOrdenacao.addEventListener('change', async () => {
        const configuracoes = {
            ...lerConfiguracoes(),
            ordenacao: campoOrdenacao.value
        };

        guardarConfiguracoes(configuracoes);
        aplicarConfiguracoes(configuracoes);

        if (sessaoAtual) await apresentarCopiaLocal();
    });
}

function guardarRascunho() {
    sessionStorage.setItem(
        'rascunhoSugestao',
        JSON.stringify({
            titulo: campoTitulo.value,
            descricao: campoDescricao.value,
            categoria: campoCategoria.value
        })
    );
}

function limparRascunho() {
    sessionStorage.removeItem('rascunhoSugestao');
    formSugestao.reset();
}

function recuperarRascunho() {
    try {
        const texto = sessionStorage.getItem('rascunhoSugestao');
        if (!texto) return;

        const dados = JSON.parse(texto);

        campoTitulo.value = dados.titulo ?? '';
        campoDescricao.value = dados.descricao ?? '';
        campoCategoria.value = dados.categoria ?? '';
    } catch {
        limparRascunho();
    }
}

async function carregarCategorias() {
    campoCategoria.disabled = true;

    try {
        const resposta = await fetch('/v2/categorias');

        if (!resposta.ok) throw new Error('Categorias indisponíveis.');

        const resultado = await resposta.json();
        const categorias = Array.isArray(resultado)
            ? resultado
            : resultado.itens || [];

        campoCategoria.replaceChildren();

        const inicial = document.createElement('option');
        inicial.value = '';
        inicial.textContent = 'Seleciona uma categoria';
        campoCategoria.appendChild(inicial);

        for (const categoria of categorias) {
            const opcao = document.createElement('option');
            opcao.value = categoria.codigo;
            opcao.textContent = categoria.descricao;
            campoCategoria.appendChild(opcao);
        }

        campoCategoria.disabled = categorias.length === 0;

        if (categorias.length === 0) {
            mostrarMensagem(
                'Não existem categorias disponíveis.',
                'erro'
            );
        }
    } catch {
        campoCategoria.replaceChildren();

        const opcao = document.createElement('option');
        opcao.value = '';
        opcao.textContent = 'Categorias indisponíveis';
        campoCategoria.appendChild(opcao);

        campoCategoria.disabled = true;
    }
}

function mostrarLogin() {
    sessaoAtual = null;

    if (temporizador) clearInterval(temporizador);
    temporizador = null;

    if (temporizadorRetry) clearTimeout(temporizadorRetry);
    temporizadorRetry = null;
    numeroRetry = 0;

    contador.textContent = '--:--';
    mudarEstado('sem-sessao');
}

function iniciarContador(expiracao) {
    if (temporizador) clearInterval(temporizador);

    function atualizar() {
        const segundos = Math.max(
            0,
            Math.floor(
                (new Date(expiracao).getTime() - Date.now()) / 1000
            )
        );

        if (segundos <= 0) {
            mostrarLogin();
            mostrarMensagem(
                'A sessão expirou. Inicia sessão novamente.',
                'erro'
            );
            return;
        }

        contador.textContent =
            `${String(Math.floor(segundos / 60)).padStart(2, '0')}:` +
            `${String(segundos % 60).padStart(2, '0')}`;
    }

    atualizar();
    temporizador = setInterval(atualizar, 1000);
}

async function mostrarSessao(sessao) {
    sessaoAtual = sessao;

    nomeUtilizador.textContent = sessao.nome;
    papelUtilizador.textContent = sessao.papel;

    mudarEstado('com-sessao');
    iniciarContador(sessao.expiracao);

    if (sessao.papel === 'aluno') {
        recuperarRascunho();
    } else {
        limparRascunho();
    }

    await apresentarCopiaLocal();
    await mostrarPendentes();
    await pedirSync();
}

async function prepararProprietario(sessao) {
    const anterior = await lerProprietario();

    if (
        anterior &&
        String(anterior.utilizador) !== String(sessao.utilizador)
    ) {
        await limparBD();
    }

    await guardarProprietario(sessao);
}

async function verificarSessao() {
    mudarEstado('a-verificar');

    try {
        const resposta = await fetch('/v2/sessao', {
            credentials: 'same-origin'
        });

        if (resposta.status === 401) {
            mostrarLogin();
            return;
        }

        if (!resposta.ok) {
            throw new Error('Não foi possível verificar a sessão.');
        }

        const sessao = await resposta.json();

        await prepararProprietario(sessao);
        await mostrarSessao(sessao);
    } catch (erro) {
        console.error(erro);

        // Se não houver rede, preservamos a cópia local.
        const proprietario = await lerProprietario().catch(() => null);

        if (
            proprietario &&
            new Date(proprietario.expiracao).getTime() > Date.now()
        ) {
            sessaoAtual = proprietario;
            mudarEstado('com-sessao');
            iniciarContador(proprietario.expiracao);
            await apresentarCopiaLocal();
            await mostrarPendentes();
        } else {
            sessaoAtual = null;
            mudarEstado('sem-ligacao');
        }

        mostrarMensagem(
            'Sem ligação ao servidor. Os dados locais podem estar desatualizados.',
            'erro'
        );
    }
}

function ordenarSugestoes(sugestoes) {
    const resultado = [...sugestoes];

    if (lerConfiguracoes().ordenacao === 'estado') {
        resultado.sort((a, b) => {
            const diferenca =
                ESTADOS.indexOf(a.estado) -
                ESTADOS.indexOf(b.estado);

            if (diferenca) return diferenca;

            return new Date(b.dataCriacao) -
                new Date(a.dataCriacao);
        });
    } else {
        resultado.sort(
            (a, b) =>
                new Date(b.dataCriacao) -
                new Date(a.dataCriacao)
        );
    }

    return resultado;
}

function apresentarSugestoes(sugestoes) {
    listaSugestoes.replaceChildren();

    if (sugestoes.length === 0) {
        estadoLista.textContent =
            'Não existem sugestões para apresentar.';
        return;
    }

    for (const sugestao of ordenarSugestoes(sugestoes)) {
        const artigo = document.createElement('article');
        artigo.className = 'sugestao';

        const titulo = document.createElement('h3');
        titulo.textContent = sugestao.titulo;

        const descricao = document.createElement('p');
        descricao.textContent = sugestao.descricao;

        const categoria = document.createElement('p');
        categoria.textContent =
            `Categoria: ${sugestao.categoria}`;

        const estado = document.createElement('span');
        estado.className = 'estado';
        estado.textContent =
            NOMES_ESTADOS[sugestao.estado] || sugestao.estado;

        const data = document.createElement('p');
        data.textContent = sugestao.dataCriacao
            ? `Criada em: ${new Date(
                sugestao.dataCriacao
            ).toLocaleString('pt-PT')}`
            : '';

        artigo.append(
            titulo,
            descricao,
            categoria,
            estado,
            data
        );

        listaSugestoes.appendChild(artigo);
    }

    estadoLista.textContent =
        `${sugestoes.length} sugestão(ões) guardada(s).`;
}

async function apresentarCopiaLocal() {
    try {
        const proprietario = await lerProprietario();

        if (
            !proprietario ||
            !proprietario.expiracao ||
            new Date(proprietario.expiracao).getTime() <= Date.now()
        ) {
            listaSugestoes.replaceChildren();
            estadoLista.textContent =
                'Não existe uma cópia local disponível para esta sessão.';
            return;
        }

        const sugestoes = await lerSugestoes(
            lerConfiguracoes().ordenacao
        );

        apresentarSugestoes(sugestoes);

        const ultimaAtualizacao = await lerUltimaAtualizacao();

        if (ultimaAtualizacao) {
            estadoLista.textContent +=
                ` Última atualização: ${new Date(
                    ultimaAtualizacao
                ).toLocaleString('pt-PT')}.`;
        }
    } catch (erro) {
        console.error('Erro ao ler sugestões locais:', erro);

        estadoLista.textContent =
            'Não foi possível carregar as sugestões guardadas.';
    }
}

async function mostrarPendentes() {
    listaPendentes.replaceChildren();

    if (!sessaoAtual) {
        estadoPendentes.textContent =
            'Não existem sugestões pendentes.';
        return;
    }

    try {
        const todas = await lerPendentes();

        const pendentes = todas.filter(
            p => String(p.utilizador) ===
                String(sessaoAtual.utilizador)
        );

        if (pendentes.length === 0) {
            estadoPendentes.textContent =
                'Não existem sugestões pendentes.';
            return;
        }

        const comErro = pendentes.filter(p => p.erro).length;

        estadoPendentes.textContent =
            `${pendentes.length} sugestão(ões) pendente(s)` +
            (comErro ? `, ${comErro} com erro.` : '.');

        for (const pendente of pendentes) {
            const artigo = document.createElement('article');

            const titulo = document.createElement('h3');
            titulo.textContent = pendente.titulo;

            const descricao = document.createElement('p');
            descricao.textContent = pendente.descricao;

            const categoria = document.createElement('p');
            categoria.textContent =
                `Categoria: ${pendente.categoria}`;

            const estado = document.createElement('p');
            estado.textContent = pendente.erro
                ? `Erro: ${pendente.erro}`
                : `Por enviar — ${pendente.tentativas || 0} tentativa(s).`;

            const eliminar = document.createElement('button');
            eliminar.type = 'button';
            eliminar.textContent = 'Descartar';

            eliminar.addEventListener('click', async () => {
                await removerPendente(pendente.idLocal);
                await mostrarPendentes();
            });

            artigo.append(
                titulo,
                descricao,
                categoria,
                estado,
                eliminar
            );

            listaPendentes.appendChild(artigo);
        }
    } catch (erro) {
        console.error(erro);
        estadoPendentes.textContent =
            'Não foi possível carregar as pendentes.';
    }
}

function cancelarRetry() {
    if (temporizadorRetry) {
        clearTimeout(temporizadorRetry);
        temporizadorRetry = null;
    }

    numeroRetry = 0;
}

function agendarRetry() {
    if (
        temporizadorRetry ||
        !sessaoAtual ||
        !navigator.onLine
    ) {
        return;
    }

    // Exponential backoff com jitter, limitado a 60 segundos.
    const base = Math.min(
        60000,
        1000 * (2 ** Math.min(numeroRetry, 6))
    );

    const atraso = Math.floor(
        Math.min(60000, base * (0.7 + 0.6 * Math.random()))
    );

    numeroRetry++;

    temporizadorRetry = setTimeout(async () => {
        temporizadorRetry = null;
        await pedirSync();
    }, atraso);
}

// Pede a sincronização ao Service Worker.
// O envio e a leitura incremental são feitos fora da página.
async function pedirSync() {
    if (
        !sessaoAtual ||
        !navigator.onLine ||
        !('serviceWorker' in navigator) ||
        sincronizacaoSolicitada
    ) {
        return;
    }

    sincronizacaoSolicitada = true;

    try {
        const registo = await navigator.serviceWorker.ready;

        if ('sync' in registo) {
            try {
                await registo.sync.register(
                    'sincronizar-sugestoes'
                );
                (registo.active || navigator.serviceWorker.controller)?.postMessage({
                    tipo: 'sincronizar'
                });
                return;
            } catch (erro) {
                console.warn(
                    'Background Sync indisponível:',
                    erro
                );
            }
        }

        // Fallback para browsers sem Background Sync.
        const trabalhador =
            navigator.serviceWorker.controller ||
            registo.active;

        if (!trabalhador) {
            throw new Error('Service Worker indisponível.');
        }

        trabalhador.postMessage({
            tipo: 'sincronizar'
        });
    } catch (erro) {
        console.error('Erro ao pedir sincronização:', erro);
        agendarRetry();
    } finally {
        sincronizacaoSolicitada = false;
    }
}

async function consultarSugestoes() {
    await apresentarCopiaLocal();

    if (navigator.onLine && sessaoAtual) {
        mostrarMensagem(
            'A verificar alterações no servidor…'
        );
        await pedirSync();
    }
}

async function submeterSugestao(evento) {
    evento.preventDefault();
    esconderMensagem();

    if (!sessaoAtual || sessaoAtual.papel !== 'aluno') {
        mostrarMensagem(
            'Só os alunos podem submeter sugestões.',
            'erro'
        );
        return;
    }

    const dados = {
        titulo: campoTitulo.value.trim(),
        descricao: campoDescricao.value.trim(),
        categoria: campoCategoria.value
    };

    try {
        // Offline-first: guardar sempre primeiro na IndexedDB.
        await acrescentarPendente(
            dados,
            sessaoAtual.utilizador
        );

        limparRascunho();
        await mostrarPendentes();

        mostrarMensagem(
            'Sugestão guardada neste dispositivo. Será sincronizada quando possível.',
            'sucesso'
        );

        await pedirSync();
    } catch (erro) {
        console.error(erro);

        mostrarMensagem(
            'Não foi possível guardar a sugestão. O rascunho foi mantido.',
            'erro'
        );
    }
}

async function terminarSessao(confirmado = false) {
    if (!sessaoAtual) return;

    if (!navigator.onLine) {
        mostrarMensagem(
            'Não é possível terminar sessão sem ligação ao servidor.',
            'erro'
        );
        return;
    }

    const pendentes = await lerPendentes();

    const minhas = pendentes.filter(
        p => String(p.utilizador) ===
            String(sessaoAtual.utilizador)
    );

    if (minhas.length > 0 && !confirmado) {
        dialogLogout.showModal();
        return;
    }

    try {
        const resposta = await fetch('/v2/sessao', {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        if (resposta.status !== 204) {
            throw new Error('Não foi possível terminar a sessão.');
        }

        cancelarRetry();
        await limparBD();
        limparRascunho();

        dialogLogout.close();
        mostrarLogin();

        listaSugestoes.replaceChildren();
        listaPendentes.replaceChildren();

        estadoLista.textContent =
            'Inicia sessão para consultar sugestões.';

        estadoPendentes.textContent =
            'Não existem sugestões pendentes.';

        mostrarMensagem('Sessão terminada.', 'sucesso');
    } catch (erro) {
        console.error(erro);

        mostrarMensagem(
            'Não foi possível terminar a sessão.',
            'erro'
        );
    }
}

// Mensagens enviadas pelo Service Worker.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener(
        'message',
        async evento => {
            const resultado = evento.data;

            if (!resultado || !resultado.tipo) return;

            if (resultado.tipo === 'sincronizado') {
                cancelarRetry();

                await apresentarCopiaLocal();
                await mostrarPendentes();

                mostrarMensagem(
                    `Sincronização concluída: ` +
                    `${resultado.enviadas} enviada(s), ` +
                    `${resultado.recusadas} recusada(s), ` +
                    `${resultado.recebidas} recebida(s), ` +
                    `${resultado.porEnviar} por enviar.`,
                    'sucesso'
                );
            }

            if (resultado.tipo === 'sessao-expirada') {
                mostrarLogin();

                mostrarMensagem(
                    'A sessão expirou. Inicia sessão novamente para sincronizar.',
                    'erro'
                );
            }

            if (
                resultado.tipo === 'sem-rede' ||
                resultado.tipo === 'erro-servidor'
            ) {
                await mostrarPendentes();

                mostrarMensagem(
                    'Não foi possível sincronizar. Será feita uma nova tentativa.',
                    'erro'
                );

                agendarRetry();
            }
        }
    );

    navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
            if (!paginaRecarregada) {
                paginaRecarregada = true;
                window.location.reload();
            }
        }
    );

    window.addEventListener('load', async () => {
        try {
            const registo =
                await navigator.serviceWorker.register('./sw.js');

            if (
                registo.waiting &&
                navigator.serviceWorker.controller
            ) {
                zonaAtualizacao.hidden = false;
            }

            registo.addEventListener('updatefound', () => {
                const novo = registo.installing;

                if (!novo) return;

                novo.addEventListener('statechange', () => {
                    if (
                        novo.state === 'installed' &&
                        navigator.serviceWorker.controller
                    ) {
                        zonaAtualizacao.hidden = false;
                    }
                });
            });

            if (sessaoAtual) await pedirSync();
        } catch (erro) {
            console.error(
                'Erro ao registar o Service Worker:',
                erro
            );
        }
    });
}

// Aviso quando outra versão da IndexedDB exige fechar a ligação.
aoMudarVersao = () => {
    mostrarMensagem(
        'Há uma versão nova da aplicação. Recarregue a página.',
        'erro'
    );
};

formLogin.addEventListener('submit', async evento => {
    evento.preventDefault();
    esconderMensagem();

    const dados = {
        utilizador: $('utilizador').value.trim(),
        palavraPasse: $('palavraPasse').value
    };

    botaoLogin.disabled = true;
    botaoLogin.textContent = 'A entrar…';

    try {
        const resposta = await fetch('/v2/sessao', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
            mostrarMensagem(
                resultado.mensagem ||
                'Utilizador ou palavra-passe incorretos.',
                'erro'
            );

            $('palavraPasse').value = '';
            return;
        }

        formLogin.reset();

        await prepararProprietario(resultado);
        await mostrarSessao(resultado);

        mostrarMensagem(
            'Sessão iniciada com sucesso.',
            'sucesso'
        );
    } catch (erro) {
        console.error(erro);

        mostrarMensagem(
            'Não foi possível iniciar sessão.',
            'erro'
        );
    } finally {
        botaoLogin.disabled = false;
        botaoLogin.textContent = 'Entrar';
    }
});

window.addEventListener('online', async () => {
    if (!sessaoAtual) {
        await verificarSessao();
    } else {
        await pedirSync();
    }
});

document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && sessaoAtual) {
        await pedirSync();
    }
});

botaoSugestoes.addEventListener('click', consultarSugestoes);

botaoLogout.addEventListener('click', () => {
    terminarSessao();
});

confirmarLogout.addEventListener('click', () => {
    terminarSessao(true);
});

cancelarLogout.addEventListener('click', () => {
    dialogLogout.close();
});

formSugestao.addEventListener('submit', submeterSugestao);

campoTitulo.addEventListener('input', guardarRascunho);
campoDescricao.addEventListener('input', guardarRascunho);
campoCategoria.addEventListener('change', guardarRascunho);

botaoAtualizar.addEventListener('click', async () => {
    const registo =
        await navigator.serviceWorker.getRegistration();

    if (registo?.waiting) {
        registo.waiting.postMessage({
            tipo: 'ativar'
        });
    }
});

// Solicitar armazenamento persistente quando disponível.
async function verificarArmazenamento() {
    if (!navigator.storage) return;

    try {
        if (navigator.storage.persist) {
            const persistente =
                await navigator.storage.persist();

            console.log(
                'Armazenamento persistente:',
                persistente
            );
        }

        if (navigator.storage.estimate) {
            const estimativa =
                await navigator.storage.estimate();

            console.log(
                'Armazenamento utilizado:',
                estimativa.usage,
                'bytes'
            );

            console.log(
                'Quota disponível:',
                estimativa.quota,
                'bytes'
            );
        }
    } catch (erro) {
        console.warn(
            'Não foi possível consultar o armazenamento:',
            erro
        );
    }
}

iniciarConfiguracoes();
carregarCategorias();
mudarEstado('a-verificar');
verificarSessao();
verificarArmazenamento();