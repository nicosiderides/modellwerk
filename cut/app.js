import {groupBarPatterns,groupPlatePatterns,patternProgress,barNumbers,plateNumbers} from './bar-patterns.js';
import {demoProject,validateProject,optimize,metrics,cutReport,signature,PALETTE,MAX_PIECES,MAX_PIECE_QTY} from './engine.js';

const icons={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',cut:'M4 4l16 16 M14 4l-4 4 M4 14l4-4 M3 3h5v5H3z M3 16h5v5H3z',box:'M12 3l9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9 M7 5l9 5',layers:'M12 3l10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',file:'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h6',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',plus:'M12 5v14 M5 12h14',arrow:'M5 12h14 M14 7l5 5-5 5',chevron:'M9 5l7 7-7 7',down:'M6 9l6 6 6-6',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',upload:'M12 16V3 M7 8l5-5 5 5 M4 16v5h16v-5',check:'M5 12l4 4L19 6',close:'M6 6l12 12 M6 18L18 6',edit:'M15 4l5 5 M4 15L16 3l5 5L9 20l-6 1z',trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',refresh:'M20 7V3l-3 3 M4 17v4l3-3 M20 7a8 8 0 00-14-2 M4 17a8 8 0 0014 2',help:'M9 8a3 3 0 116 0c0 2-3 2-3 5 M12 17h.01 M22 12a10 10 0 11-20 0 10 10 0 0120 0',bar:'M3 7h18v10H3z M6 7v10 M18 7v10',percent:'M5 19L19 5 M8 6a2 2 0 11-4 0 2 2 0 014 0 M20 18a2 2 0 11-4 0 2 2 0 014 0',leaf:'M19 3c-10-1-17 7-12 13 6 5 14-2 12-13z M5 21L15 9',menu:'M3 6h18 M3 12h18 M3 18h18',clock:'M12 7v5l3 2 M22 12a10 10 0 11-20 0 10 10 0 0120 0',alert:'M12 3L2 21h20z M12 9v5 M12 17h.01',print:'M6 9V3h12v6 M6 18H3V9h18v9h-3 M6 14h12v8H6z M17 12h.01',folder:'M3 5h7l2 3h9v13H3z',save:'M4 3h14l3 3v15H3V3z M7 3v6h10V3 M7 21v-8h10v8',cube:'M12 3l9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 11-6 0 3 3 0 016 0'};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]||icons.box}"/></svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=0)=>Number(v).toLocaleString('es-AR',{maximumFractionDigits:d});
const btn=(label,action,style='',ico='',attrs='')=>`<button type="button" class="btn ${style}" data-action="${action}" ${attrs}>${ico?icon(ico):''}${label}</button>`;
const nav=[['order','Orden de corte','grid'],['plans','Planos de corte','cut'],['materials','Materiales y acopio','layers'],['documents','Documentación','file']];
const STORAGE='modellwerk-cut-v1'+(new URLSearchParams(location.search).get('test')==='isolated'?'-test':'');
const PLAN_PAGE_SIZE=40,BAR_DETAIL_LIMIT=200,REMNANT_RENDER_LIMIT=500;
let project=demoProject(),storageWarning='',restoreFailed=false,ui={page:'order',material:'m1',filter:'all',menu:false,planPage:0},toastTimer;
function hydrate(input){
 const source=structuredClone(input);source.pieces=(source.pieces||[]).map(({kit,...piece})=>piece);
 const next=validateProject(source),oldSignature=next.plan?.signature,completed=Array.isArray(next.completed)?next.completed:[];
 next.plan=next.plan?optimize(next):null;
 const valid=new Set(next.plan?.groups.flatMap(g=>g.bins.map(b=>b.id))||[]);
 next.completed=oldSignature===next.plan?.signature?[...new Set(completed)].filter(id=>valid.has(id)):[];
 next.demo=next.demo===true;return next;
}
try{const saved=localStorage.getItem(STORAGE);if(saved)project=hydrate(JSON.parse(saved));}catch{restoreFailed=true;project=demoProject();storageWarning='No se pudo recuperar la orden guardada. Se muestra un ejemplo; importá tu respaldo si lo tenés. El guardado anterior se conserva hasta que realices cambios.';}
if(project.demo&&!project.plan)project.plan=optimize(project);
function compactProject(value=project){return {...value,plan:value.plan?{signature:value.plan.signature}:null};}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(compactProject()));storageWarning='';}catch{storageWarning='No se pudo guardar en este dispositivo. Descargá un respaldo desde Documentación.';}}
function toast(msg){const el=document.querySelector('#toast');el.textContent=msg;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4200);}
function touch(){project.demo=false;project.plan=null;project.completed=[];save();render();}
function currentMaterial(){return project.materials.find(m=>m.id===ui.material)||project.materials[0];}
function groupFor(m){return project.plan?.groups.find(g=>g.material===m.id);}
function allBins(){return project.plan?.groups.flatMap(g=>g.bins)||[];}
const pieceColor=id=>PALETTE[Math.max(0,project.pieces.findIndex(p=>p.id===id))%PALETTE.length];

function barDiagram(b,m,large=false){return `<div class="bar-row"><span class="bar-id">B${String(b.index).padStart(2,'0')}</span><div class="bar" style="${large?'height:43px':''}" aria-label="Barra ${b.index}, ${b.parts.length} piezas, ${fmt(b.remaining,1)} mm de remanente"><span style="width:${100*project.settings.trim/m.length}%"></span>${b.parts.map(p=>`<span class="bar-part" title="${esc(p.id+' · '+p.name+' · '+p.length+' mm')}" style="width:${100*(p.length+p.cut)/m.length}%;background:${p.color}"><span>${fmt(p.length)}</span></span>`).join('')}<span class="bar-rest" title="Remanente: ${fmt(b.remaining,1)} mm">${b.remaining>450?fmt(b.remaining):''}</span></div></div>`;}
function plateDiagram(b,m){return `<svg class="plate-svg" viewBox="-100 -90 ${m.length+200} ${m.width+180}" role="img" aria-label="Distribución de ${b.parts.length} piezas en placa ${m.length} por ${m.width} milímetros"><defs><pattern id="waste-${esc(b.id)}" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="24" height="24" fill="#f0f2e9"/><path d="M0 0v24" stroke="#dae2d1" stroke-width="8"/></pattern></defs><rect width="${m.length}" height="${m.width}" fill="url(#waste-${esc(b.id)})" stroke="#c2cebb" stroke-width="5"/>${b.parts.map(p=>`<g><title>${esc(p.id+' · '+p.name+' · '+p.length+' × '+p.width+' mm'+(p.rotated?' · Girada 90°':''))}</title><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.color}" stroke="white" stroke-width="10"/><text x="${p.x+p.w/2}" y="${p.y+p.h/2-12}" text-anchor="middle" fill="white" font-size="${Math.min(65,p.w/5,p.h/4)}" font-family="Arial">${esc(p.id)}</text><text x="${p.x+p.w/2}" y="${p.y+p.h/2+58}" text-anchor="middle" fill="white" font-size="${Math.min(45,p.w/8,p.h/6)}" font-family="Arial">${p.w} × ${p.h}</text></g>`).join('')}<text x="${m.length/2}" y="-35" text-anchor="middle" fill="#819176" font-size="54" font-family="Arial">${fmt(m.length)} mm</text></svg>`;}

function stockSvg(m,count,cut=false,items=[]){
 const point=(x,y,z)=>[66+x*.87+y*.8,187-x*.33+y*.37-z];
 const pts=vs=>vs.map(v=>point(...v).join(',')).join(' ');
 const cube=(x,y,z,l,w,h,c,hollow=false)=>{
  if(hollow&&m?.section==='round'){
   const ring=(xx,r)=>Array.from({length:20},(_,i)=>{const a=i*Math.PI/10;return [xx,y+w/2+Math.sin(a)*w*r,z+h/2+Math.cos(a)*h*r];});
   const front=ring(x,.5),back=ring(x+l,.5);let sides='';
   for(let i=0;i<20;i++){const j=(i+1)%20;sides+=`<polygon points="${pts([front[i],back[i],back[j],front[j]])}" fill="${i<10?c[0]:c[1]}"/>`;}
   return sides+`<polygon points="${pts(front)}" fill="${c[2]}" stroke="#6b7c65" stroke-width=".5"/><polygon points="${pts(ring(x-.1,.31))}" fill="#3d4a40"/>`;
  }
  const front=[[x,y,z],[x,y+w,z],[x,y+w,z+h],[x,y,z+h]],top=[[x,y,z+h],[x+l,y,z+h],[x+l,y+w,z+h],[x,y+w,z+h]],side=[[x,y+w,z],[x+l,y+w,z],[x+l,y+w,z+h],[x,y+w,z+h]];
  let s=`<polygon points="${pts(side)}" fill="${c[1]}" stroke="#768174" stroke-width=".5"/><polygon points="${pts(top)}" fill="${c[0]}" stroke="#a5afa0" stroke-width=".5"/><polygon points="${pts(front)}" fill="${c[2]}" stroke="#65745f" stroke-width=".5"/>`;
  if(hollow){const inset=1.8;s+=`<polygon points="${pts([[x-.1,y+inset,z+inset],[x-.1,y+w-inset,z+inset],[x-.1,y+w-inset,z+h-inset],[x-.1,y+inset,z+h-inset]])}" fill="#3d4a40"/>`;}
  return s;
 };
 let grid='';for(let i=-100;i<400;i+=24){grid+=`<path d="M${point(i,-100,0)} L${point(i,220,0)} M${point(-100,i,0)} L${point(350,i,0)}"/>`;}
 let shapes='';
 if(m){
  const per=Math.min(m.bundle||8,16),shown=Math.min(count,per*3),maxL=Math.max(m.length,...items.map(p=>p.length));
  const list=Array.from({length:shown},(_,i)=>({i,pack:Math.floor(i/per),pos:i%per})).sort((a,b)=>a.pack-b.pack||Math.floor(a.pos/4)-Math.floor(b.pos/4)||a.pos%4-b.pos%4);
  for(const {i,pack,pos} of list){
   const y=(pack%3)*66+(m.kind==='plate'?0:(pos%4)*13),z=(m.kind==='plate'?pos*3:Math.floor(pos/4)*13)+8,x=Math.floor(pack/3)*25;
   const p=items[i%Math.max(items.length,1)],l=cut&&p?Math.max(38,p.length/maxL*235):235;
   const color=cut?['#d9936f','#b57350','#e1a582']:['#b8c1af','#87977e','#c6ccbf'];
   const w=m.kind==='plate'?(cut&&p?Math.max(8,p.width/maxL*235):Math.min(70,m.width/m.length*235)):11;
   shapes+=cube(x,y,z,l,w,m.kind==='plate'?2:Math.max(5,Math.min(16,m.height/m.width*11)),color,m.kind==='tube');
  }
  const packs=Math.min(3,Math.ceil(shown/per));
  for(let k=0;k<packs;k++){
   const yy=k*66;shapes+=`<path d="M${point(78,yy-2,8)} L${point(78,yy-2,37)} L${point(78,yy+52,37)} L${point(78,yy+52,8)}" fill="none" stroke="${cut?'#b97c51':'#697f60'}" stroke-width="3" opacity=".8"/>`;
  }
 }
 return `<svg viewBox="0 0 500 285" role="img" aria-label="Vista isométrica esquemática: ${count} ${m?.kind==='plate'?'placas':'barras'}${cut?' cortadas':' en bruto'}. Se representan hasta tres paquetes, con hasta 16 unidades por paquete."><g stroke="#e8ece2" stroke-width=".6" fill="none">${grid}</g><ellipse cx="260" cy="218" rx="170" ry="22" fill="#b9c5ab" opacity=".14"/>${shapes}</svg>`;
}

function materialSummary(){
 if(!project.plan)return 'Calculá el plan de corte';
 return project.plan.groups.map(g=>{const m=project.materials.find(v=>v.id===g.material),qty=g.required,unit=m.kind==='tube'?(qty===1?'barra':'barras'):(qty===1?'placa':'placas'),format=`${fmt(m.length)}${m.kind==='plate'?' × '+fmt(m.width):''} mm`;return `<span style="display:block;line-height:1.5;white-space:normal"><strong>${qty} ${unit}</strong> · ${esc(m.name)} ${esc(m.spec)} · ${format}</span>`;}).join('');
}
function metricCards(){const s=metrics(project,project.plan);return `<div class="metrics">${[
 ['Piezas a fabricar',fmt(s.pieces),'piezas',project.pieces.length+' medidas diferentes','box',''],
 ['Material necesario',project.plan?fmt(s.tubes+s.plates):'—','unidades',materialSummary(),'bar',''],
 ['Aprovechamiento',project.plan?fmt(s.utilization,1):'—','%',project.plan?'Piezas / material bruto · por volumen':'Pendiente de optimización','percent','green'],
 ['Sobrantes recuperables',project.plan?fmt(s.reusable):'—','retazos',`Lado mínimo de ${fmt(project.settings.reusable)} mm`,'leaf','green']
 ].map(([title,value,unit,foot,ico,cls])=>`<div class="metric"><div class="metric-title">${title}${icon(ico)}</div><div class="metric-value num">${value}<small>${unit}</small></div><div class="metric-foot ${cls}">${foot}</div></div>`).join('')}</div>`;}

function pieceTable(){return `<div class="panel"><div class="panel-head"><div><h2>Lista de piezas <span class="tag" style="margin-left:7px">${project.pieces.length}</span></h2><p>Las medidas que necesitás, organizadas por material.</p></div><div class="panel-actions">${btn('Agregar pieza','add-piece','small','plus')}</div></div><div class="table-wrap"><table><thead><tr><th>Pieza / descripción</th><th>Material</th><th>Medida (mm)</th><th class="text-right">Cantidad</th><th><span aria-label="Acciones"></span></th></tr></thead><tbody>${project.pieces.map((p,i)=>{const m=project.materials.find(m=>m.id===p.material);return `<tr><td><div class="piece-title"><i class="piece-dot" style="background:${PALETTE[i%PALETTE.length]}"></i><small>${esc(p.id)}</small><strong>${esc(p.name)}</strong></div></td><td><span class="muted">${esc(m?.spec||'')}</span></td><td class="num">${fmt(p.length)}${m?.kind==='plate'?' × '+fmt(p.width):''}</td><td class="text-right num">${fmt(p.qty)}</td><td class="text-right"><button class="icon-btn" data-action="edit-piece" data-id="${esc(p.id)}" aria-label="Editar ${esc(p.name)}">${icon('edit')}</button><button class="icon-btn" data-action="delete-piece" data-id="${esc(p.id)}" aria-label="Eliminar ${esc(p.name)}">${icon('trash')}</button></td></tr>`;}).join('')}</tbody></table>${!project.pieces.length?empty('Tu próxima orden empieza acá','Agregá las piezas que necesitás fabricar.','Agregar pieza','add-piece'):''}</div><div class="table-bottom"><span>${fmt(project.pieces.reduce((a,p)=>a+p.qty,0))} piezas en total · Todas las medidas en milímetros</span>${btn('Importar lista','import-pieces','ghost small','upload')}</div></div>`;}
function empty(title,text,label='',action=''){return `<div class="empty">${icon('layers')}<h3>${title}</h3><p>${text}</p>${label?btn(label,action,'primary','plus'):''}</div>`;}

function overview(){
 const m=currentMaterial(),group=m?groupFor(m):null,bins=group?.bins||[],patterns=m?(m.kind==='tube'?groupBarPatterns(bins):groupPlatePatterns(bins)):[];
 return `${metricCards()}<div class="workspace-grid" style="grid-template-columns:1fr"><section class="panel"><div class="panel-head"><div><h2>Planos para el operario</h2><p>Patrón, repeticiones, corte y sobrante para stock.</p></div><span class="tag ${project.plan?'':'orange'}">${project.plan?'Plan calculado':'Pendiente'}</span></div><div class="material-selector">${icon(m?.kind==='plate'?'layers':'bar')}<select aria-label="Material del plano" id="preview-material">${project.materials.map(v=>`<option value="${esc(v.id)}" ${v.id===m?.id?'selected':''}>${esc(v.name)} · ${esc(v.spec)}</option>`).join('')}</select><span class="tag">${fmt(m?.length||0)}${m?.kind==='plate'?' × '+fmt(m.width):''} mm</span></div><div class="cut-preview operator-preview">${patterns.length?patterns.slice(0,3).map(pattern=>overviewPatternCard(pattern,m)).join(''):empty(project.plan?'Sin piezas para este material':'Listo para calcular',project.plan?'Seleccioná otro material o agregá piezas.':'Cargá tus piezas y presioná Optimizar corte.')}${patterns.length>3?`<div class="operator-more">+ ${patterns.length-3} patrones en Planos de corte</div>`:''}</div><div class="cut-footer"><span class="legend-item"><i class="swatch" style="background:#de794e"></i>Corte</span><span class="legend-item"><i class="swatch" style="background:#dce4d3"></i>Sobrante</span><span>Medidas en mm</span>${btn('Ver todos los planos','goto-plans','ghost small','arrow')}</div></section></div>${pieceTable()}`;
}

function render(){
 const title={order:'Orden de corte',plans:'Planos de corte',materials:'Materiales y acopio',documents:'Documentación',settings:'Parámetros de corte'}[ui.page];
 const s=metrics(project,project.plan);
 document.querySelector('#app').innerHTML=`<div class="app-shell"><aside id="sidebar" class="sidebar ${ui.menu?'open':''}"><a class="brand" href="#order" aria-label="MODELLWERK CUT, inicio"><span class="brand-mark">MW</span><span class="brand-word">MODELLWERK<span class="brand-sub">CUT / PRODUCTION</span></span></a><div class="workshop"><span>${icon('cube')}</span><span>Espacio de fabricación<small>Mi taller</small></span></div><div class="nav-label">Producción</div><nav aria-label="Navegación principal">${nav.map(([id,label,ico])=>`<button class="nav-item ${ui.page===id?'active':''}" data-action="navigate" data-page="${id}" ${ui.page===id?'aria-current="page"':''}>${icon(ico)}${label}${id==='order'?`<span class="nav-count">${project.pieces.length}</span>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><button class="nav-item ${ui.page==='settings'?'active':''}" data-action="navigate" data-page="settings">${icon('settings')}Parámetros de corte</button><button class="nav-item" data-action="help">${icon('help')}Guía de taller</button><div class="local-note"><span class="dot"></span>Espacio local<p>Tu producción, en este dispositivo.</p></div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb"><button class="mobile-menu icon-btn" data-action="menu" aria-label="Abrir navegación" aria-controls="sidebar" aria-expanded="${ui.menu}">${icon('menu')}</button><span>Taller</span>${icon('chevron')}<strong>Planificación de producción</strong></div><div class="topbar-right">${project.demo?'<span class="demo-tag">Orden de ejemplo</span>':''}<span class="saved-label"><span class="dot"></span>${storageWarning?'Guardado no disponible':'Guardado en este dispositivo'}</span><span class="avatar">MW</span></div></header><main class="main"><div class="page-heading"><div><div class="eyebrow">Producción / ${esc(project.reference)}</div><h1>${title}</h1><div class="subline">${esc(project.name)}<span>·</span><span>${fmt(project.pieces.reduce((n,p)=>n+p.qty,0))} piezas</span><button class="icon-btn" data-action="edit-order" aria-label="Editar orden">${icon('edit')}</button></div></div><div class="actions">${btn('Nueva orden','new-order','','plus')}${btn('Optimizar corte','optimize','primary','cut')}</div></div>${storageWarning?`<div class="notice error">${icon('alert')}${esc(storageWarning)}</div>`:''}${!project.plan&&project.pieces.length?`<div class="notice">${icon('refresh')}La orden tiene cambios. Optimizá para actualizar planos y compra.</div>`:''}${project.plan?.rejected.length?`<div class="notice error">${icon('alert')}${project.plan.rejected.length} piezas no entran en el formato comercial. Revisá sus medidas en Planos de corte.</div>`:''}${renderPage()}<footer class="footer"><span class="footer-brand">MODELLWERK / CUT</span><span>Planificar mejor. Fabricar con precisión. &nbsp; <span style="color:#b4bcb3">/</span> &nbsp; mm</span></footer></main></div></div>`;
}
function navigate(page){ui.page=page;ui.menu=false;render();window.scrollTo(0,0);}
function renderPage(){return ({order:overview,plans:plansView,materials:materialsView,documents:documentsView,settings:settingsView}[ui.page]||overview)();}
function modal(title,body,footer=''){const d=document.querySelector('#modal');d.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Cerrar">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-foot">${footer}</div>`:''}`;d.setAttribute('aria-labelledby','dialog-title');d.showModal();}
function optimizeAction(){try{const same=project.plan?.signature===signature(project);project.plan=optimize(project);if(!same)project.completed=[];save();render();toast('Compra calculada: '+allBins().length+' unidades de material.');return metrics(project,project.plan);}catch(e){toast(e.message);throw e;}}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
 if(action==='navigate'){navigate(el.dataset.page);}
 else if(action==='goto-plans'){navigate('plans');}
 else if(action==='menu'){ui.menu=!ui.menu;render();}
 else if(action==='close-modal')document.querySelector('#modal').close();
 else if(action==='optimize'){try{optimizeAction();}catch{}}
 else {try{handleAction(action,el);}catch(err){toast(err.message);}}
});
document.addEventListener('change',e=>{if(e.target.id==='preview-material'){ui.material=e.target.value;render();}});
function handleAction(action,el){
 const id=el.dataset.id;
 if(action==='add-piece'||action==='edit-piece')pieceModal(id);
 else if(action==='delete-piece')confirmDelete('piece',id);
 else if(action==='add-material'||action==='edit-material')materialModal(id);
 else if(action==='delete-material')confirmDelete('material',id);
 else if(action==='confirm-delete'){const {kind,id}=el.dataset;if(kind==='piece')project.pieces=project.pieces.filter(p=>p.id!==id);else project.materials=project.materials.filter(m=>m.id!==id);document.querySelector('#modal').close();touch();toast('Eliminado. Volvé a optimizar la orden.');}
 else if(action==='edit-order'||action==='new-order')orderModal(action==='new-order');
 else if(action==='filter'){ui.filter=el.dataset.value;ui.planPage=0;render();}
 else if(action==='plan-page'){ui.planPage=Math.max(0,Number(el.dataset.page)||0);render();window.scrollTo(0,0);}
 else if(action==='complete-bin')toggleBin(id);
 else if(action==='export-project')download(JSON.stringify(compactProject(),null,2),fileName()+'.json','application/json');
 else if(action==='export-csv')exportCSV();
 else if(action==='import-project')importProjectModal();
 else if(action==='import-pieces')importPiecesModal();
 else if(action==='print-plan')printDocument('plan');
 else if(action==='print-stock')printDocument('stock');
 else if(action==='print-cut-summary')printDocument('cut-summary');
 else if(action==='restore-order')restoreOrder(id);
 else if(action==='save-example'){archiveCurrent();project=demoProject();project.plan=optimize(project);ui.material='m1';ui.page='order';save();render();toast('Ejemplo cargado. La orden anterior quedó en el historial.');}
 else if(action==='help')modal('Guía de taller',`<div class="help-text"><p><strong>1. Definí el material comercial.</strong> En Materiales y acopio cargá el perfil, espesor, largo o formato de placa y cuántas unidades trae cada paquete del proveedor.</p><p><strong>2. Cargá las piezas.</strong> Indicá medidas en milímetros, cantidad y material exacto. Podés pegar una lista completa desde una planilla. Cada orden admite hasta ${fmt(MAX_PIECES)} piezas.</p><p><strong>3. Ajustá y optimizá.</strong> El ancho de corte consume material. El despunte se aplica en ambos extremos del tubo y en los cuatro bordes de la placa. En órdenes grandes se usa una distribución acelerada; la optimización es heurística y no garantiza el óptimo matemático.</p><p><strong>4. Comprá y fabricá.</strong> La optimización calcula todas las barras y placas que tenés que pedir para esa orden, además de la cantidad de paquetes. Después registrá cada unidad cortada para actualizar el avance.</p><p><strong>Alcance.</strong> Tubos rectangulares o redondos con cortes rectos a 90°; placas rectangulares con cortes de guillotina y giro opcional de 90°. Las vistas de material son esquemáticas. No genera trayectorias CNC, ingletes ni anidado de contornos.</p><p><strong>Guardado local.</strong> La aplicación conserva la orden y un historial de hasta 20 órdenes en este navegador. El plan se reconstruye al abrir una orden para que pedidos grandes no agoten el espacio disponible. Descargá un respaldo JSON para moverla de dispositivo o conservar una copia. El peso es una estimación para acero de 7.850 kg/m³.</p></div>`,btn('Entendido','close-modal','primary'));
}

function barPatternDiagram(pattern,m,large=false){
 const b=pattern.representative;
 const diagram={...b,parts:b.parts.map((p,i)=>({...p,id:'Corte '+(i+1),name:'Medida por barra',color:PALETTE[i%PALETTE.length]}))};
 return barDiagram(diagram,m,large).replace(`<span class="bar-id">B${String(b.index).padStart(2,'0')}</span>`,`<span class="bar-id">P${String(pattern.index).padStart(2,'0')}</span>`).replace(`aria-label="Barra ${b.index},`,`aria-label="Patrón ${pattern.index}, repetir en ${pattern.bins.length} ${pattern.bins.length===1?'barra':'barras'},`);
}

function remnantGroups(b,m){
 const groups=new Map();
 for(const r of b.free||[]){
  const stock=m.kind==='tube'?r.w>=project.settings.reusable:Math.min(r.w,r.h)>=project.settings.reusable;
  const key=[r.w.toFixed(3),m.kind==='plate'?r.h.toFixed(3):'',stock].join('|');
  if(!groups.has(key))groups.set(key,{w:r.w,h:r.h,stock,count:0});
  groups.get(key).count++;
 }
 return [...groups.values()].sort((a,b)=>Number(b.stock)-Number(a.stock)||(b.w*(b.h||1))-(a.w*(a.h||1)));
}

function operatorRemnant(pattern,m){
 const groups=remnantGroups(pattern.representative,m),stock=groups.filter(r=>r.stock),discard=groups.filter(r=>!r.stock);
 const dims=r=>`${fmt(r.w,1)}${m.kind==='plate'?' × '+fmt(r.h,1):''} mm${r.count>1?' × '+r.count:''}`;
 const stockCode=m.kind==='tube'?`R-${esc(m.id)}-[Nº barra]-01`:`R-${esc(m.id)}-[Nº placa]-[01…]`;
 return `<div class="operator-remnant"><span>${icon(stock.length?'leaf':'trash')}</span><div><small>SOBRANTE POR ${m.kind==='tube'?'BARRA':'PLACA'}</small>${groups.length?`<div class="remnant-values">${groups.map(r=>`<strong class="${r.stock?'stock':'discard'}">${dims(r)} <em>${r.stock?'Stock':'Descarte'}</em></strong>`).join('')}</div>`:'<strong>Sin sobrante</strong>'}${stock.length?`<p>Identificar para acopio: <b>${stockCode}</b></p>`:discard.length?`<p>No alcanza el mínimo recuperable de ${fmt(project.settings.reusable)} mm.</p>`:''}</div></div>`;
}

function printRemnantLine(pattern,m){
 const groups=remnantGroups(pattern.representative,m),stock=groups.filter(r=>r.stock);
 const dims=r=>`${fmt(r.w,1)}${m.kind==='plate'?' × '+fmt(r.h,1):''} mm${r.count>1?' × '+r.count:''}`;
 const values=groups.length?groups.map(r=>`${dims(r)} (${r.stock?'stock':'descarte'})`).join(' · '):'Sin sobrante';
 const code=m.kind==='tube'?`R-${esc(m.id)}-[barra]-01`:`R-${esc(m.id)}-[placa]-[01…]`;
 return `<div class="print-remnant-line"><strong>SOBRANTE:</strong> ${values}${stock.length?` <span><b>IDENTIFICAR:</b> ${code}</span>`:''}</div>`;
}

function overviewPatternCard(pattern,m){
 const diagram=m.kind==='tube'?barPatternDiagram(pattern,m):platePatternDiagram(pattern,m);
 return `<article class="operator-plan compact"><div class="operator-plan-head"><div><small>MATERIAL</small><strong>${esc(m.name)} · ${esc(m.spec)}</strong></div><div><small>PATRÓN</small><strong>${String(pattern.index).padStart(2,'0')}</strong></div><div><small>HACER</small><strong>${pattern.bins.length} ${pattern.bins.length===1?'vez':'veces'}</strong></div></div><div class="operator-diagram">${diagram}</div>${operatorRemnant(pattern,m)}</article>`;
}

function barPatternCard(pattern,m){
 const status=patternProgress(pattern,project.completed),done=status.completed.length===status.total;
 const next=status.available[0],last=status.completed.at(-1),visibleBins=pattern.bins.slice(0,BAR_DETAIL_LIMIT);
 const hidden=status.total-visibleBins.length;
 return `<section class="panel plan-card operator-plan ${done?'done':''}" data-pattern="${esc(pattern.id)}"><div class="operator-plan-head"><div><small>MATERIAL</small><strong>${esc(m.name)} · ${esc(m.spec)}</strong><span>${fmt(m.length)} mm</span></div><div><small>Nº DE PATRÓN</small><strong>${String(pattern.index).padStart(2,'0')}</strong></div><div class="operator-repeat"><small>HACER ESTE PATRÓN</small><strong>${status.total} ${status.total===1?'vez':'veces'}</strong></div><span class="tag ${done?'':status.completed.length?'blue':'orange'}">${done?'Completado':status.completed.length?'En proceso':'Por cortar'}</span></div><div class="plan-body operator-body"><div class="operator-diagram">${barPatternDiagram(pattern,m,true)}</div>${operatorRemnant(pattern,m)}<details class="operator-control" data-details="${esc(pattern.id)}-bars"><summary>Control individual · ${barNumbers(pattern.bins)}</summary><div class="pattern-bars">${visibleBins.map(bin=>{const cut=project.completed.includes(bin.id);return `<label class="pattern-bar"><input type="checkbox" data-bin="${esc(bin.id)}" ${cut?'checked':''}><span><strong>B${String(bin.index).padStart(2,'0')}</strong> · ${cut?'Cortada':'Pendiente'}</span></label>`;}).join('')}</div>${hidden?`<p class="details-caption">Se muestran las primeras ${BAR_DETAIL_LIMIT} barras. Continuá con “Registrar 1 barra” para las ${fmt(hidden)} restantes.</p>`:''}</details></div><div class="plan-tools"><span><strong>${status.completed.length} de ${status.total}</strong> barras cortadas</span><div class="actions">${last?btn('Deshacer 1','complete-bin','small ghost','refresh',`data-id="${esc(last.id)}"`):''}${btn('Registrar 1 barra','complete-bin','small dark','check',`data-id="${esc(next?.id||'')}" ${next?'':'disabled'}`)}</div></div></section>`;
}

function platePatternDiagram(pattern,m){
 const b=pattern.representative;
 return plateDiagram({...b,parts:b.parts.map((p,i)=>({...p,id:'Corte '+(i+1),name:'Medida por placa',color:PALETTE[i%PALETTE.length]}))},m);
}

function platePatternCard(pattern,m){
 const status=patternProgress(pattern,project.completed),done=status.completed.length===status.total;
 const next=status.available[0],last=status.completed.at(-1),visibleBins=pattern.bins.slice(0,BAR_DETAIL_LIMIT),hidden=status.total-visibleBins.length;
 return `<section class="panel plan-card operator-plan ${done?'done':''}" data-pattern="${esc(pattern.id)}"><div class="operator-plan-head"><div><small>MATERIAL</small><strong>${esc(m.name)} · ${esc(m.spec)}</strong><span>${fmt(m.length)} × ${fmt(m.width)} mm</span></div><div><small>Nº DE PATRÓN</small><strong>${String(pattern.index).padStart(2,'0')}</strong></div><div class="operator-repeat"><small>HACER ESTE PATRÓN</small><strong>${status.total} ${status.total===1?'vez':'veces'}</strong></div><span class="tag ${done?'':status.completed.length?'blue':'orange'}">${done?'Completado':status.completed.length?'En proceso':'Por cortar'}</span></div><div class="plan-body operator-body"><div class="operator-diagram">${platePatternDiagram(pattern,m)}</div>${operatorRemnant(pattern,m)}<details class="operator-control" data-details="${esc(pattern.id)}-plates"><summary>Control individual · ${plateNumbers(pattern.bins)}</summary><div class="pattern-bars">${visibleBins.map(bin=>{const cut=project.completed.includes(bin.id);return `<label class="pattern-bar"><input type="checkbox" data-bin="${esc(bin.id)}" ${cut?'checked':''}><span><strong>PL${String(bin.index).padStart(2,'0')}</strong> · ${cut?'Cortada':'Pendiente'}</span></label>`;}).join('')}</div>${hidden?`<p class="details-caption">Se muestran las primeras ${BAR_DETAIL_LIMIT} placas. Continuá con “Registrar 1 placa” para las ${fmt(hidden)} restantes.</p>`:''}</details></div><div class="plan-tools"><span><strong>${status.completed.length} de ${status.total}</strong> placas cortadas</span><div class="actions">${last?btn('Deshacer 1','complete-bin','small ghost','refresh',`data-id="${esc(last.id)}"`):''}${btn('Registrar 1 placa','complete-bin','small dark','check',`data-id="${esc(next?.id||'')}" ${next?'':'disabled'}`)}</div></div></section>`;
}

function printBarPattern(pattern,m,totalPatterns){
 const status=patternProgress(pattern,project.completed);
 const pageBreak=pattern.index%5===0&&pattern.index<totalPatterns?' print-page-break':'';
 return `<section class="print-section operator-print tube-print${pageBreak}"><div class="operator-print-head"><div><small>MATERIAL</small><h2>${esc(m.name)} · ${esc(m.spec)}</h2><p>${fmt(m.length)} mm</p></div><div><small>PATRÓN</small><strong>${String(pattern.index).padStart(2,'0')}</strong></div><div class="print-repeat"><small>HACER</small><strong>${status.total} ${status.total===1?'VEZ':'VECES'}</strong></div></div><div class="print-diagram">${barPatternDiagram(pattern,m)}</div>${printRemnantLine(pattern,m)}<p class="print-control">CONTROL ______ / ${status.total} &nbsp; RESPONSABLE __________________</p></section>`;
}

function printPlatePattern(pattern,m,totalPatterns){
 const status=patternProgress(pattern,project.completed);
 const pageBreak=pattern.index%3===0&&pattern.index<totalPatterns?' print-page-break':'';
 return `<section class="print-section operator-print plate-print${pageBreak}"><div class="operator-print-head"><div><small>MATERIAL</small><h2>${esc(m.name)} · ${esc(m.spec)}</h2><p>${fmt(m.length)} × ${fmt(m.width)} mm</p></div><div><small>PATRÓN</small><strong>${String(pattern.index).padStart(2,'0')}</strong></div><div class="print-repeat"><small>HACER</small><strong>${status.total} ${status.total===1?'VEZ':'VECES'}</strong></div></div><div class="print-diagram">${platePatternDiagram(pattern,m)}</div>${printRemnantLine(pattern,m)}<p class="print-control">CONTROL ______ / ${status.total} &nbsp; RESPONSABLE __________________</p></section>`;
}

function materialDivider(m,patterns){
 const units=patterns.reduce((n,p)=>n+p.bins.length,0),unit=m.kind==='tube'?(units===1?'barra':'barras'):(units===1?'placa':'placas');
 return `<div class="material-divider"><span>${m.kind==='tube'?icon('bar'):icon('layers')}</span><div><small>${m.kind==='tube'?'PERFILES / BARRAS':'PLACAS'} · NUEVO MATERIAL</small><h2>${esc(m.name)} · ${esc(m.spec)}</h2><p>${fmt(m.length)}${m.kind==='plate'?' × '+fmt(m.width):''} mm · ${patterns.length} ${patterns.length===1?'patrón':'patrones'} · ${units} ${unit}</p></div><strong>Patrón 01</strong></div>`;
}


function plansView(){
 if(!project.plan)return `<section class="panel">${empty('Un buen corte empieza con un plan','Cargá las piezas y calculá su distribución.','Optimizar corte','optimize')}</section>`;
 const groups=project.plan.groups.filter(g=>ui.filter==='all'||project.materials.find(m=>m.id===g.material)?.kind===ui.filter),s=metrics(project,project.plan),total=allBins().length;
 const entries=[];
 for(const g of groups){
  const m=project.materials.find(v=>v.id===g.material);
  const patterns=m.kind==='tube'?groupBarPatterns(g.bins):groupPlatePatterns(g.bins);
  patterns.forEach((pattern,index)=>entries.push({first:index===0,m,patterns,render:()=>m.kind==='tube'?barPatternCard(pattern,m):platePatternCard(pattern,m)}));
 }
 const pageCount=Math.max(1,Math.ceil(entries.length/PLAN_PAGE_SIZE)),page=Math.min(ui.planPage,pageCount-1),start=page*PLAN_PAGE_SIZE;
 const pageEntries=entries.slice(start,start+PLAN_PAGE_SIZE),pager=pageCount>1?`<div class="panel detail-pad" style="margin-bottom:18px"><div class="progress-row"><span>Planos ${fmt(start+1)}–${fmt(Math.min(start+PLAN_PAGE_SIZE,entries.length))} de ${fmt(entries.length)}</span><span class="actions">${btn('Anterior','plan-page','small ghost','chevron',`data-page="${page-1}" ${page===0?'disabled':''}`)}<strong>Página ${page+1} / ${pageCount}</strong>${btn('Siguiente','plan-page','small ghost','arrow',`data-page="${page+1}" ${page===pageCount-1?'disabled':''}`)}</span></div></div>`:'';
 const largeNote=project.plan.mode==='large'?`<div class="notice" style="margin-bottom:18px">Orden grande: se usa una estrategia acelerada y se muestran hasta ${PLAN_PAGE_SIZE} planos por página para mantener fluida la aplicación.</div>`:'';
 const rejected=project.plan.rejected.length?`<div class="panel plan-card"><div class="panel-head"><h2>Piezas fuera de formato</h2><span class="tag orange">Revisar</span></div><div class="detail-pad">${[...new Set(project.plan.rejected.map(p=>p.id))].map(id=>{const p=project.plan.rejected.find(v=>v.id===id);return `<p class="help-text">${esc(p.id)} · ${esc(p.name)}: ${esc(p.reason)} (${project.plan.rejected.filter(v=>v.id===id).length} unidades).</p>`;}).join('')}</div></div>`:'';
 return `<div class="section-tabs">${[['all','Todos los planos'],['tube','Tubos'],['plate','Placas']].map(([id,title])=>`<button data-action="filter" data-value="${id}" class="${ui.filter===id?'active':''}">${title}</button>`).join('')}</div>${largeNote}<div class="plan-layout"><div>${rejected}${pager}${pageEntries.map(entry=>(entry.first?materialDivider(entry.m,entry.patterns):'')+entry.render()).join('')}${!entries.length?empty('Sin planos en esta categoría','Probá con otro material.'):''}${pager}</div><aside class="panel sticky-panel"><div class="panel-head"><h2>Seguimiento de taller</h2></div><div class="detail-pad"><div class="progress-row"><span>Material procesado</span><strong>${project.completed.length} / ${total}</strong></div><div class="progress"><span style="width:${total?project.completed.length/total*100:0}%"></span></div><dl class="key-values" style="margin-top:24px"><dt>Piezas cortadas</dt><dd>${s.cutPieces} / ${s.pieces}</dd><dt>Ancho de corte</dt><dd>${project.settings.kerf} mm</dd><dt>Despunte por borde</dt><dd>${project.settings.trim} mm</dd><dt>Giro de placas</dt><dd>${project.settings.rotate?'Permitido':'Bloqueado'}</dd></dl><p class="details-caption">Cada patrón indica cuántas barras o placas repetir. Las placas parten del borde útil superior izquierdo. Comprobá medidas y sujeción antes de cortar.</p>${btn('Imprimir planos','print-plan','small','print','style="width:100%;margin-top:18px"')}</div></aside></div>`;
}

function materialsView(){
 const s=project.plan?metrics(project,project.plan):null;
 return `<div class="stock-controls"><p>Formatos comerciales y cantidades exactas para pedir según el plan de corte.</p>${btn('Agregar material','add-material','','plus')}</div>${s?`<div class="notice" style="margin-bottom:24px"><strong>Pedido de esta orden:</strong> ${s.tubes} ${s.tubes===1?'barra':'barras'} y ${s.plates} ${s.plates===1?'placa':'placas'} comerciales.</div>`:''}<div class="wide-grid">${project.materials.map(m=>{
 const g=groupFor(m),used=g?.bins.filter(b=>project.completed.includes(b.id)).length||0,required=g?.required||0,pending=Math.max(0,required-used),packages=required?Math.ceil(required/m.bundle):0;
 return `<section class="panel"><div class="panel-head"><div><h2>${esc(m.name)}</h2><p>${esc(m.spec)}</p></div><button class="icon-btn" data-action="edit-material" data-id="${esc(m.id)}" aria-label="Editar ${esc(m.name)}">${icon('edit')}</button></div><div class="material-preview">${stockSvg(m,required)}</div><div class="detail-pad"><div class="progress-row" style="margin-top:0"><span>${m.kind==='tube'?'Barras':'Placas'} a comprar</span><strong>${project.plan?required:'—'}</strong></div><div class="progress"><span style="width:${required?used/required*100:0}%"></span></div><dl class="key-values"><dt>Formato comercial</dt><dd>${fmt(m.length)}${m.kind==='plate'?' × '+fmt(m.width):''} mm</dd><dt>Cantidad a comprar</dt><dd>${project.plan?required+' unidades':'Sin calcular'}</dd><dt>Presentación del proveedor</dt><dd>Hasta ${m.bundle} unidades por paquete</dd><dt>Paquetes a pedir</dt><dd>${project.plan?packages:'—'}</dd><dt>Cortadas</dt><dd>${used}</dd><dt>Pendientes de cortar</dt><dd>${project.plan?pending:'—'}</dd></dl>${!project.plan?`<div class="notice" style="margin:14px 0 0">Optimizá el corte para calcular la compra.</div>`:''}<div class="actions" style="margin-top:18px">${btn('Editar formato','edit-material','small','settings',`data-id="${esc(m.id)}"`)}<button class="icon-btn" data-action="delete-material" data-id="${esc(m.id)}" aria-label="Eliminar ${esc(m.name)}">${icon('trash')}</button></div></div></section>`;}).join('')}</div>${!project.materials.length?`<div class="panel">${empty('Tu catálogo de materiales','Agregá el primer tubo o placa comercial.','Agregar material','add-material')}</div>`:''}${remnantsView()}`;
}

function remnantsView(){if(!project.plan)return '';const rows=[];for(const g of project.plan.groups){const m=project.materials.find(v=>v.id===g.material);for(const b of g.bins)b.free.forEach((r,i)=>{if(m.kind==='tube'?r.w>=project.settings.reusable:Math.min(r.w,r.h)>=project.settings.reusable)rows.push({m,b,r,i});});}const visible=rows.slice(0,REMNANT_RENDER_LIMIT);return `<section class="panel" style="margin-top:24px"><div class="panel-head"><div><h2>Remanentes recuperables <span class="tag">${rows.length}</span></h2><p>Identificados por su barra o placa de origen; disponibles al completar su corte.</p></div></div>${rows.length>visible.length?`<div class="notice" style="margin:18px">Se muestran los primeros ${fmt(visible.length)} de ${fmt(rows.length)} remanentes para mantener fluida la pantalla. El total completo sigue incluido en el plan y en la impresión de materiales.</div>`:''}<div class="table-wrap"><table><thead><tr><th>Identificación</th><th>Material</th><th>Dimensiones (mm)</th><th>Estado</th></tr></thead><tbody>${visible.map(({m,b,r,i})=>`<tr><td>R-${esc(b.id)}-${i+1}</td><td>${esc(m.spec)}</td><td>${fmt(r.w,1)}${m.kind==='plate'?' × '+fmt(r.h,1):''}</td><td><span class="tag ${project.completed.includes(b.id)?'':'orange'}">${project.completed.includes(b.id)?'Disponible':'Previsto'}</span></td></tr>`).join('')}</tbody></table>${!rows.length?empty('Sin remanentes recuperables','No hay sobrantes que superen el mínimo configurado.'):''}</div></section>`;}

function documentsView(){
 const history=getHistory();return `<div class="wide-grid">${[
 ['cut','Planos simples para taller','Material, patrón, cantidad de repeticiones, dibujo de corte y sobrante para identificar y guardar.','Imprimir / PDF','print-plan',!project.plan],
 ['layers','Materiales y compra','Cantidad a comprar, presentaciones del proveedor, paquetes y sobrantes recuperables de la orden.','Imprimir materiales','print-stock',!project.plan],
 ['percent','Resumen de metros y cortes','Metros lineales de corte para cada chapa o malla y cantidad de cortes para cada tipo de tubo.','Exportar PDF','print-cut-summary',!project.plan],
 ['file','Lista de fabricación','Archivo CSV con códigos, materiales, medidas y cantidades. Compatible con planillas.','Descargar CSV','export-csv',!project.pieces.length],
 ['save','Respaldo de la orden','Conservá datos, parámetros y avance en un archivo JSON. Podés restaurarlo en otro dispositivo.','Descargar respaldo','export-project',false],
 ['upload','Recuperar una orden','Abrí un respaldo CUT. La orden actual se guarda en el historial de este dispositivo.','Importar respaldo','import-project',false]
 ].map(([ico,title,text,label,action,disabled])=>`<article class="panel doc-card"><div class="doc-icon">${icon(ico)}</div><h2>${title}</h2><p>${text}</p>${btn(label,action,'small',ico,disabled?'disabled':'')}</article>`).join('')}</div><section class="panel" style="margin-top:24px"><div class="panel-head"><div><h2>Órdenes guardadas</h2><p>Historial local · las últimas 20 órdenes, guardadas al crear o importar otra.</p></div>${btn('Cargar ejemplo','save-example','small','folder')}</div>${history.length?`<div class="table-wrap"><table><thead><tr><th>Orden</th><th>Proyecto</th><th>Piezas</th><th>Guardado</th><th></th></tr></thead><tbody>${history.map(h=>`<tr><td>${esc(h.project.reference)}</td><td>${esc(h.project.name)}</td><td>${h.project.pieces.reduce((a,p)=>a+p.qty,0)}</td><td>${new Date(h.date).toLocaleString('es-AR')}</td><td>${btn('Abrir','restore-order','small ghost','folder',`data-id="${esc(h.id)}"`)}</td></tr>`).join('')}</tbody></table></div>`:empty('El historial está vacío','Al iniciar otra orden, esta quedará guardada aquí.')}</section>`;
}

const field=(label,name,value,options={})=>`<label class="field ${options.full?'full':''}">${label}<input name="${name}" value="${esc(value)}" type="${options.type||'text'}" ${options.type==='number'?`min="${options.min??1}" max="${options.max??30000}" step="${options.step??'any'}"`:'maxlength="120"'} ${options.optional?'':'required'} ${options.extra||''}>${options.hint?`<small>${options.hint}</small>`:''}</label>`;
const resetNote=()=>project.completed.length?`<div class="notice" style="margin-top:18px;margin-bottom:0">Cambiar datos de corte reinicia las ${project.completed.length} validaciones de material cortado. Descargá un respaldo si necesitás conservarlas.</div>`:'';
function settingsView(){return `<div class="setting-layout"><section class="panel"><div class="panel-head"><h2>Geometría y recuperación</h2></div><form id="settings-form"><div class="detail-pad"><div id="form-error" class="error-message" role="alert"></div><div class="form-grid">${field('Ancho de corte / disco (mm)','kerf',project.settings.kerf,{type:'number',min:0,max:30,hint:'Material que consume cada separación.'})}${field('Despunte por borde (mm)','trim',project.settings.trim,{type:'number',min:0,max:500,hint:'Dos extremos del tubo; cuatro bordes de la placa.'})}${field('Retazo mínimo recuperable (mm)','reusable',project.settings.reusable,{type:'number',min:0,max:10000,full:true,hint:'Para placas, ambos lados deben alcanzar este mínimo.'})}<label class="check-field" style="grid-column:1/-1"><input type="checkbox" name="rotate" ${project.settings.rotate?'checked':''}>Permitir giro de 90° en piezas de placa</label></div>${resetNote()}</div><div class="dialog-foot"><button class="btn primary" type="submit">${icon('save')}Guardar parámetros</button></div></form></section><section class="panel detail-pad"><h2>Un cálculo que podés revisar</h2><div class="help-text" style="margin-top:15px"><p>Los tubos se ordenan por largo y se distribuyen buscando el menor espacio libre. Para placas se comparan seis distribuciones de guillotina; en órdenes de más de 3.000 piezas se usa una estrategia acelerada por filas para mantener fluida la aplicación.</p><p>La optimización es heurística: obtiene una distribución válida, sin garantizar el mínimo absoluto de material.</p><p>Si el material tiene veta, acabado o sentido de laminación que debas respetar, desactivá el giro.</p><p>Las piezas que no entran quedan identificadas. La compra se calcula desde cero para cada orden, según el resultado del corte.</p></div></section></div>`;}

function pieceModal(id){
 if(!project.materials.length){materialModal();toast('Primero agregá el material comercial.');return;}
 const p=project.pieces.find(p=>p.id===id)||{id:'',name:'',material:currentMaterial()?.id,length:'',width:'',qty:1};
 const m=project.materials.find(m=>m.id===p.material);
 modal(id?'Editar pieza':'Agregar pieza',`<form id="piece-form" data-id="${esc(p.id)}"><div id="form-error" class="error-message" role="alert"></div><div class="form-grid">${field('Descripción','name',p.name,{full:true})}<label class="field full">Material comercial<select name="material" id="piece-material">${project.materials.map(m=>`<option value="${esc(m.id)}" ${m.id===p.material?'selected':''}>${esc(m.name)} · ${esc(m.spec)} · ${fmt(m.length)} mm</option>`).join('')}</select></label>${field('Largo (mm)','length',p.length,{type:'number'})}<label class="field" id="piece-width-field" ${m?.kind==='plate'?'':'hidden'}>Ancho (mm)<input type="number" min="1" max="10000" step="any" name="width" value="${esc(p.width||'')}" ${m?.kind==='plate'?'required':'disabled'}></label>${field('Cantidad','qty',p.qty,{type:'number',max:MAX_PIECE_QTY,step:1,hint:`Máximo ${fmt(MAX_PIECES)} piezas por orden.`})}</div>${resetNote()}</form>`,btn('Cancelar','close-modal')+`<button class="btn primary" type="submit" form="piece-form">${icon('check')}${id?'Guardar cambios':'Agregar pieza'}</button>`);
}

function materialModal(id){
 const m=project.materials.find(m=>m.id===id)||{id:'',name:'',kind:'tube',length:6000,width:40,height:40,thickness:2,stock:0,bundle:8,section:'rect'};
 modal(id?'Editar material':'Agregar material',`<form id="material-form" data-id="${esc(m.id)}"><div id="form-error" class="error-message" role="alert"></div><div class="form-grid"><label class="field">Tipo de material<select name="kind" id="material-kind"><option value="tube" ${m.kind==='tube'?'selected':''}>Tubo</option><option value="plate" ${m.kind==='plate'?'selected':''}>Placa</option></select></label><label class="field" id="section-field" ${m.kind==='plate'?'hidden':''}>Sección de tubo<select name="section" id="material-section"><option value="rect">Rectangular / cuadrada</option><option value="round" ${m.section==='round'?'selected':''}>Redonda</option></select></label>${field('Nombre / calidad del material','name',m.name,{full:true,hint:'Usá materiales distintos para calidades, espesores o formatos distintos.'})}${field('Largo comercial (mm)','length',m.length,{type:'number'})}${field('Ancho de placa / sección o diámetro (mm)','width',m.width,{type:'number',max:10000})}<label class="field" id="material-height-field" ${m.kind==='plate'||m.section==='round'?'hidden':''}>Alto de sección (mm)<input type="number" name="height" min="1" max="10000" step="any" value="${m.height}"></label>${field('Espesor (mm)','thickness',m.thickness,{type:'number',min:.1,max:1000})}${field('Unidades por paquete del proveedor','bundle',m.bundle,{type:'number',max:500,step:1,full:true,hint:'Se usa para calcular cuántos paquetes hay que pedir. La última presentación puede quedar incompleta.'})}</div>${resetNote()}</form>`,btn('Cancelar','close-modal')+`<button class="btn primary" type="submit" form="material-form">${icon('check')}Guardar material</button>`);
}

function orderModal(isNew){modal(isNew?'Nueva orden de producción':'Datos de la orden',`<form id="order-form" data-new="${isNew}"><div id="form-error" class="error-message" role="alert"></div><div class="form-grid">${field('Nombre del proyecto','name',isNew?'':project.name,{full:true})}${field('Número de orden','reference',isNew?'OT-'+Date.now().toString().slice(-5):project.reference,{full:true})}${isNew?'<label class="check-field" style="grid-column:1/-1"><input type="checkbox" name="keep" checked>Conservar el catálogo de materiales</label>':''}</div>${isNew?'<p class="details-caption">La orden actual quedará guardada en Documentación. Optimizá la nueva orden para calcular la compra antes de cortar.</p>':''}</form>`,btn('Cancelar','close-modal')+`<button class="btn primary" type="submit" form="order-form">${isNew?'Crear orden':'Guardar'}</button>`);}

function confirmDelete(kind,id){
 const item=kind==='piece'?project.pieces.find(v=>v.id===id):project.materials.find(v=>v.id===id);if(!item)return;
 if(kind==='material'&&project.pieces.some(p=>p.material===id)){toast('Este material tiene piezas asignadas. Reasignalas o eliminá las piezas primero.');return;}
 modal('Eliminar '+(kind==='piece'?'pieza':'material'),`<p class="help-text">Se eliminará <strong>${esc(item.name)}</strong> de esta orden. Tendrás que volver a optimizar el corte.</p>${resetNote()}`,btn('Cancelar','close-modal')+btn('Eliminar','confirm-delete','danger','trash',`data-kind="${kind}" data-id="${esc(id)}"`));
}

function toggleBin(id){
 const b=allBins().find(v=>v.id===id);if(!b)return;
 if(project.completed.includes(id))project.completed=project.completed.filter(v=>v!==id);else project.completed.push(id);
 const expanded=new Set(Array.from(document.querySelectorAll?.('details[data-details][open]')||[],el=>el.dataset.details));
 save();render();for(const el of document.querySelectorAll?.('details[data-details]')||[])el.open=expanded.has(el.dataset.details);toast('Avance actualizado en los planos y el acopio.');
}

function fileName(){return 'CUT-'+project.reference.replace(/[^a-zA-Z0-9_-]/g,'-');}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Archivo preparado para descargar.');}
function csvCell(v){const t=String(v);return '"'+(/^[\s]*[=+@-]/.test(t)?"'":'')+t.replaceAll('"','""')+'"';}
function exportCSV(){const rows=[['Codigo','Descripcion','Material','Formato','Largo_mm','Ancho_mm','Cantidad'],...project.pieces.map(p=>{const m=project.materials.find(m=>m.id===p.material);return [p.id,p.name,m.name,m.spec,p.length,m.kind==='plate'?p.width:'',p.qty];})];download('\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),fileName()+'-piezas.csv','text/csv;charset=utf-8');}

function getHistory(){try{const h=JSON.parse(localStorage.getItem(STORAGE+'-history')||'[]');return Array.isArray(h)?h.filter(v=>{try{return !!v.id&&!!v.date&&!!validateProject(v.project);}catch{return false;}}).slice(0,20):[];}catch{return [];}}
function archiveCurrent(){if(!project.pieces.length)return;const h=getHistory();h.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),project:compactProject(project)});try{localStorage.setItem(STORAGE+'-history',JSON.stringify(h.slice(0,20)));}catch{throw new Error('No hay espacio para archivar la orden. Descargá un respaldo antes de continuar.');}}
function restoreOrder(id){const h=getHistory().find(h=>h.id===id);if(!h)return;try{archiveCurrent();project=hydrate(h.project);ui.page='order';ui.material=project.materials[0]?.id;save();render();toast('Orden recuperada.');}catch(e){toast(e.message);}}
function importProjectModal(){modal('Importar respaldo CUT',`<form id="import-project-form"><div id="form-error" class="error-message" role="alert"></div><label class="field">Archivo de respaldo JSON<input name="file" type="file" accept=".json,application/json" required><small>Máximo 5 MB. La orden actual se guarda en el historial.</small></label></form>`,btn('Cancelar','close-modal')+'<button type="submit" class="btn primary" form="import-project-form">Importar orden</button>');}
function importPiecesModal(){if(!project.materials.length){materialModal();return;}modal('Importar lista de piezas',`<form id="import-pieces-form"><div id="form-error" class="error-message" role="alert"></div><div class="form-grid"><label class="field full">Material para esta lista<select name="material">${project.materials.map(m=>`<option value="${esc(m.id)}">${esc(m.name)} · ${esc(m.spec)}</option>`).join('')}</select></label><label class="field full">Pegá las filas de tu planilla<textarea name="rows" required spellcheck="false" placeholder="Larguero;2400;0;12&#10;Travesaño;1800;0;12"></textarea><small>Una pieza por fila: descripción; largo; ancho; cantidad. Separá con punto y coma o tabulaciones. Usá ancho 0 para tubos. Sin encabezado; se agregan a la lista existente. Máximo ${fmt(MAX_PIECES)} piezas por orden.</small></label></div>${resetNote()}</form>`,btn('Cancelar','close-modal')+'<button type="submit" form="import-pieces-form" class="btn primary">Agregar lista</button>');}

function cutSummaryDocument(){
 const rows=cutReport(project,project.plan),plates=rows.filter(r=>r.kind==='plate'),tubes=rows.filter(r=>r.kind==='tube');
 const plateSection=plates.length?`<section class="print-section"><h2>Chapas y mallas · metros lineales de corte</h2><table><thead><tr><th>Material</th><th>Formato comercial</th><th>Placas</th><th>Piezas</th><th class="text-right">Metros lineales</th></tr></thead><tbody>${plates.map(r=>`<tr><td><strong>${esc(r.name)}</strong><br>${esc(r.spec)}</td><td>${fmt(r.length)} × ${fmt(r.width)} mm</td><td>${fmt(r.units)}</td><td>${fmt(r.pieces)}</td><td class="text-right"><strong>${fmt(r.cutMeters,2)} m</strong></td></tr>`).join('')}<tr><td colspan="4"><strong>Total de chapas y mallas</strong></td><td class="text-right"><strong>${fmt(plates.reduce((n,r)=>n+r.cutMeters,0),2)} m</strong></td></tr></tbody></table></section>`:'';
 const tubeSection=tubes.length?`<section class="print-section"><h2>Tubos · cantidad de cortes</h2><table><thead><tr><th>Material</th><th>Formato comercial</th><th>Barras</th><th>Piezas</th><th class="text-right">Cortes</th></tr></thead><tbody>${tubes.map(r=>`<tr><td><strong>${esc(r.name)}</strong><br>${esc(r.spec)}</td><td>${fmt(r.length)} mm</td><td>${fmt(r.units)}</td><td>${fmt(r.pieces)}</td><td class="text-right"><strong>${fmt(r.cuts)}</strong></td></tr>`).join('')}<tr><td colspan="4"><strong>Total de tubos</strong></td><td class="text-right"><strong>${fmt(tubes.reduce((n,r)=>n+r.cuts,0))} cortes</strong></td></tr></tbody></table></section>`:'';
 return `<p>Resumen calculado desde los planos de esta orden. Incluye los despuntes configurados y las operaciones necesarias para separar piezas y sobrantes.</p>${plateSection}${tubeSection}`;
}

function printDocument(type){
 if(['plan','stock','cut-summary'].includes(type)&&!project.plan){toast('Primero calculá un plan de corte.');return;}
 const documentTitle={plan:'ORDEN DE CORTE',stock:'MATERIALES Y COMPRA','cut-summary':'RESUMEN DE METROS Y CORTES'}[type];
 const header=`<div class="print-header"><div><h1>MODELLWERK / CUT</h1><p>${esc(project.name)} · ${esc(project.reference)}</p></div><div>${documentTitle}<p>${new Date().toLocaleDateString('es-AR')}</p></div></div>`;
 let content='';
 if(type==='plan'){
  content=`<p><strong>GUÍA PARA EL OPERARIO:</strong> seguir el dibujo de cada patrón, completar la cantidad indicada e identificar los sobrantes marcados para stock.</p><p>Medidas en mm · Corte: ${project.settings.kerf} · Despunte por borde: ${project.settings.trim} · Verificar medidas y sujeción antes de fabricar.</p>${project.plan.rejected.length?`<p><strong>ATENCIÓN: ${project.plan.rejected.length} piezas fuera de formato NO incluidas en los planos: ${[...new Set(project.plan.rejected.map(p=>p.id))].map(esc).join(', ')}.</strong></p>`:''}`;
  for(const g of project.plan.groups){
   const m=project.materials.find(v=>v.id===g.material),patterns=m.kind==='tube'?groupBarPatterns(g.bins):groupPlatePatterns(g.bins);
   content+=`<section class="print-material-divider"><p>${m.kind==='tube'?'PERFILES / BARRAS':'PLACAS'} · NUEVO MATERIAL</p><h2>${esc(m.name)} · ${esc(m.spec)}</h2><p>${fmt(m.length)}${m.kind==='plate'?' × '+fmt(m.width):''} mm · COMENZAR EN PATRÓN 01</p></section>`;
   content+=patterns.map(pattern=>m.kind==='tube'?printBarPattern(pattern,m,patterns.length):printPlatePattern(pattern,m,patterns.length)).join('');
  }
 }else if(type==='stock'){
  content=`<section class="print-section"><h2>Compra de materia prima</h2><table><thead><tr><th>Material / formato</th><th>Cantidad a comprar</th><th>Presentación del proveedor</th><th>Paquetes a pedir</th></tr></thead><tbody>${project.materials.map(m=>{const g=groupFor(m),required=g?.required||0;return `<tr><td>${esc(m.name)} · ${esc(m.spec)}<br>${fmt(m.length)}${m.kind==='plate'?' × '+fmt(m.width):''} mm</td><td>${required} ${m.kind==='tube'?(required===1?'barra':'barras'):(required===1?'placa':'placas')}</td><td>Hasta ${m.bundle} unidades</td><td>${required?Math.ceil(required/m.bundle):0}</td></tr>`;}).join('')}</tbody></table></section><section class="print-section"><h2>Remanentes recuperables</h2><table><thead><tr><th>Código</th><th>Material</th><th>Dimensiones (mm)</th><th>Estado</th></tr></thead><tbody>${project.plan.groups.map(g=>{const m=project.materials.find(v=>v.id===g.material);return g.bins.map(b=>b.free.map((r,i)=>(m.kind==='tube'?r.w>=project.settings.reusable:Math.min(r.w,r.h)>=project.settings.reusable)?`<tr><td>R-${esc(b.id)}-${i+1}</td><td>${esc(m.spec)}</td><td>${fmt(r.w,1)}${m.kind==='plate'?' × '+fmt(r.h,1):''}</td><td>${project.completed.includes(b.id)?'Disponible':'Previsto'}</td></tr>`:'').join('')).join('');}).join('')}</tbody></table></section>`;
 }else content=cutSummaryDocument();
 document.querySelector('#print-root').innerHTML=header+content+'<div class="print-foot">MODELLWERK / CUT · Documento de fabricación · Compra y avance de la orden en el momento de emisión.</div>';
 if(document.querySelector('#modal').open)document.querySelector('#modal').close();window.print();
}

let submitting=false;
document.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.target;if(!form.checkValidity()){form.reportValidity();return;}if(submitting)return;submitting=true;
 const fd=new FormData(form),val=k=>String(fd.get(k)||'').trim(),num=k=>Number(val(k).replace(',','.'));
 try{
  if(form.id==='piece-form'){
   const old=form.dataset.id,m=project.materials.find(m=>m.id===val('material')),p={id:old||nextPieceId(),name:val('name'),material:m.id,length:num('length'),width:m.kind==='plate'?num('width'):0,qty:num('qty')};
   const next=structuredClone(project);if(old)next.pieces[next.pieces.findIndex(v=>v.id===old)]=p;else next.pieces.push(p);validateProject(next);project=next;document.querySelector('#modal').close();touch();toast('Pieza guardada.');
  }else if(form.id==='material-form'){
   const old=form.dataset.id,kind=val('kind'),section=val('section'),thickness=num('thickness'),width=num('width'),height=kind==='plate'?thickness:section==='round'?width:num('height');
   const previous=project.materials.find(v=>v.id===old);
   const m={id:old||'m-'+crypto.randomUUID().slice(0,8),kind,name:val('name'),spec:kind==='plate'?`Espesor ${thickness} mm`:section==='round'?`Ø ${width} × ${thickness} mm`:`${width} × ${height} × ${thickness} mm`,section,length:num('length'),width,height,thickness,stock:previous?.stock??0,bundle:num('bundle')};
   const next=structuredClone(project);if(old){if(project.pieces.some(p=>p.material===old)&&project.materials.find(v=>v.id===old).kind!==kind)throw new Error('El material tiene piezas asignadas. Creá otro material para cambiar entre tubo y placa.');next.materials[next.materials.findIndex(v=>v.id===old)]=m;}else next.materials.push(m);validateProject(next);project=next;ui.material=m.id;document.querySelector('#modal').close();touch();toast('Material guardado.');
  }else if(form.id==='settings-form'){
   const next=structuredClone(project);next.settings={kerf:num('kerf'),trim:num('trim'),reusable:num('reusable'),rotate:fd.has('rotate')};validateProject(next);project=next;touch();toast('Parámetros guardados. Volvé a optimizar.');
  }else if(form.id==='order-form'){
   const next=form.dataset.new==='true'?{version:1,name:val('name'),reference:val('reference'),demo:false,settings:{...project.settings},materials:fd.has('keep')?structuredClone(project.materials):[],pieces:[],completed:[],plan:null}:{...project,name:val('name'),reference:val('reference'),demo:false};
   validateProject(next);if(form.dataset.new==='true')archiveCurrent();project=next;ui.page='order';ui.material=project.materials[0]?.id;save();document.querySelector('#modal').close();render();toast('Orden guardada.');
  }else if(form.id==='import-project-form'){
   const file=fd.get('file');if(!file?.size)throw new Error('Seleccioná un archivo JSON.');if(file.size>5*1024*1024)throw new Error('El archivo supera 5 MB.');
   const next=hydrate(JSON.parse(await file.text()));next.demo=false;
   archiveCurrent();project=next;ui.page='order';ui.material=project.materials[0]?.id;save();document.querySelector('#modal').close();render();toast('Orden importada y validada.');
  }else if(form.id==='import-pieces-form'){
   const m=project.materials.find(m=>m.id===val('material')),next=structuredClone(project);let n=1;
   for(const line of val('rows').split(/\r?\n/).filter(l=>l.trim())){
    const cols=line.split(line.includes('\t')?'\t':';').map(s=>s.trim());if(cols.length!==4)throw new Error(`Fila ${n}: se esperan descripción, largo, ancho y cantidad.`);
    const [name,length,width,qty]=cols;next.pieces.push({id:nextPieceId(next),name,material:m.id,length:Number(length.replace(',','.')),width:m.kind==='plate'?Number(width.replace(',','.')):0,qty:Number(qty)});n++;
   }
   validateProject(next);project=next;document.querySelector('#modal').close();touch();toast((n-1)+' tipos de pieza agregados.');
  }
 }catch(err){const error=form.querySelector('#form-error');if(error)error.textContent=err instanceof SyntaxError?'El archivo no contiene JSON válido.':err.message;else toast(err.message);}finally{submitting=false;}
});
function nextPieceId(p=project){let i=1;while(p.pieces.some(v=>v.id==='P'+String(i).padStart(2,'0')))i++;return 'P'+String(i).padStart(2,'0');}
document.addEventListener('change',e=>{
 if(e.target.matches('input[data-bin]'))toggleBin(e.target.dataset.bin);
 if(e.target.id==='piece-material'){const plate=project.materials.find(m=>m.id===e.target.value)?.kind==='plate',f=document.querySelector('#piece-width-field');f.hidden=!plate;f.querySelector('input').disabled=!plate;f.querySelector('input').required=plate;}
 if(e.target.id==='material-kind'||e.target.id==='material-section'){const f=document.querySelector('#material-form'),plate=f.elements.kind.value==='plate',round=f.elements.section.value==='round';document.querySelector('#section-field').hidden=plate;document.querySelector('#material-height-field').hidden=plate||round;}
});
window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(nav.some(v=>v[0]===p)){ui.page=p;render();}});
document.querySelector('#modal').addEventListener('click',e=>{if(e.target===document.querySelector('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});

function registerTools(){
 const context=document.modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();
 const tools=[{name:'read_cut_order',title:'Leer orden de corte',description:'Devuelve los materiales, piezas, parámetros y resumen de la orden abierta, sin modificar datos.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input=>{if(!input||Object.keys(input).length)throw new Error('Esta consulta no acepta parámetros.');return {name:project.name,reference:project.reference,materials:project.materials,pieces:project.pieces,settings:project.settings,metrics:metrics(project,project.plan),planned:!!project.plan};}},
 {name:'calculate_cut_plan',title:'Calcular plan de corte',description:'Calcula el plan de la orden actual con los mismos parámetros que Optimizar corte y lo guarda en este dispositivo.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||Object.keys(input).length)throw new Error('Este cálculo no acepta parámetros.');const result=optimizeAction();return {success:true,...result,rejected:project.plan.rejected.length};}},
 {name:'navigate_cut_workspace',title:'Abrir espacio de trabajo',description:'Abre una sección de la orden. No cambia materiales, piezas ni avance.',inputSchema:{type:'object',properties:{section:{type:'string',enum:['order','plans','materials','documents','settings']}},required:['section'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||Object.keys(input).length!==1||!['order','plans','materials','documents','settings'].includes(input.section))throw new Error('Sección inválida.');navigate(input.section);return {section:ui.page};}}];
 for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
if(!restoreFailed)save();render();registerTools();
