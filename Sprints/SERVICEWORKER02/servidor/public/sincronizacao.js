/*
 * SERVICEWORKER02 — Sincronização offline-first
 *
 * Este ficheiro é carregado pelo sw.js através de:
 * importScripts('/bd.js', '/sincronizacao.js');
 *
 * Não utiliza import/export, window, document ou localStorage.
 */

const URL_SUGESTOES_SYNC = '/v2/sugestoes';
const URL_ALTERACOES_SYNC = '/v2/sugestoes/alteracoes';

function erroSincronizacao(tipo, mensagem) {
    const erro = new Error(mensagem);
    erro.tipo = tipo;
    return erro;
}

function sessaoValida(proprietario) {
    if (
        !proprietario ||
        !proprietario.utilizador ||
        !proprietario.expiracao
    ) {
        return false;
    }

    return (
        new Date(proprietario.expiracao).getTime() >
        Date.now()
    );
}

async function lerMensagemErro(resposta, mensagemPadrao) {
    try {
        const dados = await resposta.json();

        return dados.mensagem || mensagemPadrao;
    } catch {
        return mensagemPadrao;
    }
}

async function fazerPedido(url, opcoes = {}) {
    try {
        return await fetch(url, {
            ...opcoes,
            credentials: 'same-origin',
            cache: 'no-store'
        });
    } catch {
        throw erroSincronizacao(
            'sem-rede',
            'Não foi possível contactar o servidor.'
        );
    }
}

/*
 * Envia uma sugestão pendente.
 *
 * A mesma chave UUID é utilizada em todas as tentativas,
 * para evitar criar sugestões duplicadas quando se perde
 * a resposta HTTP.
 */
async function enviarPendente(pendente) {
    await registarTentativa(pendente.idLocal);

    const resposta = await fazerPedido(URL_SUGESTOES_SYNC, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': pendente.chave
        },
        body: JSON.stringify({
            titulo: pendente.titulo,
            descricao: pendente.descricao,
            categoria: pendente.categoria
        })
    });

    if (resposta.status === 201) {
        let sugestao;

        try {
            sugestao = await resposta.json();
        } catch {
            throw erroSincronizacao(
                'erro-servidor',
                'A resposta da sugestão não é válida.'
            );
        }

        // A remoção da pendente e a gravação da sugestão
        // são realizadas numa única transação IndexedDB.
        await confirmarPendente(
            pendente.idLocal,
            sugestao
        );

        return 'enviada';
    }

    if (
        resposta.status === 400 ||
        resposta.status === 409
    ) {
        const mensagem = await lerMensagemErro(
            resposta,
            resposta.status === 409
                ? 'Conflito na chave de idempotência.'
                : 'Os dados da sugestão são inválidos.'
        );

        await marcarErro(
            pendente.idLocal,
            mensagem
        );

        // A pendente permanece na IndexedDB,
        // mas não volta a ser enviada automaticamente.
        return 'recusada';
    }

    if (resposta.status === 401) {
        return 'sessao-expirada';
    }

    if (resposta.status >= 500) {
        throw erroSincronizacao(
            'erro-servidor',
            `O servidor devolveu HTTP ${resposta.status}.`
        );
    }

    throw erroSincronizacao(
        'erro-servidor',
        `Resposta inesperada: HTTP ${resposta.status}.`
    );
}

/*
 * Consulta apenas as alterações posteriores ao cursor.
 *
 * Não descarrega novamente a lista completa.
 */
async function receberAlteracoes(utilizador) {
    const cursorAnterior = await lerCursor(utilizador);

    const url =
        `${URL_ALTERACOES_SYNC}?desde=` +
        encodeURIComponent(cursorAnterior);

    const resposta = await fazerPedido(url);

    if (resposta.status === 401) {
        return {
            sessaoExpirada: true,
            recebidas: 0
        };
    }

    if (!resposta.ok) {
        throw erroSincronizacao(
            'erro-servidor',
            `Não foi possível obter alterações: HTTP ${resposta.status}.`
        );
    }

    let dados;

    try {
        dados = await resposta.json();
    } catch {
        throw erroSincronizacao(
            'erro-servidor',
            'A resposta das alterações não é JSON válido.'
        );
    }

    if (
        !Array.isArray(dados.alteracoes) ||
        !Number.isInteger(dados.cursor) ||
        dados.cursor < cursorAnterior
    ) {
        throw erroSincronizacao(
            'erro-servidor',
            'O servidor devolveu alterações inválidas.'
        );
    }

    // As sugestões e o cursor são guardados atomicamente.
    await aplicarAlteracoes(
        utilizador,
        dados.alteracoes,
        dados.cursor
    );

    return {
        sessaoExpirada: false,
        recebidas: dados.alteracoes.length
    };
}

/*
 * Executa o ciclo completo:
 *
 * 1. Verifica a sessão guardada.
 * 2. Envia as pendentes por ordem de criação.
 * 3. Recebe as alterações incrementais.
 * 4. Devolve um resumo à página.
 */
async function executarSincronizacao() {
    const proprietario = await lerProprietario();

    if (!sessaoValida(proprietario)) {
        return {
            tipo: 'sessao-expirada'
        };
    }

    const utilizador = String(proprietario.utilizador);

    let enviadas = 0;
    let recusadas = 0;
    let recebidas = 0;

    const pendentes = await lerPendentesDe(utilizador);

    pendentes.sort(
        (a, b) => a.idLocal - b.idLocal
    );

    // Primeiro: enviar as sugestões pendentes.
    for (const pendente of pendentes) {
        const resultado = await enviarPendente(pendente);

        if (resultado === 'enviada') {
            enviadas++;
            continue;
        }

        if (resultado === 'recusada') {
            recusadas++;
            continue;
        }

        if (resultado === 'sessao-expirada') {
            return {
                tipo: 'sessao-expirada'
            };
        }
    }

    // Depois: receber as alterações do servidor.
    const resultadoAlteracoes =
        await receberAlteracoes(utilizador);

    if (resultadoAlteracoes.sessaoExpirada) {
        return {
            tipo: 'sessao-expirada'
        };
    }

    recebidas = resultadoAlteracoes.recebidas;

    // Conta as pendentes que ainda aguardam envio.
    const porEnviar = (
        await lerPendentesDe(utilizador)
    ).length;

    return {
        tipo: 'sincronizado',
        enviadas,
        recusadas,
        recebidas,
        porEnviar
    };
}