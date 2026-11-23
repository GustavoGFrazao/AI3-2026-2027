const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Servir os ficheiros da PWA
app.use(express.static(path.join(__dirname, 'public')));

// Resposta provisória para as operações ainda não implementadas
function naoImplementado(req, res) {
    return res.status(501).json({
        codigo: 'NOT_IMPLEMENTED',
        mensagem: 'Operação ainda não implementada neste sprint.'
    });
}

// 1. GET /v1/categorias
app.get('/v1/categorias', naoImplementado);

// 2. GET /v1/ocorrencias/semelhantes
app.get('/v1/ocorrencias/semelhantes', naoImplementado);

// 3. GET /v1/ocorrencias
app.get('/v1/ocorrencias', naoImplementado);

// 4. POST /v1/ocorrencias
app.post('/v1/ocorrencias', naoImplementado);

// 5. POST /v1/ocorrencias/:id/reforcos
app.post('/v1/ocorrencias/:id/reforcos', naoImplementado);

// 6. GET /v1/ocorrencias/:id/fotografia
app.get('/v1/ocorrencias/:id/fotografia', naoImplementado);

// 7. GET /v1/ocorrencias/alteracoes
app.get('/v1/ocorrencias/alteracoes', naoImplementado);

// 8. PATCH /v1/admin/ocorrencias/:id
app.patch('/v1/admin/ocorrencias/:id', naoImplementado);

// Resposta para rotas inexistentes
app.use((req, res) => {
    res.status(404).json({
        codigo: 'NOT_FOUND',
        mensagem: 'Rota não encontrada.'
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor Reporta a funcionar em http://localhost:${PORT}`);
});