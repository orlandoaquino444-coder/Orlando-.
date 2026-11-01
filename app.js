import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged,
  sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
let user = null, currentSchool = null, schools = [], authMode = "login", recordsCache = [], chatHistory = [];
const userRoot = () => `users/${user.uid}`;
const schoolRef = id => doc(db, userRoot(), "schools", id);
const recordsRef = id => collection(db, userRoot(), "schools", id, "records");
const messagesRef = id => collection(db, userRoot(), "schools", id, "messages");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2800)}
function showAuthError(msg){$("authError").textContent=msg}
function dateNow(){return new Date().toISOString().slice(0,10)}
function showPanel(name){
  document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden"));
  $(name+"Panel").classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.panel===name));
  if(name==="records") renderRecords();
}
function showHome(){
  currentSchool=null;$("schoolView").classList.add("hidden");$("homeView").classList.remove("hidden");
  loadSchools();
}
async function loadSchools(){
  const snap=await getDocs(query(collection(db,userRoot(),"schools"),orderBy("createdAt","desc")));
  schools=snap.docs.map(d=>({id:d.id,...d.data()}));
  $("schoolGrid").innerHTML=schools.map(s=>`<button class="school-card" data-school="${esc(s.id)}"><span class="school-icon">⌂</span><strong>${esc(s.name)}</strong><small>Abrir espacio académico →</small></button>`).join("");
  $("emptySchools").classList.toggle("hidden",schools.length>0);
  document.querySelectorAll("[data-school]").forEach(b=>b.addEventListener("click",()=>openSchool(b.dataset.school)));
}
async function openSchool(id){
  const found=schools.find(s=>s.id===id);if(!found)return;
  currentSchool=found;
  $("homeView").classList.add("hidden");$("schoolView").classList.remove("hidden");
  $("currentSchoolName").textContent=found.name;
  $("schoolNameEdit").value=found.name;$("gradingScale").value=String(found.gradingScale||10);
  $("chatMessages").innerHTML="";
  chatHistory=[];
  await loadSchoolData();
  showPanel("chat");
  addMessage("assistant",`¡Hola! Soy Orlando, tu asistente de ${found.name}. Puedes contarme lo que sucede en el aula o preguntarme por los registros de tus estudiantes.`);
}
async function loadSchoolData(){
  const [r,m]=await Promise.all([
    getDocs(query(recordsRef(currentSchool.id),orderBy("createdAt","desc"),limit(250))),
    getDocs(query(messagesRef(currentSchool.id),orderBy("createdAt","desc"),limit(12)))
  ]);
  recordsCache=r.docs.map(d=>({id:d.id,...d.data()}));
  chatHistory=m.docs.reverse().map(d=>d.data()).filter(x=>x.role&&x.text).map(x=>({role:x.role,text:x.text}));
}
function addMessage(role,text){
  const div=document.createElement("div");div.className=role==="user"?"user-message":"assistant-message";
  div.textContent=text;$("chatMessages").appendChild(div);$("chatMessages").scrollTop=$("chatMessages").scrollHeight;
}
async function saveMessage(role,text){
  await addDoc(messagesRef(currentSchool.id),{role,text,createdAt:serverTimestamp(),createdAtISO:new Date().toISOString()});
}
async function sendChat(){
  const message=$("chatInput").value.trim();if(!message||!currentSchool)return;
  $("chatInput").value="";addMessage("user",message);$("sendBtn").disabled=true;$("sendBtn").textContent="...";
  try{
    await saveMessage("user",message);
    const token=await user.getIdToken();
    const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify({schoolName:currentSchool.name,message,history:chatHistory.slice(-10),records:recordsCache.slice(0,200),gradingScale:currentSchool.gradingScale||10})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"No se pudo contactar con Orlando.");
    for(const record of (data.records||[])){
      await addDoc(recordsRef(currentSchool.id),{...record,createdAt:serverTimestamp(),createdAtISO:new Date().toISOString()});
    }
    recordsCache=(data.records||[]).map((r,i)=>({id:"new"+i,...r})).concat(recordsCache).slice(0,250);
    const reply=data.reply||"No tengo una respuesta en este momento.";
    addMessage("assistant",reply);await saveMessage("assistant",reply);
    chatHistory.push({role:"user",text:message},{role:"assistant",text:reply});chatHistory=chatHistory.slice(-12);
    if(data.records?.length)toast(`Orlando guardó ${data.records.length} registro(s). Revisa la memoria escolar.`);
  }catch(e){addMessage("assistant","No pude completar la solicitud: "+e.message)}
  finally{$("sendBtn").disabled=false;$("sendBtn").textContent="Enviar ↑"}
}
function renderRecords(){
  const q=$("recordSearch").value.toLowerCase(),type=$("recordFilter").value;
  const items=recordsCache.filter(r=>(!type||r.type===type)&&JSON.stringify(r).toLowerCase().includes(q));
  $("recordsList").innerHTML=items.map(r=>`<article class="record-card"><strong>${esc(r.student)} · ${esc(labelType(r.type))}</strong><p>${esc(r.description||"")}</p><div class="record-meta">${esc(r.date||"Fecha no indicada")} · ${esc(r.subject||"Sin materia")}${r.status?" · "+esc(r.status):""}${r.points!=null?" · "+esc(r.points)+" puntos":""}${r.maxPoints!=null?" / "+esc(r.maxPoints):""}</div></article>`).join("")||'<p class="muted">No hay registros que coincidan.</p>';
}
function labelType(t){return ({attendance:"Asistencia",task:"Tarea",grade:"Calificación",conduct:"Conducta",note:"Observación"})[t]||t}
async function refreshRecords(){await loadSchoolData();renderRecords();toast("Memoria actualizada.")}
async function makeReport(){
  const name=$("reportStudent").value.trim().toLowerCase();if(!name)return toast("Escribe el nombre del estudiante.");
  const rows=recordsCache.filter(r=>(r.student||"").toLowerCase().includes(name));
  if(!rows.length){$("reportResult").textContent="No hay registros de ese estudiante en este colegio.";return}
  const tasks=rows.filter(r=>r.type==="task"),grades=rows.filter(r=>r.type==="grade"),attendance=rows.filter(r=>r.type==="attendance"),conduct=rows.filter(r=>r.type==="conduct");
  const submitted=tasks.filter(r=>r.status==="submitted"),missing=tasks.filter(r=>r.status==="missing");
  const nums=grades.filter(r=>Number.isFinite(r.score));
  let average="No calculado: faltan calificaciones numéricas o criterios.";
  if(nums.length){const avg=nums.reduce((a,r)=>a+(r.score/r.scale*(currentSchool.gradingScale||10)),0)/nums.length;average=`Promedio simple orientativo: ${avg.toFixed(2)} / ${currentSchool.gradingScale||10} (${nums.length} calificaciones). No incluye ponderaciones no registradas.`}
  const lines=[`ESTUDIANTE: ${rows[0].student}`,`Registros encontrados: ${rows.length}`,`Tareas entregadas: ${submitted.length}`,`Tareas no entregadas: ${missing.length}`,`Asistencias: ${attendance.filter(r=>r.status==="present").length}`,`Ausencias: ${attendance.filter(r=>r.status==="absent").length}`,average,"","DETALLES:",...rows.slice(0,80).map(r=>`• ${r.date||"Sin fecha"} | ${labelType(r.type)} | ${r.subject||""} | ${r.description||""} ${r.points!=null?`(${r.points} puntos)`:""}`)];
  $("reportResult").textContent=lines.join("\n");
}
async function generateDocument(){
  const subject=$("docSubject").value.trim(),grade=$("docGrade").value.trim(),topic=$("docTopic").value.trim(),type=$("docType").value,count=Math.max(1,Math.min(30,Number($("docCount").value)||10)),instructions=$("docInstructions").value.trim();
  if(!subject||!topic)return toast("Completa la materia y el tema.");
  $("generateDocBtn").disabled=true;$("generateDocBtn").textContent="Generando...";
  try{
    const token=await user.getIdToken();
    const prompt=`Crea una actividad escolar lista para imprimir. Colegio: ${currentSchool.name}. Materia: ${subject}. Curso: ${grade}. Tema: ${topic}. Tipo: ${type}. Cantidad: ${count}. Indicaciones: ${instructions}. Escribe instrucciones claras, numeración, espacio para responder y puntaje sugerido. Si solicitan respuestas, sepáralas al final en una sección DOCENTE. No inventes currículo local. Devuelve texto plano bien organizado.`;
    const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({schoolName:currentSchool.name,message:prompt,history:[],records:[],gradingScale:currentSchool.gradingScale||10})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"Error generando actividad.");
    $("documentText").value=data.reply;$("generatedDocument").classList.remove("hidden");toast("Actividad generada.");
  }catch(e){toast(e.message)}
  finally{$("generateDocBtn").disabled=false;$("generateDocBtn").textContent="Crear actividad con Orlando"}
}
function downloadWord(){
  const {Document,Packer,Paragraph,TextRun,HeadingLevel}=window.docx||{};
  if(!Document)return toast("No se cargó el generador Word. Comprueba tu conexión.");
  const content=$("documentText").value.split("\n");
  const paragraphs=content.map((line,i)=>new Paragraph({children:[new TextRun({text:line,breakLine:false})],spacing:{after:100}}));
  const docx=new Document({sections:[{children:[new Paragraph({text:currentSchool.name,heading:HeadingLevel.HEADING_1}),...paragraphs]}]});
  Packer.toBlob(docx).then(blob=>saveBlob(blob,"actividad-orlando.docx"));
}
function downloadPdf(){
  const {jsPDF}=window.jspdf||{};if(!jsPDF)return toast("No se cargó el generador PDF.");
  const pdf=new jsPDF({unit:"mm",format:"a4"});const lines=pdf.splitTextToSize($("documentText").value,180);let y=18;
  pdf.setFont("helvetica","bold");pdf.text(currentSchool.name,15,y);y+=10;pdf.setFont("helvetica","normal");
  for(const line of lines){if(y>280){pdf.addPage();y=18}pdf.text(line,15,y);y+=6}
  pdf.save("actividad-orlando.pdf");
}
function saveBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}
async function deleteSchool(){
  if(!confirm(`¿Eliminar "${currentSchool.name}" y todos sus registros y conversaciones? Esta acción no se puede deshacer.`))return;
  const batch=writeBatch(db);
  for(const colName of ["records","messages"]){const snap=await getDocs(collection(db,userRoot(),"schools",currentSchool.id,colName));snap.docs.forEach(d=>batch.delete(d.ref))}
  batch.delete(schoolRef(currentSchool.id));await batch.commit();toast("Colegio eliminado.");showHome();
}
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();showAuthError("");
  try{if(authMode==="register")await createUserWithEmailAndPassword(auth,$("email").value,$("password").value);else await signInWithEmailAndPassword(auth,$("email").value,$("password").value)}
  catch(err){showAuthError(err.message)}
});
$("loginTab").onclick=()=>setAuthMode("login");$("registerTab").onclick=()=>setAuthMode("register");
function setAuthMode(mode){authMode=mode;$("loginTab").classList.toggle("active",mode==="login");$("registerTab").classList.toggle("active",mode==="register");$("authSubmit").textContent=mode==="login"?"Entrar":"Crear cuenta";$("password").autocomplete=mode==="login"?"current-password":"new-password";showAuthError("")}
$("forgotBtn").onclick=async()=>{if(!$("email").value)return showAuthError("Escribe tu correo para enviarte el enlace.");try{await sendPasswordResetEmail(auth,$("email").value);toast("Revisa tu correo para restablecer la contraseña.")}catch(e){showAuthError(e.message)}};
$("logoutBtn").onclick=()=>signOut(auth);$("homeBtn").onclick=showHome;$("backBtn").onclick=showHome;
$("addSchoolBtn").onclick=()=>{$("newSchoolName").value="";$("schoolDialog").showModal();$("newSchoolName").focus()};
$("schoolForm").addEventListener("submit",async e=>{
  if(e.submitter?.value==="cancel")return;
  e.preventDefault();const name=$("newSchoolName").value.trim();if(!name)return;
  try{const ref=await addDoc(collection(db,userRoot(),"schools"),{name,gradingScale:10,createdAt:serverTimestamp(),createdAtISO:new Date().toISOString()});$("schoolDialog").close();await loadSchools();toast("Colegio agregado.");}
  catch(err){toast("No se pudo guardar: "+err.message)}
});
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));
$("sendBtn").onclick=sendChat;$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat()}});
$("refreshRecords").onclick=refreshRecords;$("recordSearch").oninput=renderRecords;$("recordFilter").onchange=renderRecords;$("makeReportBtn").onclick=makeReport;
$("generateDocBtn").onclick=generateDocument;$("downloadWord").onclick=downloadWord;$("downloadPdf").onclick=downloadPdf;
$("saveSettings").onclick=async()=>{const name=$("schoolNameEdit").value.trim(),scale=Number($("gradingScale").value);if(!name)return toast("El nombre no puede estar vacío.");await updateDoc(schoolRef(currentSchool.id),{name,gradingScale:scale});currentSchool.name=name;currentSchool.gradingScale=scale;$("currentSchoolName").textContent=name;toast("Configuración guardada.")};
$("deleteSchoolBtn").onclick=deleteSchool;
onAuthStateChanged(auth,async u=>{
  user=u;
  if(u){$("authView").classList.add("hidden");$("appView").classList.remove("hidden");$("userEmail").textContent=u.email||"";try{await loadSchools()}catch(e){toast("Error cargando colegios: "+e.message)}}
  else{$("appView").classList.add("hidden");$("authView").classList.remove("hidden")}
});
