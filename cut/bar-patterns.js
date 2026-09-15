// Presentation groups keep the original bins and assignments intact.
export function groupBarPatterns(bins){
 const patterns=new Map();
 for(const bin of bins){
  const key=JSON.stringify([bin.material,bin.remaining,bin.parts.map(p=>[p.x,p.length,p.cut])]);
  if(!patterns.has(key))patterns.set(key,{id:bin.id,index:patterns.size+1,representative:bin,bins:[]});
  patterns.get(key).bins.push(bin);
 }
 return [...patterns.values()];
}

export function groupPlatePatterns(bins){
 const patterns=new Map();
 for(const bin of bins){
  const parts=bin.parts.map(p=>[p.x,p.y,p.w,p.h,p.split,p.region?.x,p.region?.y,p.region?.w,p.region?.h]);
  const free=bin.free.map(r=>[r.x,r.y,r.w,r.h]);
  const key=JSON.stringify([bin.material,parts,free]);
  if(!patterns.has(key))patterns.set(key,{id:bin.id,index:patterns.size+1,representative:bin,bins:[]});
  patterns.get(key).bins.push(bin);
 }
 return [...patterns.values()];
}

export function patternPieces(pattern){
 const rows=new Map();
 for(const bin of pattern.bins)for(const part of bin.parts){
  const key=JSON.stringify([part.id,part.length,part.width]);
  if(!rows.has(key))rows.set(key,{...part,count:0});
  rows.get(key).count++;
 }
 return [...rows.values()];
}

export function patternProgress(pattern,completed){
 const done=new Set(completed);
 return {
  completed:pattern.bins.filter(b=>done.has(b.id)),
  available:pattern.bins.filter(b=>!done.has(b.id)),
  missing:[],
  total:pattern.bins.length
 };
}

export function barNumbers(bins){
 const values=[...new Set(bins.map(b=>b.index))].sort((a,b)=>a-b),ranges=[];
 const label=n=>'B'+String(n).padStart(2,'0');
 for(let i=0;i<values.length;i++){
  const start=values[i];let end=start;
  while(values[i+1]===end+1)end=values[++i];
  ranges.push(start===end?label(start):label(start)+'–'+label(end));
 }
 return ranges.join(', ');
}

export function plateNumbers(bins){
 const values=[...new Set(bins.map(b=>b.index))].sort((a,b)=>a-b),ranges=[];
 const label=n=>'PL'+String(n).padStart(2,'0');
 for(let i=0;i<values.length;i++){
  const start=values[i];let end=start;
  while(values[i+1]===end+1)end=values[++i];
  ranges.push(start===end?label(start):label(start)+'–'+label(end));
 }
 return ranges.join(', ');
}

