const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const raw = fs.readFileSync(process.env.VENUS_RUNTIME_PATH || 'patches/src/main/resources/venus/bootstrap.js', 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

// Node's lexical semantics cannot reproduce Hermes native eval's default
// ES6BlockScoping=false. Run this explicitly with HERMES_BIN when investigating
// startup; a skipped test is NOT Hermes or Android verification.
test('Hermes native eval retains hook and concurrent size callback captures',
    {skip: !process.env.HERMES_BIN}, () => {
        const path = require('node:path');
        const {spawnSync} = require('node:child_process');
        const directory = fs.mkdtempSync(path.resolve('work/hermes-eval-'));
        const fixture = path.join(directory, 'probe.js');
        const source = raw.replace('/*__FEATURES__*/', '{picker:true,voice:true}');
        fs.writeFileSync(fixture, `(0,eval)(${JSON.stringify(source)});\n` + String.raw`
var factories = {};
globalThis.__d = function(factory, id) { factories[id] = factory; };
function check(value, message) { if (!value) throw new Error(message); }
function load(id, exports) {
    __d(function(g, r, i, a, module) { module.exports = exports; }, id, []);
    var module = {exports:{}};
    factories[id](globalThis, null, null, null, module, module.exports, []);
    return module.exports;
}
load(120, {default:function(){}}).default();
var providers = [];
var registry = {
    registerComponent:function(name, provider) {
        check(this === registry, 'registerComponent receiver changed');
        providers.push(provider);
        return name;
    },
    getAttachmentPayload:function(value) { return value; },
    get:function(){}, put:function(){},
    post:function(value) { check(this === registry, 'post receiver changed'); return value; }
};
// Multiple operations in one export exercise independent per-iteration bindings.
load(1271, registry);
check(registry.registerComponent('Discord', function(){return function(){return 'root';};}) === 'Discord', 'registration result');
check(providers[0]()({}) === 'root', 'root provider');
var payload = {};
check(registry.getAttachmentPayload(payload) === payload, 'serializer dispatch');
check(registry.post(payload) === payload, 'HTTP dispatch');
var seen = [];
load(1151, {default:{
    getConstants:function(){return {};}, readFile:function(){}, writeFile:function(){},
    getSize:function(uri){seen.push(uri);return Promise.resolve(Number(uri.slice(7)));}
}});
Promise.all([
    __venusPatches.getSize('file://1'), __venusPatches.getSize('file://2'),
    __venusPatches.getSize('file://3'), __venusPatches.getSize('file://4'),
    __venusPatches.getSize('file://5')
]).then(function(values) {
    check(values.join(',') === '1,2,3,4,5', 'concurrent size callbacks crossed entries');
    check(seen.join(',') === 'file://1,file://2,file://3,file://4,file://5', 'wrong URIs read');
    print('HERMES_NATIVE_EVAL_PASS');
}, function(error) { throw error; });
`);
        try {
            const result = spawnSync(path.resolve(process.env.HERMES_BIN), [fixture],
                {encoding:'utf8', timeout:30000});
            assert.ifError(result.error);
            assert.equal(result.status, 0, result.stdout + result.stderr);
            assert.match(result.stdout, /HERMES_NATIVE_EVAL_PASS/,
                'Asynchronous regression did not complete: ' + result.stdout + result.stderr);
        } finally {
            fs.rmSync(directory, {recursive:true, force:true});
        }
    });

function boot(features = {picker:true, voice:true}, ready = true) {
    const warnings = [];
    const context = vm.createContext({console: {warn: (...args) => warnings.push(args)}});
    const source = raw.replace('/*__FEATURES__*/', JSON.stringify(features));
    vm.runInContext(source, context);
    const factories = new Map();
    context.__d = (factory, id) => factories.set(id, factory);
    function load(exports, factory, explicitId) {
        const value = explicitId === undefined ? exports && exports.default || exports : exports;
        let id = explicitId;
        if (id === undefined) {
            id = value.getSize ? 1151 : value.createElement ? 19 : value.View ? 17 :
                value.registerComponent ? 245 : value.CloudUpload ? 5375 : value.getAttachmentPayload ? 5377 :
                value.post ? 1271 : value.type || value.render || value.name === 'Pressable' ? 414 : 9999;
        }
        context.__d(factory || function(g, r, i, a, module) { module.exports = exports; }, id, []);
        const module = {exports:{}};
        factories.get(id)(context, () => {}, () => {}, () => {}, module, module.exports, []);
        return module.exports;
    }
    if (ready) load({default:function setUpDefaltReactNativeEnvironment(){}}, null, 120).default();
    return {context, api:context.__venusPatches, load, warnings, source, factories};
}
function native(overrides = {}) {
    return Object.assign({
        getConstants: () => ({DocumentsDirPath:'/data/discord/files'}),
        fileExists: async () => false,
        getSize: async () => 1024,
        readFile: async () => '{}',
        writeFile: async () => undefined,
    }, overrides);
}
async function voiceHarness() {
    const b = boot();
    b.api.setSetting('voice', true);
    const commands = [];
    const result = {uri:'file:///data/cache/venus-voice/result.ogg', filename:'voice-message.ogg', mimeType:'audio/ogg',
        size:8192, durationSecs:14.25, waveform:'AAECAwQFBgc='};
    b.load({default:native({getSize:async request => {
        const command=JSON.parse(request.slice('venus-voice-v1:'.length)); commands.push(command);
        return command.action==='prepare' ? JSON.stringify(result) : 'ok';
    }})});
    class CloudUpload {
        constructor(item) { this.item=item; this.mimeType=item.mimeType; this.filename=item.filename; this.originalCalls=0; }
        reactNativeCompressAndExtractData() {this.originalCalls++;return Promise.resolve(this);}
        isCancelled(){return !!this.cancelled;}
        cancel(){this.cancelled=true;}
    }
    b.load({CloudUpload});
    const serializer = b.load({getAttachmentPayload(upload) {
        return {id:'0', filename:upload.filename || 'audio.ogg', uploaded_filename:upload.remote || 'cloud/audio.ogg',
            ...(upload.durationSecs ? {duration_secs:upload.durationSecs} : {}),
            ...(upload.waveform ? {waveform:upload.waveform} : {})};
    }});
    const received = [];
    const http = b.load({get(){}, put(){}, post(request, second) { received.push([request, second, this]); return 'original'; }});
    const originalItem = {mimeType:'audio/mp3', filename:'audio.mp3',uri:'content://audio'};
    const audio = new CloudUpload(originalItem);
    await audio.reactNativeCompressAndExtractData();
    const payload = serializer.getAttachmentPayload(audio);
    return {...b, serializer, http, received, audio, payload, commands, result, CloudUpload, originalItem};
}

test('bootstrap is idempotent and modules stay lazy', () => {
    const b = boot();
    const first = b.api;
    vm.runInContext(b.source, b.context);
    assert.equal(b.context.__venusPatches, first);
    let count = 0;
    b.context.__d(() => count++, 1234, []);
    assert.equal(count, 0);
    assert.equal(b.warnings.length, 0);
});
test('pre-React-Native bootstrap needs neither Promise nor console polyfills', () => {
    const context = vm.createContext({Promise:undefined, console:undefined});
    const source = raw.replace('/*__FEATURES__*/', '{picker:true,voice:true}');
    assert.doesNotThrow(() => vm.runInContext(source, context));
    assert.equal(context.__venusPatches.status.storage, 'waiting');
    const factories = new Map();
    context.__d = (factory, id) => factories.set(id, factory);
    context.__d((g,r,i,a,module) => { module.exports = {createElement(){}, useState(){}}; }, 19, []);
    factories.get(19)(context,null,null,null,{exports:{}});
    assert.equal(context.__venusPatches.status.storage, 'waiting');
});
test('pre-existing Metro definition is decorated', () => {
    const factories = new Map();
    const context = vm.createContext({__d:(f,id) => factories.set(id,f), console});
    vm.runInContext(raw.replace('/*__FEATURES__*/', '{picker:true,voice:true}'), context);
    context.__d((g,r,i,a,module) => { module.exports = {getAttachmentPayload:() => ({})}; }, 5377, []);
    const module = {exports:{}};
    factories.get(5377)(context,null,null,null,module,module.exports);
    assert.equal(context.__venusPatches.status.attachment, false);
    context.__d((g,r,i,a,module) => { module.exports = {default(){}}; }, 120, []);
    const setup = {exports:{}};
    factories.get(120)(context,null,null,null,setup,setup.exports);
    setup.exports.default();
    assert.equal(context.__venusPatches.status.attachment, true);
});
test('file-size formatter handles zero, units, invalid metadata', () => {
    const {api} = boot();
    assert.equal(api.formatSize(0), '0 B');
    assert.equal(api.formatSize(1024), '1 KiB');
    assert.equal(api.formatSize(1536), '1.5 KiB');
    assert.equal(api.formatSize(-1), '');
    assert.equal(api.formatSize(Infinity), '');
});
test('file reads deduplicate inflight and zero-byte results', async () => {
    const b = boot(); let reads = 0;
    b.load({default:native({getSize:async () => { reads++; return 0; }})});
    const a = b.api.getSize('content://one');
    const c = b.api.getSize('content://one');
    assert.equal(a,c);
    assert.equal(await a,0);
    assert.equal(await b.api.getSize('content://one'),0);
    assert.equal(reads,1);
});
test('remote URLs never trigger metadata requests', async () => {
    const b = boot(); let reads = 0;
    b.load(native({getSize:async () => ++reads}));
    assert.equal(await b.api.getSize('https://example.com/private'),null);
    assert.equal(reads,0);
});
test('metadata errors resolve safely and negative-cache', async () => {
    const b = boot(); let reads = 0;
    b.load(native({getSize:async () => { reads++; throw Error('permission'); }}));
    assert.equal(await b.api.getSize('content://denied'),null);
    assert.equal(await b.api.getSize('content://denied'),null);
    assert.equal(reads,1);
});
test('metadata queue caps concurrency at four', async () => {
    const b = boot(); let running=0, peak=0;
    b.load(native({getSize:async () => {
        running++; peak=Math.max(peak,running); await flush(); running--; return 1;
    }}));
    await Promise.all(Array.from({length:30}, (_,i) => b.api.getSize('content://'+i)));
    assert.equal(peak,4);
});
test('disabling picker avoids new reads and resolves queued work', async () => {
    const b = boot(); const releases=[];
    b.load(native({getSize:() => new Promise(resolve => releases.push(resolve))}));
    const results=Array.from({length:8},(_,i) => b.api.getSize('content://'+i));
    await flush(); b.api.setSetting('picker',false);
    assert.equal(await b.api.getSize('content://new'),null);
    releases.forEach(resolve => resolve(1));
    assert.equal((await Promise.all(results)).filter(value => value===null).length,4);
});
test('preferences restore asynchronously with exact native bridge signature', async () => {
    const b=boot(); const writes=[];
    b.load(native({fileExists:async () => true, readFile:async (path,encoding) => {
        assert.equal(path,'/data/discord/files/venus-patches.json'); assert.equal(encoding,'utf8');
        return '{"picker":false,"voice":true,"fallbackDuration":12}';
    }, writeFile:async (...args) => writes.push(args)}));
    await flush(); assert.equal(b.api.settings.picker,false); assert.equal(b.api.settings.voice,true);
    b.api.setSetting('voice',false); await flush();
    assert.deepEqual(writes[0].slice(0,2),['documents','venus-patches.json']);
    assert.equal(writes[0][3],'utf8'); assert.equal(JSON.parse(writes[0][2]).voice,false);
});
test('user edits win over late preference restore', async () => {
    const b=boot(); let resolveRead;
    b.load(native({fileExists:async () => true, readFile:() => new Promise(resolve => resolveRead=resolve)}));
    await flush(); b.api.setSetting('voice',true);
    resolveRead('{"voice":false}'); await flush();
    assert.equal(b.api.settings.voice,true); assert.equal(b.api.status.storage,'saved');
});
test('failed persistence remains usable and reported', async () => {
    const b=boot(); b.load(native({writeFile:async () => {throw Error('full');}}));
    await flush(); b.api.setSetting('voice',true); await flush();
    assert.equal(b.api.settings.voice,true); assert.match(b.api.status.storage,/save failed/);
});
test('feature selection and unknown settings are enforced', () => {
    const b=boot({picker:false,voice:false});
    assert.equal(b.api.setSetting('voice',true),false);
    assert.equal(b.api.setSetting('picker',true),false);
    assert.equal(b.api.setSetting('fallbackDuration',12.5),false);
    assert.equal(b.api.setSetting('unknown',true),false);
});
test('voice metadata uses copies, retains existing metadata and MIME', async () => {
    const b=await voiceHarness();
    assert.equal(b.payload.duration_secs,14.25); assert.equal(typeof b.payload.waveform,'string');
    assert.equal(b.audio.mimeType,'audio/ogg'); assert.equal(b.audio.durationSecs,14.25);
    assert.equal(b.originalItem.uri,'content://audio'); assert.equal(b.originalItem.mimeType,'audio/mp3');
    const actual=b.serializer.getAttachmentPayload({mimeType:'audio/mp3',durationSecs:14,waveform:'actual'});
    assert.equal(actual.duration_secs,14); assert.equal(actual.waveform,'actual');
});
test('non-audio and spoiler attachments are not converted', async () => {
    const b=await voiceHarness();
    assert.equal(b.serializer.getAttachmentPayload({mimeType:'image/png'}).duration_secs,undefined);
    assert.equal(b.serializer.getAttachmentPayload({mimeType:'audio/ogg',spoiler:true}).duration_secs,undefined);
});
test('message-level voice flag is set at final post without destroying flags or input', async () => {
    const b=await voiceHarness();
    const request={url:'/channels/123/messages', body:{attachments:[b.payload],flags:4096}};
    assert.equal(b.http.post(request,'second'),'original');
    assert.equal(b.received[0][0].body.flags,4096|8192);
    assert.equal(request.body.flags,4096); assert.equal(b.received[0][1],'second');
});
test('HTTP named export and nested HTTP alias are both hooked', async () => {
    const b=await voiceHarness(); const outputs=[];
    const object={get(){},put(){},post:request => outputs.push(request)};
    const exports=b.load({...object,HTTP:object});
    exports.HTTP.post({url:'/channels/1/messages',body:{attachments:[b.payload]}});
    assert.equal(outputs[0].body.flags,8192);
});
test('body copies retain bounded upload identity matching', async () => {
    const b=await voiceHarness(); const clone=JSON.parse(JSON.stringify(b.payload));
    b.http.post({url:'/channels/3/messages',body:{attachments:[clone]}});
    assert.equal(b.received[0][0].body.flags,8192);
});
test('text and mixed attachments keep ordinary message behavior', async () => {
    const b=await voiceHarness();
    for (const body of [
        {content:'text',attachments:[b.payload]},
        {attachments:[b.payload,{id:'1',filename:'image.png'}]},
        {attachments:[b.payload],sticker_ids:['1']},
        {attachments:[b.payload],poll:{}},
    ]) {
        b.http.post({url:'/channels/1/messages',body});
        const sent=b.received.at(-1)[0].body;
        assert.equal(sent.flags,undefined); assert.equal(sent.attachments[0].waveform,undefined);
        assert.equal(sent.attachments[0].duration_secs,undefined);
    }
});
test('toggle off between serialization and sending removes custom voice metadata', async () => {
    const b=await voiceHarness(); b.api.setSetting('voice',false);
    b.http.post({url:'/channels/1/messages',body:{attachments:[b.payload]}});
    assert.equal(b.received[0][0].body.flags,undefined);
    assert.equal(b.received[0][0].body.attachments[0].waveform,undefined);
});
test('unrelated HTTP traffic is untouched', async () => {
    const b=await voiceHarness();
    const request={url:'/users/@me',body:{attachments:[b.payload]}};
    b.http.post(request); assert.equal(b.received[0][0],request);
});
test('non-configurable accessor exports can be hooked without mutation', async () => {
    const b=await voiceHarness(); const exports={};
    Object.defineProperty(exports,'getAttachmentPayload',{get:() => () => ({uploaded_filename:'new'}),enumerable:true});
    const patched=b.load(exports);
    assert.equal(patched.getAttachmentPayload(b.audio).duration_secs,14.25);
    assert.equal(exports.getAttachmentPayload({mimeType:'audio/ogg'}).duration_secs,undefined);
});
test('unrelated throwing getters are not evaluated', () => {
    const b=boot(); const exports={};
    Object.defineProperty(exports,'unrelated',{get(){throw Error('do not touch');}});
    assert.equal(b.load(exports),exports); assert.equal(b.warnings.length,0);
});
test('picker wrapper supports memo and does not mutate frozen React props', () => {
    const b=boot();
    b.load({createElement:(type,props,...children) => ({type,props:{...props,children}}),useState(){}});
    b.load({View:'View',Text:'Text',Modal:'Modal'});
    function Pressable(props) { return props; }
    const memo={$$typeof:Symbol.for('react.memo'),type:Pressable};
    const component=b.load({default:memo}).default;
    const child={props:{localImageSource:{uri:'content://tile'}}};
    const props=Object.freeze({children:Object.freeze([child]),onPress(){}});
    const patched=component.type(props);
    assert.notEqual(patched,props); assert.equal(props.children[0],child);
    assert.equal(patched.children.props.pointerEvents,'box-none');
    b.api.setSetting('picker',false); assert.equal(component.type(props),props);
});
test('Discord root registration stays stock: no floating menu or root wrapper', () => {
    const b=boot(); const registrations=[];
    const registry=b.load({registerComponent(...args){registrations.push(args);return 1;}});
    const provider=arg => {assert.equal(arg,'extra');return function App(){};};
    registry.registerComponent('Discord',provider,true);
    assert.equal(registrations[0][1],provider); assert.equal(b.api.status.menu,false);
    assert.doesNotMatch(raw,/function Menu\(|VenusRoot|RN\.Modal|registerRoot/);
});

test('unrelated module definitions are passed through without factory wrapping', () => {
    const b=boot(); const factory=() => {};
    for (let id=20000;id<30000;id++) {
        b.context.__d(factory,id,[]);
        assert.equal(b.factories.get(id),factory);
    }
});
test('only the inspected module ID is allowed to hook an export lookalike', () => {
    const b=boot();
    b.load({getAttachmentPayload:() => ({})},undefined,9999);
    assert.equal(b.api.status.attachment,false);
});
test('native file HostObject-style accessors are supported at its verified ID', async () => {
    const b=boot(); const implementation=native(); const host={};
    for (const key of Object.keys(implementation))
        Object.defineProperty(host,key,{get:() => implementation[key],enumerable:true});
    b.load({default:host},undefined,1151);
    assert.equal(await b.api.getSize('content://host'),1024);
    await flush(); assert.equal(b.api.status.storage,'ready');
});
test('voice disabled by default leaves serialization unchanged', () => {
    const b=boot(); const object={uploaded_filename:'a'};
    const serializer=b.load({getAttachmentPayload:() => object});
    assert.equal(serializer.getAttachmentPayload({mimeType:'audio/ogg'}),object);
});
test('real voice metadata is preserved when custom conversion is switched off', async () => {
    const b=await voiceHarness();
    const payload=b.serializer.getAttachmentPayload({mimeType:'audio/ogg',durationSecs:2,waveform:'actual'});
    b.api.setSetting('voice',false);
    b.http.post({url:'/channels/1/messages',body:{attachments:[payload],flags:8192}});
    const sent=b.received[0][0].body;
    assert.equal(sent.flags,8192); assert.equal(sent.attachments[0].duration_secs,2);
    assert.equal(sent.attachments[0].waveform,'actual');
});

test('native conversion runs once per upload and updates the actual URI and byte size', async () => {
    const b=await voiceHarness();
    await Promise.all([b.audio.reactNativeCompressAndExtractData(),b.audio.reactNativeCompressAndExtractData()]);
    assert.equal(b.commands.filter(command => command.action==='prepare').length,1);
    assert.equal(b.audio.item.uri,b.result.uri); assert.equal(b.audio.currentSize,8192);
    assert.equal(b.audio.reactNativeFilePrepped,true); assert.equal(b.audio.originalCalls,0);
});
test('unsupported codecs safely retain original ordinary attachments', async () => {
    const b=await voiceHarness();
    b.api.setSetting('voice',false);
    const source={mimeType:'audio/wma',filename:'a.wma',uri:'content://unsupported'};
    const upload=new b.CloudUpload(source);
    b.api.setSetting('voice',true);
    // Replace only the native prepare operation; ordinary metadata behavior remains intact.
    const filesObject= b.context.__venusPatches;
    // Use a fresh bootstrap to install a failing native bridge before any conversion.
    const fresh=boot(); fresh.api.setSetting('voice',true);
    fresh.load({default:native({getSize:async () => {throw Error('unsupported codec');}})});
    class CloudUpload {constructor(){this.item=source;this.mimeType=source.mimeType;this.calls=0;}
        reactNativeCompressAndExtractData(){this.calls++;return Promise.resolve(this);}}
    fresh.load({CloudUpload}); const actual=new CloudUpload();
    await actual.reactNativeCompressAndExtractData();
    assert.equal(actual.calls,1); assert.equal(actual.item,source); assert.match(fresh.api.status.audioError,/unsupported codec/);
    const serializer=fresh.load({getAttachmentPayload:() => ({uploaded_filename:'ordinary'})});
    assert.equal(serializer.getAttachmentPayload(actual).waveform,undefined);
});
test('turning conversion off cancels inflight native work and does not mutate original upload', async () => {
    const b=boot(); b.api.setSetting('voice',true); let finish; const commands=[];
    b.load({default:native({getSize:request => {
        const command=JSON.parse(request.slice('venus-voice-v1:'.length));commands.push(command);
        return command.action==='prepare' ? new Promise(resolve => finish=resolve) : Promise.resolve('ok');
    }})});
    class CloudUpload {constructor(){this.item={uri:'content://pending',mimeType:'audio/mp3'};this.mimeType='audio/mp3';this.calls=0;}
        reactNativeCompressAndExtractData(){this.calls++;return Promise.resolve(this);}}
    b.load({CloudUpload});const upload=new CloudUpload(); const result=upload.reactNativeCompressAndExtractData();
    await flush();b.api.setSetting('voice',false);
    finish(JSON.stringify({uri:'file:///cache/job.ogg',filename:'voice-message.ogg',mimeType:'audio/ogg',size:1,durationSecs:1,waveform:'AQ=='}));
    await result;
    assert.equal(upload.item.uri,'content://pending');assert.equal(upload.calls,1);
    assert.ok(commands.some(command => command.action==='cancel'));
    assert.ok(commands.some(command => command.action==='release'));
});
test('RN environment initialization finishes before any feature hook reads native exports', async () => {
    const b=boot({picker:true,voice:true},false);
    let initialized=false, reads=0;
    const bridge=native({getConstants(){ assert.equal(initialized,true); reads++; return {DocumentsDirPath:'/data/files'}; }});
    const nativeExport={};
    Object.defineProperty(nativeExport,'default',{get(){ assert.equal(initialized,true); return bridge; }});
    const registry={SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route'}}};
    const setup=b.load({default(){
        b.load(nativeExport,null,1151);
        assert.equal(b.load(registry,null,14892),registry);
        assert.equal(b.api.status.menu,false);
        assert.equal(reads,0);
        initialized=true;
        return 42;
    }},null,120);
    assert.equal(setup.default(),42);
    assert.equal(reads,1);
    assert.equal(b.api.status.menu,true);
    assert.equal(registry.SETTING_RENDERER_CONFIG.VENUS_GENERAL.type,'route');
    await flush();
});
test('failed or reentrant environment setup never activates hooks prematurely', () => {
    const b=boot({picker:true,voice:true},false);
    const registry={SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route'}}};
    b.load(registry,null,14892);
    const failed=b.load({default(){throw Error('original RN setup failure');}},null,120);
    assert.throws(()=>failed.default(),/original RN setup failure/);
    assert.equal(b.api.status.menu,false);
    let calls=0, setup;
    setup=b.load({default(){
        if (++calls===1) {
            setup.default();
            assert.equal(b.api.status.menu,false);
        }
    }},null,120);
    setup.default();
    assert.equal(b.api.status.menu,true);
});
test('mutable export wrappers preserve object identity and have no receiver TDZ', () => {
    const b=boot();
    const http={get(){},put(){},post(request){assert.equal(this,http);return request;}};
    assert.equal(b.load(http),http);
    const request={url:'/unrelated'};
    assert.equal(http.post(request),request);
});
test('conversion disabled has no codec bridge calls for audio uploads', async () => {
    const b=boot();let calls=0;
    b.load({default:native({getSize:async () => {calls++;return 1;}})});
    class CloudUpload {constructor(){this.item={uri:'content://audio',mimeType:'audio/mp3'};this.mimeType='audio/mp3';}
        reactNativeCompressAndExtractData(){return Promise.resolve(this);}}
    b.load({CloudUpload}); const upload=new CloudUpload();
    await upload.reactNativeCompressAndExtractData();assert.equal(calls,0);
});

const allFeatures = {picker:true, voice:true, copyBios:true, dashless:true, favouriteAnything:true, freeNitro:true, noTyping:true, quickDelete:true, noDelete:true, jumpToTop:true, hiddenChannels:true, pastelize:true, platformIndicators:true, reviewDB:true};
function reactHarness(b) {
    const React = {
        createElement(type, props, ...children) { return {type, props:{...props, ...(children.length ? {children:children.length === 1 ? children[0] : children} : {})}}; },
        cloneElement(node, props) {return {...node, props:{...node.props,...props}};},
        useState:() => [0, () => {}], useEffect() {},
    };
    const RN = {View:'View', Text:'Text', Modal:'Modal', Pressable:'Pressable'};
    b.load(React, null, 19); b.load(RN, null, 17);
    return {React,RN};
}
function settingsHarness(features = allFeatures) {
    const b = boot(features); const {React}=reactHarness(b);
    function SettingsList() {}
    b.load({SettingsList},null,14993);
    const original=Object.freeze({ACCOUNT:Object.freeze({type:'route',IconComponent:function Icon(){}})});
    const exports=b.load({SETTING_RENDERER_CONFIG:original},null,14892);
    const builder=b.load({createList(config,extra){ assert.equal(this,builder); return {...config,type:'list',extra};}},null,11754);
    return {...b,React,SettingsList,original,registry:exports.SETTING_RENDERER_CONFIG,builder};
}
function nitroHarness() {
    const b=boot(allFeatures);
    const user={id:'me',premiumType:null};
    const channel={id:'channel',guild_id:'home'};
    const emojis={ '1':{id:'1',guildId:'home'}, '2':{id:'2',guildId:'other'}, '3':{id:'3',guildId:'home',animated:true}, '4':{id:'4',guildId:'other',available:false} };
    const stickers={ '10':{id:'10',guild_id:'home',format_type:1,name:'local',available:true},
        '20':{id:'20',guild_id:'other',format_type:1,name:'external',available:true},
        '30':{id:'30',guild_id:'other',format_type:4,name:'animated',available:true},
        '40':{id:'40',guild_id:'other',format_type:3,name:'lottie',available:true},
        '50':{id:'50',guild_id:'other',format_type:2,name:'apng',available:true},
        '60':{id:'60',guild_id:'other',format_type:1,name:'disabled',available:false} };
    b.load({default:{getCurrentUser:() => user}},null,1372);
    b.load({default:{getChannel:id => id === 'channel' ? channel : undefined}},null,2041);
    b.load({default:{getCustomEmojiById:id => emojis[id]}},null,5708);
    b.load({default:{getStickerById:id => stickers[id]}},null,5751);
    const premium=b.load({default:{canUseEmojisEverywhere:user => user.premiumType===2,
        canUseAnimatedEmojis:user => user.premiumType===2,
        canUseCustomStickersEverywhere:user => user.premiumType===2}},null,4446).default;
    const rules=b.load({StickerSendability:{SENDABLE:0,SENDABLE_WITH_PREMIUM:1,NONSENDABLE:2},
        getStickerSendability:sticker => !sticker || sticker.available === false ? 2 : sticker.guild_id==='home' || user.premiumType===2 ? 0 : 1,
        isSendableSticker:sticker => !!sticker && (sticker.guild_id==='home' || user.premiumType===2)},null,7611);
    const sent=[];
    const actions=b.load({default:{sendMessage(...args){assert.equal(this,actions);sent.push(args);return 'sent';},
        _sendMessage(...args){assert.equal(this,actions);sent.push(args);return 'upload';},
        sendStickers(...args){assert.equal(this,actions);sent.push(args);return 'stickers';}}},null,7730).default;
    return {...b,user,channel,emojis,stickers,premium,rules,actions,sent};
}
test('native registry adds authorless General, Plugins and FreeNitro routes without changing stock config', () => {
    const b=settingsHarness();
    assert.equal(b.original.VENUS_GENERAL,undefined);
    assert.equal(b.registry.ACCOUNT,b.original.ACCOUNT);
    for (const key of ['VENUS_GENERAL','VENUS_PLUGINS','VENUS_FREENITRO']) {
        assert.equal(b.registry[key].type,'route'); assert.equal(b.registry[key].screen.route,key);
        const screen=b.registry[key].screen.getComponent();assert.equal(screen,b.registry[key].screen.getComponent());
        assert.equal(screen().type,b.SettingsList);
    }
    assert.equal(b.registry.VENUS_EMOJIS.parent,'VENUS_FREENITRO');
    assert.equal(b.registry.VENUS_STICKERS.parent,'VENUS_FREENITRO');
    for (const value of Object.values(b.registry)) assert.equal(value.authors,undefined);
    assert.equal(b.api.status.menu,true);
});
test('Venus section inserts once after Account with immutable list input and stock lists untouched', () => {
    const b=settingsHarness();
    const first=Object.freeze({label:'account',settings:Object.freeze(['ACCOUNT'])});
    const input=Object.freeze({sections:Object.freeze([first,{label:'app',settings:['APPEARANCE']}])});
    const result=b.builder.createList(input,'extra');
    assert.equal(input.sections.length,2);assert.equal(result.sections.length,3);assert.equal(result.extra,'extra');
    assert.equal(result.sections[0],first);assert.equal(result.sections[1].label,'Venus');
    assert.deepEqual(Array.from(result.sections[1].settings),['VENUS_GENERAL','VENUS_PLUGINS']);
    const again=b.builder.createList(result);assert.equal(again.sections,result.sections);
    const other={sections:[{settings:['CHAT']}]};assert.equal(b.builder.createList(other).sections,other.sections);
});
test('native toggle closures bind each key independently and respect patch selection', () => {
    const b=settingsHarness();
    b.registry.VENUS_COPYBIOS.onValueChange(false); assert.equal(b.api.settings.copyBios,false);
    assert.equal(b.api.settings.dashless,true);
    b.registry.VENUS_EMOJIS.onValueChange(false); assert.equal(b.api.settings.emojis,false);
    assert.equal(b.registry.VENUS_STICKERS.useValue(),true);
    const selected=settingsHarness({picker:false,voice:false,freeNitro:false});
    assert.equal(selected.registry.VENUS_EMOJIS,undefined);assert.equal(selected.registry.VENUS_COPYBIOS,undefined);
    assert.equal(selected.api.setSetting('emojis',true),false);
});
test('new plugin preferences persist and late restores cannot overwrite edits', async () => {
    const b=boot(allFeatures);let complete;const writes=[];
    b.load(native({fileExists:async()=>true,readFile:()=>new Promise(resolve=>complete=resolve),writeFile:async(...args)=>writes.push(args)}));
    await flush();b.api.setSetting('stickers',false);
    complete('{"emojis":false,"stickers":true,"copyBios":false,"hyperlinks":false,"forceLinks":true}');await flush();
    assert.equal(b.api.settings.stickers,false);assert.equal(b.api.settings.emojis,false);
    assert.equal(b.api.settings.copyBios,false);assert.equal(b.api.settings.hyperlinks,false);assert.equal(b.api.settings.forceLinks,true);
    assert.equal(JSON.parse(writes.at(-1)[2]).stickers,false);
});
test('unselected plugin factories remain completely unwrapped', () => {
    const b=boot({picker:false,voice:false});const factory=()=>{};
    for (const id of [245,414,1271,5375,5377,11503,4941,12662,13288,10661,10664,1372,2041,5708,5751,4446,7611,7730]) {
        b.context.__d(factory,id,[]);assert.equal(b.factories.get(id),factory);
    }
});
test('CopyBios clones frozen text nodes while preserving links, handlers and non-text children', () => {
    const b=boot(allFeatures);const {React,RN}=reactHarness(b);const onPress=()=>{};
    const text=Object.freeze(React.createElement(RN.Text,Object.freeze({children:'bio',onPress})));
    const icon=React.createElement('Image',{uri:'x'});
    const tree=Object.freeze(React.createElement(RN.View,{children:Object.freeze([text,icon])}));
    const bio=b.load({default:()=>tree},null,11503);
    const result=bio.default({});assert.notEqual(result,tree);
    assert.equal(text.props.selectable,undefined);assert.equal(result.props.children[0].props.selectable,true);
    assert.equal(result.props.children[0].props.onPress,onPress);assert.equal(result.props.children[1],icon);
    b.api.setSetting('copyBios',false);assert.equal(bio.default({}),tree);
});
test('Dashless changes only display labels and leaves messages, channel models and DM names untouched', () => {
    const b=boot(allFeatures);const label=b.load({default:channel=>channel.name},null,4941);
    const channel=Object.freeze({type:0,name:'hello-world'});
    assert.equal(label.default(channel),'hello world');assert.equal(channel.name,'hello-world');
    assert.equal(label.default({type:1,name:'user-name'}),'user-name');
    assert.equal(label.default({type:2,name:'voice-room'}),'voice-room');
    b.api.setSetting('dashless',false);assert.equal(label.default(channel),'hello-world');
});
test('FavouriteAnything preserves memo metadata and original source objects', () => {
    const b=boot(allFeatures);const memo=Object.freeze({$$typeof:Symbol.for('react.memo'),type:props=>props,compare:()=>true});
    const exports=b.load({default:memo},null,13288);
    assert.equal(exports.default.compare,memo.compare);
    const source=Object.freeze({uri:'https://cdn.discordapp.com/image.png',width:10,height:20});
    const props=Object.freeze({source,extra:'keep'});const result=exports.default.type(props);
    assert.equal(result.source.isGIFV,true);assert.equal(source.isGIFV,undefined);assert.equal(result.extra,'keep');
    b.api.setSetting('favouriteAnything',false);assert.equal(exports.default.type(props),props);
});
test('favourite media format correction uses copies and handles signed URLs case-insensitively', () => {
    const b=boot(allFeatures);const action=b.load({addFavoriteGIF:value=>value},null,10661);
    const item=Object.freeze({url:'https://cdn.discordapp.com/movie.MP4?ex=1',format:1});
    assert.equal(action.addFavoriteGIF(item).format,2);assert.equal(item.format,1);
    const image=Object.freeze({url:'https://example.com/photo.png',format:2});
    assert.equal(action.addFavoriteGIF(image).format,1);
    const gif={url:'https://example.com/animated.gif',format:1};assert.equal(action.addFavoriteGIF(gif),gif);
});
test('video favourite previews cache weakly, preserve signed queries and update category preview without data mutation', () => {
    const b=boot(allFeatures);
    const item=Object.freeze({url:'https://cdn.discordapp.com/a.MP4?ex=1&hm=signature',src:'https://cdn.discordapp.com/a.MP4?ex=1&hm=signature&format=webp#keep'});
    const favorites=Object.freeze([item]);const result=Object.freeze({favorites,favoritesCategory:{src:item.src},extra:'keep'});
    const utils=b.load({useFavoriteGIFsMobile:()=>result},null,10664);
    const a=utils.useFavoriteGIFsMobile(),c=utils.useFavoriteGIFsMobile();assert.equal(a.favorites,c.favorites);
    assert.match(a.favorites[0].src,/media\.discordapp\.net\/a.MP4\?ex=1&hm=signature&format=jpeg#keep$/);
    assert.equal(a.favoritesCategory.src,a.favorites[0].src);assert.equal(result.favorites[0],item);assert.equal(a.extra,'keep');
    const evil={url:'https://evil.test/a.mp4',src:'https://cdn.discordapp.com.evil.test/a.mp4'};
    const external=b.load({useFavoriteGIFsMobile:()=>({favorites:[evil]})},null,10664).useFavoriteGIFsMobile();assert.equal(external.favorites[0],evil);
});
test('FreeNitro only overrides emoji eligibility for the current user and each switch is independent', () => {
    const b=nitroHarness();assert.equal(b.premium.canUseEmojisEverywhere(b.user),true);
    assert.equal(b.premium.canUseEmojisEverywhere({id:'other',premiumType:null}),false);
    b.api.setSetting('emojis',false);assert.equal(b.premium.canUseAnimatedEmojis(b.user),false);
    assert.equal(b.rules.getStickerSendability(b.stickers['20']),0);
    b.api.setSetting('stickers',false);assert.equal(b.rules.getStickerSendability(b.stickers['20']),1);
});
test('emoji sharing preserves native emojis, content whitespace, arguments and unrelated invalid diagnostics', () => {
    const b=nitroHarness();const message=Object.freeze({content:'  <:local:1> <:external:2> <a:animated:3> <:unknown:999>  ',invalidEmojis:Object.freeze([{id:'2'},{id:'999'}]),extra:'keep'});
    assert.equal(b.actions.sendMessage('channel',message,true,{reply:'id'}),'sent');
    const args=b.sent[0];assert.equal(args[2],true);assert.deepEqual(args[3],{reply:'id'});
    assert.match(args[1].content,/^  <:local:1> \[external\]\(https:\/\/cdn.discordapp.com\/emojis\/2.webp/);
    assert.match(args[1].content,/3.gif/);assert.match(args[1].content,/<:unknown:999>  $/);
    assert.equal(args[1].invalidEmojis.length,1);assert.equal(args[1].invalidEmojis[0].id,'999');
    assert.equal(message.invalidEmojis.length,2);assert.equal(args[1].extra,'keep');
});
test('emoji sharing ignores code blocks, inline code, escaped tokens, unknown and unavailable emojis', () => {
    const b=nitroHarness();
    const message={content:'```<:x:2>``` `<:x:2>` \\<:x:2> [link](https://x/<:x:2>) <:disabled:4> <:unknown:999>'};
    b.actions.sendMessage('channel',message);assert.equal(b.sent[0][1],message);
    b.actions.sendMessage('missing',{content:'<:x:2>'});assert.equal(b.sent[1][1].content,'<:x:2>');
});
test('emoji links honor live Nitro changes, forcing and plain-link options without rewriting originals', () => {
    const b=nitroHarness();const message={content:'<:x:2>'};
    b.user.premiumType=2;b.actions.sendMessage('channel',message);assert.equal(b.sent.at(-1)[1],message);
    b.api.setSetting('forceLinks',true);b.api.setSetting('hyperlinks',false);
    b.actions.sendMessage('channel',message);assert.match(b.sent.at(-1)[1].content,/^https:\/\/cdn.discordapp.com\/emojis\/2.webp/);
    b.api.setSetting('emojis',false);b.actions.sendMessage('channel',message);assert.equal(b.sent.at(-1)[1],message);
});
test('oversized emoji link expansion falls back without losing the original draft or diagnostics', () => {
    const b=nitroHarness();const message={content:'x'.repeat(1980)+' <:x:2>',invalidEmojis:[{id:'2'}]};
    b.actions.sendMessage('channel',message);assert.equal(b.sent[0][1],message);
});
test('sticker links preserve mixed native stickers, replies, message content and options in one original send', () => {
    const b=nitroHarness();const ids=Object.freeze(['10','20','30']);const message=Object.freeze({content:'hello',invalidEmojis:[],extra:'keep'});const options=Object.freeze({reply:'message'});
    assert.equal(b.actions.sendStickers('channel',ids,message,options,true),'stickers');
    assert.equal(b.sent.length,1);const args=b.sent[0];assert.deepEqual(Array.from(args[1]),['10']);
    assert.match(args[2].content,/^hello\n\[external\]/);assert.match(args[2].content,/30.gif/);
    assert.equal(args[2].extra,'keep');assert.equal(args[3],options);assert.equal(args[4],true);assert.equal(ids.length,3);assert.equal(message.content,'hello');
});
test('APNG uses only Discord CDN and unsupported, unknown or unavailable stickers are never silently dropped', () => {
    const b=nitroHarness();b.actions.sendStickers('channel',['50'],'hello');assert.match(b.sent[0][2].content,/50.png/);
    for (const id of ['40','60','999']) {
        const ids=[id,'20'];const msg={content:'keep'};b.actions.sendStickers('channel',ids,msg);
        assert.equal(b.sent.at(-1)[1],ids);assert.equal(b.sent.at(-1)[2],msg);
    }
    assert.doesNotMatch(raw.slice(0,raw.indexOf("let pastelHash")),/ezgif\.com|fetch\(|setTimeout\(|setInterval\(/);
});
test('sticker sendability preserves unavailable, permission-blocked and unsupported states', () => {
    const b=nitroHarness();assert.equal(b.rules.getStickerSendability(b.stickers['60']),2);
    assert.equal(b.rules.getStickerSendability(b.stickers['40']),1);
    assert.equal(b.rules.isSendableSticker(b.stickers['20']),true);
    assert.equal(b.rules.isSendableSticker(b.stickers['60']),false);
    b.api.setSetting('stickers',false);assert.equal(b.rules.isSendableSticker(b.stickers['20']),false);
});
test('sticker sends retain native behavior after live Nitro changes and when disabled', () => {
    const b=nitroHarness();const ids=['20'];const message={content:'keep'};
    b.user.premiumType=2;b.actions.sendStickers('channel',ids,message);assert.equal(b.sent[0][1],ids);assert.equal(b.sent[0][2],message);
    b.user.premiumType=null;b.api.setSetting('stickers',false);b.actions.sendStickers('channel',ids,message);assert.equal(b.sent[1][1],ids);
});

test('explicit default-valued changes win against late preference restore', async () => {
    const b=boot(allFeatures);let complete;
    b.load(native({fileExists:async()=>true,readFile:()=>new Promise(resolve=>complete=resolve)}));
    await flush();b.api.setSetting('emojis',true);complete('{"emojis":false}');await flush();
    assert.equal(b.api.settings.emojis,true);
});
test('shared native attachment send boundary converts emoji captions without changing upload options', () => {
    const b=nitroHarness();const message=Object.freeze({content:'caption <:external:2>',attachments:[{id:'0'}]});const options={uploads:['unchanged'],reply:'id'};
    assert.equal(b.actions._sendMessage('channel',message,options),'upload');
    assert.match(b.sent[0][1].content,/emojis\/2.webp/);assert.equal(b.sent[0][1].attachments,message.attachments);assert.equal(b.sent[0][2],options);
});
test('native opaque-provider video favourites retain their original format', () => {
    const b=boot(allFeatures);const action=b.load({addFavoriteGIF:value=>value},null,10661);
    const item=Object.freeze({url:'https://tenor.com/view/provider-id',gifSrc:'https://media.tenor.com/opaque',format:2});
    assert.equal(action.addFavoriteGIF(item),item);
});
test('nested bio markup makes the outer Discord Text selectable without changing children or link presses', () => {
    const b=boot(allFeatures);const {React}=reactHarness(b);const link=React.createElement('Link',{children:'click',onPress:()=>{}});
    const tree=React.createElement('DiscordText',{children:[link]});
    const bio=b.load({default:()=>tree},null,11503);const result=bio.default({});
    assert.equal(result.props.selectable,true);assert.equal(result.props.children[0].props.onPress,link.props.onPress);assert.equal(tree.props.selectable,undefined);
});
test('double-backtick inline code and empty sticker sends remain unchanged', () => {
    const b=nitroHarness();const message={content:'``<:x:2>``'};
    b.actions.sendMessage('channel',message);assert.equal(b.sent[0][1],message);
    const ids=[];b.actions.sendStickers('channel',ids,'hello');assert.equal(b.sent[1][1],ids);assert.equal(b.sent[1][2],'hello');
});


test('Metro default imports preserve non-enumerable module markers for media viewer components', () => {
    const b=boot(allFeatures);
    const memo={$$typeof:Symbol.for('react.memo'),type:props=>props,compare:null};
    const exports={default:memo};Object.defineProperty(exports,'__esModule',{value:true});
    const patched=b.load(exports,null,13288);
    const metroDefault=patched.__esModule ? patched.default : patched;
    assert.equal(patched,exports);assert.equal(patched.__esModule,true);
    assert.equal(metroDefault.$$typeof,Symbol.for('react.memo'));
    assert.equal(typeof metroDefault.type,'function');
});
test('frozen component exports preserve React tags, symbols and lazy getter descriptors', () => {
    const b=boot(allFeatures);const symbol=Symbol('metadata');let reads=0;
    const memo={type:props=>props,compare:()=>true};
    Object.defineProperty(memo,'$$typeof',{value:Symbol.for('react.memo')});
    Object.defineProperty(memo,'displayName',{get(){reads++;return 'GIFFavButton';}});
    memo[symbol]='preserved';Object.freeze(memo);
    const exports={default:memo};Object.defineProperty(exports,'__esModule',{value:true});Object.freeze(exports);
    const patched=b.load(exports,null,13288);assert.equal(reads,0);
    assert.equal(patched.__esModule,true);assert.equal(patched.default.$$typeof,Symbol.for('react.memo'));
    assert.equal(patched.default[symbol],'preserved');assert.equal(patched.default.compare,memo.compare);
    assert.equal(Object.getOwnPropertyDescriptor(patched.default,'displayName').get,Object.getOwnPropertyDescriptor(memo,'displayName').get);
});
test('immutable function export hooks retain the Metro module marker and stock descriptors', () => {
    const b=boot(allFeatures);const exports={};
    Object.defineProperty(exports,'__esModule',{value:true});
    Object.defineProperty(exports,'addFavoriteGIF',{value:item=>item});
    const patched=b.load(exports,null,10661);assert.equal(patched.__esModule,true);
    assert.equal(patched.addFavoriteGIF({url:'https://example.com/movie.mp4',format:1}).format,2);
});


test('attachment tools and all five ports live in Plugins, never General', () => {
    const b=settingsHarness();
    const general=b.registry.VENUS_GENERAL.screen.getComponent()().props.node;
    assert.equal(general.sections.length,1);assert.equal(general.sections[0].label,'About');
    for (const id of ['PICKER','VOICE','NOTYPING','NODELETE','JUMPTOTOP','HIDDENCHANNELS','QUICKDELETE'])
        assert.equal(b.registry['VENUS_'+id].parent,'VENUS_PLUGINS');
    for (const key of ['quickDelete','quickDeleteEmbeds','noDelete','hiddenChannels']) assert.equal(b.api.settings[key],false);
});
test('unselected new plugins do not wrap any optional factory or expose switches', () => {
    const b=boot({});const factory=()=>{};
    for (const id of [12272,5141,1115,573,5008,7730,12549,10518,11207,2096,4427,14280,1074,1101]) {
        b.context.__d(factory,id,[]);assert.equal(b.factories.get(id),factory);
    }
    const settings=settingsHarness({});assert.equal(settings.registry.VENUS_NOTYPING,undefined);
});
test('No typing restores both original methods and receiver when switched off', () => {
    const b=boot(allFeatures);const calls=[];
    const actions={startTyping(...args){assert.equal(this,actions);calls.push(args);return 'start';},
        stopTyping(...args){assert.equal(this,actions);calls.push(args);return 'stop';}};
    const patched=b.load({default:actions},null,12272).default;
    patched.startTyping('123');patched.stopTyping('123');assert.equal(calls.length,0);
    b.api.setSetting('noTyping',false);
    assert.equal(patched.startTyping('123'),'start');assert.equal(patched.stopTyping('456'),'stop');
    assert.deepEqual(calls,[['123'],['456']]);
});
test('QuickDelete uses exact localized strings, independent switches and stock fallback', () => {
    const b=boot(allFeatures);let shown=0,confirmed=0;
    const tokens={AMvpS4:'message', 'vXZ+Fo':'embed'};const translations={message:'Supprimer le message ?',embed:'Supprimer cet aperçu ?'};
    b.load({t:tokens,intl:{string:key=>translations[key]}},null,1115);
    const popup={show(value){shown++;return value;}};
    const action=b.load({default:popup},null,5141).default;
    const message={children:{props:{title:translations.message}},onConfirm(){confirmed++;return 'confirmed';}};
    assert.equal(action.show(message),message);b.api.setSetting('quickDelete',true);
    assert.equal(action.show(message),'confirmed');assert.equal(confirmed,1);
    const other={body:'Delete channel',onConfirm(){throw Error('must not confirm');}};assert.equal(action.show(other),other);
    const substring={body:'Unrelated '+translations.message,onConfirm(){throw Error('unsafe matching');}};assert.equal(action.show(substring),substring);
    const embed={body:translations.embed,onConfirm(){confirmed++;}};action.show(embed);assert.equal(confirmed,1);
    b.api.setSetting('quickDeleteEmbeds',true);action.show(embed);assert.equal(confirmed,2);
    b.api.setSetting('quickDelete',false);action.show(message);assert.equal(confirmed,2);assert.equal(shown,5);
    translations.embed='';assert.equal(action.show(embed),embed);
});
function deletionHarness() {
    const b=boot(allFeatures), messages=new Map(),events=[],network=[];
    b.load({default:{getMessage:(channel,id)=>messages.get(channel+':'+id)}},null,5008);
    const flux={dispatch(event){assert.equal(this,flux);events.push(event);
        if (event.type==='MESSAGE_DELETE') messages.delete(event.channelId+':'+event.id);
        if (event.type==='MESSAGE_DELETE_BULK') event.ids.forEach(id=>messages.delete(event.channelId+':'+id));
        return 'dispatched';}};
    const dispatch=b.load({default:flux},null,573).default;
    const actions=b.load({default:{deleteMessage(...args){network.push(args);return 'remote';}}},null,7730).default;
    return {...b,messages,events,network,dispatch,actions};
}
test('NoDelete retains only cached messages, marks once and dismisses locally without server traffic', async () => {
    const b=deletionHarness();const event=Object.freeze({type:'MESSAGE_DELETE',channelId:'c',id:'1'});
    b.messages.set('c:1',{content:'hello'});assert.equal(b.dispatch.dispatch(event),'dispatched');assert.equal(b.messages.size,0);
    b.api.setSetting('noDelete',true);b.messages.set('c:1',{content:'hello'});
    b.dispatch.dispatch(event);assert.equal(b.messages.get('c:1').content,'hello');
    assert.equal(b.events.at(-1).type,'MESSAGE_UPDATE');assert.equal(b.events.at(-1).message.content,'hello');
    const n=b.events.length;b.dispatch.dispatch(event);assert.equal(b.events.length,n);
    await b.actions.deleteMessage('c','1');assert.equal(b.messages.size,0);assert.equal(b.network.length,0);
    assert.equal(b.actions.deleteMessage('c','2'),'remote');assert.equal(b.network.length,1);
    const unknown={...event,id:'missing'};assert.equal(b.dispatch.dispatch(unknown),'dispatched');assert.equal(b.events.at(-1),unknown);
});
test('NoDelete bulk handling is immutable, bounded and clears kept messages on disable', () => {
    const b=deletionHarness();b.api.setSetting('noDelete',true);
    b.messages.set('c:1',{});b.messages.set('c:2',{});
    const event=Object.freeze({type:'MESSAGE_DELETE_BULK',channelId:'c',ids:Object.freeze(['1','2','3']),extra:true});
    b.dispatch.dispatch(event);assert.equal(event.ids.length,3);
    assert.deepEqual(Array.from(b.events.at(-1).ids),['3']);assert.equal(b.events.at(-1).extra,true);
    for(let i=4;i<519;i++){b.messages.set('c:'+i,{});b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:String(i)});}
    assert.equal(b.messages.size,512);b.api.setSetting('noDelete',false);assert.equal(b.messages.size,0);
});
test('NoDelete clears session state at logout and lets unrelated events and arguments through', () => {
    const b=deletionHarness();b.api.setSetting('noDelete',true);b.messages.set('c:1',{});
    b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});
    const event={type:'LOGOUT'};assert.equal(b.dispatch.dispatch(event),'dispatched');assert.equal(b.events.at(-1),event);
    assert.equal(b.actions.deleteMessage('c','1'),'remote');
});
test('real default-export capability hooks unlock emoji selection but preserve native conversion checks', () => {
    const b=nitroHarness();const animation={},everywhere={},unrelated={};
    const catalog=b.load({ANIMATED_EMOJIS:animation,EMOJIS_EVERYWHERE:everywhere,
        canUserUse:(feature,user)=>user.premiumType===2},null,14280);
    const premium=b.load({default:{canUseEmojisEverywhere:user=>catalog.canUserUse(everywhere,user),
        canUseAnimatedEmojis:user=>catalog.canUserUse(animation,user),canUseCustomStickersEverywhere:()=>false}},null,4446).default;
    assert.equal(premium.canUseEmojisEverywhere(b.user),true);assert.equal(catalog.canUserUse(animation,b.user),true);
    assert.equal(catalog.canUserUse(unrelated,b.user),false);assert.equal(catalog.canUserUse(animation,{id:'other',premiumType:null}),false);
    b.actions.sendMessage('channel',{content:'<a:test:3> <:other:2>'});assert.match(b.sent[0][1].content,/3.gif/);assert.match(b.sent[0][1].content,/2.webp/);
    b.user.premiumType=2;b.actions.sendMessage('channel',{content:'<a:test:3>'});assert.equal(b.sent[1][1].content,'<a:test:3>');
    b.api.setSetting('emojis',false);b.user.premiumType=null;assert.equal(premium.canUseEmojisEverywhere(b.user),false);
});
test('JumpToTop clones frozen controls, keeps Jump to Present and uses each current channel ID', () => {
    const b=boot(allFeatures);const {React}=reactHarness(b),jumps=[];let present=0;
    b.load({default:{jumpToMessage:value=>jumps.push(value)}},null,7730);
    const child=Object.freeze(React.createElement('Button',{onPress:()=>present++,icon:'down'}));
    const result=Object.freeze(React.createElement('View',{children:child}));
    const component=b.load({default:()=>result},null,12549).default;
    const first=component({channelId:'100'});const controls=first.props.children.props.children;
    controls[0].props.children.props.onPress();controls[1].props.onPress();
    assert.equal(present,1);assert.equal(jumps[0].channelId,'100');assert.equal(jumps[0].messageId,'100');assert.equal(result.props.children,child);
    component({channelId:'200'}).props.children.props.children[0].props.children.props.onPress();assert.equal(jumps[1].channelId,'200');
    b.api.setSetting('jumpToTop',false);assert.equal(component({channelId:'100'}),result);
});
test('JumpToTop is available when Jump to Present is absent without wrapping unrelated voice controls', () => {
    const b=boot(allFeatures);reactHarness(b);const jumps=[];
    b.load({default:{jumpToMessage:value=>jumps.push(value)}},null,7730);
    b.load({default:'NativeFloatingButton'},null,12550);b.load({default:'NativeArrow'},null,12551);
    b.load({useChatInputContainerHeight:()=>140,useSmallSuggestionBarHeight:()=>28},null,9686);
    const component=b.load({default:()=>null},null,12549).default;
    const result=component({channelId:'123',screenIndex:0});assert.equal(result.props.style.bottom,180);
    assert.equal(result.props.children.props.children.type,'NativeFloatingButton');
    result.props.children.props.children.props.onPress();assert.equal(jumps[0].messageId,'123');
    assert.equal(component({}),null);
});
function hiddenHarness() {
    const b=boot(allFeatures);const {RN}=reactHarness(b);const alerts=[];RN.Alert={alert:(...args)=>alerts.push(args)};
    const category={id:'cat',type:4,guild_id:'g',name:'private',position:2};
    const text={id:'hidden',type:0,guild_id:'g',name:'staff-chat',position:3,parent_id:'cat',topic:'Staff only'};
    const other={id:'second',type:0,guild_id:'g',name:'second',position:4,parent_id:'cat'};
    const voice={id:'voice',type:2,guild_id:'g',name:'voice',position:1};
    const visible={id:'public',type:0,guild_id:'g',name:'public',position:0};
    const channels={cat:category,hidden:text,second:other,voice,public:visible};const allowed=new Set(['public']);
    b.load({default:{getChannel:id=>channels[id],getMutableGuildChannelsForGuild:()=>channels}},null,2041);
    const viewPermission={nativeBit:1024};
    b.load({Permissions:{VIEW_CHANNEL:viewPermission}},null,1074);
    const permission={can:(permission,channel)=>{assert.equal(permission,viewPermission);return allowed.has(channel.id);}};
    b.load({default:permission},null,4427);
    const result=Object.freeze({id:'g',SELECTABLE:Object.freeze([{channel:visible,comparator:0}]),VOCAL:Object.freeze([]),4:Object.freeze([])});
    const store=b.load({default:{getChannels:()=>result}},null,2096).default;
    const fetched=[];const actions=b.load({default:{fetchMessages:value=>fetched.push(value)}},null,7730).default;
    const label=b.load({default:channel=>channel.name},null,4941).default;
    return {...b,channels,allowed,permission,viewPermission,result,store,actions,fetched,alerts,label};
}
test('Hidden Channels adds cached metadata immutably, deduplicates categories and leaves permissions intact', () => {
    const b=hiddenHarness();assert.equal(b.store.getChannels('g'),b.result);b.api.setSetting('hiddenChannels',true);
    const result=b.store.getChannels('g');assert.equal(result.SELECTABLE.length,3);assert.equal(result.VOCAL.length,1);assert.equal(result[4].length,1);
    assert.equal(b.result.SELECTABLE.length,1);assert.equal(b.store.getChannels('g'),result);
    // Global bypass like the original plugin: UI sees true, realCheck reveals real false.
    assert.equal(b.permission.can(b.viewPermission,b.channels.hidden),true);
    assert.equal(b.permission.can(b.viewPermission,Object.assign({},b.channels.hidden,{realCheck:true})),false);
    assert.equal(b.label(b.channels.hidden),'staff chat');
    b.allowed.add('hidden');const next=b.store.getChannels('g');assert.notEqual(next,result);assert.equal(b.label(b.channels.hidden),'staff chat');
    b.api.setSetting('hiddenChannels',false);assert.equal(b.store.getChannels('g'),b.result);
});
test('Hidden Channels caches READY names while toggle is off so enabling later still resolves',()=>{
    const b=hiddenHarness();
    // Default toggle is off; READY arrives before the user enables.
    const dispatch=b.load({default:{dispatch(){}}},null,573).default;
    b.load({default:{getCurrentUser:()=>({id:'me'})}},null,1372);
    dispatch.dispatch({type:'CONNECTION_OPEN',user:{id:'me'},guilds:[{id:'g',channels:[{id:'hidden',name:'staff-chat',type:0},{id:'cat',name:'private',type:4}]}]});
    b.api.setSetting('hiddenChannels',true);
    // Store later redacts to server marker; cached gateway names must win.
    b.channels.hidden={...b.channels.hidden,name:'__hidden__'};
    b.channels.cat={...b.channels.cat,name:'__hidden__'};
    assert.equal(b.label(b.channels.hidden),'staff chat');
    assert.equal(b.label(b.channels.cat),'private');
});
test('Hidden Channels refuses message fetches for locked channels and preserves visible or disabled traffic', async () => {
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    await b.actions.fetchMessages({channelId:'hidden'});assert.equal(b.fetched.length,0);assert.equal(b.alerts[0][0],'Locked channel');assert.match(b.alerts[0][1],/Created: Unavailable/);assert.match(b.alerts[0][1],/Last message: No messages yet/);
    b.actions.fetchMessages({channelId:'public'});assert.equal(b.fetched.length,1);
    b.api.setSetting('hiddenChannels',false);b.actions.fetchMessages({channelId:'hidden'});assert.equal(b.fetched.length,2);
});

test('Hidden Channels blocks only locked channel navigation, including voice, with real native flag objects', () => {
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);const calls=[];
    const navigation=b.load({transitionTo:(...args)=>calls.push(args),replaceWith:(...args)=>calls.push(args),transitionToGuild:(...args)=>calls.push(args)},null,1101);
    navigation.transitionTo('/channels/g/hidden');navigation.replaceWith('/channels/g/voice');navigation.transitionToGuild('g','hidden');
    // The still-open prompt for 'hidden' is not stacked a second time.
    assert.equal(calls.length,0);assert.equal(b.alerts.length,2);assert.equal(b.alerts[1][0],'Locked voice channel');
    b.alerts[0][2][0].onPress();navigation.transitionToGuild('g','hidden');assert.equal(b.alerts.length,3);
    navigation.transitionTo('/channels/g/public',{keep:true});navigation.transitionTo('/settings/hidden');navigation.transitionToGuild('g','public');
    assert.equal(calls.length,3);assert.deepEqual(calls[0][1],{keep:true});
    b.api.setSetting('hiddenChannels',false);navigation.transitionTo('/channels/g/hidden');assert.equal(calls.length,4);
});
test('Hidden Channels cache refreshes replaced records and parent metadata without stale references', () => {
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);const first=b.store.getChannels('g');
    b.channels.hidden={...b.channels.hidden,topic:'updated'};const next=b.store.getChannels('g');assert.notEqual(next,first);
    assert.equal(next.SELECTABLE.find(e=>e.channel.id==='hidden').channel.topic,'updated');
    b.channels.cat={...b.channels.cat,name:'new parent'};assert.notEqual(b.store.getChannels('g'),next);
});
test('JumpToTop adds native-style action-sheet rows without mutating frozen trees and closes on press', () => {
    const b=boot(allFeatures);const {React}=reactHarness(b);const jumps=[];let closed=0;
    b.load({default:{jumpToMessage:value=>jumps.push(value)}},null,7730);
    const row=Object.freeze(React.createElement('ActionSheetRow',{label:'Mute',onPress:()=>{},icon:'old'}));
    const group=Object.freeze(React.createElement('Group',{children:Object.freeze([row])}));
    const sheet=b.load({default:()=>group},null,10518).default;
    const result=sheet({thread:{id:'99',type:11},onClose:()=>closed++});
    assert.equal(group.props.children.length,1);assert.equal(result.props.children.length,2);
    assert.equal(result.props.children[0].props.label,'Jump to top');result.props.children[0].props.onPress();
    assert.equal(jumps[0].messageId,'99');assert.equal(closed,1);
    b.api.setSetting('jumpToTop',false);assert.equal(sheet({thread:{id:'99',type:11}}),group);
});
test('connected channel action sheets preserve memo tags when injecting JumpToTop', () => {
    const b=boot(allFeatures);const {React}=reactHarness(b);b.load({default:{jumpToMessage:()=>{}}},null,7730);
    const memo=Object.freeze({$$typeof:Symbol.for('react.memo'),type:()=>React.createElement('Group',{children:[React.createElement('Row',{label:'Mute',onPress:()=>{}})]}),compare:null});
    const wrapper=b.load({default:()=>React.createElement(memo,{channel:{id:'100',type:0}})},null,11207).default;
    const tree=wrapper({channel:{id:'100',type:0}});assert.equal(tree.type.$$typeof,Symbol.for('react.memo'));
    assert.equal(tree.type.type(tree.props).props.children[0].props.label,'Jump to top');assert.equal(tree.type.compare,null);
});

test('prototype Flux methods are shadowed on the same live instance, preserving private dispatch state', () => {
    const b=boot(allFeatures);let calls=0;
    class Flux {
        #dispatches=0;
        dispatch(event){this.#dispatches++;calls++;return event;}
        count(){return this.#dispatches;}
    }
    const flux=new Flux();const patched=b.load({default:flux},null,573).default;
    assert.equal(patched,flux);const event={type:'OTHER'};assert.equal(patched.dispatch(event),event);
    assert.equal(flux.count(),1);assert.equal(calls,1);
});
test('prototype channel-store hooks retain store identity and inherited subscription methods', () => {
    const b=hiddenHarness();
    class Store {
        #result=b.result;
        getChannels(){return this.#result;}
        subscribe(){return this;}
    }
    const store=new Store();const patched=b.load({default:store},null,2096).default;
    assert.equal(patched,store);assert.equal(patched.subscribe(),store);assert.equal(patched.getChannels('g'),b.result);
    b.api.setSetting('hiddenChannels',true);assert.equal(patched.getChannels('g').SELECTABLE.length,3);
});


test('invalid native size values are not fabricated zero-byte files', async () => {
    const b = boot(); let value;
    b.load(native({getSize:async () => value}));
    for (const invalid of [null, undefined, false, true, '', ' ', {}, [], 0.5, -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        value = invalid;
        assert.equal(await b.api.getSize('content://invalid/' + Math.random()), null);
    }
    value = '2048'; assert.equal(await b.api.getSize('file://numeric'), 2048);
    value = 0; assert.equal(await b.api.getSize('file://empty'), 0);
});
test('queued size reads survive an unavailable preference directory', {timeout:1000}, async () => {
    const b = boot();
    const pending = b.api.getSize('content://before-bridge');
    b.load(native({getConstants:() => ({}), getSize:async () => 42}));
    assert.equal(await pending, 42);
    assert.match(b.api.status.storage, /unavailable/);
});
test('restoring picker off resolves queued reads without starting more native work', async () => {
    const b = boot(); const releases = []; let reads = 0;
    const requests = Array.from({length:12}, (_, i) => b.api.getSize('content://restore/' + i));
    b.load(native({fileExists:async () => true, readFile:async () => '{"picker":false}',
        getSize:() => { reads++; return new Promise(resolve => releases.push(resolve)); }}));
    await flush();
    assert.equal(b.api.settings.picker, false);
    releases.forEach(resolve => resolve(8));
    const values = await Promise.all(requests);
    assert.equal(reads, 4);
    assert.equal(values.filter(value => value === null).length, 8);
});
test('size cache evicts cold completed entries rather than recently used tiles', async () => {
    const b = boot(); const reads = new Map();
    b.load(native({getSize:async uri => { reads.set(uri, (reads.get(uri) || 0) + 1); return 8; }}));
    for (let i = 0; i < 256; i++) await b.api.getSize('file://' + i);
    await b.api.getSize('file://0');
    await b.api.getSize('file://new');
    await b.api.getSize('file://0');
    assert.equal(reads.get('file://0'), 1);
    await b.api.getSize('file://1');
    assert.equal(reads.get('file://1'), 2);
});
test('preference writes coalesce bursts and serialize only the latest waiting snapshot', async () => {
    const b = boot(); const writes = [], releases = [];
    b.load(native({writeFile:(directory, name, text) => {
        writes.push(JSON.parse(text)); return new Promise(resolve => releases.push(resolve));
    }}));
    await flush();
    b.api.setSetting('voice', true); await flush();
    for (let i = 0; i < 101; i++) b.api.setSetting('picker', i % 2 === 1);
    assert.equal(writes.length, 1);
    releases.shift()(); await flush();
    assert.equal(writes.length, 2);
    assert.equal(writes[1].picker, false);
    assert.equal(writes[1].voice, true);
    releases.shift()(); await flush();
    assert.equal(b.api.status.storage, 'saved');
});
test('malformed preference shapes are reported rather than treated as settings', async () => {
    for (const text of ['null', '[]', '42', '"settings"']) {
        const b = boot();
        b.load(native({fileExists:async () => true, readFile:async () => text}));
        await flush(); assert.match(b.api.status.storage, /read failed/);
        assert.equal(b.api.settings.picker, true);
    }
});
test('picker subscribers ignore unrelated toggles and persistence notifications', async () => {
    const b = boot(); let updates = 0; const cleanups = [];
    const React = {
        createElement:(type, props, ...children) => ({type, props:{...props, children}}),
        useState:() => [null, () => updates++],
        useEffect:effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    };
    b.load(React); b.load({View(){}, Text(){}, Modal(){}});
    const picker = b.load({default:function Pressable(props) { return props; }});
    const props = picker.default({children:{props:{localImageSource:{uri:'file://badge'}}}});
    const badge = props.children.props.children[1];
    badge.type(badge.props);
    b.load(native()); await flush(); // Restore notifies all settings once.
    const before = updates;
    b.api.setSetting('voice', true); await flush();
    assert.equal(updates, before);
    b.api.setSetting('picker', false);
    assert.equal(updates, before + 1);
    cleanups.forEach(cleanup => cleanup());
    b.api.setSetting('picker', true); await flush();
    assert.equal(updates, before + 1);
});
test('same-turn voice cancellation never submits a prepare after cancel', async () => {
    const b = boot(); const commands = [];
    b.api.setSetting('voice', true);
    b.load(native({getSize:async request => { commands.push(JSON.parse(request.slice('venus-voice-v1:'.length)).action); return 'ok'; }}));
    class CloudUpload {
        constructor() { this.item = {uri:'content://audio', mimeType:'audio/mp3'}; }
        reactNativeCompressAndExtractData() { return Promise.resolve(this); }
        isCancelled() { return !!this.cancelled; }
        cancel() { this.cancelled = true; }
    }
    b.load({CloudUpload});
    const upload = new CloudUpload();
    const pending = upload.reactNativeCompressAndExtractData();
    upload.cancel();
    await assert.rejects(pending, /cancelled/);
    assert.equal(commands.includes('prepare'), false);
});
test('invalid voice duration and byte size fall back without mutating the upload', async () => {
    for (const bad of [{durationSecs:Infinity}, {durationSecs:1201}, {size:1.5}, {size:'100'}]) {
        const b = boot(); b.api.setSetting('voice', true);
        const result = {uri:'file://cache/audio.ogg', mimeType:'audio/ogg', durationSecs:1, size:100, waveform:'AAA=', ...bad};
        b.load(native({getSize:async () => JSON.stringify(result)}));
        class CloudUpload {
            constructor() { this.item = {uri:'content://audio', mimeType:'audio/mp3'}; this.calls = 0; }
            reactNativeCompressAndExtractData() { this.calls++; return Promise.resolve(this); }
        }
        b.load({CloudUpload}); const upload = new CloudUpload();
        await upload.reactNativeCompressAndExtractData();
        assert.equal(upload.calls, 1); assert.equal(upload.item.uri, 'content://audio');
    }
});

class MessageCollection {
    constructor(messages=[]) {this.messages=messages;this.ready=true;this.hasMoreBefore=true;}
    clone(){const next=new MessageCollection(this.messages.slice());next.ready=this.ready;next.hasMoreBefore=this.hasMoreBefore;return next;}
    merge(records){for(const record of records){const index=this.messages.findIndex(m=>m.id===record.id);if(index<0)this.messages.push(record);else this.messages[index]=record;}this.messages.sort((a,b)=>a.id.localeCompare(b.id));return this;}
    toArray(){return this.messages;}
}
test('NoDelete snapshots survive incoming messages, cache replacement, reconnect and truncation',()=>{
    const b=deletionHarness();let collection=new MessageCollection([{id:'1',content:'original',author:{id:'u'}}]);
    const store=b.load({default:{getMessage:(c,id)=>collection.toArray().find(m=>m.id===id),getMessages:()=>collection}},null,5008).default;
    b.api.setSetting('noDelete',true);b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});
    assert.equal(store.getMessage('c','1').content,'original');
    collection=new MessageCollection([{id:'2',content:'new'}]);b.dispatch.dispatch({type:'MESSAGE_CREATE',channelId:'c',message:{id:'2'}});
    const retained=store.getMessages('c');assert.equal(retained.toArray().length,2);assert.equal(collection.toArray().length,1);
    assert.equal(retained.ready,true);assert.equal(retained.hasMoreBefore,true);assert.equal(store.getMessages('c'),retained);
    for(const type of ['CONNECTION_OPEN','CACHE_LOADED','MESSAGE_TRUNCATE']){b.dispatch.dispatch({type});assert.equal(store.getMessage('c','1').content,'original');}
    b.api.setSetting('noDelete',false);assert.equal(store.getMessages('c'),collection);assert.equal(store.getMessage('c','1'),undefined);
});
async function archiveHarness(saved,account='owner') {
    const b=boot(allFeatures);let disk=saved,writes=[];
    const store=b.load({default:{getMessage:()=>undefined,getMessages:()=>new MessageCollection(),emitChange(){}}},null,5008).default;
    b.load({createMessageRecord:raw=>({...raw})},null,5010);b.load({default:{getCurrentUser:()=>({id:account})}},null,1372);
    b.load({default:native({fileExists:async path=>path.endsWith('venus-deleted-messages.json')&&!!disk,
        readFile:async()=>disk,writeFile:async(dir,name,text)=>{writes.push([name,text]);if(name==='venus-deleted-messages.json')disk=text;}})});
    await flush();await flush();b.api.setSetting('noDelete',true);b.api.setSetting('noDeleteSave',true);await flush();await flush();
    return {...b,store,writes,getDisk:()=>disk};
}
test('NoDelete archive is opt-in, account-scoped, restores original content and can be erased',async()=>{
    const raw={id:'1',channel_id:'c',author:{id:'u'},content:'saved'};
    const saved=JSON.stringify({version:1,accountId:'owner',messages:[{id:'1',channelId:'c',message:raw}]});
    const b=await archiveHarness(saved);assert.equal(b.store.getMessage('c','1').content,'saved');
    assert.equal(JSON.parse(b.getDisk()).messages[0].message.content,'saved');
    b.api.setSetting('noDeleteSave',false);await flush();await flush();assert.equal(JSON.parse(b.getDisk()).messages.length,0);
    const other=await archiveHarness(saved,'different');assert.equal(other.store.getMessage('c','1'),undefined);
    const malformed=await archiveHarness('{broken');assert.equal(malformed.api.status.archive,'restore failed');assert.equal(malformed.store.getMessage('c','1'),undefined);
});
test('Hidden Channels mobile list facade handles named/default imports without changing real permission results',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    // boot's require mocks return nothing; load a realistic factory directly through __d instead.
    const real=b.permission;let captured;
    b.context.__d(function(g,req,imp,all,m){captured=[req(4427).default,imp(4427),all(4427).default];m.exports={};},7802,[]);
    b.factories.get(7802)(b.context,()=>({default:real}),()=>real,()=>({default:real}),{exports:{}},{},[]);
    // Global bypass is active when enabled; realCheck reveals the true false.
    for(const facade of captured){assert.equal(facade.can(b.viewPermission,b.channels.hidden),true);assert.equal(real.can(b.viewPermission,b.channels.hidden),true);}
    assert.equal(real.can(b.viewPermission,Object.assign({},b.channels.hidden,{realCheck:true})),false);
    b.api.setSetting('hiddenChannels',false);for(const facade of captured)assert.equal(facade.can(b.viewPermission,b.channels.hidden),false);
});
test('Hidden Channels fills numeric native channel-type buckets and gets direct permission constants',()=>{
    const b=hiddenHarness();b.load({Permissions:{VIEW_CHANNEL:b.viewPermission}},null,1085);b.load({},null,1074);
    const original={0:[],2:[],4:[],SELECTABLE:[],VOCAL:[]};const store=b.load({default:{getChannels:()=>original}},null,2096).default;
    b.api.setSetting('hiddenChannels',true);const value=store.getChannels('g');assert.equal(value[0].length,2);assert.equal(value[2].length,1);assert.equal(original[0].length,0);
});

test('Pastelize preserves role colors and immutable mentions, supports webhook and content controls',()=>{
    const b=boot(allFeatures);const {RN}=reactHarness(b);RN.processColor=hex=>parseInt(hex.slice(1),16)|0xff000000;
    // Pinned module 1240 is CommonJS: a direct function, not {default:fn}.
    b.load(seed=>Array.from(seed).reduce((a,c)=>a+c.charCodeAt(0),0),null,1240);
    class Rows {generate(row){return row.result;}}
    b.load({default:Rows},null,8222);
    const message=Object.freeze({authorId:'123',username:'Test',roleColor:null,content:Object.freeze([Object.freeze({type:'mention',userId:'456',content:'test'})])});
    const row={rowType:1,message:{},result:Object.freeze({message})}, rows=new Rows();
    const result=rows.generate(row);assert.notEqual(result,row.result);assert.equal(message.roleColor,null);assert.equal(typeof result.message.colorString,'number');assert.equal(result.message.colorString,result.message.roleColor);assert.equal(message.content[0].colorString,undefined);
    assert.match(result.message.content[0].colorString,/^#/);assert.equal(rows.generate(row).message.colorString,result.message.colorString);
    const colored={...row,result:{message:{...message,roleColor:123,content:[]}}};assert.equal(rows.generate(colored).message.roleColor,123);
    b.api.setSetting('pastelAll',true);assert.notEqual(rows.generate(colored).message.roleColor,123);
    b.api.setSetting('pastelContent',true);assert.equal(rows.generate(row).message.content[0].type,'link');
    b.api.setSetting('pastelize',false);assert.equal(rows.generate(row),row.result);
});
test('PlatformIndicators uses real client status, hides unknown/offline clients and preserves immutable profiles',()=>{
    const b=boot(allFeatures),{React}=reactHarness(b);const clients={desktop:'online',mobile:'idle',web:'offline',unknown:'dnd'};
    b.load({default:{getClientStatus:()=>clients,addChangeListener(){},removeChangeListener(){}}},null,4828);
    function DisplayName(props){return Object.freeze(React.createElement('Name',{children:props.user.id}));}
    const profile=Object.freeze(React.createElement('View',{children:React.createElement(DisplayName,{user:{id:'u'}})}));
    const exports=b.load({DisplayName,default:()=>profile},null,11448);
    const tree=exports.default({});assert.notEqual(tree,profile);const named=tree.props.children.type(tree.props.children.props);
    const badges=named.props.children[1];const rendered=badges.type(badges.props);
    assert.deepEqual(Array.from(rendered.props.children,c=>c.props.children.props.platform),['desktop','mobile']);
    assert.deepEqual(Array.from(rendered.props.children,c=>c.props.children.props.color),['#23a55a','#f0b232']);
    assert.deepEqual(Array.from(rendered.props.children,c=>c.props.accessibilityLabel),['Desktop: online','Mobile: idle']);
    b.api.setSetting('piProfile',false);assert.equal(exports.DisplayName({user:{id:'u'}}).type,'Name');b.api.setSetting('piProfile',true);
    b.api.setSetting('platformIndicators',false);assert.equal(badges.type(badges.props),null);
});
function reviewHarness() {
    const b=boot(allFeatures),{React,RN}=reactHarness(b);const alerts=[];RN.Alert={alert(...args){alerts.push(args);}};RN.ScrollView='ScrollView';RN.TextInput='RNTextInput';RN.Image='Image';
    React.Fragment='Fragment';
    const requests=[];b.context.fetch=async(url,options)=>{requests.push([url,options]);return {ok:true,json:async()=>url.includes('/auth?')?{success:true,token:'review-only-token'}:
        url.endsWith('/admins')?['999999999999999999']:{success:true,reviews:[{id:0,type:3,comment:'Be nice',sender:{discordID:'1',username:'Warning',badges:[]}},
            {id:1,comment:'hello',timestamp:1700000000,sender:{discordID:'333333333333333333',username:'Other',profilePhoto:'https://cdn.discordapp.com/a.png',badges:[{name:'Donor',icon:'https://cdn.discordapp.com/b.webp'}]}}]}};};
    const account={id:'111111111111111111'};const toasts=[],confirms=[],sheets=[],simple=[],pushed=[],popped=[],copied=[];
    const native={5854:{TableRow:'NativeRow'},5936:{TableRowGroup:'RowGroup'},7477:{TableSwitchRow:'SwitchRow'},5216:{Stack:'Stack'},7484:{default:'UserProfileCard'},
        8903:{FormRow:'FormRow',FormLabel:'FormLabel',FormSubLabel:'FormSubLabel'},6880:{TextInput:'NativeTextInput'},4732:{SendMessageIcon:'SendIcon'},
        7474:{ActionSheet:'ActionSheet'},7426:{BottomSheetTitleHeader:'SheetHeader'},7475:{ActionSheetCloseButton:'SheetClose'},
        4755:{default:{openLazy:(promise,key,props,options)=>sheets.push({promise,key,props,options}),hideActionSheet(){}}},7472:{showSimpleActionSheet:value=>simple.push(value)},
        7469:{Clipboard:{setString:value=>copied.push(value)}},5141:{default:{show:value=>confirms.push(value)}},4486:{default:{open:value=>toasts.push(value)}},
        4645:{pushModal:value=>pushed.push(value),popModal:key=>popped.push(key)},9358:{default:'OAuth2AuthorizeModal'},4505:{useThemeContext:()=>({primaryColor:'#123456'})}};
    b.context.__r=id=>native[id]||null;
    b.load({default:{getCurrentUser:()=>account}},null,1372);
    const noteOriginal=React.createElement('Note',null);
    const note=b.load({default:()=>noteOriginal},null,13373).default;
    const progressOriginal=React.createElement('Progress',null);
    const guild=b.load({default:()=>progressOriginal},null,14273).default;
    const menuCalls=[];const menu=b.load({ContextMenuPopout:props=>{menuCalls.push(props);return 'menu';}},null,14479);
    const registry=b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route'}}},null,14892).SETTING_RENDERER_CONFIG;
    const Settings=registry.VENUS_REVIEWDB.screen.getComponent();
    return {...b,React,RN,requests,alerts,account,toasts,confirms,sheets,simple,pushed,popped,copied,note,noteOriginal,guild,progressOriginal,menu,menuCalls,Settings,native};
}
// Schemas below reflect the inspected 347.12 boundaries; the older clone()-only
// mock hid a real native integration failure. These are not Android device tests.
class NativeChannelMessages {
    constructor(messages=[],state={ready:true,hasMoreBefore:true,jumpType:'ANIMATED'}) {Object.assign(this,state);this.messages=messages;}
    merge(records) {
        const merged=new Map(this.messages.map(message=>[message.id,message]));
        records.forEach(message=>merged.set(message.id,message));
        return new NativeChannelMessages(Array.from(merged.values()).sort((a,b)=>a.id.localeCompare(b.id)),this);
    }
    toArray(){return this.messages;}
}
test('NoDelete supports immutable ChannelMessages and refreshes identity without changing content',()=>{
    const b=deletionHarness();let collection=new NativeChannelMessages([{id:'1',channel_id:'c',content:'kept',author:{id:'u'}}]);
    const store=b.load({default:{getMessage:(c,id)=>collection.toArray().find(message=>message.id===id),getMessages:()=>collection}},null,5008).default;
    b.api.setSetting('noDelete',true);b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});
    assert.equal(b.events.at(-1).type,'MESSAGE_UPDATE');assert.equal(b.events.at(-1).message.content,'kept');
    assert.equal(typeof collection.clone,'undefined');assert.equal(collection.messages[0].content,'kept');
    assert.equal(store.getMessages('c').messages[0].content,'kept');
    collection=new NativeChannelMessages([{id:'2',content:'next'}]);b.dispatch.dispatch({type:'MESSAGE_CREATE',channelId:'c'});
    const view=store.getMessages('c');assert.equal(view.toArray().length,2);assert.equal(collection.toArray().length,1);
    assert.equal(view.ready,true);assert.equal(view.hasMoreBefore,true);assert.equal(view.jumpType,'ANIMATED');assert.equal(store.getMessages('c'),view);
});
test('NoDelete independently renders a native red gutter without altering content or adding a notice',async()=>{
    const b=deletionHarness(),{RN}=reactHarness(b);RN.processColor=color=>color;
    b.load({createAutomodBlockedMessageEmbed:({errorMessage,colors})=>Object.freeze({type:1,messageSendError:errorMessage,bodyTextColor:colors.automodBlockedBodyTextColor})},null,8455);
    class Rows {generate(row){return row.result;}}
    b.load({default:Rows},null,8222);const rows=new Rows();
    const message=Object.freeze({id:'1',channelId:'c',authorId:'u',content:[],embeds:Object.freeze([{type:'attachment'}])});
    const original=Object.freeze({message});const row={rowType:1,message:{id:'1',channel_id:'c'},result:original};
    assert.equal(rows.generate(row).message.embeds.length,1);
    b.api.setSetting('pastelize',false);b.api.setSetting('noDelete',true);b.messages.set('c:1',{id:'1',content:'original'});
    b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});
    for(let i=0;i<3;i++) {
        const rendered=rows.generate(row);assert.notEqual(rendered,original);assert.equal(rendered.message.embeds.length,1);
        assert.equal(rendered.message,original.message);assert.equal(rendered.message.content,original.message.content);
        assert.equal(rendered.backgroundHighlight.gutterColor,'#f23f43');assert.equal(rendered.backgroundHighlight.backgroundColor,'#f23f431a');
        assert.equal(original.message.embeds.length,1);
    }
    assert.equal(b.events.some(event=>event.type.includes('AUTOMOD')),false);
    await b.actions.deleteMessage('c','1');assert.equal(rows.generate(row),original);assert.equal(b.network.length,0);
});
test('Hidden Channels replaces obfuscated names in both native formatters, including empty locked sections',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    const names=b.load({default:c=>c.isObfuscated && c.isObfuscated() ? 'No Access' : c.name,computeChannelName:c=>c.isObfuscated && c.isObfuscated() ? 'No Access' : c.name},null,4941);
    const category={id:'empty',type:4,guild_id:'g',name:'PRIVATE STAFF',position:9};b.channels.empty=category;
    assert.equal(names.computeChannelName(b.channels.hidden),'staff chat');
    assert.equal(names.default(b.channels.hidden),'staff chat');assert.equal(names.computeChannelName(category),'PRIVATE STAFF');
    assert.equal(b.store.getChannels('g')[4].some(entry=>entry.channel.id==='empty'),true);
    // Global bypass reveals hidden categories; realCheck shows true denial.
    assert.equal(b.permission.can(b.viewPermission,category),true);
    assert.equal(b.permission.can(b.viewPermission,Object.assign({},category,{realCheck:true})),false);
    b.permission.can=(bit,channel)=>bit===b.viewPermission && b.allowed.has(channel.id);
    let facade;b.context.__d((g,r,i,a,m)=>{facade=i(4427);m.exports={};},7802,[]);
    b.factories.get(7802)(b.context,()=>b.permission,()=>b.permission,()=>b.permission,{exports:{}},{},[]);
    assert.equal(facade.can(b.viewPermission,category),true);assert.equal(facade.can('CONNECT',category),false);
    category.isObfuscated=()=>true;b.api.setSetting('hiddenChannels',false);assert.equal(names.computeChannelName(category),'No Access');assert.equal(facade.can(b.viewPermission,category),false);
});
test('Pastelize respects source role colors and unknown members, and colors webhook names and nested reply mentions',()=>{
    const b=boot(allFeatures),{RN}=reactHarness(b);RN.processColor=color=>color;
    const seeds=[];b.load(seed=>{seeds.push(seed);return seed.length*23;},null,1240);
    b.load({default:{getMember:(guild,id)=>id==='missing'?null:{id}}},null,2105);
    class Rows{generate(row){return row.result;}}b.load({default:Rows},null,8222);const rows=new Rows();
    const message={authorId:'author',guildId:'g',username:'Name',roleColor:null,content:[{type:'strong',content:[{type:'mention',userId:'member'},{type:'mention',userId:'missing'}]}]};
    const row={rowType:1,message:{colorString:'#123456'},result:{message}};
    let result=rows.generate(row);assert.equal(result.message.roleColor,null);assert.equal(result.message.shouldShowRoleOnName,true);
    assert.match(result.message.content[0].content[0].colorString,/^#/);assert.equal(result.message.content[0].content[1].colorString,undefined);
    const unknown={...row,result:{message:{...message,authorId:'missing'}}};assert.equal(rows.generate(unknown).message,unknown.result.message);
    const webhook={...row,message:{webhookId:'hook'},result:{message:{...message,referencedMessage:{message:{authorId:'reply',content:[],guildId:'g'}}}}};
    seeds.length=0;result=rows.generate(webhook);assert.equal(seeds.includes('Name'),true);assert.equal(seeds.includes('reply'),true);
    assert.notEqual(result.message.referencedMessage.message.roleColor,undefined);
    b.api.setSetting('pastelWebhookName',false);seeds.length=0;rows.generate(webhook);assert.equal(seeds.includes('hook'),true);
    b.api.setSetting('pastelAll',true);assert.notEqual(rows.generate(row).message.roleColor,null);
    assert.equal(message.content[0].content[0].colorString,undefined);
});
function platformFixture() {
    const b=boot({platformIndicators:true}),{React}=reactHarness(b);
    function DisplayName(props){return React.createElement('Name',{children:props.user.id});}
    const profile=b.load({DisplayName,default:()=>React.createElement('Profile',{children:React.createElement(DisplayName,{user:{id:'self'}})})},null,11448);
    const tree=profile.default({}),name=tree.props.children.type(tree.props.children.props);
    return {...b,React,badges:name.props.children[1]};
}
test('PlatformIndicators uses own sessions and cleans up both subscriptions',()=>{
    const b=platformFixture(),listeners=new Set(),removals=[];let sessions={one:{clientInfo:{client:'mobile'},status:'idle'},two:{clientInfo:{client:'web'},status:'dnd'},unknown:{clientInfo:{client:'unknown'},status:'online'}};
    const presence={getClientStatus:()=>({desktop:'online'}),addChangeListener:fn=>listeners.add(fn),removeChangeListener:fn=>{removals.push('presence');listeners.delete(fn);}};
    const store={getSessions:()=>sessions,addChangeListener:fn=>listeners.add(fn),removeChangeListener:fn=>{removals.push('sessions');listeners.delete(fn);}};
    b.load({default:presence},null,4828);b.load({default:{getCurrentUser:()=>({id:'self'})}},null,1372);
    b.context.__r=id=>({4806:{default:store}}[id]);
    let cleanup;b.React.useEffect=fn=>cleanup=fn();
    let tree=b.badges.type(b.badges.props);assert.deepEqual(Array.from(tree.props.children,c=>c.props.children.props.platform),['mobile','web']);
    cleanup();assert.deepEqual(removals,['presence','sessions']);
    sessions={one:{clientInfo:{client:'embedded'},status:'online'}};tree=b.badges.type(b.badges.props);
    assert.equal(tree.props.children[0].props.children.props.platform,'embedded');cleanup();
    b.api.setSetting('platformIndicators',false);assert.equal(b.badges.type(b.badges.props),null);cleanup();
});
function openReviewAuth(b) {
    b.api.setSetting('reviewDB',true);
    walkElements(b.Settings(),n=>n.props.label==='Authenticate with ReviewDB')[0].props.onPress();
    return b.pushed.at(-1).modal.props;
}
function mountReviews(b,userId) {
    const tree=b.note({userId}),section=tree.props.children[1];
    const states=[];let i=0;b.React.useState=initial=>{const k=i++;if(!(k in states))states[k]=initial;return [states[k],v=>{states[k]=typeof v==='function'?v(states[k]):v;}];};
    const effects=[];b.React.useEffect=fn=>effects.push(fn);
    return {tree,section,render(){i=0;return section.type(section.props);},effects};
}
async function loadedReviews(b,userId) {
    const m=mountReviews(b,userId);m.render();m.effects.splice(0).forEach(fn=>fn());await flush();await flush();return m;
}
test('ReviewDB settings match the original: Authentication and Settings groups with native rows',()=>{
    const b=reviewHarness();b.api.setSetting('reviewDB',true);const tree=b.Settings();
    assert.deepEqual(walkElements(tree,n=>n.type==='RowGroup').map(n=>n.props.title),['ReviewDB','Authentication','Settings']);
    const login=walkElements(tree,n=>n.props.label==='Authenticate with ReviewDB')[0];assert.equal(login.type,'NativeRow');assert.equal(login.props.arrow,true);assert.equal(login.props.disabled,false);
    const logout=walkElements(tree,n=>n.props.label==='Log out of ReviewDB')[0];assert.equal(logout.props.disabled,true);assert.match(logout.props.subLabel,/Authorized Apps/);
    assert.deepEqual(walkElements(tree,n=>n.type==='SwitchRow').map(n=>n.props.label),['Enable ReviewDB','Use profile-themed send button','Show Warning']);
    assert.equal(walkElements(tree,n=>n.type==='Stack')[0].props.spacing,24);
});
test('ReviewDB OAuth follows the traced 347.12 order: dismissOAuthModal BEFORE callback still signs in',async()=>{
    const b=reviewHarness();const props=openReviewAuth(b);
    assert.equal(b.pushed[0].key,'oauth2-authorize');assert.equal(b.pushed[0].modal.modal,'OAuth2AuthorizeModal');
    assert.equal(props.clientId,'915703782174752809');assert.equal(props.redirectUri,'https://manti.vendicated.dev/api/reviewdb/auth');assert.equal(props.cancelCompletesFlow,false);
    props.dismissOAuthModal();assert.deepEqual(b.popped,['oauth2-authorize']);
    props.callback({location:'https://manti.vendicated.dev/api/reviewdb/auth?code=a%2Bb'});await flush();await flush();
    assert.equal(b.requests[0][0],'https://manti.vendicated.dev/api/reviewdb/auth?code=a%2Bb&returnType=json&clientMod=vendetta');
    assert.equal(b.popped.length,1);assert.equal(walkElements(b.Settings(),n=>n.props.label==='Authenticated with ReviewDB').length,1);
    assert.equal(b.toasts.at(-1).content,'Successfully authenticated with ReviewDB');
});
test('ReviewDB sign-in survives disabling the plugin and logs out explicitly, like the original authToken',async()=>{
    const b=reviewHarness();const props=openReviewAuth(b);props.callback({location:'https://manti.vendicated.dev/api/reviewdb/auth?code=x'});await flush();await flush();
    b.api.setSetting('reviewDB',false);b.api.setSetting('reviewDB',true);
    assert.equal(walkElements(b.Settings(),n=>n.props.label==='Authenticated with ReviewDB').length,1);
    walkElements(b.Settings(),n=>n.props.label==='Log out of ReviewDB')[0].props.onPress();
    assert.equal(walkElements(b.Settings(),n=>n.props.label==='Authenticate with ReviewDB').length,1);
});
test('ReviewDB cancellation, malformed redirects and account switches never sign in',async()=>{
    const b=reviewHarness();let props=openReviewAuth(b);props.callback({canceled:true});await flush();
    assert.equal(b.requests.length,0);assert.equal(walkElements(b.Settings(),n=>n.props.label==='Authenticate with ReviewDB').length,1);
    for(const location of ['https://evil.example/api/reviewdb/auth?code=x','https://manti.vendicated.dev/api/reviewdb/auth?error=access_denied','not a URL']){props=openReviewAuth(b);props.callback({location});await flush();}
    assert.equal(b.requests.length,0);
    let resolve;b.context.fetch=()=>new Promise(done=>{resolve=done;});
    props=openReviewAuth(b);props.callback({location:'https://manti.vendicated.dev/api/reviewdb/auth?code=late'});await flush();
    b.account.id='222222222222222222';resolve({ok:true,json:async()=>({success:true,token:'must-not-survive'})});await flush();await flush();
    assert.equal(walkElements(b.Settings(),n=>n.props.label==='Authenticated with ReviewDB').length,0);
});
test('ReviewDB profile section renders directly after the profile note card with the original layout',async()=>{
    const b=reviewHarness();assert.equal(b.note({userId:'222222222222222222'}).props.children[0],b.noteOriginal);
    b.api.setSetting('reviewDB',true);const m=await loadedReviews(b,'222222222222222222');
    assert.equal(m.tree.type,'Fragment');assert.equal(m.tree.props.children[0],b.noteOriginal);assert.equal(m.section.props.userId,'222222222222222222');
    const profileCard=m.render().props.children;assert.equal(profileCard.type,'UserProfileCard');assert.equal(profileCard.props.title,'Reviews');
    const rows=profileCard.props.children[0].props.children;assert.equal(rows.length,2);
    const row=rows[1].type(rows[1].props);const form=row.props.children;assert.equal(row.type,'RowGroup');assert.equal(form.type,'FormRow');
    assert.equal(form.props.subLabel.type,'FormSubLabel');assert.equal(form.props.subLabel.props.text,'hello');assert.equal(form.props.leading.props.style.height,36);
    assert.equal(walkElements(form.props.label,n=>n.type==='FormLabel')[0].props.text,'Other');
    const input=profileCard.props.children[1];const rendered=input.type(input.props);
    assert.equal(walkElements(rendered,n=>n.type==='NativeTextInput')[0].props.placeholder,'You must be authenticated to add a review.');
    form.props.onLongPress();assert.equal(b.simple.at(-1).header.title,'Review by Other');assert.deepEqual(Array.from(b.simple.at(-1).options,o=>o.label),['Copy Text']);
    b.simple.at(-1).options[0].onPress();assert.deepEqual(b.copied,['hello']);
    b.api.setSetting('reviewWarning',false);assert.equal(m.render().props.children.props.children[0].props.children.length,1);
    assert.equal(b.requests.filter(([u])=>u.includes('/reviews')).every(([,o])=>!o.headers.authorization),true);
});
test('ReviewDB server sheet shows a single Reviews row that opens the reviews action sheet',async()=>{
    const b=reviewHarness();const off=b.guild({guild:{id:'444444444444444444'}});assert.equal(off.props.guild.id,'444444444444444444');
    b.api.setSetting('reviewDB',true);const row=b.guild({guild:{id:'444444444444444444'}});
    assert.equal(row.type,'RowGroup');assert.equal(row.props.children.props.label,'Reviews');row.props.children.props.onPress();
    assert.equal(b.sheets[0].key,'VenusReviews:444444444444444444');assert.equal(b.sheets[0].props.userId,'444444444444444444');
    assert.equal(typeof b.sheets[0].promise,'function');assert.equal(b.sheets[0].options,'stack');
    const sheet=(await b.sheets[0].promise())({userId:'444444444444444444'});assert.equal(sheet.type,'ActionSheet');assert.equal(sheet.props.header.props.title,'Reviews');
});
test('ReviewDB user context menu gains a Reviews entry and signed-in actions follow the original permissions',async()=>{
    const b=reviewHarness();b.api.setSetting('reviewDB',true);
    b.menu.ContextMenuPopout({menu:{key:'222222222222222222',items:[1,2,3]}});const items=b.menuCalls.at(-1).menu.items;assert.equal(items.at(-1).label,'Reviews');
    items.at(-1).action();assert.equal(b.sheets.at(-1).props.userId,'222222222222222222');
    b.menu.ContextMenuPopout({menu:{key:'x',items:[1,2,3]}});assert.equal(b.menuCalls.at(-1).menu.items.length,3);
    const props=openReviewAuth(b);props.callback({location:'https://manti.vendicated.dev/api/reviewdb/auth?code=x'});await flush();await flush();
    const m=await loadedReviews(b,'111111111111111111');
    const rows=m.render().props.children.props.children[0].props.children;
    rows[1].type(rows[1].props).props.children.props.onLongPress();
    assert.deepEqual(Array.from(b.simple.at(-1).options,o=>o.label),['Copy Text','Delete Review','Report Review']);
    b.simple.at(-1).options[1].onPress();assert.equal(b.confirms.at(-1).title,'Delete Review');b.confirms.at(-1).onConfirm();await flush();
    const del=b.requests.find(([,o])=>o&&o.method==='DELETE');assert.equal(del[1].headers.authorization,'review-only-token');assert.deepEqual(JSON.parse(del[1].body),{reviewid:1});
    rows[0].type(rows[0].props).props.children.props.onLongPress();assert.equal(b.simple.at(-1).header.title,'ReviewDB System Message');assert.deepEqual(Array.from(b.simple.at(-1).options,o=>o.label),['Copy Text']);
});
test('NoDelete keeps your own deletions in red but never unsent or ephemeral messages, and returns a thenable',async()=>{
    const b=deletionHarness();b.api.setSetting('noDelete',true);
    b.messages.set('c:1',{content:'mine'});b.actions.deleteMessage('c','1');b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});assert.equal(b.messages.get('c:1').content,'mine');assert.equal(b.network.length,1);
    b.messages.set('c:2',{content:'failed',state:'SEND_FAILED'});b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'2'});assert.equal(b.messages.has('c:2'),false);
    b.messages.set('c:3',{content:'only you',flags:64});b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'3'});assert.equal(b.messages.has('c:3'),false);
    b.messages.set('c:5',{content:'theirs'});const result=b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'5'});
    assert.notEqual(result,undefined);await result;assert.equal(b.messages.get('c:5').content,'theirs');
    b.api.setSetting('noDeleteLimit','1');assert.equal(b.api.settings.noDeleteLimit,1);assert.equal(b.messages.has('c:1'),false);assert.equal(b.messages.get('c:5').content,'theirs');
    b.api.setSetting('noDeleteLimit','99999');assert.equal(b.api.settings.noDeleteLimit,5000);b.api.setSetting('noDeleteLimit','abc');assert.equal(b.api.settings.noDeleteLimit,512);
});
test('NoDelete reorders restored native records exactly without sharing the stock array',()=>{
    const b=deletionHarness();
    class UnsortedNative {
        constructor(array){this._array=array;this.ready=true;this.hasMoreAfter=false;}
        toArray(){return this._array.slice();}
        merge(records){const next=Object.assign(Object.create(UnsortedNative.prototype),this);next._array=this._array.filter(m=>!records.some(r=>r.id===m.id)).concat(records);return next;}
        mutate(callback,clone){assert.equal(clone,true);const next=Object.assign(Object.create(UnsortedNative.prototype),this);next._array=this._array.slice();callback(next);return next;}
    }
    let original=new UnsortedNative([{id:'999999999999999999',content:'old'}]);
    const store=b.load({default:{getMessage:(channel,id)=>original.toArray().find(m=>m.id===id),getMessages:()=>original}},null,5008).default;
    b.api.setSetting('noDelete',true);b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'999999999999999999'});
    original=new UnsortedNative([{id:'1000000000000000000',content:'new'}]);b.dispatch.dispatch({type:'CACHE_LOADED'});
    const view=store.getMessages('c');assert.deepEqual(Array.from(view.toArray(),m=>m.id),['999999999999999999','1000000000000000000']);
    assert.equal(original.toArray().length,1);assert.notEqual(view._array,original._array);assert.equal(view.hasMoreAfter,false);
});
test('Hidden Channels information uses only cached topics, parent and snowflake/pin timestamps',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    const id=String((BigInt(Date.UTC(2020,0,1)-1420070400000)<<22n)+1n);
    b.channels.details={...b.channels.hidden,id,lastMessageId:id,lastPinTimestamp:'2020-01-02T00:00:00.000Z'};
    b.actions.fetchMessages({channelId:'details'});assert.equal(b.fetched.length,0);
    const text=b.alerts.at(-1)[1];assert.match(text,/Created: .*ago \(.*2020/);assert.match(text,/Last message: .*ago \(.*2020/);assert.match(text,/Last pin: .*2020/);assert.doesNotMatch(text,/Category:|Topic:/);
});


// Fidelity repairs use the actual host export/prop schemas traced from HBC98.
function walkElements(node, predicate, found=[]) {
    if(Array.isArray(node)){node.forEach(child=>walkElements(child,predicate,found));return found;}
    if(!node || typeof node!=='object' || !node.props)return found;
    if(predicate(node))found.push(node);
    walkElements(node.props.children,predicate,found);
    if(node.props.label && typeof node.props.label==='object')walkElements(node.props.label,predicate,found);
    return found;
}
test('NoDelete preserves literal deletion-like text, attachment-only content, links and record identity',()=>{
    for(const content of ['', '[Deleted] is user-written text', '<@123> https://discord.com']) {
        const b=deletionHarness();b.api.setSetting('noDelete',true);
        const message=Object.freeze({id:'x',channel_id:'c',content,attachments:Object.freeze([{id:'a'}])});
        b.messages.set('c:x',message);b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'x'});
        const store=b.load({default:{getMessage:()=>message}},null,5008).default;
        const kept=store.getMessage('c','x');assert.notEqual(kept,message);assert.equal(kept.content,content);assert.equal(kept.attachments,message.attachments);
        assert.equal(b.events.at(-1).message.content,content);
        b.api.setSetting('noDelete',false);b.api.setSetting('noDelete',true);
    }
});
test('Hidden Channels resolves real basic record names and immutable numeric section entries without textual lock suffixes',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    b.channels.hidden={...b.channels.hidden,name:'__hidden__'};b.channels.cat={...b.channels.cat,name:'__hidden__'};
    const basic={hidden:{...b.channels.hidden,name:'staff-chat'},cat:{...b.channels.cat,name:'PRIVATE STAFF'}};
    b.load({default:{getChannel:id=>b.channels[id],getBasicChannel:id=>basic[id],getMutableGuildChannelsForGuild:()=>b.channels,getMutableBasicGuildChannelsForGuild:()=>basic}},null,2041);
    const names=b.load({default:c=>c.isObfuscated && c.isObfuscated() ? 'No Access' : c.name,computeChannelName:c=>c.isObfuscated && c.isObfuscated() ? 'No Access' : c.name},null,4941);
    assert.equal(names.default(b.channels.hidden),'staff chat');assert.equal(names.computeChannelName(b.channels.cat),'PRIVATE STAFF');
    const original=Object.freeze({0:Object.freeze([{channel:b.channels.hidden,comparator:3}]),4:Object.freeze([{channel:b.channels.cat,comparator:2}])});
    const store=b.load({default:{getChannels:()=>original}},null,2096).default;const list=store.getChannels('g');
    assert.equal(list[0][0].channel.name,'staff-chat');assert.equal(list[4][0].channel.name,'PRIVATE STAFF');assert.equal(original[0][0].channel.name,'__hidden__');
    assert.equal(b.permission.can(b.viewPermission,b.channels.hidden),true);
    assert.equal(b.permission.can(b.viewPermission,Object.assign({},b.channels.hidden,{realCheck:true})),false);
    assert.equal(b.fetched.length,0);
    basic.hidden={...basic.hidden,name:'renamed-staff'};
    assert.equal(names.default(b.channels.hidden),'renamed staff');assert.equal(store.getChannels('g')[0][0].channel.name,'renamed-staff');
});
test('Hidden Channels harvests real names from message mention_channels',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    b.channels.hidden={...b.channels.hidden,name:'hidden'};
    let account='me';b.load({default:{getCurrentUser:()=>({id:account})}},null,1372);
    const dispatch=b.load({default:{dispatch(){}}},null,573).default;
    assert.match(b.label(b.channels.hidden),/unavailable/);
    dispatch.dispatch({type:'MESSAGE_CREATE',message:{id:'m',channel_id:'public',mention_channels:[{id:'hidden',guild_id:'g',type:0,name:'staff-chat'}]}});
    assert.equal(b.label(b.channels.hidden),'staff chat');
});
test('Hidden Channels popup shows precise relative timestamps',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    const minute=60000, hour=60*minute, day=24*hour;
    const ago = 8*day + 7*hour + 7*minute;
    const id = String((BigInt(Date.now()-ago-1420070400000)<<22n)+1n);
    b.channels.timed={...b.channels.hidden,id,lastMessageId:id,lastPinTimestamp:new Date(Date.now()-ago).toISOString()};
    b.actions.fetchMessages({channelId:'timed'});
    const text=b.alerts.at(-1)[1];
    assert.match(text,/8 days, 7 hours and 7 minutes ago/);
});
test('Hidden Channels popup uses Discord\'s native AlertModal with themed Text tokens and no names or topics',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    const shown=[];const required=[];
    function NativeText(){}
    b.context.__r=id=>{required.push(id);return id===5141?{default:{show:value=>shown.push(value)}}:id===4784?{Text:NativeText}:null;};
    const minute=60000, hour=60*minute, day=24*hour;
    const ago = 8*day + 7*hour + 7*minute;
    const id = String((BigInt(Date.now()-ago-1420070400000)<<22n)+1n);
    b.channels.timed={...b.channels.hidden,id,lastMessageId:id,lastPinTimestamp:new Date(Date.now()-ago).toISOString()};
    b.actions.fetchMessages({channelId:'timed'});
    assert.equal(shown.length,1);assert.equal(b.alerts.length,0);assert.deepEqual(required.sort(),[4784,5141]);
    const alert=shown[0];
    // Strings + element children select the modern AlertModal path in AlertActionCreators.show.
    assert.equal(alert.title,'Locked channel');assert.equal(typeof alert.body,'string');
    assert.equal(alert.confirmText,'View Anyway');assert.equal(alert.cancelText,'Cancel');
    for(const legacy of ['onClose','footer','style','secondaryConfirmText','noDefaultButtons'])assert.equal(alert[legacy],undefined);
    const tree=alert.children.type(alert.children.props);
    const texts=walkElements(tree,n=>n.type===NativeText);
    assert.ok(texts.length>=6);assert.ok(texts.every(n=>/^text-/.test(n.props.variant)&&/^text-/.test(n.props.color)));
    const dump=JSON.stringify(tree);
    assert.match(dump,/8 days, 7 hours and 7 minutes ago/);assert.match(dump,/CREATED/);assert.match(dump,/LAST PIN/);
    assert.doesNotMatch(dump+alert.title+alert.body,/Category:|Topic:|staff-chat|Staff only|#[0-9a-f]{6}/i);
    // Duplicate triggers for the same tap do not stack; cancel releases the guard.
    b.actions.fetchMessages({channelId:'timed'});assert.equal(shown.length,1);
    alert.onCancel();b.actions.fetchMessages({channelId:'timed'});assert.equal(shown.length,2);
    shown[1].onConfirm();assert.equal(b.fetched.length,1);
});
test('Hidden Channels never presents a server redaction as a real name or fetches unknown names',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.channels.hidden={...b.channels.hidden,name:'__hidden__'};b.channels.cat={...b.channels.cat,name:'__hidden__'};
    assert.equal(b.label(b.channels.hidden),'Hidden channel (name unavailable)');assert.equal(b.label(b.channels.cat),'Hidden category (name unavailable)');
    b.actions.fetchMessages({channelId:'hidden'});assert.equal(b.fetched.length,0);
    assert.doesNotMatch(String(b.alerts[0][1]),/__hidden__|\[locked\]|Category:|Topic:/);
});
test('Hidden Channels cached gateway names clear on logout, account switch and channel removal but survive disabling',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.channels.hidden={...b.channels.hidden,name:'__hidden__'};
    let account='first';b.load({default:{getCurrentUser:()=>({id:account})}},null,1372);
    const dispatch=b.load({default:{dispatch(){}}},null,573).default;
    function remember(){dispatch.dispatch({type:'CHANNEL_UPDATE',channel:{...b.channels.hidden,name:'received-name'}});assert.equal(b.label(b.channels.hidden),'received name');}
    remember();dispatch.dispatch({type:'LOGOUT'});assert.match(b.label(b.channels.hidden),/name unavailable/);
    remember();account='second';assert.match(b.label(b.channels.hidden),/name unavailable/);
    remember();dispatch.dispatch({type:'CHANNEL_DELETE',channel:{id:'hidden'}});assert.match(b.label(b.channels.hidden),/name unavailable/);
    // Disabling keeps the cache so re-enabling still resolves; views go stock while off.
    remember();b.api.setSetting('hiddenChannels',false);assert.equal(b.store.getChannels('g'),b.result);
    b.api.setSetting('hiddenChannels',true);assert.equal(b.label(b.channels.hidden),'received name');
});
test('Hidden Channels uses a native lock icon and preserves frozen ChannelInfo and stock disabled output',()=>{
    const b=hiddenHarness(),{React}=reactHarness(b);b.api.setSetting('hiddenChannels',true);
    b.load({LockIcon:'NativeLock'},null,5345);const original=Object.freeze(React.createElement('ChannelInfo',{children:'staff'}));
    const info=b.load({default:()=>original},null,16569).default;
    const tree=info({channel:b.channels.hidden});assert.equal(tree.props.children[0].type,'NativeLock');assert.equal(tree.props.children[1],original);assert.match(tree.props.accessibilityLabel,/locked/);
    b.api.setSetting('hiddenChannels',false);assert.equal(info({channel:b.channels.hidden}),original);
});
test('PlatformIndicators uses the original tinted PNG glyphs for desktop and mobile',()=>{
    const b=platformFixture();b.load({default:{getClientStatus:()=>({desktop:'online',mobile:'idle'})}},null,4828);
    const icons=b.badges.type({userId:'other'}).props.children;const desktop=icons[0].props.children;const image=desktop.type(desktop.props);
    assert.match(image.props.source.uri,/^data:image\/png;base64,/);assert.equal(image.props.style.tintColor,'#23a55a');assert.equal(image.props.style.width,16);
    const mobile=icons[1].props.children;assert.equal(mobile.type(mobile.props).props.style.tintColor,'#f0b232');
});
test('PlatformIndicators covers memoized DM headers, DM content, friend labels and voice member titles without mutating props',()=>{
    const b=boot({platformIndicators:true}),{React,RN}=reactHarness(b);b.load({default:{getClientStatus:()=>({desktop:'online'})}},null,4828);
    const channel={id:'dm',type:1,recipients:['recipient']};b.load({default:{getChannel:()=>channel}},null,2041);
    const onPress=()=>{},name=Object.freeze(React.createElement(RN.Text,{variant:'redesign/channel-title/semibold',children:'User'}));
    for(const module of [13603,16377,9970]) {
        const original=Object.freeze(React.createElement(RN.View,{onPress,children:Object.freeze([name,React.createElement('Subtitle',{children:'Activity'})])}));
        const component=Object.freeze({$$typeof:Symbol.for('react.memo'),type:()=>original,compare:()=>false});
        const exports=b.load({default:component},null,module);const props=module===13603?{channelId:'dm'}:module===16377?{channel}:{user:{id:'recipient'}};
        const tree=exports.default.type(props),badges=walkElements(tree,n=>n.type && n.type.name==='PlatformBadges');
        assert.equal(badges.length,1);assert.equal(badges[0].props.userId,'recipient');assert.equal(original.props.children[0],name);assert.equal(tree.props.onPress,onPress);assert.equal(exports.default.compare,component.compare);
        assert.equal(walkElements(tree,n=>n.type===RN.Text && walkElements(n,x=>x.type===RN.View).length).length,0);
        b.api.setSetting('platformIndicators',false);assert.equal(exports.default.type(props),original);b.api.setSetting('platformIndicators',true);
    }
    const original=Object.freeze(React.createElement('NativeRow',{label:name,onPress,subLabel:'Playing'}));
    const row=b.load({default:()=>original},null,11159).default;const tree=row({user:{id:'friend'}});
    assert.equal(walkElements(tree,n=>n.type && n.type.name==='PlatformBadges')[0].props.userId,'friend');assert.equal(tree.props.subLabel,'Playing');assert.equal(tree.props.onPress,onPress);assert.equal(original.props.label,name);
});
test('PlatformIndicators excludes groups and guild channel lists from single-user DM placements',()=>{
    const b=boot({platformIndicators:true}),{React,RN}=reactHarness(b);const original=React.createElement(RN.View,{children:React.createElement(RN.Text,{children:'Group'})});
    const content=b.load({default:()=>original},null,16377).default;
    for(const channel of [{type:3,recipients:['a','b']},{type:0,recipients:['a']},{type:1,recipients:[]}])assert.equal(content({channel}),original);
});
// HBC98 #124513: Call2(callback, result) at 0xf7, no Promise yield for that
// return; dismissOAuthModal at 0x1ac. The old tests awaited callback first and
// therefore could not reproduce the reported native close-before-auth race.
test('Hidden Channels captures initial READY and supplemental names before native records are redacted',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.channels.hidden={...b.channels.hidden,name:'__hidden__'};b.channels.cat={...b.channels.cat,name:'__hidden__'};
    const dispatch=b.load({default:{dispatch(){}}},null,573).default;
    dispatch.dispatch({type:'CONNECTION_OPEN',guilds:[{id:'g',channels:[{id:'hidden',name:'staff-chat'},{id:'cat',name:'PRIVATE STAFF'}]}]});
    assert.equal(b.label(b.channels.hidden),'staff chat');assert.equal(b.label(b.channels.cat),'PRIVATE STAFF');
    dispatch.dispatch({type:'CONNECTION_OPEN_SUPPLEMENTAL',guilds:[{id:'g',channels:[{id:'hidden',name:'renamed-staff'}]}]});assert.equal(b.label(b.channels.hidden),'renamed staff');
    dispatch.dispatch({type:'CHANNEL_UPDATES',channels:[{id:'hidden',guild_id:'g',name:'latest-name'}]});assert.equal(b.label(b.channels.hidden),'latest name');
    dispatch.dispatch({type:'GUILD_DELETE',guild:{id:'g'}});assert.match(b.label(b.channels.hidden),/name unavailable/);assert.equal(b.fetched.length,0);
});
test('Hidden Channels includes basic-only native metadata and blocks its message and navigation paths',async()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    const extra={id:'basic-only',guild_id:'g',type:0,name:'private-basic',parent_id:'basic-cat',position:7};
    const parent={id:'basic-cat',guild_id:'g',type:4,name:'BASIC CATEGORY',position:6};const basic={'basic-only':extra,'basic-cat':parent};
    b.load({default:{getChannel:id=>b.channels[id],getBasicChannel:id=>basic[id],getMutableGuildChannelsForGuild:()=>b.channels,getMutableBasicGuildChannelsForGuild:()=>basic}},null,2041);
    const list=b.store.getChannels('g');assert.equal(list.SELECTABLE.find(entry=>entry.channel.id===extra.id).channel.name,'private-basic');assert.equal(list[4].find(entry=>entry.channel.id===parent.id).channel.name,'BASIC CATEGORY');
    assert.equal(b.store.getChannels('g'),list);await b.actions.fetchMessages({channelId:extra.id});assert.equal(b.fetched.length,0);assert.match(b.alerts.at(-1)[1],/Created: Unavailable/);
    const calls=[];const routes=b.load({transitionTo:r=>calls.push(r),transitionToGuild:(g,c)=>calls.push(c)},null,1101);
    routes.transitionTo('/channels/g/basic-only');routes.transitionToGuild('g','basic-only');assert.equal(calls.length,0);
    assert.equal(b.permission.can(b.viewPermission,extra),true);
    assert.equal(b.permission.can(b.viewPermission,Object.assign({},extra,{realCheck:true})),false);
});
test('Hidden Channels renderer-scoped ChannelStore facade preserves real singleton receivers and model flags',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.channels.hidden={...b.channels.hidden,name:'__hidden__',flags:32768};
    const basic={...b.channels.hidden,name:'native-staff'};
    class NativeStore {
        #value='live-store';getChannel(id){assert.equal(this.#value,'live-store');return b.channels[id];}
        getBasicChannel(){assert.equal(this.#value,'live-store');return basic;}
        subscribe(){return this.#value;}
    }
    const real=new NativeStore();b.load({default:real},null,2041);const original=b.channels.hidden;
    let imported;b.context.__d((g,r,i,a,m)=>{imported=i(2041).default;m.exports={};},7802,[]);
    b.factories.get(7802)(b.context,()=>({default:real}),()=>({default:real}),()=>({default:real}),{exports:{}},{},[]);
    assert.equal(imported.getChannel('hidden').name,'native-staff');assert.equal(imported.getChannel('hidden').flags,32768);assert.equal(imported.subscribe(),'live-store');assert.equal(real.getChannel('hidden'),original);assert.equal(original.name,'__hidden__');
    b.api.setSetting('hiddenChannels',false);assert.equal(imported.getChannel('hidden'),original);
});
test('Hidden Channels respects native formatter escaping and uppercase categories without changing obfuscation flags',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.api.setSetting('dashless',false);
    const channel=Object.freeze({...b.channels.hidden,name:'staff-\\"chat',flags:32768,isObfuscated:()=>true});
    const category=Object.freeze({...b.channels.cat,name:'private staff',flags:32768,isObfuscated:()=>true});
    function nativeFormatter(c,quoted){if(c.isObfuscated())return '__hidden__';const name=c.type===4?c.name.toUpperCase():c.name;return quoted?JSON.stringify(name):name;}
    const names=b.load({default:nativeFormatter,computeChannelName:nativeFormatter},null,4941);
    assert.equal(names.computeChannelName(channel,true),JSON.stringify(channel.name));assert.equal(names.default(category),'PRIVATE STAFF');
    assert.equal(channel.isObfuscated(),true);assert.equal(channel.flags,32768);assert.equal(category.isObfuscated(),true);
    b.api.setSetting('hiddenChannels',false);assert.equal(names.default(category),'__hidden__');
});

test('Hidden Channels READY cache belongs to the incoming account before UserStore reducer runs',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.channels.hidden={...b.channels.hidden,name:'__hidden__'};
    let account=null;b.load({default:{getCurrentUser:()=>account}},null,1372);
    const dispatch=b.load({default:{dispatch(event){if(event.type==='CONNECTION_OPEN')account=event.user;}}},null,573).default;
    dispatch.dispatch({type:'CONNECTION_OPEN',user:{id:'111111111111111111'},guilds:[{id:'g',channels:[{id:'hidden',name:'first-staff'}]}]});
    assert.equal(b.label(b.channels.hidden),'first staff');
    dispatch.dispatch({type:'CONNECTION_OPEN',user:{id:'222222222222222222'},guilds:[{id:'g',channels:[{id:'hidden',name:'second-staff'}]}]});
    assert.equal(b.label(b.channels.hidden),'second staff');
    account={id:'333333333333333333'};assert.match(b.label(b.channels.hidden),/name unavailable/);
});
test('PlatformIndicators hides the stock mobile badge and exposes the original settings',()=>{
    const b=boot({platformIndicators:true});reactHarness(b);
    const seen=[];const status=b.load({default:props=>{seen.push(props.isMobileOnline);return null;},StatusWithTyping:props=>{seen.push(props.isMobileOnline);return null;}},null,14405);
    status.default({status:'online',isMobileOnline:true});status.StatusWithTyping({status:'online',isMobileOnline:true});
    b.api.setSetting('piHideMobile',false);status.default({status:'online',isMobileOnline:true});
    assert.deepEqual(seen,[false,false,true]);
    for (const key of ['piDmHeader','piUserList','piProfile']) assert.equal(b.api.settings[key],true);
});

test('PlatformIndicators adds badges to profile voice-channel user rows',()=>{
    const b=boot({platformIndicators:true}),{React}=reactHarness(b);
    b.load({default:{getClientStatus:()=>({desktop:'online'}),addChangeListener(){},removeChangeListener(){}}},null,4828);
    function Row(props){return React.createElement('TableRow',{user:props.user,label:React.createElement('Name',{children:props.user.id})});}
    const list=React.createElement('List',{data:[{id:'u'}],renderItem:({item})=>React.createElement(Row,{user:item})});
    const exports=b.load({default:()=>React.createElement('Sheet',{children:list})},null,13348);
    const renderItem=exports.default({}).props.children.props.renderItem;
    const row=renderItem({item:{id:'u'}});const tree=row.type(row.props);
    assert.equal(tree.props.label.props.children[1].props.userId,'u');
    b.api.setSetting('piUserList',false);assert.equal(row.type(row.props).props.label.props.children,'u');
});
test('PlatformIndicators places DM list icons beside the mute icon and DM header icons inside ChannelTitle',()=>{
    const b=boot({platformIndicators:true}),{React,RN}=reactHarness(b);b.load({default:{getClientStatus:()=>({desktop:'online'})}},null,4828);
    const channel={id:'dm',type:1,recipients:['friend']};
    const icon=React.createElement('ChannelIcon',{muted:false,favorite:false,ignored:false,blocked:false,selected:false});
    const row=Object.freeze(React.createElement(RN.View,{children:[React.createElement(RN.View,{children:icon}),React.createElement(RN.Text,{children:'23h'})]}));
    const content=b.load({default:()=>row},null,16377).default;const tree=content({channel});
    const icons=tree.props.children[0].props.children;assert.equal(icons[0],icon);assert.equal(walkElements(icons[1],n=>n.type&&n.type.name==='PlatformBadges')[0].props.userId,'friend');
    function ChannelTitle(){return React.createElement(RN.View,{children:React.createElement(RN.Text,{variant:'redesign/heading-18/semibold',children:'User'})});}
    const header=b.load({default:()=>React.createElement(RN.View,{children:React.createElement(ChannelTitle,{title:'User',accessibleTitle:'User',userId:'friend'})})},null,13603).default;
    const title=header({channelId:'dm'}).props.children;assert.notEqual(title.type,ChannelTitle);
    const inner=title.type(title.props);assert.equal(walkElements(inner,n=>n.type&&n.type.name==='PlatformBadges')[0].props.userId,'friend');
});
test('NoDelete retained records differ from the live record so the native row re-renders immediately',()=>{
    const b=deletionHarness();b.api.setSetting('noDelete',true);const live={id:'1',content:'x'};b.messages.set('c:1',live);
    b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});
    const kept=b.load({default:{getMessage:()=>live}},null,5008).default.getMessage('c','1');
    assert.notEqual(kept,live);assert.equal(kept.content,'x');assert.equal(kept.venusDeleted,true);assert.notDeepEqual(Object.keys(kept),Object.keys(live));
});
