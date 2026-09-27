// Resolve Google Maps sharing links. No credentials, cookies or location logs.
const ORIGIN='https://almosheqh100-glitch.github.io';
export default { async fetch(request) {
 const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(request.headers.get('Origin')!==ORIGIN)return reply({error:'origin'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'method'},405);
 if(new URL(request.url).pathname!=='/resolve')return reply({error:'path'},404);
 try{
  const raw=await request.text();if(raw.length>10000)return reply({error:'length'},413);
  const body=JSON.parse(raw);let url=mapURL(body.url);if(!url)return reply({error:'unsupported'},400);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try{
   for(let i=0;i<6;i++){
    const known=parseMapInput(url.href);if(Number.isFinite(known.lat))return reply(known);
    const response=await fetch(url.href,{redirect:'manual',signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'en'}});
    if(response.status>=300&&response.status<400){
      const location=response.headers.get('Location');await response.body?.cancel();
      const next=location&&mapURL(new URL(location,url).href);if(!next)return reply({error:'redirect'},422);url=next;continue;
    }
    if(!response.ok){await response.body?.cancel();return reply({error:'upstream'},502);}
    // Only structured page metadata, never arbitrary suggested-place coordinates.
    const reader=response.body.getReader();let size=0,chunks=[];const decoder=new TextDecoder();
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1500000){await reader.cancel();break;}chunks.push(decoder.decode(part.value,{stream:true}));}
    const page=chunks.join('');
    const metas=page.match(/<(?:meta|link)\b[^>]*>/gi)||[];
    for(const tag of metas){
      if(!/(?:property=["']og:url["']|rel=["']canonical["'])/i.test(tag))continue;
      const m=tag.match(/(?:content|href)=["']([^"']+)["']/i);if(!m)continue;
      const candidate=mapURL(m[1]);if(!candidate)continue;
      const point=parseMapInput(candidate.href);if(Number.isFinite(point.lat))return reply(point);
    }
    return reply({error:'unresolved'},422);
   }
   return reply({error:'redirects'},422);
  }finally{clearTimeout(timer);}
 }catch(e){return reply({error:e.name==='AbortError'?'timeout':'invalid'},400);}
}};

function mapURL(value) {
  var m=String(value).replace(/&amp;/g,'&').match(/https?:\/\/[^\s<>"]+/i);
  if(!m) return null;
  try { var u=new URL(m[0].replace(/'$/, '')); if(u.protocol!=='https:'&&u.protocol!=='http:')return null;
    if(u.username||u.password||u.port)return null;
    var h=u.hostname.toLowerCase();
    var google=/^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(h);
    if((google&&(h.startsWith('maps.')||/^\/maps(?:\/|$)/.test(u.pathname)))||h==='maps.app.goo.gl'||(h==='goo.gl'&&u.pathname.startsWith('/maps'))||(h==='g.co'&&u.pathname.startsWith('/kgs/'))) {u.protocol='https:';return u;}
  }catch(e){} return null;
}
function coordinates(text) {
 var s=String(text),n='(-?\\d{1,3}(?:\\.\\d+)?)',m;
 var patterns=[new RegExp('!3d'+n+'!4d'+n),new RegExp('!2d'+n+'!3d'+n),new RegExp('^\\s*(?:loc:|geo:)?'+n+'\\s*[,،]\\s*'+n+'(?:\\s*\\([^)]*\\))?\\s*$')];
 for(var i=0;i<patterns.length;i++){m=s.match(patterns[i]); if(m){var lat=+(i===1?m[2]:m[1]),lng=+(i===1?m[1]:m[2]);if(Math.abs(lat)<=90&&Math.abs(lng)<=180)return {lat:lat,lng:lng};}}
 return null;
}
function parseMapInput(raw,center) {
 var s=String(raw||'').trim().replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/٫/g,'.');
 if(!s)return {error:'empty'};
 for(var i=0;i<2;i++){try{var d=decodeURIComponent(s);if(d===s)break;s=d;}catch(e){break;}}
 var u=mapURL(raw),point;
 if(/https?:\/\//i.test(s)&&!u)return {error:'unsupported'};
 if(u){
   if(/^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/.test(u.hostname))return {remote:u.href};
   var decoded=u.href;try{decoded=decodeURIComponent(decoded);}catch(e){}
   // A place pin is more precise than the map camera in an @ URL.
   point=coordinates(decoded);if(point)return point;
   for(var key of ['destination','daddr','query','q','ll','center']){
     var value=u.searchParams.get(key);if(!value)continue;
     point=coordinates(value);if(point)return point;
     var plus=decodePlus(value,center);if(plus)return plus;
   }
   var path=decoded.match(/\/(?:place|search)\/([^/?]+)/);
   if(path){point=coordinates(path[1]);if(point)return point;var plus=decodePlus(path[1],center);if(plus)return plus;}
   // Directions with no destination coordinates must be resolved, never use camera/origin.
   if(/\/dir\//.test(u.pathname)||u.searchParams.has('query_place_id')||u.searchParams.has('cid'))return {remote:u.href};
   var at=decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
   if(at&&!/\/place\//.test(u.pathname)){point=coordinates(at[1]+','+at[2]);if(point)return point;}
   return {remote:u.href};
 }
 point=coordinates(s);if(point)return point;
 var plus=decodePlus(s,center);return plus||{error:'nocoords'};
}
// Plus Codes are decoded locally in the calculator.
function decodePlus(s,center){return null;}
