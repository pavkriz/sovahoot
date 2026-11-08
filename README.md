# 🦉 Sovahoot

Webová kvízová hra ve stylu Kahootu: moderátor promítá otázky, hráči odpovídají na mobilech
současně, body za správnost a rychlost, žebříček po každé otázce, na konci podium. Výsledky
každého sezení se ukládají do databáze a jsou vidět v historii.

Běží celá na **Cloudflare free plánu** (Workers + Durable Objects + D1), bez vlastního serveru.

## Jak to funguje

```
Prohlížeč hráče ──WS──┐                      ┌── D1 (tabulka scores)
Prohlížeč moderátora ─WS─┼─► Worker (Hono) ─► Durable Object GameRoom (1 instance / PIN)
                       │        │
   SPA (Vue 3) ◄─ static assets ┘
```

- **Hry, PINy a otázky** jsou zadrátované v `src/shared/games.ts`. Přidání hry = přidání záznamu do pole.
- **Herní logika** je čistá třída `GameEngine` (`src/worker/game-engine.ts`), bez I/O, pokrytá unit testy.
- **Durable Object `GameRoom`** (`src/worker/game-room.ts`) drží stav jedné místnosti, obsluhuje WebSockety
  (hibernation API), uzavírá otázku alarmem po vypršení času a při konci hry zapíše výsledky do D1.
- **Klient** (`src/client/`) je Vue 3 SPA: `/` vstup hráče, `/play` hra, `/host` moderátor, `/history` výsledky.
- **Moderátor** se přihlašuje heslem (`HOST_PASSWORD`), dostane HMAC token platný 24 h.

### Odolnost proti výpadkům spojení

Pravda o hře žije jen na serveru; spojení je pomíjivé.

- Identita hráče (`playerId`) je v `localStorage` – po reloadu či výpadku se hráč vrátí na své místo se skóre.
- Klient se automaticky znovu připojuje (backoff 0,5–5 s), okamžitě při `online` a probuzení záložky.
- Heartbeat ping/pong odhalí mrtvé spojení; čas otázky je synchronizovaný se serverem.
- Když WebSockety nejdou navázat (3 neúspěchy), klient přejde na HTTP polling po 2 s a stále lze hrát.
- Otázku ukončuje alarm na serveru – hra pokračuje, i když moderátorovi vypadne spojení.
- Příkazy moderátora i odpovědi hráčů jsou idempotentní (dvojklik ani opakování po reconnectu hru neposune dvakrát).

## Lokální vývoj

Požadavky: Node 24+. Cloudflare účet není potřeba – `workerd` (produkční runtime) běží lokálně včetně
Durable Objects, alarmů i D1 (SQLite soubor v `.wrangler/state/`).

```bash
npm install
cp .dev.vars.example .dev.vars   # heslo moderátora pro lokál (výchozí: sovahoot)
npm run dev                      # http://localhost:5173 – aplikuje lokální D1 migrace a spustí Vite + workerd
```

Pak otevři `/host`, přihlas se heslem, vyber hru a v dalších oknech (nebo na mobilech v síti, `npm run dev -- --host`)
otevři `/`, zadej PIN a přezdívku. Testy (integrační i e2e) používají první hru z `games.ts`, žádná testovací hra
v datech není.

Užitečné:

```bash
npm run check          # typová kontrola (wrangler types + vue-tsc + tsc)
npm test               # unit testy (engine, auth, klientský socket) + integrační testy ve workerd (Worker, DO, D1)
npm run test:e2e       # Playwright: moderátor + 2 hráči projdou celou hru (poprvé: npx playwright install chromium)
npm run build && npm run preview   # produkční build servírovaný z workerd
npx wrangler d1 execute sovahoot --local --command "select * from scores"
```

Vyčištění lokálních místností a databáze: smazat adresář `.wrangler/state`.

Známá drobnost: po úpravě `index.html` Vite restartuje server a stránka se pak může zaseknout při načítání
předbalených závislostí (`vue.js`). Pomůže ukončit a znovu spustit `npm run dev`. Změny ve `src/` se načítají
za běhu bez problémů.

## Nasazení na Cloudflare

Jednorázově (v Cloudflare účtu):

```bash
npx wrangler login
npx wrangler d1 create sovahoot          # vypsané database_id vlož do wrangler.jsonc (není tajné)
npm run deploy                           # první ruční deploy: migrace + wrangler deploy
npx wrangler secret put HOST_PASSWORD    # heslo moderátora (Worker už musí existovat)
```

Aplikace běží na vlastní doméně `sovahoot.gohub.cz` (`routes` ve `wrangler.jsonc`). Zóna `gohub.cz` je vedená
v tomtéž Cloudflare účtu; DNS záznam i certifikát založí wrangler při prvním deployi sám.

### Automatický deploy z GitHubu

Workflow `.github/workflows/ci.yml`:

- **job `test`** – na každý pull request i push do `main`: typová kontrola, unit + integrační testy, build,
  Playwright e2e. PR nikdy nenasazuje.
- **job `deploy`** – jen po úspěšném `test` na pushi do `main`: aplikuje D1 migrace a nasadí Worker se SPA.

Potřebné GitHub secrets (Settings → Secrets and variables → Actions):

| Secret | Hodnota |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token: šablona „Edit Cloudflare Workers“ + Account → D1 → Edit + Zone → DNS → Edit (jen zóna gohub.cz, kvůli vlastní doméně) |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID z přehledu Workers v dashboardu |

Doporučeno zapnout branch protection na `main` s povinným checkem `test`.

`HOST_PASSWORD` zůstává jen jako Worker secret v Cloudflare (šifrovaně u Workeru `sovahoot`); v repu ani v GitHub
secrets není a deploy ho nepřepisuje. Změna hesla = znovu `npx wrangler secret put HOST_PASSWORD`; staré tokeny
moderátora tím přestanou platit.

## Struktura

```
src/shared/     typy a zadrátované hry (sdílí Worker i klient)
src/worker/     Hono router, Durable Object GameRoom, GameEngine, auth, D1 dotazy (+ unit testy)
src/client/     Vue 3 SPA: views, komponenty, composable useGameSocket (+ test)
test/worker/    integrační testy běžící ve workerd (@cloudflare/vitest-plugin)
e2e/            Playwright scénář
migrations/     D1 migrace
```

## Limity free plánu

30 hráčů × 2 hry týdně je hluboko pod limity (Workers 100 000 požadavků/den, Durable Objects a D1 na free
plánu dostupné). WebSocket zprávy se u hibernovaných objektů účtují 20 : 1.
