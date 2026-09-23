/* Data.js — propriul tău program AI.
   GRATIS FĂRĂ PUTER:
   - text: modele OpenRouter cu sufix :free (cheia ta OpenRouter, fără credit)
   - imagini: Pollinations.ai (Flux etc., fără cheie, fără credit)
   - voce: SpeechSynthesis din browser (gratuit, nelimitat)
   - setări: localStorage (nu depind de niciun cont)
   MOD AGENT: mai multe modele lucrează ÎMPREUNĂ (planifică → implementează → revizuiește). */

/* ---- modele text gratuite (OpenRouter :free) ---- */
export const FREE_TEXT_MODELS = [
  { id:"deepseek/deepseek-chat-v3-0324:free", name:"DeepSeek V3 (general)", tags:["free","general"] },
  { id:"deepseek/deepseek-r1:free",           name:"DeepSeek R1 (reasoning)", tags:["free","reasoning"] },
  { id:"openai/gpt-oss-20b:free",             name:"GPT-OSS 20B (coding)", tags:["free","code"] },
  { id:"qwen/qwen3-235b-a22b:free",           name:"Qwen3 235B (coding)", tags:["free","code"] },
  { id:"meta-llama/llama-4-maverick:free",    name:"Llama 4 Maverick (coding)", tags:["free","code"] },
  { id:"meta-llama/llama-4-scout:free",       name:"Llama 4 Scout (rapid)", tags:["free","fast"] },
  { id:"google/gemini-2.0-flash-exp:free",    name:"Gemini 2.0 Flash (rapid)", tags:["free","fast"] },
  { id:"mistralai/mistral-small-3.1-24b-instruct:free", name:"Mistral Small 3.1", tags:["free"] },
  { id:"microsoft/phi-4-reasoning:free",      name:"Phi-4 Reasoning", tags:["free","reasoning"] },
  { id:"nvidia/llama-3.1-nemotron-ultra-253b:free", name:"Nemotron Ultra (agent)", tags:["free","agent"] },
  { id:"openrouter/free",                     name:"OpenRouter FREE (auto-rutare)", tags:["free","auto"] },
];

/* ---- modele AGENT (cele mai puternice free, pt. coding — bifabile) ---- */
export const AGENT_MODELS = [
  { id:"openai/gpt-oss-20b:free",          name:"GPT-OSS 20B — coding", on:true },
  { id:"deepseek/deepseek-chat-v3-0324:free", name:"DeepSeek V3 — implementare", on:true },
  { id:"deepseek/deepseek-r1:free",        name:"DeepSeek R1 — reasoning/review", on:true },
  { id:"qwen/qwen3-235b-a22b:free",        name:"Qwen3 235B — coding", on:false },
  { id:"meta-llama/llama-4-maverick:free", name:"Llama 4 Maverick — coding", on:false },
  { id:"nvidia/llama-3.1-nemotron-ultra-253b:free", name:"Nemotron Ultra — agent", on:false },
  { id:"google/gemini-2.0-flash-exp:free", name:"Gemini Flash — verificare rapidă", on:false },
];

/* ---- modele imagine GRATIS (Pollinations.ai, fără cheie) ---- */
export const FREE_IMAGE_MODELS = [
  { id:"flux",     name:"Flux (cel mai bun free)", w:1024, h:1024, on:true },
  { id:"turbo",    name:"Turbo (cel mai rapid)",   w:1024, h:1024, on:false },
  { id:"kontext",  name:"Kontext (editare/style)", w:1024, h:1024, on:false },
  { id:"seedream", name:"Seedream (detaliu)",      w:1024, h:1024, on:false },
];

let openRouterKey = "";
export function setOpenRouterKey(k){ openRouterKey = (k||"").trim(); }
export function hasOpenRouterKey(){ return !!openRouterKey; }

/* ---- ISTORIC DE CONVERSAȚIE ---- */
let history = [];
export function getHistory(){ return history; }
export function clearHistory(){ history = []; return true; }
export function historyLength(){ return history.length; }
function commitHistory(userContent, assistantContent){
  history.push({ role:"user", content:userContent });
  history.push({ role:"assistant", content:assistantContent });
  if (history.length > 40) history.splice(0, history.length - 40);
}
function wireMessages(extraUserContent){
  return history.map(x => ({ role:x.role, content:x.content }))
    .concat(extraUserContent ? [{ role:"user", content:extraUserContent }] : []);
}

/* ---- apel OpenRouter (chat non-stream + stream) ---- */
async function orChat(modelId, messages, opts={}, onChunk){
  if (!openRouterKey) throw new Error("Lipsește cheia OpenRouter — introduce-o sus (🔑). Modelele free au nevoie de cheie, dar nu de credit.");
  const body = { model:modelId, messages };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.max_tokens  !== undefined) body.max_tokens  = opts.max_tokens;
  if (opts.tools       !== undefined) body.tools       = opts.tools;
  const headers = {
    "Authorization": "Bearer "+openRouterKey,
    "Content-Type": "application/json",
    "HTTP-Referer": location.origin,
    "X-Title": "Data AI"
  };
  if (opts.stream === true){
    body.stream = true;
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST", headers, body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error("OpenRouter HTTP "+resp.status+": "+(await resp.text()).slice(0,300));
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
          if (j.error) throw new Error(j.error.message || "OpenRouter error");
          const d = j.choices && j.choices[0] && j.choices[0].delta;
          if (d && d.content){ full += d.content; if (onChunk) onChunk(d.content, full); }
        }catch(e){ if (e.message && /OpenRouter/.test(e.message)) throw e; }
      }
    }
    return full;
  }
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST", headers, body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || ("OpenRouter HTTP "+r.status));
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
}

/* ---- CHAT NORMAL: un model, cu istoric ---- */
export async function chat(prompt, modelId, opts={}, onChunk){
  const docs = opts.docs || "";
  const clean = Object.assign({}, opts);
  delete clean.docs;

  let userContent = prompt;
  if (docs){
    const head = history.find(x => x.__docs);
    if (!head || head.content !== docs){
      userContent = "[Documente din folder]\n" + docs + "\n\n===\n\n" + (prompt || "(Analizează documentele.)");
    }
  }
  const messages = wireMessages(userContent);
  const full = await orChat(modelId, messages, clean, onChunk);
  if (docs && userContent.startsWith("[Documente")){
    history.push({ role:"user", content:userContent, __docs:true });
    history.push({ role:"assistant", content:full });
    if (history.length > 40) history.splice(0, history.length - 40);
  } else {
    commitHistory(userContent, full);
  }
  return full;
}

/* ---- MOD AGIST: modelele lucrează ÎMPREUNĂ ----
   Pasul 1 (primul model bifat): PLAN — descompune sarcina
   Pasul 2..n-1: IMPLEMENTARE — cod/soluție pe baza planului + istoric
   Pasul n (ultimul): REVIEW — verifică, corectează, livrabil final
   Dacă e un singur model bifat: lucrează direct în rol de agent complet. */
const ROLE_PLAN = "Ești etapa de PLANIFICARE dintr-un agent multi-model. Descompune sarcina în pași concreți. Dă DOAR planul (fără cod complet). Răspunde în română, concis.";
const ROLE_IMPL = "Ești etapa de IMPLEMENTARE dintr-un agent multi-model. Pe baza planului și a istoricului, scrie codul/soluția COMPLETĂ și funcțională. Răspunde în română; codul în blocuri.";
const ROLE_REVIEW = "Ești etapa de REVIEW final dintr-un agent multi-model. Verifică implementarea, corectează greșelile și livrează VERSIUNEA FINALĂ curată. Răspunde în română; codul în blocuri.";

export async function agentChat(prompt, selectedIds, opts={}, onStage){
  const ids = (selectedIds||[]).filter(Boolean);
  if (!ids.length) throw new Error("Bifează cel puțin un model în panoul Agent.");
  if (!openRouterKey) throw new Error("Agentul are nevoie de cheia OpenRouter (🔑) — modelele sunt free, cheia e gratuită.");

  const docs = opts.docs || "";
  let userContent = prompt;
  if (docs) userContent = "[Documente din folder]\n" + docs + "\n\n===\n\n" + (prompt||"(Analizează documentele.)");

  const stages = [];
  let ctxMessages = wireMessages(userContent);
  let lastOutput = "";

  const buildStage = (i) => {
    if (ids.length === 1) return "Ești un AGENT de programare autonom. Gândește-te (plan scurt), scrie codul complet, verifică-l și livrează răspunsul final. Răspunde în română.";
    if (i === 0) return ROLE_PLAN;
    if (i === ids.length - 1) return ROLE_REVIEW;
    return ROLE_IMPL;
  };

  for (let i = 0; i < ids.length; i++){
    const modelId = ids[i];
    const role = buildStage(i);
    if (onStage) onStage({ index:i, total:ids.length, modelId, phase: i===0?"plan":(i===ids.length-1?"review":"implementare") });

    const stageMessages = [{ role:"system", content:role }].concat(ctxMessages);
    const out = await orChat(modelId, stageMessages, { temperature: opts.temperature, max_tokens: opts.max_tokens });
    stages.push({ modelId, role: i===0?"plan":(i===ids.length-1?"review":"implementare"), output: out });
    lastOutput = out;
    ctxMessages = ctxMessages.concat([
      { role:"assistant", content:"["+modelId+" — "+stages[stages.length-1].role+"]\n"+out }
    ]);
  }

  /* istoricul păstrează întrebarea + răspunsul final (livrabilul) */
  commitHistory(userContent, lastOutput);
  return { final: lastOutput, stages };
}

/* ---- IMAGINE GRATIS: Pollinations.ai (fără cheie, fără credit) ---- */
async function pollinationsImage(prompt, modelId, w, h, seed){
  const s = seed != null ? seed : Math.floor(Math.random()*1e9);
  const url = "https://image.pollinations.ai/prompt/"
    + encodeURIComponent(prompt)
    + "?width=" + (w||1024) + "&height=" + (h||1024)
    + "&model=" + encodeURIComponent(modelId||"flux")
    + "&nologo=true&seed=" + s;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Pollinations HTTP "+r.status);
  const blob = await r.blob();
  return URL.createObjectURL(blob);
}

/** o imagine de la un model free */
export async function image(prompt, modelId, opts={}){
  return await pollinationsImage(prompt, modelId, opts.width, opts.height, opts.seed);
}

/** IMAGE AGENT: toate modelele bifate, în paralel */
export async function imageAgent(prompt, modelIds, opts={}, onOne){
  const ids = (modelIds||[]).filter(Boolean);
  if (!ids.length) throw new Error("Bifează cel puțin un model în Image Agent.");
  const results = await Promise.all(ids.map(async (id) => {
    try{
      const src = await pollinationsImage(prompt, id, opts.width, opts.height);
      const res = { modelId:id, src, ok:true };
      if (onOne) onOne(res);
      return res;
    }catch(e){
      const res = { modelId:id, src:null, ok:false, error: e.message||String(e) };
      if (onOne) onOne(res);
      return res;
    }
  }));
  if (!results.some(r=>r.ok)) throw new Error("Niciun model imagine nu a răspuns: "+results.map(r=>r.modelId+" ("+r.error+")").join("; "));
  return results;
}

/* ---- VOCE GRATIS: SpeechSynthesis din browser ---- */
export function speech(text, opts={}){
  return new Promise((resolve, reject)=>{
    if (!("speechSynthesis" in window)){
      reject(new Error("Browserul nu suportă sinteză vocală.")); return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang || "ro-RO";
    u.rate = opts.rate || 1;
    const voices = speechSynthesis.getVoices();
    const ro = voices.find(v=>/^ro/i.test(v.lang));
    if (ro) u.voice = ro;
    u.onend = ()=>resolve({ ok:true });
    u.onerror = (e)=>reject(new Error("TTS: "+(e.error||"eroare")));
    speechSynthesis.speak(u);
  });
}

/* ---- SETĂRI: localStorage (nu depinde de niciun cont) ---- */
const LS_KEY = "data-app:settings";
export async function saveSettings(obj){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(obj)); return true; }
  catch(e){ return false; }
}
export async function loadSettings(){
  try{
    const s = localStorage.getItem(LS_KEY);
    return s ? JSON.parse(s) : null;
  }catch(e){ return null; }
}

/* ---- EXPORT / IMPORT backup JSON ---- */
export async function exportAll(){
  const settings = await loadSettings();
  return {
    app: "Data",
    kind: "settings+history",
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: settings || null,
    history: history.map(x => ({
      role: x.role, content: x.content, ...(x.__docs ? { __docs:true } : {})
    }))
  };
}
export async function importAll(data){
  if (!data || data.app !== "Data") throw new Error("Fișier invalid: nu e un backup Data.");
  let nSettings = 0, nMsgs = 0;
  if (data.settings && typeof data.settings === "object"){
    if (await saveSettings(data.settings)) nSettings = 1;
  }
  if (Array.isArray(data.history)){
    history = data.history
      .filter(x => x && (x.role==="user" || x.role==="assistant") && typeof x.content==="string")
      .map(x => ({ role:x.role, content:x.content, ...(x.__docs ? { __docs:true } : {}) }));
    if (history.length > 40) history = history.slice(-40);
    nMsgs = history.length;
  }
  return { settings:nSettings, messages:nMsgs };
}

/* ---- FOLDER LOCAL: listă + citire fișiere text ---- */
const TEXT_EXT = new Set([
  "txt","md","js","mjs","cjs","ts","tsx","jsx","py","json","html","css","scss",
  "csv","xml","yml","yaml","ini","cfg","conf","log","c","cpp","h","hpp","cs",
  "java","go","rs","sh","bat","ps1","php","rb","sql","vue","toml","gradle","r"
]);
const SKIP_DIRS = new Set(["node_modules",".git","dist","build",".next","__pycache__"]);
export function isTextFile(name){
  const i = name.lastIndexOf(".");
  return i >= 0 && TEXT_EXT.has(name.slice(i+1).toLowerCase());
}
let dirHandle = null;
export async function pickFolder(){
  dirHandle = await window.showDirectoryPicker({ mode:"readwrite" });
  return dirHandle.name;
}
export function hasFolder(){ return !!dirHandle; }
export function folderName(){ return dirHandle ? dirHandle.name : null; }
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
export async function readProjectFile(relPath){
  if (!dirHandle) throw new Error("Alege intai un folder de proiect.");
  const parts = relPath.split("/").filter(Boolean);
  let h = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) h = await h.getDirectoryHandle(parts[i]);
  const fh = await h.getFileHandle(parts[parts.length-1]);
  const f = await fh.getFile();
  if (f.size > 100*1024) throw new Error(relPath + ": prea mare (>100KB)");
  return await f.text();
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

/* ---- text din PDF cu pdf.js (local, gratis — înlocuiește OCR Puter) ---- */
export async function pdfToText(arrayBuffer){
  if (!window.pdfjsLib) throw new Error("pdf.js nu e încărcat.");
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const n = Math.min(pdf.numPages, 15);
  const parts = [];
  for (let p = 1; p <= n; p++){
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const line = tc.items.map(it => it.str).join(" ");
    if (line.trim()) parts.push(line);
  }
  return parts.join("\n\n");
}
