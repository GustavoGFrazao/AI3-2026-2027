
import {
    lerPendentes,
    confirmarPendente,
    marcarErro
} from './bd.js';

const URL_API = '/v2/sugestoes';

let sincronizacaoEmCurso = false;

async function enviarPendentes(sessao) {
    if (
        !navigator.onLine ||
        !sessao ||
        sincronizacaoEmCurso
    ) {
        return;
    }

    sincronizacaoEmCurso = true;

    try {
        const pendentes = await lerPendentes();

        // Enviar apenas sugestões do utilizador autenticado,
        // pela ordem em que foram criadas.
        const fila = pendentes
            .filter(p => p.utilizador === sessao.utilizador)
            .sort((a, b) =>
                new Date(a.criadaEm) - new Date(b.criadaEm)
            );

        for (const pendente of fila) {
            if (pendente.erro) {
                continue;
            }

            try {
                const resposta = await fetch(URL_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        titulo: pendente.titulo,
                        descricao: pendente.descricao,
                        categoria: pendente.categoria
                    })
                });

                if (resposta.status === 201) {
                    const sugestao = await resposta.json();

                    await confirmarPendente(
                        pendente.idLocal,
                        sugestao
                    );

                    continue;
                }

                if (resposta.status === 400) {
                    let mensagem = 'Os dados da sugestão são inválidos.';

                    try {
                        const resultado = await resposta.json();
                        mensagem = resultado.mensagem || mensagem;
                    } catch {
                        // Mantém a mensagem padrão.
                    }

                    await marcarErro(
                        pendente.idLocal,
                        mensagem
                    );

                    continue;
                }

                if (resposta.status === 401) {
                    const restantes = await lerPendentes();

                    return {
                        sessaoExpirada: true,
                        totalPendentes: restantes.filter(
                            p => p.utilizador === sessao.utilizador
                        ).length
                    };
                }

                // Outros erros: parar e manter os restantes.
                break;

            } catch (erro) {
                // Falha de ligação: manter os pendentes.
                break;
            }
        }

        return { sessaoExpirada: false };

    } finally {
        sincronizacaoEmCurso = false;
    }
}

export {
    enviarPendentes
};
