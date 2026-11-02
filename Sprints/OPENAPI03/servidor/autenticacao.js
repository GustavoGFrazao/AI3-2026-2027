import jwt from 'jsonwebtoken';
import { lerCookie } from './cookies.js';

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
    let token;

    if (autorizacao) {
        const correspondencia = autorizacao.match(/^Bearer\s+(\S+)$/i);

        if (!correspondencia) {
            return responderNaoAutenticado(res);
        }

        token = correspondencia[1];
    } else {
        token = lerCookie(req, 'sessao');

        if (!token) {
            return responderNaoAutenticado(res);
        }
    }

    try {
        const payload = jwt.verify(
            token,
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
        papel: payload.papel,
        expiracao: new Date(payload.exp * 1000).toISOString()
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