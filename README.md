# Hachi Conecta — Interface Web

Aplicação web responsiva do programa de fidelidade e feedback da Hachi Crepe & Taiyaki. A interface usa HTML, CSS e JavaScript vanilla; o Vite serve a aplicação e executa o build, sem integração ativa com APIs.

## Telas e jornadas

- Landing page institucional com especialidades, endereço, horários e acesso direto às jornadas.
- Cadastro em duas etapas e login.
- Cartão de fidelidade com 12 selos, registro manual/QR, resgate e bilhete.
- Perfil, edição e exclusão lógica da conta.
- Cardápio consultivo com as seis categorias oficiais, busca por nome/ingrediente, preços e identificação dos itens elegíveis para resgate com 12 selos; não há fluxo de pedidos.
- Painel administrativo com abas de visão geral e clientes, KPIs com comparação ao período anterior, busca por palavras nos comentários, listas expansíveis de feedbacks e cidades, exportação CSV, filtros combináveis (incluindo faixa etária), insights de segmento e histórico individual.
- Fluxo de atendente para gerar códigos de compra e exibir QR Code.
- Animações suaves respeitam a preferência por movimento reduzido; modais fecham por Escape ou clique no fundo e restauram o foco.
- Nota de feedback pode ser escolhida com mouse, teclado ou toque.

## Executar em modo local

Requer Node.js e npm. Na pasta `hachi-crepe-taiyaki-web`, instale as dependências e inicie o servidor:

```bash
npm install
npm run dev
```

Para gerar a versão de produção, use `npm run build`; para executar os testes, use `npm test`.

Não é necessário iniciar a API. A aplicação não envia solicitações para o servidor nem para serviços externos.

Os dados ficam no `localStorage` deste navegador. O login permanece ativo na aba atual; limpar os dados do site remove os cadastros, selos, feedbacks e resgates locais. A leitura de QR pela câmera depende de HTTPS/localhost, permissão e suporte do navegador; a digitação do código também funciona sem câmera.

## Acessos de exemplo

Na Home, abra **Acesso da equipe / demonstração** para testar as jornadas de cliente, atendente e administração. Para entrar como cliente, use o formulário com a conta:

- `camila@demo.hachi`

Também estão disponíveis:
- `julia@demo.hachi`
- `leonardo@demo.hachi`

Senha para as contas de demonstração: `hachi123`. Os dados iniciais incluem clientes fictícios de diferentes regiões e idades, feedbacks e histórico de fidelidade. Novos cadastros são criados e autenticados localmente. CEP, cidade, bairro/região e data de nascimento são preenchidos manualmente.

## Observações

- As contas, feedbacks, produtos e movimentações iniciais são dados fictícios; os demais dados são salvos apenas neste navegador e não são sincronizados.
- A cortesia com 12 selos pode ser escolhida entre os itens elegíveis de Taiyaki, Crepes Doces — Harajuku Style, Crepe Japonês Salgado e Menu Vegano. Bases de crepe, bebidas e adicionais pagos não são elegíveis.
- A senha dos cadastros é armazenada localmente sem proteção de produção. Use somente dados de teste; esta versão não deve ser usada para contas reais.
- Pedidos não são registrados. O painel apresenta selos emitidos, clientes ativos, avaliações e resgates locais; o gasto no drawer do cliente é uma estimativa mínima baseada nos selos históricos e no valor elegível de R$ 40,00.
- O código de compra e o QR gerados pelo atendente são locais e só podem ser usados neste navegador.
- A integração com a API Hachi e a consulta de CEP estão desativadas e documentadas no código para eventual reativação.
- Os textos jurídicos oficiais ainda precisam ser fornecidos pelo grupo e pelo estabelecimento.

## Arquivos

- `index.html`: ponto de entrada da aplicação.
- `app.css`: tokens, componentes e layouts responsivos.
- `app.js`: navegação, formulários, armazenamento local e QR Code.
- `src/app-interactions.test.js`: teste das interações locais, do seed e do seletor de estrelas.
- `login.html` e `cadastro.html`: redirecionamentos para as respectivas rotas da aplicação.
