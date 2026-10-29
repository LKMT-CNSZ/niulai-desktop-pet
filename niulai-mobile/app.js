(() => {
  'use strict';
  const $=id=>document.getElementById(id), KEY='niulai-muyu:v1';
  let stored={};try{stored=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
  const state={
    total:Number.isSafeInteger(stored.total)&&stored.total>=0?stored.total:0,session:0,
    sound:stored.sound!==false,volume:Number.isFinite(stored.volume)?Math.min(1,Math.max(0,stored.volume)):.75,
    tempo:[800,1500,2500,4000].includes(stored.tempo)?stored.tempo:1500,motion:stored.motion!==false,auto:false,
    theme:['system','light','dark'].includes(stored.theme)?stored.theme:'system',haptics:stored.haptics!==false
  };
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let timer,saveTimer,toastTimer,headAnimation,context,audioBuffer,loadingAudio,lastAudioAt=-Infinity;
  const sources=new Set(),fallback=new Audio('assets/niulai.mp3');fallback.preload='auto';
  function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2200);}
  function persist(){try{const{total,sound,volume,tempo,motion,theme,haptics}=state;localStorage.setItem(KEY,JSON.stringify({total,sound,volume,tempo,motion,theme,haptics}));}catch{if(!persist.warned){persist.warned=true;toast('暂时无法保存，本次仍可正常敲击');}}}
  function save(){clearTimeout(saveTimer);saveTimer=setTimeout(persist,150);}
  function paintCounts(){ $('session-count').textContent=state.session.toLocaleString('zh-CN');$('total-count').textContent=state.total.toLocaleString('zh-CN');$('session-count').parentElement.style.fontSize=state.session>999999?'20px':''; }
  function paintSettings(){
    $('sound-toggle').checked=state.sound;
    $('volume').value=Math.round(state.volume*100);$('volume-value').textContent=`${Math.round(state.volume*100)}%`;
    $('motion').checked=state.motion;document.body.classList.toggle('reduce-motion',!state.motion);$('auto-toggle').checked=state.auto;
    $('haptics').checked=state.haptics;
    $('haptic-note').textContent=typeof navigator.vibrate==='function'?'手动轻触时短震一下，自动模式不震动':'当前浏览器不支持震动';
    document.querySelectorAll('[data-tempo]').forEach(b=>{const selected=Number(b.dataset.tempo)===state.tempo;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    document.querySelectorAll('[data-theme-mode]').forEach(b=>{const selected=b.dataset.themeMode===state.theme;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  }
  function getContext(){if(!context)context=new(window.AudioContext||window.webkitAudioContext)();if(context.state==='suspended')context.resume().catch(()=>{});return context;}
  function prepareAudio(){
    if(audioBuffer)return Promise.resolve(audioBuffer);
    if(!loadingAudio)loadingAudio=(async()=>{const ctx=getContext(),response=await fetch('assets/niulai.mp3');if(!response.ok)throw Error('Audio unavailable');audioBuffer=await ctx.decodeAudioData(await response.arrayBuffer());return audioBuffer;})().catch(error=>{loadingAudio=null;throw error;});
    return loadingAudio;
  }
  function stopAudio(){for(const source of sources){try{source.stop();}catch{}}sources.clear();fallback.pause();fallback.currentTime=0;}
  function playAudio(){
    if(!state.sound||state.volume<=0)return;
    const now=performance.now();if(now-lastAudioAt<65)return;lastAudioAt=now;
    try{
      const ctx=getContext();
      if(audioBuffer&&ctx.state==='running'){
        fallback.pause();
        while(sources.size>=3){const old=sources.values().next().value;try{old.stop();}catch{}sources.delete(old);}
        const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=audioBuffer;gain.gain.value=state.volume*.8;source.connect(gain);gain.connect(ctx.destination);source.onended=()=>{sources.delete(source);source.disconnect();gain.disconnect();};sources.add(source);source.start();
      }else{fallback.volume=state.volume;fallback.currentTime=0;fallback.play().catch(()=>toast('请检查设备的声音输出'));prepareAudio().catch(()=>{});}
    }catch{fallback.volume=state.volume;fallback.currentTime=0;fallback.play().catch(()=>toast('暂时无法播放声音'));}
  }
  function animateTap(){
    if(!state.motion)return;
    if(!reduced.matches){if(headAnimation)headAnimation.cancel();headAnimation=$('bull').animate([{transform:'scale(1)'},{transform:'scale(1.06,.90)',offset:.2},{transform:'scale(.97,1.035)',offset:.52},{transform:'scale(1)'}],{duration:300,easing:'ease-out'});}
    const mark=document.createElement('span');mark.className='rise-mark';
    mark.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m3 26 9-9 6 4L28 7M19 7h9v9"/></svg><span>牛气➕1</span>';
    if(reduced.matches)mark.classList.add('still');
    mark.style.setProperty('--drift',(Math.random()*24-12)+'px');
    const layer=$('tap-feedback');if(layer.childElementCount>=4)layer.firstElementChild.remove();layer.append(mark);
    mark.addEventListener('animationend',()=>mark.remove(),{once:true});setTimeout(()=>mark.remove(),950);
  }
  function stopHaptics(){if(typeof navigator.vibrate==='function')try{navigator.vibrate(0);}catch{}}
  function tap(automatic=false){if(state.total>=Number.MAX_SAFE_INTEGER)return;state.total++;state.session++;paintCounts();animateTap();playAudio();save();if(!automatic&&state.haptics&&typeof navigator.vibrate==='function')try{navigator.vibrate(18);}catch{}}
  function setAuto(enabled,immediate=false){clearInterval(timer);state.auto=enabled;if(enabled){try{getContext();}catch{}if(immediate)tap(true);timer=setInterval(()=>tap(true),state.tempo);}paintSettings();}
  $('bull').addEventListener('click',()=>tap());
  $('bull').addEventListener('pointerdown',()=>{try{getContext();prepareAudio().catch(()=>{});}catch{}},{once:true});
  $('sound-toggle').addEventListener('change',event=>{state.sound=event.target.checked;if(!state.sound)stopAudio();paintSettings();persist();});
  $('settings-open').addEventListener('click',()=>$('settings-dialog').showModal());
  $('settings-dialog').addEventListener('click',event=>{if(event.target===$('settings-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
  $('volume').addEventListener('input',event=>{state.volume=Number(event.target.value)/100;stopAudio();paintSettings();save();});
  $('volume').addEventListener('change',()=>{if(state.sound&&state.volume>0)playAudio();});
  $('motion').addEventListener('change',event=>{state.motion=event.target.checked;if(!state.motion){if(headAnimation)headAnimation.cancel();$('tap-feedback').replaceChildren();}paintSettings();persist();});
  $('haptics').addEventListener('change',event=>{state.haptics=event.target.checked;if(!state.haptics)stopHaptics();paintSettings();persist();});
  $('auto-toggle').addEventListener('change',event=>setAuto(event.target.checked,true));
  document.querySelectorAll('[data-theme-mode]').forEach(button=>button.addEventListener('click',()=>{state.theme=button.dataset.themeMode;window.niulaiTheme.set(state.theme);paintSettings();persist();}));
  document.querySelectorAll('[data-tempo]').forEach(button=>button.addEventListener('click',()=>{state.tempo=Number(button.dataset.tempo);if(state.auto)setAuto(true);paintSettings();persist();}));
  $('new-round').addEventListener('click',()=>{setAuto(false);stopAudio();stopHaptics();$('tap-feedback').replaceChildren();state.session=0;paintCounts();$('settings-dialog').close();toast('新一轮，牛来');});
  window.addEventListener('keydown',event=>{if(event.code!=='Space'||event.repeat||$('settings-dialog').open||/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement.tagName))return;event.preventDefault();tap();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){setAuto(false);stopAudio();stopHaptics();$('tap-feedback').replaceChildren();persist();}});
  window.addEventListener('pagehide',persist);window.addEventListener('beforeunload',persist);
  reduced.addEventListener('change',()=>{if(reduced.matches&&headAnimation)headAnimation.cancel();});
  paintCounts();paintSettings();
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol))navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
