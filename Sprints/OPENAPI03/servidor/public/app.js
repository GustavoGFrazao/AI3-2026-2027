import {
    lerConfiguracoes,
    guardarConfiguracoes
} from './configuracoes.js';

const elementoMensagem = document.getElementById('mensagem');

const zonaLogin = document.getElementById('zonaLogin');
const zonaSessao = document.getElementById('zonaSessao');

const formLogin = document.getElementById('formLogin');
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
    zonaLogin.hidden = false;
    zonaSessao.hidden = true;
    zonaNovaSugestao.hidden = true;

    sessaoAtual = null;

    if (temporizador) {
        clearInterval(temporizador);
        temporizador = null;
    }

    contador.textContent = '--:--';
}

function mostrarSessao(sessao) {
    sessaoAtual = sessao;

    zonaLogin.hidden = true;
    zonaSessao.hidden = false;

    nomeUtilizador.textContent = sessao.nome;
    papelUtilizador.textContent = sessao.papel;

    const eAluno = sessao.papel === 'aluno';

    zonaNovaSugestao.hidden = !eAluno;

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

            limparRascunho();
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
    try {
        const resposta = await fetch('/v2/sessao', {
            method: 'GET',
            credentials: 'same-origin'
        });

        if (resposta.status === 401) {
            limparRascunho();
            mostrarLogin();
            return;
        }

        if (!resposta.ok) {
            throw new Error('Não foi possível verificar a sessão.');
        }

        const sessao = await resposta.json();

        mostrarSessao(sessao);
    } catch (erro) {
        mostrarLogin();
        mostrarMensagem(erro.message, 'erro');
    }
}

formLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    esconderMensagem();

    const dados = {
        utilizador: document.getElementById('utilizador').value.trim(),
        palavraPasse: document.getElementById('palavraPasse').value
    };

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
            throw new Error(
                resultado.mensagem || 'Não foi possível iniciar sessão.'
            );
        }

        formLogin.reset();
        mostrarSessao(resultado);

        mostrarMensagem('Sessão iniciada com sucesso.', 'sucesso');
    } catch (erro) {
        mostrarMensagem(erro.message, 'erro');
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
        mostrarMensagem(erro.message, 'erro');
    }
}

async function pedidoAutenticado(url, opcoes = {}) {
    const resposta = await fetch(url, {
        ...opcoes,
        credentials: 'same-origin'
    });

    if (resposta.status === 401) {
        limparRascunho();
        mostrarLogin();

        throw new Error('A sessão terminou. Inicia sessão novamente.');
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

async function consultarSugestoes() {
    esconderMensagem();
    estadoLista.textContent = 'A carregar sugestões...';

    try {
        const resposta = await pedidoAutenticado('/v2/sugestoes');

        const resultado = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                resultado.mensagem || 'Não foi possível carregar as sugestões.'
            );
        }

        const sugestoes = Array.isArray(resultado)
            ? resultado
            : (resultado.itens || []);

        apresentarSugestoes(sugestoes);
    } catch (erro) {
        estadoLista.textContent = '';
        mostrarMensagem(erro.message, 'erro');
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
                resultado.mensagem || 'Não foi possível submeter a sugestão.'
            );
        }

        limparRascunho();

        mostrarMensagem('Sugestão submetida com sucesso!', 'sucesso');

        await consultarSugestoes();
    } catch (erro) {
        mostrarMensagem(erro.message, 'erro');
    }
}

botaoSugestoes.addEventListener('click', consultarSugestoes);
botaoLogout.addEventListener('click', terminarSessao);

formSugestao.addEventListener('submit', submeterSugestao);

campoTitulo.addEventListener('input', guardarRascunho);
campoDescricao.addEventListener('input', guardarRascunho);
campoCategoria.addEventListener('change', guardarRascunho);

iniciarConfiguracoes();
verificarSessao();