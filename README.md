<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/assets/logo.png">
    <img src="frontend/assets/logo.png" alt="Trifarmas" width="300">
  </picture>
</div>

----------------------------------------------------------------------------

![Status:](https://img.shields.io/badge/status-em%20desenvolvimento-1e8a4c?style=for-the-badge)
![Licença:](https://img.shields.io/badge/licen%C3%A7a-MIT-1e8a4c?style=for-the-badge)
![JavaScript](https://img.shields.io/badge/javascript-f7df1e?style=for-the-badge&logo=javascript&logoColor=000000)
![Node.js](https://img.shields.io/badge/node.js-5fa04e?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgresql-4169e1?style=for-the-badge&logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Render](https://img.shields.io/badge/render-5a4fcf?style=for-the-badge&logo=render&logoColor=white)

<!-- Quer os badges com os números do repositório (tamanho, forks, issues)?
     Depois de publicar no GitHub, troque SEU-USUARIO/trifarmas pelo caminho real
     e tire estes cinco de dentro do comentário:

![GitHub repo size](https://img.shields.io/github/repo-size/SEU-USUARIO/trifarmas?style=for-the-badge&color=1e8a4c)
![GitHub language count](https://img.shields.io/github/languages/count/SEU-USUARIO/trifarmas?style=for-the-badge&color=1e8a4c)
![GitHub forks](https://img.shields.io/github/forks/SEU-USUARIO/trifarmas?style=for-the-badge&color=1e8a4c)
![GitHub issues](https://img.shields.io/github/issues/SEU-USUARIO/trifarmas?style=for-the-badge&color=1e8a4c)
![GitHub pull requests](https://img.shields.io/github/issues-pr/SEU-USUARIO/trifarmas?style=for-the-badge&color=1e8a4c)
-->

<img src="frontend/assets/preview.png" alt="Telas do Trifarmas: busca de remédios, lembretes e pedidos">

> O Trifarmas compara o preço do mesmo remédio em várias farmácias e mostra onde
> sai mais barato perto de você. Dá para montar o carrinho, pagar pelo app, retirar
> na farmácia com um código, lembrar a hora de tomar e juntar pontos que viram desconto.

### Ajustes e melhorias

O projeto ainda está em desenvolvimento e as próximas atualizações serão voltadas para as seguintes tarefas:

- [x] Comparar o preço de 160 remédios em 6 farmácias
- [x] Entrar com e-mail e senha ou com a conta do Google
- [x] Carrinho, pagamento e código de retirada
- [x] Receita médica: anexar PDF/foto ou mostrar na retirada
- [x] Pontos que viram cupons de desconto
- [x] Mapa com farmácias de verdade ao redor
- [x] Lembretes de remédio em três passos, com repetição por vários dias
- [x] Ver a senha enquanto digita
- [x] Modo escuro e tamanho do texto ajustável
- [ ] Ler a receita pela câmera e achar o remédio mais barato(com integração de IA)
- [ ] Preços de verdade (tabela da CMED e dados das farmácias parceiras)
- [ ] Pagamento de verdade com Pix
- [x] Retirada confirmada pela própria farmácia, no balcão (`frontend/farmacia.html`)
- [ ] Aplicativo para Android e IOS

## 💻 Pré-requisitos

Antes de começar, verifique se você atendeu aos seguintes requisitos:

- Você instalou a versão mais recente do `Node.js 20 ou superior` (a API não roda em versões mais antigas).
- Você tem um `PostgreSQL 14 ou superior` rodando na sua máquina — ou um banco gratuito no [Render](https://render.com).
- Você tem o `Python 3` instalado (só para abrir o site durante o desenvolvimento) ou qualquer outro servidor de arquivos.
- Você tem uma máquina `Windows, Linux ou macOS`. O projeto funciona igual nos três.
- Para o login com o Google, você criou um `ID do cliente OAuth` no [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

## 🚀 Instalando o Trifarmas

Para instalar o Trifarmas, siga estas etapas:

Linux e macOS:

```bash
git clone https://github.com/SEU-USUARIO/trifarmas.git
cd trifarmas/backend
cp .env.example .env     # abra o .env e preencha DATABASE_URL e JWT_SECRET
npm install
```

Windows:

```powershell
git clone https://github.com/SEU-USUARIO/trifarmas.git
cd trifarmas\backend
copy .env.example .env   # abra o .env e preencha DATABASE_URL e JWT_SECRET
npm install
```

Na primeira vez que a API subir, ela cria as tabelas sozinha e já preenche o
catálogo com as farmácias, os 160 remédios e as recompensas.

## ☕ Usando o Trifarmas

Para usar o Trifarmas, siga estas etapas:

```bash
# 1. a API (pasta backend)
npm run dev                    # http://localhost:3000

# 2. o site (em outro terminal, pasta frontend)
python3 -m http.server 8000    # no Windows: py -m http.server 8000
```

Abra `http://localhost:8000` e entre com a conta de teste que já vem criada:

```
e-mail: trifarmas@gmail.com
senha:  123456
```

Com o app aberto, você pode:

- **Buscar um remédio** pelo nome ou pelo princípio ativo (funciona com ou sem acento) e ver o preço em cada farmácia, da mais barata para a mais cara.
- **Montar o carrinho** e comparar quanto o pedido inteiro custa em cada farmácia antes de pagar.
- **Pagar** (simulado) e receber o **código de retirada** na aba Pedidos.
- **Resolver a receita** dos remédios que exigem: anexar PDF/foto ou mostrar na retirada.
- **Criar lembretes** em três toques — remédio, horário e dia —, com opção de repetir por 7, 15 ou 30 dias.
- **Ver as farmácias ao redor** no mapa, pela localização do aparelho ou digitando o CEP.
- **Juntar pontos** (1 ponto a cada R$ 1 pago) e trocar por cupons de desconto.

Para conferir se a API está no ar, abra `http://localhost:3000/health` — a resposta
deve ser `{"ok":true}`.

## 🌐 Publicando na internet

O projeto é dividido em duas partes, publicadas em lugares diferentes:

| Pasta       | O que é                                | Onde publicar |
|-------------|----------------------------------------|---------------|
| `frontend/` | Site estático (HTML, CSS, JS, imagens) | **Vercel**    |
| `backend/`  | API Node.js + banco PostgreSQL         | **Render**    |

**Render (backend):** crie um banco PostgreSQL (plano free) e um Web Service com
*Root Directory* `backend`, *Build* `npm install` e *Start* `npm start`. Preencha as
variáveis `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `CORS_ORIGINS`
(a URL do Vercel) e `PHARMACY_PIN` (a senha do balcão da farmácia). O arquivo `render.yaml` na raiz do repositório faz tudo isso de uma vez pelo
menu *New + → Blueprint*.

**Vercel (site):** aponte `API_URL` em `frontend/config.js` para o endereço do
Render, crie o projeto com *Root Directory* `frontend` e *Framework Preset* **Other**.
Por fim, adicione a URL do Vercel nas *Origens JavaScript autorizadas* do seu
Client ID do Google.

**Banco que não expira:** o PostgreSQL gratuito do Render é apagado 30 dias depois
de criado. Para não perder as contas, crie o banco no [Neon](https://neon.com)
(gratuito, sem prazo) e cole a *connection string* dele na variável `DATABASE_URL`
do Render. As tabelas e o catálogo são criados sozinhos na primeira vez que a API sobe.

## 🔒 Segurança

O que a API faz para não ser invadida:

- **Senhas** guardadas com bcrypt; senha nova precisa de 8 caracteres ou mais.
- **Força bruta:** 8 senhas erradas por conta em cada rede (30 no total) travam o
  login por 15 minutos; o mesmo vale para a senha do balcão (10 por rede, 100 no total).
  O IP vem da hospedagem, não do cabeçalho que o visitante escreve.
- **Sessão:** token assinado (HS256) válido por 7 dias; trocar a senha derruba as
  sessões abertas nos outros aparelhos. Trocar e-mail ou senha exige a senha atual.
- **Arquivos:** foto de perfil só JPG/PNG/WebP até 512 KB e receita só PDF/imagem
  até 8 MB, com o conteúdo conferido; pedidos comuns são limitados a 100 KB.
- **Banco:** toda consulta usa parâmetros (sem SQL montado com texto do usuário) e
  cada conta só enxerga os próprios pedidos, lembretes e cupons.
- **Site:** todo texto vindo de fora (nomes, endereços, leitura da câmera) é
  escapado antes de ir para a tela, e as páginas não abrem dentro de outros sites.
- **Conta de teste:** a senha dela é pública, então e-mail e senha não podem ser alterados.

No Render, confira três variáveis: `JWT_SECRET` (aleatório, 32 caracteres ou mais —
use o botão *Generate*), `CORS_ORIGINS` (a URL do site no Vercel) e `PHARMACY_PIN`
(6 caracteres ou mais). Se alguma estiver fraca, a API avisa nos *Logs* com
`[segurança]`.

Os testes ficam em `backend/test/` (precisam de um PostgreSQL de teste):

```bash
DATABASE_URL=postgres://postgres@localhost:5432/trifarmas_test npm test
```



## 🤝 Colaboradores

Agradecemos às seguintes pessoas que contribuíram para este projeto:

<table>
  <tr>
    <td align="center">
              <img src="frontend/assets/logo-time-white-big.png" alt="Trifarmas" width="100px">
      </a>
    </td>
     <td align="center">
      <a href="https://github.com/vhko20" title="Perfil no GitHub">
              <img src="frontend/assets/oki.jfif" alt="vitor" width="100px">
      </a>
    </td>
        </td>
     <td align="center">
      <a href="https://github.com/enzocavalcante-code" title="Perfil no GitHub">
              <img src="frontend/assets/enzo.jfif" alt="enzo" width="100px">
      </a>
    </td>
       <td align="center">
      <a href="https://github.com/vnniwzx" title="Perfil no GitHub">
              <img src="frontend/assets/vinicius.jfif" alt="vini" width="100px">
      </a>
    </td>
      </td>
       <td align="center">
      <a href="https://github.com/" title="Perfil no GitHub">
              <img src="frontend/assets/said.jfif" alt="said" width="100px">
      </a>
    </td>
      </td>
       <td align="center">
      <a href="https://github.com/" title="Perfil no GitHub">
              <img src="frontend/assets/anselmo.jfif" alt="anselmo" width="100px">
      </a>
    </td>
  </tr>
</table>

---

Os preços, o pagamento e a aprovação da receita deste app são **simulados**, para
fins de estudo. Nenhuma cobrança é feita de verdade.
