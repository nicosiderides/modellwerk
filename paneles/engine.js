export const clone = value => structuredClone(value);
const sum = list => list.reduce((a,b)=>a+b,0);
const ceil = n => Math.ceil(n - 1e-10);
function number(v, name, min=0, max=1e12, integer=false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v<min || v>max || (integer&&!Number.isInteger(v))) throw Error(`${name}: ingresá ${integer?'un entero':'un número'} entre ${min} y ${max}.`);
}
function text(v, name) { if(typeof v!=='string'||!v.trim()||v.length>500)throw Error(`${name}: completá un texto de hasta 500 caracteres.`); }
export function validate(s) {
  if(!s||s.version!==1||!s.settings)throw Error('El archivo no es un modelo de paneles válido.');
  text(s.name,'Nombre del proyecto');
  const g=s.settings;
  number(g.exchange,'Tipo de cambio',0.000001);
  for(const k of ['vat','iibb','otherTax','overhead','contingency'])number(g[k],k,0,10);
  number(g.freight,'Flete');number(g.margin,'Margen',0,.9999);
  if(!['supplier','theoretical'].includes(g.weightBasis))throw Error('Criterio de peso no válido.');
  for(const k of ['panels','materials','quotes','pieces']) {
    if(!Array.isArray(s[k])||s[k].length>10000)throw Error(`Lista ${k} no válida.`);
    const ids=new Set();for(const o of s[k]){text(o.id,'Identificador');if(ids.has(o.id))throw Error('Hay identificadores duplicados.');ids.add(o.id);}
  }
  if(!s.materials.length||!s.panels.length)throw Error('Se necesita al menos un material y una tipología.');
  for(const p of s.panels){text(p.name,'Panel');number(p.quantity,'Cantidad de paneles',0,1e7,true);}
  for(const q of s.quotes){text(q.supplier,'Proveedor');if(!s.materials.some(m=>m.id===q.materialId))throw Error('Cotización sin material.');if(!['ARS','USD'].includes(q.currency))throw Error('Moneda no válida.');number(q.price,'Precio');if(typeof q.eligible!=='boolean')throw Error('Elegibilidad no válida.');}
  for(const m of s.materials){
    text(m.name,'Material');if(!['tube','sheet'].includes(m.type))throw Error('Tipo de material no válido.');
    for(const k of ['width','height','thickness','density'])number(m[k],k,.000001);
    if(m.type==='tube'&&m.thickness*2>=Math.min(m.width,m.height))throw Error('El espesor debe ser menor que la mitad del lado del tubo.');
    number(m.supplierWeight,'Peso proveedor',.000001);number(m.stockLength,'Largo comercial',m.type==='tube'?.000001:0);
    number(m.manualQuantity,'Compra manual',0,1e9,true);number(m.waste,'Desperdicio',0,10);
    if(!['auto','manual'].includes(m.purchaseMode)||!['net','units'].includes(m.allocation))throw Error('Modo de compra o reparto no válido.');
    if(m.type==='tube'&&m.allocation==='units')throw Error('En tubos, el reparto se realiza por consumo neto.');
    if(!s.quotes.some(q=>q.id===m.quoteId&&q.materialId===m.id&&q.eligible))throw Error(`Seleccioná una cotización apta para ${m.name}.`);
  }
  for(const p of s.pieces){
    const m=s.materials.find(m=>m.id===p.materialId);
    if(!m||!s.panels.some(a=>a.id===p.panelId))throw Error('Hay una pieza sin panel o material.');
    text(p.name,'Componente');number(p.length,'Largo',.000001,1e7);number(p.height,'Alto',m.type==='sheet'?.000001:0,1e7);number(p.quantity,'Cantidad por panel',0,1e7,true);
  }
  return s;
}
export function calculate(s) {
  validate(s);
  const g=s.settings,warnings=[];
  const materials=s.materials.map(m=>{
    const theoreticalWeight=m.type==='tube'?(m.width*m.height-(m.width-2*m.thickness)*(m.height-2*m.thickness))*m.density/1e6:m.thickness*m.density/1000;
    const unitWeight=g.weightBasis==='supplier'?m.supplierWeight:theoreticalWeight;
    const stockSize=m.type==='tube'?m.stockLength:m.width*m.height/1e6;
    const quote=s.quotes.find(q=>q.id===m.quoteId);
    return {...m,unitWeight,theoreticalWeight,stockSize,quote,unit:m.type==='tube'?'m':'m²',unitPrice:quote.price*(quote.currency==='USD'?g.exchange:1)};
  });
  const pieces=s.pieces.map(p=>{
    const m=materials.find(m=>m.id===p.materialId);
    const consumption=p.length*(m.type==='sheet'?p.height:1)/ (m.type==='sheet'?1e6:1000)*p.quantity;
    const units=m.type==='sheet'?ceil(consumption/m.stockSize):0;
    const fits=m.type==='tube'?p.length<=m.stockLength*1000:((p.length<=m.width&&p.height<=m.height)||(p.height<=m.width&&p.length<=m.height));
    const active=s.panels.find(t=>t.id===p.panelId).quantity>0&&p.quantity>0;
    if(!fits&&active)warnings.push(`${s.panels.find(t=>t.id===p.panelId).name}: ${p.name} excede el formato de ${m.name}. Revisá el despiece.`);
    return {...p,consumption,units,weight:consumption*m.unitWeight,unit:m.unit,fits};
  });
  const panels=s.panels.map(p=>{
    const parts=pieces.filter(r=>r.panelId===p.id);
    return {...p,parts,weight:sum(parts.map(r=>r.weight)),consumption:Object.fromEntries(materials.map(m=>[m.id,sum(parts.filter(r=>r.materialId===m.id).map(r=>r.consumption))])),units:Object.fromEntries(materials.map(m=>[m.id,sum(parts.filter(r=>r.materialId===m.id).map(r=>r.units))]))};
  });
  for(const m of materials){
    m.netConsumption=sum(panels.map(p=>p.consumption[m.id]*p.quantity));
    m.requiredUnits=sum(panels.map(p=>p.units[m.id]*p.quantity));
    m.autoPurchase=ceil((m.type==='tube'?m.netConsumption/m.stockSize:m.requiredUnits)*(1+m.waste));
    m.purchase=m.purchaseMode==='manual'?m.manualQuantity:m.autoPurchase;
    m.gross=m.purchase*m.stockSize;m.netWeight=m.netConsumption*m.unitWeight;m.purchasedWeight=m.gross*m.unitWeight;
    m.excess=m.netConsumption?m.gross/m.netConsumption-1:0;
    m.yield=m.gross?m.netConsumption/m.gross:0;m.cost=m.purchase*m.unitPrice;
    m.driver=m.allocation==='net'?m.netConsumption:m.requiredUnits;
    if(m.purchase<m.autoPurchase)warnings.push(`${m.name}: compra de ${m.purchase} unidades; el modelo requiere ${m.autoPurchase}.`);
  }
  const net=sum(materials.map(m=>m.cost)),taxes=net*(g.vat+g.iibb+g.otherTax),freight=g.freight;
  const overhead=(net+taxes+freight)*g.overhead,contingency=(net+taxes+freight+overhead)*g.contingency;
  const final=net+taxes+freight+overhead+contingency,sale=final/(1-g.margin);
  for(const p of panels){
    p.breakdown=materials.map(m=>({id:m.id,cost:m.driver?m.cost*(m.allocation==='net'?p.consumption[m.id]:p.units[m.id])/m.driver:0}));
    p.net=sum(p.breakdown.map(r=>r.cost));p.projectNet=p.net*p.quantity;
    p.usd=p.net/g.exchange;p.usdKg=p.weight?p.usd/p.weight:0;
    p.final=net?p.net*final/net:0;p.sale=net?p.net*sale/net:0;
  }
  const allocated=sum(panels.map(p=>p.projectNet)),unallocated=net-allocated;
  if(Math.abs(unallocated)>.01)warnings.push(`Hay compras sin consumo asignado. Revisá las cantidades manuales de materiales no utilizados.`);
  const count=sum(panels.map(p=>p.quantity)),weight=sum(panels.map(p=>p.weight*p.quantity)),purchasedWeight=sum(materials.map(m=>m.purchasedWeight));
  if(!count)warnings.push('No hay paneles activos. Indicá una cantidad mayor que cero para presupuestar.');
  return {panels,materials,pieces,warnings,net,taxes,freight,overhead,contingency,final,sale,count,weight,purchasedWeight,yield:purchasedWeight?weight/purchasedWeight:0,unallocated,usd:net/g.exchange};
}
export function csv(rows) { return '\ufeff'+rows.map(row=>row.map(v=>{let s=String(v??'');if(typeof v==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(';')).join('\r\n'); }
