import jwt from 'jsonwebtoken';

const JWT_SEGREDO = process.env.JWT_SEGREDO;

function responderNaoAutenticado(res, tokenInvalido = false) {
    res.set('Cache-Control', 'no-store');

    res.set(
        'WWW-Authenticate',
        tokenInvalido
            ? 'Bearer error="invalid_token"'
            : 'Bearer'
    );

    return res.status(401).json({
        codigo: 401,
        mensagem: tokenInvalido
            ? 'O token é inválido ou expirou.'
            : 'É necessária autenticação através de um token Bearer.'
    });
}

export function exigirToken(req, res, next) {
    const autorizacao = req.get('Authorization');

    if (!autorizacao) {
        return responderNaoAutenticado(res);
    }

    const correspondencia = autorizacao.match(/^Bearer\s+(\S+)$/i);

    if (!correspondencia) {
        return responderNaoAutenticado(res);
    }

    try {
        const payload = jwt.verify(
            correspondencia[1],
            JWT_SEGREDO,
            { algorithms: ['HS256'] }
        );

        if (
            typeof payload.sub !== 'string' ||
            typeof payload.nome !== 'string' ||
            !['aluno', 'servicos'].includes(payload.papel)
        ) {
            return responderNaoAutenticado(res, true);
        }

        req.utilizador = {
            utilizador: payload.sub,
            nome: payload.nome,
            papel: payload.papel
        };

        next();
    } catch {
        return responderNaoAutenticado(res, true);
    }
}

export function exigirPapel(papelNecessario) {
    return (req, res, next) => {
        if (req.utilizador?.papel !== papelNecessario) {
            res.set('Cache-Control', 'no-store');

            return res.status(403).json({
                codigo: 403,
                mensagem: 'Não tem permissões para executar esta operação.'
            });
        }

        next();
    };
}
