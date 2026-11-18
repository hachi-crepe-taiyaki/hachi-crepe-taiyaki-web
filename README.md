# Hachi Conecta — Interface Web

Aplicação web responsiva do programa de fidelidade e feedback da Hachi Crepe & Taiyaki. A interface usa React e Vite; os fluxos e dados continuam locais, sem integração ativa com APIs.

## Telas e jornadas

- Home, cadastro em duas etapas e login.
- Cartão de fidelidade com 12 selos, registro manual/QR, resgate e bilhete.
- Perfil, edição e exclusão lógica da conta.
- Cardápio consultivo, sem fluxo de pedidos.
- Painel administrativo com feedbacks e distribuição dos cadastros por localização.
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

Na Home, abra **Acessos rápidos de demonstração** para entrar diretamente como Cliente, Atendente ou Administração. Também é possível entrar pelo formulário com qualquer uma destas contas:

- `camila@demo.hachi`
- `julia@demo.hachi`
- `leonardo@demo.hachi`

Senha para as três contas: `hachi123`. Novos cadastros são criados e autenticados localmente. CEP, cidade e bairro/região são preenchidos manualmente.

## Observações

- As contas, feedbacks e produtos iniciais são dados fictícios; os demais dados são salvos apenas neste navegador e não são sincronizados.
- A senha dos cadastros é armazenada localmente sem proteção de produção. Use somente dados de teste; esta versão não deve ser usada para contas reais.
- Pedidos não são registrados, então o ticket médio não está disponível. O painel mostra a contagem de feedbacks, clientes e resgates locais.
- O código de compra e o QR gerados pelo atendente são locais e só podem ser usados neste navegador.
- A integração com a API Hachi e a consulta de CEP estão desativadas e documentadas no código para eventual reativação.
- Os textos jurídicos oficiais ainda precisam ser fornecidos pelo grupo e pelo estabelecimento.

## Arquivos

- `index.html`: ponto de entrada da aplicação.
- `app.css`: tokens, componentes e layouts responsivos.
- `app.js`: navegação, formulários, armazenamento local e QR Code.
- `src/main.jsx`: entrada React carregada pelo Vite.
- `src/components/RatingDistribution.jsx`: componente acessível de distribuição de notas no dashboard.
- `login.html` e `cadastro.html`: redirecionamentos para as respectivas rotas da aplicação.
