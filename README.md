<div align="center">  <img src="frontend/assets/logo.png" alt="Trifarmas" width="300"> </div>
<br>
<div align="center">
  <img src="frontend/assets/logo.png" alt="Trifarmas" width="300">

  <img src="https://img.shields.io/badge/license-MIT-1e8a4c?style=for-the-badge" alt="MIT License">
  <img src="https://img.shields.io/badge/javascript-f7df1e?style=for-the-badge&logo=javascript&logoColor=000000" alt="JavaScript">
  <img src="https://img.shields.io/badge/node.js-5fa04e?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/postgresql-4169e1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel">
  <img src="https://img.shields.io/badge/render-5a4fcf?style=for-the-badge&logo=render&logoColor=white" alt="Render">


</div>

<img src="frontend/assets/preview.png" alt="Trifarmas screens: medicine search, reminders and orders">

## Features

| Feature | How it works |
|---------|--------------|
| Price comparison | 322 medicines across 6 pharmacies, cheapest first |
| Camera | Reads the medicine box or the prescription and opens the prices |
| Orders | Cart, simulated payment, in-store pickup with a code or motorcycle delivery |
| Prescriptions | Upload a PDF/photo or show it at pickup |
| Reminders | Medicine schedule and a warning when your supply at home is running low |
| Map | Real pharmacies nearby, by GPS or by postal code (CEP) |
| Points | 1 point per R$ 1 spent, redeemable for discount coupons |
| Counter | The pharmacy confirms pickups at `pharmacy.html` |

**Next steps:** real prices (CMED table), real Pix payments, AI prescription reading and Android/iOS apps.

## Getting started

Requires **Node.js 20+** and **PostgreSQL 14+**.

```bash
git clone https://github.com/SEU-USUARIO/trifarmast.git
cd trifarmast/backend
npm install
npm run dev                    # API at http://localhost:3000
```

Before `npm run dev`, create `backend/.env`:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/trifarmas
DATABASE_SSL=false
JWT_SECRET=replace-with-32-or-more-random-characters
PHARMACY_PIN=change-this-password
```

In another terminal, inside `frontend`, run `python3 -m http.server 8000` and open
`http://localhost:8000`. A demo account is created for you: **trifarmas@gmail.com** / **123456**.

> [!TIP]
> The tables and the catalog are created automatically the first time the API starts.

## Deployment

| Part | Folder | Where (free) |
|------|--------|--------------|
| Website | `frontend/` | Vercel |
| API | `backend/` | Render |
| Database | — | Neon |

On Render, set `DATABASE_URL` (from Neon), `JWT_SECRET`, `CORS_ORIGINS` (the Vercel URL),
`PHARMACY_PIN` and `GOOGLE_CLIENT_ID`. On Vercel, point `API_URL` in `frontend/config.js` to Render.

> [!NOTE]
> Render's free server sleeps after 15 minutes of inactivity and takes about a minute to wake up.

## Security

Passwords hashed with bcrypt, lockout after repeated failed attempts, sessions revoked on password change,
uploaded files validated before saving and all text escaped before it reaches the page.
Tests live in `backend/test/` and run with `npm test`.

## Team

<table>
  <tr>
    <td align="center">
      <img src="frontend/assets/logo-team-white-big.png" alt="Trifarmas" width="100px">
    </td>
    <td align="center">
      <a href="https://github.com/vhko20" title="GitHub profile">
        <img src="frontend/assets/oki.jfif" alt="vitor" width="100px">
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/enzocavalcante-code" title="GitHub profile">
        <img src="frontend/assets/enzo.jfif" alt="enzo" width="100px">
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/vnniwzx" title="GitHub profile">
        <img src="frontend/assets/vinicius.jfif" alt="vini" width="100px">
      </a>
    </td>
    <td align="center">
      <img src="frontend/assets/said.jfif" alt="said" width="100px">
    </td>
    <td align="center">
      <img src="frontend/assets/anselmo.jfif" alt="anselmo" width="100px">
    </td>
  </tr>
</table>

## License

Distributed under the MIT License. See [LICENSE.md](LICENSE.md) for details.

> Prices, payments and prescription approval are **simulated**, for educational purposes only.
