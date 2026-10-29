const CACHE='niulai-mobile-open-v1';
const FILES=['./','index.html','styles.css','styles.css?v=20261021-feedback','theme.js','app.js','app.js?v=20261021-feedback','manifest.webmanifest','assets/head.png','assets/icon-180.png','assets/icon-192.png','assets/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES).then(()=>cache.add('assets/niulai.mp3').catch(()=>{}))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('niulai-mobile-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(async response=>{if(response.ok)await caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())).catch(()=>{});return response;}).catch(async()=>await caches.match(event.request,{ignoreSearch:true})||await caches.match('index.html')));
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(!cached)return fetch(event.request);
    // iPhone media elements may request byte ranges, including during offline playback.
    const range=event.request.headers.get('range');
    if(range&&new URL(event.request.url).pathname.endsWith('.mp3')){
      const bytes=await cached.arrayBuffer(),match=/^bytes=(\d*)-(\d*)$/.exec(range);
      if(!match)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.byteLength}});
      const length=bytes.byteLength,start=match[1]?Number(match[1]):Math.max(0,length-Number(match[2])),end=match[1]?(match[2]?Math.min(Number(match[2]),length-1):length-1):length-1;
      if(start>=length||end<start)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+length}});
      return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Content-Range':'bytes '+start+'-'+end+'/'+length}});
    }
    return cached;
  })());
});

