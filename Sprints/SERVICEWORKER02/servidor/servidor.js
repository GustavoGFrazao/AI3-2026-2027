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

// Registos de idempotência mantidos durante 24 horas, por aluno e UUID.
const pedidosIdempotentes = new Map();
const DURACAO_IDEMPOTENCIA = 24 * 60 * 60 * 1000;

// As sugestões existentes recebem versões estáveis ao arrancar.
// O contador só avança quando uma nova sugestão é criada.
let contadorVersoes = 0;
for (const sugestao of sugestoesEmMemoria) {
    if (!Number.isSafeInteger(sugestao.versao) || sugestao.versao < 1) {
        sugestao.versao = ++contadorVersoes;
    } else {
        contadorVersoes = Math.max(contadorVersoes, sugestao.versao);
    }
}

const SIMULAR_PERDA_RESPOSTA = process.env.SIMULAR_PERDA_RESPOSTA === '1';
let pedidos503Restantes = Number(process.env.SIMULAR_503 ?? 0);
if (!Number.isSafeInteger(pedidos503Restantes) || pedidos503Restantes < 0) {
    console.error('Erro: SIMULAR_503 tem de ser um inteiro não negativo.');
    process.exit(1);
}

function limparChavesExpiradas() {
    const agora = Date.now();
    for (const [chave, registo] of pedidosIdempotentes) {
        if (agora - registo.criadoEm >= DURACAO_IDEMPOTENCIA) {
            pedidosIdempotentes.delete(chave);
        }
    }
}

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
        versao: '2.2.0'
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

// GET /v2/categorias
// Devolve as categorias disponíveis para criar sugestões.
app.get('/v2/categorias', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');

    return res.status(200).json({
        itens: [
            { codigo: 'instalacoes', descricao: 'Instalações' },
            { codigo: 'ensino', descricao: 'Ensino' },
            { codigo: 'servicos', descricao: 'Serviços' },
            { codigo: 'atividades', descricao: 'Atividades' },
            { codigo: 'outra', descricao: 'Outra' }
        ]
    });
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

// GET /v2/sugestoes/alteracoes
// Devolve apenas as sugestões com versão superior ao cursor recebido.
app.get('/v2/sugestoes/alteracoes', exigirToken, (req, res) => {
    res.set('Cache-Control', 'private, no-store');

    const desdeTexto = req.query.desde;
    const desde = Number(desdeTexto);
    if (
        typeof desdeTexto !== 'string' ||
        !/^(0|[1-9][0-9]*)$/.test(desdeTexto) ||
        !Number.isSafeInteger(desde)
    ) {
        return res.status(400).json({
            codigo: 400,
            mensagem: 'O parâmetro desde deve ser um inteiro não negativo.',
            detalhes: [
                {
                    campo: 'desde',
                    problema: 'Indique um inteiro maior ou igual a zero.'
                }
            ]
        });
    }

    const alteracoes = sugestoesEmMemoria
        .filter(s =>
            s.versao > desde &&
            (req.utilizador.papel === 'servicos' ||
                String(s.numeroAluno) === String(req.utilizador.utilizador))
        )
        .sort((a, b) => a.versao - b.versao);

    return res.status(200).json({
        alteracoes,
        cursor: alteracoes.length > 0
            ? alteracoes[alteracoes.length - 1].versao
            : desde
    });
});

// POST /v2/sugestoes
// Cria sugestões; com Idempotency-Key, repetir não cria duplicados.
app.post('/v2/sugestoes', exigirToken, (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (pedidos503Restantes > 0) {
        pedidos503Restantes--;
        return res.status(503).set('Retry-After', '2').json({
            codigo: 503,
            mensagem: 'Serviço temporariamente indisponível.'
        });
    }

    if (req.utilizador.papel !== 'aluno') {
        return res.status(403).json({
            codigo: 403,
            mensagem: 'Apenas os alunos podem submeter sugestões.'
        });
    }

    const idempotencyKey = req.get('Idempotency-Key');
    if (
        idempotencyKey !== undefined &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
    ) {
        return res.status(400).json({
            codigo: 400,
            mensagem: 'A Idempotency-Key deve ter o formato UUID.',
            detalhes: [
                {
                    campo: 'Idempotency-Key',
                    problema: 'O cabeçalho deve conter um UUID válido.'
                }
            ]
        });
    }

    const chavePedido = idempotencyKey
        ? `${req.utilizador.utilizador}:${idempotencyKey.toLowerCase()}`
        : null;

    // Comparamos o corpo recebido para detetar reutilizações indevidas.
    const corpoRecebido = JSON.stringify(req.body ?? {});
    if (chavePedido !== null) {
        limparChavesExpiradas();
        const anterior = pedidosIdempotentes.get(chavePedido);
        if (anterior) {
            if (anterior.corpoRecebido !== corpoRecebido) {
                return res.status(409).json({
                    codigo: 409,
                    mensagem: 'A Idempotency-Key já foi usada com um corpo diferente.'
                });
            }
            return res.status(anterior.codigo)
                .location(anterior.location)
                .set('Idempotent-Replayed', 'true')
                .json(anterior.resposta);
        }
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
        dataResolucao: null,
        versao: ++contadorVersoes
    };

    sugestoesEmMemoria.push(novaSugestao);
    const location = `/v2/sugestoes/${novoId}`;

    // A chave só é registada depois da criação bem-sucedida.
    if (chavePedido !== null) {
        pedidosIdempotentes.set(chavePedido, {
            corpoRecebido,
            codigo: 201,
            location,
            resposta: novaSugestao,
            criadoEm: Date.now()
        });

        if (SIMULAR_PERDA_RESPOSTA) {
            req.socket.destroy();
            return;
        }
    }

    return res.status(201).location(location).json(novaSugestao);
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
