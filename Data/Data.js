/* Data.js — propriul tău program AI.
   Foloseste Puter.js (gratis, alocatie lunara) SAU propria ta cheie OpenRouter/OpenAI,
   ca sa NU fii blocat de limita Puter. Modelele se adapteaza (imagine/text/voce). */

const DATA_MODELS = [
  // IMAGINE
  { id:"gpt-image-2.5-flare",    name:"GPT Image 2.5 Flare",    type:"image", via:"puter" },
  { id:"gpt-image-2.5-sunburst", name:"GPT Image 2.5 Sunburst", type:"image", via:"puter" },
  { id:"gpt-image-2",            name:"GPT Image 2",            type:"image", via:"puter" },
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

/* ---- chat: Puter sau OpenRouter (cheia ta) ---- */
export async function chat(prompt, modelId, opts={}){
  const m = DATA_MODELS.find(x=>x.id===modelId) || {via:"puter"};
  if (m.via==="openrouter" && openRouterKey){
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{ "Authorization":"Bearer "+openRouterKey, "Content-Type":"application/json" },
      body: JSON.stringify({ model:modelId, messages:[{role:"user",content:prompt}] })
    });
    const j = await r.json();
    return j.choices?.[0]?.message?.content || "";
  }
  const r = await puter.ai.chat(prompt, Object.assign({model:modelId}, opts));
  return (r && r.message && r.message.content) ? r.message.content : String(r);
}

/* ---- imagine (doar Puter) ---- */
export async function image(prompt, modelId, opts={}){
  return puter.ai.txt2img(prompt, Object.assign({model:modelId}, opts));
}

/* ---- voce (doar Puter) ---- */
export async function speech(text, modelId){
  const a = await puter.ai.txt2speech(text, { model:modelId, provider:"openai" });
  a.setAttribute("controls",""); return a;
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
