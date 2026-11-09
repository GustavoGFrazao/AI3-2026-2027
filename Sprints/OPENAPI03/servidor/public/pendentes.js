import {
    lerPendentes,
    confirmarPendente,
    marcarErro
} from './bd.js';

const URL_API = '/v2/sugestoes';

async function sincronizarPendentes() {
    if (!navigator.onLine) {
        return;
    }

    const pendentes = await lerPendentes();

    for (const pendente of pendentes) {
        // Não enviar pendentes que já tenham um erro registado
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
                await marcarErro(
                    pendente.idLocal,
                    'Os dados da sugestão são inválidos.'
                );

                continue;
            }

            if (resposta.status === 401) {
                // A sessão expirou ou deixou de ser válida.
                // Mantemos os pendentes para tentar depois de novo login.
                break;
            }

            // Outros erros do servidor: parar a sincronização.
            break;

        } catch (erro) {
            // Sem ligação ou falha de rede: manter os pendentes.
            break;
        }
    }
}

export {
    sincronizarPendentes
};