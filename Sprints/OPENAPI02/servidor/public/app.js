const API = '/v2';

let tokenAtual = null;
let intervaloContador = null;
let instanteExpiracao = 0;

const formLogin = document.querySelector('#formLogin');
const zonaLogin = document.querySelector('#zonaLogin');
const zonaSessao = document.querySelector('#zonaSessao');
const mensagem = document.querySelector('#mensagem');
const campoUtilizador = document.querySelector('#utilizador');
const campoPalavraPasse = document.querySelector('#palavraPasse');
const nomeUtilizador = document.querySelector('#nomeUtilizador');
const papelUtilizador = document.querySelector('#papelUtilizador');
const contador = document.querySelector('#contador');
const botaoSugestoes = document.querySelector('#botaoSugestoes');
const botaoLogout = document.querySelector('#botaoLogout');
const listaSugestoes = document.querySelector('#listaSugestoes');
const estadoLista = document.querySelector('#estadoLista');

function mostrarMensagem(texto, sucesso = false) {
    mensagem.textContent = texto;
    mensagem.classList.toggle('sucesso', sucesso);
    mensagem.hidden = false;
}

function limparMensagem() {
    mensagem.textContent = '';
    mensagem.hidden = true;
    mensagem.classList.remove('sucesso');
}

function descodificarPayload(token) {
    const parte = token.split('.')[1];

    if (!parte) {
        throw new Error('O token recebido não tem um formato válido.');
    }

    const base64 = parte
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const binario = atob(base64.padEnd(
        base64.length + (4 - base64.length % 4) % 4,
        '='
    ));

    const bytes = Uint8Array.from(
        binario,
        caracter => caracter.charCodeAt(0)
    );

    return JSON.parse(new TextDecoder().decode(bytes));
}

function formatarTempo(segundos) {
    const minutos = Math.floor(segundos / 60);
    const restantes = segundos % 60;

    return `${String(minutos).padStart(2, '0')}:${String(restantes).padStart(2, '0')}`;
}

function atualizarContador() {
    const restantes = Math.max(
        0,
        Math.ceil((instanteExpiracao - Date.now()) / 1000)
    );

    contador.textContent = formatarTempo(restantes);

    if (restantes <= 0) {
        terminarSessao('A sessão expirou. Inicia sessão novamente.');
    }
}

function iniciarContador(expiracao) {
    clearInterval(intervaloContador);
    instanteExpiracao = expiracao * 1000;

    atualizarContador();

    intervaloContador = setInterval(atualizarContador, 1000);
}

function limparLista() {
    listaSugestoes.replaceChildren();
}

function terminarSessao(motivo = '') {
    tokenAtual = null;

    clearInterval(intervaloContador);
    intervaloContador = null;

    instanteExpiracao = 0;
    zonaSessao.hidden = true;
    zonaLogin.hidden = false;

    formLogin.reset();
    contador.textContent = '--:--';

    nomeUtilizador.textContent = '';
    papelUtilizador.textContent = '';

    limparLista();
    estadoLista.textContent = 'Inicia sessão para consultar sugestões.';

    if (motivo) {
        mostrarMensagem(motivo);
    } else {
        limparMensagem();
    }

    campoUtilizador.focus();
}

async function lerErro(resposta) {
    try {
        const dados = await resposta.json();
        return dados.mensagem ?? `Erro HTTP ${resposta.status}.`;
    } catch {
        return `Erro HTTP ${resposta.status}.`;
    }
}

formLogin.addEventListener('submit', async evento => {
    evento.preventDefault();
    limparMensagem();

    const botaoEntrar = formLogin.querySelector('button[type="submit"]');
    botaoEntrar.disabled = true;

    try {
        const resposta = await fetch(`${API}/tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                utilizador: campoUtilizador.value.trim(),
                palavraPasse: campoPalavraPasse.value
            })
        });

        if (!resposta.ok) {
            throw new Error(await lerErro(resposta));
        }

        const dados = await resposta.json();

        if (
            typeof dados.token !== 'string' ||
            dados.tipo !== 'Bearer'
        ) {
            throw new Error('A resposta do servidor não contém um token válido.');
        }

        const payload = descodificarPayload(dados.token);

        if (
            typeof payload.exp !== 'number' ||
            typeof payload.nome !== 'string' ||
            typeof payload.papel !== 'string'
        ) {
            throw new Error('O token recebido contém dados inválidos.');
        }

        if (payload.exp * 1000 <= Date.now()) {
            throw new Error('O token recebido já expirou.');
        }

        tokenAtual = dados.token;

        nomeUtilizador.textContent = payload.nome;
        papelUtilizador.textContent = payload.papel;
        botaoSugestoes.textContent = payload.papel === 'servicos'
            ? 'Todas as sugestões'
            : 'As minhas sugestões';

        campoPalavraPasse.value = '';

        zonaLogin.hidden = true;
        zonaSessao.hidden = false;

        limparLista();
        estadoLista.textContent = 'Seleciona o botão para consultar sugestões.';

        iniciarContador(payload.exp);

        mostrarMensagem('Sessão iniciada com sucesso.', true);
    } catch (erro) {
        if (erro instanceof TypeError) {
            mostrarMensagem('Não foi possível contactar o servidor. Verifica se está ativo.');
        } else {
            mostrarMensagem(erro.message);
        }
    } finally {
        botaoEntrar.disabled = false;
    }
});

async function pedidoAutenticado(url) {
    if (!tokenAtual) {
        terminarSessao('Inicia sessão para continuar.');
        throw new Error('Não existe uma sessão ativa.');
    }

    const resposta = await fetch(url, {
        headers: {
            Authorization: `Bearer ${tokenAtual}`
        },
        cache: 'no-store'
    });

    if (resposta.status === 401) {
        terminarSessao('Sessão expirada ou inválida. É necessária nova autenticação.');
        throw new Error('Sessão expirada ou inválida.');
    }

    if (!resposta.ok) {
        throw new Error(await lerErro(resposta));
    }

    return resposta.json();
}

botaoSugestoes.addEventListener('click', async () => {
    limparMensagem();
    limparLista();

    estadoLista.textContent = 'A carregar sugestões...';
    botaoSugestoes.disabled = true;

    try {
        const dados = await pedidoAutenticado(`${API}/sugestoes`);

        if (!tokenAtual) {
            return;
        }

        const itens = Array.isArray(dados.itens) ? dados.itens : [];

        if (itens.length === 0) {
            estadoLista.textContent = 'Não existem sugestões para apresentar.';
            return;
        }

        estadoLista.textContent = `${dados.total} sugestão(ões) encontrada(s).`;

        for (const sugestao of itens) {
            const artigo = document.createElement('article');
            artigo.className = 'sugestao';

            const titulo = document.createElement('h3');
            titulo.textContent = sugestao.titulo ?? 'Sem título';

            const descricao = document.createElement('p');
            descricao.textContent = sugestao.descricao ?? 'Sem descrição';

            const detalhes = document.createElement('p');
            detalhes.className = 'detalhes';
            detalhes.textContent =
                `Categoria: ${sugestao.categoria ?? '—'} | Estado: ${sugestao.estado ?? '—'}`;

            artigo.append(titulo, descricao, detalhes);

            if (papelUtilizador.textContent === 'servicos') {
                const aluno = document.createElement('p');
                aluno.className = 'detalhes';
                aluno.textContent = `Número do aluno: ${sugestao.numeroAluno ?? '—'}`;
                artigo.append(aluno);
            }

            listaSugestoes.append(artigo);
        }
    } catch (erro) {
        if (tokenAtual) {
            mostrarMensagem(erro.message);
            estadoLista.textContent = 'Não foi possível carregar as sugestões.';
        }
    } finally {
        botaoSugestoes.disabled = false;
    }
});

botaoLogout.addEventListener('click', () => {
    terminarSessao('Sessão terminada.');
});