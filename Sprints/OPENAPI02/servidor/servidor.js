import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { exigirToken } from './autenticacao.js';

const app = express();
const PORTA = Number(process.env.PORTA ?? 3000);

const JWT_SEGREDO = process.env.JWT_SEGREDO;
const JWT_VALIDADE = Number(process.env.JWT_VALIDADE ?? 900);

if (!JWT_SEGREDO || JWT_SEGREDO.length < 32) {
    console.error('Erro: JWT_SEGREDO tem de ter pelo menos 32 caracteres.');
    process.exit(1);
}

if (!Number.isInteger(JWT_VALIDADE) || JWT_VALIDADE <= 0) {
    console.error('Erro: JWT_VALIDADE tem de ser um inteiro positivo.');
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const caminhoUtilizadores = path.join(
    __dirname,
    'dados',
    'utilizadores.json'
);

const caminhoSugestoes = path.join(
    __dirname,
    'dados',
    'sugestoes.json'
);

const hashFicticio = await bcrypt.hash(
    'PalavraPasseFicticia123!',
    10
);

app.disable('x-powered-by');

// Middleware para interpretar JSON.
app.use(express.json({ limit: '100kb' }));

// Disponibiliza os ficheiros do cliente.
app.use(express.static(path.join(__dirname, 'public')));

// Verifica se o servidor está ativo.
app.get('/v2', (req, res) => {
    res.status(200).json({
        mensagem: 'API de Sugestões — servidor ativo',
        versao: '2.0.0'
    });
});

// Disponibiliza o contrato OpenAPI.
app.get('/v2/openapi.yaml', async (req, res, next) => {
    try {
        const caminhoOpenAPI = path.join(
            __dirname,
            '..',
            'sugestoes.openapi.yaml'
        );

        const conteudo = await fs.readFile(caminhoOpenAPI, 'utf8');

        res.type('application/yaml').send(conteudo);
    } catch (erro) {
        next(erro);
    }
});

// Autenticação: cria um token JWT.
app.post('/v2/tokens', async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');

        const { utilizador, palavraPasse } = req.body ?? {};

        if (
            typeof utilizador !== 'string' ||
            typeof palavraPasse !== 'string' ||
            utilizador.length === 0 ||
            utilizador.length > 100 ||
            palavraPasse.length < 8 ||
            palavraPasse.length > 128
        ) {
            return res.status(400).json({
                codigo: 400,
                mensagem: 'As credenciais têm um formato inválido.'
            });
        }

        const utilizadores = JSON.parse(
            await fs.readFile(caminhoUtilizadores, 'utf8')
        );

        const encontrado = utilizadores.find(
            u => u.utilizador === utilizador
        );

        // Compara também um hash fictício quando o utilizador não existe.
        const hash = encontrado?.hashPalavraPasse ?? hashFicticio;

        const passwordValida = await bcrypt.compare(
            palavraPasse,
            hash
        );

        if (!encontrado || !passwordValida) {
            return res.status(401).json({
                codigo: 401,
                mensagem: 'Utilizador ou palavra-passe inválidos.'
            });
        }

        const token = jwt.sign(
            {
                nome: encontrado.nome,
                papel: encontrado.papel
            },
            JWT_SEGREDO,
            {
                algorithm: 'HS256',
                subject: String(encontrado.utilizador),
                expiresIn: JWT_VALIDADE
            }
        );

        return res.status(200).json({
            token,
            tipo: 'Bearer',
            expiraEm: JWT_VALIDADE
        });
    } catch (erro) {
        next(erro);
    }
});

// Lista as sugestões visíveis para o utilizador autenticado.
app.get('/v2/sugestoes', exigirToken, async (req, res, next) => {
    try {
        res.set('Cache-Control', 'private, no-cache');

        const sugestoes = JSON.parse(
            await fs.readFile(caminhoSugestoes, 'utf8')
        );

        const visiveis = req.utilizador.papel === 'servicos'
            ? sugestoes
            : sugestoes.filter(
                s => String(s.numeroAluno) === req.utilizador.utilizador
            );

        return res.status(200).json({
            pagina: 1,
            tamanhoPagina: 20,
            total: visiveis.length,
            itens: visiveis.slice(0, 20)
        });
    } catch (erro) {
        next(erro);
    }
});

// Respostas para rotas inexistentes.
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');

    res.status(404).json({
        codigo: 404,
        mensagem: 'O recurso solicitado não foi encontrado.'
    });
});

// Tratamento de erros, incluindo JSON inválido.
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    res.set('Cache-Control', 'no-store');

    if (
        err instanceof SyntaxError &&
        err.status === 400 &&
        'body' in err
    ) {
        return res.status(400).json({
            codigo: 400,
            mensagem: 'O corpo do pedido contém JSON inválido.'
        });
    }

    if (err.status === 413) {
        return res.status(413).json({
            codigo: 413,
            mensagem: 'O corpo do pedido excede o tamanho permitido.'
        });
    }

    console.error(err);

    return res.status(500).json({
        codigo: 500,
        mensagem: 'Ocorreu um erro interno no servidor.'
    });
});

app.listen(PORTA, () => {
    console.log(`Servidor disponível em http://localhost:${PORTA}`);
});
