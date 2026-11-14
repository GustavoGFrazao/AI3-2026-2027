import {
    substituirSugestoes,
    lerSugestoes,
    guardarPendente,
    lerPendentes,
    removerPendente,
    lerProprietario,
    lerUltimaAtualizacao,
    guardarProprietario,
    limparBD
} from './bd.js';

import { enviarPendentes } from './pendentes.js';
import {
    lerConfiguracoes,
    guardarConfiguracoes
} from './configuracoes.js';

const elementoMensagem = document.getElementById('mensagem');

const estadoLigacao = document.getElementById('estadoLigacao');

const zonaAtualizacao = document.getElementById('zonaAtualizacao');
const botaoAtualizar = document.getElementById('botaoAtualizar');

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
const estadoPendentes = document.getElementById('estadoPendentes');
const listaPendentes = document.getElementById('listaPendentes');

const campoTema = document.getElementById('tema');
const campoOrdenacao = document.getElementById('ordenacao');

const campoTitulo = document.getElementById('tituloSugestao');
const campoDescricao = document.getElementById('descricaoSugestao');
const campoCategoria = document.getElementById('categoriaSugestao');

const dialogLogout = document.getElementById('dialogLogout');
const confirmarLogout = document.getElementById('confirmarLogout');
const cancelarLogout = document.getElementById('cancelarLogout');

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
        botaoLogout.disabled = estado === 'sem-ligacao';

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

async function carregarCategorias() {
    campoCategoria.disabled = true;

    try {
        const resposta = await fetch('/v2/categorias');

        if (!resposta.ok) {
            throw new Error('Não foi possível carregar as categorias.');
        }

        const resultado = await resposta.json();
        const categorias = Array.isArray(resultado)
            ? resultado
            : resultado.itens || [];

        campoCategoria.replaceChildren();

        const opcaoInicial = document.createElement('option');
        opcaoInicial.value = '';
        opcaoInicial.textContent = 'Seleciona uma categoria';
        campoCategoria.appendChild(opcaoInicial);

        categorias.forEach(categoria => {
            const opcao = document.createElement('option');
            opcao.value = categoria.codigo;
            opcao.textContent = categoria.descricao;
            campoCategoria.appendChild(opcao);
        });

        campoCategoria.disabled = categorias.length === 0;

        if (categorias.length === 0) {
            mostrarMensagem(
                'Não existem categorias disponíveis. Não é possível submeter sugestões.',
                'erro'
            );
        }

    } catch (erro) {
        campoCategoria.replaceChildren();

        const opcao = document.createElement('option');
        opcao.value = '';
        opcao.textContent = 'Categorias indisponíveis';
        campoCategoria.appendChild(opcao);

        campoCategoria.disabled = true;

        mostrarMensagem(
            'Não foi possível carregar as categorias.',
            'erro'
        );
    }
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
   enviarPendentes(sessao).then(async resultado => {
    await mostrarPendentes();

    if (resultado && resultado.sessaoExpirada) {
        mostrarLogin();

        mostrarMensagem(
            `Há ${resultado.totalPendentes} sugestões por enviar. Entre de novo para as enviar.`,
            'erro'
        );
    }
}).catch(erro => {
    console.error('Erro ao enviar sugestões pendentes:', erro);
});
mostrarPendentes();
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

        // Verificar quem é o proprietário da cópia local
        const proprietario = await lerProprietario();

        // Se for um utilizador diferente, limpar os dados anteriores
        if (
            proprietario &&
            proprietario.utilizador !== sessao.utilizador
        ) {
            await limparBD();
        }

        // Guardar o novo proprietário
        await guardarProprietario(sessao);

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

        let resultado = {};

        try {
            resultado = await resposta.json();
        } catch {
            resultado = {};
        }

        if (!resposta.ok) {
            if (resposta.status === 400 || resposta.status === 401) {
                mostrarMensagem(
                    resultado.mensagem || 'Utilizador ou palavra-passe incorretos.',
                    'erro'
                );

                document.getElementById('palavraPasse').value = '';
                document.getElementById('palavraPasse').focus();
                return;
            }

            throw new Error(
                resultado.mensagem || 'Não foi possível iniciar sessão.'
            );
        }

        formLogin.reset();

        // Verificar o proprietário da cópia local
        const proprietario = await lerProprietario();

        // Se for outro utilizador, limpar os dados anteriores
        if (
            proprietario &&
            proprietario.utilizador !== resultado.utilizador
        ) {
            await limparBD();
        }

        // Guardar o novo proprietário
        await guardarProprietario(resultado);

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


async function terminarSessao(confirmado = false) {
    if (document.body.dataset.estado === 'sem-ligacao') {
        mostrarMensagem(
            'Não é possível terminar sessão sem ligação ao servidor.',
            'erro'
        );
        return;
    }

    const pendentes = await lerPendentes();
    const minhasPendentes = pendentes.filter(
        p => p.utilizador === sessaoAtual?.utilizador
    );

    if (minhasPendentes.length > 0 && !confirmado) {
        dialogLogout.showModal();
        return;
    }

    try {
        const resposta = await fetch('/v2/sessao', {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        if (resposta.status !== 204) {
            if (resposta.status === 401) {
                mostrarLogin();
                mostrarMensagem('A sessão expirou. Entre de novo.', 'erro');
                return;
            }

            throw new Error('Não foi possível terminar a sessão.');
        }

        await limparBD();
        limparRascunho();
        dialogLogout.close();
        mostrarLogin();

        document.getElementById('utilizador').focus();
        listaSugestoes.replaceChildren();
        listaPendentes.replaceChildren();

        estadoLista.textContent = 'Inicia sessão para consultar sugestões.';
        estadoPendentes.textContent = 'Não existem sugestões pendentes.';

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

        const erro = new Error('A sessão terminou.');
        erro.status = 401;
        throw erro;
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

async function mostrarPendentes() {
    try {
        const pendentes = await lerPendentes();

        listaPendentes.innerHTML = '';

        const pendentesDoUtilizador = pendentes.filter(
            pendente =>
                pendente.utilizador === sessaoAtual?.utilizador
        );

        if (pendentesDoUtilizador.length === 0) {
            estadoPendentes.textContent =
                'Não existem sugestões pendentes.';
            return;
        }

        estadoPendentes.textContent =
            `${pendentesDoUtilizador.length} sugestão(ões) por enviar.`;

        pendentesDoUtilizador.forEach(pendente => {
            const artigo = document.createElement('article');

            const titulo = document.createElement('h3');
            titulo.textContent = pendente.titulo;

            const descricao = document.createElement('p');
            descricao.textContent = pendente.descricao;

            const categoria = document.createElement('p');
            categoria.textContent = `Categoria: ${pendente.categoria}`;

            const estado = document.createElement('p');
            estado.textContent = pendente.erro
                ? `Erro: ${pendente.erro}`
                : 'Por enviar';

            const botaoEliminar = document.createElement('button');
            botaoEliminar.type = 'button';
            botaoEliminar.textContent = 'Descartar';

            botaoEliminar.addEventListener('click', async () => {
                await removerPendente(pendente.idLocal);
                await mostrarPendentes();
            });

            artigo.append(
                titulo,
                descricao,
                categoria,
                estado,
                botaoEliminar
            );

            listaPendentes.appendChild(artigo);
        });

    } catch (erro) {
        console.error('Erro ao carregar sugestões pendentes:', erro);

        estadoPendentes.textContent =
            'Não foi possível carregar as sugestões pendentes.';
    }
}

async function consultarSugestoesOffline() {
    try {
        // Verificar o proprietário da cópia local
        const proprietario = await lerProprietario();

        // Sem proprietário ou com sessão expirada: não mostrar a cópia
        if (
            !proprietario ||
            !proprietario.expiracao ||
            new Date(proprietario.expiracao).getTime() <= Date.now()
        ) {
            estadoLista.textContent =
                'Não existe uma cópia local disponível para esta sessão.';
            listaSugestoes.innerHTML = '';
            return;
        }

        // Ler sugestões guardadas na IndexedDB
        const sugestoes = await lerSugestoes(
            lerConfiguracoes().ordenacao
        );

        apresentarSugestoes(sugestoes);

const ultimaAtualizacao = await lerUltimaAtualizacao();

const horaCopia = ultimaAtualizacao
    ? new Date(ultimaAtualizacao).toLocaleTimeString('pt-PT', {
        hour: '2-digit',
        minute: '2-digit'
    })
    : '--:--';

estadoLista.textContent =
    `${proprietario.nome} — Cópia de ${horaCopia} — pode estar desatualizada.`;

    } catch (erro) {
        console.error('Erro ao carregar a cópia offline:', erro);

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

        const horaAtualizacao = new Date().toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit'
});

estadoLista.textContent = `Atualizado às ${horaAtualizacao}`;

        } catch (erro) {
    if (erro.status === 401) {
        return;
    }

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
    const erro = new Error(
        resultado.mensagem ||
        'Não foi possível submeter a sugestão.'
    );

    erro.status = resposta.status;
    throw erro;
}

        limparRascunho();

        mostrarMensagem(
            'Sugestão submetida com sucesso!',
            'sucesso'
        );

        await consultarSugestoes();
    }  catch (erro) {
    if (erro.status === 401) {
        return;
    }

if (erro.status) {
    mostrarMensagem(erro.message, 'erro');
    return;
}

    // Guardar a sugestão para envio posterior
        try {
            await guardarPendente({
    titulo: dados.titulo,
    descricao: dados.descricao,
    categoria: dados.categoria
}, sessaoAtual.utilizador);
await mostrarPendentes();

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

window.addEventListener('online', async () => {
    await verificarSessao();

    if (sessaoAtual) {
        await enviarPendentes(sessaoAtual);
        await mostrarPendentes();
        await consultarSugestoes();
    }
});


botaoSugestoes.addEventListener('click', consultarSugestoes);
botaoLogout.addEventListener('click', terminarSessao);
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


iniciarConfiguracoes();
carregarCategorias();
mudarEstado('a-verificar');
verificarSessao();

// Registar o Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registo = await navigator.serviceWorker.register('./sw.js');

            console.log(
                'Service Worker registado com sucesso:',
                registo
            );

            // Verificar se já existe uma atualização à espera
            if (registo.waiting && navigator.serviceWorker.controller) {
                zonaAtualizacao.hidden = false;
            }

            // Detetar quando é encontrada uma nova versão
            registo.addEventListener('updatefound', () => {
                const novoServiceWorker = registo.installing;

                if (!novoServiceWorker) {
                    return;
                }

                novoServiceWorker.addEventListener('statechange', () => {
                    if (
                        novoServiceWorker.state === 'installed' &&
                        navigator.serviceWorker.controller
                    ) {
                        zonaAtualizacao.hidden = false;
                    }
                });
            });

        } catch (erro) {
            console.error(
                'Erro ao registar o Service Worker:',
                erro
            );
        }
    });
}

// Ativar a nova versão do Service Worker
botaoAtualizar.addEventListener('click', async () => {
    const registo = await navigator.serviceWorker.getRegistration();

    if (registo && registo.waiting) {
        registo.waiting.postMessage({
            tipo: 'ativar'
        });
    }
});

// Recarregar a página quando a nova versão assumir o controlo
let paginaRecarregada = false;

navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!paginaRecarregada) {
        paginaRecarregada = true;
        window.location.reload();
    }
});