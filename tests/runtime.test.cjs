const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const raw = fs.readFileSync('patches/src/main/resources/venus/bootstrap.js', 'utf8');
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

const allFeatures = {picker:true, voice:true, copyBios:true, dashless:true, favouriteAnything:true, freeNitro:true};
function reactHarness(b) {
    const React = {
        createElement(type, props, ...children) { return {type, props:{...props, ...(children.length ? {children:children.length === 1 ? children[0] : children} : {})}}; },
        cloneElement(node, props) {return {...node, props:{...node.props,...props}};},
        useState:() => [0, () => {}], useEffect() {},
    };
    const RN = {View:'View', Text:'Text', Modal:'Modal'};
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
    const premium=b.load({canUseEmojisEverywhere:user => user.premiumType===2,
        canUseAnimatedEmojis:user => user.premiumType===2,
        canUseCustomStickersEverywhere:user => user.premiumType===2},null,4446);
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
    assert.doesNotMatch(raw,/ezgif\.com|fetch\(|setTimeout\(|setInterval\(/);
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
