import {
    lerConfiguracoes,
    guardarConfiguracoes
} from './configuracoes.js';

import {
    substituirSugestoes,
    lerSugestoes,
    guardarPendente,
    lerPendentes,
    removerPendente
} from './bd.js';

import { sincronizarPendentes as sincronizarFila } from './pendentes.js';

const elementoMensagem = document.getElementById('mensagem');

const estadoLigacao = document.getElementById('estadoLigacao');

const zonaLogin = document.getElementById('zonaLogin');
const zonaSessao = document.getElementById('zonaSessao');

const formLogin = document.getElementById('formLogin');
const botaoLogin = document.getElementById('botaoLogin');
const formSugestao = document.getElementById('formSugestao');

const nomeUtilizador = document.getElementById('nomeUtilizador');
const papelUtilizador = document.getElementById('papelUtilizador');
const contador = document.getElementById('contador');

const botaoSugestoes = document.getElementById('botaoSugestoes');
const botaoLogout = document.getElementById('botaoLogout');

const zonaNovaSugestao = document.getElementById('zonaNovaSugestao');
const estadoLista = document.getElementById('estadoLista');
const listaSugestoes = document.getElementById('listaSugestoes');

const campoTema = document.getElementById('tema');
const campoOrdenacao = document.getElementById('ordenacao');

const campoTitulo = document.getElementById('tituloSugestao');
const campoDescricao = document.getElementById('descricaoSugestao');
const campoCategoria = document.getElementById('categoriaSugestao');

let sessaoAtual = null;
let temporizador = null;
let estadoAtual = 'a-verificar';

function mudarEstado(estado) {
    const estadosValidos = [
        'a-verificar',
        'sem-sessao',
        'com-sessao',
        'sem-ligacao'
    ];

    if (!estadosValidos.includes(estado)) {
        return;
    }

    estadoAtual = estado;
    document.body.dataset.estado = estado;

    estadoLigacao.textContent = {
        'a-verificar': 'A verificar sessão…',
        'sem-sessao': 'Sem sessão iniciada.',
        'com-sessao': 'Sessão iniciada.',
        'sem-ligacao': 'Sem ligação ao servidor.'
    }[estado];

    zonaLogin.hidden = estado !== 'sem-sessao';
    zonaSessao.hidden = estado !== 'com-sessao';
    zonaNovaSugestao.hidden =
        estado !== 'com-sessao' ||
        !sessaoAtual ||
        sessaoAtual.papel !== 'aluno';
}

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

    if (tipo) {
        elementoMensagem.classList.add(tipo);
    }

    elementoMensagem.hidden = false;
}

function esconderMensagem() {
    elementoMensagem.hidden = true;
    elementoMensagem.textContent = '';
    elementoMensagem.className = 'mensagem';
}

function aplicarConfiguracoes(configuracoes) {
    document.documentElement.dataset.tema = configuracoes.tema;

    campoTema.value = configuracoes.tema;
    campoOrdenacao.value = configuracoes.ordenacao;
}

function iniciarConfiguracoes() {
    const configuracoes = lerConfiguracoes();

    aplicarConfiguracoes(configuracoes);

    campoTema.addEventListener('change', () => {
        const novasConfiguracoes = {
            ...lerConfiguracoes(),
            tema: campoTema.value
        };

        guardarConfiguracoes(novasConfiguracoes);
        aplicarConfiguracoes(novasConfiguracoes);
    });

    campoOrdenacao.addEventListener('change', () => {
        const novasConfiguracoes = {
            ...lerConfiguracoes(),
            ordenacao: campoOrdenacao.value
        };

        guardarConfiguracoes(novasConfiguracoes);
        aplicarConfiguracoes(novasConfiguracoes);

        if (sessaoAtual) {
            consultarSugestoes();
        }
    });
}

function limparRascunho() {
    sessionStorage.removeItem('rascunhoSugestao');

    if (formSugestao) {
        formSugestao.reset();
    }
}

function guardarRascunho() {
    const rascunho = {
        titulo: campoTitulo.value,
        descricao: campoDescricao.value,
        categoria: campoCategoria.value
    };

    sessionStorage.setItem(
        'rascunhoSugestao',
        JSON.stringify(rascunho)
    );
}

function recuperarRascunho() {
    try {
        const dados = sessionStorage.getItem('rascunhoSugestao');

        if (!dados) {
            return;
        }

        const rascunho = JSON.parse(dados);

        campoTitulo.value = rascunho.titulo ?? '';
        campoDescricao.value = rascunho.descricao ?? '';
        campoCategoria.value = rascunho.categoria ?? '';
    } catch {
        limparRascunho();
    }
}

function mostrarLogin() {
    sessaoAtual = null;

    if (temporizador) {
        clearInterval(temporizador);
        temporizador = null;
    }

    contador.textContent = '--:--';

    mudarEstado('sem-sessao');
}

function mostrarSessao(sessao) {
    sessaoAtual = sessao;

    nomeUtilizador.textContent = sessao.nome;
    papelUtilizador.textContent = sessao.papel;

    mudarEstado('com-sessao');

    const eAluno = sessao.papel === 'aluno';

    if (eAluno) {
        recuperarRascunho();
    } else {
        limparRascunho();
    }

    iniciarContador(sessao.expiracao);
}

function iniciarContador(expiracao) {
    if (temporizador) {
        clearInterval(temporizador);
    }

    function atualizarContador() {
        const agora = Date.now();
        const fim = new Date(expiracao).getTime();
        const segundos = Math.max(0, Math.floor((fim - agora) / 1000));

     if (segundos <= 0) {
    clearInterval(temporizador);
    temporizador = null;

    mostrarLogin();

    mostrarMensagem(
        'A sessão expirou. Inicia sessão novamente.',
        'erro'
    );

    return;
}

        const minutos = Math.floor(segundos / 60);
        const restantes = segundos % 60;

        contador.textContent =
            `${String(minutos).padStart(2, '0')}:` +
            `${String(restantes).padStart(2, '0')}`;
    }

    atualizarContador();
    temporizador = setInterval(atualizarContador, 1000);
}

async function verificarSessao() {
    mudarEstado('a-verificar');
    esconderMensagem();

    try {
        const resposta = await fetch('/v2/sessao', {
            method: 'GET',
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

        mostrarSessao(sessao);
    } catch (erro) {
        sessaoAtual = null;

        if (temporizador) {
            clearInterval(temporizador);
            temporizador = null;
        }

        mudarEstado('sem-ligacao');

        mostrarMensagem(
            'Não foi possível contactar o servidor. Verifica a tua ligação.',
            'erro'
        );
    }
}

formLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    esconderMensagem();

    const dados = {
        utilizador: document.getElementById('utilizador').value.trim(),
        palavraPasse: document.getElementById('palavraPasse').value
    };

    botaoLogin.disabled = true;
    botaoLogin.textContent = 'A iniciar sessão...';

    try {
        const resposta = await fetch('/v2/sessao', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });

        let resultado = {};

        try {
            resultado = await resposta.json();
        } catch {
            resultado = {};
        }

        if (!resposta.ok) {
            if (resposta.status === 400 || resposta.status === 401) {
                mostrarMensagem(
                    resultado.mensagem ||
                    'Utilizador ou palavra-passe incorretos.',
                    'erro'
                );

                document.getElementById('palavraPasse').value = '';
                document.getElementById('palavraPasse').focus();

                return;
            }

            throw new Error(
                resultado.mensagem ||
                'Não foi possível iniciar sessão.'
            );
        }

        formLogin.reset();

        mostrarSessao(resultado);

        mostrarMensagem(
            'Sessão iniciada com sucesso.',
            'sucesso'
        );
    } catch (erro) {
        mudarEstado('sem-ligacao');

        mostrarMensagem(
            'Não foi possível contactar o servidor. Verifica a tua ligação.',
            'erro'
        );
    } finally {
        botaoLogin.disabled = false;
        botaoLogin.textContent = 'Entrar';
    }
});

async function terminarSessao() {
    esconderMensagem();

    try {
        const resposta = await fetch('/v2/sessao', {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        if (!resposta.ok && resposta.status !== 401) {
            throw new Error('Não foi possível terminar a sessão.');
        }

        limparRascunho();
        mostrarLogin();

        listaSugestoes.replaceChildren();
        estadoLista.textContent = 'Inicia sessão para consultar sugestões.';

        mostrarMensagem('Sessão terminada.', 'sucesso');
    } catch (erro) {
        mostrarMensagem(
            'Não foi possível contactar o servidor. Verifica a tua ligação.',
            'erro'
        );
    }
}

async function pedidoAutenticado(url, opcoes = {}) {
    const resposta = await fetch(url, {
        ...opcoes,
        credentials: 'same-origin'
    });

    if (resposta.status === 401) {
        mostrarLogin();

        mostrarMensagem(
            'A sessão terminou. Inicia sessão novamente.',
            'erro'
        );

        throw new Error('A sessão terminou.');
    }

    return resposta;
}

function ordenarSugestoes(sugestoes) {
    const configuracoes = lerConfiguracoes();
    const resultado = [...sugestoes];

    if (configuracoes.ordenacao === 'estado') {
        resultado.sort((a, b) => {
            const estadoA = ESTADOS.indexOf(a.estado);
            const estadoB = ESTADOS.indexOf(b.estado);

            if (estadoA !== estadoB) {
                return estadoA - estadoB;
            }

            return new Date(b.dataCriacao) - new Date(a.dataCriacao);
        });
    } else {
        resultado.sort(
            (a, b) =>
                new Date(b.dataCriacao) - new Date(a.dataCriacao)
        );
    }

    return resultado;
}

function apresentarSugestoes(sugestoes) {
    listaSugestoes.replaceChildren();

    if (sugestoes.length === 0) {
        estadoLista.textContent = 'Não existem sugestões para apresentar.';
        return;
    }

    estadoLista.textContent = `${sugestoes.length} sugestão(ões) encontrada(s).`;

    const ordenadas = ordenarSugestoes(sugestoes);

    for (const sugestao of ordenadas) {
        const artigo = document.createElement('article');
        artigo.className = 'sugestao';

        const titulo = document.createElement('h3');
        titulo.textContent = sugestao.titulo;

        const descricao = document.createElement('p');
        descricao.textContent = sugestao.descricao;

        const categoria = document.createElement('p');
        categoria.textContent = `Categoria: ${sugestao.categoria}`;

        const estado = document.createElement('span');
        estado.className = 'estado';
        estado.textContent =
            NOMES_ESTADOS[sugestao.estado] || sugestao.estado;

        const data = document.createElement('p');
        data.textContent = sugestao.dataCriacao
            ? `Criada em: ${new Date(sugestao.dataCriacao).toLocaleString('pt-PT')}`
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
}

async function consultarSugestoesOffline() {
    try {
        const sugestoes = await lerSugestoes(
            lerConfiguracoes().ordenacao
        );

        apresentarSugestoes(sugestoes);

        estadoLista.textContent +=
            ' (dados guardados neste dispositivo)';
    } catch (erro) {
        estadoLista.textContent =
            'Não foi possível carregar as sugestões guardadas.';
    }
}

async function consultarSugestoes() {
    esconderMensagem();
    estadoLista.textContent = 'A carregar sugestões...';

    try {
        const resposta = await pedidoAutenticado('/v2/sugestoes');

        const resultado = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                resultado.mensagem ||
                'Não foi possível carregar as sugestões.'
            );
        }

        const sugestoes = Array.isArray(resultado)
            ? resultado
            : (resultado.itens || []);

        // Guardar as sugestões recebidas da API na IndexedDB
        await substituirSugestoes(sugestoes);

        // Apresentar as sugestões guardadas
        const sugestoesGuardadas = await lerSugestoes(
            lerConfiguracoes().ordenacao
        );

        apresentarSugestoes(sugestoesGuardadas);

        } catch (erro) {
        await consultarSugestoesOffline();
    }
}

async function submeterSugestao(evento) {
    evento.preventDefault();
    esconderMensagem();

    const dados = {
        titulo: campoTitulo.value.trim(),
        descricao: campoDescricao.value.trim(),
        categoria: campoCategoria.value
    };

    // Verificar se existe uma sessão de aluno
    if (!sessaoAtual || sessaoAtual.papel !== 'aluno') {
        mostrarMensagem(
            'Só os alunos podem submeter sugestões.',
            'erro'
        );
        return;
    }

    try {
        const resposta = await pedidoAutenticado('/v2/sugestoes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                resultado.mensagem ||
                'Não foi possível submeter a sugestão.'
            );
        }

        limparRascunho();

        mostrarMensagem(
            'Sugestão submetida com sucesso!',
            'sucesso'
        );

        await consultarSugestoes();
    } catch (erro) {
        // Guardar a sugestão para envio posterior
        try {
            await guardarPendente({
                user: sessaoAtual.utilizador,
                titulo: dados.titulo,
                descricao: dados.descricao,
                categoria: dados.categoria
            });

            limparRascunho();

            mostrarMensagem(
                'Sem ligação ao servidor. A sugestão foi guardada neste dispositivo e será enviada mais tarde.',
                'sucesso'
            );
        } catch (erroBD) {
            mostrarMensagem(
                'Não foi possível enviar nem guardar a sugestão. O rascunho foi mantido.',
                'erro'
            );
        }
    }
}

async function sincronizarPendentes() {
    if (!sessaoAtual || sessaoAtual.papel !== 'aluno') {
        return;
    }

    let pendentes;

    try {
        pendentes = await lerPendentes();
    } catch (erro) {
        console.error('Não foi possível ler as sugestões pendentes:', erro);
        return;
    }

    for (const pendente of pendentes) {
        try {
            const resposta = await pedidoAutenticado('/v2/sugestoes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    titulo: pendente.titulo,
                    descricao: pendente.descricao,
                    categoria: pendente.categoria
                })
            });

            const resultado = await resposta.json();

            if (!resposta.ok) {
                throw new Error(
                    resultado.mensagem || 'Não foi possível enviar a sugestão.'
                );
            }

            await removerPendente(pendente.idLocal);
        } catch (erro) {
            console.error(
                'Não foi possível sincronizar a sugestão pendente:',
                erro
            );

            // Mantém esta sugestão na IndexedDB para tentar mais tarde.
            break;
        }
    }
   }

window.addEventListener('online', async () => {
    await sincronizarFila();
    await consultarSugestoes();
});


botaoSugestoes.addEventListener('click', consultarSugestoes);
botaoLogout.addEventListener('click', terminarSessao);

formSugestao.addEventListener('submit', submeterSugestao);

campoTitulo.addEventListener('input', guardarRascunho);
campoDescricao.addEventListener('input', guardarRascunho);
campoCategoria.addEventListener('change', guardarRascunho);

iniciarConfiguracoes();
mudarEstado('a-verificar');
verificarSessao();