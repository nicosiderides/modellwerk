export const PALETTE = ['#df754d','#538b97','#b6a16c','#8c91b1','#80a38b','#bf8589','#8babbc','#ab9ac1'];
export function demoProject(){return {version:1,name:'Estructura modular',reference:'OT-024',demo:true,settings:{kerf:3,trim:10,reusable:300,rotate:true},materials:[
 {id:'m1',name:'Tubo rectangular',spec:'80 × 40 × 2 mm',kind:'tube',length:6000,width:80,height:40,thickness:2,stock:16,bundle:8},
 {id:'m2',name:'Tubo cuadrado',spec:'40 × 40 × 2 mm',kind:'tube',length:6000,width:40,height:40,thickness:2,stock:10,bundle:5},
 {id:'m3',name:'Placa de acero',spec:'Espesor 3 mm',kind:'plate',length:3000,width:1500,height:3,thickness:3,stock:4,bundle:2}],pieces:[
 {id:'P01',name:'Larguero principal',material:'m1',length:2400,width:0,qty:12},
 {id:'P02',name:'Travesaño',material:'m1',length:1800,width:0,qty:12},
 {id:'P03',name:'Montante corto',material:'m1',length:950,width:0,qty:12},
 {id:'P04',name:'Refuerzo',material:'m1',length:650,width:0,qty:12},
 {id:'P05',name:'Parante lateral',material:'m2',length:2700,width:0,qty:8},
 {id:'P06',name:'Unión horizontal',material:'m2',length:1100,width:0,qty:16},
 {id:'P07',name:'Platina de apoyo',material:'m3',length:400,width:300,qty:16},
 {id:'P08',name:'Panel de unión',material:'m3',length:800,width:450,qty:8}],completed:[],plan:null};}

export function validateProject(p){
 const fail=m=>{throw new Error(m)};
 const num=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
 const str=x=>typeof x==='string'&&x.trim().length>0&&x.length<=120;
 if(!p||p.version!==1||!str(p.name)||!str(p.reference))fail('El archivo no contiene una orden CUT válida.');
 if(!Array.isArray(p.materials)||!Array.isArray(p.pieces)||p.materials.length>60||p.pieces.length>300)fail('Máximo: 60 materiales y 300 tipos de pieza.');
 const s=p.settings;
 if(!s||!num(s.kerf,0,30)||!num(s.trim,0,500)||!num(s.reusable,0,10000)||typeof s.rotate!=='boolean')fail('Revisá los parámetros de corte.');
 const ids=new Set();
 for(const m of p.materials){
  if(!str(m.id)||!/^[-A-Za-z0-9_]{1,80}$/.test(m.id)||ids.has(m.id)||!str(m.name)||!str(m.spec)||!['tube','plate'].includes(m.kind)||!['rect','round',undefined].includes(m.section))fail('Hay un material inválido o duplicado.');
  ids.add(m.id);
  if(m.stock===undefined)m.stock=0;
  if(!num(m.length,1,30000)||!num(m.width,1,10000)||!num(m.height,0.1,10000)||!num(m.thickness,0.1,1000)||!num(m.stock,0,10000)||!Number.isInteger(m.stock)||!num(m.bundle,1,500)||!Number.isInteger(m.bundle))fail('Revisá las medidas y la presentación de '+m.name+'.');
  if(m.length<=2*s.trim||(m.kind==='plate'&&m.width<=2*s.trim))fail('El despunte supera las dimensiones de '+m.name+'.');
  if(m.kind==='tube'&&m.thickness*2>=Math.min(m.width,m.height))fail('El espesor del tubo debe dejar un interior hueco.');
  if(m.kind==='tube'&&m.section==='round'&&m.width!==m.height)fail('El diámetro del tubo redondo debe ser uniforme.');
 }
 let total=0;ids.clear();
 for(const piece of p.pieces){
  if(!str(piece.id)||!/^[-A-Za-z0-9_]{1,80}$/.test(piece.id)||ids.has(piece.id)||!str(piece.name)||!p.materials.some(m=>m.id===piece.material)||!num(piece.length,1,30000)||!num(piece.width,0,10000)||!num(piece.qty,1,1000)||!Number.isInteger(piece.qty))fail('Revisá las medidas, material y cantidad de cada pieza.');
  if(p.materials.find(m=>m.id===piece.material).kind==='plate'&&piece.width<=0)fail('Las piezas de placa necesitan un ancho mayor a cero.');
  ids.add(piece.id);total+=piece.qty;
 }
 if(total>3000)fail('Esta orden admite hasta 3.000 piezas. Dividí la producción en órdenes menores.');
 return p;
}

export function signature(p){return JSON.stringify({materials:p.materials,pieces:p.pieces,settings:p.settings});}
const expand=rows=>rows.flatMap((p,color)=>Array.from({length:p.qty},(_,i)=>({...p,unit:i+1,color:PALETTE[color%PALETTE.length]})));

function tubes(items,m,s){
 const capacity=m.length-2*s.trim;
 const rejected=items.filter(p=>p.length>capacity).map(p=>({...p,reason:'Supera el largo útil de la barra'}));
 const valid=items.filter(p=>p.length<=capacity);
 let best=[];
 for(const strategy of ['best','first']){
  const bins=[];
  for(const piece of [...valid].sort((a,b)=>b.length-a.length)){
   let candidates=bins.filter(b=>b.remaining>=piece.length);
   if(strategy==='best')candidates.sort((a,b)=>a.remaining-b.remaining);
   let bin=candidates[0];
   // A full usable-length part can end at the prepared stock edge with no separating cut.
   if(!bin){bin={parts:[],remaining:capacity,used:0,kerf:0};bins.push(bin);}
   const saw=Math.min(s.kerf,bin.remaining-piece.length);
   bin.parts.push({...piece,x:s.trim+bin.used,y:0,rotated:false,cut:saw});
   bin.used+=piece.length+saw;bin.kerf+=saw;bin.remaining-=piece.length+saw;
  }
  if(!best.length||bins.length<best.length)best=bins;
 }
 return {bins:best.map(b=>({...b,free:b.remaining>0?[{x:s.trim+b.used,y:0,w:b.remaining,h:m.height}]:[],area:b.parts.reduce((a,p)=>a+p.length,0)})),rejected};
}

function plates(items,m,s){
 const W=m.length-2*s.trim,H=m.width-2*s.trim;
 const fits=p=>(p.length<=W&&p.width<=H)||(s.rotate&&p.width<=W&&p.length<=H);
 const rejected=items.filter(p=>!fits(p)).map(p=>({...p,reason:'No entra en la placa útil'}));
 let best;
 for(const strategy of ['area','long','short'])for(const split of ['horizontal','vertical']){
  const bins=[];
  const key=p=>strategy==='area'?p.length*p.width:strategy==='long'?Math.max(p.length,p.width):Math.min(p.length,p.width);
  for(const piece of items.filter(fits).sort((a,b)=>key(b)-key(a))){
   let candidate;
   const scan=(bin,bi)=>bin.free.forEach((r,ri)=>{
    for(const rotated of s.rotate?[false,true]:[false]){
     const w=rotated?piece.width:piece.length,h=rotated?piece.length:piece.width;
     if(w>r.w||h>r.h)continue;
     const score=r.w*r.h-w*h;
     if(!candidate||score<candidate.score)candidate={bi,ri,r,w,h,rotated,score};
    }
   });
   bins.forEach(scan);
   if(!candidate){bins.push({free:[{x:s.trim,y:s.trim,w:W,h:H}],parts:[],kerf:0});scan(bins.at(-1),bins.length-1);}
   const {bi,ri,r,w,h,rotated}=candidate,bin=bins[bi];
   bin.free.splice(ri,1);
   const dx=Math.min(s.kerf,r.w-w),dy=Math.min(s.kerf,r.h-h);
   const right=r.w-w-dx,bottom=r.h-h-dy;
   const horizontal=split==='horizontal';
   const newFree=horizontal?[{x:r.x+w+dx,y:r.y,w:right,h:h},{x:r.x,y:r.y+h+dy,w:r.w,h:bottom}]:[{x:r.x+w+dx,y:r.y,w:right,h:r.h},{x:r.x,y:r.y+h+dy,w:w,h:bottom}];
   bin.free.push(...newFree.filter(v=>v.w>0&&v.h>0));
   bin.kerf+=r.w*r.h-w*h-newFree.reduce((a,f)=>a+f.w*f.h,0);
   bin.parts.push({...piece,x:r.x,y:r.y,w,h,rotated,region:{...r},split});
  }
  const largest=bins.reduce((a,b)=>a+Math.max(0,...b.free.map(r=>r.w*r.h)),0);
  if(!best||bins.length<best.bins.length||(bins.length===best.bins.length&&largest>best.largest))best={bins,largest};
 }
 return {bins:best.bins.map(b=>({...b,area:b.parts.reduce((a,p)=>a+p.length*p.width,0)})),rejected};
}

export function optimize(p){
 validateProject(p);
 if(!p.pieces.length)throw new Error('Agregá al menos una pieza para optimizar.');
 const expanded=expand(p.pieces),groups=[],rejected=[];
 for(const m of p.materials){
  const items=expanded.filter(i=>i.material===m.id);if(!items.length)continue;
  const result=m.kind==='tube'?tubes(items,m,p.settings):plates(items,m,p.settings);
  const bins=result.bins.map((b,i)=>({...b,id:m.id+'-'+(i+1),material:m.id,index:i+1,utilization:100*b.area/(m.length*(m.kind==='plate'?m.width:1))}));
  groups.push({material:m.id,bins,required:bins.length,shortage:0});rejected.push(...result.rejected);
 }
 return {signature:signature(p),created:new Date().toISOString(),groups,rejected};
}

export function metrics(p,plan){
 let useful=0,gross=0,reusable=0,tubes=0,plates=0,cutPieces=0;
 for(const g of plan?.groups||[]){
  const m=p.materials.find(v=>v.id===g.material);
  const factor=m.kind==='tube'?(m.section==='round'?Math.PI/4*(m.width*m.width-(m.width-2*m.thickness)**2):m.width*m.height-(m.width-2*m.thickness)*(m.height-2*m.thickness)):m.thickness;
  for(const b of g.bins){
   gross+=m.length*(m.kind==='plate'?m.width:1)*factor;
   useful+=b.area*factor;
   reusable+=b.free.filter(f=>m.kind==='tube'?f.w>=p.settings.reusable:Math.min(f.w,f.h)>=p.settings.reusable).length;
   if(p.completed.includes(b.id))cutPieces+=b.parts.length;
  }
  if(m.kind==='tube')tubes+=g.bins.length;else plates+=g.bins.length;
 }
 return {pieces:p.pieces.reduce((a,v)=>a+v.qty,0),tubes,plates,utilization:gross?useful/gross*100:0,reusable,cutPieces,weight:gross*0.00000785,shortage:0};
}

