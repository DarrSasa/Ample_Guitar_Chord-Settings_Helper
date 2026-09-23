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
  { id:"gpt-5.3-codex", name:"GPT-5.3 Codex (code)",type:"text", via:"puter" },
  // TEXT prin propria cheie OpenRouter (nelimitat de contul tau, nu de Puter)
  { id:"openrouter/deepseek/deepseek-v4.1-flash", name:"DeepSeek v4.1 (cheia ta)", type:"text", via:"openrouter" },
  // VOCE
  { id:"gpt-4o-mini-tts", name:"TTS (voce)", type:"tts", via:"puter" },
];

let openRouterKey = "";
export function setOpenRouterKey(k){ openRouterKey = (k||"").trim(); }

/* ---- MODELE LIVE: completeaza lista hardcodata cu ce e disponibil acum pe Puter ---- */
export async function loadLiveModels(){
  try{
    const live = await puter.ai.listModels();           // [{id, provider, name, ...}]
    if (!Array.isArray(live)) return DATA_MODELS;
    let added = 0;
    for (const m of live){
      if (!m || !m.id) continue;
      if (DATA_MODELS.some(x => x.id === m.id)) continue;
      DATA_MODELS.push({
        id: m.id,
        name: (m.name || m.id) + (m.provider ? " · " + m.provider : ""),
        type: "text",
        via: "puter",
        live: true
      });
      added++;
    }
    return DATA_MODELS;
  }catch(e){
    return DATA_MODELS;   // fara net/auth → raman modelele din lista
  }
}

/* ---- ALOCAȚIA GRATUITĂ (se reînnoiește lunar) ----
   intoarce {remaining, allowance, unit, pct, text} sau null daca nu e disponibila. */
export async function getUsage(){
  try{
    const u = await puter.auth.getMonthlyUsage();
    const a = (u && u.allowanceInfo) || {};
    const rem = (typeof a.remaining === "number") ? a.remaining : null;
    const all = (typeof a.monthUsageAllowance === "number") ? a.monthUsageAllowance : null;
    const unit = a.unit || "microcents";  // 1 USD = 1.000.000 microcents (fara unit:credits)
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
    return null;   // neconectat / fara acces → ascundem, nu blocam app
  }
}

/* Eroare de tip „s-a terminat alocația Puter"? */
function isUsageLimitError(e){
  const s = String((e && (e.message || e.error)) || e || "").toLowerCase();
  const code = e && (e.code || e.status || (e.error && e.error.code));
  return code === 402 || code === "insufficient_funds" || code === "usage_limited"
    || /usage limit|not enough funding|insufficient|alocaț|alocatie/.test(s);
}

/* Extrage textul dintr-un ChatResponse (forma normalizata SAU nativa,
   continut string SAU array de parti) — vezi optiunea `normalize` din puter.js. */
function extractText(r){
  if (r == null) return "";
  if (typeof r === "string") return r;
  const c = r.message && r.message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(p => typeof p === "string" ? p : (p && p.text) || "").join("");
  return String(r);
}

/* ---- chat: Puter sau OpenRouter (cheia ta) ----
   opts: temperature, max_tokens, tools, stream, …
   onChunk(textPartial, fullSoFar) — apelat pe fiecare bucata daca stream=true. */
export async function chat(prompt, modelId, opts={}, onChunk){
  const m = DATA_MODELS.find(x=>x.id===modelId) || {via:"puter"};

  if (m.via==="openrouter" && openRouterKey){
    /* OpenRouter primeste aceleasi opts ca Puter (nu le mai aruncam). */
    const body = { model:modelId, messages:[{role:"user",content:prompt}] };
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
      /* SSE: linii "data: {...}", final "data: [DONE]" */
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
          }catch(e){ /* linie SSE incompleta/ignorabila */ }
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

  /* Puter: la stream:true SDK-ul returneaza AsyncIterable<ChatResponseChunk>. */
  try{
    if (opts.stream === true){
      const it = await puter.ai.chat(prompt, Object.assign({}, opts, { model:modelId }));
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
    const r = await puter.ai.chat(prompt, Object.assign({}, opts, { model:modelId }));
    return extractText(r);
  }catch(e){
    /* Alocația Puter s-a terminat? Daca ai cheie OpenRouter → continui pe cheia ta
       (text doar), ca sa NU fii blocat „decat pana luna viitoare". */
    if (isUsageLimitError(e) && openRouterKey){
      return await chat(prompt, "openrouter/deepseek/deepseek-v4.1-flash", opts, onChunk);
    }
    throw e;
  }
}

/* ---- imagine (doar Puter) ---- */
export async function image(prompt, modelId, opts={}){
  try{
    return await puter.ai.txt2img(prompt, Object.assign({ model:modelId }, opts));
  }catch(e){
    if (isUsageLimitError(e)){
      throw new Error("Alocația gratuită Puter s-a terminat pe imagine. Se reînnoiește luna viitoare — sau treci pe un model text cu cheia ta OpenRouter.");
    }
    throw e;
  }
}

/* ---- voce (doar Puter) ---- */
export async function speech(text, modelId){
  try{
    const a = await puter.ai.txt2speech(text, { model:modelId, provider:"openai" });
    a.setAttribute("controls",""); return a;
  }catch(e){
    if (isUsageLimitError(e)){
      throw new Error("Alocația gratuită Puter s-a terminat pe voce. Se reînnoiește luna viitoare.");
    }
    throw e;
  }
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
