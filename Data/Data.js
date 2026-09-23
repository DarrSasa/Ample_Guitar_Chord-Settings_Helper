/* Data.js — propriul tău program AI.
   Foloseste Puter.js (gratis, alocatie lunara) SAU propria ta cheie OpenRouter/OpenAI,
   ca sa NU fii blocat de limita Puter. Modelele se adapteaza (imagine/text/voce). */

export const DATA_MODELS = [
  // IMAGINE
  { id:"gpt-image-2.5-flare",    name:"GPT Image 2.5 Flare",    type:"image", via:"puter",
    qualities:["low","medium","high","xhigh","max","auto"] },
  { id:"gpt-image-2.5-sunburst", name:"GPT Image 2.5 Sunburst", type:"image", via:"puter",
    qualities:["low","medium","high","xhigh","max","auto"] },
  { id:"gpt-image-2",            name:"GPT Image 2",            type:"image", via:"puter",
    qualities:["low","medium","high","auto"] },
  // TEXT
  { id:"gpt-6-astra",   name:"GPT-6 Astra (text)",  type:"text", via:"puter" },
  { id:"gpt-5.6-sol",   name:"GPT-5.6 Sol (text)",  type:"text", via:"puter" },
  { id:"gpt-5.6-luna",  name:"GPT-5.6 Luna (text)", type:"text", via:"puter" },
  { id:"gpt-5.4-nano",  name:"GPT-5.4 Nano (text)", type:"text", via:"puter" },
  // CODE (tot pe gratis, prin alocația Puter)
  { id:"gpt-5.3-codex", name:"GPT-5.3 Codex (code)",type:"text", code:true, via:"puter" },
  // TEXT prin propria cheie OpenRouter (nelimitat de contul tau, nu de Puter)
  { id:"openrouter/deepseek/deepseek-v4.1-flash", name:"DeepSeek v4.1 (cheia ta)", type:"text", via:"openrouter" },
  // VOCE
  { id:"gpt-4o-mini-tts", name:"TTS (voce)", type:"tts", via:"puter" },
];

let openRouterKey = "";
export function setOpenRouterKey(k){ openRouterKey = (k||"").trim(); }

/* ---- ISTORIC DE CONVERSAȚIE: modelele țin minte toată discuția ---- */
let history = [];   // [{role:"user"|"assistant", content:string}, …]
export function getHistory(){ return history; }
export function clearHistory(){ history = []; return true; }
export function historyLength(){ return history.length; }
function commitHistory(userContent, assistantContent){
  history.push({ role:"user", content:userContent });
  history.push({ role:"assistant", content:assistantContent });
  if (history.length > 40) history.splice(0, history.length - 40);  // plafon tokeni
}

/* ---- TEST MODE: mostre gratuite, NU consuma alocația ---- */
let testModeOn = false;
export function setTestMode(on){ testModeOn = !!on; return testModeOn; }
export function isTestMode(){ return testModeOn; }

/* ---- MODELE LIVE: completeaza lista hardcodata cu ce e disponibil acum pe Puter ---- */
const CODE_RE = /codex|code|coder|codestral|devstral|starcoder|coderunner|gpt-code/i;
export async function loadLiveModels(){
  try{
    const live = await puter.ai.listModels();           // [{id, provider, name, ...}]
    if (!Array.isArray(live)) return DATA_MODELS;
    for (const m of live){
      if (!m || !m.id) continue;
      if (DATA_MODELS.some(x => x.id === m.id)) continue;
      DATA_MODELS.push({
        id: m.id,
        name: (m.name || m.id) + (m.provider ? " · " + m.provider : ""),
        type: "text",
        code: CODE_RE.test(m.id) || CODE_RE.test(m.name || ""),
        via: "puter",
        live: true
      });
    }
    return DATA_MODELS;
  }catch(e){
    return DATA_MODELS;   // fara net/auth → raman modelele din lista
  }
}

/* ---- ALOCAȚIA GRATUITĂ (se reînnoiește AUTOMAT lunar de către Puter) ---- */
export async function getUsage(){
  try{
    const u = await puter.auth.getMonthlyUsage();
    const a = (u && u.allowanceInfo) || {};
    const rem = (typeof a.remaining === "number") ? a.remaining : null;
    const all = (typeof a.monthUsageAllowance === "number") ? a.monthUsageAllowance : null;
    const unit = a.unit || "microcents";
    const fmt = (v) => {
      if (v == null) return "?";
      if (unit === "credits") return v.toLocaleString("ro-RO") + " cr";
      return (v / 1e6).toFixed(2) + "$";
    };
    const pct = (rem != null && all != null && all > 0)
      ? Math.max(0, Math.min(100, Math.round(100 * rem / all))) : null;
    return {
      remaining: rem, allowance: all, unit, pct,
      text: "Gratis: " + fmt(rem) + " / " + fmt(all) + " din alocația lunară"
    };
  }catch(e){
    return null;
  }
}

function isUsageLimitError(e){
  const s = String((e && (e.message || e.error)) || e || "").toLowerCase();
  const code = e && (e.code || e.status || (e.error && e.error.code));
  return code === 402 || code === "insufficient_funds" || code === "usage_limited"
    || /usage limit|not enough funding|insufficient|alocaț|alocatie/.test(s);
}

function extractText(r){
  if (r == null) return "";
  if (typeof r === "string") return r;
  const c = r.message && r.message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(p => typeof p === "string" ? p : (p && p.text) || "").join("");
  return String(r);
}

/* OpenRouter: trimite lista de mesaje (istoric inclus) */
async function openRouterChat(messages, opts, onChunk, modelId){
  const body = { model: modelId || "openrouter/deepseek/deepseek-v4.1-flash", messages };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.max_tokens  !== undefined) body.max_tokens  = opts.max_tokens;
  if (opts.tools       !== undefined) body.tools       = opts.tools;
  if (opts.stream === true){
    body.stream = true;
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{ "Authorization":"Bearer "+openRouterKey, "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error("OpenRouter HTTP "+resp.status+": "+(await resp.text()).slice(0,200));
    const reader = resp.body.getReader(), dec = new TextDecoder();
    let buf = "", full = "";
    while (true){
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream:true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines){
        const t = line.replace(/^data:\s*/,"").trim();
        if (!t || t === "[DONE]") continue;
        try{
          const j = JSON.parse(t);
          const d = j.choices && j.choices[0] && j.choices[0].delta;
          if (d && d.content){ full += d.content; if (onChunk) onChunk(d.content, full); }
        }catch(e){}
      }
    }
    return full;
  }
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{ "Authorization":"Bearer "+openRouterKey, "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || ("OpenRouter HTTP "+r.status));
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
}

/* Puter chat pe liste de mesaje */
async function puterChat(messages, opts, onChunk){
  const o = Object.assign({}, opts, { model: opts._model });
  delete o._model;
  if (o.stream === true){
    const it = await puter.ai.chat(messages, o, testModeOn);
    let full = "";
    for await (const chunk of it){
      if (chunk && chunk.type === "text" && chunk.text){
        full += chunk.text;
        if (onChunk) onChunk(chunk.text, full);
      } else if (chunk && chunk.type === "error"){
        throw new Error(chunk.message || "Stream error");
      }
    }
    return full;
  }
  const r = await puter.ai.chat(messages, o, testModeOn);
  return extractText(r);
}

/* ---- chat cu ISTORIC: aceeași discuție, iar și iar ----
   prompt      — noul mesaj al utilizatorului
   opts.docs   — opțional: text din folder/PDF (se injectează la începutul discuției)
   onChunk     — callback stream */
export async function chat(prompt, modelId, opts={}, onChunk){
  const m = DATA_MODELS.find(x=>x.id===modelId) || {via:"puter"};
  if (m.via==="openrouter" && !openRouterKey){
    throw new Error("Modelul cu cheia ta are nevoie de o cheie OpenRouter — introduce-o sus (🔑).");
  }
  const docs = opts.docs || "";
  const clean = Object.assign({}, opts);
  delete clean.docs;

  /* conținutul mesajului user; documentele se presează doar la încept sau când se schimbă */
  let userContent = prompt;
  if (docs){
    const head = history.find(x => x.__docs);
    if (!head){
      userContent = "[Documente din folder]\n" + docs + "\n\n===\n\n" + (prompt || "(Analizează documentele de mai sus.)");
    } else if (head.content !== docs){
      userContent = "[Documente actualizate]\n" + docs + "\n\n===\n\n" + (prompt || "(Analizează documentele de mai sus.)");
    }
  }

  const messages = history.map(x => ({ role:x.role, content:x.content }))
    .concat([{ role:"user", content:userContent }]);

  const useOR = (m.via === "openrouter" && openRouterKey);
  try{
    let full;
    if (useOR){
      full = await openRouterChat(messages, clean, onChunk, modelId);
    } else {
      clean._model = modelId;
      full = await puterChat(messages, clean, onChunk);
    }
    /* marcăm docs în istoric ca să nu le mai retrimitem identic */
    if (docs && userContent.startsWith("[Documente")){
      history.push({ role:"user", content:userContent, __docs:true });
      history.push({ role:"assistant", content:full });
      if (history.length > 40) history.splice(0, history.length - 40);
    } else {
      commitHistory(userContent, full);
    }
    return full;
  }catch(e){
    if (isUsageLimitError(e) && openRouterKey && !useOR){
      const full = await openRouterChat(messages, clean, onChunk, "openrouter/deepseek/deepseek-v4.1-flash");
      commitHistory(userContent, full);
      return full;
    }
    throw e;
  }
}

/* ---- imagine (doar Puter) ---- */
export async function image(prompt, modelId, opts={}){
  const o = Object.assign({ model:modelId }, opts);
  if (testModeOn) o.test_mode = true;
  try{
    return await puter.ai.txt2img(prompt, o);
  }catch(e){
    if (isUsageLimitError(e)){
      throw new Error("Alocația gratuită Puter s-a terminat pe imagine. Se reînnoiește automat luna viitoare — sau folosești test mode 🧪.");
    }
    throw e;
  }
}

/* ---- voce (doar Puter) ---- */
export async function speech(text, modelId){
  try{
    const o = { model:modelId, provider:"openai" };
    if (testModeOn) o.test_mode = true;
    const a = await puter.ai.txt2speech(text, o);
    a.setAttribute("controls",""); return a;
  }catch(e){
    if (isUsageLimitError(e)){
      throw new Error("Alocația gratuită Puter s-a terminat pe voce. Se reînnoiește automat luna viitoare.");
    }
    throw e;
  }
}

/* ---- OCR: text din imagine/PDF (puter.ai.img2txt, max 10 MB) ---- */
export async function ocr(source){
  try{
    return await puter.ai.img2txt(source, { test_mode: testModeOn });
  }catch(e){
    if (isUsageLimitError(e)){
      throw new Error("Alocația gratuită Puter s-a terminat pe OCR. Se reînnoiește automat luna viitoare.");
    }
    throw e;
  }
}

/* ---- SETĂRI PERSISTENTE (puter.kv) ---- */
const KV_SETTINGS = "data-app:settings";
export async function saveSettings(obj){
  try{ await puter.kv.set(KV_SETTINGS, JSON.stringify(obj)); return true; }
  catch(e){ return false; }
}
export async function loadSettings(){
  try{
    const s = await puter.kv.get(KV_SETTINGS);
    if (typeof s === "string") return JSON.parse(s);
    if (s && typeof s.value === "string") return JSON.parse(s.value);
    return null;
  }catch(e){ return null; }
}

/* ---- EXPORT / IMPORT setări + istoric (JSON pe PC — supraviețuiește oricărui cont) ---- */
export async function exportAll(){
  const settings = await loadSettings();
  return {
    app: "Data",
    kind: "settings+history",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: settings || null,
    history: history.map(x => ({
      role: x.role,
      content: x.content,
      ...(x.__docs ? { __docs: true } : {})
    }))
  };
}
export async function importAll(data){
  if (!data || data.app !== "Data") throw new Error("Fișier invalid: nu e un backup Data.");
  let nSettings = 0, nMsgs = 0;
  if (data.settings && typeof data.settings === "object"){
    const ok = await saveSettings(data.settings);
    if (ok) nSettings = 1;
  }
  if (Array.isArray(data.history)){
    history = data.history
      .filter(x => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
      .map(x => ({ role: x.role, content: x.content, ...(x.__docs ? { __docs: true } : {}) }));
    if (history.length > 40) history = history.slice(-40);
    nMsgs = history.length;
  }
  return { settings: nSettings, messages: nMsgs };
}

/* ---- SALVARE PE CLOUD-UL PUTER (puter.fs) — ~/Data/ ---- */
const CLOUD_DIR = "Data";
export async function saveToCloud(name, blob){
  try{ await puter.fs.mkdir(CLOUD_DIR, { createMissingParents:true, overwrite:false }); }
  catch(e){ /* exista deja */ }
  const path = CLOUD_DIR + "/" + name.replace(/[^\w.\-]+/g, "_");
  await puter.fs.write(path, blob, { overwrite:true });
  return path;
}
export async function listCloud(){
  try{ return await puter.fs.readdir(CLOUD_DIR); }
  catch(e){ return []; }
}

/* ---- FOLDERUL LOCAL: listă + citire fișiere text pt. contextul modelelor ---- */
const TEXT_EXT = new Set([
  "txt","md","js","mjs","cjs","ts","tsx","jsx","py","json","html","css","scss",
  "csv","xml","yml","yaml","ini","cfg","conf","log","c","cpp","h","hpp","cs",
  "java","go","rs","sh","bat","ps1","php","rb","sql","vue","toml","gradle","r"
]);
const SKIP_DIRS = new Set(["node_modules",".git","dist","build",".next","__pycache__"]);

export function fileExt(name){
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i+1).toLowerCase();
}
export function isTextFile(name){ return TEXT_EXT.has(fileExt(name)); }

/** Listează fișierele text din folderul ales (max 100, fără node_modules/.git). */
export async function listProjectFiles(){
  if (!dirHandle) throw new Error("Alege intai un folder de proiect.");
  const out = [];
  async function walk(h, path){
    if (out.length >= 100) return;
    for await (const entry of h.values()){
      if (out.length >= 100) return;
      if (entry.kind === "file"){
        if (isTextFile(entry.name)) out.push(path + entry.name);
      } else if (entry.kind === "directory" && !SKIP_DIRS.has(entry.name)){
        await walk(entry, path + entry.name + "/");
      }
    }
  }
  await walk(dirHandle, "");
  out.sort();
  return out;
}

/** Citește un fișier text din folderul ales (cale relativă, ex. "src/app.js"). */
export async function readProjectFile(relPath){
  if (!dirHandle) throw new Error("Alege intai un folder de proiect.");
  const parts = relPath.split("/").filter(Boolean);
  let h = dirHandle;
  for (let i = 0; i < parts.length - 1; i++){
    h = await h.getDirectoryHandle(parts[i]);
  }
  const fh = await h.getFileHandle(parts[parts.length - 1]);
  const f = await fh.getFile();
  if (f.size > 100 * 1024) throw new Error(relPath + ": prea mare (>100KB)");
  return await f.text();
}

/* ---- folder local de proiect (File System Access API) ---- */
let dirHandle = null;
export async function pickFolder(){
  dirHandle = await window.showDirectoryPicker({ mode:"readwrite" });
  return dirHandle.name;
}
export async function saveToFolder(name, blob){
  if(!dirHandle) throw new Error("Alege intai un folder de proiect.");
  const fh = await dirHandle.getFileHandle(name, { create:true });
  const w = await fh.createWritable(); await w.write(blob); await w.close();
}
export async function readFromFolder(name){
  if(!dirHandle) throw new Error("Alege intai un folder de proiect.");
  const fh = await dirHandle.getFileHandle(name);
  const f = await fh.getFile(); return f.text();
}
export function folderName(){ return dirHandle ? dirHandle.name : null; }
export function hasFolder(){ return !!dirHandle; }
