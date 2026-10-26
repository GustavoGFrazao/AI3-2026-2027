# Registo de Testes — OPENAPI02

## 1. Credenciais de teste

### Utilizador 1 — Aluna

- **Utilizador:** `12345`
- **Nome:** Ana Silva
- **Papel:** `aluno`
- **Palavra-passe:** `UmaSenhaDeTeste123!`

### Utilizador 2 — Aluno

- **Utilizador:** `67890`
- **Nome:** Bruno
- **Papel:** `aluno`
- **Palavra-passe:** `BrunoTeste2026!`

### Utilizador 3 — Serviços

- **Utilizador:** `rita.sousa`
- **Nome:** Rita
- **Papel:** `servicos`
- **Palavra-passe:** `RitaTeste2026!`

Estas credenciais destinam-se exclusivamente a testes locais.

## 2. Configuração do servidor

- **Porta:** 3000
- **Versão da API:** v2
- **Validade do token JWT:** 900 segundos (15 minutos)
- **Algoritmo de assinatura JWT:** HS256
- **Algoritmo de hash das palavras-passe:** bcrypt
- **Custo do bcrypt:** 10

O segredo JWT é definido através da variável de ambiente `JWT_SEGREDO`, no ficheiro `.env`. Este ficheiro não deve ser incluído no repositório.

## 3. Funcionamento da autenticação e autorização

O cliente envia as credenciais para `POST /v2/tokens`. Quando as credenciais são válidas, o servidor devolve um token JWT que deve ser enviado nos pedidos protegidos através do cabeçalho:

`Authorization: Bearer <token>`

O token contém os seguintes claims:

| Claim | Significado |
|---|---|
| `sub` | Identificador do utilizador |
| `nome` | Nome do utilizador |
| `papel` | Papel do utilizador |
| `iat` | Instante de emissão do token |
| `exp` | Instante de expiração do token |

Os utilizadores com o papel `aluno` apenas podem consultar as suas próprias sugestões. Os utilizadores com o papel `servicos` podem consultar todas as sugestões.

## 4. Lista de testes

- [x] Iniciar o servidor com a configuração `.env`.
- [x] Autenticar com credenciais válidas.
- [x] Verificar a rejeição de credenciais incorretas.
- [x] Aceder a uma rota protegida sem token.
- [x] Aceder a uma rota protegida com token válido.
- [x] Verificar o comportamento do logout no cliente.
- [x] Verificar a rejeição de tokens alterados, expirados e com algoritmo não permitido.
- [x] Validar o contrato OpenAPI com o Redocly CLI.

## 5. Ponto 27 — Verificação do contrato

As alterações seguintes correspondem aos testes de mutação propostos no enunciado. As mensagens exatas não foram registadas durante os testes realizados, pelo que não são inventadas nesta tabela.

| Alteração introduzida | Sintaxe YAML errada, OpenAPI inválido, exemplo inválido ou válido? | Ferramenta | Mensagem obtida | O que a mensagem permitiu (ou não) concluir |
|---|---|---|---|---|
| Referir `tokenJWT` no `security` da raiz sem o declarar em `securitySchemes` | OpenAPI inválido | Redocly CLI | Não registada | A referência a um esquema de segurança tem de corresponder a um esquema declarado. |
| Escrever `type: bearer` em vez de `type: http` | OpenAPI inválido | Redocly CLI | Não registada | O tipo Bearer é definido com `type: http` e `scheme: bearer`. |
| Escrever `- tokenJWT: [servicos]` em `registarAcompanhamento` | OpenAPI inválido | Redocly CLI | Não registada | Um esquema Bearer não utiliza scopes como os esquemas OAuth2. |
| Retirar o `security: []` de `listarCategorias` | Válido, mas altera o comportamento de segurança | Redocly CLI | Não registada | A operação passa a herdar a segurança global, deixando de ser explicitamente pública. |
| Manter `numeroAluno` em `required` de `SugestaoNova` após remover a propriedade | OpenAPI inválido | Redocly CLI | Não registada | Uma propriedade declarada como obrigatória tem de estar definida no esquema. |
| Indicar `tipo: bearer` em minúsculas no exemplo do `Token` | Exemplo potencialmente inválido, conforme o esquema definido | Redocly CLI | Não registada | É necessário verificar se o exemplo respeita o valor permitido pelo esquema. |

## 6. Ponto 28 — Testes do servidor

| # | Pedido | Código e cabeçalhos obtidos | Corpo e observação |
|---|---|---|---|
| T1 | `POST /v2/tokens` com credenciais válidas da Ana | `200`; `Cache-Control: no-store` | Token JWT devolvido, com validade de 900 segundos. |
| T2 | `POST /v2/tokens` com palavra-passe errada | `401`; sem `WWW-Authenticate` | `{"codigo":401,"mensagem":"Utilizador ou palavra-passe inválidos."}` |
| T3 | `POST /v2/tokens` com utilizador `99999` | `401`; sem `WWW-Authenticate` | Corpo idêntico ao de T2, byte a byte. |
| T4 | `POST /v2/tokens` com `"utilizador": 12345` | `400` | Erro em JSON, mas sem o elemento `detalhes` esperado. Teste parcialmente concluído. |
| T5 | `POST /v2/tokens` com corpo `{utilizador:` | `400` | Erro em JSON a indicar que o corpo contém JSON inválido. |
| T6 | `GET /v2/sugestoes` sem `Authorization` | `401`; `WWW-Authenticate: Bearer`; `Cache-Control: no-store` | Erro de autenticação em JSON. |
| T7 | `GET /v2/sugestoes` com token da Ana | `200`; `Cache-Control: private, no-cache` | Apenas as duas sugestões da Ana. |
| T8 | `GET /v2/sugestoes` com token da Rita | `200` | As quatro sugestões existentes nos dados de teste. |
| T9 | T7 com um carácter do payload alterado | `401`; `WWW-Authenticate: Bearer error="invalid_token"` | Token alterado rejeitado. |
| T10 | T7 com token expirado | `401`; `WWW-Authenticate: Bearer error="invalid_token"` | Token expirado rejeitado após o teste com validade temporária de 10 segundos. A validade foi depois reposta para 900 segundos. |
| T11 | T7 com token cujo cabeçalho contém `{"alg":"none","typ":"JWT"}` | `401`; `WWW-Authenticate: Bearer error="invalid_token"` | Token rejeitado. |
| T12 | T7 após «Terminar sessão» no cliente, reutilizando o token copiado | `200` | O token continuou válido no servidor. O logout local não revoga o token emitido. |

## 7. Ponto 29 — Verificação do cliente

| Verificação | Resultado observado |
|---|---|
| (a) Pedido `POST /v2/tokens` e respetiva resposta | Pedido efetuado com sucesso; resposta `200` com token JWT e validade de 900 segundos. |
| (b) Cabeçalho `Authorization` no pedido das sugestões | Confirmado no separador Rede: `Authorization: Bearer <token>`. |
| (c) Termo automático da sessão com `JWT_VALIDADE=30` | Não registado. |
| (d) Comportamento ao recarregar a página com sessão ativa | Não registado de forma conclusiva. |
| (e) Conteúdo de `localStorage` e `sessionStorage` | Não registado. |

## 8. Ponto 30 — Construções utilizadas

| Construção | Onde foi utilizada | O que passou a ser exigido | O que continua a ser permitido |
|---|---|---|---|
| `securitySchemes` `http`/`bearer` | `components.securitySchemes.tokenJWT` | O token enviado nas operações protegidas tem de ser um Bearer JWT válido. | O cliente pode obter um token através do endpoint de autenticação e utilizá-lo nos pedidos protegidos. |
| `security` na raiz | Nível global do contrato OpenAPI | As operações herdam o requisito global de autenticação, salvo substituição explícita. | Uma operação pode definir os seus próprios requisitos de segurança. |
| `security: []` | Operações públicas, como `listarCategorias` | Não exige autenticação nessa operação. | A operação pode ser chamada sem token, apesar da segurança global. |
| `readOnly` em `numeroAluno` | Esquema `Sugestao` | O campo é apenas de leitura e é fornecido pelo servidor. | O cliente pode receber e consultar o campo nas respostas. |
| Resposta `401` + `WWW-Authenticate` | Autenticação ausente ou token inválido | O servidor indica que é necessária autenticação ou que o token não é válido. | O corpo da resposta pode variar conforme o motivo da falha. |
| Resposta `403` | Operações para as quais o utilizador não tem permissões | O utilizador autenticado não pode executar a operação solicitada. | Pode executar outras operações para as quais tenha permissões. |
| `exigirToken` + `jwt.verify` | Middleware de autenticação em `autenticacao.js` | O token tem de passar a verificação da assinatura, validade e algoritmo permitido. | Os pedidos que não necessitam de autenticação podem continuar a ser públicos. |
| `Cache-Control: no-store` em `criarToken` | `POST /v2/tokens` | A resposta não deve ser armazenada em cache. | O cliente pode receber e utilizar o token para iniciar sessão. |

## 9. Observações

Os testes demonstraram que a autenticação e a autorização são mecanismos distintos. A autenticação verifica a identidade do utilizador através de um token JWT; a autorização determina quais os recursos a que esse utilizador pode aceder.

A resposta igual para um utilizador inexistente e para uma palavra-passe incorreta evita revelar diretamente se uma conta existe.

Os testes também demonstraram que tokens alterados, expirados ou assinados com um algoritmo não permitido são rejeitados. Um utilizador autenticado, mas sem permissões suficientes, deve receber `403 Forbidden`.

O logout implementado no cliente elimina a sessão local, mas não revoga automaticamente um token ainda válido no servidor.

## 10. Reflexão final — Ponto 31

A implementação permitiu compreender a utilização de JWT para autenticação, a proteção de endpoints através de middleware e a distinção entre autenticação e autorização.

Os testes permitiram verificar o comportamento da API perante credenciais inválidas, pedidos sem autenticação, tokens alterados ou expirados e utilizadores com diferentes permissões.

A validação do contrato OpenAPI permitiu confirmar a sua validade estrutural. O teste T4 identificou um aspeto a melhorar: a resposta a credenciais com formato inválido deverá incluir o elemento `detalhes`, identificando os campos inválidos.

Como melhoria futura, poderá ser implementado um mecanismo de revogação de tokens para que o logout também impeça a utilização posterior de um token ainda válido.
