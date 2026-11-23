# Reporta — Sprint E2-01

## 1. Diagnóstico inicial

### (a) Duas pessoas comunicam o mesmo problema sem rede

Quando a Ana e o Bruno comunicam o mesmo buraco sem rede, as duas comunicações ficam inicialmente guardadas nos respetivos dispositivos. Quando a Ana sincroniza primeiro, o servidor recebe a comunicação e cria uma ocorrência.

Quando o Bruno sincronizar, o servidor deve verificar se já existe uma ocorrência semelhante, tendo em conta a categoria, a localização e o estado. Se encontrar uma ocorrência que corresponda ao mesmo problema, deve associar a comunicação do Bruno à ocorrência existente, em vez de criar outra.

Se a Ana tentar enviar a mesma comunicação duas vezes, o sistema também não deve contabilizá-la duas vezes. Para isso, os pedidos de criação devem ser idempotentes, permitindo reconhecer uma repetição do mesmo pedido.

### (b) GPS com precisão de 60 m e raio de 15 m

Uma precisão de GPS de 60 m significa que a localização indicada pode ter um erro considerável. Como o raio utilizado para detetar duplicados é de apenas 15 m, podem ocorrer erros nos dois sentidos.

Por um lado, dois problemas diferentes podem ser considerados iguais se as posições indicadas pelo GPS forem imprecisas e ficarem próximas. Por outro lado, duas comunicações do mesmo problema podem ficar com coordenadas suficientemente diferentes para não serem consideradas duplicadas.

A interface deve informar o cidadão quando existem ocorrências semelhantes, permitindo-lhe confirmar se está a comunicar o mesmo problema ou um problema diferente. A localização e a precisão do GPS devem ser consideradas, evitando tratar a deteção de duplicados como uma certeza.

### (c) Comunicação offline fundida na ocorrência 87

Quando a comunicação do Rui chega ao servidor e é associada à ocorrência 87, o dispositivo deve atualizar o registo local, associando-o à ocorrência que já existe no servidor.

O dispositivo não deve simplesmente apagar a comunicação local sem guardar a informação da associação. Deve atualizar os dados locais para que a comunicação fique sincronizada com a ocorrência 87, evitando que volte a ser enviada como se fosse uma nova ocorrência.

### (d) Porque não basta consultar ocorrências semelhantes antes de criar?

Consultar ocorrências semelhantes antes de criar não garante que não existam duplicados, porque a informação pode mudar entre a consulta e o pedido de criação.

Por exemplo, dois cidadãos podem consultar simultaneamente a lista de ocorrências semelhantes e não encontrar nenhum problema registado. Ambos podem, depois, enviar a comunicação, fazendo com que o servidor receba duas criações.

Outro exemplo é uma comunicação feita sem rede. Quando o cidadão consulta as ocorrências, pode não conseguir obter informação atualizada. Entretanto, outro cidadão pode ter sincronizado uma comunicação semelhante.

Por isso, a deteção de duplicados deve ser feita também no servidor, que é responsável por decidir se cria uma nova ocorrência ou associa a comunicação a uma ocorrência existente.

## 2. Tabela de pedidos da API (4.1)

| Pedido | `Cache-Control` | Quem o faz (página / SW) | Funciona sem rede? | Pode ser repetido sem efeitos adicionais? |
|---|---|---|---|---|
| `GET /v1/categorias` | `no-store` (não usar Cache API) | Página | Não, salvo dados guardados localmente | Sim |
| `GET /v1/ocorrencias/semelhantes` | `no-store` | Página | Não | Sim |
| `GET /v1/ocorrencias?bbox=` | `no-store` | Página | Não | Sim |
| `POST /v1/ocorrencias` sem `Idempotency-Key` | `no-store` | SW | A comunicação fica pendente localmente, mas não pode ser enviada | Não |
| `POST /v1/ocorrencias` com `Idempotency-Key` | `no-store` | SW | A comunicação fica pendente localmente e é enviada quando houver rede | Sim, utilizando a mesma `Idempotency-Key` |
| `POST /v1/ocorrencias/{id}/reforcos` com `Idempotency-Key` | `no-store` | SW | O reforço fica pendente localmente e é enviado quando houver rede | Sim, utilizando a mesma `Idempotency-Key` |
| `GET /v1/ocorrencias/alteracoes` | `no-store` | SW | Não | Sim |

### Antes de avançar

Sem OAuth, o cidadão é identificado pelo cabeçalho `X-Cidadao`, que contém um UUID. Se esse cabeçalho não estiver presente nos pedidos protegidos, o servidor responde com `401`. Com OAuth, a identificação do cidadão passa a estar associada à identidade autenticada, em vez de depender apenas da identificação anónima.

Uma resposta de `GET /v1/ocorrencias/semelhantes` não deve ser servida da Cache API, porque depende da localização e da categoria indicadas no pedido e necessita de informação atualizada do servidor. Uma resposta em cache poderia estar desatualizada e apresentar ocorrências que já foram resolvidas ou que entretanto sofreram alterações. Por isso, este pedido deve ser feito diretamente ao servidor e não deve ser guardado na Cache API.
