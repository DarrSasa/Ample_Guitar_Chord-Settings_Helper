# Examinare `@heyputer/puter.js` v2.6.3

> Pachetul local din acest folder (`node_modules/@heyputer/puter.js`, 411 fișiere,
> bundle generat 2026-09-10) — ce conține, ce API expune și ce ne trebuie pentru
> `Data/`. Scris în urma examinării sursei (`src/`), tipurilor (`types/` + `index.d.ts`)
> și README-ului oficial.

---

## 1. Structura pachetului

| Cale | Ce e |
|---|---|
| `src/index.js` (1879 linii) | Inima SDK: detecția mediului (web/app/gui/nodejs/worker), origini, auth, înregistrarea modulelor |
| `src/modules/ai/` | **Modulul AI** — `chat.js`, `image.js`, `tts.js`, `stt.js`, `sts.js`, `ocr.js`, `video.js`, `models.js` |
| `src/modules/` | `Auth`, `FileSystem`, `kv`, `UI`, `apps`, `hosting`, `email`, `events`, `perms`, `teams`, `drivers`, `workers`, `peer`, `os`, `networking` |
| `src/lib/` | `utils.js` (makeDriverMethod), `networkUtils.js` (fetch + RPC), `APICallLogger`, polyfill-uri (localStorage, XHR, FileReader) |
| `types/` + `index.d.ts` | Tipuri TS **generate din JSDoc** (`npm run build:types`) — nu se editează manual |
| `dist/puter.cjs` | Bundle CJS de ~409 KB (webpack), generat 2026-09-10 |
| `src/init.cjs` | Punct de intrare **Node.js**: `init(authToken)` / `getAuthToken()` (login prin browser) |

- **Licență:** Apache-2.0 · **Deps runtime:** `@heyputer/kv.js`, `socket.io-client`, `open`, `path-browserify`
- **Origini default:** API `https://api.puter.com`, GUI `https://puter.com` — override cu
  `globalThis.PUTER_API_ORIGIN` / `PUTER_ORIGIN` *înainte* de încărcarea SDK-ului.
- În browser se încarcă de obicei de la CDN: `<script src="https://js.puter.com/v2/"></script>`
  (exact ce face deja `Data/Data.html`).

**Modulele înregistrate** (`src/index.js → initSubmodules`):
`puter.auth, puter.os, puter.fs, puter.ui, puter.hosting, puter.apps, puter.ai, puter.kv,
puter.email, puter.events, puter.perms, puter.teams, puter.drivers, puter.debug, puter.peer,
puter.workers` + `puter.path`, `puter.print`, `puter.on/off`, `puter.tools`.

---

## 2. Modulul `puter.ai` — suprafața completă

| Metodă | Semnatură cheie | Returnează |
|---|---|---|
| `chat(prompt \| messages, [media], opts)` | `model` (default **`gpt-5-nano`**), `temperature`, `max_tokens`, `stream`, `tools`, `provider`, `reasoning_effort` (`none…xhigh`), `verbosity`, `normalize`, `compaction`, `image_config` | `ChatResponse` (`{message:{content}, finish_reason, …}`) sau, la `stream:true`, **`AsyncIterable<ChatResponseChunk>`** |
| `txt2img(prompt \| opts)` | vezi mai jos | **`HTMLImageElement`** |
| `txt2vid(prompt \| opts)` | `model` (default **`veo-3.1-lite`**), `seconds`, `size`/`resolution`, `input_reference`, `reference_images[]`, `generate_audio` | `HTMLVideoElement` |
| `txt2speech(text, opts)` | **max 3000 caractere**; `provider`: `aws-polly`(default)/`openai`/`elevenlabs`/`gemini`/`xai`/`speechify`; `voice`, `language`, `engine`, `instructions`, `voice_settings`, `ssml`, `test_mode` | `HTMLAudioElement` |
| `txt2speech.listEngines([opts])` / `.listVoices([opts])` | `provider: 'all'` → toate | `TTSEngine[]` / `TTSVoice[]` |
| `speech2txt(file, opts)` (STT) | `provider`, `language`, `translate`, `stream`, `diarize`, `response_format:'text'` | `Speech2TxtResult` sau `string` |
| `speech2speech(audio, opts)` | voice-clone / conversie voce→voce | audio |
| `img2txt(source, opts)` (**OCR/PDF**) | sursă `string\|Blob\|File`, **max 10 MB**, `provider`, `pages[]` | `string` (text simplificat din blocks/pages/annotation) |
| `listModels([provider])` / `listModelProviders()` | GET `APIOrigin/puterai/chat/models/details`, fallback driver | `Record[]` — **lista live de modele** |

### `txt2img` — opțiunile relevante pentru `Data/`

- `model` — default `gpt-image-1-mini` (OpenAI) sau `grok-imagine-image` la `provider:'xai'`
- `quality` — OpenAI: `'high'|'medium'|'low'|'auto'`; **`gpt-image-2.5-sunburst` / `gpt-image-2.5-flare` acceptă în plus `'xhigh' | 'max' | 'auto'`**; Gemini: tiers `'512'|'1K'|'2K'|'4K'`
- `input_image` (1) / **`input_images[]`** (multi-ref) — Gemini & OpenAI `gpt-image-*` vor **base64/data-URI**; Replicate vrea URL; xAI acceptă ambele (max 3)
- `ratio: {w, h}` — raport pentru OpenAI / Gemini / Replicate
- `aspect_ratio: "16:9"` și `width`/`height` px — documentate pentru **Together**
- `puter_output_path` — salvează direct pe FS-ul Puter (`~/AppData/<app>/…`)
- `test_mode: true` — **imagine de probă fără a consuma credite**
- `steps`, `seed`, `negative_prompt`, `n` — Together/Replicate; `mask_image_*`, `prompt_strength` — inpainting Together

---

## 3. Auth, alocație, limite

- **`puter.auth.signIn({attempt_temp_user_creation, request_auth})`** — popup pe puter.com; funcționează doar în afara app-ului Puter (în app primești tokenul de la sesiunea gazdă).
- `isSignedIn()`, `getUser()`, `whoami()`, `signOut()`
- **`getMonthlyUsage()`** → `MonthlyUsage`:
  - `allowanceInfo.monthUsageAllowance` — alocația lunii
  - `allowanceInfo.remaining` — **ce mai rămâne** (`unit: 'credits'` opțional)
  - Valorile monetare sunt în **microcente** (1 USD = 1.000.000)
  - `usage[api] = {cost, count, units}` — consum per API (chat, img2img…)
- `getDetailedAppUsage(appId)`, `getGlobalUsage()` (doar administrativ)
- Când se atinge limita, SDK-ul arată **`UsageLimitDialog`** (web component `usage-limit-dialog`) — „You have reached your usage limit for this account."
- Eveniment `puter.auth.reauth_required` → re-autentificare forțată (`triggerReauth`).

---

## 4. Ce ne interesează pentru `Data/` — constatări & decalaje

`Data/Data.js` + `Data/Data.html` (ultimul commit înainte de „puter.js pt examinare")
folosesc deja corect: `puter.ai.chat`, `puter.ai.txt2img` cu `input_images`,
`puter.ai.txt2speech`, File System Access API local. **După examinare, apar însă
următoarele lucruri de corectat/completat:**

### A. Bug-uri / decalaje concrete

1. **Butonul „stream” din `Data.html` nu face nimic.** Butonul comută `data-on`, dar
   `opts`-ul trimis la `D.chat()` nu conține niciodată `stream`. În plus, la
   `stream:true` SDK-ul returnează un `AsyncIterable`, nu `ChatResponse` — ar trebui
   iterat (`for await (const chunk of …)`) și afișat incremental (`chunk.type==='text'`
   → `chunk.text`; ultimul chunk poate avea `usage`).
2. **Ramura OpenRouter din `Data.js` aruncă `opts`.** Trimite doar
   `{model, messages}` — `temperature`, `max_tokens`, `tools` (web) **nu ajung** la
   OpenRouter. Trebuie `body: {model, messages, ...opts}`.
3. **`web` tools** — **corectat în raport**: `tools:[{type:"web_search"}]` este
   **forma oficială Puter** (docs.puter.com/AI/chat — pe modelele OpenAI). Tipul
   `Tool` din `index.d.ts` descrie doar function-calling-ul clasic; backend-ul
   acceptă și `web_search`. Nu era bug, era decalaj de documentare în SDK.
4. **Calitățile pentru Flare/Sunburst sunt incomplete**: selectorul are doar
   `low|medium|high`, dar tipurile oficial spun că **`gpt-image-2.5-flare` și
   `gpt-image-2.5-sunburst` acceptă și `'xhigh'`, `'max'`, `'auto'`** — merită adăugate.
5. **`aspect_ratio` / `width` / `height`** sunt documentate pentru driverul *Together*;
   pentru OpenAI `gpt-image-*` forma documentată e **`ratio: {w, h}`**. Merită un test
   (sau trimiterea ambelor) — altfel „custom width/height px" ar putea fi ignorat de
   driverul OpenAI.
6. **Răspunsul chat**: SDK-ul pune `toString()`/`valueOf()` pe răspuns (returnează
   `message.content`) și opțiunea `normalize` (policy: modele din ≥ 1 sep 2026 → formă
   OpenAI-style). `Data.js` citește manual `r.message?.content` — merge, dar
   `String(r)` e mai robust când normalize = off.

### B. Funcționalități gratuite deja în SDK, nefolosite încă în `Data/`

| Ce | Cum ajută în Data/ |
|---|---|
| **`puter.ai.listModels()`** | Populează selectul de modele **dinamic** (fără listă hardcodată `DATA_MODELS`) + provider pentru fiecare |
| **`puter.auth.getMonthlyUsage()`** | Afișează în header **alocația rămasă** („mai ai X din alocația lunară”) — exact verificarea pt. „fără întreruperi" |
| **`test_mode: true`** pe img/tts/vid | Testează interfața **fără consum de credite** |
| **`puter.ai.img2txt()` (OCR)** | PDF-urile din „refs" sunt acum convertite doar în imagine (pagina 1) cu pdf.js — cu `img2txt` poți extrage **textul din PDF/page** direct (max 10 MB) |
| **`puter.ai.txt2vid()`** | Categorie nouă „video" în caseta adaptivă (default `veo-3.1-lite`) |
| **`puter.ai.speech2txt()`** | Transcriere audio/video → text (posibil „mic input" nou) |
| **`txt2speech.listVoices()/listEngines()`** | Selector de voce/limbă/provicer în secțiunea TTS (acum e fix `gpt-4o-mini-tts`) |
| **`puter.fs` (cloud)** | Salvare alternativă pe FS-ul Puter (`write`, `readdir`, `sign` link partajabil) pe lângă folderul local |
| **`puter.kv`** | Persistență setări (cheia OpenRouter, ultimul model, istoric prompt) între sesiuni |
| **`puter_output_path`** | `txt2img` salvează direct pe cloud-FS, fără pasul de fetch-blob |
| **`puter.enableAPILogging()`** | Debug: log-ul apelurilor API în consolă |

### C. Limitări de reținut

- **TTS: 3000 caractere** maximum per apel (verificat în cod, `MAX_INPUT_SIZE`).
- **OCR: 10 MB** maximum sursă.
- Chat default: `gpt-5-nano`; imagine default: `gpt-image-1-mini`; video default: `veo-3.1-lite`.
- Alocatia Puter = **free tier cu plafon lunar**; la epuizare apare dialogul de limită →
  tocmai de aceea cheia OpenRouter din `Data/` e plasa de siguranță.
- `signIn` nu merge dintr-o pagină găzduită *în interiorul* Puter apps (primește tokenul de la gazdă).
- Tipurile TS sunt **generate din JSDoc** — în `node_modules` nu se fac modificări; tot ce
  e nou se implementează în `Data/Data.js` / `Data.html`.

---

## 5. Concluzie

Pachetul e complet, curent (2.6.3, bundle sep. 2026) și acoperă tot ce are nevoie
`Data/`: chat, imagine (incl. image-to-image & calități xhigh/max pe 2.5), voce, video,
OCR, listă live de modele și consum de alocație.

**Corecțiile 1–6 au fost implementate în `Data/Data.js` + `Data/Data.html`:**
1. ✅ stream: `opts.stream` → `AsyncIterable` iterat, afișare live + SSE OpenRouter
2. ✅ ramura OpenRouter primește `temperature`/`max_tokens`/`tools` (+ stream)
3. ✅ `web_search` — confirmat forma oficială Puter (nu era bug)
4. ✅ calități per model: Flare/Sunburst au `xhigh|max|auto`, GPT Image 2 are `auto`
5. ✅ custom px trimite **și** `width/height` (Together) **și** `ratio:{w,h}` (OpenAI)
6. ✅ `extractText()` robust: string, array de părți, `toString()` pe ChatResponse

Rămân deschise (nefolosite, gratuit) — **parțial implementate**:
- ✅ `listModels()` — `loadLiveModels()` completează selectul cu modelele live Puter
- ✅ `getMonthlyUsage()` — `getUsage()` în header („♾️ Gratis: X / Y din alocația lunară”,
  roșu sub 20%) + reîmprospătare după fiecare generare + fallback automat pe cheia
  OpenRouter la epuizarea alocației (text)
- ✅ `test_mode` — buton 🧪 în bară: mostre gratuite pe imagine/voce/OCR/chat,
  NU consumă alocația (posiția a 3-a la `chat()`, `test_mode` în opts la img/tts/ocr)
- ✅ OCR `img2txt` — la atașarea unui PDF: preview pagina 1 (pdf.js) + extragere text
  cu `puter.ai.img2txt` (max 10 MB); textul (max 6000 car./PDF) se atașează automat
  la cererile de text; contor 📄 în zona de refs
- ✅ `kv` — setări persistente între sesiuni (model, cheie, temp, max_tokens, ratio,
  wand/stream/web/test, quality, gens) — `saveSettings`/`loadSettings` cu cheia
  `data-app:settings`
- ✅ `fs` cloud — buton „☁ Cloud” pe fiecare rezultat: salvează în `~/Data/` pe
  cloud-ul Puter (`mkdir` + `write`, overwrite); `listCloud()` disponibil
