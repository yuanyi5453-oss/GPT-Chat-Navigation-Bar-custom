const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const root=__dirname;
const source=process.env.CNAV_SOURCE_ROOT || path.dirname(root);
for(const dir of ['temp','home','localappdata','appdata','runtime_screenshots'])fs.mkdirSync(path.join(root,dir),{recursive:true});
Object.assign(process.env,{TEMP:path.join(root,'temp'),TMP:path.join(root,'temp'),HOME:path.join(root,'home'),USERPROFILE:path.join(root,'home'),LOCALAPPDATA:path.join(root,'localappdata'),APPDATA:path.join(root,'appdata')});
const {JSDOM,VirtualConsole}=require(path.join(source,'node_modules','jsdom'));
const bundlePath=path.join(source,'dist','assets','contentScript.js');
const cssPath=path.join(source,'dist','assets','contentScript.css');
const bundle=fs.readFileSync(bundlePath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const saveSummary=result=>{const value=JSON.stringify(result,null,2);fs.writeFileSync(path.join(root,'runtime_results.json'),value);fs.writeFileSync(path.join(root,'results.json'),value);};
const shellOpen='<div id="visual-shell" data-testid="unified-composer" class="composer-shell rounded-3xl border bg-token-bg-primary">';
const editorField='<div id="prompt-textarea" contenteditable="true" role="textbox"><p>询问 ChatGPT</p></div>';
const editor=editorField+'<button type="button" aria-label="发送提示">发送</button>';
const cases=[
  {name:'main_form',inside:true,html:`<form id="visual-shell" class="composer-shell rounded-3xl border bg-token-bg-primary">${editor}</form>`},
  {name:'outside_main_form',inside:false,html:`<form id="visual-shell" class="composer-shell rounded-3xl border bg-token-bg-primary">${editor}</form>`},
  {name:'outside_main_without_form',inside:false,html:`<div id="visual-shell" class="composer-shell rounded-3xl border bg-token-bg-primary">${editor}</div>`},
  {name:'form_with_inner_visual_shell',inside:true,html:`<form class="form-envelope"><div id="visual-shell" class="composer-shell rounded-3xl border bg-token-bg-primary">${editorField}</div></form>`},
  {name:'unified_editor_without_prompt_id',inside:false,html:`${shellOpen}<div contenteditable="true" role="textbox" data-testid="unified-composer-textarea"><p>无 prompt id 的合成输入框</p></div><button type="button" aria-label="发送提示">发送</button></div>`},
  {name:'attachment_role_document',inside:false,html:`${shellOpen}<div class="attachment" role="document">附件：notes.pdf</div>${editor}</div>`}
];
const fixtureBase=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; img-src data:"><style>
*{box-sizing:border-box}html,body{margin:0;font-family:Arial,"Microsoft YaHei",sans-serif;color:#202123;background:#fff}.sidebar{position:fixed;inset:0 auto 0 0;width:260px;background:#f6f7f8;padding:24px}.app{margin-left:260px;width:calc(100% - 260px)}main{width:100%;min-width:0}.heading{padding:22px 24px;border-bottom:1px solid #eee}.conversation{padding:24px}#assistant{width:100%;max-width:768px;margin:0 auto}h2{font-size:22px}.composer-zone{width:100%;padding:24px}.native-limit{width:100%;max-width:768px;padding-inline:24px;margin-inline:auto}.form-envelope{width:100%;margin:0}.composer-shell{width:100%;min-height:64px;border:1px solid #d6e0e5;background:#fbfcfd;border-radius:28px;padding:16px 22px}#prompt-textarea,[contenteditable=true]{outline:none;min-height:24px}.attachment{font-size:12px;border:1px solid #c3cbd2;border-radius:8px;padding:6px;width:180px;margin-bottom:8px}.canvas-region{width:480px;max-width:calc(100% - 48px);margin:24px auto;border:1px dashed #b7c2ca;padding:12px;color:#68707d}.canvas-shell{width:100%;border:1px solid #b7c2ca;border-radius:12px;padding:12px;background:#f4f5f6}.case-label{padding:12px 24px;color:#68707d;font-size:13px}@media(max-width:800px){.sidebar{display:none}.app{margin-left:0;width:100%}}
</style><style>${css}</style></head><body><aside class="sidebar">ChatGPT<br><br>完整脚本交互检查</aside><div id="app" class="app"><main id="main"><header class="heading">输入框结构兼容性 · 实际 bundle</header><div class="conversation"><article id="assistant" data-testid="conversation-turn-1"><div data-message-author-role="assistant"><h2>回复正文保持原来的宽度</h2><p>本页执行真实扩展脚本，设置由模拟 Chrome storage 事件提供。</p></div></article></div><section id="canvas-region" data-testid="canvas" class="canvas-region"><p>Canvas 独立编辑器（必须排除）</p><div id="canvas-shell" data-testid="unified-composer" class="canvas-shell"><div id="prompt-textarea" contenteditable="true" role="textbox">Canvas 合成内容</div></div></section></main><div id="case-label" class="case-label"></div><div id="composer-zone" class="composer-zone"></div></div></body></html>`;

function installMocks(w){
  const qa={errors:[],warnings:[],network:[],storageListeners:new Set(),runtimeListeners:new Set()};
  w.__qa=qa;
  const settings={language:'zh-CN',chatLayoutVersion:2,chatContentWidth:60,composerWidthScale:100,navigateAnimationEnabled:false,uiMotionEnabled:false,compatRulesRemoteEnabled:false,compatRulesAutoSyncEnabled:false,drawerMode:'auto'};
  const storage={'conversationNavigator:settings':settings};
  w.chrome={runtime:{id:'offline-composer-runtime-test',lastError:undefined,onMessage:{addListener:f=>qa.runtimeListeners.add(f),removeListener:f=>qa.runtimeListeners.delete(f)},getURL:p=>`chrome-extension://offline-composer-runtime-test/${p}`,sendMessage:(_message,callback)=>{if(callback)w.queueMicrotask(()=>callback({ok:true}));return Promise.resolve({ok:true});}},storage:{local:{get:(key,callback)=>{const result=typeof key==='string'?{[key]:storage[key]}:{...storage};if(callback)w.queueMicrotask(()=>callback(result));return Promise.resolve(result);},set:(values,callback)=>{Object.assign(storage,values);if(callback)w.queueMicrotask(callback);return Promise.resolve();},remove:(_key,callback)=>{if(callback)w.queueMicrotask(callback);return Promise.resolve();}},onChanged:{addListener:f=>qa.storageListeners.add(f),removeListener:f=>qa.storageListeners.delete(f)}}};
  w.__setScale=scale=>{const old=storage['conversationNavigator:settings'];const next={...old,composerWidthScale:scale};storage['conversationNavigator:settings']=next;for(const fn of qa.storageListeners)fn({'conversationNavigator:settings':{oldValue:old,newValue:next}},'local');};
  w.fetch=async input=>{qa.network.push(String(input));throw new Error('Offline fixture forbids network');};
  w.addEventListener('error',event=>qa.errors.push(event.error?.stack||event.message));
  w.addEventListener('unhandledrejection',event=>qa.errors.push(String(event.reason)));
  const oldError=w.console.error.bind(w.console),oldWarn=w.console.warn.bind(w.console);
  w.console.error=(...args)=>{qa.errors.push(args.map(String).join(' '));oldError(...args)};
  w.console.warn=(...args)=>{qa.warnings.push(args.map(String).join(' '));oldWarn(...args)};
  return qa;
}

function renderCase(w,entry){
  const zone=w.document.getElementById('composer-zone');
  (entry.inside?w.document.getElementById('main'):w.document.getElementById('app')).appendChild(zone);
  zone.innerHTML=`<div id="native-limit" class="native-limit mx-auto max-w-3xl">${entry.html}</div>`;
  w.document.getElementById('case-label').textContent=`结构：${entry.name}`;
}

async function jsdomChecks(){
  const assertions=[],states=[];
  const vc=new VirtualConsole();
  const dom=new JSDOM(fixtureBase,{url:'https://chatgpt.com/c/offline-composer-runtime-test',pretendToBeVisual:true,runScripts:'outside-only',virtualConsole:vc});
  const w=dom.window;
  installMocks(w);
  vc.on('jsdomError',error=>w.__qa.errors.push(error.message));
  w.matchMedia=query=>({media:query,matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.requestIdleCallback=callback=>w.setTimeout(()=>callback({didTimeout:false,timeRemaining:()=>50}),0);
  w.cancelIdleCallback=id=>w.clearTimeout(id);
  let closing=false;const pending=new Set();const nativeRAF=w.requestAnimationFrame.bind(w),nativeCancel=w.cancelAnimationFrame.bind(w);
  w.requestAnimationFrame=callback=>{if(closing)return 0;let id=nativeRAF(time=>{pending.delete(id);if(!closing)callback(time)});pending.add(id);return id};
  w.cancelAnimationFrame=id=>{pending.delete(id);nativeCancel(id)};
  w.HTMLElement.prototype.getBoundingClientRect=function(){let width=1200,height=100,left=260;const root=w.document.documentElement;const scale=parseFloat(root.style.getPropertyValue('--cnav-composer-scale'))||1;if(this.id==='visual-shell'){width=720*(root.hasAttribute('data-cnav-composer-width')&&this.hasAttribute('data-cnav-composer-width-target')?scale:1);height=96;left=(1200-width)/2+260;}else if(this.id==='native-limit'){width=768;height=144;}else if(this.id==='canvas-shell'){width=454;height=72;}else if(this.id==='prompt-textarea'||this.matches('[contenteditable=true]')){width=674;height=38;}else if(this.id==='assistant'){width=768;height=180;}return {x:left,y:80,left,top:80,right:left+width,bottom:80+height,width,height,toJSON(){return {}}};};
  w.HTMLElement.prototype.getClientRects=function(){return [this.getBoundingClientRect()]};
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent||''},configurable:true});
  w.HTMLElement.prototype.scrollTo=function(options){this.scrollTop=Number(options?.top||0)};w.scrollTo=()=>{};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const check=(name,pass,detail)=>{assertions.push({name,pass:Boolean(pass),detail});console.log(`${pass?'PASS':'FAIL'} jsdom/${name}`)};
  renderCase(w,cases[0]);
  w.eval(bundle);
  await sleep(350);
  try{
    for(const entry of cases){
      w.__setScale(100);await sleep(40);renderCase(w,entry);await sleep(140);w.__setScale(120);await sleep(140);
      const targets=[...w.document.querySelectorAll('[data-cnav-composer-width-target="true"]')].map(el=>el.id||el.tagName);
      const ancestors=[...w.document.querySelectorAll('[data-cnav-composer-width-ancestor="true"]')].map(el=>el.id||el.tagName);
      const state={case:entry.name,targets,ancestors,base:w.document.documentElement.style.getPropertyValue('--cnav-composer-base-width'),flag:w.document.documentElement.getAttribute('data-cnav-composer-width')};states.push(state);
      check(`${entry.name}_marks_visual_shell`,targets.includes('visual-shell'),state);
      check(`${entry.name}_excludes_canvas_and_messages`,!targets.includes('canvas-shell')&&!ancestors.includes('canvas-region')&&!ancestors.includes('main')&&!ancestors.includes('app')&&!w.document.getElementById('canvas-shell').hasAttribute('data-cnav-composer-width-target'),state);
    }
    w.__setScale(100);await sleep(60);
    check('default_100_restores_native_state',!w.document.documentElement.hasAttribute('data-cnav-composer-width'),{flag:w.document.documentElement.getAttribute('data-cnav-composer-width')});
    check('no_runtime_or_network_errors',w.__qa.errors.length===0&&w.__qa.network.length===0,{errors:w.__qa.errors,warnings:w.__qa.warnings,network:w.__qa.network});
    fs.writeFileSync(path.join(root,'runtime_jsdom_dom.html'),dom.serialize());
    const result={passed:assertions.every(item=>item.pass),assertions,states,errors:w.__qa.errors,warnings:w.__qa.warnings};fs.writeFileSync(path.join(root,'runtime_jsdom_results.json'),JSON.stringify(result,null,2));return result;
  }finally{closing=true;for(const id of pending)nativeCancel(id);w.close();}
}

async function browserChecks(w,caseList,narrow){
  const states=[],assertions=[];
  const sleep=ms=>new Promise(resolve=>w.setTimeout(resolve,ms));
  const box=id=>{const r=w.document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,center:(r.left+r.right)/2}};
  const snap=label=>{const state={label,composer:box('visual-shell'),assistant:box('assistant'),canvas:box('canvas-shell'),viewport:w.document.documentElement.clientWidth,overflow:w.document.documentElement.scrollWidth-w.document.documentElement.clientWidth,targets:[...w.document.querySelectorAll('[data-cnav-composer-width-target="true"]')].map(el=>el.id||el.tagName),base:w.document.documentElement.style.getPropertyValue('--cnav-composer-base-width')};states.push(state);return state};
  const check=(name,pass,detail)=>assertions.push({name,pass:Boolean(pass),detail});
  const same=(a,b)=>Math.abs(a.left-b.left)<.6&&Math.abs(a.width-b.width)<.6;
  await sleep(400);
  for(const entry of (narrow?[caseList[2]]:caseList)){
    w.__setScale(100);await sleep(50);w.__renderCase(entry);await sleep(160);
    const baseline=snap(`${entry.name}_100`);
    w.__setScale(narrow?140:120);await sleep(180);
    const enlarged=snap(`${entry.name}_${narrow?140:120}`);
    check(`${entry.name}_actual_bundle_marks_visual_shell`,enlarged.targets.includes('visual-shell')&&!enlarged.targets.includes('canvas-shell'),enlarged);
    if(narrow)check('narrow_140_has_no_overflow',enlarged.overflow===0&&enlarged.composer.left>=0&&enlarged.composer.right<=enlarged.viewport,enlarged);
    else check(`${entry.name}_120_widens_visual_shell`,Math.abs(enlarged.composer.width-baseline.composer.width*1.2)<.8,{before:baseline.composer,after:enlarged.composer,base:enlarged.base});
    check(`${entry.name}_preserves_assistant_and_canvas`,same(baseline.assistant,enlarged.assistant)&&same(baseline.canvas,enlarged.canvas),{before:baseline,after:enlarged});
    if(!narrow){w.__setScale(80);await sleep(130);const reduced=snap(`${entry.name}_80`);check(`${entry.name}_80_narrows_visual_shell`,Math.abs(reduced.composer.width-baseline.composer.width*.8)<.8,{before:baseline.composer,after:reduced.composer});w.__setScale(100);await sleep(120);const restored=snap(`${entry.name}_restored`);check(`${entry.name}_100_restores_native_geometry`,same(restored.composer,baseline.composer),{before:baseline.composer,after:restored.composer});}
  }
  if(!narrow){w.__setScale(100);await sleep(60);w.__renderCase(caseList[2]);await sleep(150);w.__setScale(120);await sleep(180);const before=snap('replacement_before');w.document.getElementById('native-limit').replaceWith(w.document.getElementById('native-limit').cloneNode(true));await sleep(250);const after=snap('replacement_after');check('replaced_non_form_composer_reapplies_automatically',same(before.composer,after.composer)&&after.targets.includes('visual-shell'),{before,after});}
  check('no_runtime_or_network_errors',w.__qa.errors.length===0&&w.__qa.network.length===0,{errors:w.__qa.errors,warnings:w.__qa.warnings,network:w.__qa.network});
  const result={narrow,passed:assertions.every(item=>item.pass),assertions,states,errors:w.__qa.errors,warnings:w.__qa.warnings};const output=w.document.createElement('pre');output.id='runtime-composer-result';output.hidden=true;output.textContent=JSON.stringify(result);w.document.body.appendChild(output);
}

function buildBrowserFixture(narrow){
  const boot=`<script>(${installMocks.toString()})(window);window.__composerCases=${JSON.stringify(cases)};window.__renderCase=entry=>(${renderCase.toString()})(window,entry);window.__renderCase(window.__composerCases[0]);window.eval(atob(${JSON.stringify(Buffer.from(bundle).toString('base64'))}));(${browserChecks.toString()})(window,window.__composerCases,${narrow}).catch(error=>{const out=document.createElement('pre');out.id='runtime-composer-result';out.hidden=true;out.textContent=JSON.stringify({passed:false,error:String(error.stack||error)});document.body.appendChild(out)});</script>`;
  return fixtureBase.replace('</body>',boot+'</body>');
}

async function runChrome(narrow){
  const label=narrow?'narrow':'desktop';const html=path.join(root,`runtime_fixture_${label}.html`);fs.writeFileSync(html,buildBrowserFixture(narrow));
  const args=['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--disable-breakpad','--disable-crash-reporter','--no-first-run','--no-default-browser-check','--disable-features=Crashpad',`--window-size=${narrow?'640,900':'2048,1064'}`,'--hide-scrollbars','--virtual-time-budget=10000','--user-data-dir='+path.join(root,`runtime_profile_${label}`),'--disk-cache-dir='+path.join(root,`runtime_profile_${label}`,'cache'),'--screenshot='+path.join(root,'runtime_screenshots',`${label}.png`),'--dump-dom',pathToFileURL(html).href];
  return new Promise(resolve=>{const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',args,{env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});console.log(`Chrome runtime ${label} pid=${child.pid}`);fs.writeFileSync(path.join(root,`runtime_process_${label}.json`),JSON.stringify({pid:child.pid,args},null,2));let out='',err='';child.stdout.on('data',data=>out+=data);child.stderr.on('data',data=>err+=data);const timer=setTimeout(()=>child.kill(),25000);child.on('close',code=>{clearTimeout(timer);fs.writeFileSync(path.join(root,`runtime_dump_${label}.html`),out);fs.writeFileSync(path.join(root,`runtime_stderr_${label}.txt`),err);const match=out.match(/<pre id="runtime-composer-result" hidden="">([\s\S]*?)<\/pre>/);const result=match?JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&')):{passed:false,error:'Chrome result missing',code,domBytes:out.length,stderr:err.slice(-1800)};fs.writeFileSync(path.join(root,`runtime_${label}_results.json`),JSON.stringify(result,null,2));if(result.assertions)for(const item of result.assertions)console.log(`${item.pass?'PASS':'FAIL'} chrome/${label}/${item.name}`);else console.log(JSON.stringify(result));resolve(result);});child.on('error',error=>{clearTimeout(timer);resolve({passed:false,error:String(error)})});});
}

(async()=>{const jsdom=await jsdomChecks();if(!jsdom.passed){console.log('JSDOM failed; Chrome runs skipped until diagnosis.');const result={passed:false,bundleSha256:hash(bundle),cssSha256:hash(css),jsdom};saveSummary(result);process.exitCode=1;return;}const desktop=await runChrome(false);const narrow=await runChrome(true);const result={scope:'Actual packaged JavaScript and CSS; JSDOM synthetic geometry, followed by actual full bundle execution in local Chrome file fixtures with mocked chrome API. No manual composer marks, measurements, or setting CSS applied by the test.',bundlePath,bundleSha256:hash(bundle),cssSha256:hash(css),passed:jsdom.passed&&desktop.passed&&narrow.passed,jsdom,desktop,narrow};saveSummary(result);console.log(JSON.stringify({passed:result.passed,bundleSha256:result.bundleSha256,jsdomAssertions:jsdom.assertions?.length,desktopAssertions:desktop.assertions?.length,narrowAssertions:narrow.assertions?.length},null,2));process.exitCode=result.passed?0:1})().catch(error=>{fs.writeFileSync(path.join(root,'runtime_runner_error.txt'),String(error.stack||error));console.error(error);process.exitCode=1});
