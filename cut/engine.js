export const PALETTE = ['#df754d','#538b97','#b6a16c','#8c91b1','#80a38b','#bf8589','#8babbc','#ab9ac1'];
export const MAX_PIECES = 15000;
export const MAX_PIECE_QTY = 15000;
const LARGE_ORDER_THRESHOLD = 3000;
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
  if(!str(piece.id)||!/^[-A-Za-z0-9_]{1,80}$/.test(piece.id)||ids.has(piece.id)||!str(piece.name)||!p.materials.some(m=>m.id===piece.material)||!num(piece.length,1,30000)||!num(piece.width,0,10000)||!num(piece.qty,1,MAX_PIECE_QTY)||!Number.isInteger(piece.qty))fail('Revisá las medidas, material y cantidad de cada pieza.');
  if(p.materials.find(m=>m.id===piece.material).kind==='plate'&&piece.width<=0)fail('Las piezas de placa necesitan un ancho mayor a cero.');
  ids.add(piece.id);total+=piece.qty;
 }
 if(total>MAX_PIECES)fail('Esta orden admite hasta 15.000 piezas. Dividí la producción en órdenes menores.');
 return p;
}

export function signature(p){return JSON.stringify({materials:p.materials,pieces:p.pieces,settings:p.settings});}
const expand=rows=>rows.flatMap((p,color)=>Array.from({length:p.qty},(_,i)=>({...p,unit:i+1,color:PALETTE[color%PALETTE.length]})));

function fastTubeBins(items,capacity,s){
 let base=1;while(base<items.length)base*=2;
 const tree=new Float64Array(base*2),bins=[];
 const update=(index,value)=>{let node=base+index;tree[node]=value;while(node>1){node=Math.floor(node/2);tree[node]=Math.max(tree[node*2],tree[node*2+1]);}};
 const firstAtLeast=value=>{
  if(tree[1]<value)return -1;
  let node=1;while(node<base){node*=2;if(tree[node]<value)node++;}
  return node-base;
 };
 for(const piece of [...items].sort((a,b)=>b.length-a.length)){
  let index=firstAtLeast(piece.length),bin;
  if(index<0){index=bins.length;bin={parts:[],remaining:capacity,used:0,kerf:0};bins.push(bin);}else bin=bins[index];
  const saw=Math.min(s.kerf,bin.remaining-piece.length);
  bin.parts.push({...piece,x:s.trim+bin.used,y:0,rotated:false,cut:saw});
  bin.used+=piece.length+saw;bin.kerf+=saw;bin.remaining-=piece.length+saw;
  update(index,bin.remaining);
 }
 return bins;
}

function tubes(items,m,s){
 const capacity=m.length-2*s.trim;
 const rejected=items.filter(p=>p.length>capacity).map(p=>({...p,reason:'Supera el largo útil de la barra'}));
 const valid=items.filter(p=>p.length<=capacity);
 let best=[];
 if(valid.length>LARGE_ORDER_THRESHOLD)best=fastTubeBins(valid,capacity,s);
 else for(const strategy of ['best','first']){
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

function shelfPlateBins(items,m,s,orientation){
 const W=m.length-2*s.trim,H=m.width-2*s.trim,right=s.trim+W,bottom=s.trim+H;
 const orient=piece=>{
  const variants=[{w:piece.length,h:piece.width,rotated:false},...(s.rotate&&piece.length!==piece.width?[{w:piece.width,h:piece.length,rotated:true}]:[])].filter(v=>v.w<=W&&v.h<=H);
  variants.sort((a,b)=>orientation==='wide'?a.h-b.h||b.w-a.w:a.w-b.w||b.h-a.h);
  return variants[0];
 };
 const prepared=items.map(piece=>({piece,fit:orient(piece)})).filter(v=>v.fit).map(({piece,fit})=>({...piece,...fit})).sort((a,b)=>b.h-a.h||b.w-a.w);
 const bins=[];let bin,row;
 const newBin=()=>{bin={parts:[],rows:[],kerf:0};bins.push(bin);row=null;};
 const newRow=height=>{
  const y=row?row.y+row.height+s.kerf:s.trim;
  if(y+height>bottom)return false;
  row={x:s.trim,y,height,count:0};bin.rows.push(row);return true;
 };
 for(const piece of prepared){
  if(!bin)newBin();
  if(!row||row.x+piece.w>right){
   if(!newRow(piece.h)){newBin();newRow(piece.h);}
  }
  const firstInRow=row.count===0,region={x:row.x,y:row.y,w:right-row.x,h:firstInRow?bottom-row.y:row.height};
  bin.parts.push({...piece,x:row.x,y:row.y,region,split:firstInRow?'horizontal':'vertical'});
  row.x+=piece.w+s.kerf;row.count++;
 }
 for(const b of bins){
  const free=b.rows.map(r=>({x:r.x,y:r.y,w:Math.max(0,right-r.x),h:r.height})).filter(r=>r.w>0&&r.h>0);
  const last=b.rows.at(-1),y=last?last.y+last.height+s.kerf:s.trim;
  if(y<bottom)free.push({x:s.trim,y,w:W,h:bottom-y});
  b.free=free;b.area=b.parts.reduce((a,p)=>a+p.length*p.width,0);delete b.rows;
 }
 return bins;
}

function plates(items,m,s){
 const W=m.length-2*s.trim,H=m.width-2*s.trim;
 const fits=p=>(p.length<=W&&p.width<=H)||(s.rotate&&p.width<=W&&p.length<=H);
 const rejected=items.filter(p=>!fits(p)).map(p=>({...p,reason:'No entra en la placa útil'}));
 if(items.length>LARGE_ORDER_THRESHOLD){
  const valid=items.filter(fits),candidates=['wide','tall'].map(mode=>shelfPlateBins(valid,m,s,mode));
  candidates.sort((a,b)=>a.length-b.length||b.reduce((n,v)=>n+Math.max(0,...v.free.map(r=>r.w*r.h)),0)-a.reduce((n,v)=>n+Math.max(0,...v.free.map(r=>r.w*r.h)),0));
  return {bins:candidates[0],rejected};
 }
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
 return {signature:signature(p),created:new Date().toISOString(),mode:expanded.length>LARGE_ORDER_THRESHOLD?'large':'standard',groups,rejected};
}

function tubeCuts(bin,trim){
 if(!bin.parts.length)return 0;
 const preparedEnds=trim>0?2:0;
 const betweenPieces=Math.max(0,bin.parts.length-1);
 const separatesRemnant=bin.remaining>1e-9?1:0;
 return preparedEnds+betweenPieces+separatesRemnant;
}

function plateCutMillimeters(bin,m,trim){
 let total=trim>0?2*(m.length+m.width)-4*trim:0;
 for(const part of bin.parts){
  const hasRight=part.region.w-part.w>1e-9,hasBottom=part.region.h-part.h>1e-9;
  if(part.split==='horizontal'){
   if(hasBottom)total+=part.region.w;
   if(hasRight)total+=part.h;
  }else{
   if(hasRight)total+=part.region.h;
   if(hasBottom)total+=part.w;
  }
 }
 return total;
}

export function cutReport(p,plan){
 if(!plan)return [];
 return plan.groups.map(group=>{
  const material=p.materials.find(m=>m.id===group.material);
  const pieces=group.bins.reduce((n,bin)=>n+bin.parts.length,0);
  const cuts=material.kind==='tube'?group.bins.reduce((n,bin)=>n+tubeCuts(bin,p.settings.trim),0):null;
  const cutMeters=material.kind==='plate'?group.bins.reduce((n,bin)=>n+plateCutMillimeters(bin,material,p.settings.trim),0)/1000:null;
  return {material:material.id,name:material.name,spec:material.spec,kind:material.kind,length:material.length,width:material.width,units:group.bins.length,pieces,cuts,cutMeters};
 });
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
