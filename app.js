// BankIA (clean UI) — Demo only, no backend. PWA-ready + Persona IA configurable
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => (n<0? "-" : "") + "€" + Math.abs(n).toFixed(2);
const TODAY = new Date();
const MONTH = TODAY.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

// -----------------------------
// STATE
// -----------------------------
const state = {
  user: null,
  tx: [],
  budgets: { "Courses":300, "Sorties":150, "Transport":80, "Loyer":600, "Abonnements":50, "Autres":120 },
  aiMode: "demo",
  apiKey: "",
  // Persona IA totalement personnalisable
  aiPersona: {
    enabled: true,
    name: "Camille",
    role: "Assistante financière",
    gender: "femme",
    tone: "chaleureuse, claire et proactive",
    emoji: "💙",
    avatar: "", // URL optionnelle (PNG/JPG). Si vide, on utilisera l’émoji/initiales.
    bubbleHue: 225, // teinte (bleu/violet). 0-360
    greeting: "Bonjour ! Je suis {{name}}, {{role}}. Pose-moi ta première question et je te réponds avec des conseils concrets 😉",
    showTOS: true,
    tosText: "Je suis une IA en démo. Mes réponses sont indicatives: vérifie avant décision. En poursuivant, tu acceptes ces conditions.",
    showTOSOncePerSession: true,
    _tosShownThisSession: false,
    typingSpeedMs: 18 // vitesse de frappe simulée pour l’IA (ms par caractère)
  }
};

const KEY = "bankia_demo_state_v1";
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function load(){
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  try{ Object.assign(state, JSON.parse(raw)); } catch(e){ console.warn(e); }
}

// -----------------------------
// INIT
// -----------------------------
function init(){
  load();
  $("#monthTag").textContent = MONTH;
  $("#email").value = state.user?.email || "";
  $("#name").value = state.user?.name || "";
  $("#aiMode").value = state.aiMode || "demo";
  $("#apiKey").style.display = (state.aiMode === "api") ? "block" : "none";
  $("#apiKey").value = state.apiKey || "";

  $("#loginBtn").onclick = login;
  $("#logoutBtn").onclick = logout;
  $("#aiMode").onchange = (e)=>{
    state.aiMode = e.target.value;
    $("#apiKey").style.display = (state.aiMode === "api") ? "block" : "none";
    save();
  };
  $("#apiKey").oninput = (e)=>{ state.apiKey = e.target.value; save(); };

  $("#addTx").onclick = addTx;
  $("#resetData").onclick = resetData;
  $("#exportBtn").onclick = exportJSON;
  $("#importBtn").onclick = ()=> $("#importFile").click();
  $("#importFile").onchange = importJSON;

  // Ajoute bouton ⚙️ Persona + panneau de config (injecté en JS, pas besoin de modifier le HTML)
  injectPersonaButtonAndPanel();

  $("#sendChat").onclick = sendChat;
  $("#chatInput").addEventListener("keydown", e=>{ if (e.key === "Enter") sendChat(); });

  let deferredPrompt=null;
  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault(); deferredPrompt=e;
    $("#installBtn") && ($("#installBtn").onclick = async ()=>{
      if (!deferredPrompt) return;
      deferredPrompt.prompt(); deferredPrompt=null;
    });
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

  if (state.tx.length === 0) seedDemo();
  render();

  // Salutation Persona + Conditions si activées
  personaHelloAndTOS();
}

// -----------------------------
// LOGIN
// -----------------------------
function login(){
  const email = $("#email").value.trim();
  const name = $("#name").value.trim() || "Utilisateur";
  if (!email) { alert("Email requis (démo)"); return; }
  state.user = { email, name };
  save();
  personaHelloAndTOS(true);
}
function logout(){ state.user=null; save(); pushPersona("ai","Session fermée. Reviens quand tu veux."); }

// -----------------------------
// TX / BUDGET
// -----------------------------
function addTx(){
  const label = $("#txLabel").value.trim();
  const amount = parseFloat($("#txAmount").value);
  const cat = $("#txCat").value;
  if (!label || isNaN(amount)) { alert("Libellé et montant requis"); return; }
  state.tx.unshift({ id: crypto.randomUUID(), label, amount, cat, ts: Date.now() });
  $("#txLabel").value=""; $("#txAmount").value="";
  save(); render();
}
function resetData(){
  if (!confirm("Tout réinitialiser ?")) return;
  state.tx=[]; seedDemo(); save(); render();
}

function exportJSON(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download="bankia-demo.json"; a.click(); URL.revokeObjectURL(url);
}
function importJSON(evt){
  const file = evt.target.files?.[0]; if (!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{ Object.assign(state, JSON.parse(reader.result)); save(); render(); pushPersona("ai","Import terminé ✅"); }
    catch(e){ alert("JSON invalide"); }
  };
  reader.readAsText(file);
}

function seedDemo(){
  const sample=[
    {label:"Salaire", amount: 1450, cat:"Autres"},
    {label:"Loyer", amount:-600, cat:"Loyer"},
    {label:"Uber", amount:-18.5, cat:"Transport"},
    {label:"Spotify", amount:-9.99, cat:"Abonnements"},
    {label:"Carrefour", amount:-62.3, cat:"Courses"},
    {label:"Cinéma", amount:-12, cat:"Sorties"},
    {label:"Courses", amount:-45.1, cat:"Courses"},
    {label:"Remboursement ami", amount:50, cat:"Autres"},
    {label:"Essence", amount:-35, cat:"Transport"},
  ];
  state.tx = sample.reverse().map(x=>({...x, id:crypto.randomUUID(), ts:Date.now()-Math.floor(Math.random()*20)*86400000})).reverse();
}

// -----------------------------
// CALC & RENDER
// -----------------------------
function calc(){
  const monthStart=new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  let income=0, spend=0, byCat={};
  for(const t of state.tx){
    if (t.ts>=monthStart.getTime()){
      if (t.amount>=0) income+=t.amount; else spend+=Math.abs(t.amount);
      byCat[t.cat]=(byCat[t.cat]||0)+Math.abs(t.amount);
    }
  }
  let topCat="–",topVal=0;
  for (const [k,v] of Object.entries(byCat)){ if(v>topVal){ topVal=v; topCat=k; } }
  const balance = state.tx.reduce((a,b)=>a+b.amount,0);
  return {income,spend,topCat,balance,byCat};
}

function render(){
  const {income,spend,topCat,balance,byCat}=calc();
  $("#balanceView").textContent = fmt(balance);
  $("#spendMonth").textContent = fmt(spend);
  $("#incomeMonth").textContent = fmt(income);
  $("#topCat").textContent = topCat;

  const ul=$("#txList"); ul.innerHTML="";
  for(const t of state.tx){
    const li=document.createElement("li");
    const left=document.createElement("div"); const right=document.createElement("div");
    left.innerHTML=`<div>${t.label} <span class="small">· ${t.cat}</span></div><div class="small">${new Date(t.ts).toLocaleDateString('fr-FR')}</div>`;
    right.innerHTML=`<span class="${t.amount<0?'neg':'pos'}">${fmt(t.amount)}</span>`;
    li.appendChild(left); li.appendChild(right); ul.appendChild(li);
  }

  const wrap=$("#budgets"); wrap.innerHTML="";
  for(const [cat,goal] of Object.entries(state.budgets)){
    const used = byCat[cat]||0; const pct=Math.min(100, Math.round((used/goal)*100));
    const card=document.createElement("div"); card.className="box"; card.style.minWidth="220px";
    card.innerHTML=`<div class="small">${cat} — objectif ${fmt(goal)}</div>
      <div class="progress" style="margin-top:8px"><i style="width:${pct}%"></i></div>
      <div class="small">${fmt(used)} / ${fmt(goal)} (${pct}%)</div>`;
    wrap.appendChild(card);
  }
}

// -----------------------------
// CHAT & PERSONA
// -----------------------------
function pushPersona(role, text){
  // Ajoute une bulle avec persona (avatar/nom) + style
  const box = $("#chatBox");
  const wrap = document.createElement("div");
  wrap.className = "msg " + (role === "me" ? "me" : "ai");

  if (role === "ai" && state.aiPersona.enabled){
    // Habillage AI : avatar + nom + bulle colorée
    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.gap = "8px";
    head.style.marginBottom = "6px";

    const avatar = document.createElement("div");
    avatar.style.width = "22px";
    avatar.style.height = "22px";
    avatar.style.borderRadius = "999px";
    avatar.style.flex = "0 0 auto";
    avatar.style.border = "1px solid rgba(255,255,255,.15)";
    avatar.style.background = "#0e1423";
    if (state.aiPersona.avatar){
      avatar.style.backgroundImage = `url('${state.aiPersona.avatar}')`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
    } else {
      avatar.style.display = "flex";
      avatar.style.alignItems = "center";
      avatar.style.justifyContent = "center";
      avatar.style.fontSize = "12px";
      avatar.textContent = state.aiPersona.emoji || "🤖";
    }

    const name = document.createElement("div");
    name.textContent = state.aiPersona.name || "Assistant·e";
    name.style.fontSize = "12px";
    name.style.opacity = ".8";

    head.appendChild(avatar);
    head.appendChild(name);

    // Couleur bulle AI selon teinte
    const hue = Number(state.aiPersona.bubbleHue || 225);
    wrap.style.border = "1px solid hsla(" + hue + ", 50%, 40%, 0.45)";
    wrap.style.background = "linear-gradient(180deg, hsla("+hue+", 38%, 18%, .85), hsla("+hue+", 38%, 12%, .9))";

    wrap.appendChild(head);
  }

  // Contenu
  const body = document.createElement("div");
  body.textContent = text;
  wrap.appendChild(body);

  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
}

function typeLikeAI(text){
  // Simule une frappe pour l’IA selon typingSpeed
  return new Promise(async (resolve)=>{
    const box = $("#chatBox");
    const wrap = document.createElement("div");
    wrap.className = "msg ai";
    const hue = Number(state.aiPersona.bubbleHue || 225);
    wrap.style.border = "1px solid hsla(" + hue + ", 50%, 40%, 0.45)";
    wrap.style.background = "linear-gradient(180deg, hsla("+hue+", 38%, 18%, .85), hsla("+hue+", 38%, 12%, .9))";

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.gap = "8px";
    head.style.marginBottom = "6px";

    const avatar = document.createElement("div");
    avatar.style.width = "22px";
    avatar.style.height = "22px";
    avatar.style.borderRadius = "999px";
    avatar.style.flex = "0 0 auto";
    avatar.style.border = "1px solid rgba(255,255,255,.15)";
    avatar.style.background = "#0e1423";
    if (state.aiPersona.avatar){
      avatar.style.backgroundImage = `url('${state.aiPersona.avatar}')`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
    } else {
      avatar.style.display = "flex";
      avatar.style.alignItems = "center";
      avatar.style.justifyContent = "center";
      avatar.style.fontSize = "12px";
      avatar.textContent = state.aiPersona.emoji || "🤖";
    }
    const name = document.createElement("div");
    name.textContent = state.aiPersona.name || "Assistant·e";
    name.style.fontSize = "12px";
    name.style.opacity = ".8";
    head.appendChild(avatar); head.appendChild(name);
    wrap.appendChild(head);

    const body = document.createElement("div");
    wrap.appendChild(body);
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;

    const speed = Math.max(5, Number(state.aiPersona.typingSpeedMs||18));
    for (let i=0;i<text.length;i++){
      body.textContent += text[i];
      await sleep(speed);
      box.scrollTop = box.scrollHeight;
    }
    resolve();
  });
}

async function sendChat(){
  const q=$("#chatInput").value.trim(); if(!q) return;
  $("#chatInput").value=""; pushPersona("me", q);
  $("#thinkingBar").style.width="15%";
  try{
    let ans = "";
    if (state.aiMode==="demo"){
      ans = personaWrap(demoAI(q));
      await sleep(350+Math.random()*450);
      await typeLikeAI(ans);
    }else{
      if (!state.apiKey){
        await typeLikeAI(personaWrap("Ajoute d'abord ta clé API, sinon reste en mode Démo."));
      } else {
        const raw = await remoteAI(personaPrompt(q), state.apiKey);
        ans = personaWrap(raw);
        await typeLikeAI(ans);
      }
    }
  }catch(e){ console.error(e); await typeLikeAI(personaWrap("Oups, petite erreur. Reste en mode Démo si besoin.")); }
  finally{ $("#thinkingBar").style.width="0%"; }
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// Persona : enrobe les réponses avec ton/style
function personaWrap(text){
  const p = state.aiPersona;
  const signature = p.emoji ? ` ${p.emoji}` : "";
  return text + signature;
}
function personaPrompt(userMsg){
  const p = state.aiPersona;
  const personaSystem = `Tu es ${p.name}, ${p.role}. Genre: ${p.gender}. Ton: ${p.tone}. Reste positive, concise et utile.`;
  return `${personaSystem}\nUtilisateur: ${userMsg}`;
}

function personaHelloAndTOS(force=false){
  if (!state.aiPersona.enabled) return;
  const p = state.aiPersona;
  if (force || $("#chatBox").childElementCount === 0){
    const greet = (p.greeting || "").replace("{{name}}", p.name).replace("{{role}}", p.role);
    pushPersona("ai", greet || `Bonjour ! Je suis ${p.name}.`);
  }
  if (p.showTOS && (!p.showTOSOncePerSession || !p._tosShownThisSession)){
    pushPersona("ai", p.tosText || "Conditions d'utilisation : démo non contractuelle.");
    p._tosShownThisSession = true; save();
  }
}

// -----------------------------
// DEMO AI (règles locales)
// -----------------------------
function demoAI(q){
  const {income,spend,topCat,byCat}=calc();
  const spendPct = income>0 ? Math.round((spend/income)*100) : 0;
  const tips=[];
  if (spendPct>80) tips.push("Tu brûles >80% de tes revenus. Vise 70% max en réduisant 10% sur les 2 plus grosses catégories.");
  if ((byCat["Sorties"]||0)>120) tips.push("Sorties >120€ : fixe un plafond hebdo (25€) et paye en cash.");
  if ((byCat["Abonnements"]||0)>40) tips.push("Audit abonnements : supprime le superflu, négocie le reste.");
  if ((byCat["Courses"]||0)>200) tips.push("Courses élevées : marques distributeur = ~30% d'économie.");
  if ((byCat["Transport"]||0)>70) tips.push("Transport : regroupe tes trajets, surveille la pression des pneus.");
  if (income - spend < 100) tips.push("Marge <100€ : micro-épargne auto de 3–5€/jour.");
  const starter=`Analyse du mois : Dépenses ${fmt(spend)} (${spendPct}% des revenus) — Revenus ${fmt(income)} — Catégorie la plus gourmande : ${topCat}.`;
  const generic="Actions rapides : 1) Budgets par catégorie, 2) Épargne après chaque revenu, 3) Saisie quotidienne (2 min).";

  const lower=q.toLowerCase();
  if (lower.includes("où") && (lower.includes("dépense")||lower.includes("plus"))){
    return starter + ` Tu dépenses surtout en **${topCat}**. Baisse de 15% cette catégorie et réalloue en épargne.`;
  }
  if (lower.includes("économis") || lower.includes("épargne") || lower.includes("100")){
    return starter + ` Pour économiser **100€** ce mois-ci : -25€ Sorties, -35€ Courses, -40€ abonnements. ` + generic;
  }
  if (lower.includes("budget") || lower.includes("plafond")){
    return starter + ` Proposition budget : Courses ${fmt(300)}, Sorties ${fmt(120)}, Transport ${fmt(70)}, Loyer ${fmt(600)}, Abonnements ${fmt(40)}, Autres ${fmt(90)}.`;
  }
  return starter + " " + (tips.length? tips.join(" ") : generic);
}

// -----------------------------
// REMOTE AI (optionnel)
// -----------------------------
async function remoteAI(qWithPersona, apiKey){
  const body={
    model:"gpt-4o-mini",
    messages:[
      {role:"system", content:"Coach financier utile basé sur les données locales. Reste concis, clair, orienté actions."},
      {role:"user", content:qWithPersona}
    ]
  };
  const res=await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
    body:JSON.stringify(body)
  });
  if(!res.ok) throw new Error("API error "+res.status);
  const data=await res.json();
  return data.choices?.[0]?.message?.content || "Réponse vide.";
}

// -----------------------------
// PERSONA UI (injectée)
// -----------------------------
function injectPersonaButtonAndPanel(){
  const chatFoot = $(".foot"); // pied du module chat
  if (!chatFoot) return;

  // Bouton ⚙️ Persona
  const gear = document.createElement("button");
  gear.className = "btn";
  gear.style.marginLeft = "4px";
  gear.title = "Réglages Persona IA";
  gear.textContent = "⚙️ Persona";
  gear.onclick = openPersonaPanel;
  chatFoot.appendChild(gear);

  // Panel masqué (modal)
  const modal = document.createElement("div");
  modal.id = "personaModal";
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.background = "rgba(0,0,0,.55)";
  modal.style.backdropFilter = "blur(4px)";
  modal.style.display = "none";
  modal.style.zIndex = "9999";

  const card = document.createElement("div");
  card.style.maxWidth = "560px";
  card.style.margin = "8vh auto";
  card.style.background = "rgba(15,19,32,.95)";
  card.style.border = "1px solid #1d2334";
  card.style.borderRadius = "16px";
  card.style.padding = "16px";
  card.style.boxShadow = "0 10px 40px rgba(0,0,0,.5)";

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:700">Persona IA — Réglages</div>
      <button id="personaClose" class="btn">Fermer</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label>Nom<br><input id="p_name" /></label>
      <label>Rôle<br><input id="p_role" /></label>
      <label>Genre<br>
        <select id="p_gender">
          <option value="femme">Femme</option>
          <option value="homme">Homme</option>
          <option value="neutre">Neutre</option>
        </select>
      </label>
      <label>Émoji<br><input id="p_emoji" placeholder="💙" /></label>
      <label>Avatar (URL)<br><input id="p_avatar" placeholder="https://.../avatar.png" /></label>
      <label>Teinte bulle (0–360)<br><input id="p_hue" type="number" min="0" max="360" /></label>
      <label style="grid-column:1/3">Ton (ex: chaleureuse, claire et proactive)<br><input id="p_tone" /></label>
      <label style="grid-column:1/3">Message d'accueil<br><input id="p_greet" /></label>
      <label style="grid-column:1/3">Conditions (TOS)<br><textarea id="p_tos" rows="3"></textarea></label>
      <label><input type="checkbox" id="p_enabled" /> Activer persona</label>
      <label><input type="checkbox" id="p_tos_on" /> Afficher les conditions</label>
      <label><input type="checkbox" id="p_tos_once" /> Une seule fois par session</label>
      <label>Vitesse frappe (ms/char)<br><input id="p_typing" type="number" min="5" max="100" /></label>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button id="personaReset" class="btn">Réinitialiser</button>
      <button id="personaSave" class="btn primary">Enregistrer</button>
    </div>
  `;

  modal.appendChild(card);
  document.body.appendChild(modal);

  // Wire events
  $("#personaClose").onclick = ()=> modal.style.display="none";
  $("#personaSave").onclick = ()=>{
    const p = state.aiPersona;
    p.name = $("#p_name").value.trim() || p.name;
    p.role = $("#p_role").value.trim() || p.role;
    p.gender = $("#p_gender").value;
    p.emoji = $("#p_emoji").value || p.emoji;
    p.avatar = $("#p_avatar").value.trim();
    p.bubbleHue = Math.max(0, Math.min(360, Number($("#p_hue").value||p.bubbleHue)));
    p.tone = $("#p_tone").value.trim() || p.tone;
    p.greeting = $("#p_greet").value.trim() || p.greeting;
    p.tosText = $("#p_tos").value.trim() || p.tosText;
    p.enabled = $("#p_enabled").checked;
    p.showTOS = $("#p_tos_on").checked;
    p.showTOSOncePerSession = $("#p_tos_once").checked;
    p.typingSpeedMs = Math.max(5, Number($("#p_typing").value||p.typingSpeedMs));
    save();
    modal.style.display="none";
    pushPersona("ai","Paramètres persona enregistrés ✅");
  };
  $("#personaReset").onclick = ()=>{
    state.aiPersona = {
      enabled: true,
      name: "Camille",
      role: "Assistante financière",
      gender: "femme",
      tone: "chaleureuse, claire et proactive",
      emoji: "💙",
      avatar: "",
      bubbleHue: 225,
      greeting: "Bonjour ! Je suis {{name}}, {{role}}. Pose-moi ta première question et je te réponds avec des conseils concrets 😉",
      showTOS: true,
      tosText: "Je suis une IA en démo. Mes réponses sont indicatives: vérifie avant décision. En poursuivant, tu acceptes ces conditions.",
      showTOSOncePerSession: true,
      _tosShownThisSession: false,
      typingSpeedMs: 18
    };
    save();
    modal.style.display="none";
    pushPersona("ai","Persona réinitialisée aux valeurs par défaut.");
  };

  function openPersonaPanel(){
    // Hydrate les champs avec la state actuelle
    $("#p_name").value = state.aiPersona.name || "";
    $("#p_role").value = state.aiPersona.role || "";
    $("#p_gender").value = state.aiPersona.gender || "femme";
    $("#p_emoji").value = state.aiPersona.emoji || "";
    $("#p_avatar").value = state.aiPersona.avatar || "";
    $("#p_hue").value = Number(state.aiPersona.bubbleHue||225);
    $("#p_tone").value = state.aiPersona.tone || "";
    $("#p_greet").value = state.aiPersona.greeting || "";
    $("#p_tos").value = state.aiPersona.tosText || "";
    $("#p_enabled").checked = !!state.aiPersona.enabled;
    $("#p_tos_on").checked = !!state.aiPersona.showTOS;
    $("#p_tos_once").checked = !!state.aiPersona.showTOSOncePerSession;
    $("#p_typing").value = Number(state.aiPersona.typingSpeedMs||18);
    modal.style.display = "block";
  }
}

// -----------------------------
document.addEventListener("DOMContentLoaded", init);
