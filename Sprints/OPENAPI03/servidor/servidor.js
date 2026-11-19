
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

// As sugestões originais são carregadas ao iniciar o servidor.
// As novas sugestões são acrescentadas apenas a esta variável
// e não são gravadas no ficheiro JSON.
let sugestoesEmMemoria = JSON.parse(
    await fs.readFile(caminhoSugestoes, 'utf8')
);

const hashFicticio = await bcrypt.hash(
    'PalavraPasseFicticia123!',
    10
);

const ESTADOS_VALIDOS = [
    'submetida',
    'em_analise',
    'aceite',
    'rejeitada',
    'resolvida'
];

const CATEGORIAS_VALIDAS = [
    'instalacoes',
    'ensino',
    'servicos',
    'atividades',
    'outra'
];

app.disable('x-powered-by');

// Middleware para interpretar JSON.
app.use(express.json({ limit: '100kb' }));

// Disponibiliza os ficheiros do cliente.
app.use(express.static(path.join(__dirname, 'public')));

// Função auxiliar para validar credenciais e encontrar utilizador.
async function autenticarUtilizador(utilizador, palavraPasse) {
    const utilizadores = JSON.parse(
        await fs.readFile(caminhoUtilizadores, 'utf8')
    );

    const encontrado = utilizadores.find(
        u => u.utilizador === utilizador
    );

    // Comparar também um hash fictício se o utilizador não existir.
    const hash = encontrado?.hashPalavraPasse ?? hashFicticio;

    const passwordValida = await bcrypt.compare(
        palavraPasse,
        hash
    );

    if (!encontrado || !passwordValida) {
        return null;
    }

    return encontrado;
}

// Função auxiliar para criar um JWT.
function criarToken(utilizador) {
    return jwt.sign(
        {
            nome: utilizador.nome,
            papel: utilizador.papel
        },
        JWT_SEGREDO,
        {
            algorithm: 'HS256',
            subject: String(utilizador.utilizador),
            expiresIn: JWT_VALIDADE
        }
    );
}

// Verifica se o servidor está ativo.
app.get('/v2', (req, res) => {
    res.status(200).json({
        mensagem: 'API de Sugestões — servidor ativo',
        versao: '2.1.0'
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

        const conteudo = await fs.readFile(
            caminhoOpenAPI,
            'utf8'
        );

        res.type('application/yaml').send(conteudo);
    } catch (erro) {
        next(erro);
    }
});

// POST /v2/tokens
// Autenticação tradicional através de token Bearer.
app.post('/v2/tokens', async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');

        const { utilizador, palavraPasse } = req.body ?? {};
        const detalhes = [];

        if (
            typeof utilizador !== 'string' ||
            !/^(?:[0-9]{5,8}|[a-z]+\.[a-z]+)$/.test(utilizador)
        ) {
            detalhes.push({
                campo: 'utilizador',
                problema: 'Formato de utilizador inválido.'
            });
        }

        if (
            typeof palavraPasse !== 'string' ||
            palavraPasse.length < 8 ||
            palavraPasse.length > 128
        ) {
            detalhes.push({
                campo: 'palavraPasse',
                problema: 'A palavra-passe deve ter entre 8 e 128 caracteres.'
            });
        }

        if (detalhes.length > 0) {
            return res.status(400).json({
                codigo: 400,
                mensagem: 'As credenciais têm um formato inválido.',
                detalhes
            });
        }

        const encontrado = await autenticarUtilizador(
            utilizador,
            palavraPasse
        );

        if (!encontrado) {
            return res.status(401).json({
                codigo: 401,
                mensagem: 'Utilizador ou palavra-passe inválidos.'
            });
        }

        const token = criarToken(encontrado);

        return res.status(200).json({
            token,
            tipo: 'Bearer',
            expiraEm: JWT_VALIDADE
        });

    } catch (erro) {
        next(erro);
    }
});

// POST /v2/sessao
// Cria uma sessão e guarda o JWT num cookie HttpOnly.
app.post('/v2/sessao', async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');

        const { utilizador, palavraPasse } = req.body ?? {};
        const detalhes = [];

        if (
            typeof utilizador !== 'string' ||
            !/^(?:[0-9]{5,8}|[a-z]+\.[a-z]+)$/.test(utilizador)
        ) {
            detalhes.push({
                campo: 'utilizador',
                problema: 'Formato de utilizador inválido.'
            });
        }

        if (
            typeof palavraPasse !== 'string' ||
            palavraPasse.length < 8 ||
            palavraPasse.length > 128
        ) {
            detalhes.push({
                campo: 'palavraPasse',
                problema: 'A palavra-passe deve ter entre 8 e 128 caracteres.'
            });
        }

        if (detalhes.length > 0) {
            return res.status(400).json({
                codigo: 400,
                mensagem: 'As credenciais têm um formato inválido.',
                detalhes
            });
        }

        const encontrado = await autenticarUtilizador(
            utilizador,
            palavraPasse
        );

        if (!encontrado) {
            return res.status(401).json({
                codigo: 401,
                mensagem: 'Utilizador ou palavra-passe inválidos.'
            });
        }

        const token = criarToken(encontrado);

        const expiracao = new Date(
            (Math.floor(Date.now() / 1000) + JWT_VALIDADE) * 1000
        ).toISOString();

        // O cookie é enviado automaticamente pelo browser.
        res.cookie('sessao', token, {
            httpOnly: true,
            sameSite: 'strict',
            path: '/v2',
            maxAge: JWT_VALIDADE * 1000
        });

        return res.status(200).json({
            utilizador: String(encontrado.utilizador),
            nome: encontrado.nome,
            papel: encontrado.papel,
            expiracao
        });

    } catch (erro) {
        next(erro);
    }
});

// GET /v2/sessao
// Consulta os dados da sessão atual.
app.get('/v2/sessao', exigirToken, (req, res) => {
    res.set('Cache-Control', 'no-store');

    return res.status(200).json({
        utilizador: req.utilizador.utilizador,
        nome: req.utilizador.nome,
        papel: req.utilizador.papel,
        expiracao: req.utilizador.expiracao
    });
});

// DELETE /v2/sessao
// Termina a sessão e elimina o cookie.
app.delete('/v2/sessao', (req, res) => {
    res.set('Cache-Control', 'no-store');

    res.clearCookie('sessao', {
        path: '/v2'
    });

    return res.status(204).end();
});

// GET /v2/sugestoes
// Lista as sugestões visíveis para o utilizador autenticado.
app.get('/v2/sugestoes', exigirToken, (req, res) => {
    try {
        res.set('Cache-Control', 'private, no-cache');

        const { estado, categoria } = req.query;

        const paginaTexto = req.query.pagina ?? '1';
        const tamanhoTexto = req.query.tamanhoPagina ?? '20';

        const pagina = Number(paginaTexto);
        const tamanhoPagina = Number(tamanhoTexto);

        if (
            (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) ||
            (categoria !== undefined && !CATEGORIAS_VALIDAS.includes(categoria)) ||
            !/^[0-9]+$/.test(String(paginaTexto)) ||
            !/^[0-9]+$/.test(String(tamanhoTexto)) ||
            !Number.isSafeInteger(pagina) ||
            !Number.isSafeInteger(tamanhoPagina) ||
            pagina < 1 ||
            tamanhoPagina < 1 ||
            tamanhoPagina > 50
        ) {
            return res.status(400).json({
                codigo: 400,
                mensagem: 'Os parâmetros de consulta são inválidos.'
            });
        }

        let visiveis = req.utilizador.papel === 'servicos'
            ? [...sugestoesEmMemoria]
            : sugestoesEmMemoria.filter(
                s => String(s.numeroAluno) === req.utilizador.utilizador
            );

        if (estado !== undefined) {
            visiveis = visiveis.filter(
                s => s.estado === estado
            );
        }

        if (categoria !== undefined) {
            visiveis = visiveis.filter(
                s => s.categoria === categoria
            );
        }

        const total = visiveis.length;
        const inicio = (pagina - 1) * tamanhoPagina;

        return res.status(200).json({
            pagina,
            tamanhoPagina,
            total,
            itens: visiveis.slice(
                inicio,
                inicio + tamanhoPagina
            )
        });

    } catch (erro) {
        return res.status(500).json({
            codigo: 500,
            mensagem: 'Ocorreu um erro interno no servidor.'
        });
    }
});

// POST /v2/sugestoes
// Cria uma nova sugestão apenas para alunos.
// As novas sugestões ficam apenas em memória.
app.post('/v2/sugestoes', exigirToken, (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (req.utilizador.papel !== 'aluno') {
        return res.status(403).json({
            codigo: 403,
            mensagem: 'Apenas os alunos podem submeter sugestões.'
        });
    }

    const { titulo, descricao, categoria } = req.body ?? {};
    const detalhes = [];

    if (
        typeof titulo !== 'string' ||
        titulo.trim().length < 10 ||
        titulo.trim().length > 120
    ) {
        detalhes.push({
            campo: 'titulo',
            problema: 'O título deve ter entre 10 e 120 caracteres.'
        });
    }

    if (
        typeof descricao !== 'string' ||
        descricao.trim().length < 20 ||
        descricao.trim().length > 2000
    ) {
        detalhes.push({
            campo: 'descricao',
            problema: 'A descrição deve ter entre 20 e 2000 caracteres.'
        });
    }

    if (!CATEGORIAS_VALIDAS.includes(categoria)) {
        detalhes.push({
            campo: 'categoria',
            problema: 'A categoria indicada não é válida.'
        });
    }

    if (detalhes.length > 0) {
        return res.status(400).json({
            codigo: 400,
            mensagem: 'Os dados da sugestão são inválidos.',
            detalhes
        });
    }

    const novoId = sugestoesEmMemoria.length === 0
        ? 1
        : Math.max(...sugestoesEmMemoria.map(s => s.id)) + 1;

    const agora = new Date().toISOString();

    const novaSugestao = {
        id: novoId,
        numeroAluno: req.utilizador.utilizador,
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        categoria,
        estado: 'submetida',
        dataCriacao: agora,
        dataAtualizacao: agora,
        dataResolucao: null
    };

    // Guardar apenas na variável em memória.
    sugestoesEmMemoria.push(novaSugestao);

    return res
        .status(201)
        .location(`/v2/sugestoes/${novoId}`)
        .json(novaSugestao);
});

// Respostas para rotas inexistentes.
app.use((req, res) => {
    res.set('Cache-Control', 'no-store');

    return res.status(404).json({
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
