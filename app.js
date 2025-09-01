// BankAI app.js — v9.1 (fix no-<script>, persona mobile, clearer tips, immobilier)
console.log("BankAI app.js v9.1");

// --- small utils
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => (n < 0 ? "-" : "") + "€" + Math.abs(n).toFixed(2);
const TODAY = new Date();
const MONTH = TODAY.toLocaleString("fr-FR", { month: "long", year: "numeric" });
const pad = (n) => String(n).padStart(2, "0");
const mkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const BUILD_VERSION = "v11";

// -----------------------------
// STATE
// -----------------------------
const state = {
  user: null,
  tx: [],
  budgets: { Courses: 300, Sorties: 150, Transport: 80, Loyer: 600, Abonnements: 50, Autres: 120 },
  aiMode: "demo",
  apiKey: "",
  incomeByMonth: {},

  aiPersona: {
    enabled: true,
    name: "Camille",
    role: "Assistante financière",     // auto-dérivé du genre
    gender: "femme",                   // femme | homme | neutre
    tone: "chaleureux",
    emoji: "💙",
    avatar: "",
    bubbleHue: 225,
    greeting: "",
    typingSpeedMs: 18,
  },
};

const KEY = "bankia_demo_state_v3";
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function load(){
  const raw = localStorage.getItem(KEY); if(!raw) return;
  try{ Object.assign(state, JSON.parse(raw)); }catch(e){ console.warn(e); }
}

// -----------------------------
// INIT
// -----------------------------
function init(){
  load();
  const mt=$("#monthTag"); if(mt) mt.textContent = MONTH;

  // login/API (présents ou non selon ton HTML)
  $("#email") && ($("#email").value = state.user?.email || "");
  $("#name")  && ($("#name").value  = state.user?.name  || "");
  $("#aiMode") && ($("#aiMode").value = state.aiMode || "demo");
  $("#apiKey") && ($("#apiKey").style.display = state.aiMode === "api" ? "block" : "none");
  $("#apiKey") && ($("#apiKey").value = state.apiKey || "");

  $("#loginBtn") && ($("#loginBtn").onclick = login);
  $("#logoutBtn") && ($("#logoutBtn").onclick = logout);
  $("#aiMode") && ($("#aiMode").onchange = (e)=>{ state.aiMode = e.target.value; $("#apiKey").style.display = state.aiMode==="api"?"block":"none"; save(); });
  $("#apiKey") && ($("#apiKey").oninput = (e)=>{ state.apiKey = e.target.value; save(); });

  $("#addTx") && ($("#addTx").onclick = addTx);
  $("#resetData") && ($("#resetData").onclick = resetData);
  $("#exportBtn") && ($("#exportBtn").onclick = exportJSON);
  $("#importBtn") && ($("#importBtn").onclick = ()=> $("#importFile").click());
  $("#importFile") && ($("#importFile").onchange = importJSON);

  // UI injectée
  injectPersonaButtonAndPanel();
  injectIncomePanel(); // 💶

  $("#sendChat") && ($("#sendChat").onclick = sendChat);
  $("#chatInput") && ($("#chatInput").addEventListener("keydown", (e)=>{ if(e.key==="Enter") sendChat(); }));

  // PWA
  let deferredPrompt=null;
  window.addEventListener("beforeinstallprompt",(e)=>{
    e.preventDefault(); deferredPrompt=e;
    $("#installBtn") && ($("#installBtn").onclick = async ()=>{
      if(!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt=null;
    });
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js?v="+BUILD_VERSION);

  if (state.tx.length===0) seedDemo();
  render();
  updatePersonaTitle();
  personaHello();

  // ✨ effets mobile & reveals
  enhanceMobileUX();
}

function updatePersonaTitle(){
  const el = $("#coachTitle");
  if (el) el.textContent = state.aiPersona.name || "Coach IA";
}

// -----------------------------
// LOGIN
// -----------------------------
function login(){
  const email = $("#email").value.trim();
  const name  = $("#name").value.trim() || "Utilisateur";
  if (!email){ alert("Email requis (démo)"); return; }
  state.user = { email, name }; save(); personaHello(true);
}
function logout(){ state.user=null; save(); pushPersona("ai","Session fermée. Reviens quand tu veux."); }

// -----------------------------
// TX / BUDGET
// -----------------------------
function addTx(){
  const label = $("#txLabel").value.trim();
  const amount = parseFloat($("#txAmount").value);
  const cat = $("#txCat").value;
  if(!label || isNaN(amount)){ alert("Libellé et montant requis"); return; }
  state.tx.unshift({ id:crypto.randomUUID(), label, amount, cat, ts:Date.now() });
  $("#txLabel").value=""; $("#txAmount").value="";
  save(); render();
}
function resetData(){
  if(!confirm("Tout réinitialiser ?")) return;
  state.tx=[]; seedDemo(); save(); render();
}

function exportJSON(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download="bankia-demo.json"; a.click(); URL.revokeObjectURL(url);
}
function importJSON(evt){
  const file=evt.target.files?.[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{ Object.assign(state, JSON.parse(reader.result)); save(); render(); pushPersona("ai","Import terminé ✅"); updatePersonaTitle(); }
    catch(e){ alert("JSON invalide"); }
  };
  reader.readAsText(file);
}

function seedDemo(){
  const sample=[
    { label:"Salaire", amount:1450, cat:"Autres" },
    { label:"Loyer", amount:-600, cat:"Loyer" },
    { label:"Uber", amount:-18.5, cat:"Transport" },
    { label:"Spotify", amount:-9.99, cat:"Abonnements" },
    { label:"Carrefour", amount:-62.3, cat:"Courses" },
    { label:"Cinéma", amount:-12, cat:"Sorties" },
    { label:"Courses", amount:-45.1, cat:"Courses" },
    { label:"Remboursement ami", amount:50, cat:"Autres" },
    { label:"Essence", amount:-35, cat:"Transport" },
  ];
  state.tx = sample.reverse().map(x=>({...x, id:crypto.randomUUID(), ts:Date.now()-Math.floor(Math.random()*20)*86400000})).reverse();
  state.incomeByMonth[mkey(new Date())] = 1700;
}

// -----------------------------
// CALC & DATA ACCESS
// -----------------------------
function getMonthRange(d=new Date()){ const start=new Date(d.getFullYear(), d.getMonth(),1); const end=new Date(d.getFullYear(), d.getMonth()+1,1); return {start,end}; }
function monthTx(d=new Date()){ const {start,end}=getMonthRange(d); return state.tx.filter(t=> t.ts>=start.getTime() && t.ts<end.getTime()); }
function incomeObservedFor(d=new Date()){ return monthTx(d).filter(t=>t.amount>0).reduce((a,b)=>a+b.amount,0); }
function incomePlannedFor(d=new Date()){ return state.incomeByMonth[mkey(d)] || null; }
function incomeFinalFor(d=new Date()){ const p=incomePlannedFor(d); const o=incomeObservedFor(d); return (p!=null && p>0)?p:o; }
function spendFor(d=new Date()){ return Math.abs(monthTx(d).filter(t=>t.amount<0).reduce((a,b)=>a+b.amount,0)); }
function byCategoryFor(d=new Date()){
  const res={}; for(const t of monthTx(d)) if(t.amount<0) res[t.cat]=(res[t.cat]||0)+Math.abs(t.amount); return res;
}
function topCategoryFor(d=new Date()){ const by=byCategoryFor(d); let top="–",val=0; for(const [k,v] of Object.entries(by)) if(v>val){val=v; top=k;} return {top,val}; }
function subscriptionsHeuristics(){
  const map=new Map();
  for(const t of state.tx){ if(t.amount>=0) continue; const key=t.label.toLowerCase().replace(/\s+/g," ").trim(); if(!map.has(key)) map.set(key,[]); map.get(key).push(t); }
  const subs=[];
  for(const [label,arr] of map.entries()){ if(arr.length>=2){ const avg=Math.abs(arr.reduce((a,b)=>a+b.amount,0))/arr.length; const last=arr.sort((a,b)=>b.ts-a.ts)[0]; subs.push({label,avg:Math.round(avg*100)/100,lastDate:new Date(last.ts)});} }
  subs.sort((a,b)=>b.avg-a.avg); return subs.slice(0,8);
}
function forecastEndOfMonth(){
  const {start}=getMonthRange(new Date()); const today=new Date();
  const daysPassed=Math.max(1, Math.ceil((today-start)/86400000));
  const spent=spendFor(today); const avgDaily=spent/daysPassed;
  const daysInMonth=new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
  const forecast=Math.round(avgDaily*daysInMonth*100)/100;
  return {avgDaily, forecast, daysPassed, daysInMonth};
}
function budget50_30_20(d=new Date()){
  const income=incomeFinalFor(d); if(!income||income<=0) return null;
  const needs=income*0.5, wants=income*0.3, saveAmt=income*0.2;
  return { income, needs:Math.round(needs*100)/100, wants:Math.round(wants*100)/100, save:Math.round(saveAmt*100)/100 };
}
function balanceAll(){ return state.tx.reduce((a,b)=>a+b.amount,0); }

// -----------------------------
// RENDER
// -----------------------------
function render(){
  const d=new Date(); const incomeObserved=incomeObservedFor(d); const income=incomeFinalFor(d); const spend=spendFor(d); const {top}=topCategoryFor(d);
  $("#balanceView") && ($("#balanceView").textContent = fmt(balanceAll()));
  $("#spendMonth")  && ($("#spendMonth").textContent  = fmt(spend));
  $("#incomeMonth") && ($("#incomeMonth").textContent = fmt(income || incomeObserved || 0));
  $("#topCat") && ($("#topCat").textContent = top);

  const ul=$("#txList");
  if(ul){ ul.innerHTML="";
    for(const t of state.tx){
      const li=document.createElement("li"); const left=document.createElement("div"); const right=document.createElement("div");
      left.innerHTML=`<div>${t.label} <span class="small">· ${t.cat}</span></div><div class="small">${new Date(t.ts).toLocaleDateString("fr-FR")}</div>`;
      right.innerHTML=`<span class="${t.amount<0?"neg":"pos"}">${fmt(t.amount)}</span>`;
      li.appendChild(left); li.appendChild(right); ul.appendChild(li);
    }
  }

  const wrap=$("#budgets"); if(wrap){
    wrap.innerHTML=""; const byCat=byCategoryFor(d);
    for(const [cat,goal] of Object.entries(state.budgets)){
      const used=byCat[cat]||0; const pct=Math.min(100, Math.round((used/goal)*100));
      const card=document.createElement("div"); card.className="box"; card.style.minWidth="220px";
      card.innerHTML=`<div class="small">${cat} — objectif ${fmt(goal)}</div>
        <div class="progress" style="margin-top:8px"><i style="width:${pct}%"></i></div>
        <div class="small">${fmt(used)} / ${fmt(goal)} (${pct}%)</div>`;
      wrap.appendChild(card);
    }
  }
}

// -----------------------------
// CHAT & PERSONA
// -----------------------------
function pushPersona(role,text){
  const box=$("#chatBox"); if(!box) return;
  const wrap=document.createElement("div");
  wrap.className="msg "+(role==="me"?"me":"ai");

  if(role==="ai" && state.aiPersona.enabled){
    const head=document.createElement("div");
    head.style.display="flex"; head.style.alignItems="center"; head.style.gap="8px"; head.style.marginBottom="6px";

    const avatar=document.createElement("div");
    avatar.style.width="22px"; avatar.style.height="22px"; avatar.style.borderRadius="999px";
    avatar.style.flex="0 0 auto"; avatar.style.border="1px solid rgba(255,255,255,.15)"; avatar.style.background="#0e1423";
    if(state.aiPersona.avatar){
      avatar.style.backgroundImage=`url('${state.aiPersona.avatar}')`;
      avatar.style.backgroundSize="cover"; avatar.style.backgroundPosition="center";
    }else{
      avatar.style.display="flex"; avatar.style.alignItems="center"; avatar.style.justifyContent="center"; avatar.style.fontSize="12px";
      avatar.textContent=state.aiPersona.emoji || "🤖";
    }

    const name=document.createElement("div"); name.textContent=state.aiPersona.name || "Conseiller·ère"; name.style.fontSize="12px"; name.style.opacity=".8";
    head.appendChild(avatar); head.appendChild(name);

    const hue=Number(state.aiPersona.bubbleHue||225);
    wrap.style.border="1px solid hsla("+hue+", 50%, 40%, 0.45)";
    wrap.style.background="linear-gradient(180deg, hsla("+hue+", 38%, 18%, .85), hsla("+hue+", 38%, 12%, .9))";

    wrap.appendChild(head);
  }

  const body=document.createElement("div");
  body.style.whiteSpace="pre-wrap";
  body.textContent=text;
  wrap.appendChild(body);

  box.appendChild(wrap); box.scrollTop=box.scrollHeight;
}

function typeLikeAI(text){
  return new Promise(async (resolve)=>{
    const box=$("#chatBox"); if(!box) return resolve();
    const wrap=document.createElement("div"); wrap.className="msg ai";
    const hue=Number(state.aiPersona.bubbleHue||225);
    wrap.style.border="1px solid hsla("+hue+", 50%, 40%, 0.45)";
    wrap.style.background="linear-gradient(180deg, hsla("+hue+", 38%, 18%, .85), hsla("+hue+", 38%, 12%, .9))";

    const head=document.createElement("div");
    head.style.display="flex"; head.style.alignItems="center"; head.style.gap="8px"; head.style.marginBottom="6px";
    const avatar=document.createElement("div");
    avatar.style.width="22px"; avatar.style.height="22px"; avatar.style.borderRadius="999px"; avatar.style.flex="0 0 auto";
    avatar.style.border="1px solid rgba(255,255,255,.15)"; avatar.style.background="#0e1423";
    if(state.aiPersona.avatar){ avatar.style.backgroundImage=`url('${state.aiPersona.avatar}')`; avatar.style.backgroundSize="cover"; avatar.style.backgroundPosition="center"; }
    else{ avatar.style.display="flex"; avatar.style.alignItems="center"; avatar.style.justifyContent="center"; avatar.style.fontSize="12px"; avatar.textContent=state.aiPersona.emoji || "🤖"; }
    const name=document.createElement("div"); name.textContent=state.aiPersona.name||"Conseiller·ère"; name.style.fontSize="12px"; name.style.opacity=".8";
    head.appendChild(avatar); head.appendChild(name); wrap.appendChild(head);

    const body=document.createElement("div"); body.style.whiteSpace="pre-wrap"; wrap.appendChild(body);
    box.appendChild(wrap); box.scrollTop=box.scrollHeight;

    const speed=Math.max(5, Number(state.aiPersona.typingSpeedMs||18));
    for(let i=0;i<text.length;i++){ body.textContent+=text[i]; await sleep(speed); box.scrollTop=box.scrollHeight; }
    resolve();
  });
}

async function sendChat(){
  const q=$("#chatInput")?.value.trim(); if(!q) return;
  $("#chatInput").value=""; pushPersona("me", q);
  $("#thinkingBar") && ($("#thinkingBar").style.width="15%");
  setThinking(true);
  try{
    let ans="";
    if(state.aiMode==="demo"){
      ans = personaWrap(brainAnswer(q));
      await sleep(200+Math.random()*300); await typeLikeAI(ans);
    }else{
      if(!state.apiKey){ await typeLikeAI(personaWrap("Ajoute d'abord ta clé API, sinon reste en Démo.")); }
      else{ const raw=await remoteAI(personaPrompt(q), state.apiKey); ans=personaWrap(raw); await typeLikeAI(ans); }
    }
  }catch(e){ console.error(e); await typeLikeAI(personaWrap("Oups, petite erreur. Reste en mode Démo si besoin.")); }
  finally{ $("#thinkingBar") && ($("#thinkingBar").style.width="0%"); setThinking(false); }
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function personaWrap(text){
  const p=state.aiPersona;
  const toneSuffix = ({ chaleureux:" 😊", direct:" ✅", fun:" 😄", pro:" 📊", pédagogue:" 🧭" }[p.tone] || "");
  const signature = (p.emoji || "") + toneSuffix;
  return text + (signature ? " " + signature : "");
}
function personaPrompt(userMsg){
  const d=new Date(); const by=byCategoryFor(d); const inc=incomeFinalFor(d)||0; const spent=spendFor(d);
  const ctx=`Contexte: mois=${mkey(d)} revenu=${inc} dépenses=${spent} catégories=${JSON.stringify(by)}`;
  const p=state.aiPersona; const personaSystem=`Tu es ${p.name}, ${p.role}. Genre: ${p.gender}. Ton: ${p.tone}. Réponds humain, clair, actionnable.`;
  return `${personaSystem}\n${ctx}\nQuestion: ${userMsg}`;
}
function personaHello(force=false){
  if(!state.aiPersona.enabled) return;
  if(force || $("#chatBox")?.childElementCount===0){
    const p=state.aiPersona;
    const greet = `Hey ! Moi c'est ${p.name}, ${p.role}. En quoi je peux t'aider ? 💬`;
    pushPersona("ai", greet);
  }
}

// -----------------------------
// Intents (plus clairs + immobilier)
// -----------------------------
function numberFromText(str){
  const cleaned = str.replace(/\u202f/g," ").replace(",",".");
  const m = cleaned.match(/(\d+(?:[ .]\d{3})*(?:\.\d+)?)/);
  if(!m) return null;
  const n=parseFloat(m[1].replace(/[ .]/g,""));
  return isNaN(n)?null:n;
}
function percentFromText(str){ const m = str.match(/(\d{1,2}(?:\.\d+)?)\s*%/); return m ? parseFloat(m[1]) : null; }
function monthsFromText(str){ const m = str.match(/(\d{1,3})\s*(mois|months?)/i); return m ? parseInt(m[1],10) : null; }
function yearsFromText(str){ const m = str.match(/(\d{1,2})\s*(ans?|years?)/i); return m ? parseInt(m[1],10) : null; }
function rateFromText(str){ const m = str.match(/(\d+(?:\.\d+)?)\s*%/); return m ? (parseFloat(m[1])/100) : null; }
function human(lines){ return lines.filter(Boolean).join("\n\n"); }

function brainAnswer(q){
  const d=new Date(); const lower=q.toLowerCase();
  const income=incomeFinalFor(d)||0; const incomeObs=incomeObservedFor(d)||0; const spend=spendFor(d)||0;
  const {top}=topCategoryFor(d); const by=byCategoryFor(d);
  const {avgDaily,forecast,daysPassed,daysInMonth}=forecastEndOfMonth(); const monthKey=mkey(d);
  const daysLeft=Math.max(1, daysInMonth - daysPassed); const usableIncome=income||incomeObs;

  const safeToSpend = ()=>{ const fixed=(by["Loyer"]||0)+(by["Abonnements"]||0)+(by["Transport"]||0)*0.4; const left=Math.max(0, usableIncome - fixed - spend); return {left, perDay:left/daysLeft}; };
  const base50 = ()=>{ const base=budget50_30_20(d); if(!base) return null; const loyer=by["Loyer"]||0;
    const needs=Math.max(loyer, base.needs*0.5) + Math.max(0, by["Courses"]||0);
    const wants=Math.max(base.wants*0.5, by["Sorties"]||0);
    const saveAmt=Math.max(base.save, Math.max(0,(usableIncome-spend)*0.4));
    return { base, loyer, needs, wants, save:saveAmt };
  };

  // IMMOBILIER
  if (/(acheter|acquerir|acquérir).*(maison|appartement|appart|immobilier)/.test(lower) || /(crédit|pret|prêt).*(immobilier)/.test(lower)){
    const price = numberFromText(lower) || 0;
    let apport = 0;
    const pct = percentFromText(lower);
    if (pct!=null && price>0) apport = Math.round(price * (pct/100));
    else {
      const m = lower.match(/apport[^0-9]*(\d+(?:[ .]\d{3})*(?:\.\d+)?)/);
      if(m) apport = parseFloat(m[1].replace(/[ .]/g,""));
    }
    const years = yearsFromText(lower) || 25;
    const months = years*12;
    const rate = rateFromText(lower) ?? 0.04; // 4%
    const fraisPct = /neuf/.test(lower) ? 0.03 : 0.08;
    let frais = price>0 ? Math.round(price * fraisPct) : 0;

    const totalNeeded = Math.max(0, apport + frais);
    const loanBase = Math.max(0, price - apport - frais);
    const r = rate/12;
    const mensualite = loanBase>0 && rate>=0 ? Math.round( (loanBase * r) / (1 - Math.pow(1+r, -months)) ) : 0;

    const maxSafe = income ? Math.floor((income*0.35)) : null;
    const okDebt = (maxSafe!=null && mensualite>0) ? (mensualite <= maxSafe) : null;

    const wishMonths = monthsFromText(lower) || null;
    const toSave = totalNeeded;
    const perMonth = wishMonths ? Math.ceil(toSave / wishMonths) : null;

    const details = [
      price>0 ? `Prix visé : ${fmt(price)}` : null,
      `Apport pris en compte : ${fmt(apport)}${pct!=null ? " ("+pct+"%)" : ""}`,
      `Frais estimés (notaire, banque) : ~${fmt(frais)} (${Math.round(fraisPct*100)}%)`,
      `Montant à financer : ${fmt(loanBase)}`,
      mensualite>0 ? `Mensualité estimée sur ${years} ans à ${Math.round(rate*1000)/10}% : ~${fmt(mensualite)}` : null,
      (maxSafe!=null && mensualite>0) ? `Seuil conseillé (≤35% revenus) : ~${fmt(maxSafe)} → ${okDebt? "OK": "au-dessus, à revoir"}` : null
    ].filter(Boolean).join("\n");

    const savingPlan = wishMonths
      ? `Pour constituer apport + frais (~${fmt(toSave)}) en ${wishMonths} mois : viser ~${fmt(perMonth)}/mois.`
      : `Astuce : fixe un délai (ex. 24 mois) → je te donne une cible d’épargne mensuelle.`;

    return human([
      "Projet immobilier — estimation rapide",
      details,
      savingPlan,
      "Pourquoi ces chiffres ?\n• Frais ~8% ancien / ~3% neuf ⇒ à ajouter au prix.\n• Endettement recommandé ≤ 33–35% du revenu ⇒ sécurise la mensualité.\n• Garde 3 mois de dépenses en épargne de sécurité après achat."
    ]);
  }

  // Revenu saisi
  if (/(revenu|salaire|pay[eé]|gains).*(saisi|déclar|entr|mettre)|changer.*revenu/.test(lower)){
    return human([
      "Pour des calculs fiables, ajoute ton revenu du mois.",
      "→ Appuie sur « 💶 Revenu », choisis le mois, saisis le montant, enregistre."
    ]);
  }

  // Épargne avec montant
  const amountInText = numberFromText(lower);
  if (/(économis|epargne|épargn|mettre de c[oô]t[ée])/.test(lower) && amountInText!=null){
    const target=amountInText; if(!usableIncome){ return human(["Pour un plan précis, j’ai besoin de ton revenu du mois.","→ Ajoute-le via « 💶 Revenu »."]); }
    const order=[["Sorties",0.35],["Courses",0.25],["Abonnements",0.25],["Transport",0.15],["Autres",0.25]];
    let remaining=target; const cuts=[];
    for(const [cat,maxPct] of order){ const cur=by[cat]||0; if(cur<=0) continue; const possible=Math.min(cur*maxPct, remaining); if(possible>0){ cuts.push([cat, Math.round(possible*100)/100, cur]); remaining=Math.max(0, remaining-possible); if(remaining===0) break; } }
    const perDay=target/daysLeft;
    const lines = cuts.map(([c,v,cur])=>`• ${c} : -${fmt(v)} (car tu dépenses ~${fmt(cur)} dessus)`);
    return human([
      `Objectif : mettre de côté ${fmt(target)} ce mois-ci.`,
      lines.length ? lines.join("\n") : "• Vise d’abord les postes non essentiels (Sorties/Abonnements).",
      `• Micro-épargne : ~${fmt(perDay)}/jour jusqu’à la fin du mois.`,
      "Pourquoi : on coupe d’abord les dépenses variables (faciles à réduire) avant les charges fixes."
    ]);
  }

  // Épargne sans montant
  if (/(épargn|economis|mettre de c[oô]t[ée])/.test(lower)){
    const base=budget50_30_20(d); if(!base) return human(["Pour une cible d’épargne personnalisée, indique ton revenu via « 💶 Revenu »."]);
    const target=Math.max(50, Math.round(base.save)); const perDay=target/daysLeft;
    return human([`Capacité d’épargne conseillée : ${fmt(target)} ce mois-ci.`, `Virement automatique le lendemain du salaire. Cible journalière : ~${fmt(perDay)}.`]);
  }

  // Abonnements
  if (/abonnement|récurrent|spotify|netflix|prime|icloud/.test(lower)){
    const subs=subscriptionsHeuristics();
    if(!subs.length) return human(["Je ne vois pas d’abonnements clairs. Renomme les lignes récurrentes en “Abonnement X” et je t’audite ça."]);
    const lines=subs.slice(0,6).map(s=>`• ${s.label} ≈ ${fmt(s.avg)}/mois (dernier : ${s.lastDate.toLocaleDateString("fr-FR")})`).join("\n");
    return human([
      "Abonnements repérés :",
      lines,
      "Plan en 3 étapes :\n1) Classe par usage réel (utilisé cette semaine ?). Si non → résilie/pause.\n2) Regroupe (un seul cloud, une plateforme vidéo à la fois).\n3) Fixe un plafond récurrent (ex : 15–25 €/mois)."
    ]);
  }

  // Courses
  if (/(courses|supermarch|aliment|bouffe|nourriture)/.test(lower)){
    const budget=Math.max(80, Math.round((usableIncome||1200)*0.12));
    return human([
      `Budget courses conseillé : ${fmt(budget)}.`,
      "Pourquoi ces tips : manger avant (moins d’achats impulsifs), liste/repas réutilisables (moins de gaspillage), MDD/vrac/congelé (meilleur €/kg), batch-cook (moins de livraisons), cap panier (frein à l’extra)."
    ]);
  }

  // Safe-to-spend
  if (/(reste|safe).*(vivre|dépenser)|safe[- ]to[- ]spend/.test(lower)){
    const s=safeToSpend();
    return human([`Reste à dépenser : ${fmt(s.left)} (≈ ${fmt(s.perDay)}/jour).`, "Garde 40% de marge imprévu, consomme 60% max en plaisir."]);
  }

  // Projection fin de mois
  if (/(prévision|fin de mois|projection)/.test(lower)){
    return human([`Projection des dépenses : ≈ ${fmt(forecast)} (moyenne ${fmt(avgDaily)}/jour, ${daysPassed}/${daysInMonth} jours).`, `Marge cible : ${fmt(Math.max(0,(usableIncome - forecast)))}.`]);
  }

  // Revenus irréguliers
  if (/(irr[ée]guli|freelance|ind[ée]pendant|prime|bonus|variable)/.test(lower)){
    return human([
      "Revenus irréguliers :",
      "• Compte tampon (1 mois de dépenses) → verse-toi un salaire fixe\n• Surplus : 50% épargne / 50% plaisir-dettes\n• Place les grosses charges juste après les grosses rentrées"
    ]);
  }

  // Dettes
  if (/(dette|crédit|rembourser|intér[êe]ts)/.test(lower)){
    const room=Math.max(0, (usableIncome - spend));
    return human([
      "Méthode avalanche :",
      `• Alloue ~${fmt(Math.max(20, Math.round(room*0.6)))} / mois`,
      "• Priorise la dette au taux le plus élevé\n• Quand une tombe, réaffecte la mensualité à la suivante"
    ]);
  }

  // Frais bancaires
  if (/(frais|agios|d[ée]couvert|commission d'intervention)/.test(lower)){
    return human([
      "Réduire les frais bancaires :",
      "• Alerte solde bas + virement auto le jour J des charges fixes\n• Si ponctuel : demande un geste commercial\n• Carte à autorisation systématique pour éviter le découvert"
    ]);
  }

  // Facture en retard
  if (/(facture|loyer|edf|eau|t[lé]l[eé]phone).*(retard|en retard|impay[ée])/.test(lower)){
    return human([
      "Facture en retard :",
      "• Appelle → demande un échéancier\n• Paie un petit montant tout de suite (bonne foi)\n• Coupe les dépenses non essentielles 15 jours"
    ]);
  }

  // CAF / APL
  if (/\b(caf|apl|aide au logement|prime d'activit[ée])\b/.test(lower)){
    return human([
      "Aides :",
      "• Vérifie l’éligibilité (simulateurs CAF / service-public)\n• Mets à jour tes revenus mensuels\n• Compte 1–2 mois de délai pour le premier versement"
    ]);
  }

  // Impôts
  if (/(imp[oô]ts|pr[ée]l[èe]vement|taux|d[ée]claration)/.test(lower)){
    return human([
      "Impôts — check rapide :",
      "• Vérifie le taux de prélèvement\n• Revenu en baisse → demande la mise à jour\n• Mensualisation = lissage"
    ]);
  }

  // Chargeback / carte
  if (/(opposition|carte|vol[ée]|perdue|d[ée]bit inconnu|chargeback|contester)/.test(lower)){
    return human([
      "Paiement suspect :",
      "• Opposition immédiate\n• Attestation de contestation\n• Remboursement souvent sous 10–30 jours"
    ]);
  }

  // Crypto/Actions
  if (/(crypto|bitcoin|bourse|actions|etf)/.test(lower)){
    return human([
      "Investissements — rappel :",
      "• D’abord fonds d’urgence + dettes chères\n• Si tu investis : DCA, long terme, montants que tu peux perdre\n• Diversifie, pas d’effet de levier"
    ]);
  }

  // Fallback bilan
  const spendPct = usableIncome>0 ? Math.round((spend/usableIncome)*100) : 0;
  const b = budget50_30_20(d);
  const budgetLine = b ? `Repère 50/30/20 : besoins ${fmt(b.needs)} • plaisir ${fmt(b.wants)} • épargne ${fmt(b.save)}.` : `Ajoute ton revenu via « 💶 Revenu » pour une reco 50/30/20.`;
  return human([
    `Bilan ${monthKey}`,
    `• Revenus : ${fmt(usableIncome)}\n• Dépenses : ${fmt(spend)} (${spendPct}% des revenus)\n• Catégorie la plus gourmande : ${top}`,
    budgetLine,
    "Je peux t’aider sur : Courses, Sorties, Abonnements, Dettes, Frais bancaires, Facture en retard, Voyage, Fonds d’urgence, Impôts, Side income."
  ]);
}

// -----------------------------
// REMOTE AI (optionnel)
async function remoteAI(qWithPersona, apiKey){
  const body={ model:"gpt-4o-mini", messages:[ {role:"system", content:"Coach financier utile basé sur les données locales. Reste humain, clair, actionnable."}, {role:"user", content:qWithPersona} ] };
  const res=await fetch("https://api.openai.com/v1/chat/completions",{ method:"POST", headers:{ "Content-Type":"application/json", Authorization:"Bearer "+apiKey }, body:JSON.stringify(body) });
  if(!res.ok) throw new Error("API error "+res.status);
  const data=await res.json(); return data.choices?.[0]?.message?.content || "Réponse vide.";
}

// -----------------------------
// ACTION DOCK (mobile-first)
function getActionDock(){
  const foot = document.querySelector(".foot");
  if (foot) return foot;
  let dock = document.getElementById("actionDock");
  if (!dock){
    dock = document.createElement("div");
    dock.id="actionDock";
    Object.assign(dock.style,{
      position:"fixed", left:"50%", transform:"translateX(-50%)",
      bottom:"12px", zIndex:"9999", display:"flex", gap:"8px",
      background:"rgba(10,14,25,.85)", border:"1px solid #1d2334",
      padding:"8px 10px", borderRadius:"14px", boxShadow:"0 6px 24px rgba(0,0,0,.35)", backdropFilter:"blur(6px)",
      maxWidth:"calc(100vw - 24px)", overflowX:"auto", WebkitOverflowScrolling:"touch", flexWrap:"wrap"
    });
    document.body.appendChild(dock);
  }
  return dock;
}

// -----------------------------
// PERSONA UI  (genre → rôle auto, responsive)
function roleFromGender(g){
  if(g==="homme") return "Assistant financier";
  if(g==="neutre") return "Conseiller·ère financier·ère";
  return "Assistante financière";
}
function injectPersonaButtonAndPanel(){
  const dock = getActionDock();

  const btn = document.createElement("button");
  btn.className="btn"; btn.style.marginLeft="4px"; btn.title="Personnaliser l'assistant·e";
  btn.textContent="🎨 Personnalise-moi";
  btn.onclick = openPersonaPanel;
  dock.appendChild(btn);

  const modal=document.createElement("div"); modal.id="personaModal";
  Object.assign(modal.style,{position:"fixed", inset:"0", background:"rgba(0,0,0,.55)", backdropFilter:"blur(6px)", display:"none", zIndex:"10000", padding:"max(8vh, calc(env(safe-area-inset-top) + 16px)) 12px 12px"});
  const card=document.createElement("div");
  card.className="card";
  card.style.maxWidth="560px"; card.style.width="min(560px, calc(100vw - 24px))"; card.style.margin="0 auto";
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:700">Personnalise ton coach</div>
      <button id="personaClose" class="btn">Fermer</button>
    </div>

    <div class="grid2">
      <label>Nom<br><input id="p_name" placeholder="Camille" /></label>
      <label>Genre<br>
        <select id="p_gender">
          <option value="femme">Femme</option>
          <option value="homme">Homme</option>
          <option value="neutre">Neutre</option>
        </select>
      </label>

      <label>Ton<br>
        <select id="p_tone">
          <option value="chaleureux">Chaleureux</option>
          <option value="direct">Direct</option>
          <option value="fun">Fun</option>
          <option value="pro">Pro</option>
          <option value="pédagogue">Pédagogue</option>
        </select>
      </label>
      <label>Émoji<br><input id="p_emoji" placeholder="💙" /></label>

      <label>Teinte bulle (0–360)<br><input id="p_hue" type="number" min="0" max="360" /></label>
      <div></div>

      <label style="grid-column:1/3">Avatar (depuis l'appareil)<br>
        <input id="p_avatar_file" type="file" accept="image/*">
        <div id="p_avatar_preview" style="margin-top:6px; display:flex; align-items:center; gap:8px">
          <div style="width:36px;height:36px;border-radius:999px;border:1px solid #2b3150;background:#0e1423" id="p_avatar_circle"></div>
          <span class="small">Optionnel. L’image reste en local.</span>
        </div>
      </label>

      <label>Vitesse frappe (ms/char)<br><input id="p_typing" type="number" min="5" max="100" /></label>
      <div></div>
    </div>

    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button id="personaReset" class="btn">Réinitialiser</button>
      <button id="personaSave" class="btn primary">Enregistrer</button>
    </div>`;
  modal.appendChild(card); document.body.appendChild(modal);

  $("#personaClose").onclick = ()=> modal.style.display="none";
  $("#p_gender").addEventListener("change", (e)=>{
    state.aiPersona.gender = e.target.value;
    state.aiPersona.role = roleFromGender(state.aiPersona.gender);
    save(); updatePersonaTitle();
  });

  $("#personaSave").onclick = ()=>{
    const p=state.aiPersona;
    p.name   = $("#p_name").value.trim() || p.name;
    p.gender = $("#p_gender").value;
    p.role   = roleFromGender(p.gender);
    p.tone   = $("#p_tone").value;
    p.emoji  = $("#p_emoji").value || p.emoji;
    p.bubbleHue = Math.max(0, Math.min(360, Number($("#p_hue").value || p.bubbleHue)));
    p.typingSpeedMs = Math.max(5, Number($("#p_typing").value || p.typingSpeedMs));
    save(); updatePersonaTitle(); modal.style.display="none";
    pushPersona("ai","Personnalisation enregistrée ✅");
  };

  $("#personaReset").onclick = ()=>{
    state.aiPersona = {
      enabled:true, name:"Camille", role:"Assistante financière", gender:"femme",
      tone:"chaleureux", emoji:"💙", avatar:"", bubbleHue:225,
      greeting:"", typingSpeedMs:18
    };
    save(); updatePersonaTitle(); modal.style.display="none"; pushPersona("ai","Persona réinitialisée.");
  };

  const fileInput = card.querySelector("#p_avatar_file");
  fileInput.onchange = ()=>{
    const f = fileInput.files?.[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      const dataUrl = reader.result;
      state.aiPersona.avatar = dataUrl;
      const circle=$("#p_avatar_circle");
      circle.style.backgroundImage=`url('${dataUrl}')`;
      circle.style.backgroundSize="cover";
      circle.style.backgroundPosition="center";
      save();
    };
    reader.readAsDataURL(f);
  };

  function openPersonaPanel(){
    $("#p_name").value  = state.aiPersona.name || "";
    $("#p_gender").value= state.aiPersona.gender || "femme";
    $("#p_tone").value  = state.aiPersona.tone || "chaleureux";
    $("#p_emoji").value = state.aiPersona.emoji || "";
    $("#p_hue").value   = Number(state.aiPersona.bubbleHue || 225);
    $("#p_typing").value= Number(state.aiPersona.typingSpeedMs || 18);
    const circle=$("#p_avatar_circle");
    if(state.aiPersona.avatar){
      circle.style.backgroundImage=`url('${state.aiPersona.avatar}')`;
      circle.style.backgroundSize="cover"; circle.style.backgroundPosition="center";
    }else{
      circle.style.backgroundImage=""; circle.style.background="#0e1423";
    }
    modal.style.display="block";
  }
}

// -----------------------------
// INCOME PANEL (💶)
function injectIncomePanel(){
  const dock = getActionDock();

  const btn=document.createElement("button");
  btn.className="btn"; btn.style.marginLeft="4px"; btn.title="Définir le revenu de ce mois";
  btn.textContent="💶 Revenu";
  btn.onclick=openIncomePanel;
  dock.appendChild(btn);

  const modal=document.createElement("div"); modal.id="incomeModal";
  Object.assign(modal.style,{position:"fixed", inset:"0", background:"rgba(0,0,0,.55)", backdropFilter:"blur(6px)", display:"none", zIndex:"10000", padding:"max(10vh, calc(env(safe-area-inset-top) + 16px)) 12px 12px"});
  const card=document.createElement("div");
  card.className="card";
  card.style.maxWidth="520px"; card.style.width="min(520px, calc(100vw - 24px))"; card.style.margin="0 auto";
  const now=new Date();
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:700">Revenu du mois</div>
      <button id="incomeClose" class="btn">Fermer</button>
    </div>
    <div class="grid2">
      <label>Mois<br><input id="inc_month" type="month" value="${now.getFullYear()}-${pad(now.getMonth()+1)}"></label>
      <label>Montant (€)<br><input id="inc_value" type="number" inputmode="decimal" step="0.01" placeholder="1700"></label>
    </div>
    <div class="small" style="opacity:.8;margin-top:6px">Le revenu saisi ici est prioritaire sur les entrées détectées.</div>
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button id="incomeDelete" class="btn">Supprimer mois</button>
      <button id="incomeSave" class="btn primary">Enregistrer</button>
    </div>
    <div id="incomeList" style="margin-top:12px"></div>`;
  modal.appendChild(card); document.body.appendChild(modal);

  $("#incomeClose").onclick = ()=> modal.style.display="none";
  $("#incomeSave").onclick = ()=>{
    const month=$("#inc_month").value; const val=parseFloat($("#inc_value").value);
    if(!month || isNaN(val)){ alert("Mois et montant requis."); return; }
    state.incomeByMonth[month]=val; save(); render(); fillIncomeList(); pushPersona("ai",`Revenu défini pour ${month}: ${fmt(val)} ✅`); modal.style.display="none";
  };
  $("#incomeDelete").onclick = ()=>{
    const month=$("#inc_month").value; if(!month) return;
    delete state.incomeByMonth[month]; save(); render(); fillIncomeList(); pushPersona("ai",`Revenu supprimé pour ${month}.`); modal.style.display="none";
  };

  function fillIncomeList(){
    const wrap=$("#incomeList"); const keys=Object.keys(state.incomeByMonth).sort();
    if(!keys.length){ wrap.innerHTML=""; return; }
    const rows=keys.map(k=>`<div class="small" style="display:flex;justify-content:space-between;border-bottom:1px dashed #253; padding:4px 0"><span>${k}</span><b>${fmt(state.incomeByMonth[k])}</b></div>`).join("");
    wrap.innerHTML=`<div class="small" style="margin-top:6px;opacity:.8">Revenus saisis :</div>${rows}`;
  }
  function openIncomePanel(){ $("#inc_value").value=""; fillIncomeList(); modal.style.display="block"; }
}

// -----------------------------
// Mobile feedback + reveals + barber-pole
function enhanceMobileUX(){
  const addRipple = (el) => {
    if(!el) return;
    el.addEventListener("touchstart", (e)=>{
      const t = e.touches[0];
      const rect = el.getBoundingClientRect();
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      el.style.setProperty("--rx", x+"px");
      el.style.setProperty("--ry", y+"px");
      el.classList.add("tap");
      setTimeout(()=> el.classList.remove("tap"), 350);
    }, {passive:true});
  };
  document.querySelectorAll(".btn,.pill,.card,.list li,.kpi .box").forEach(addRipple);

  const bal = document.getElementById("balanceView");
  if (bal){
    bal.addEventListener("touchstart", ()=>{
      bal.classList.add("tap-bump");
      setTimeout(()=> bal.classList.remove("tap-bump"), 300);
    }, {passive:true});
  }

  const io = new IntersectionObserver((ents)=>{
    ents.forEach(ent=>{
      if(ent.isIntersecting){
        ent.target.classList.add("in");
        io.unobserve(ent.target);
      }
    });
  }, {threshold:.08});
  document.querySelectorAll(".card, .kpi .box, #txList li, .box, .chat-box").forEach(el=>{
    el.classList.add("reveal");
    io.observe(el);
  });
}

function setThinking(on){
  const bar = document.getElementById("thinkingBar");
  if(!bar) return;
  const wrap = bar.parentElement;
  wrap.classList.toggle("loading", !!on);
}

// -----------------------------
document.addEventListener("DOMContentLoaded", init);
