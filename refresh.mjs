import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createGunzip} from 'node:zlib';
import {Readable} from 'node:stream';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
export function time(value){const m=/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s+([+-])(\d{2})(\d{2})$/.exec(value||'');return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])-(m[7]==='+'?1:-1)*(+m[8]*60+ +m[9])*60000:NaN;}
const decode=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):+n)).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export function useful(title){return !!title?.trim()&&!/^(?:no data|no information|no (?:programme?|event)(?: information| available| today)?|channel no longer available|off[ -]?air|sign[ -]?off|tba|to be announced)$/i.test(title.trim());}
export function programme(raw,now){const attrs=Object.fromEntries([...raw.slice(0,raw.indexOf('>')).matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]])),start=time(attrs.start),end=time(attrs.stop),title=decode(/<title\b[^>]*>([\s\S]*?)<\/title>/.exec(raw)?.[1]||'').trim();return Number.isFinite(start)&&end>start&&end>now-3600000&&start<now+48*3600000&&title.length<=1000&&useful(title)?{start,end,title}:null;}
export async function extract(stream,mappings,now=Date.now()){
 const ids=new Map(mappings.map(m=>[m.id,[]]));let buffer='',bytes=0;stream.setEncoding('utf8');
 for await(const chunk of stream){bytes+=Buffer.byteLength(chunk);if(bytes>2e9)throw Error('Feed exceeds safety limit');buffer+=chunk;let end;while((end=buffer.indexOf('</programme>'))>=0){const start=buffer.indexOf('<programme'),raw=start>=0?buffer.slice(start,end+12):'';buffer=buffer.slice(end+12);const id=/\bchannel="([^"]+)"/.exec(raw)?.[1];if(!ids.has(id))continue;const p=programme(raw,now);if(p&&ids.get(id).length<1000)ids.get(id).push(p);}if(buffer.length>5000000)throw Error('Oversized XML block');}
 return ids;
}
export async function refresh({root=path.dirname(fileURLToPath(import.meta.url)),fetcher=fetch,now=Date.now()}={}){
 const config=JSON.parse(await readFile(path.join(root,'channels.json'),'utf8')),output=path.join(root,'public/guides'),results=[];await mkdir(output,{recursive:true});
 const save=async(file,data)=>{await writeFile(file+'.tmp',JSON.stringify(data));await rename(file+'.tmp',file);};
 for(const feed of config.feeds){const mappings=config.channels.flatMap(c=>[...(c.feed===feed.name?[c]:[]),...(c.fallbacks||[]).filter(f=>f.feed===feed.name).map(f=>({...c,id:f.id}))]);let byId,error;
  try{const response=await fetcher(feed.url,{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('HTTP '+response.status);const source=Readable.fromWeb(response.body),stream=feed.gzip?source.pipe(createGunzip()):source;byId=await extract(stream,mappings,now);}catch(e){error=e.message;}
  for(const m of mappings){if(results.some(r=>r.channel===m.number&&r.status==='updated'))continue;const previousIndex=results.findIndex(r=>r.channel===m.number);if(previousIndex>=0)results.splice(previousIndex,1);const file=path.join(output,m.number+'.json'),fresh=(byId?.get(m.id)||[]).sort((a,b)=>a.start-b.start);let payload,status='updated';
   if(fresh.some(p=>p.end>now))payload={version:1,channel:m.number,title:m.title,sourceId:config.channels.find(c=>c.number===m.number).id,upstreamSourceId:m.id,region:m.region,generatedAt:now,programmes:fresh};
   else{try{const old=JSON.parse(await readFile(file,'utf8'));if(old.channel===m.number&&[m.id,...(config.channels.find(c=>c.number===m.number)?.fallbacks||[]).map(f=>f.id),config.channels.find(c=>c.number===m.number)?.id].includes(old.sourceId)&&Array.isArray(old.programmes)&&old.programmes.some(p=>p.end>now&&useful(p.title))){payload=old;status='retained';}}catch{}}
   if(payload){if(status==='updated')await save(file,payload);results.push({channel:m.number,title:m.title,status,until:new Date(Math.max(...payload.programmes.map(p=>p.end))).toISOString(),...(error?{error}:{})});}else results.push({channel:m.number,title:m.title,status:'unavailable',error:error||'No current listings'});
  }
 }
 const report={version:1,generatedAt:now,total:config.channels.length,updated:results.filter(r=>r.status==='updated').length,retained:results.filter(r=>r.status==='retained').length,available:results.filter(r=>r.status!=='unavailable').length,channels:results};
 // Publish healthy channels independently; expired guides are never represented as current.
 report.degraded=report.available<config.channels.length;for(const feed of config.feeds){const rows=results.filter(r=>config.channels.find(c=>c.number===r.channel)?.feed===feed.name);console.log(JSON.stringify({feed:feed.name,current:rows.filter(r=>r.status!=='unavailable').length,total:rows.length,errors:[...new Set(rows.map(r=>r.error).filter(Boolean))]}));}if(!report.available)throw Error('Guide refresh rejected: '+JSON.stringify({updated:report.updated,available:report.available,total:report.total}));
 await save(path.join(root,'public/status.json'),report);await save(path.join(root,'public/manifest.json'),{version:1,generatedAt:now,channels:results.filter(r=>r.status!=='unavailable').map(r=>r.channel)});console.log(JSON.stringify({updated:report.updated,retained:report.retained,available:report.available,total:report.total}));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await refresh();

