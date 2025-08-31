console.log('BankAI app.js v6 (Budget Brain++)');
// BankIA — Demo only, no backend. PWA-ready + Persona IA configurable + Budget Brain++

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => (n<0? "-" : "") + "€" + Math.abs(n).toFixed(2);
const TODAY = new Date();
const MONTH = TODAY.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
const pad = (n)=> String(n).padStart(2,"0");
const mkey = (d)=> `${d.getFullYear()}-${pad(d.getMonth()+1)}`; // ex: 2025-08

// -----------------------------
// STATE
// -----------------------------
const state = {
  user: null,
  tx: [],
  budgets: { "Courses":300, "Sorties":150, "Transport":80, "Loyer":600, "Abonnements":50, "Autres":120 },
  aiMode: "demo",
  apiKey: "",
  // Revenu par mois: { "2025-01": 1700, ... }
  incomeByMonth: {},
  // Persona configurable
  aiPersona: {
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
  }
};

const KEY = "bankia_demo_state_v3";
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
  $("#monthTag") && ($("#monthTag").textContent = MONTH);
  $("#email") && ($("#email").value = state.user?.email || "");
  $("#name") && ($("#name").value = state.user?.name || "");
  $("#aiMode") && ($("#aiMode").value = state.aiMode || "demo");
  $("#apiKey") && ($("#apiKey").style.display = (state.aiMode === "api") ? "block" : "none");
  $("#apiKey") && ($("#apiKey").value = state.apiKey || "");

  $("#loginBtn") && ($("#loginBtn").onclick = login);
  $("#logoutBtn") && ($("#logoutBtn").onclick = logout);
  $("#aiMode") && ($("#aiMode").onchange = (e)=>{
    state.aiMode = e.target.value;
    $("#apiKey").style.display = (state.aiMode === "api") ? "block" : "none";
    save();
  });
  $("#apiKey") && ($("#apiKey").oninput = (e)=>{ state.apiKey = e.target.value; save(); });

  $("#addTx") && ($("#addTx").onclick = addTx);
  $("#resetData") && ($("#resetData").onclick = resetData);
  $("#exportBtn") && ($("#exportBtn").onclick = exportJSON);
  $("#importBtn") && ($("#importBtn").onclick = ()=> $("#importFile").click());
  $("#importFile") && ($("#importFile").onchange = importJSON);

  injectPersonaButtonAndPanel();
  injectIncomePanel(); // 💶

  $("#sendChat") && ($("#sendChat").onclick = sendChat);
  $("#chatInput") && ($("#chatInput").addEventListener("keydown", e=>{ if (e.key === "Enter") sendChat(); }));

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

  // Titre dynamique (remplace "Coach IA" par le prénom)
  updateChatTitle();

  personaHelloAndTOS();
}

// -----------------------------
// LOGIN
// -----------------------------
function login(){
  const email = $("#email")?.value?.trim();
  const name = $("#name")?.value?.trim() || "Utilisateur";
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
  const label = $("#txLabel")?.value?.trim();
  const amount = parseFloat($("#txAmount")?.value);
  const cat = $("#txCat")?.value;
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
  const nowKey = mkey(new Date());
  state.incomeByMonth[nowKey] = 1700;
}

// -----------------------------
// CALC & DATA ACCESS
// -----------------------------
function getMonthRange(d=new Date()){
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth()+1, 1);
  return {start, end};
}
function monthTx(d=new Date()){
  const {start,end}=getMonthRange(d);
  return state.tx.filter(t=> t.ts>=start.getTime() && t.ts<end.getTime());
}
function incomeObservedFor(d=new Date()){
  return monthTx(d).filter(t=> t.amount>0).reduce((a,b)=>a+b.amount,0);
}
function incomePlannedFor(d=new Date()){
  return state.incomeByMonth[mkey(d)] || null;
}
function incomeFinalFor(d=new Date()){
  const planned = incomePlannedFor(d);
  const observed = incomeObservedFor(d);
  if (planned!=null && planned>0) return planned;
  return observed;
}
function spendFor(d=new Date()){
  return Math.abs(monthTx(d).filter(t=> t.amount<0).reduce((a,b)=>a+b.amount,0));
}
function byCategoryFor(d=new Date()){
  const res={};
  for(const t of monthTx(d)){
    if (t.amount<0) res[t.cat]=(res[t.cat]||0)+Math.abs(t.amount);
  }
  return res;
}
function topCategoryFor(d=new Date()){
  const by=byCategoryFor(d); let top="–", val=0;
  for(const [k,v] of Object.entries(by)){ if(v>val){ val=v; top=k; } }
  return {top,val};
}
function balanceAll(){ return state.tx.reduce((a,b)=>a+b.amount,0); }

function subscriptionsHeuristics(){
  const map = new Map();
  for (const t of state.tx){
    if (t.amount>=0) continue;
    const key = t.label.toLowerCase().replace(/\s+/g,' ').trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  const subs=[];
  for (const [label, arr] of map.entries()){
    if (arr.length>=2){
      const avg = Math.abs(arr.reduce((a,b)=>a+b.amount,0))/arr.length;
      const last = arr.sort((a,b)=>b.ts-a.ts)[0];
      subs.push({label, avg: Math.round(avg*100)/100, lastDate:new Date(last.ts)});
    }
  }
  subs.sort((a,b)=> b.avg-a.avg);
  return subs.slice(0,8);
}

function forecastEndOfMonth(){
  const {start}=getMonthRange(new Date());
  const today = new Date();
  const daysPassed = Math.max(1, Math.ceil((today - start)/86400000));
  const spent = spendFor(today);
  const avgDaily = spent / daysPassed;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
  const forecast = Math.round(avgDaily * daysInMonth * 100)/100;
  return {avgDaily, forecast, daysPassed, daysInMonth};
}

function budget50_30_20(d=new Date()){
  const income = incomeFinalFor(d);
  if (!income || income<=0) return null;
  const needs = income * 0.5;
  const wants = income * 0.3;
  const save  = income * 0.2;
  return {
    income: Math.round(income*100)/100,
    needs: Math.round(needs*100)/100,
    wants: Math.round(wants*100)/100,
    save:  Math.round(save*100)/100
  };
}

// -----------------------------
// RENDER
// -----------------------------
function render(){
  const d=new Date();
  const incomeObserved = incomeObservedFor(d);
  const incomePlanned = incomePlannedFor(d);
  const income = incomeFinalFor(d);
  const spend = spendFor(d);
  const {top}=topCategoryFor(d);

  $("#balanceView") && ($("#balanceView").textContent = fmt(balanceAll()));
  $("#spendMonth") && ($("#spendMonth").textContent = fmt(spend));
  $("#incomeMonth") && ($("#incomeMonth").textContent = fmt(income||incomeObserved||0));
  $("#topCat") && ($("#topCat").textContent = top);

  const ul=$("#txList"); if (ul){ ul.innerHTML="";
    for(const t of state.tx){
      const li=document.createElement("li");
      const left=document.createElement("div"); const right=document.createElement("div");
      left.innerHTML=`<div>${t.label} <span class="small">· ${t.cat}</span></div><div class="small">${new Date(t.ts).toLocaleDateString('fr-FR')}</div>`;
      right.innerHTML=`<span class="${t.amount<0?'neg':'pos'}">${fmt(t.amount)}</span>`;
      li.appendChild(left); li.appendChild(right); ul.appendChild(li);
    }
  }

  const wrap=$("#budgets"); if (wrap){ wrap.innerHTML="";
    const byCat = byCategoryFor(d);
    for(const [cat,goal] of Object.entries(state.budgets)){
      const used = byCat[cat]||0; const pct=Math.min(100, Math.round((used/goal)*100));
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
function pushPersona(role, text){
  const box=$("#chatBox"); if(!box) return;
  const wrap=document.createElement("div");
  wrap.className="msg " + (role==="me"?"me":"ai");

  if (role === "ai" && state.aiPersona.enabled){
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

    const hue = Number(state.aiPersona.bubbleHue || 225);
    wrap.style.border = "1px solid hsla(" + hue + ", 50%, 40%, 0.45)";
    wrap.style.background = "linear-gradient(180deg, hsla("+hue+", 38%, 18%, .85), hsla("+hue+", 38%, 12%, .9))";

    wrap.appendChild(head);
  }

  const body=document.createElement("div");
  body.textContent=text;
  wrap.appendChild(body);

  box.appendChild(wrap);
  box.scrollTop=box.scrollHeight;
}

function typeLikeAI(text){
  return new Promise(async (resolve)=>{
    const box=$("#chatBox"); if(!box){ resolve(); return; }
    const wrap=document.createElement("div");
    wrap.className="msg ai";
    const hue = Number(state.aiPersona.bubbleHue || 225);
    wrap.style.border = "1px solid hsla(" + hue + ", 50%, 40%, 0.45)";
    wrap.style.background = "linear-gradient(180deg, hsla("+hue+", 38%, 18%, .85), hsla("+hue+", 38%, 12%, .9))";

    const head=document.createElement("div");
    head.style.display="flex"; head.style.alignItems="center"; head.style.gap="8px"; head.style.marginBottom="6px";
    const avatar=document.createElement("div");
    avatar.style.width="22px"; avatar.style.height="22px"; avatar.style.borderRadius="999px"; avatar.style.flex="0 0 auto";
    avatar.style.border="1px solid rgba(255,255,255,.15)"; avatar.style.background="#0e1423";
    if (state.aiPersona.avatar){
      avatar.style.backgroundImage = `url('${state.aiPersona.avatar}')`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
    } else {
      avatar.style.display="flex"; avatar.style.alignItems="center"; avatar.style.justifyContent="center"; avatar.style.fontSize="12px";
      avatar.textContent=state.aiPersona.emoji || "🤖";
    }
    const name=document.createElement("div"); name.textContent=state.aiPersona.name||"Assistant·e"; name.style.fontSize="12px"; name.style.opacity=".8";
    head.appendChild(avatar); head.appendChild(name); wrap.appendChild(head);

    const body=document.createElement("div"); wrap.appendChild(body);
    box.appendChild(wrap); box.scrollTop=box.scrollHeight;

    const speed=Math.max(5, Number(state.aiPersona.typingSpeedMs||18));
    for(let i=0;i<text.length;i++){ body.textContent+=text[i]; await sleep(speed); box.scrollTop=box.scrollHeight; }
    resolve();
  });
}

async function sendChat(){
  const q=$("#chatInput")?.value?.trim(); if(!q) return;
  $("#chatInput").value=""; pushPersona("me", q);
  $("#thinkingBar") && ($("#thinkingBar").style.width="15%");
  try{
    let ans="";
    if (state.aiMode==="demo"){
      ans = personaWrap(brainAnswer(q));
      await sleep(180+Math.random()*320);
      await typeLikeAI(ans);
    }else{
      if (!state.apiKey){
        await typeLikeAI(personaWrap("Ajoute d'abord ta clé API, sinon reste en Démo."));
      } else {
        const raw = await remoteAI(personaPrompt(q), state.apiKey);
        ans = personaWrap(raw);
        await typeLikeAI(ans);
      }
    }
  }catch(e){ console.error(e); await typeLikeAI(personaWrap("Oups, petite erreur. Reste en mode Démo si besoin.")); }
  finally{ $("#thinkingBar") && ($("#thinkingBar").style.width="0%"); }
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function personaWrap(text){ const p=state.aiPersona; const signature=p.emoji?` ${p.emoji}`:""; return text+signature; }
function personaPrompt(userMsg){
  const d=new Date(); const by=byCategoryFor(d); const inc=incomeFinalFor(d)||0; const spent=spendFor(d);
  const ctx = `Contexte: mois=${mkey(d)} revenu=${inc} dépenses=${spent} catégories=${JSON.stringify(by)}`;
  const p = state.aiPersona;
  const personaSystem = `Tu es ${p.name}, ${p.role}. Genre: ${p.gender}. Ton: ${p.tone}. Réponds concis, chiffré, actionnable.`;
  return `${personaSystem}\n${ctx}\nQuestion: ${userMsg}`;
}
function personaHelloAndTOS(force=false){
  if (!state.aiPersona.enabled) return;
  const p = state.aiPersona;
  if (force || $("#chatBox")?.childElementCount === 0){
    const greet = (p.greeting || "").replace("{{name}}", p.name).replace("{{role}}", p.role);
    pushPersona("ai", greet || `Bonjour ! Je suis ${p.name}.`);
  }
  if (p.showTOS && (!p.showTOSOncePerSession || !p._tosShownThisSession)){
    pushPersona("ai", p.tosText || "Conditions d'utilisation : démo non contractuelle.");
    p._tosShownThisSession = true; save();
  }
}

// -----------------------------
// BUDGET BRAIN — intents & réponses
// -----------------------------
function parseAmountEUR(q){
  // attrape "1000", "1 000", "1.000", "1000€", etc.
  const m = q.replace(',', '.').match(/(\d[\d\s.,]*)\s*€?/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/\s|\./g,''));
  return isNaN(num) ? null : num;
}
function parseTopN(q){
  const m = q.match(/\btop\s*(\d+)/i);
  if (!m) return 5;
  const n=parseInt(m[1],10);
  return Math.max(1, Math.min(20, n));
}
function detectPeriod(q){
  const low=q.toLowerCase();
  if (/(mois prochain|prochain mois)/.test(low)){
    const d=new Date(); d.setMonth(d.getMonth()+1); return d;
  }
  if (/(mois dernier|dernier mois|le mois pass[ée])/.test(low)){
    const d=new Date(); d.setMonth(d.getMonth()-1); return d;
  }
  return new Date(); // ce mois
}

function brainAnswer(q){
  const d = detectPeriod(q);
  const lower=q.toLowerCase();

  // Numéros de base
  const income = incomeFinalFor(d) || 0;
  const incomeObs = incomeObservedFor(d) || 0;
  const spent = spendFor(d) || 0;
  const by = byCategoryFor(d);
  const {top} = topCategoryFor(d);
  const {avgDaily, forecast, daysPassed, daysInMonth} = forecastEndOfMonth();
  const budget = budget50_30_20(d);

  // 1) Intent: set income (guidance)
  if (/(revenu|salaire|pay[eé]|gains).*(saisi|déclar|entr|mettre|modifier)/.test(lower) || /changer.*revenu/.test(lower)){
    return "Clique sur **💶 Revenu** pour saisir/mettre à jour le revenu de chaque mois. C’est cette valeur qui pilote mes calculs.";
  }

  // 2) Intent: how to save X euros
  if (/(économis|épargn|mettre de c[oô]t[ée]).*\d/.test(lower)){
    const target = parseAmountEUR(q) || 0;
    const inc = income || incomeObs;
    if (!inc) return "Indique d’abord ton revenu (💶 Revenu) pour que je te calcule un plan d’épargne précis.";
    // exclusions "fixes"
    const fixedCats = new Set(["Loyer","Abonnements"]);
    const variableCats = Object.entries(by).filter(([k])=>!fixedCats.has(k));
    variableCats.sort((a,b)=> b[1]-a[1]); // plus grosses d'abord
    let remaining = target;
    const cuts=[];
    for (const [cat,val] of variableCats){
      if (remaining<=0) break;
      const cut = Math.min(remaining, Math.round(val*0.25)); // coupe max 25% par cat
      if (cut>0){ cuts.push([cat,cut]); remaining-=cut; }
    }
    if (remaining>0){
      // proposer un mix hebdo/journalier
      const perDay = Math.ceil((remaining)/Math.max(1, daysInMonth-daysPassed));
      cuts.push(["Divers/achats plaisir", perDay*3]); // idée indicative
      remaining -= perDay*3;
    }
    const lines = cuts.map(([c,v])=>`• ${c}: −${fmt(v)}`).join("\n");
    const plan = `Objectif **${fmt(target)}** ce mois-ci. Plan de coupes proposé :\n${lines}\n` +
                 `Astuce: retire **${fmt(Math.max(5, Math.ceil(target/30)))} / jour** en espèces pour te limiter.`;
    return plan;
  }

  // 3) Intent: budget / plafond / enveloppe
  if (/(budget|plafond|enveloppe)/.test(lower)){
    if (!budget) return "Dis-moi ton revenu via 💶 Revenu pour générer un budget précis (règle 50/30/20 adaptée).";
    const loyer = by["Loyer"]||0, subs = by["Abonnements"]||0;
    const needsAdj = Math.max(budget.needs, loyer + (by["Courses"]||0) + subs*0.5);
    const wantsAdj = Math.max(budget.wants, (by["Sorties"]||0));
    const saveAdj  = Math.max(budget.save, Math.max(0, (income||incomeObs) - spent) * 0.4);
    return `Budget **${mkey(d)}** (50/30/20 adapté, revenu ${fmt(budget.income)}) :
- Besoins ≈ **${fmt(needsAdj)}** (loyer, factures, courses)
- Plaisir ≈ **${fmt(wantsAdj)}**
- Épargne/objectif ≈ **${fmt(Math.round(saveAdj))}**`;
  }

  // 4) Intent: reste à dépenser (safe to spend)
  if (/(reste|safe).*(vivre|dépenser)|safe[- ]to[- ]spend/.test(lower)){
    const inc = income || incomeObs;
    if (!inc) return "J’ai besoin de ton revenu (💶) pour calculer un reste à dépenser fiable.";
    const fixed = (by["Loyer"]||0) + (by["Abonnements"]||0);
    const left = Math.max(0, inc - fixed - spent);
    const perDay = left / Math.max(1, (daysInMonth - daysPassed));
    return `Reste à dépenser ≈ **${fmt(left)}** (≈ **${fmt(Math.max(0, Math.round(perDay)))} / jour**). Verrouille tes achats plaisir à ~${fmt(Math.max(5, perDay*0.6))}/jour.`;
  }

  // 5) Intent: projection fin de mois
  if (/(prévision|projection|fin de mois)/.test(lower)){
    return `Prévision fin de mois : dépenses ≈ **${fmt(forecast)}** (moyenne **${fmt(avgDaily)}/jour**, ${daysPassed}/${daysInMonth} jours). `+
           `Pour finir positif, vise ≤ **${fmt(Math.max(0, (income||incomeObs) - forecast))}** de marge.`;
  }

  // 6) Intent: abonnements
  if (/abonnement|récurrent|spotify|netflix|prime|icloud|canal|deezer|youtube/.test(lower)){
    const subs = subscriptionsHeuristics();
    if (!subs.length) return "Je ne vois pas d’abonnements évidents. Ajoute des labels clairs (ex: “Abonnement X”) pour les détecter.";
    const lines = subs.slice(0,6).map(s=>`• ${s.label} ~ ${fmt(s.avg)}/mois (dernier: ${s.lastDate.toLocaleDateString('fr-FR')})`).join("\n");
    return `Abonnements repérés :\n${lines}\nAstuce: regroupe sur une seule carte, mets des rappels 48h avant renouvellement.`;
  }

  // 7) Intent: anomalies / dépenses inhabituelles
  if (/(anomal|inhabituel|fraud|bizarre)/.test(lower)){
    const tx = monthTx(d);
    const byCat=byCategoryFor(d);
    const avgByCat={};
    for (const [k,v] of Object.entries(byCat)){
      const count = tx.filter(t=>t.amount<0 && t.cat===k).length;
      avgByCat[k]= v/Math.max(1,count);
    }
    const anomalies = tx
      .filter(t=> t.amount<0 && Math.abs(t.amount) > (avgByCat[t.cat]||0)*2)
      .sort((a,b)=> Math.abs(b.amount)-Math.abs(a.amount))
      .slice(0,5);
    if (!anomalies.length) return "Rien d’inhabituel détecté ce mois-ci.";
    const lines = anomalies.map(t=>`• ${t.label} (${t.cat}) ${fmt(t.amount)} le ${new Date(t.ts).toLocaleDateString('fr-FR')}`).join("\n");
    return `Alertes potentielles (≥2× la moyenne de leur catégorie) :\n${lines}\nVérifie et conteste si non autorisé.`;
  }

  // 8) Intent: dettes / crédits
  if (/(dette|crédit|rembourser|intér[êe]ts|loan)/.test(lower)){
    const room = Math.max(0, (income||incomeObs) - spent);
    const monthly = Math.max(20, Math.round(room*0.6));
    return `Stratégie dettes : consacre **${fmt(monthly)}/mois** au remboursement. Méthode **avalanche** (taux le plus élevé d’abord) → économise des intérêts et libère du cashflow.`;
  }

  // 9) Intent: dépense par catégorie
  if (/(d[ée]pens[ée]s?).*(courses|sorties|transport|loyer|abonnements|autres)/.test(lower)){
    const cat = ["Courses","Sorties","Transport","Loyer","Abonnements","Autres"].find(c=> lower.includes(c.toLowerCase()));
    const val = by[cat]||0;
    return `Dépenses **${cat}** sur ${mkey(d)} : **${fmt(val)}**.`;
  }

  // 10) Intent: plus grosses dépenses
  if (/(plus grandes|grosses|top).*(d[ée]pens[ée]s?)/.test(lower)){
    const n = parseTopN(q);
    const big = monthTx(d).filter(t=>t.amount<0).sort((a,b)=> Math.abs(b.amount)-Math.abs(a.amount)).slice(0,n);
    if (!big.length) return "Aucune dépense ce mois-ci.";
    const lines = big.map(t=>`• ${t.label} (${t.cat}) ${fmt(t.amount)} — ${new Date(t.ts).toLocaleDateString('fr-FR')}`).join("\n");
    return `Top ${big.length} dépenses ${mkey(d)} :\n${lines}`;
  }

  // 11) Intent: revenu pris en compte
  if (/(revenu|salaire|pay[eé]|gains).*(combien|pris|consid[ée]r|pris en compte)/.test(lower)){
    const planned = incomePlannedFor(d);
    return planned!=null
      ? `Pour **${mkey(d)}** j’utilise ton **revenu saisi** : **${fmt(planned)}**. Ajustable via 💶 Revenu.`
      : `Pas de revenu saisi pour **${mkey(d)}**. J’estime **${fmt(incomeObs)}** à partir des entrées. Tu peux fixer une valeur via 💶 Revenu.`;
  }

  // 12) Fallback — résumé exécutif
  const baseInc = income || incomeObs;
  const spendPct = baseInc>0 ? Math.round((spent/baseInc)*100) : 0;
  const budgetLine = budget
    ? `Repère budget (50/30/20) : besoins ${fmt(budget.needs)}, plaisir ${fmt(budget.wants)}, épargne ${fmt(budget.save)}.`
    : `Ajoute ton revenu via 💶 pour une reco 50/30/20.`;
  return `Résumé ${mkey(d)} — Revenus: **${fmt(baseInc)}**, Dépenses: **${fmt(spent)}** (${spendPct}% des revenus). `+
         `Catégorie la plus gourmande : **${top}**. ${budgetLine}`;
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
function updateChatTitle(){
  const newTitle = state.aiPersona?.name || "Coach";
  // 1) si on a des ids/class connus
  const direct = $("#chatTitle") || document.querySelector('[data-chat-title]') || document.querySelector('.chat-title');
  if (direct){ direct.textContent = newTitle; return; }
  // 2) fallback: remplace tout nœud qui contient exactement "Coach IA" (ou commence par)
  const nodes = document.querySelectorAll("h1,h2,h3,h4,div,span");
  for (const n of nodes){
    const txt = (n.textContent||"").trim();
    if (txt === "Coach IA" || txt.startsWith("Coach IA")){
      n.textContent = txt.replace("Coach IA", newTitle);
      break;
    }
  }
}

function injectPersonaButtonAndPanel(){
  const chatFoot = $(".foot"); if (!chatFoot) return;

  // ⚙️ Persona
  const gear = document.createElement("button");
  gear.className = "btn"; gear.style.marginLeft = "4px"; gear.title = "Réglages Persona IA"; gear.textContent = "⚙️ Persona";
  gear.onclick = openPersonaPanel; chatFoot.appendChild(gear);

  // (Retiré) — pas de badge revenu ici (inutile visuellement)

  // Modal Persona
  const modal = document.createElement("div");
  modal.id = "personaModal";
  Object.assign(modal.style,{position:"fixed",inset:"0",background:"rgba(0,0,0,.55)",backdropFilter:"blur(4px)",display:"none",zIndex:"9999"});
  const card = document.createElement("div");
  Object.assign(card.style,{maxWidth:"560px",margin:"8vh auto",background:"rgba(15,19,32,.95)",border:"1px solid #1d2334",borderRadius:"16px",padding:"16px",boxShadow:"0 10px 40px rgba(0,0,0,.5)"});
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:700">Persona IA — Réglages</div>
      <button id="personaClose" class="btn">Fermer</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label>Nom<br><input id="p_name" /></label>
      <label>Rôle<br><input id="p_role" /></label>
      <label>Genre<br>
        <select id="p_gender"><option value="femme">Femme</option><option value="homme">Homme</option><option value="neutre">Neutre</option></select>
      </label>
      <label>Émoji<br><input id="p_emoji" placeholder="💙" /></label>
      <label>Avatar (URL)<br><input id="p_avatar" placeholder="https://.../avatar.png" /></label>
      <label>Teinte bulle (0–360)<br><input id="p_hue" type="number" min="0" max="360" /></label>
      <label style="grid-column:1/3">Ton<br><input id="p_tone" /></label>
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
    </div>`;
  modal.appendChild(card); document.body.appendChild(modal);

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
    updateChatTitle();                 // <— met à jour "Coach IA" → prénom
    pushPersona("ai","Paramètres persona enregistrés ✅");
  };
  $("#personaReset").onclick = ()=>{
    state.aiPersona = {
      enabled: true, name: "Camille", role: "Assistante financière", gender: "femme",
      tone: "chaleureuse, claire et proactive", emoji: "💙", avatar: "", bubbleHue: 225,
      greeting: "Bonjour ! Je suis {{name}}, {{role}}. Pose-moi ta première question et je te réponds avec des conseils concrets 😉",
      showTOS: true, tosText: "Je suis une IA en démo. Mes réponses sont indicatives: vérifie avant décision. En poursuivant, tu acceptes ces conditions.",
      showTOSOncePerSession: true, _tosShownThisSession: false, typingSpeedMs: 18
    };
    save(); modal.style.display="none"; updateChatTitle(); pushPersona("ai","Persona réinitialisée.");
  };

  function openPersonaPanel(){
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
// INCOME PANEL (injecté) — 💶 Revenu par mois
// -----------------------------
function injectIncomePanel(){
  const chatFoot = $(".foot"); if (!chatFoot) return;

  const btn = document.createElement("button");
  btn.className="btn"; btn.style.marginLeft="4px"; btn.title="Définir le revenu de ce mois";
  btn.textContent="💶 Revenu"; btn.onclick=openIncomePanel; chatFoot.appendChild(btn);

  const modal = document.createElement("div");
  modal.id="incomeModal";
  Object.assign(modal.style,{position:"fixed",inset:"0",background:"rgba(0,0,0,.55)",backdropFilter:"blur(4px)",display:"none",zIndex:"9999"});
  const card=document.createElement("div");
  Object.assign(card.style,{maxWidth:"520px",margin:"10vh auto",background:"rgba(15,19,32,.95)",border:"1px solid #1d2334",borderRadius:"16px",padding:"16px"});
  const now = new Date();
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:700">Revenu du mois</div>
      <button id="incomeClose" class="btn">Fermer</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label>Mois<br>
        <input id="inc_month" type="month" value="${now.getFullYear()}-${pad(now.getMonth()+1)}">
      </label>
      <label>Montant (€)<br>
        <input id="inc_value" type="number" step="0.01" placeholder="1700">
      </label>
    </div>
    <div class="small" style="opacity:.8;margin-top:6px">
      Astuce : je priorise le revenu saisi ici par rapport aux entrées détectées dans les transactions.
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button id="incomeDelete" class="btn">Supprimer mois</button>
      <button id="incomeSave" class="btn primary">Enregistrer</button>
    </div>
    <div id="incomeList" style="margin-top:12px"></div>
  `;
  modal.appendChild(card); document.body.appendChild(modal);

  $("#incomeClose").onclick = ()=> modal.style.display="none";
  $("#incomeSave").onclick = ()=>{
    const month = $("#inc_month").value; const val=parseFloat($("#inc_value").value);
    if (!month || isNaN(val)){ alert("Mois et montant requis."); return; }
    state.incomeByMonth[month]=val; save(); render(); fillIncomeList(); pushPersona("ai",`Revenu défini pour ${month}: ${fmt(val)} ✅`); modal.style.display="none";
  };
  $("#incomeDelete").onclick = ()=>{
    const month = $("#inc_month").value; if(!month) return;
    delete state.incomeByMonth[month]; save(); render(); fillIncomeList(); pushPersona("ai",`Revenu supprimé pour ${month}.`); modal.style.display="none";
  };

  function fillIncomeList(){
    const wrap=$("#incomeList"); const keys=Object.keys(state.incomeByMonth).sort();
    if (!keys.length){ wrap.innerHTML=""; return; }
    const rows = keys.map(k=>`<div class="small" style="display:flex;justify-content:space-between;border-bottom:1px dashed #253; padding:4px 0">
      <span>${k}</span><b>${fmt(state.incomeByMonth[k])}</b></div>`).join("");
    wrap.innerHTML = `<div class="small" style="margin-top:6px;opacity:.8">Revenus saisis :</div>${rows}`;
  }

  function openIncomePanel(){
    $("#inc_value").value = "";
    fillIncomeList();
    modal.style.display="block";
  }
}

// -----------------------------
document.addEventListener("DOMContentLoaded", init);
