'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const SCENES = ['denver','manhattan','medieval','kyoto','fuji','lake','coast','forest'];
const PHASES = ['dawn','morning','noon','afternoon','evening','night'];

async function runNaturalTests(mainWindow, { finish, delay, outputDirectory } = {}) {
  const checks = [], pause = delay || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const evaluate = source => mainWindow.webContents.executeJavaScript(source, true);
  const folder = path.resolve(outputDirectory || '.test-results/generated-six-phase');
  try {
    // Missing production assets are a failure, never a synthetic fixture or skip.
    const missing = [], fingerprints = new Map(), nativeSizes = new Map();
    for (const sceneId of SCENES) {
      const hashes = [];
      for (const phase of PHASES) {
        const filename = path.join(__dirname,'..','assets','landscapes','generated',sceneId,phase+'.png');
        if (!fs.existsSync(filename)) { missing.push(sceneId+'/'+phase+'.png'); continue; }
        const bytes = fs.readFileSync(filename);
        nativeSizes.set(`${sceneId}/${phase}`, {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});
        hashes.push(createHash('sha256').update(bytes).digest('hex'));
      }
      fingerprints.set(sceneId, hashes);
    }
    if (missing.length) throw new Error(`Missing ${missing.length}/48 generated images: ${missing.join(', ')}`);
    checks.push({ name:'all eight scenes contain six distinct generated source files', passed:[...fingerprints.values()].every(hashes=>hashes.length===6&&new Set(hashes).size===6) });
    let initial;
    for(let i=0;i<200;i++){ initial=await evaluate('window.__digitalWindowSmoke?.()'); if(initial?.ready&&initial.generated)break;await pause(80); }
    if(!initial?.ready)throw new Error('Generated scene did not initialize');
    checks.push({name:'default scene is generated Denver with six phases',passed:initial.sceneId==='denver'&&initial.timeZone==='America/Denver'&&initial.generated&&initial.relighting.phaseCount===6});
    checks.push(...await evaluate(`(${generatedBrowserChecks.toString()})()`));
    fs.mkdirSync(folder,{recursive:true});
    const figures=[];
    for(const sceneId of SCENES){
      const hasNativeSize = image => {
        const expected = nativeSizes.get(`${sceneId}/${image.phase}`);
        return expected && image.width === expected.width && image.height === expected.height;
      };
      for(const phase of PHASES){
        const sample=await evaluate(`(${prepareGeneratedPhase.toString()})(${JSON.stringify(sceneId)},${JSON.stringify(phase)})`);
        const filename=sceneId+'-'+phase+'.jpg';
        fs.writeFileSync(path.join(folder,filename),(await mainWindow.webContents.capturePage()).toJPEG(88));
        checks.push({name:sceneId+' '+phase+' displays six decoded sources at original sizes without window frames',passed:sample.ready&&sample.generated&&sample.layers.length===6&&sample.layers.every(image=>image.loaded&&hasNativeSize(image))&&sample.phaseCount===6&&sample.lightModel==='six-phase-image-blend-1.0'&&sample.selectedWeight>.8&&sample.noFrames&&sample.noOverlays,phase,sceneId,image:filename,selectedWeight:sample.selectedWeight,renderer:sample.renderer});
        figures.push(`<figure><img src="${filename}"><figcaption>${sceneId} · ${phase}</figcaption></figure>`);
      }
    }
    mainWindow.webContents.enableDeviceEmulation({screenPosition:'desktop',screenSize:{width:1920,height:1080},viewPosition:{x:0,y:0},viewSize:{width:1920,height:1080},deviceScaleFactor:2,scale:1});
    await pause(300);
    const physical=await evaluate('window.__digitalWindowSmoke().relighting');
    checks.push({name:'six-image compositor renders a physical 3840x2160 framebuffer',passed:physical.width===3840&&physical.height===2160&&physical.sources.length===6,width:physical.width,height:physical.height});
    mainWindow.webContents.disableDeviceEmulation();
    const native=await evaluate('window.digitalWindow.getWindowState()');
    checks.push({name:'native fullscreen covers the complete monitor and taskbar',passed:native.fullscreen&&['x','y','width','height'].every(key=>native.bounds[key]===native.displayBounds[key])});
    fs.writeFileSync(path.join(folder,'six-phase.html'),'<!doctype html><meta charset="utf-8"><title>AI六时段画面检查</title><style>body{background:#14191f;color:white;font:15px system-ui}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}img{width:100%}</style><h1>AI生成景观 · 六时段实际运行截图</h1><p>逐个检查八处景观的六个时段。所有源图均已按原始尺寸解码。写字楼视角只呈现窗外。</p><main>'+figures.join('')+'</main>');
    finish('DIGITAL_WINDOW_NATURAL',checks);
  }catch(error){finish('DIGITAL_WINDOW_NATURAL',checks,error);}
}

async function generatedBrowserChecks(){
  const checks=[],check=(name,passed,details={})=>checks.push({name,passed:Boolean(passed),...details});
  const byId=id=>document.getElementById(id),ui=()=>window.__digitalWindowSmoke();
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  check('no window frame, office foreground or legacy rendering mode remains',!document.querySelector('.office-interior,#window-frame,#frame-toggle,#render-mode'));
  byId('motion-toggle').checked=false;byId('motion-toggle').dispatchEvent(new Event('change',{bubbles:true}));
  byId('realtime-toggle').checked=true;byId('realtime-toggle').dispatchEvent(new Event('change',{bubbles:true}));
  const before=ui();await pause(1200);const after=ui();
  check('time and rendering advance with video motion switched off',after.relighting.frameCount>before.relighting.frameCount+4&&after.relighting.utcMillis>before.relighting.utcMillis+800);
  const now=Date.now();byId('realtime-toggle').checked=false;byId('realtime-toggle').dispatchEvent(new Event('change',{bubbles:true}));
  check('preview preserves seconds instead of rounding to a minute',Math.abs(ui().lighting.utcMillis-now)<1000);
  check('the six requested preset labels are present',JSON.stringify([...byId('phase-presets').querySelectorAll('[data-preview-phase]')].map(button=>button.dataset.previewPhase))===JSON.stringify(['dawn','morning','noon','afternoon','evening','night']));
  return checks;
}

async function prepareGeneratedPhase(sceneId,phase){
  const byId=id=>document.getElementById(id),ui=()=>window.__digitalWindowSmoke(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  if(ui().sceneId!==sceneId){document.querySelector('.landscape-card[data-scene="'+sceneId+'"]').click();}
  for(let i=0;i<220;i++){if(ui().sceneId===sceneId&&ui().ready&&!ui().transitioning)break;await pause(60);}
  if(ui().sceneId!==sceneId||!ui().ready)throw new Error('Generated scene failed to load: '+sceneId);
  byId('scene-timezone-toggle').checked=true;byId('scene-timezone-toggle').dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector('#phase-presets [data-preview-phase="'+phase+'"]').click();
  for(let i=0;i<120;i++){if(!ui().transitioning&&ui().relighting.weights?.[phase]>.8)break;await pause(60);}
  byId('close-panel').click();await pause(220);
  const state=ui(),deck=[...document.querySelectorAll('.scene-deck')].at(-1);
  return{ready:state.ready,generated:state.generated,layers:[...deck.querySelectorAll('[data-phase]')].map(image=>({phase:image.dataset.phase,loaded:image.complete&&image.naturalWidth>0,width:image.naturalWidth,height:image.naturalHeight})),phaseCount:state.relighting.phaseCount,lightModel:state.relighting.lightModel,selectedWeight:state.relighting.weights[phase],noFrames:!document.querySelector('.office-interior,#window-frame,#frame-toggle'),noOverlays:!state.atmosphere.sunDrawn&&!state.atmosphere.moonDrawn&&state.atmosphere.glintSources.length===0,renderer:state.relighting.renderer};
}

module.exports={runNaturalTests};
