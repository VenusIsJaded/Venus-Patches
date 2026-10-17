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
        fs.mkdirSync(path.resolve('work'), {recursive: true});
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
__venusPatches.setSetting('picker', true);
__venusPatches.setSetting('voice', true);
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
load(1283, registry);
check(registry.registerComponent('Discord', function(){return function(){return 'root';};}) === 'Discord', 'registration result');
check(providers[0]()({}) === 'root', 'root provider');
var payload = {};
check(registry.getAttachmentPayload(payload) === payload, 'serializer dispatch');
check(registry.post(payload) === payload, 'HTTP dispatch');
var seen = [];
load(1163, {default:{
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

const OLD_ON = ['picker','copyBios','dashless','favouriteAnything','freeNitro','noTyping','jumpToTop','pastelize','platformIndicators','readAll',
    'hideGift','hideQuestDock','systemEmoji','hideCall','validUser','youBarSettings','splitMessages'];
function boot(features = {picker:true, voice:true}, ready = true, oldDefaults = true) {
    const warnings = [];
    const context = vm.createContext({console: {warn: (...args) => warnings.push(args)}});
    const source = raw.replace('/*__FEATURES__*/', JSON.stringify(features));
    vm.runInContext(source, context);
    // Every feature starts off since 1.9.0. These tests were written for the old defaults, so they start from
    // them; 'every feature starts off' checks the real ones.
    if (oldDefaults) for (const key of OLD_ON) if (key in context.__venusPatches.settings) context.__venusPatches.settings[key] = true;
    const factories = new Map();
    context.__d = (factory, id) => factories.set(id, factory);
    function load(exports, factory, explicitId) {
        const value = explicitId === undefined ? exports && exports.default || exports : exports;
        let id = explicitId;
        if (id === undefined) {
            id = value.getSize ? 1163 : value.createElement ? 19 : value.View ? 17 :
                value.registerComponent ? 245 : value.CloudUpload ? 5440 : value.getAttachmentPayload ? 5442 :
                value.post ? 1283 : value.type || value.render || value.name === 'Pressable' ? 414 : 9999;
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
    context.__d((g,r,i,a,module) => { module.exports = {getAttachmentPayload:() => ({})}; }, 5442, []);
    const module = {exports:{}};
    factories.get(5442)(context,null,null,null,module,module.exports);
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
    assert.equal(api.formatSize(1024), '1 KB');
    assert.equal(api.formatSize(1536), '1.5 KB');
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
test('toggle off between conversion and serialization strips upload voice metadata', async () => {
    const b=await voiceHarness(); b.api.setSetting('voice',false);
    const latePayload=b.serializer.getAttachmentPayload(b.audio);
    assert.equal(latePayload.duration_secs,undefined);
    assert.equal(latePayload.waveform,undefined);
    b.http.post({url:'/channels/1/messages',body:{attachments:[latePayload]}});
    assert.equal(b.received[0][0].body.flags,undefined);
    assert.equal(b.received[0][0].body.attachments[0].duration_secs,undefined);
    assert.equal(b.received[0][0].body.attachments[0].waveform,undefined);
});
test('announcement channels and scheduled messages set voice flag or strip custom metadata', async () => {
    const b=await voiceHarness();
    for (const url of ['/channels/123/messages/announcement','/users/@me/scheduled-messages']) {
        b.http.post({url,body:{attachments:[b.payload]}});
        assert.equal(b.received.at(-1)[0].body.flags,8192);
        b.http.post({url,body:{content:'caption',attachments:[b.payload]}});
        const withText=b.received.at(-1)[0].body;
        assert.equal(withText.flags,undefined);
        assert.equal(withText.attachments[0].duration_secs,undefined);
        assert.equal(withText.attachments[0].waveform,undefined);
    }
    for (const extra of [{components:[{type:1}]},{activity:{type:1}},{shared_client_theme:{}},{content_inventory_entry:{}},{message_reference:{type:1}}]) {
        b.http.post({url:'/channels/123/messages',body:{attachments:[b.payload],...extra}});
        const sent=b.received.at(-1)[0].body;
        assert.equal(sent.flags,undefined);
        assert.equal(sent.attachments[0].duration_secs,undefined);
        assert.equal(sent.attachments[0].waveform,undefined);
    }
    b.http.post({url:'/channels/123/messages',body:{attachments:[b.payload],message_reference:{type:0,message_id:'9'}}});
    assert.equal(b.received.at(-1)[0].body.flags,8192);
});
test('CloudUpload completion and draft removal release converted temp files and update compression size', async () => {
    const b=boot(); b.api.setSetting('voice',true); const commands=[];
    b.load({default:native({getSize:request => {
        const command=JSON.parse(request.slice('venus-voice-v1:'.length)); commands.push(command);
        return command.action==='prepare' ? Promise.resolve(JSON.stringify({
            uri:'file:///cache/job.ogg',filename:'voice-message.ogg',mimeType:'audio/ogg',size:4096,durationSecs:3.5,waveform:'AQID'
        })) : Promise.resolve('ok');
    }})});
    class CloudUpload {
        constructor(){this.item={uri:'content://audio',mimeType:'audio/mp3'};this.mimeType='audio/mp3';this.uploadAnalytics={};}
        reactNativeCompressAndExtractData(){return Promise.resolve(this);}
        removeFromMsgDraft(){this._cancel();}
        _cancel(){this.cancelled=true;}
        handleComplete(){this.completed=true;}
        handleError(){this.errored=true;}
    }
    b.load({CloudUpload});
    const first=new CloudUpload();
    await first.reactNativeCompressAndExtractData();
    assert.equal(first.currentSize,4096);
    assert.equal(first.postCompressionSize,4096);
    assert.equal(first.uploadAnalytics.convertedMimeType,'audio/ogg');
    first.handleComplete();
    first.handleComplete();
    assert.equal(commands.filter(c => c.action==='release').length,1);
    const second=new CloudUpload();
    await second.reactNativeCompressAndExtractData();
    second.removeFromMsgDraft();
    assert.equal(second.cancelled,true);
    assert.equal(commands.filter(c => c.action==='release').length,2);
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
    b.load({default:host},undefined,1163);
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
        b.load(nativeExport,null,1163);
        assert.equal(b.load(registry,null,14130),registry);
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
    b.load(registry,null,14130);
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

const allFeatures = {picker:true, voice:true, copyBios:true, dashless:true, favouriteAnything:true, freeNitro:true, noTyping:true, quickDelete:true, noDelete:true, jumpToTop:true, hiddenChannels:true, pastelize:true, platformIndicators:true, reviewDB:true, readAll:true, quests:true, systemFont:true, systemEmoji:true, hideGift:true, hideQuestDock:true, gestures:true, hideCall:true, validUser:true, youBarSettings:true, splitMessages:true, translate:true, userNotif:true, accountSwitcher:true, appIcons:true, customThemes:true, messageHighlight:true};
function reactHarness(b) {
    const React = {
        createElement(type, props, ...children) { return {type, props:{...props, ...(children.length ? {children:children.length === 1 ? children[0] : children} : {})}}; },
        cloneElement(node, props) {return {...node, props:{...node.props,...props}};},
        useState:() => [0, () => {}], useEffect() {}, useRef:value => ({current:value}),
    };
    const RN = {View:'View', Text:'Text', Image:'Image', Modal:'Modal', Pressable:'Pressable'};
    b.load(React, null, 19); b.load(RN, null, 17);
    return {React,RN};
}
function settingsHarness(features = allFeatures) {
    const b = boot(features); const {React}=reactHarness(b);
    function SettingsList() {}
    b.load({SettingsList},null,14236);
    const original=Object.freeze({ACCOUNT:Object.freeze({type:'route',IconComponent:function Icon(){}})});
    const exports=b.load({SETTING_RENDERER_CONFIG:original},null,14130);
    const builder=b.load({createList(config,extra){ assert.equal(this,builder); return {...config,type:'list',extra};}},null,10874);
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
    b.load({default:{getCurrentUser:() => user}},null,1378);
    b.load({default:{getChannel:id => id === 'channel' ? channel : undefined}},null,2051);
    b.load({default:{getCustomEmojiById:id => emojis[id]}},null,5772);
    b.load({default:{getStickerById:id => stickers[id]}},null,5815);
    const premium=b.load({default:{canUseEmojisEverywhere:user => user.premiumType===2,
        canUseAnimatedEmojis:user => user.premiumType===2,
        canUseCustomStickersEverywhere:user => user.premiumType===2}},null,4491).default;
    const rules=b.load({StickerSendability:{SENDABLE:0,SENDABLE_WITH_PREMIUM:1,NONSENDABLE:2},
        getStickerSendability:sticker => !sticker || sticker.available === false ? 2 : sticker.guild_id==='home' || user.premiumType===2 ? 0 : 1,
        isSendableSticker:sticker => !!sticker && (sticker.guild_id==='home' || user.premiumType===2)},null,6756);
    const sent=[];
    const actions=b.load({default:{sendMessage(...args){assert.equal(this,actions);sent.push(args);return 'sent';},
        _sendMessage(...args){assert.equal(this,actions);sent.push(args);return 'upload';},
        sendStickers(...args){assert.equal(this,actions);sent.push(args);return 'stickers';}}},null,6880).default;
    return {...b,user,channel,emojis,stickers,premium,rules,actions,sent};
}
test('native registry adds authorless About, Settings and option-page routes without changing stock config', () => {
    const b=settingsHarness();
    assert.equal(b.original.VENUS_GENERAL,undefined);
    assert.equal(b.registry.ACCOUNT,b.original.ACCOUNT);
    for (const key of ['VENUS_GENERAL','VENUS_PLUGINS','VENUS_FREENITRO']) {
        assert.equal(b.registry[key].type,'route'); assert.equal(b.registry[key].screen.route,key);
        const screen=b.registry[key].screen.getComponent();assert.equal(screen,b.registry[key].screen.getComponent());
        if (key==='VENUS_PLUGINS') assert.equal(screen().type,b.SettingsList);
    }
    // Nitro links is a designed page with a preview; its options stay real setting nodes for Discord's search.
    const nitro=pageNodes(b.registry.VENUS_FREENITRO.screen.getComponent()());
    assert.ok(nitro.some(n=>n.type&&n.type.name==='NitroPreview'));
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
    assert.deepEqual(Array.from(result.sections[1].settings),['VENUS_PLUGINS','VENUS_LANGUAGE','VENUS_GENERAL']);
    const again=b.builder.createList(result);assert.equal(again.sections,result.sections);
    const other={sections:[{settings:['CHAT']}]};assert.equal(b.builder.createList(other).sections,other.sections);
});
test('native toggle closures bind each key independently and respect patch selection', () => {
    const b=settingsHarness();
    b.registry.VENUS_COPYBIOS.onValueChange(false); assert.equal(b.api.settings.copyBios,false);
    assert.equal(b.api.settings.dashless,true);
    b.registry.VENUS_EMOJIS.onValueChange(false); assert.equal(b.api.settings.emojis,false);
    assert.equal(b.registry.VENUS_STICKERS.useValue(),true);
    const selected=settingsHarness({picker:false,voice:false,freeNitro:false,copyBios:false});
    assert.equal(selected.registry.VENUS_EMOJIS,undefined);assert.equal(selected.registry.VENUS_COPYBIOS,undefined);
    assert.equal(selected.api.setSetting('emojis',true),false);
});
test('new plugin preferences persist and late restores cannot overwrite edits', async () => {
    const b=boot(allFeatures);let complete;const writes=[];
    b.load(native({fileExists:async()=>true,readFile:()=>new Promise(resolve=>complete=resolve),writeFile:async(...args)=>writes.push(args)}));
    await flush();b.api.setSetting('stickers',false);
    complete('{"emojis":false,"stickers":true,"copyBios":false,"hyperlinks":false,"forceLinks":true}');await flush();
    // Options removed in 1.10.0 are ignored when an older settings file is read.
    assert.equal('forceLinks' in b.api.settings,false);
    assert.equal(b.api.settings.stickers,false);assert.equal(b.api.settings.emojis,false);
    assert.equal(b.api.settings.copyBios,false);assert.equal(b.api.settings.hyperlinks,false);
    assert.equal(JSON.parse(writes.at(-1)[2]).stickers,false);
});
test('unselected plugin factories remain completely unwrapped', () => {
    const b=boot({picker:false,voice:false});const factory=()=>{};
    for (const id of [245,414,1283,5440,5442,10742,4990,12662,12524,9861,9864,1378,2051,5772,5815,4491,6756,6880]) {
        b.context.__d(factory,id,[]);assert.equal(b.factories.get(id),factory);
    }
});
test('CopyBios clones frozen text nodes while preserving links, handlers and non-text children', () => {
    const b=boot(allFeatures);const {React,RN}=reactHarness(b);const onPress=()=>{};
    const text=Object.freeze(React.createElement(RN.Text,Object.freeze({children:'bio',onPress})));
    const icon=React.createElement('Image',{uri:'x'});
    const tree=Object.freeze(React.createElement(RN.View,{children:Object.freeze([text,icon])}));
    const bio=b.load({default:()=>tree},null,10742);
    const result=bio.default({});assert.notEqual(result,tree);
    assert.equal(text.props.selectable,undefined);assert.equal(result.props.children[0].props.selectable,true);
    assert.equal(result.props.children[0].props.onPress,onPress);assert.equal(result.props.children[1],icon);
    b.api.setSetting('copyBios',false);assert.equal(bio.default({}),tree);
});
test('Dashless changes only display labels and leaves messages, channel models and DM names untouched', () => {
    const b=boot(allFeatures);const label=b.load({default:channel=>channel.name,computeChannelName:channel=>channel.name},null,4990);
    const channel=Object.freeze({type:0,name:'hello-world'});
    assert.equal(label.default(channel),'hello world');assert.equal(channel.name,'hello-world');
    for (const type of [0, 5, 6, 14, 15, 16, 21]) {
        assert.equal(label.computeChannelName({type,name:'slug-channel-name'}),'slug channel name');
    }
    assert.equal(label.default({type:1,name:'user-name'}),'user-name');
    assert.equal(label.default({type:2,name:'voice-room'}),'voice-room');
    assert.equal(label.default({type:3,name:'group-dm'}),'group-dm');
    assert.equal(label.default({type:4,name:'CATEGORY-NAME'}),'CATEGORY-NAME');
    assert.equal(label.default({type:11,name:'thread-title'}),'thread-title');
    assert.equal(label.default({type:13,name:'stage-room'}),'stage-room');
    assert.equal(label.computeChannelName({type:0,name:'general'}),'general');
    b.api.setSetting('dashless',false);assert.equal(label.default(channel),'hello-world');
});
test('Dashless formats cross-server channel mentions, preserves #slug-name typing and emits live store updates on toggle', () => {
    const b=boot(allFeatures);const {React}=reactHarness(b);
    let effectRegistered=false,stateUpdated=false,emitted=0;
    React.useState=init=>[typeof init==='function'?init():init,()=>{stateUpdated=true;}];
    React.useEffect=fn=>{effectRegistered=true;fn();};
    const channelsById={'100':Object.freeze({id:'100',type:0,name:'general-chat'}),'200':Object.freeze({id:'200',type:2,name:'voice-lounge'})};
    b.load({default:{getChannel:id=>channelsById[id]||null,emitChange(){emitted++;}}},null,2051);
    const label=b.load({default:ch=>ch.name,computeChannelName:ch=>ch.name},null,4990);
    const mentionRule=b.load({getChannel:(id,mentionChannels)=>{
        const found=mentionChannels&&mentionChannels.find(c=>c.id===id);
        return found?Object.freeze({type:found.type,id:found.id,guild_id:found.guild_id,name:found.name}):null;
    }},null,5314);
    const parserMod=b.load({
        default:{createParserState:()=>({channels:[{id:'100',text:label.computeChannelName(channelsById['100'])},{id:'200',text:'voice-lounge'}]})},
        createParserState:()=>({channels:[{id:'100',text:label.computeChannelName(channelsById['100'])},{id:'200',text:'voice-lounge'}]})
    },null,7099);

    // 1. Cross-server channel mention (not in local ChannelStore, resolved via message.mention_channels)
    const crossMention=mentionRule.getChannel('999',[{id:'999',guild_id:'g2',type:5,name:'patch-notes'}]);
    assert.equal(crossMention.name,'patch notes');
    const voiceMention=mentionRule.getChannel('998',[{id:'998',guild_id:'g2',type:2,name:'voice-chat'}]);
    assert.equal(voiceMention.name,'voice-chat');

    // 2. MessageParser.createParserState retains both dashless display name and raw hyphenated slug for #channel-name typing
    const state=parserMod.createParserState();
    assert.deepEqual(JSON.parse(JSON.stringify(state.channels)),[
        {id:'100',text:'general chat'},
        {id:'200',text:'voice-lounge'},
        {id:'100',text:'general-chat'}
    ]);
    const defaultState=parserMod.default.createParserState();
    assert.equal(defaultState.channels.length,3);

    // 3. useChannelName (4990.default) subscribes to dashless setting and toggling dashless emits ChannelStore change
    assert.equal(label.default(channelsById['100']),'general chat');
    assert.equal(effectRegistered,true);
    b.api.setSetting('dashless',false);
    assert.equal(emitted,1);
    assert.equal(stateUpdated,true);
    assert.equal(label.default(channelsById['100']),'general-chat');
    assert.equal(mentionRule.getChannel('999',[{id:'999',guild_id:'g2',type:5,name:'patch-notes'}]).name,'patch-notes');
    assert.deepEqual(JSON.parse(JSON.stringify(parserMod.createParserState().channels)),[{id:'100',text:'general-chat'},{id:'200',text:'voice-lounge'}]);
});
test('FavouriteAnything preserves memo metadata and original source objects', () => {
    const b=boot(allFeatures);const memo=Object.freeze({$$typeof:Symbol.for('react.memo'),type:props=>props,compare:()=>true});
    const exports=b.load({default:memo},null,12524);
    assert.equal(exports.default.compare,memo.compare);
    const source=Object.freeze({uri:'https://cdn.discordapp.com/image.png',width:10,height:20});
    const props=Object.freeze({source,extra:'keep'});const result=exports.default.type(props);
    assert.equal(result.source.isGIFV,true);assert.equal(source.isGIFV,undefined);assert.equal(result.extra,'keep');
    b.api.setSetting('favouriteAnything',false);assert.equal(exports.default.type(props),props);
});
test('favourite media format correction uses copies and handles signed URLs case-insensitively', () => {
    const b=boot(allFeatures);const action=b.load({addFavoriteGIF:value=>value},null,9861);
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
    const utils=b.load({useFavoriteGIFsMobile:()=>result},null,9864);
    const a=utils.useFavoriteGIFsMobile(),c=utils.useFavoriteGIFsMobile();assert.equal(a.favorites,c.favorites);
    assert.match(a.favorites[0].src,/media\.discordapp\.net\/a.MP4\?ex=1&hm=signature&format=jpeg#keep$/);
    assert.equal(a.favoritesCategory.src,a.favorites[0].src);assert.equal(result.favorites[0],item);assert.equal(a.extra,'keep');
    const evil={url:'https://evil.test/a.mp4',src:'https://cdn.discordapp.com.evil.test/a.mp4'};
    const external=b.load({useFavoriteGIFsMobile:()=>({favorites:[evil]})},null,9864).useFavoriteGIFsMobile();assert.equal(external.favorites[0],evil);
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
test('emoji links honor live Nitro changes and the short-link option without rewriting originals', () => {
    const b=nitroHarness();const message={content:'<:x:2>'};
    b.user.premiumType=2;b.actions.sendMessage('channel',message);assert.equal(b.sent.at(-1)[1],message,'Nitro: sent as a real emoji');
    b.user.premiumType=null;b.api.setSetting('hyperlinks',false);
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
    const b=boot(allFeatures);const action=b.load({addFavoriteGIF:value=>value},null,9861);
    const item=Object.freeze({url:'https://tenor.com/view/provider-id',gifSrc:'https://media.tenor.com/opaque',format:2});
    assert.equal(action.addFavoriteGIF(item),item);
});
test('nested bio markup makes the outer Discord Text selectable without changing children or link presses', () => {
    const b=boot(allFeatures);const {React}=reactHarness(b);const link=React.createElement('Link',{children:'click',onPress:()=>{}});
    const tree=React.createElement('DiscordText',{children:[link]});
    const bio=b.load({default:()=>tree},null,10742);const result=bio.default({});
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
    const patched=b.load(exports,null,12524);
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
    const patched=b.load(exports,null,12524);assert.equal(reads,0);
    assert.equal(patched.__esModule,true);assert.equal(patched.default.$$typeof,Symbol.for('react.memo'));
    assert.equal(patched.default[symbol],'preserved');assert.equal(patched.default.compare,memo.compare);
    assert.equal(Object.getOwnPropertyDescriptor(patched.default,'displayName').get,Object.getOwnPropertyDescriptor(memo,'displayName').get);
});
test('immutable function export hooks retain the Metro module marker and stock descriptors', () => {
    const b=boot(allFeatures);const exports={};
    Object.defineProperty(exports,'__esModule',{value:true});
    Object.defineProperty(exports,'addFavoriteGIF',{value:item=>item});
    const patched=b.load(exports,null,9861);assert.equal(patched.__esModule,true);
    assert.equal(patched.addFavoriteGIF({url:'https://example.com/movie.mp4',format:1}).format,2);
});


test('attachment tools and all five ports live in Features, never About', () => {
    const b=settingsHarness();
    assert.deepEqual(Object.keys(b.registry).filter(id=>b.registry[id].parent==='VENUS_GENERAL'),
        ['VENUS_VERSION','VENUS_STATUS','VENUS_LINK_CHANGES','VENUS_LINK_ISSUES','VENUS_LINK_SOURCE']);
    for (const id of ['PICKER','VOICE','NOTYPING','NODELETE','JUMPTOTOP','HIDDENCHANNELS','QUICKDELETE'])
        assert.equal(b.registry['VENUS_'+id].parent,'VENUS_PLUGINS');
    for (const key of ['quickDelete','noDelete','hiddenChannels']) assert.equal(b.api.settings[key],false);
});
test('unselected new plugins do not wrap any optional factory or expose switches', () => {
    const b=boot({});const factory=()=>{};
    for (const id of [11348,5205,1127,585,5057,6880,11642,9804,10418,4470,4472,13528,1086,1113]) {
        b.context.__d(factory,id,[]);assert.equal(b.factories.get(id),factory);
    }
    const settings=settingsHarness({});assert.equal(settings.registry.VENUS_NOTYPING,undefined);
});
test('No typing restores both original methods and receiver when switched off', () => {
    const b=boot(allFeatures);const calls=[];
    const actions={startTyping(...args){assert.equal(this,actions);calls.push(args);return 'start';},
        stopTyping(...args){assert.equal(this,actions);calls.push(args);return 'stop';}};
    const patched=b.load({default:actions},null,11348).default;
    patched.startTyping('123');patched.stopTyping('123');assert.equal(calls.length,0);
    b.api.setSetting('noTyping',false);
    assert.equal(patched.startTyping('123'),'start');assert.equal(patched.stopTyping('456'),'stop');
    assert.deepEqual(calls,[['123'],['456']]);
});
test('QuickDelete uses exact localized strings, one switch for messages and link previews, and stock fallback', () => {
    const b=boot(allFeatures);let shown=0,confirmed=0;
    const tokens={AMvpS4:'message', 'vXZ+Fo':'embed'};const translations={message:'Supprimer le message ?',embed:'Supprimer cet aperçu ?'};
    b.load({t:tokens,intl:{string:key=>translations[key]}},null,1127);
    const popup={show(value){shown++;return value;}};
    const action=b.load({default:popup},null,5205).default;
    const message={children:{props:{title:translations.message}},onConfirm(){confirmed++;return 'confirmed';}};
    assert.equal(action.show(message),message);b.api.setSetting('quickDelete',true);
    assert.equal(action.show(message),'confirmed');assert.equal(confirmed,1);
    const other={body:'Delete channel',onConfirm(){throw Error('must not confirm');}};assert.equal(action.show(other),other);
    const substring={body:'Unrelated '+translations.message,onConfirm(){throw Error('unsafe matching');}};assert.equal(action.show(substring),substring);
    const embed={body:translations.embed,onConfirm(){confirmed++;}};action.show(embed);assert.equal(confirmed,2,'link previews skip asking too');
    b.api.setSetting('quickDelete',false);action.show(message);action.show(embed);assert.equal(confirmed,2);assert.equal(shown,5);
    translations.embed='';assert.equal(action.show(embed),embed);
});
function deletionHarness() {
    const b=boot(allFeatures), messages=new Map(),events=[],network=[];
    b.load({default:{getMessage:(channel,id)=>messages.get(channel+':'+id)}},null,5057);
    const flux={dispatch(event){assert.equal(this,flux);events.push(event);
        if (event.type==='MESSAGE_DELETE') messages.delete(event.channelId+':'+event.id);
        if (event.type==='MESSAGE_DELETE_BULK') event.ids.forEach(id=>messages.delete(event.channelId+':'+id));
        return 'dispatched';}};
    const dispatch=b.load({default:flux},null,585).default;
    const actions=b.load({default:{deleteMessage(...args){network.push(args);return 'remote';}}},null,6880).default;
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
        canUserUse:(feature,user)=>user.premiumType===2},null,13528);
    const premium=b.load({default:{canUseEmojisEverywhere:user=>catalog.canUserUse(everywhere,user),
        canUseAnimatedEmojis:user=>catalog.canUserUse(animation,user),canUseCustomStickersEverywhere:()=>false}},null,4491).default;
    assert.equal(premium.canUseEmojisEverywhere(b.user),true);assert.equal(catalog.canUserUse(animation,b.user),true);
    assert.equal(catalog.canUserUse(unrelated,b.user),false);assert.equal(catalog.canUserUse(animation,{id:'other',premiumType:null}),false);
    b.actions.sendMessage('channel',{content:'<a:test:3> <:other:2>'});assert.match(b.sent[0][1].content,/3.gif/);assert.match(b.sent[0][1].content,/2.webp/);
    b.user.premiumType=2;b.actions.sendMessage('channel',{content:'<a:test:3>'});assert.equal(b.sent[1][1].content,'<a:test:3>');
    b.api.setSetting('emojis',false);b.user.premiumType=null;assert.equal(premium.canUseEmojisEverywhere(b.user),false);
});
test('JumpToTop clones frozen controls, keeps Jump to Present and uses each current channel ID', () => {
    const b=boot(allFeatures);const {React}=reactHarness(b),jumps=[];let present=0;
    b.load({default:{jumpToMessage:value=>jumps.push(value)}},null,6880);
    const child=Object.freeze(React.createElement('Button',{onPress:()=>present++,icon:'down'}));
    const result=Object.freeze(React.createElement('View',{children:child}));
    const component=b.load({default:()=>result},null,11642).default;
    const first=component({channelId:'100'});const controls=first.props.children.props.children;
    controls[0].props.children.props.onPress();controls[1].props.onPress();
    assert.equal(present,1);assert.equal(jumps[0].channelId,'100');assert.equal(jumps[0].messageId,'100');assert.equal(result.props.children,child);
    component({channelId:'200'}).props.children.props.children[0].props.children.props.onPress();assert.equal(jumps[1].channelId,'200');
    b.api.setSetting('jumpToTop',false);assert.equal(component({channelId:'100'}),result);
});
test('JumpToTop is available when Jump to Present is absent without wrapping unrelated voice controls', () => {
    const b=boot(allFeatures);reactHarness(b);const jumps=[];
    b.load({default:{jumpToMessage:value=>jumps.push(value)}},null,6880);
    b.load({default:'NativeFloatingButton'},null,11643);b.load({default:'NativeArrow'},null,11644);
    b.load({useChatInputContainerHeight:()=>140,useSmallSuggestionBarHeight:()=>28},null,8838);
    const component=b.load({default:()=>null},null,11642).default;
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
    b.load({default:{getChannel:id=>channels[id],getMutableGuildChannelsForGuild:()=>channels}},null,2051);
    const viewPermission={nativeBit:1024};
    b.load({Permissions:{VIEW_CHANNEL:viewPermission}},null,1086);
    const permission={can:(permission,channel)=>{assert.equal(permission,viewPermission);return allowed.has(channel.id);}};
    b.load({default:permission},null,4472);
    const result=Object.freeze({id:'g',SELECTABLE:Object.freeze([{channel:visible,comparator:0}]),VOCAL:Object.freeze([]),4:Object.freeze([])});
    const store=b.load({default:{getChannels:()=>result}},null,4470).default;
    const fetched=[];const actions=b.load({default:{fetchMessages:value=>fetched.push(value)}},null,6880).default;
    const label=b.load({default:channel=>channel.name},null,4990).default;
    // A real tap on a channel row: Discord navigates (transitionToChannel -> router_utils.transitionTo 1113).
    const navigated=[];const routes=b.load({transitionTo:r=>navigated.push(r),replaceWith:r=>navigated.push(r),transitionToGuild:(g,c)=>navigated.push([g,c])},null,1113);
    const tap=id=>routes.transitionTo('/channels/g/'+id);
    return {...b,channels,allowed,permission,viewPermission,result,store,actions,fetched,alerts,label,routes,navigated,tap};
}
test('Hidden Channels adds cached metadata immutably, deduplicates categories and leaves permissions intact', () => {
    const b=hiddenHarness();assert.equal(b.store.getChannels('g'),b.result);b.api.setSetting('hiddenChannels',true);
    const result=b.store.getChannels('g');assert.equal(result.SELECTABLE.length,3);assert.equal(result.VOCAL.length,1);assert.equal(result[4].length,1);
    assert.equal(b.result.SELECTABLE.length,1);assert.equal(b.store.getChannels('g'),result);
    // Global bypass: UI sees true, realCheck reveals real false.
    assert.equal(b.permission.can(b.viewPermission,b.channels.hidden),true);
    assert.equal(b.permission.can(b.viewPermission,Object.assign({},b.channels.hidden,{realCheck:true})),false);
    assert.equal(b.label(b.channels.hidden),'staff chat');
    b.allowed.add('hidden');const next=b.store.getChannels('g');assert.notEqual(next,result);assert.equal(b.label(b.channels.hidden),'staff chat');
    b.api.setSetting('hiddenChannels',false);assert.equal(b.store.getChannels('g'),b.result);
});
test('Hidden Channels caches READY names while toggle is off so enabling later still resolves',()=>{
    const b=hiddenHarness();
    // Default toggle is off; READY arrives before the user enables.
    const dispatch=b.load({default:{dispatch(){}}},null,585).default;
    b.load({default:{getCurrentUser:()=>({id:'me'})}},null,1378);
    dispatch.dispatch({type:'CONNECTION_OPEN',user:{id:'me'},guilds:[{id:'g',channels:[{id:'hidden',name:'staff-chat',type:0},{id:'cat',name:'private',type:4}]}]});
    b.api.setSetting('hiddenChannels',true);
    // Store later redacts to server marker; cached gateway names must win.
    b.channels.hidden={...b.channels.hidden,name:'__hidden__'};
    b.channels.cat={...b.channels.cat,name:'__hidden__'};
    assert.equal(b.label(b.channels.hidden),'staff chat');
    assert.equal(b.label(b.channels.cat),'private');
});
test('Hidden Channels with the switch off walks a server\'s channels once, not on every list render',()=>{
    const b=hiddenHarness();let reads=0;
    const channels=new Proxy(b.channels,{ownKeys(t){reads++;return Reflect.ownKeys(t);}});
    b.load({default:{getChannel:id=>b.channels[id],getMutableGuildChannelsForGuild:()=>channels}},null,2051);
    b.load({default:{getCurrentUser:()=>({id:'me'})}},null,1378);
    const store=b.load({default:{getChannels:()=>b.result}},null,4470).default;
    for(let i=0;i<20;i++) assert.equal(store.getChannels('g'),b.result);
    assert.equal(reads,1,'unchanged records are remembered once');
    b.channels.hidden={...b.channels.hidden,name:'__hidden__'};
    b.api.setSetting('hiddenChannels',true);store.getChannels('g');
    assert.ok(reads>1);
});
test('Hidden Channels refuses message fetches for locked channels silently and preserves visible or disabled traffic', async () => {
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    // A fetch is never a tap: press-in preloads (scrolling) and startup restores must not show the details (#62).
    await b.actions.fetchMessages({channelId:'hidden',isPreload:true});await b.actions.fetchMessages({channelId:'hidden'});
    assert.equal(b.fetched.length,0);assert.equal(b.alerts.length,0,'no menu while scrolling or opening the app (#62)');
    b.tap('hidden');assert.equal(b.alerts[0][0],'Locked channel');assert.match(b.alerts[0][1],/Created: Unavailable/);assert.match(b.alerts[0][1],/Last message: No messages yet/);
    b.actions.fetchMessages({channelId:'public'});assert.equal(b.fetched.length,1);
    b.api.setSetting('hiddenChannels',false);b.actions.fetchMessages({channelId:'hidden'});assert.equal(b.fetched.length,2);
});
test('Hidden Channels: scrolling past a locked channel (press-in preload) never shows its menu, a tap does (#62)',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    // ChannelActionCreators.preload on onPressIn -> CHANNEL_PRELOAD -> MessageManager.fetchMessages({isPreload:true}).
    for(let i=0;i<5;i++) b.actions.fetchMessages({guildId:'g',channelId:'hidden',isPreload:true});
    assert.equal(b.alerts.length,0);assert.equal(b.fetched.length,0,'locked channel messages are still never loaded');
    b.tap('hidden');assert.equal(b.alerts.length,1);assert.equal(b.navigated.length,0,'waits for View Anyway');
    b.alerts[0][2][1].onPress();assert.deepEqual(b.navigated,['/channels/g/hidden'],'View Anyway opens it');
});
test('Hidden Channels option turns the locked-channel menu off: tapping does nothing (#62)',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    assert.equal(b.api.settings.hiddenChannelsMenu,true,'the menu starts on');
    b.api.setSetting('hiddenChannelsMenu',false);
    b.tap('hidden');assert.equal(b.alerts.length,0,'no menu');assert.equal(b.navigated.length,0,'and the channel stays closed');
    b.tap('public');assert.deepEqual(b.navigated,['/channels/g/public'],'real channels still open');
    b.api.setSetting('hiddenChannelsMenu',true);b.tap('hidden');assert.equal(b.alerts.length,1);
});
test('Hidden Channels: opening a server or the app never lands on a locked channel, and real channels come first',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    // Locked 'hidden' sits above the real 'public' channel in the list.
    b.channels.hidden={...b.channels.hidden,position:-1};
    const view=b.permission.can;
    const guildStore=b.load({default:{
        getChannels(){return {SELECTABLE:[{channel:b.channels.hidden,comparator:-1},{channel:b.channels.public,comparator:0}]};},
        getFirstChannel(guild,predicate){return (this.getChannels(guild).SELECTABLE.find(predicate)||{}).channel||null;},
        getDefaultChannel(guild){return this.getFirstChannel(guild,e=>view(b.viewPermission,e.channel));}
    }},null,4470).default;
    assert.equal(guildStore.getDefaultChannel('g').id,'public','a locked channel is never the first channel over a real one');
    // Discord remembers the locked channel as the last one picked in the server, and as the current channel at startup.
    let last='hidden';
    const selected=b.load({default:{getChannelId:guild=>last}},null,2102).default;
    assert.equal(selected.getChannelId('g'),'public','opening the server lands on its first real channel');
    assert.equal(selected.getChannelId(),'public','opening the app lands on a real channel');
    last='public';assert.equal(selected.getChannelId('g'),'public');
    // Tapping the server in the guild bar with a remembered locked channel goes to the real one, no menu.
    b.routes.transitionToGuild('g','hidden');assert.equal(b.alerts.length,0);assert.deepEqual(b.navigated.at(-1),['g','public']);
    // A locked channel opened on purpose with View Anyway stays open.
    last='hidden';b.tap('hidden');b.alerts[0][2][1].onPress();assert.equal(selected.getChannelId('g'),'hidden');
    b.api.setSetting('hiddenChannels',false);last='second';assert.equal(selected.getChannelId('g'),'second');
});

test('Hidden Channels blocks only locked channel navigation, including voice, with real native flag objects', () => {
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);const calls=[];
    const navigation=b.load({transitionTo:(...args)=>calls.push(args),replaceWith:(...args)=>calls.push(args),transitionToGuild:(...args)=>calls.push(args)},null,1113);
    navigation.transitionTo('/channels/g/hidden');navigation.replaceWith('/channels/g/voice');navigation.transitionTo('/channels/g/hidden');
    // The still-open prompt for 'hidden' is not stacked a second time.
    assert.equal(calls.length,0);assert.equal(b.alerts.length,2);assert.equal(b.alerts[1][0],'Locked voice channel');
    // Opening the server with a remembered locked channel never asks: it goes to the server without it.
    navigation.transitionToGuild('g','hidden');assert.equal(b.alerts.length,2);assert.equal(calls.length,1);assert.notEqual(calls[0][1],'hidden');
    navigation.transitionTo('/channels/g/public',{keep:true});navigation.transitionTo('/settings/hidden');navigation.transitionToGuild('g','public');
    assert.equal(calls.length,4);assert.deepEqual(calls[1][1],{keep:true});
    b.api.setSetting('hiddenChannels',false);navigation.transitionTo('/channels/g/hidden');assert.equal(calls.length,5);
});
test('Hidden Channels cache refreshes replaced records and parent metadata without stale references', () => {
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);const first=b.store.getChannels('g');
    b.channels.hidden={...b.channels.hidden,topic:'updated'};const next=b.store.getChannels('g');assert.notEqual(next,first);
    assert.equal(next.SELECTABLE.find(e=>e.channel.id==='hidden').channel.topic,'updated');
    b.channels.cat={...b.channels.cat,name:'new parent'};assert.notEqual(b.store.getChannels('g'),next);
});
test('JumpToTop does not wrap channel, DM, thread or forum long-press action sheets', () => {
    const b=boot(allFeatures);const factory=()=>{};
    for (const id of [9804,10418,15746]) {
        b.context.__d(factory,id,[]);assert.equal(b.factories.get(id),factory);
    }
});
test('JumpToTop passes returnMessageId so Jump to Present appears at the top and hides in empty chats', () => {
    const b=boot({jumpToTop:true});reactHarness(b);const jumps=[];
    let msgs={ready:true,hasMoreBefore:false,length:5,last:()=>({id:'999'})};
    b.load({default:{getMessages:()=>msgs}},null,5057);
    b.load({default:{jumpToMessage:value=>jumps.push(value)}},null,6880);
    b.load({default:'NativeFloatingButton'},null,11643);b.load({default:'NativeArrow'},null,11644);
    const component=b.load({default:()=>null},null,11642).default;
    const btn=component({channelId:'123',screenIndex:0});
    btn.props.children.props.children.props.onPress();
    assert.equal(jumps[0].returnMessageId,'999');
    msgs={ready:true,hasMoreBefore:false,length:0,last:()=>undefined};
    assert.equal(component({channelId:'123',screenIndex:0}),null);
});

test('prototype Flux methods are shadowed on the same live instance, preserving private dispatch state', () => {
    const b=boot(allFeatures);let calls=0;
    class Flux {
        #dispatches=0;
        dispatch(event){this.#dispatches++;calls++;return event;}
        count(){return this.#dispatches;}
    }
    const flux=new Flux();const patched=b.load({default:flux},null,585).default;
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
    const store=new Store();const patched=b.load({default:store},null,4470).default;
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
    const store=b.load({default:{getMessage:(c,id)=>collection.toArray().find(m=>m.id===id),getMessages:()=>collection}},null,5057).default;
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
    const store=b.load({default:{getMessage:()=>undefined,getMessages:()=>new MessageCollection(),emitChange(){}}},null,5057).default;
    b.load({createMessageRecord:raw=>({...raw})},null,5059);b.load({default:{getCurrentUser:()=>({id:account})}},null,1378);
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
test('NoDelete replaces a damaged archive instead of blocking saving, and keeps one it could not read',async()=>{
    // Damaged: newly kept messages are saved over it in this same session.
    const b=boot(allFeatures);let disk='{broken';const writes=[],messages=new Map([['c:1',{id:'1',channel_id:'c',author:{id:'u'},content:'gone',state:'SENT'}]]);
    b.load({default:{getMessage:(c,id)=>messages.get(c+':'+id),getMessages:()=>new MessageCollection(),emitChange(){}}},null,5057);
    b.load({createMessageRecord:raw=>({...raw})},null,5059);b.load({default:{getCurrentUser:()=>({id:'owner'})}},null,1378);
    const dispatch=b.load({default:{dispatch(){return undefined;}}},null,585).default;
    b.load({default:native({fileExists:async path=>path.endsWith('venus-deleted-messages.json'),readFile:async()=>disk,
        writeFile:async(dir,name,text)=>{writes.push(name);if(name==='venus-deleted-messages.json')disk=text;}})});
    await flush();await flush();b.api.setSetting('noDelete',true);b.api.setSetting('noDeleteSave',true);await flush();await flush();
    assert.equal(b.api.status.archive,'restore failed');assert.equal(disk,'{broken','nothing kept yet, so the file is left as it was');
    dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});await new Promise(r=>setTimeout(r,800));await flush();await flush();
    assert.equal(JSON.parse(disk).messages[0].message.content,'gone');assert.equal(b.api.status.archive,'saved locally');
    // Unreadable: the file is never overwritten, so a passing read error can't erase saved messages.
    const u=boot(allFeatures);let kept='{"version":1}';
    u.load({default:{getMessage:()=>undefined,getMessages:()=>new MessageCollection(),emitChange(){}}},null,5057);
    u.load({createMessageRecord:raw=>({...raw})},null,5059);u.load({default:{getCurrentUser:()=>({id:'owner'})}},null,1378);
    u.load({default:native({fileExists:async path=>path.endsWith('venus-deleted-messages.json'),readFile:async path=>{if(path.endsWith('venus-deleted-messages.json'))throw new Error('busy');return null;},
        writeFile:async(dir,name,text)=>{if(name==='venus-deleted-messages.json')kept=text;}})});
    await flush();await flush();u.api.setSetting('noDelete',true);u.api.setSetting('noDeleteSave',true);await flush();await flush();
    await new Promise(r=>setTimeout(r,800));await flush();
    assert.equal(u.api.status.archive,'restore failed');assert.equal(kept,'{"version":1}');
});
test('NoDelete archive text is built once per kept message and matches a full JSON.stringify',async()=>{
    const raw={id:'1',channel_id:'c',author:{id:'u'},content:'saved'};
    const saved=JSON.stringify({version:1,accountId:'owner',messages:[{id:'1',channelId:'c',message:raw}]});
    const b=await archiveHarness(saved);
    b.api.setSetting('noDeleteLimit',10);await new Promise(r=>setTimeout(r,800));await flush();await flush();
    const disk=b.getDisk();assert.deepEqual(JSON.parse(disk),JSON.parse(saved));
    assert.equal(disk,JSON.stringify(JSON.parse(disk)),'same text as JSON.stringify');
});
test('Hidden Channels mobile list facade handles named/default imports without changing real permission results',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    // boot's require mocks return nothing; load a realistic factory directly through __d instead.
    const real=b.permission;let captured;
    b.context.__d(function(g,req,imp,all,m){captured=[req(4472).default,imp(4472),all(4472).default];m.exports={};},6952,[]);
    b.factories.get(6952)(b.context,()=>({default:real}),()=>real,()=>({default:real}),{exports:{}},{},[]);
    // Global bypass is active when enabled; realCheck reveals the true false.
    for(const facade of captured){assert.equal(facade.can(b.viewPermission,b.channels.hidden),true);assert.equal(real.can(b.viewPermission,b.channels.hidden),true);}
    assert.equal(real.can(b.viewPermission,Object.assign({},b.channels.hidden,{realCheck:true})),false);
    b.api.setSetting('hiddenChannels',false);for(const facade of captured)assert.equal(facade.can(b.viewPermission,b.channels.hidden),false);
});
test('Hidden Channels fills numeric native channel-type buckets and gets direct permission constants',()=>{
    const b=hiddenHarness();b.load({Permissions:{VIEW_CHANNEL:b.viewPermission}},null,1097);b.load({},null,1086);
    const original={0:[],2:[],4:[],SELECTABLE:[],VOCAL:[]};const store=b.load({default:{getChannels:()=>original}},null,4470).default;
    b.api.setSetting('hiddenChannels',true);const value=store.getChannels('g');assert.equal(value[0].length,2);assert.equal(value[2].length,1);assert.equal(original[0].length,0);
});

test('Pastelize preserves role colors and immutable mentions, supports webhook and content controls',()=>{
    const b=boot(allFeatures);const {RN}=reactHarness(b);RN.processColor=hex=>parseInt(hex.slice(1),16)|0xff000000;
    // Pinned module 1252 is CommonJS: a direct function, not {default:fn}.
    b.load(seed=>Array.from(seed).reduce((a,c)=>a+c.charCodeAt(0),0),null,1252);
    class Rows {generate(row){return row.result;}}
    b.load({default:Rows},null,7378);
    const message=Object.freeze({authorId:'123',username:'Test',roleColor:null,content:Object.freeze([Object.freeze({type:'mention',userId:'456',content:'test'})])});
    const row={rowType:1,message:{},result:Object.freeze({message})}, rows=new Rows();
    const result=rows.generate(row);assert.notEqual(result,row.result);assert.equal(message.roleColor,null);assert.equal(typeof result.message.colorString,'number');assert.equal(result.message.colorString,result.message.roleColor);assert.equal(message.content[0].colorString,undefined);
    assert.match(result.message.content[0].colorString,/^#/);assert.equal(rows.generate(row).message.colorString,result.message.colorString);
    const colored={...row,result:{message:{...message,roleColor:123,content:[]}}};assert.equal(rows.generate(colored).message.roleColor,123);
    b.api.setSetting('pastelAll',true);assert.notEqual(rows.generate(colored).message.roleColor,123);
    b.api.setSetting('pastelContent',true);const tinted=rows.generate(row).message;
    assert.equal(typeof tinted.textColor,'number');assert.equal(tinted.content[0].type,'mention');
    assert.equal(JSON.stringify(tinted).includes('usernameOnClick'),false);
    b.api.setSetting('pastelize',false);assert.equal(rows.generate(row),row.result);
});
test('PlatformIndicators uses real client status, hides unknown/offline clients and preserves immutable profiles',()=>{
    const b=boot(allFeatures),{React}=reactHarness(b);const clients={desktop:'online',mobile:'idle',web:'offline',unknown:'dnd'};
    b.load({default:{getClientStatus:()=>clients,addChangeListener(){},removeChangeListener(){}}},null,4877);
    function DisplayName(props){return Object.freeze(React.createElement('Name',{children:props.user.id}));}
    const profile=Object.freeze(React.createElement('View',{children:React.createElement(DisplayName,{user:{id:'u'}})}));
    const exports=b.load({DisplayName,default:()=>profile},null,10603);
    const tree=exports.default({});assert.notEqual(tree,profile);const named=tree.props.children.type(tree.props.children.props);
    const badges=named.props.children[1];const rendered=badges.type(badges.props);
    assert.deepEqual(Array.from(rendered.props.children,c=>c.props.children.props.platform),['desktop','mobile']);
    assert.deepEqual(Array.from(rendered.props.children,c=>c.props.children.props.color),['#23a55a','#f0b232']);
    assert.deepEqual(Array.from(rendered.props.children,c=>c.props.accessibilityLabel),['Desktop: Online','Mobile: Idle']);
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
    // 4801 exports showActionSheet by NAME, not on its default action creators.
    // Execute the show/close boundary instead of only recording lazy-loader inputs.
    const sheetEvents=[],hiddenSheets=[];
    const showActionSheet=config=>{sheets.push(config);sheetEvents.push({type:'SHOW_ACTION_SHEET',...config});};
    const native={5916:{TableRow:'NativeRow'},5997:{TableRowGroup:'RowGroup'},6621:{TableSwitchRow:'SwitchRow'},5280:{Stack:'Stack'},5918:{Card:'UserProfileCard'},
        8057:{FormRow:'FormRow',FormLabel:'FormLabel',FormSubLabel:'FormSubLabel'},6021:{TextInput:'NativeTextInput'},4778:{SendMessageIcon:'SendIcon'},
        6624:{ActionSheet:'ActionSheet'},6571:{BottomSheetTitleHeader:'SheetHeader'},6619:{ActionSheetCloseButton:'SheetClose'},
        4801:{showActionSheet,default:{openLazy(){throw new Error('Bundled reviews must not use a lazy importer');},hideActionSheet:key=>hiddenSheets.push(key)}},6616:{showSimpleActionSheet:value=>simple.push(value)},
        6614:{Clipboard:{setString:value=>copied.push(value)}},5205:{default:{show:value=>confirms.push(value)}},4531:{default:{open:value=>toasts.push(value)}},
        4694:{pushModal:value=>pushed.push(value),popModal:key=>popped.push(key)},8510:{default:'OAuth2AuthorizeModal'},4551:{useThemeContext:()=>({primaryColor:'#123456'})}};
    b.context.__r=id=>native[id]||null;
    b.load({default:{getCurrentUser:()=>account}},null,1378);
    const noteOriginal=React.createElement('Note',null);
    const note=b.load({default:()=>noteOriginal},null,12627).default;
    const progressOriginal=React.createElement('Progress',null);
    const guild=b.load({default:()=>progressOriginal},null,13521).default;
    const menuCalls=[];const menu=b.load({ContextMenuPopout:props=>{menuCalls.push(props);return 'menu';}},null,13987);
    const registry=b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route'}}},null,14130).SETTING_RENDERER_CONFIG;
    const Settings=registry.VENUS_REVIEWDB.screen.getComponent();
    return {...b,React,RN,requests,alerts,account,toasts,confirms,sheets,simple,pushed,popped,copied,note,noteOriginal,guild,progressOriginal,menu,menuCalls,Settings,native,sheetEvents,hiddenSheets};
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
    const store=b.load({default:{getMessage:(c,id)=>collection.toArray().find(message=>message.id===id),getMessages:()=>collection}},null,5057).default;
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
    b.load({default:Rows},null,7378);const rows=new Rows();
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
    const names=b.load({default:c=>c.isObfuscated && c.isObfuscated() ? 'No Access' : c.name,computeChannelName:c=>c.isObfuscated && c.isObfuscated() ? 'No Access' : c.name},null,4990);
    const category={id:'empty',type:4,guild_id:'g',name:'PRIVATE STAFF',position:9};b.channels.empty=category;
    assert.equal(names.computeChannelName(b.channels.hidden),'staff chat');
    assert.equal(names.default(b.channels.hidden),'staff chat');assert.equal(names.computeChannelName(category),'PRIVATE STAFF');
    assert.equal(b.store.getChannels('g')[4].some(entry=>entry.channel.id==='empty'),true);
    // Global bypass reveals hidden categories; realCheck shows true denial.
    assert.equal(b.permission.can(b.viewPermission,category),true);
    assert.equal(b.permission.can(b.viewPermission,Object.assign({},category,{realCheck:true})),false);
    b.permission.can=(bit,channel)=>bit===b.viewPermission && b.allowed.has(channel.id);
    let facade;b.context.__d((g,r,i,a,m)=>{facade=i(4472);m.exports={};},6952,[]);
    b.factories.get(6952)(b.context,()=>b.permission,()=>b.permission,()=>b.permission,{exports:{}},{},[]);
    assert.equal(facade.can(b.viewPermission,category),true);assert.equal(facade.can('CONNECT',category),false);
    category.isObfuscated=()=>true;b.api.setSetting('hiddenChannels',false);assert.equal(names.computeChannelName(category),'No Access');assert.equal(facade.can(b.viewPermission,category),false);
});
test('Pastelize respects source role colors and unknown members, and colors webhook names and nested reply mentions',()=>{
    const b=boot(allFeatures),{RN}=reactHarness(b);RN.processColor=color=>color;
    const seeds=[];b.load(seed=>{seeds.push(seed);return seed.length*23;},null,1252);
    b.load({default:{getMember:(guild,id)=>id==='missing'?null:{id}}},null,2111);
    class Rows{generate(row){return row.result;}}b.load({default:Rows},null,7378);const rows=new Rows();
    const message={authorId:'author',guildId:'g',username:'Name',roleColor:null,content:[{type:'strong',content:[{type:'mention',userId:'member'},{type:'mention',userId:'missing'}]}]};
    const row={rowType:1,message:{colorString:'#123456'},result:{message}};
    let result=rows.generate(row);assert.equal(result.message.roleColor,null);assert.equal(result.message.shouldShowRoleOnName,true);
    assert.match(result.message.content[0].content[0].colorString,/^#/);assert.equal(result.message.content[0].content[1].colorString,undefined);
    const unknown={...row,result:{message:{...message,authorId:'missing'}}};assert.equal(rows.generate(unknown).message,unknown.result.message);
    const webhook={...row,message:{webhookId:'hook'},result:{message:{...message,referencedMessage:{message:{authorId:'reply',content:[],guildId:'g'}}}}};
    seeds.length=0;result=rows.generate(webhook);assert.equal(seeds.includes('Name'),true);assert.equal(seeds.includes('reply'),true);
    assert.notEqual(result.message.referencedMessage.message.roleColor,undefined);
    // A webhook without a name falls back to its ID.
    seeds.length=0;rows.generate({...webhook,result:{message:{...webhook.result.message,username:''}}});assert.equal(seeds.includes('hook'),true);
    b.api.setSetting('pastelAll',true);assert.notEqual(rows.generate(row).message.roleColor,null);
    assert.equal(message.content[0].content[0].colorString,undefined);
});
function platformFixture() {
    const b=boot({platformIndicators:true}),{React}=reactHarness(b);
    function DisplayName(props){return React.createElement('Name',{children:props.user.id});}
    const profile=b.load({DisplayName,default:()=>React.createElement('Profile',{children:React.createElement(DisplayName,{user:{id:'self'}})})},null,10603);
    const tree=profile.default({}),name=tree.props.children.type(tree.props.children.props);
    return {...b,React,badges:name.props.children[1]};
}
test('PlatformIndicators uses own sessions and cleans up both subscriptions',()=>{
    const b=platformFixture(),listeners=new Set(),removals=[];let sessions={one:{clientInfo:{client:'mobile'},status:'idle'},two:{clientInfo:{client:'web'},status:'dnd'},unknown:{clientInfo:{client:'unknown'},status:'online'}};
    const presence={getClientStatus:()=>({desktop:'online'}),addChangeListener:fn=>listeners.add(fn),removeChangeListener:fn=>{removals.push('presence');listeners.delete(fn);}};
    const store={getSessions:()=>sessions,addChangeListener:fn=>listeners.add(fn),removeChangeListener:fn=>{removals.push('sessions');listeners.delete(fn);}};
    b.load({default:presence},null,4877);b.load({default:{getCurrentUser:()=>({id:'self'})}},null,1378);
    b.context.__r=id=>({4855:{default:store}}[id]);
    let cleanup;b.React.useEffect=fn=>cleanup=fn();
    let tree=b.badges.type(b.badges.props);assert.deepEqual(Array.from(tree.props.children,c=>c.props.children.props.platform),['mobile','web']);
    cleanup();assert.deepEqual(removals,['presence','sessions']);
    sessions={one:{clientInfo:{client:'embedded'},status:'online'}};tree=b.badges.type(b.badges.props);
    assert.equal(tree.props.children[0].props.children.props.platform,'embedded');cleanup();
    b.api.setSetting('platformIndicators',false);assert.equal(b.badges.type(b.badges.props),null);cleanup();
});
function openReviewAuth(b) {
    b.api.setSetting('reviewDB',true);
    walkElements(b.Settings(),n=>n.props.label==='Sign in to ReviewDB')[0].props.onPress();
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
test('ReviewDB settings: Account and Settings groups with native rows',()=>{
    const b=reviewHarness();b.api.setSetting('reviewDB',true);const tree=b.Settings();
    assert.deepEqual(walkElements(tree,n=>n.type==='RowGroup').map(n=>n.props.title),['Account','Display']);
    const login=walkElements(tree,n=>n.props.label==='Sign in to ReviewDB')[0];assert.equal(login.type,'NativeRow');assert.equal(login.props.arrow,true);assert.equal(login.props.disabled,false);
    // One row: the action you can take now, never a greyed-out opposite.
    assert.equal(walkElements(tree,n=>n.props.label==='Sign out of ReviewDB').length,0,'no disabled sign-out row while signed out');
    // The main switch lives on the Settings list row, not repeated on its page.
    assert.deepEqual(walkElements(tree,n=>n.type==='SwitchRow').map(n=>n.props.label),['Show the be-respectful note']);
    assert.equal(walkElements(tree,n=>n.type==='Stack')[0].props.spacing,24);
});
test('ReviewDB OAuth follows the traced 347.12 order: dismissOAuthModal BEFORE callback still signs in',async()=>{
    const b=reviewHarness();const props=openReviewAuth(b);
    assert.equal(b.pushed[0].key,'oauth2-authorize');assert.equal(b.pushed[0].modal.modal,'OAuth2AuthorizeModal');
    assert.equal(props.clientId,'915703782174752809');assert.equal(props.redirectUri,'https://manti.vendicated.dev/api/reviewdb/auth');assert.equal(props.cancelCompletesFlow,false);
    props.dismissOAuthModal();assert.deepEqual(b.popped,['oauth2-authorize']);
    props.callback({location:'https://manti.vendicated.dev/api/reviewdb/auth?code=a%2Bb'});await flush();await flush();
    assert.equal(b.requests[0][0],'https://manti.vendicated.dev/api/reviewdb/auth?code=a%2Bb&returnType=json&clientMod=vendetta');
    assert.equal(b.popped.length,1);assert.equal(walkElements(b.Settings(),n=>n.props.label==='Sign out of ReviewDB').length,1);
    assert.equal(walkElements(b.Settings(),n=>n.props.label==='Sign in to ReviewDB').length,0,'sign-in row replaced by sign-out');
    assert.match(walkElements(b.Settings(),n=>n.props.label==='Sign out of ReviewDB')[0].props.subLabel,/Authorized Apps/);
    assert.equal(b.toasts.at(-1).content,'Signed in to ReviewDB');
    // Like Discord's own toasts, Venus's carry an icon for what just happened.
    assert.equal(typeof b.toasts.at(-1).IconComponent,'function','sign-in toast has an icon');
    // Success toasts use Discord's CircleCheckIcon; failures use CircleXIcon.
    const Before=b.context.__r;let asked=[];b.context.__r=id=>{asked.push(id);return Before(id);};
    b.toasts.at(-1).IconComponent({});assert.ok(asked.includes(4793),'success toast uses CircleCheckIcon');b.context.__r=Before;
});
test('ReviewDB sign-in survives disabling the plugin and logs out explicitly, and stays signed in',async()=>{
    const b=reviewHarness();const props=openReviewAuth(b);props.callback({location:'https://manti.vendicated.dev/api/reviewdb/auth?code=x'});await flush();await flush();
    b.api.setSetting('reviewDB',false);b.api.setSetting('reviewDB',true);
    assert.equal(walkElements(b.Settings(),n=>n.props.label==='Sign out of ReviewDB').length,1);
    walkElements(b.Settings(),n=>n.props.label==='Sign out of ReviewDB')[0].props.onPress();
    assert.equal(walkElements(b.Settings(),n=>n.props.label==='Sign in to ReviewDB').length,1);
});
test('ReviewDB cancellation, malformed redirects and account switches never sign in',async()=>{
    const b=reviewHarness();let props=openReviewAuth(b);props.callback({canceled:true});await flush();
    assert.equal(b.requests.length,0);assert.equal(walkElements(b.Settings(),n=>n.props.label==='Sign in to ReviewDB').length,1);
    for(const location of ['https://evil.example/api/reviewdb/auth?code=x','https://manti.vendicated.dev/api/reviewdb/auth?error=access_denied','not a URL']){props=openReviewAuth(b);props.callback({location});await flush();}
    assert.equal(b.requests.length,0);
    let resolve;b.context.fetch=()=>new Promise(done=>{resolve=done;});
    props=openReviewAuth(b);props.callback({location:'https://manti.vendicated.dev/api/reviewdb/auth?code=late'});await flush();
    b.account.id='222222222222222222';resolve({ok:true,json:async()=>({success:true,token:'must-not-survive'})});await flush();await flush();
    assert.equal(walkElements(b.Settings(),n=>n.props.label==='Sign out of ReviewDB').length,0);
});
test('ReviewDB profile section renders directly after the profile note card directly beneath it',async()=>{
    const b=reviewHarness();assert.equal(b.note({userId:'222222222222222222'}).props.children[0],b.noteOriginal);
    b.api.setSetting('reviewDB',true);const m=await loadedReviews(b,'222222222222222222');
    assert.equal(m.tree.type,'Fragment');assert.equal(m.tree.props.children[0],b.noteOriginal);assert.equal(m.section.props.userId,'222222222222222222');
    const profileCard=m.render().props.children;assert.equal(profileCard.type,'UserProfileCard');assert.equal(profileCard.props.title,'Reviews');
    const rows=profileCard.props.children[0].props.children;assert.equal(rows.length,2);
    const row=rows[1].type(rows[1].props);const form=row.props.children;assert.equal(row.type,'RowGroup');assert.equal(form.type,'FormRow');
    assert.equal(form.props.subLabel.type,'FormSubLabel');assert.equal(form.props.subLabel.props.text,'hello');assert.equal(form.props.leading.props.style.height,36);
    assert.equal(walkElements(form.props.label,n=>n.type==='FormLabel')[0].props.text,'Other');
    const input=profileCard.props.children[1];const rendered=input.type(input.props);
    assert.equal(walkElements(rendered,n=>n.type==='NativeTextInput')[0].props.placeholder,'Sign in to ReviewDB in Venus settings to write a review.');
    form.props.onLongPress();assert.equal(b.simple.at(-1).header.title,'Review by Other');assert.deepEqual(Array.from(b.simple.at(-1).options,o=>o.label),['Copy Text']);
    b.simple.at(-1).options[0].onPress();assert.deepEqual(b.copied,['hello']);
    b.api.setSetting('reviewWarning',false);assert.equal(m.render().props.children.props.children[0].props.children.length,1);
    assert.equal(b.requests.filter(([u])=>u.includes('/reviews')).every(([,o])=>!o.headers.authorization),true);
});
function mountReviewElement(b,element) {
    const states=[],effects=[];let i=0;
    return {effects,render(){
        i=0;b.React.useState=initial=>{const index=i++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;
            return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];};
        b.React.useEffect=fn=>effects.push(fn);
        return element.type(element.props);
    }};
}
test('ReviewDB server Reviews expands in the existing guild sheet, fetches the guild ID and collapses',async()=>{
    const b=reviewHarness();const off=b.guild({guild:{id:'444444444444444444'}});assert.equal(off.props.guild.id,'444444444444444444');
    b.api.setSetting('reviewDB',true);const element=b.guild({guild:{id:'444444444444444444'}});
    assert.equal(element.type.name,'ServerReviews');
    const m=mountReviewElement(b,element);let tree=m.render();m.effects.splice(0).forEach(fn=>fn());
    assert.equal(walkElements(tree,n=>n.type&&n.type.name==='ReviewSection').length,0);
    const row=walkElements(tree,n=>n.props.label==='Reviews')[0];row.props.onPress();tree=m.render();
    const section=walkElements(tree,n=>n.type&&n.type.name==='ReviewSection')[0];
    assert.equal(section.props.userId,'444444444444444444');assert.equal(section.props.standalone,true);
    const mounted=mountReviewElement(b,section);assert.match(JSON.stringify(mounted.render()),/Loading reviews/);
    mounted.effects.splice(0).forEach(fn=>fn());await flush();await flush();
    assert.match(JSON.stringify(mounted.render()),/hello/);assert.equal(b.requests.some(([url])=>url.endsWith('/users/444444444444444444/reviews')),true);
    assert.equal(b.sheets.length,0);assert.equal(b.pushed.length,0);
    walkElements(m.render(),n=>n.props.label==='Reviews')[0].props.onPress();
    assert.equal(walkElements(m.render(),n=>n.type&&n.type.name==='ReviewSection').length,0);
});
test('ReviewDB user context menu gains a Reviews entry and signed-in actions follow ReviewDB permissions',async()=>{
    const b=reviewHarness();b.api.setSetting('reviewDB',true);
    b.menu.ContextMenuPopout({menu:{key:'222222222222222222',items:[1,2,3]}});const items=b.menuCalls.at(-1).menu.items;assert.equal(items.at(-1).label,'Reviews');
    items.at(-1).action();assert.equal(b.sheets.at(-1).content.props.userId,'222222222222222222');
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
    const store=b.load({default:{getMessage:(channel,id)=>original.toArray().find(m=>m.id===id),getMessages:()=>original}},null,5057).default;
    b.api.setSetting('noDelete',true);b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'999999999999999999'});
    original=new UnsortedNative([{id:'1000000000000000000',content:'new'}]);b.dispatch.dispatch({type:'CACHE_LOADED'});
    const view=store.getMessages('c');assert.deepEqual(Array.from(view.toArray(),m=>m.id),['999999999999999999','1000000000000000000']);
    assert.equal(original.toArray().length,1);assert.notEqual(view._array,original._array);assert.equal(view.hasMoreAfter,false);
});
test('Hidden Channels information uses only cached topics, parent and snowflake/pin timestamps',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    const id=String((BigInt(Date.UTC(2020,0,1)-1420070400000)<<22n)+1n);
    b.channels.details={...b.channels.hidden,id,lastMessageId:id,lastPinTimestamp:'2020-01-02T00:00:00.000Z'};
    b.tap('details');b.actions.fetchMessages({channelId:'details'});assert.equal(b.fetched.length,0);
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
        const store=b.load({default:{getMessage:()=>message}},null,5057).default;
        const kept=store.getMessage('c','x');assert.notEqual(kept,message);assert.equal(kept.content,content);assert.equal(kept.attachments,message.attachments);
        assert.equal(b.events.at(-1).message.content,content);
        b.api.setSetting('noDelete',false);b.api.setSetting('noDelete',true);
    }
});
test('Hidden Channels resolves real basic record names and immutable numeric section entries without textual lock suffixes',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    b.channels.hidden={...b.channels.hidden,name:'__hidden__'};b.channels.cat={...b.channels.cat,name:'__hidden__'};
    const basic={hidden:{...b.channels.hidden,name:'staff-chat'},cat:{...b.channels.cat,name:'PRIVATE STAFF'}};
    b.load({default:{getChannel:id=>b.channels[id],getBasicChannel:id=>basic[id],getMutableGuildChannelsForGuild:()=>b.channels,getMutableBasicGuildChannelsForGuild:()=>basic}},null,2051);
    const names=b.load({default:c=>c.isObfuscated && c.isObfuscated() ? 'No Access' : c.name,computeChannelName:c=>c.isObfuscated && c.isObfuscated() ? 'No Access' : c.name},null,4990);
    assert.equal(names.default(b.channels.hidden),'staff chat');assert.equal(names.computeChannelName(b.channels.cat),'PRIVATE STAFF');
    const original=Object.freeze({0:Object.freeze([{channel:b.channels.hidden,comparator:3}]),4:Object.freeze([{channel:b.channels.cat,comparator:2}])});
    const store=b.load({default:{getChannels:()=>original}},null,4470).default;const list=store.getChannels('g');
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
    let account='me';b.load({default:{getCurrentUser:()=>({id:account})}},null,1378);
    const dispatch=b.load({default:{dispatch(){}}},null,585).default;
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
    b.tap('timed');
    const text=b.alerts.at(-1)[1];
    assert.match(text,/8 days, 7 hours and 7 minutes ago/);
});
test('Hidden Channels popup uses Discord\'s native AlertModal with themed Text tokens and no names or topics',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);
    const shown=[];const required=[];
    function NativeText(){}
    b.context.__r=id=>{required.push(id);return id===5205?{default:{show:value=>shown.push(value)}}:id===4833?{Text:NativeText}:null;};
    const minute=60000, hour=60*minute, day=24*hour;
    const ago = 8*day + 7*hour + 7*minute;
    const id = String((BigInt(Date.now()-ago-1420070400000)<<22n)+1n);
    b.channels.timed={...b.channels.hidden,id,lastMessageId:id,lastPinTimestamp:new Date(Date.now()-ago).toISOString()};
    b.tap('timed');
    assert.equal(shown.length,1);assert.equal(b.alerts.length,0);assert.deepEqual(required.sort(),[4833,5205]);
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
    b.tap('timed');assert.equal(shown.length,1);
    alert.onCancel();b.tap('timed');assert.equal(shown.length,2);
    shown[1].onConfirm();assert.deepEqual(b.navigated,['/channels/g/timed']);
    b.actions.fetchMessages({channelId:'timed'});assert.equal(b.fetched.length,1);
});
test('Hidden Channels never presents a server redaction as a real name or fetches unknown names',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.channels.hidden={...b.channels.hidden,name:'__hidden__'};b.channels.cat={...b.channels.cat,name:'__hidden__'};
    assert.equal(b.label(b.channels.hidden),'Hidden channel (name unavailable)');assert.equal(b.label(b.channels.cat),'Hidden category (name unavailable)');
    b.tap('hidden');b.actions.fetchMessages({channelId:'hidden'});assert.equal(b.fetched.length,0);
    assert.doesNotMatch(String(b.alerts[0][1]),/__hidden__|\[locked\]|Category:|Topic:/);
});
test('Hidden Channels cached gateway names clear on logout, account switch and channel removal but survive disabling',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.channels.hidden={...b.channels.hidden,name:'__hidden__'};
    let account='first';b.load({default:{getCurrentUser:()=>({id:account})}},null,1378);
    const dispatch=b.load({default:{dispatch(){}}},null,585).default;
    function remember(){dispatch.dispatch({type:'CHANNEL_UPDATE',channel:{...b.channels.hidden,name:'received-name'}});assert.equal(b.label(b.channels.hidden),'received name');}
    remember();dispatch.dispatch({type:'LOGOUT'});assert.match(b.label(b.channels.hidden),/name unavailable/);
    remember();account='second';assert.match(b.label(b.channels.hidden),/name unavailable/);
    remember();dispatch.dispatch({type:'CHANNEL_DELETE',channel:{id:'hidden'}});assert.match(b.label(b.channels.hidden),/name unavailable/);
    // Disabling keeps the cache so re-enabling still resolves; views go stock while off.
    remember();b.api.setSetting('hiddenChannels',false);assert.equal(b.store.getChannels('g'),b.result);
    b.api.setSetting('hiddenChannels',true);assert.equal(b.label(b.channels.hidden),'received name');
});
test('Hidden Channels adds no second lock and preserves frozen ChannelInfo and stock disabled output',()=>{
    const b=hiddenHarness(),{React}=reactHarness(b);b.api.setSetting('hiddenChannels',true);
    b.load({LockIcon:'NativeLock'},null,5410);const original=Object.freeze(React.createElement('ChannelInfo',{children:'staff'}));
    const info=b.load({default:()=>original},null,15859).default;
    // Discord draws its own TextLockIcon for the row; Venus no longer adds a second, bigger lock beside the name.
    const tree=info({channel:b.channels.hidden});assert.equal(tree.props.children,original);assert.match(tree.props.accessibilityLabel,/locked/);
    b.api.setSetting('hiddenChannels',false);assert.equal(info({channel:b.channels.hidden}),original);
});
test('PlatformIndicators uses the bundled tinted PNG glyphs for desktop and mobile',()=>{
    const b=platformFixture();b.load({default:{getClientStatus:()=>({desktop:'online',mobile:'idle'})}},null,4877);
    const icons=b.badges.type({userId:'other'}).props.children;const desktop=icons[0].props.children;const image=desktop.type(desktop.props);
    assert.match(image.props.source.uri,/^data:image\/png;base64,/);assert.equal(image.props.style.tintColor,'#23a55a');assert.equal(image.props.style.width,16);
    const mobile=icons[1].props.children;assert.equal(mobile.type(mobile.props).props.style.tintColor,'#f0b232');
});
test('PlatformIndicators covers memoized DM headers, DM content, friend labels and voice member titles without mutating props',()=>{
    const b=boot({platformIndicators:true}),{React,RN}=reactHarness(b);b.load({default:{getClientStatus:()=>({desktop:'online'})}},null,4877);
    const channel={id:'dm',type:1,recipients:['recipient']};b.load({default:{getChannel:()=>channel}},null,2051);
    const onPress=()=>{},name=Object.freeze(React.createElement(RN.Text,{variant:'redesign/channel-title/semibold',children:'User'}));
    for(const module of [12845,15667,9108]) {
        const original=Object.freeze(React.createElement(RN.View,{onPress,children:Object.freeze([name,React.createElement('Subtitle',{children:'Activity'})])}));
        const component=Object.freeze({$$typeof:Symbol.for('react.memo'),type:()=>original,compare:()=>false});
        // 348.10 voice panel rows are FormComponents' named MemberRowItem export, not a default.
        const key=module===9108?'MemberRowItem':'default';
        const exports=b.load({[key]:component},null,module);const props=module===12845?{channelId:'dm'}:module===15667?{channel}:{user:{id:'recipient'}};
        const tree=exports[key].type(props),badges=walkElements(tree,n=>n.type && n.type.name==='PlatformBadges');
        assert.equal(badges.length,1);assert.equal(badges[0].props.userId,'recipient');assert.equal(original.props.children[0],name);assert.equal(tree.props.onPress,onPress);assert.equal(exports[key].compare,component.compare);
        assert.equal(walkElements(tree,n=>n.type===RN.Text && walkElements(n,x=>x.type===RN.View).length).length,0);
        b.api.setSetting('platformIndicators',false);assert.equal(exports[key].type(props),original);b.api.setSetting('platformIndicators',true);
    }
    const original=Object.freeze(React.createElement('NativeRow',{label:name,onPress,subLabel:'Playing'}));
    const row=b.load({default:()=>original},null,10371).default;const tree=row({user:{id:'friend'}});
    assert.equal(walkElements(tree,n=>n.type && n.type.name==='PlatformBadges')[0].props.userId,'friend');assert.equal(tree.props.subLabel,'Playing');assert.equal(tree.props.onPress,onPress);assert.equal(original.props.label,name);
});
test('PlatformIndicators excludes groups and guild channel lists from single-user DM placements',()=>{
    const b=boot({platformIndicators:true}),{React,RN}=reactHarness(b);const original=React.createElement(RN.View,{children:React.createElement(RN.Text,{children:'Group'})});
    const content=b.load({default:()=>original},null,15667).default;
    for(const channel of [{type:3,recipients:['a','b']},{type:0,recipients:['a']},{type:1,recipients:[]}])assert.equal(content({channel}),original);
});
// HBC98 #124513: Call2(callback, result) at 0xf7, no Promise yield for that
// return; dismissOAuthModal at 0x1ac. The old tests awaited callback first and
// therefore could not reproduce the reported native close-before-auth race.
test('Hidden Channels captures initial READY and supplemental names before native records are redacted',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.channels.hidden={...b.channels.hidden,name:'__hidden__'};b.channels.cat={...b.channels.cat,name:'__hidden__'};
    const dispatch=b.load({default:{dispatch(){}}},null,585).default;
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
    b.load({default:{getChannel:id=>b.channels[id],getBasicChannel:id=>basic[id],getMutableGuildChannelsForGuild:()=>b.channels,getMutableBasicGuildChannelsForGuild:()=>basic}},null,2051);
    const list=b.store.getChannels('g');assert.equal(list.SELECTABLE.find(entry=>entry.channel.id===extra.id).channel.name,'private-basic');assert.equal(list[4].find(entry=>entry.channel.id===parent.id).channel.name,'BASIC CATEGORY');
    assert.equal(b.store.getChannels('g'),list);await b.actions.fetchMessages({channelId:extra.id});assert.equal(b.fetched.length,0);
    const calls=[];const routes=b.load({transitionTo:r=>calls.push(r),transitionToGuild:(g,c)=>calls.push(c)},null,1113);
    routes.transitionTo('/channels/g/basic-only');assert.equal(calls.length,0);assert.match(b.alerts.at(-1)[1],/Created: Unavailable/);
    routes.transitionToGuild('g','basic-only');assert.equal(calls.length,1);assert.notEqual(calls[0],'basic-only');
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
    const real=new NativeStore();b.load({default:real},null,2051);const original=b.channels.hidden;
    let imported;b.context.__d((g,r,i,a,m)=>{imported=i(2051).default;m.exports={};},6952,[]);
    b.factories.get(6952)(b.context,()=>({default:real}),()=>({default:real}),()=>({default:real}),{exports:{}},{},[]);
    assert.equal(imported.getChannel('hidden').name,'native-staff');assert.equal(imported.getChannel('hidden').flags,32768);assert.equal(imported.subscribe(),'live-store');assert.equal(real.getChannel('hidden'),original);assert.equal(original.name,'__hidden__');
    b.api.setSetting('hiddenChannels',false);assert.equal(imported.getChannel('hidden'),original);
});
test('Hidden Channels respects native formatter escaping and uppercase categories without changing obfuscation flags',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.api.setSetting('dashless',false);
    const channel=Object.freeze({...b.channels.hidden,name:'staff-\\"chat',flags:32768,isObfuscated:()=>true});
    const category=Object.freeze({...b.channels.cat,name:'private staff',flags:32768,isObfuscated:()=>true});
    function nativeFormatter(c,quoted){if(c.isObfuscated())return '__hidden__';const name=c.type===4?c.name.toUpperCase():c.name;return quoted?JSON.stringify(name):name;}
    const names=b.load({default:nativeFormatter,computeChannelName:nativeFormatter},null,4990);
    assert.equal(names.computeChannelName(channel,true),JSON.stringify(channel.name));assert.equal(names.default(category),'PRIVATE STAFF');
    assert.equal(channel.isObfuscated(),true);assert.equal(channel.flags,32768);assert.equal(category.isObfuscated(),true);
    b.api.setSetting('hiddenChannels',false);assert.equal(names.default(category),'__hidden__');
});

test('Hidden Channels READY cache belongs to the incoming account before UserStore reducer runs',()=>{
    const b=hiddenHarness();b.api.setSetting('hiddenChannels',true);b.channels.hidden={...b.channels.hidden,name:'__hidden__'};
    let account=null;b.load({default:{getCurrentUser:()=>account}},null,1378);
    const dispatch=b.load({default:{dispatch(event){if(event.type==='CONNECTION_OPEN')account=event.user;}}},null,585).default;
    dispatch.dispatch({type:'CONNECTION_OPEN',user:{id:'111111111111111111'},guilds:[{id:'g',channels:[{id:'hidden',name:'first-staff'}]}]});
    assert.equal(b.label(b.channels.hidden),'first staff');
    dispatch.dispatch({type:'CONNECTION_OPEN',user:{id:'222222222222222222'},guilds:[{id:'g',channels:[{id:'hidden',name:'second-staff'}]}]});
    assert.equal(b.label(b.channels.hidden),'second staff');
    account={id:'333333333333333333'};assert.match(b.label(b.channels.hidden),/name unavailable/);
});
test('PlatformIndicators hides the stock mobile badge and exposes its settings',()=>{
    const b=boot({platformIndicators:true});reactHarness(b);
    const seen=[];const status=b.load({default:props=>{seen.push(props.isMobileOnline);return null;},StatusWithTyping:props=>{seen.push(props.isMobileOnline);return null;}},null,13649);
    status.default({status:'online',isMobileOnline:true});status.StatusWithTyping({status:'online',isMobileOnline:true});
    b.api.setSetting('piHideMobile',false);status.default({status:'online',isMobileOnline:true});
    assert.deepEqual(seen,[false,false,true]);
    for (const key of ['piDmHeader','piUserList','piProfile']) assert.equal(b.api.settings[key],true);
});

test('PlatformIndicators adds badges to profile voice-channel user rows',()=>{
    const b=boot({platformIndicators:true}),{React}=reactHarness(b);
    b.load({default:{getClientStatus:()=>({desktop:'online'}),addChangeListener(){},removeChangeListener(){}}},null,4877);
    function Row(props){return React.createElement('TableRow',{user:props.user,label:React.createElement('Name',{children:props.user.id})});}
    const list=React.createElement('List',{data:[{id:'u'}],renderItem:({item})=>React.createElement(Row,{user:item})});
    const exports=b.load({default:()=>React.createElement('Sheet',{children:list})},null,12602);
    const renderItem=exports.default({}).props.children.props.renderItem;
    const row=renderItem({item:{id:'u'}});const tree=row.type(row.props);
    assert.equal(tree.props.label.props.children[1].props.userId,'u');
    b.api.setSetting('piUserList',false);assert.equal(row.type(row.props).props.label.props.children,'u');
});
test('PlatformIndicators places DM list icons beside the mute icon and DM header icons inside ChannelTitle',()=>{
    const b=boot({platformIndicators:true}),{React,RN}=reactHarness(b);b.load({default:{getClientStatus:()=>({desktop:'online'})}},null,4877);
    const channel={id:'dm',type:1,recipients:['friend']};
    const icon=React.createElement('ChannelIcon',{muted:false,favorite:false,ignored:false,blocked:false,selected:false});
    const row=Object.freeze(React.createElement(RN.View,{children:[React.createElement(RN.View,{children:icon}),React.createElement(RN.Text,{children:'23h'})]}));
    const content=b.load({default:()=>row},null,15667).default;const tree=content({channel});
    const icons=tree.props.children[0].props.children;assert.equal(icons[0],icon);assert.equal(walkElements(icons[1],n=>n.type&&n.type.name==='PlatformBadges')[0].props.userId,'friend');
    function ChannelTitle(){return React.createElement(RN.View,{children:React.createElement(RN.Text,{variant:'redesign/heading-18/semibold',children:'User'})});}
    const header=b.load({default:()=>React.createElement(RN.View,{children:React.createElement(ChannelTitle,{title:'User',accessibleTitle:'User',userId:'friend'})})},null,12845).default;
    const title=header({channelId:'dm'}).props.children;assert.notEqual(title.type,ChannelTitle);
    const inner=title.type(title.props);assert.equal(walkElements(inner,n=>n.type&&n.type.name==='PlatformBadges')[0].props.userId,'friend');
});
test('NoDelete retained records differ from the live record so the native row re-renders immediately',()=>{
    const b=deletionHarness();b.api.setSetting('noDelete',true);const live={id:'1',content:'x'};b.messages.set('c:1',live);
    b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});
    const kept=b.load({default:{getMessage:()=>live}},null,5057).default.getMessage('c','1');
    assert.notEqual(kept,live);assert.equal(kept.content,'x');assert.equal(kept.venusDeleted,true);assert.notDeepEqual(Object.keys(kept),Object.keys(live));
});

// Every call here represents a re-render of the SAME React fiber. The old static
// element mocks never checked the sequence and missed both reported crashes.
function hookSequenceProbe(React, component) {
    let sequence=[];
    React.useState=initial=>{sequence.push('state');return [initial,()=>{}];};
    React.useEffect=()=>{sequence.push('effect');};
    return props=>{sequence=[];const tree=component(props);return {tree,sequence:Array.from(sequence)};};
}
test('PlatformIndicators DM header hook order survives title, fallback, null and setting transitions',()=>{
    const b=boot({platformIndicators:true}),{React,RN}=reactHarness(b);
    let mode='fallback',calls=0;
    function ChannelTitle(){React.useState(0);return React.createElement(RN.View,{children:React.createElement(RN.Text,{children:'Name'})});}
    const native=()=>{calls++;React.useState(0);React.useEffect(()=>{},[]);
        if(mode==='empty')return null;
        return React.createElement(RN.View,{children:mode==='title'?React.createElement(ChannelTitle,{title:'Name',accessibleTitle:'Name',userId:'friend'}):React.createElement(RN.Text,{children:'Name'})});};
    const header=b.load({default:{$$typeof:Symbol.for('react.memo'),type:native}},null,12845).default.type;
    const render=hookSequenceProbe(React,header),expected=['state','effect','state','effect'];
    for(const next of ['fallback','title','fallback','empty','title']){mode=next;assert.deepEqual(render({userId:'friend'}).sequence,expected,next);}
    for(const key of ['piDmHeader','platformIndicators']){b.api.setSetting(key,false);assert.deepEqual(render({userId:'friend'}).sequence,expected);b.api.setSetting(key,true);assert.deepEqual(render({userId:'friend'}).sequence,expected);}
    assert.equal(calls,9,'Each native component must render exactly once');
});
test('PlatformIndicators DM row hook order survives loading, icon, fallback, group and setting transitions',()=>{
    const b=boot({platformIndicators:true}),{React,RN}=reactHarness(b);let mode='fallback';
    const native=()=>{React.useState(0);React.useEffect(()=>{},[]);if(mode==='empty')return null;
        const child=mode==='icon'?React.createElement('ChannelIcon',{muted:false,selected:false,blocked:false}):React.createElement(RN.Text,{children:'Name'});
        return React.createElement(RN.View,{children:child});};
    const row=b.load({default:native},null,15667).default,render=hookSequenceProbe(React,row),expected=['state','effect','state','effect'];
    const dm={type:1,recipients:['friend']};
    for(const next of ['fallback','icon','empty','fallback','icon']){mode=next;assert.deepEqual(render({channel:dm}).sequence,expected,next);}
    for(const channel of [null,{type:3,recipients:['a','b']},{type:0,recipients:[]},dm])assert.deepEqual(render({channel}).sequence,expected);
    for(const key of ['piUserList','platformIndicators']){b.api.setSetting(key,false);assert.deepEqual(render({channel:dm}).sequence,expected);b.api.setSetting(key,true);assert.deepEqual(render({channel:dm}).sequence,expected);}
});
test('ReviewDB user-menu sheet retries unavailable exports after an earlier UI lookup',()=>{
    const b=reviewHarness(),sheetModule=b.native[4801];delete b.native[4801];
    b.api.setSetting('reviewDB',true);b.Settings();
    b.menu.ContextMenuPopout({menu:{key:'444444444444444444',items:[1,2,3]}});b.menuCalls.at(-1).menu.items.at(-1).action();
    assert.equal(b.sheets.length,0);assert.match(b.toasts.at(-1).content,/unavailable/);
    b.native[4801]=sheetModule;
    b.menu.ContextMenuPopout({menu:{key:'444444444444444444',items:[1,2,3]}});b.menuCalls.at(-1).menu.items.at(-1).action();
    assert.equal(b.sheetEvents.length,1);assert.equal(b.sheetEvents[0].content.props.userId,'444444444444444444');
});
test('ReviewDB user-menu sheet reports opening failures and ignores stale disabled presses',()=>{
    const b=reviewHarness();b.native[4801].showActionSheet=()=>{throw new Error('native opener failed');};
    b.api.setSetting('reviewDB',true);b.menu.ContextMenuPopout({menu:{key:'444444444444444444',items:[1,2,3]}});const press=b.menuCalls.at(-1).menu.items.at(-1).action;
    press();assert.match(b.toasts.at(-1).content,/native opener failed/);
    b.api.setSetting('reviewDB',false);const count=b.toasts.length;press();assert.equal(b.toasts.length,count);assert.equal(b.sheets.length,0);
});

// Optional real React reconciliation, not just the lightweight element harness.
// VENUS_REACT_PATH points to node_modules containing react + react-test-renderer.
test('PlatformIndicators reconciles repeated DM transitions with real React without hook errors',
    {skip:!process.env.VENUS_REACT_PATH},async()=>{
        const path=require('node:path'),directory=path.resolve(process.env.VENUS_REACT_PATH);
        const React=require(path.join(directory,'react')),Renderer=require(path.join(directory,'react-test-renderer'));
        const previous=global.IS_REACT_ACT_ENVIRONMENT;global.IS_REACT_ACT_ENVIRONMENT=true;
        try {
            for(const id of [12845,15667])for(const memoized of [false,true]){
                const b=boot({platformIndicators:true});b.load(React,null,19);
                b.load({View:'View',Text:'Text',Image:'Image',Modal:'Modal'},null,17);
                b.load({default:{getClientStatus:()=>({desktop:'online'})}},null,4877);
                function ChannelTitle(){React.useState(0);return React.createElement('View',null,React.createElement('Text',null,'Name'));}
                function Native(props){
                    React.useState(0);React.useEffect(()=>{},[]);
                    if(props.mode==='empty')return null;
                    let child=React.createElement('Text',null,'Name');
                    if(props.mode==='title')child=React.createElement(ChannelTitle,{title:'Name',accessibleTitle:'Name',userId:'friend'});
                    if(props.mode==='icon')child=React.createElement('ChannelIcon',{muted:false,selected:false,blocked:false});
                    return React.createElement('View',null,child);
                }
                const Component=b.load({default:memoized?React.memo(Native):Native},null,id).default;
                let root;
                const element=mode=>React.createElement(Component,{mode,userId:'friend',channel:{type:1,recipients:['friend']}});
                try {
                    await Renderer.act(()=>{root=Renderer.create(element('fallback'));});
                    for(const mode of ['title','fallback','icon','fallback','empty','title','icon','fallback'])
                        await Renderer.act(()=>{root.update(element(mode));});
                    for(const key of [id===12845?'piDmHeader':'piUserList','platformIndicators']){
                        await Renderer.act(()=>{b.api.setSetting(key,false);root.update(element('fallback'));});
                        await Renderer.act(()=>{b.api.setSetting(key,true);root.update(element('fallback'));});
                    }
                    assert.ok(root.toJSON());
                } finally {if(root)await Renderer.act(()=>root.unmount());}
            }
        } finally {if(previous===undefined)delete global.IS_REACT_ACT_ENVIRONMENT;else global.IS_REACT_ACT_ENVIRONMENT=previous;}
    });

test('ReviewDB late theme availability never adds hooks to an already-mounted review input',()=>{
    const b=reviewHarness();delete b.native[4551];b.api.setSetting('reviewDB',true);
    const m=mountReviews(b,'444444444444444444');
    const input=walkElements(m.render(),n=>n.type&&n.type.name==='ReviewInput')[0];
    const render=hookSequenceProbe(b.React,input.type);
    assert.deepEqual(render(input.props).sequence,['state','state']);
    const theme=()=>{b.React.useState(0);return {primaryColor:'#123456'};};
    assert.deepEqual(render({...input.props,ui:{...input.props.ui,theme}}).sequence,['state','state']);
});

test('ReviewDB server button works without any overlay helper and ignores stale disabled presses',()=>{
    const b=reviewHarness();delete b.native[4801];delete b.native[6624];delete b.native[4694];
    b.api.setSetting('reviewDB',true);const element=b.guild({guild:{id:'444444444444444444'}}),m=mountReviewElement(b,element);
    const press=walkElements(m.render(),n=>n.props.label==='Reviews')[0].props.onPress;
    press();assert.equal(walkElements(m.render(),n=>n.type&&n.type.name==='ReviewSection').length,1);
    b.api.setSetting('reviewDB',false);press();assert.equal(m.render(),null);assert.equal(b.sheets.length,0);
});
test('ReviewDB input tolerates the native missing ThemeContext.Provider error without changing hook calls',()=>{
    const b=reviewHarness();b.native[4551].useThemeContext=()=>{b.React.useState(0);throw Error('useThemeContext must be used within a ThemeContext.Provider');};
    b.api.setSetting('reviewDB',true);const m=mountReviews(b,'444444444444444444');
    const input=walkElements(m.render(),n=>n.type&&n.type.name==='ReviewInput')[0],render=hookSequenceProbe(b.React,input.type);
    assert.deepEqual(render(input.props).sequence,['state','state','state']);assert.deepEqual(render(input.props).sequence,['state','state','state']);
});
test('ReviewDB server fetch errors are visible and retry can recover to an empty result',async()=>{
    const b=reviewHarness();b.api.setSetting('reviewDB',true);
    const element=b.note({userId:'444444444444444444'}).props.children[1];element.props.standalone=true;
    const m=mountReviewElement(b,element);b.context.fetch=async()=>({ok:false,status:503,json:async()=>({message:'Service unavailable'})});
    m.render();m.effects.splice(0).forEach(fn=>fn());await flush();await flush();
    let tree=m.render();assert.match(JSON.stringify(tree),/Service unavailable/);
    let retry=walkElements(tree,n=>n.props.accessibilityLabel==='Retry reviews')[0];assert.ok(retry);
    // With Discord's Button (5282) loaded, Retry is a real small secondary button, not bare text.
    function Button(props){return {type:Button,props};}
    b.native[5282]={Button};tree=m.render();retry=walkElements(tree,n=>n.props.accessibilityLabel==='Retry reviews')[0];
    assert.equal(retry.type,Button);assert.equal(retry.props.variant,'secondary');assert.equal(retry.props.text,'Retry');
    b.context.fetch=async()=>({ok:true,json:async()=>({reviews:[]})});retry.props.onPress();m.render();m.effects.splice(0).forEach(fn=>fn());await flush();await flush();
    assert.match(JSON.stringify(m.render()),/No reviews yet/);
});

test('ReviewDB real React server press expands, loads, retries, collapses and resets on guild changes',
    {skip:!process.env.VENUS_REACT_PATH},async()=>{
        const path=require('node:path'),directory=path.resolve(process.env.VENUS_REACT_PATH);
        const React=require(path.join(directory,'react')),Renderer=require(path.join(directory,'react-test-renderer'));
        const previous=global.IS_REACT_ACT_ENVIRONMENT;global.IS_REACT_ACT_ENVIRONMENT=true;
        const b=reviewHarness(),ThemeContext=React.createContext(null);b.load(React,null,19);
        // fn31267's actual contract, omitted by the old successful theme mock.
        b.native[4551].useThemeContext=()=>{const theme=React.useContext(ThemeContext);
            if(theme==null)throw Error('useThemeContext must be used within a ThemeContext.Provider');return theme;};
        b.native[5918].Card=()=>{throw Error('Server reviews must not render a profile-only Card');};
        b.native[5916].TableRow=props=>React.createElement('ServerReviewButton',props,props.label);
        b.native[8057].FormRow=props=>React.createElement('FormRow',{onLongPress:props.onLongPress},props.label,props.subLabel,props.leading);
        delete b.native[4801];delete b.native[6624];delete b.native[4694];
        b.api.setSetting('reviewDB',true);
        let fail=false;const requests=[],pending=[];
        b.context.fetch=url=>{requests.push(url);
            if(url.endsWith('/admins'))return Promise.resolve({ok:true,json:async()=>[]});
            return new Promise(resolve=>pending.push(()=>resolve({ok:!fail,status:fail?503:200,json:async()=>fail?{message:'Service unavailable'}:
                {reviews:[{id:1,comment:'Actual server content',sender:{discordID:'111111111111111111',username:'Reviewer',badges:[]}}]}})));
        };
        const Guild=b.load({default:()=>React.createElement('Progress')},null,13521).default;
        let root;const element=id=>React.createElement(Guild,{guild:{id}});
        const button=()=>root.root.findByType('ServerReviewButton');
        const text=()=>JSON.stringify(root.toJSON());
        const press=async()=>Renderer.act(async()=>{button().props.onPress();await flush();});
        const resolve=async()=>Renderer.act(async()=>{assert.equal(pending.length,1);pending.shift()();await flush();});
        try {
            await Renderer.act(()=>{root=Renderer.create(element('444444444444444444'));});
            assert.equal(requests.length,0);assert.equal(button().props.accessibilityState.expanded,false);
            await press();assert.equal(button().props.accessibilityState.expanded,true);assert.match(text(),/Loading reviews/);
            await resolve();assert.match(text(),/Actual server content/);assert.match(requests.at(-1),/users\/444444444444444444\/reviews$/);
            await press();assert.doesNotMatch(text(),/Actual server content/);
            await press();assert.match(text(),/Actual server content/);assert.equal(pending.length,0,'Reopening uses the valid cache');
            await Renderer.act(()=>{root.update(element('555555555555555555'));});
            assert.equal(button().props.accessibilityState.expanded,false);assert.doesNotMatch(text(),/Actual server content/);
            fail=true;await press();await resolve();assert.match(text(),/Service unavailable/);
            fail=false;await Renderer.act(()=>root.root.findByProps({accessibilityLabel:'Retry reviews'}).props.onPress());
            assert.match(text(),/Loading reviews/);await resolve();assert.match(text(),/Actual server content/);
            await Renderer.act(()=>b.api.setSetting('reviewDB',false));assert.equal(root.root.findAllByType('ServerReviewButton').length,0);
            assert.equal(b.sheets.length,0);assert.equal(b.pushed.length,0);
        } finally {
            if(root)await Renderer.act(()=>root.unmount());
            if(previous===undefined)delete global.IS_REACT_ACT_ENVIRONMENT;else global.IS_REACT_ACT_ENVIRONMENT=previous;
        }
    });
test('Discord-sized voice waveforms (up to 256 levels) are accepted and oversize ones fall back', async () => {
    for (const [levels, accepted] of [[1, true], [73, true], [255, true], [256, true], [257, false], [258, false]]) {
        const b = boot(); b.api.setSetting('voice', true);
        const waveform = Buffer.from(Array.from({length: levels}, (_, i) => (i * 37) & 255)).toString('base64');
        const result = {uri:'file:///cache/v.ogg', filename:'voice-message.ogg', mimeType:'audio/ogg', size:10, durationSecs:levels / 10, waveform};
        b.load(native({getSize:async request => JSON.parse(request.slice('venus-voice-v1:'.length)).action === 'prepare' ? JSON.stringify(result) : 'ok'}));
        class CloudUpload {
            constructor() { this.item = {uri:'content://audio', mimeType:'audio/mp4', filename:'a.m4a'}; this.calls = 0; }
            reactNativeCompressAndExtractData() { this.calls++; return Promise.resolve(this); }
        }
        b.load({CloudUpload}); const upload = new CloudUpload();
        await upload.reactNativeCompressAndExtractData();
        assert.equal(upload.waveform === waveform, accepted, `levels ${levels}`);
        assert.equal(upload.calls, accepted ? 0 : 1);
    }
});
test('voice audio detection tolerates MIME case/parameters and audio-only files mislabelled as video', async () => {
    const cases = [['AUDIO/OGG','x.ogg',true],['audio/mpeg; charset=binary','x.mp3',true],['video/mp4','note.m4a',true],
        ['video/3gpp','rec.3ga',true],['video/mp4','clip.mp4',false],['video/3gpp','clip.3gp',false],['image/png','x.png',false],
        ['application/x-wav','x.wav',true],['','x.opus',true],['application/octet-stream','x.txt',false]];
    for (const [mimeType, filename, expected] of cases) {
        const b = boot(); b.api.setSetting('voice', true); let prepared = false;
        b.load(native({getSize:async request => { if (JSON.parse(request.slice('venus-voice-v1:'.length)).action === 'prepare') prepared = true; return 'not json'; }}));
        class CloudUpload { constructor() { this.item = {uri:'content://a', mimeType, filename}; this.mimeType = mimeType; this.filename = filename; }
            reactNativeCompressAndExtractData() { return Promise.resolve(this); } }
        b.load({CloudUpload}); await new CloudUpload().reactNativeCompressAndExtractData();
        assert.equal(prepared, expected, `${mimeType} ${filename}`);
    }
});
test('Pastelize color cache returns identical colors and follows a replaced hash helper',()=>{
    const b=boot(allFeatures),{RN}=reactHarness(b);let processed=0;RN.processColor=hex=>{processed++;return hex;};
    b.load(seed=>seed.length*23,null,1252);
    b.load({default:{getMember:()=>({})}},null,2111);
    class Rows{generate(row){return row.result;}}b.load({default:Rows},null,7378);const rows=new Rows();
    const row={rowType:1,message:{},result:{message:{authorId:'author',guildId:'g',username:'Name',roleColor:null,content:[]}}};
    const first=rows.generate(row).message.roleColor;const count=processed;
    for (let i=0;i<20;i++) assert.equal(rows.generate(row).message.roleColor,first);
    assert.equal(processed,count,'repeat renders reuse the cached color');
    b.load(seed=>seed.length*97,null,1252);
    assert.notEqual(rows.generate(row).message.roleColor,first,'a new hash helper is not served stale colors');
    b.api.setSetting('pastelize',false);assert.equal(rows.generate(row),row.result);
});
test('NoDelete outline colors are computed once and still follow a replaced processColor',()=>{
    const b=deletionHarness(),{RN}=reactHarness(b);let calls=0;RN.processColor=color=>{calls++;return color;};
    class Rows{generate(row){return row.result;}}b.load({default:Rows},null,7378);const rows=new Rows();
    b.api.setSetting('pastelize',false);b.api.setSetting('noDelete',true);
    b.messages.set('c:1',{id:'1',content:'original',state:'SENT'});
    b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});
    const row={rowType:1,message:{id:'1',channel_id:'c'},result:{message:{id:'1',channelId:'c'}}};
    const first=rows.generate(row).backgroundHighlight;assert.equal(first.backgroundColor,'#f23f431a');assert.equal(first.gutterColor,'#f23f43');
    const count=calls;rows.generate(row);rows.generate(row);assert.equal(calls,count);
    RN.processColor=color=>'p'+color;assert.equal(rows.generate(row).backgroundHighlight.gutterColor,'p#f23f43');
});
test('enabled() feature lookup stays correct for every setting',()=>{
    const b=boot({freeNitro:true,pastelize:true,quickDelete:true,noDelete:true,platformIndicators:true,reviewDB:true});
    for (const key of ['emojis','stickers','hyperlinks','pastelAll','pastelContent','noDeleteSave','piDmHeader','reviewWarning'])
        assert.equal(b.api.setSetting(key,!b.api.settings[key]),true,key);
    for (const key of ['picker','voice','dashless','hiddenChannels','forceLinks','quickDeleteEmbeds','pastelWebhookName','reviewThemedSend']) assert.equal(b.api.setSetting(key,true),false,key);
});

// ---- 1.3.5 regressions ----
test('file sizes never show "1024 KB" just below a unit boundary',()=>{
    const {api}=boot();
    assert.equal(api.formatSize(1048575),'1 MB');assert.equal(api.formatSize(1048576),'1 MB');
    assert.equal(api.formatSize(1073741823),'1 GB');assert.equal(api.formatSize(1000),'1000 B');
    assert.equal(api.formatSize(5*1048576+524288),'5.5 MB');
});
test('a sub-option change wakes components subscribed to its plugin',()=>{
    const b=boot(allFeatures);let renders=0;
    const React={createElement(type,props,...children){return {type,props:{...props,children}};},cloneElement(n,p){return {...n,props:{...n.props,...p}};},
        useState:v=>[v,()=>{renders++;}],useEffect(fn){fn();}};
    b.load(React,null,19);b.load({View:'View',Text:'Text',Modal:'Modal'},null,17);
    function SettingsList(){} b.load({SettingsList},null,14236);
    const registry=b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route'}}},null,14130).SETTING_RENDERER_CONFIG;
    // The Settings row's switch subscribes to "platformIndicators"; its options must wake it too.
    b.context.__r=()=>null;
    const trailing=registry.VENUS_PLATFORMINDICATORS_ROW.useTrailing();trailing.type(trailing.props);
    b.api.setSetting('piProfile',false);assert.ok(renders>0,'PlatformIndicators did not re-render for piProfile');
    const before=renders;b.api.setSetting('copyBios',false);assert.equal(renders,before,'unrelated plugin woke PlatformIndicators');
});
function settingsRows(b) {
    const node=b.registry.VENUS_PLUGINS.screen.getComponent()().props.node;
    return JSON.parse(JSON.stringify(node.sections.map(section=>[section.label,section.settings.map(id=>b.registry[id].useTitle())])));
}
test('Features list is grouped, plugin names are gone and every row says what it does',()=>{
    const b=settingsHarness();
    assert.equal(b.registry.VENUS_PLUGINS.useTitle(),'Features');assert.equal(b.registry.VENUS_GENERAL.useTitle(),'About');
    const rows=settingsRows(b);
    assert.deepEqual(rows.map(([label])=>label),['Messages','Sending','People','Servers','Appearance','Quests']);
    const titles=rows.flatMap(([,list])=>list);
    assert.equal(titles.length,31);assert.equal(new Set(titles).size,31);
    assert.ok(titles.includes('Double-tap to reply'));assert.ok(titles.includes('Send Nitro stickers and emojis as links'));assert.ok(titles.includes('Unlock app icons'));
    assert.ok(titles.includes('Custom themes'));assert.ok(titles.includes('Message highlights'));
    for (const old of ['CopyBios','Dashless','FavouriteAnything','FreeNitro','Hidden Channels','JumpToTop','No typing','NoDelete','Pastelize',
        'PlatformIndicators','QuickDelete','Read All','Quest Completer','ReviewDB','Custom voice messages','File size on picker'])
        assert.ok(!titles.some(title=>title.includes(old)),'plugin name '+old+' still shown');
    assert.ok(titles.includes('Send audio as voice messages'));
    // Every row says what it does in one or two short sentences, and has its own icon.
    const ids=b.registry.VENUS_PLUGINS.screen.getComponent()().props.node.sections.flatMap(s=>s.settings);
    for (const id of ids) {
        const row=b.registry[id], text=row.useDescription && row.useDescription();
        assert.ok(text && text.length<=130,'missing or long description: '+id);assert.equal(typeof row.IconComponent,'function',id);
    }
    assert.equal(new Set(ids.map(id=>b.registry[id].IconComponent)).size,31,'each feature has its own icon');
    for (const [,list] of rows) for (const title of list) assert.ok(title.length<=40,'too long for one row: '+title);
    assert.match(b.registry.VENUS_VERSION.useTitle(),/^Venus Patches \d/);
});
test('row icons are Discord\'s own, loaded when drawn, with a fallback',()=>{
    const b=settingsHarness();function TrashIcon(props){return {icon:'trash',props};}
    const Icon=b.registry.VENUS_NODELETE_ROW.IconComponent;
    b.context.__r=()=>null;assert.equal(Icon({size:'md'}).type,b.original.ACCOUNT.IconComponent,'missing module: the Account icon');
    b.context.__r=id=>id===4791?{TrashIcon}:null;assert.equal(Icon({size:'md'}).type,TrashIcon);
    assert.equal(b.registry.VENUS_NODELETE.IconComponent,Icon,'its page uses the same icon');
});
test('About shows the version, features on, status and links',()=>{
    const b=settingsHarness();const opened=[];
    // About is a designed page: the version up top, features on with a bar and a chip per group, a status line, and links.
    function Text(){} function TableRow(){}
    b.context.__r=id=>({4833:{Text},5916:{TableRow}}[id]||null);
    const about=()=>pageNodes(b.registry.VENUS_GENERAL.screen.getComponent()());
    const texts=()=>about().filter(n=>n.type===Text).map(n=>n.props.children);
    assert.ok(texts().some(t=>/^Venus Patches \d/.test(t)),'version in the header');
    assert.ok(texts().includes('For Discord 348.10'));
    assert.ok(about().some(n=>n.type&&n.type.name==='VenusProgress'&&n.props.value>=0&&n.props.value<=1),'a bar for features on');
    assert.ok(about().some(n=>n.props&&/^Messages: \d+\/\d+$/.test(n.props.accessibilityLabel||'')),'a chip per group');
    assert.deepEqual(about().filter(n=>n.type===TableRow).map(n=>n.props.label),["What's new",'Report a problem','Source code']);
    // The native rows stay, so Discord's settings search still finds them.
    for (const id of ['VENUS_VERSION','VENUS_STATUS','VENUS_LINK_CHANGES','VENUS_LINK_ISSUES','VENUS_LINK_SOURCE']) assert.equal(b.registry[id].parent,'VENUS_GENERAL');
    assert.match(b.registry.VENUS_VERSION.useDescription(),/^\d+ of 31 features on/);
    b.api.setSetting('dashless',false);const before=Number(b.registry.VENUS_VERSION.useDescription().split(' ')[0]);
    b.api.setSetting('dashless',true);assert.equal(Number(b.registry.VENUS_VERSION.useDescription().split(' ')[0]),before+1);
    assert.equal(b.registry.VENUS_STATUS.useTitle(),'Status');
    b.load({View:'View',Text:'Text',Modal:'Modal',Linking:{openURL:url=>{opened.push(url);return Promise.resolve();}}},null,17);
    b.registry.VENUS_LINK_ISSUES.onPress();assert.equal(opened[0],'https://github.com/VenusIsJaded/Venus-Patches/issues/new/choose');
    assert.equal(b.registry.VENUS_LINK_SOURCE.withArrow,true);
});
test('settings with more options have a switch and a separate button to their page',()=>{
    const b=settingsHarness();
    function FormSwitch(){} function ChevronSmallRightIcon(){}
    const navigated=[];const navigation={navigate:route=>navigated.push(route)};
    b.context.__r=id=>({6622:{FormSwitch},6631:{ChevronSmallRightIcon},1491:{useStackNavigation:()=>navigation},
        14239:{onRouteSettingOnPress:({navigation:nav,screen})=>nav.navigate(screen.route)}}[id]||null);
    const pages={VENUS_PASTELIZE:'pastelize',VENUS_FREENITRO:'freeNitro',VENUS_PLATFORMINDICATORS:'platformIndicators',VENUS_TRANSLATE:'translate',
        VENUS_NODELETE:'noDelete',VENUS_READALL:'readAll',VENUS_REVIEWDB:'reviewDB',VENUS_QUESTS:'quests',VENUS_GESTURES:'gestures',VENUS_USERNOTIF:'userNotif',VENUS_ACCOUNTSWITCHER:'accountSwitcher',VENUS_HIDDENCHANNELS:'hiddenChannels'};
    for (const [page,key] of Object.entries(pages)) {
        const row=b.registry[page+'_ROW'];
        assert.equal(row.type,'pressable');assert.equal(row.parent,'VENUS_PLUGINS');assert.equal(row.unsearchable,true);
        assert.equal(b.registry[page].type,'route');assert.equal(b.registry[page].parent,'VENUS_PLUGINS');
        const trailing=row.useTrailing();assert.equal(trailing.props.setting,key);
        const tree=trailing.type(trailing.props);
        const nodes=walkElements(tree,()=>true);
        const sw=nodes.find(n=>n.type===FormSwitch);assert.ok(sw,'no switch on '+page);assert.equal(sw.props.value,!!b.api.settings[key]);
        sw.props.onValueChange(!b.api.settings[key]);assert.equal(sw.props.value,!b.api.settings[key]);
        const button=nodes.find(n=>n.props&&n.props.accessibilityLabel==='More options');assert.ok(button);
        assert.ok(nodes.some(n=>n.type===ChevronSmallRightIcon));
        button.props.onPress();assert.equal(navigated.at(-1),page);
        row.onPress();assert.equal(navigated.at(-1),page);
    }
    assert.equal(b.registry.VENUS_PASTELALL.parent,'VENUS_PASTELIZE');assert.equal(b.registry.VENUS_EMOJIS.parent,'VENUS_FREENITRO');
    // Pastel names draws its own page (switches + a preview); the option nodes still exist for search.
    function TableSwitchRow(){}
    const prev=b.context.__r;b.context.__r=id=>id===6621?{TableSwitchRow}:prev(id);
    const pastel=pageNodes(b.registry.VENUS_PASTELIZE.screen.getComponent()());
    assert.deepEqual(pastel.filter(n=>n.type===TableSwitchRow).map(n=>n.props.key),['pastelAll','pastelContent']);
    assert.ok(pastel.some(n=>n.type&&n.type.name==='PastelPreview'));
    pastel.find(n=>n.type===TableSwitchRow&&n.props.key==='pastelAll').props.onValueChange(false);assert.equal(b.api.settings.pastelAll,false);
    assert.equal(b.registry.VENUS_PASTELCONTENT.parent,'VENUS_PASTELIZE');
});
test('emoji and sticker links have one main switch on the Settings list',()=>{
    const b=nitroHarness();
    const content='<:x:2>';
    b.actions.sendMessage('channel',{content});assert.notEqual(b.sent.at(-1)[1].content,content);
    b.api.setSetting('freeNitro',false);
    b.actions.sendMessage('channel',{content});assert.equal(b.sent.at(-1)[1].content,content);
    assert.equal(b.premium.canUseEmojisEverywhere(b.user),false);
    b.api.setSetting('freeNitro',true);assert.equal(b.premium.canUseEmojisEverywhere(b.user),true);
});
test('Force system font is saved, and offers to reopen Discord only when the font would change',async()=>{
    const b=boot({systemFont:true});const writes=[],sizes=[],alerts=[];
    b.load({View:'View',Text:'Text',Modal:'Modal',Alert:{alert:(...args)=>alerts.push(args)}},null,17);
    b.context.setTimeout=(fn)=>{fn();return 0;};
    b.load(native({writeFile:async(...args)=>writes.push(args),fileExists:async uri=>{if(uri.startsWith('venus-font-v1:'))sizes.push(uri);return false;},getSize:async uri=>{sizes.push(uri);return 0;}}));
    await flush();await flush();
    assert.equal(b.api.settings.systemFont,false);
    b.api.setSetting('systemFont',true);await flush();await flush();
    assert.equal(alerts.length,1);assert.match(alerts[0][1],/reopen/);
    assert.equal(JSON.parse(writes.at(-1)[2]).systemFont,true);
    assert.equal(alerts[0][2].map(button=>button.text).join('|'),'Later|Reopen now');
    alerts[0][2][1].onPress();await flush();await flush();await flush();
    assert.equal(JSON.parse(writes.at(-1)[2]).systemFont,true);assert.equal(sizes.at(-1),'venus-font-v1:restart');
    // Switching back before reopening matches the font in use, so there's nothing to ask.
    b.api.setSetting('systemFont',false);await flush();assert.equal(alerts.length,1);
    const off=boot({});assert.equal(off.api.setSetting('systemFont',true),false);
});
test('options are greyed out while their main switch is off',()=>{
    const b=settingsHarness();
    assert.equal(b.registry.VENUS_PASTELALL.useIsDisabled(),false);
    b.api.setSetting('pastelize',false);assert.equal(b.registry.VENUS_PASTELALL.useIsDisabled(),true);
    b.api.setSetting('freeNitro',false);assert.equal(b.registry.VENUS_EMOJIS.useIsDisabled(),true);
});
test('unselected settings hide their rows and empty groups',()=>{
    const b=settingsHarness({copyBios:true});
    assert.deepEqual(settingsRows(b),[['People',['Copy profile bios']]]);
    assert.equal(b.registry.VENUS_SYSTEMFONT,undefined);assert.equal(b.registry.VENUS_PASTELIZE_ROW,undefined);
});
test('NoDelete does not rewrite an already erased archive for every deletion',async()=>{
    const b=await archiveHarness(null);
    b.api.setSetting('noDeleteSave',false);await flush();await flush();
    const erased=b.writes.filter(([name])=>name==='venus-deleted-messages.json').length;
    assert.equal(b.api.status.archive,'erased');
    const flux={dispatch(){return 'ok';}};const dispatch=b.load({default:flux},null,585).default;
    for (let i=0;i<5;i++) dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:String(i)});
    await flush();await flush();
    assert.equal(b.writes.filter(([name])=>name==='venus-deleted-messages.json').length,erased);
});
test('logging out of Discord without a ReviewDB sign-in does not rewrite preferences',async()=>{
    const b=boot(allFeatures);let writes=0;
    b.load({default:native({writeFile:async()=>{writes++;}})});await flush();await flush();
    const dispatch=b.load({default:{dispatch(){return 'ok';}}},null,585).default;
    writes=0;dispatch.dispatch({type:'LOGOUT'});await flush();await flush();assert.equal(writes,0);
});
test('own deletions no longer schedule bookkeeping timers',()=>{
    assert.doesNotMatch(raw,/ownDeletes/);
});
function readAllHarness(state = {}) {
    const b=boot(allFeatures);const {React,RN}=reactHarness(b);
    const calls={guilds:[],acks:[],toasts:[]};
    const unread=new Set(state.unreadGuilds||['g1','g3']), mentions={g2:state.mentionG2||0};
    const native={
        5751:{default:{getFlattenedGuildIds:()=>['g1','g2','g3','g4']}},
        7054:{default:{hasUnread:id=>unread.has(id),getMentionCount:id=>mentions[id]||0}},
        13507:{default:(ids,source)=>calls.guilds.push([ids,source])},
        1086:{AnalyticsSections:{GUILD_LIST:'guild list'}},
        13299:{default:{getUnreadPrivateChannelIds:()=>state.dms||['d1','d2']}},
        4852:{default:{lastMessageId:id=>'m-'+id}},
        6532:{bulkAck:entries=>calls.acks.push(entries)},
        5019:{ReadStateTypes:{CHANNEL:0}},
        15919:{FastListRenderSections:{SEPARATOR:6,GUILDS:7}},
        4531:{default:{open:toast=>calls.toasts.push(toast.content)}},
    };
    b.context.__r=id=>native[id]||null;
    const data={itemSize:section=>section===6?18:48,renderItem:section=>({type:'Native',props:{section}}),sections:[1,0,0,0,0,2,1,4]};
    const result=Object.freeze({listProps:{},listDataProps:Object.freeze(data)});
    const hook=b.load({default:()=>result},null,15929);
    return {...b,React,RN,calls,data,result,props:()=>hook.default({})};
}
function findReadAll(node){
    if (!node||typeof node!=='object') return null;
    if (typeof node.type==='function'&&node.type.name==='ReadAllButton') return node;
    for (const kid of [].concat(node.props&&node.props.children||[])){const found=findReadAll(kid);if(found)return found;}
    return null;
}
function pressReadAll(b){const button=findReadAll(b.props().listDataProps.renderItem(6,0));button.type(button.props).props.children.props.onPress();}
test('Read All sits in the separator row and grows only that row, keeping stock indexes',()=>{
    const b=readAllHarness();const props=b.props();
    assert.notEqual(props,b.result);assert.equal(props.listProps,b.result.listProps);
    assert.equal(props.listDataProps.sections,b.data.sections,'section counts must stay stock');
    assert.equal(props.listDataProps.itemSize(6,0),18+36);assert.equal(props.listDataProps.itemSize(7,0),48);
    assert.equal(JSON.stringify(props.listDataProps.renderItem(7,0)),JSON.stringify({type:'Native',props:{section:7}}));
    const row=props.listDataProps.renderItem(6,0);assert.ok(findReadAll(row),'button missing from separator row');
    assert.equal(JSON.stringify(row.props.children[1]),JSON.stringify({type:'Native',props:{section:6}}),'native separator must still render below the button');
    assert.equal(b.props(),props,'list data must be cached per native props');
    b.api.setSetting('readAll',false);assert.equal(b.props(),b.result);
});
test('Read All marks only unread or mentioned servers through Discord\'s own markGuildsAsRead',()=>{
    const b=readAllHarness({mentionG2:2});pressReadAll(b);
    assert.equal(JSON.stringify(b.calls.guilds),JSON.stringify([[['g1','g2','g3'],'guild list']]));assert.equal(b.calls.acks.length,0);
    assert.equal(b.calls.toasts.at(-1),'Marked 3 servers as read');
});
test('Read All DMs and both modes use one native BULK_ACK at each channel\'s last message',()=>{
    const b=readAllHarness();
    assert.equal(b.api.setSetting('readAllMode','dms'),true);pressReadAll(b);
    assert.equal(b.calls.guilds.length,0);
    assert.equal(JSON.stringify(b.calls.acks),JSON.stringify([[{channelId:'d1',readStateType:0,messageId:'m-d1'},{channelId:'d2',readStateType:0,messageId:'m-d2'}]]));
    assert.equal(b.calls.toasts.at(-1),'Marked 2 DMs as read');
    b.api.setSetting('readAllMode','both');pressReadAll(b);
    assert.equal(b.calls.guilds.length,1);assert.equal(b.calls.acks.length,2);
    assert.equal(b.calls.toasts.at(-1),'Marked 2 servers and 2 DMs as read');
});
test('Read All only accepts its three modes and says when nothing is unread',()=>{
    const b=readAllHarness({unreadGuilds:[],dms:[]});
    assert.equal(b.api.setSetting('readAllMode','muted'),false);assert.equal(b.api.settings.readAllMode,'guilds');
    pressReadAll(b);assert.equal(b.calls.guilds.length,0);assert.equal(b.calls.toasts.at(-1),'Nothing unread');
});
test('Read All settings use Discord\'s native radio list with three choices',()=>{
    const b=settingsHarness();
    function TableRadioGroup(){} function TableRadioRow(){}
    b.context.__r=id=>({5995:{TableRadioGroup},5994:{TableRadioRow}}[id]||null);
    assert.equal(b.registry.VENUS_READALL.type,'route');assert.equal(b.registry.VENUS_READALL.parent,'VENUS_PLUGINS');
    const page=b.registry.VENUS_READALL.screen.getComponent()();
    const nodes=[];(function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n))return n.forEach(walk);nodes.push(n);walk(n.props&&n.props.children);})(page);
    const group=nodes.find(n=>n.type===TableRadioGroup);assert.ok(group);assert.equal(group.props.value,'guilds');
    assert.equal(nodes.filter(n=>n.type===TableRadioRow).map(n=>n.props.label).join('|'),'Servers|Direct messages|Servers and DMs');
    group.props.onChange('both');assert.equal(b.api.settings.readAllMode,'both');
});
test('option page switches are greyed out while their main switch is off',()=>{
    const b=settingsHarness();
    function TableSwitchRow(){} function TableRowGroup(){}
    b.context.__r=id=>({6621:{TableSwitchRow},5997:{TableRowGroup}}[id]||null);
    const rows=key=>{const found=[];(function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n))return n.forEach(walk);
        if(n.type===TableSwitchRow)found.push(n);walk(n.props&&n.props.children);})(b.registry[key].screen.getComponent()());return found;};
    const row=(key,setting)=>rows(key).find(n=>n.props.key===setting);
    b.api.setSetting('gestures',false);assert.equal(row('VENUS_GESTURES','gestureTripleDelete').props.disabled,true,'Message tap gestures is off');
    b.api.setSetting('gestures',true);assert.equal(row('VENUS_GESTURES','gestureTripleDelete').props.disabled,false);
    b.api.setSetting('noDelete',false);assert.deepEqual(rows('VENUS_NODELETE').map(n=>n.props.disabled),[true,true]);
    b.api.setSetting('noDelete',true);assert.deepEqual(rows('VENUS_NODELETE').map(n=>n.props.disabled),[false,false]);
    assert.match(row('VENUS_NODELETE','noDeleteEdits').props.subLabel,/before it was edited/);
    // How many to keep is a segmented choice now, greyed out with the switches.
    const tabs=()=>pageNodes(b.registry.VENUS_NODELETE.screen.getComponent()()).filter(n=>n.props&&n.props.accessibilityRole==='tab');
    assert.deepEqual(tabs().map(n=>n.props.accessibilityLabel),['100','512','1000','5000']);
    assert.equal(tabs().find(n=>n.props.accessibilityState.selected).props.accessibilityLabel,'512','default 512 is chosen');
    tabs().find(n=>n.props.accessibilityLabel==='1000').props.onPress();assert.equal(b.api.settings.noDeleteLimit,1000);
    // A number an older version saved shows as the closest choice and isn't changed until you pick another.
    b.api.setSetting('noDeleteLimit',90);assert.equal(tabs().find(n=>n.props.accessibilityState.selected).props.accessibilityLabel,'100');
    assert.equal(b.api.settings.noDeleteLimit,90);
    b.api.setSetting('noDelete',false);assert.ok(tabs().every(n=>n.props.disabled),'the choice is greyed out too');
});
test('Read All mode persists and an invalid saved mode falls back to Servers',async()=>{
    const b=boot(allFeatures);
    b.load({default:native({fileExists:async()=>true,readFile:async()=>JSON.stringify({readAllMode:'everything'})})});
    await flush();await flush();assert.equal(b.api.settings.readAllMode,'guilds');
    const c=boot(allFeatures);
    c.load({default:native({fileExists:async()=>true,readFile:async()=>JSON.stringify({readAllMode:'dms'})})});
    await flush();await flush();assert.equal(c.api.settings.readAllMode,'dms');
});
test('unselected Read All never wraps the server bar module',()=>{
    const b=boot({picker:true});const original=()=>'stock';
    assert.equal(b.load({default:original},null,15929).default,original);
});

test('PlatformIndicators badges re-render only when that user\'s own clients change', () => {
    const b = boot({platformIndicators:true}), {React, RN} = reactHarness(b);
    const effects = []; let renders = 0;
    React.useEffect = fn => effects.push(fn);
    React.useState = () => [0, () => { renders++; }];
    const listeners = new Set(); const status = {friend:{desktop:'online'}, other:{mobile:'idle'}};
    b.load({default:{getClientStatus:id => status[id], addChangeListener:fn => listeners.add(fn), removeChangeListener:fn => listeners.delete(fn)}}, null, 4877);
    b.load({default:{getCurrentUser:() => ({id:'me'})}}, null, 1378);
    // Render a profile name so PlatformBadges mounts through the real placement path.
    const name = React.createElement(RN.Text, {children:'Friend'});
    const row = b.load({default:() => React.createElement('Row', {label:name})}, null, 10371).default;
    const badge = walkElements(row({user:{id:'friend'}}), n => n.type && n.type.name === 'PlatformBadges')[0];
    effects.length = 0; badge.type(badge.props);
    const cleanup = effects.map(fn => fn()).filter(Boolean);
    assert.equal(listeners.size, 1);
    status.other = {mobile:'dnd'}; listeners.forEach(fn => fn());
    assert.equal(renders, 0, 'another user\'s presence must not re-render this badge');
    status.friend = {desktop:'idle'}; listeners.forEach(fn => fn());
    assert.equal(renders, 1);
    listeners.forEach(fn => fn());
    assert.equal(renders, 1, 'an unchanged presence must not re-render');
    cleanup.forEach(fn => fn()); assert.equal(listeners.size, 0);
});

// ---- 1.3.8 regressions ----
test('NoDelete switched off keeps the saved archive and switching it back on restores it',async()=>{
    const raw={id:'1',channel_id:'c',author:{id:'u'},content:'saved'};
    const saved=JSON.stringify({version:1,accountId:'owner',messages:[{id:'1',channelId:'c',message:raw}]});
    const b=await archiveHarness(saved);assert.equal(b.store.getMessage('c','1').content,'saved');
    b.api.setSetting('noDelete',false);await new Promise(r=>setTimeout(r,900));await flush();
    assert.equal(JSON.parse(b.getDisk()).messages.length,1,'turning NoDelete off must not erase saved messages');
    assert.equal(b.store.getMessage('c','1'),undefined);
    b.api.setSetting('noDelete',true);await flush();await flush();await flush();
    assert.equal(b.store.getMessage('c','1').content,'saved');
});
test('NoDelete removes kept messages with one bulk event per channel when switched off',()=>{
    const b=deletionHarness();b.api.setSetting('noDelete',true);
    for(const id of ['1','2','3']){b.messages.set('c:'+id,{});b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id});}
    b.messages.set('d:9',{});b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'d',id:'9'});
    const n=b.events.length;b.api.setSetting('noDelete',false);
    const removals=b.events.slice(n);assert.equal(removals.length,2);
    assert.deepEqual(Array.from(removals.find(e=>e.type==='MESSAGE_DELETE_BULK').ids),['1','2','3']);
    assert.equal(b.messages.size,0);
});
test('NoDelete builds archive copies only when saving',async()=>{
    const b=await archiveHarness(null);b.load({default:{getCurrentUser:()=>({id:'owner'})}},null,1378);
    const store=b.load({default:{getMessage:()=>({id:'5',content:'hi',author:{id:'x'}}),getMessages:()=>new MessageCollection(),emitChange(){}}},null,5057).default;
    const dispatch=b.load({default:{dispatch(){}}},null,585).default;
    dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'5'});await new Promise(r=>setTimeout(r,900));await flush();
    assert.equal(JSON.parse(b.getDisk()).messages[0].message.content,'hi');assert.ok(store);
});
test('NoDelete limit edits that change nothing do not rewrite settings',async()=>{
    const b=boot(allFeatures);const writes=[];b.load({default:native({writeFile:async(d,n,t)=>writes.push(n)})});await flush();await flush();
    b.api.setSetting('noDelete',true);await flush();await flush();const n=writes.length;
    b.api.setSetting('noDeleteLimit','512');await flush();await flush();assert.equal(writes.length,n);
});
test('Hidden Channels asks the real permission store once and keeps canBasicChannel separate',()=>{
    const b=boot(allFeatures);let can=0,basic=0;const VIEW={bit:1};
    b.load({Permissions:{VIEW_CHANNEL:VIEW}},null,1086);
    const store=b.load({default:{can:()=>{can++;return true;},canBasicChannel:()=>{basic++;return false;}}},null,4472).default;
    b.api.setSetting('hiddenChannels',true);
    assert.equal(store.can(VIEW,{id:'x',guild_id:'g',type:0}),true);assert.equal(can,1);
    assert.equal(store.canBasicChannel(VIEW,{id:'y',guild_id:'g',type:0}),true);assert.equal(basic,1);assert.equal(can,1);
    assert.equal(store.canBasicChannel(VIEW,{id:'y',guild_id:'g',type:0,realCheck:true}),false);
});
test('Hidden Channels ignores unrelated Flux events without account lookups',()=>{
    const b=boot(allFeatures);let lookups=0;b.load({default:{getCurrentUser:()=>{lookups++;return {id:'me'};}}},null,1378);
    const dispatch=b.load({default:{dispatch(){}}},null,585).default;b.api.setSetting('hiddenChannels',true);lookups=0;
    for(const type of ['TYPING_START','PRESENCE_UPDATES','VOICE_STATE_UPDATES'])dispatch.dispatch({type});
    dispatch.dispatch({type:'MESSAGE_CREATE',message:{content:'hi'}});assert.equal(lookups,0);
});
test('PlatformIndicators shares one store listener for many badges',()=>{
    const b=boot({platformIndicators:true}),{React,RN}=reactHarness(b);const effects=[];let renders=0;
    React.useEffect=fn=>effects.push(fn);React.useState=()=>[0,()=>{renders++;}];
    const listeners=new Set(),status={a:{desktop:'online'},b:{mobile:'idle'}};
    b.load({default:{getClientStatus:id=>status[id],addChangeListener:fn=>listeners.add(fn),removeChangeListener:fn=>listeners.delete(fn)}},null,4877);
    b.load({default:{getCurrentUser:()=>({id:'me'})}},null,1378);
    const row=b.load({default:()=>React.createElement('Row',{label:React.createElement(RN.Text,{children:'x'})})},null,10371).default;
    const badges=['a','b','a'].map(id=>walkElements(row({user:{id}}),n=>n.type&&n.type.name==='PlatformBadges')[0]);
    effects.length=0;badges.forEach(badge=>badge.type(badge.props));const cleanup=effects.map(fn=>fn());
    assert.equal(listeners.size,1);status.a={desktop:'dnd'};listeners.forEach(fn=>fn());assert.equal(renders,2);
    cleanup.forEach(fn=>fn());assert.equal(listeners.size,0);
});
test('PlatformIndicators voice-user list keeps a stable renderItem',()=>{
    const b=boot({platformIndicators:true}),{React}=reactHarness(b);
    const render=()=>null;const list=React.createElement('List',{renderItem:render});
    const exports=b.load({default:()=>React.createElement('View',{children:list})},null,12602);
    const one=exports.default({}).props.children.props.renderItem,two=exports.default({}).props.children.props.renderItem;
    assert.equal(one,two);
});
test('Read All skips DMs without a last message and acknowledges in batches of 100',()=>{
    const dms=Array.from({length:150},(_,i)=>'d'+i).concat(['empty']);
    const b=readAllHarness({dms});b.context.__r=(old=>id=>id===4852?{default:{lastMessageId:id=>id==='empty'?null:'m-'+id}}:old(id))(b.context.__r);
    b.api.setSetting('readAllMode','dms');pressReadAll(b);
    assert.deepEqual(b.calls.acks.map(a=>a.length),[100,50]);assert.equal(b.calls.acks.flat().some(a=>a.channelId==='empty'),false);
    assert.equal(b.calls.toasts.at(-1),'Marked 150 DMs as read');
});
test('ReviewDB views share one UserStore listener that wakes only on account changes',()=>{
    const b=boot(allFeatures),{React}=reactHarness(b);const listeners=new Set();let account={id:'111111111111111111'};
    b.load({default:{getCurrentUser:()=>account,addChangeListener:fn=>listeners.add(fn),removeChangeListener:fn=>listeners.delete(fn)}},null,1378);
    const effects=[];React.useEffect=fn=>effects.push(fn);let wakes=0;React.useState=()=>[0,()=>{wakes++;}];
    const note=b.load({default:()=>null},null,12627).default;b.api.setSetting('reviewDB',true);
    for(const id of ['222222222222222222','333333333333333333']){const s=note({userId:id}).props.children[1];try{s.type(s.props);}catch(_){}}
    const cleanup=effects.splice(0).map(fn=>fn()).filter(Boolean);
    assert.equal(listeners.size,1);wakes=0;listeners.forEach(fn=>fn());assert.equal(wakes,0,'unrelated user updates must not re-render reviews');
    account={id:'444444444444444444'};listeners.forEach(fn=>fn());assert.ok(wakes>0);
    cleanup.forEach(fn=>fn());assert.equal(listeners.size,0);
});

// ---- 1.4.0 (first published as 1.3.10) regressions ----
test('NoDelete lowering the maximum removes the oldest kept messages with one event per channel',()=>{
    const b=deletionHarness();b.api.setSetting('noDelete',true);
    for(const id of ['1','2','3','4']){b.messages.set('c:'+id,{content:'m'+id});b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id});}
    b.messages.set('d:9',{content:'other'});b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'d',id:'9'});
    const n=b.events.length;b.api.setSetting('noDeleteLimit','1');
    const removals=b.events.slice(n);assert.equal(removals.length,1,'one bulk removal, not one per message');
    assert.equal(removals[0].type,'MESSAGE_DELETE_BULK');assert.deepEqual(Array.from(removals[0].ids),['1','2','3','4']);
    assert.equal(b.messages.has('c:1'),false);assert.equal(b.messages.get('d:9').content,'other');
});

// ---- 1.4.1 Quest Completer (Play Quests since 1.4.2, sent as Discord for Windows since 1.4.3) ----
function questHarness({quests = [], settings = {}, fail = {}, fetched = true, apps = {}} = {}) {
    const b = boot({quests:true});
    let clock = 1_800_000_000_000;
    b.context.__clock = () => clock;
    vm.runInContext('Date.now=function(){return __clock();}', b.context);
    const timers = [];
    b.context.setTimeout = (fn, ms) => { const t = {fn, at:clock + (ms || 0)}; timers.push(t); return t; };
    b.context.clearTimeout = t => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };
    b.context.setInterval = () => 0; b.context.clearInterval = () => {};
    const subs = new Map(), events = [], requests = [], ui = [];
    const map = new Map(quests.map(q => [q.id, q]));
    const listeners = new Set();
    function apply(action) {
        const set = (id, status) => { const q = map.get(id); if (q) map.set(id, Object.assign({}, q, {userStatus:Object.assign({}, q.userStatus, status)})); };
        if (action.type === 'QUESTS_ENROLL_SUCCESS') set(action.enrolledQuestUserStatus.questId, action.enrolledQuestUserStatus);
        if (action.type === 'QUESTS_SEND_HEARTBEAT_SUCCESS') set(action.questId, action.userStatus);
        if (action.type === 'QUESTS_USER_STATUS_UPDATE') set(action.user_status.quest_id, {completedAt:action.user_status.completed_at});
        listeners.forEach(fn => fn());
    }
    const dispatcher = {
        subscribe(type, fn) { (subs.get(type) || subs.set(type, []).get(type)).push(fn); },
        unsubscribe() {}, dispatch(action) { events.push(action); apply(action); return Promise.resolve(); },
    };
    const store = {
        get quests() { return map; }, getQuest: id => map.get(id),
        get isFetchingCurrentQuests() { return false; },
        get lastFetchedCurrentQuests() { return fetched ? clock : null; },
        get questEnrollmentBlockedUntil() { return null; },
        get isQuestAccessSuspended() { return false; },
        addChangeListener: fn => listeners.add(fn), removeChangeListener: fn => listeners.delete(fn),
    };
    const progress = new Map();
    // Like 348.10's sendRequest: onRequestCreated gets the superagent request, then prepareRequest sets the phone's headers.
    function headersFor(request) {
        const headers = {};
        const agent = {set(name, value) {
            if (name && typeof name === 'object') { Object.assign(headers, name); return agent; }
            headers[name] = value; return agent;
        }};
        if (typeof request.onRequestCreated === 'function') request.onRequestCreated(agent);
        agent.set('User-Agent', 'Discord-Android/348010;RNA');
        agent.set('X-Super-Properties', 'cGhvbmU=');
        agent.set('Authorization', 'token');
        return headers;
    }
    const http = {get(request) {
        requests.push({url:request.url, method:'get', headers:headersFor(request), at:clock});
        const ids = request.url.split('application_ids=')[1];
        return Promise.resolve({body:ids && apps[ids] ? [apps[ids]] : []});
    }, post(request) {
        requests.push({url:request.url, body:request.body, headers:headersFor(request), at:clock});
        const id = request.url.split('/')[2], q = map.get(id), kind = request.url.split('/')[3];
        if (fail[kind]) {
            // Discord's HTTP client asks the request's own interceptor first, then its global handler.
            return new Promise((resolve, reject) => {
                const handled = request.interceptResponse && request.interceptResponse(fail[kind], () => {}, reject);
                if (!handled) { ui.push('global captcha screen'); reject(new Error('unhandled')); }
            });
        }
        if (kind === 'enroll') return Promise.resolve({body:{quest_id:id, enrolled_at:new Date(clock).toISOString()}});
        const tasks = q.config.taskConfigV2.tasks, type = Object.keys(tasks)[0], target = tasks[type].target;
        const value = kind === 'video-progress' ? Math.min(target, request.body.timestamp) : Math.min(target, (progress.get(id) || 0) + 60);
        progress.set(id, value);
        return Promise.resolve({body:{quest_id:id, completed_at:value >= target ? 'now' : null, progress:{[type]:{value}}}});
    }};
    let fetches = 0; const optimistic = [];
    const native = {1283:{HTTP:http, encodeProperties:value => Buffer.from(JSON.stringify(value)).toString('base64')},
        1348:{getSuperProperties:() => ({os:'Android', system_locale:'en-GB'})},
        7116:{getAdDecisionData:() => ({decision_id:null, is_targeted:false}), getAdMetadataSealed:() => null, getAdTrafficMetadataSealed:() => null},
        7127:{questUserStatusFromServer:body => ({questId:body.quest_id, enrolledAt:body.enrolled_at ? new Date(body.enrolled_at) : null,
            completedAt:body.completed_at || null, progress:body.progress || {}})},
        9765:{fetchCurrentQuests:() => { fetches++; return Promise.resolve(); },
            updateOptimisticProgress:(id, type, val) => { optimistic.push([id, type, val]); }},
        2051:{default:{getSortedPrivateChannels:() => [{id:'dm1'}]}},
        4531:{default:{open:value => ui.push('toast ' + value.content)}}, 5205:{default:{show:() => ui.push('alert')}},
        4694:{pushModal:() => ui.push('modal')}};
    b.context.__r = id => native[id] || null;
    b.load({default:dispatcher}, null, 585);
    b.load({default:store}, null, 7120);
    // Quest Completer is patched in but starts switched off; these tests switch it on like a user would.
    for (const [key, value] of Object.entries(Object.assign({quests:true}, settings))) b.api.setSetting(key, value);
    // Runs fake time forward up to `horizon` (default 20 minutes), firing timers in order.
    async function run(horizon = 20 * 60 * 1000) {
        const end = clock + horizon;
        for (let i = 0; i < 2000; i++) {
            await flush();
            if (!timers.length) { await flush(); if (!timers.length) break; }
            timers.sort((x, y) => x.at - y.at);
            if (timers[0].at > end) break;
            const t = timers.shift(); clock = Math.max(clock, t.at); t.fn();
        }
        await flush(); await flush();
    }
    function connect(id = 'me') { (subs.get('CONNECTION_OPEN') || []).forEach(fn => fn({type:'CONNECTION_OPEN', user:{id}})); }
    return {...b, map, requests, events, ui, subs, run, connect, timers, http, optimistic,
        get fetches() { return fetches; }, get clock() { return clock; }, advance(ms) { clock += ms; }};
}
const QUEST_T0 = 1_800_000_000_000;
function questFixture(id, type, target, extra = {}) {
    return Object.assign({id, config:{expiresAt:new Date(QUEST_T0 + 7 * 864e5).toISOString(), messages:{questName:'Quest ' + id},
        taskConfigV2:{tasks:{[type]:{type, target}}}}, userStatus:null}, extra);
}
const enrolledAgo = seconds => ({userStatus:{enrolledAt:new Date(QUEST_T0 - seconds * 1000), completedAt:null, progress:{}}});

test('Quest Completer accepts and completes a new video Quest in the background with no screen', async () => {
    const b = questHarness({quests:[questFixture('q1', 'WATCH_VIDEO_ON_MOBILE', 30)]});
    b.connect(); await b.run();
    const enroll = b.requests.find(r => r.url === '/quests/q1/enroll');
    assert.ok(enroll, 'accepted the quest');
    assert.deepEqual(JSON.parse(JSON.stringify(enroll.body)), {location:12, decision_id:null, is_targeted:false, metadata_sealed:null, traffic_metadata_sealed:null},
        'enroll body matches Discord _enrollInQuest (9765) with QuestDataUtils (7116) ad decision and sealed metadata');
    assert.ok(b.events.some(e => e.type === 'QUESTS_ENROLL_SUCCESS'), 'QuestStore learns it was accepted');
    const video = b.requests.filter(r => r.url === '/quests/q1/video-progress');
    assert.ok(video.length >= 4, 'reports progress in steps, not one jump');
    assert.equal(video.at(-1).body.timestamp, 30);
    assert.equal(b.optimistic.length, video.length, 'updates local optimistic video progress on each step like VideoQuestPlayer');
    assert.equal(b.optimistic.at(-1)[2], 30);
    assert.ok(b.map.get('q1').userStatus.completedAt, 'completed');
    assert.deepEqual(b.ui, [], 'no toast, alert, modal or captcha screen');
});
test('Quest Completer never reports video progress faster than real time allows', async () => {
    const b = questHarness({quests:[questFixture('q1', 'WATCH_VIDEO', 60, enrolledAgo(0))]});
    b.connect(); await b.run();
    const video = b.requests.filter(r => r.url === '/quests/q1/video-progress');
    for (const r of video) assert.ok(r.body.timestamp <= (r.at - QUEST_T0) / 1000 + 11, `timestamp ${r.body.timestamp} reported too early`);
    assert.equal(video.at(-1).body.timestamp, 60);
    assert.ok(b.map.get('q1').userStatus.completedAt);
});
function activityFixture(id, target, extra = {}, app = '1124225423214485597', features = []) {
    const q = questFixture(id, 'PLAY_ACTIVITY', target, extra);
    q.config.taskConfigV2.tasks.PLAY_ACTIVITY.applications = [{id:app}]; q.config.features = features;
    return q;
}
const desktopProperties = r => JSON.parse(Buffer.from(r.headers['X-Super-Properties'], 'base64').toString());
test('Quest Completer completes Activity Quests as the desktop app, like Discord does', async () => {
    const b = questHarness({quests:[activityFixture('a1', 180, enrolledAgo(5))]});
    b.connect(); await b.run();
    const beats = b.requests.filter(r => r.url === '/quests/a1/heartbeat');
    assert.equal(beats.length, 3);
    assert.ok(beats.every(r => r.body.application_id === '1124225423214485597' && r.body.terminal === false && !('stream_key' in r.body)));
    assert.ok(beats.every(r => r.headers['User-Agent'].includes('discord/1.0.9261') && desktopProperties(r).os === 'Windows'));
    assert.ok(b.events.some(e => e.type === 'QUESTS_SEND_HEARTBEAT_SUCCESS' && e.questId === 'a1'));
    assert.ok(b.map.get('a1').userStatus.completedAt);
});
test('Quest Completer reports mobile Activity Quests from the phone', async () => {
    const b = questHarness({quests:[activityFixture('m1', 120, enrolledAgo(5), '1124225423214485597', [36])]});
    b.connect(); await b.run();
    const beats = b.requests.filter(r => r.url === '/quests/m1/heartbeat');
    assert.ok(beats.length >= 2);
    assert.ok(beats.every(r => r.headers['User-Agent'] === 'Discord-Android/348010;RNA' && r.headers['X-Super-Properties'] === 'cGhvbmU='));
});
function playFixture(id, target, extra = {}, app = '1402418491272986635') {
    const q = questFixture(id, 'PLAY_ON_DESKTOP', target, extra);
    q.config.taskConfigV2.tasks.PLAY_ON_DESKTOP.applications = [{id:app}];
    return q;
}
test('Quest Completer accepts and completes Play Quests like the ones on the Quests page', async () => {
    const b = questHarness({quests:[playFixture('p1', 900)]});
    b.connect(); await b.run(30 * 60 * 1000);
    const enroll = b.requests.find(r => r.url === '/quests/p1/enroll');
    assert.ok(enroll, 'accepted the Play Quest'); assert.equal(enroll.body.location, 12);
    const beats = b.requests.filter(r => r.url === '/quests/p1/heartbeat');
    assert.equal(beats.length, 15, 'one beat a minute for 15 minutes, not one jump');
    assert.ok(beats.every(r => r.body.application_id === '1402418491272986635' && !('stream_key' in r.body)), 'heartbeat names the game');
    for (let i = 1; i < beats.length - 1; i++) assert.equal(beats[i].at - beats[i - 1].at, 60000, 'a minute apart, like desktop');
    assert.equal(beats.at(-1).at - beats.at(-2).at, 61000, 'the last minute waits what is left plus a second');
    assert.equal(beats.some(r => r.body.terminal), false, 'no terminal beat once Discord says it is done');
    assert.ok(b.map.get('p1').userStatus.completedAt, 'completed');
    assert.deepEqual(b.ui, [], 'no toast, alert, modal or captcha screen');
});
test('Quest Completer sends Play heartbeats as Discord for Windows and nothing else', async () => {
    const b = questHarness({quests:[playFixture('p1', 120, enrolledAgo(5)), questFixture('v1', 'WATCH_VIDEO', 30, enrolledAgo(100))]});
    b.connect(); await b.run();
    const beats = b.requests.filter(r => r.url === '/quests/p1/heartbeat');
    assert.ok(beats.length >= 2);
    for (const r of beats) {
        assert.equal(r.headers['User-Agent'], 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9261 Chrome/148.0.7778.280 Electron/42.11.10 Safari/537.36');
        assert.equal(r.headers.Authorization, 'token', 'still your own login');
        const p = desktopProperties(r);
        assert.deepEqual(Object.keys(p), ['os','browser','release_channel','client_version','os_version','os_arch','app_arch','system_locale','has_client_mods',
            'client_launch_id','browser_user_agent','browser_version','os_sdk_version','client_build_number','native_build_number','client_event_source',
            'launch_signature','client_heartbeat_session_id','client_app_state'], 'same keys in the same order as desktop');
        assert.equal(p.os, 'Windows'); assert.equal(p.browser, 'Discord Client'); assert.equal(p.client_build_number, 634304);
        assert.equal(p.has_client_mods, false); assert.equal(p.system_locale, 'en-GB', "the phone's own language");
        assert.match(p.client_launch_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const bits = BigInt('0x' + p.launch_signature.replace(/-/g, ''));
        for (const bit of [119, 108, 100, 91, 84, 75, 61, 55, 48, 38, 24, 11]) assert.equal((bits >> BigInt(bit)) & 1n, 0n, 'no client mod bit ' + bit);
    }
    assert.equal(new Set(beats.map(r => desktopProperties(r).client_launch_id)).size, 1, 'one desktop launch, not a new one each beat');
    const others = b.requests.filter(r => !r.url.endsWith('/heartbeat') && !r.url.startsWith('/applications/'));
    assert.ok(others.length > 0);
    assert.ok(others.every(r => r.headers['User-Agent'] === 'Discord-Android/348010;RNA' && r.headers['X-Super-Properties'] === 'cGhvbmU='), 'video progress stays the phone');
});
test("Quest Completer names the game's real executable, never a test build or launcher", async () => {
    const app = {id:'1402418491272986635', name:'Marvel Rivals', executables:[
        {os:'win32', name:'marvel-win64-test.exe'}, {os:'win32', name:'launcher.exe', is_launcher:true},
        {os:'darwin', name:'marvel.app'}, {os:'win32', name:'win64/marvel-win64-shipping.exe'}]};
    const b = questHarness({quests:[playFixture('p1', 120, enrolledAgo(5))], apps:{'1402418491272986635':app}});
    b.connect(); await b.run();
    const lookups = b.requests.filter(r => r.url.startsWith('/applications/public'));
    assert.equal(lookups.length, 1); assert.equal(lookups[0].headers['User-Agent'].includes('discord/1.0.9261'), true);
    const beats = b.requests.filter(r => r.url === '/quests/p1/heartbeat');
    assert.ok(beats.length >= 2 && beats.every(r => r.body.executable_path === 'win64/marvel-win64-shipping.exe'));
    const single = questHarness({quests:[playFixture('p2', 60, enrolledAgo(5), '42424242424242')], apps:{'42424242424242':{id:'42424242424242', name:'March of Giants', executables:[{os:'win32', name:'MarchOfGiants.exe'}]}}});
    single.connect(); await single.run();
    assert.equal(single.requests.find(r => r.url === '/quests/p2/heartbeat').body.executable_path, 'march of giants/marchofgiants.exe');
    const unknown = questHarness({quests:[playFixture('p3', 60, enrolledAgo(5))]});
    unknown.connect(); await unknown.run();
    assert.equal('executable_path' in unknown.requests.find(r => r.url === '/quests/p3/heartbeat').body, false, 'nothing made up');
});
test('Quest Completer reads the game from older Play Quests too', async () => {
    const q = questFixture('old', 'PLAY_ON_DESKTOP', 60, enrolledAgo(5)); q.config.application = {id:'1234567890123'};
    const b = questHarness({quests:[q]});
    b.connect(); await b.run();
    const beats = b.requests.filter(r => r.url === '/quests/old/heartbeat');
    assert.ok(beats.length >= 1); assert.ok(beats.every(r => r.body.application_id === '1234567890123'));
});
test('Quest Completer leaves Play Quests alone when Play Quests is off', async () => {
    const b = questHarness({quests:[playFixture('p1', 900)], settings:{questsPlay:false}});
    b.connect(); await b.run();
    assert.deepEqual(b.requests, []);
});
test('Quest Completer prefers a video task when a Quest offers both', async () => {
    const q = playFixture('both', 900, enrolledAgo(100)); q.config.taskConfigV2.tasks = {WATCH_VIDEO:{type:'WATCH_VIDEO', target:30}, ...q.config.taskConfigV2.tasks};
    const b = questHarness({quests:[q]});
    b.connect(); await b.run();
    assert.ok(b.requests.some(r => r.url === '/quests/both/video-progress'));
    assert.equal(b.requests.some(r => r.url === '/quests/both/heartbeat'), false);
});
test('Quest Completer skips stream, finished, expired and game-less Quests', async () => {
    const expired = questFixture('old', 'WATCH_VIDEO', 30, enrolledAgo(5)); expired.config.expiresAt = new Date(QUEST_T0 - 1000).toISOString();
    const done = questFixture('done', 'WATCH_VIDEO', 30, {userStatus:{enrolledAt:new Date(QUEST_T0 - 1e6), completedAt:new Date(QUEST_T0), progress:{}}});
    const b = questHarness({quests:[questFixture('pc', 'PLAY_ON_DESKTOP', 900), questFixture('st', 'STREAM_ON_DESKTOP', 900), expired, done]});
    b.connect(); await b.run();
    assert.deepEqual(b.requests, []);
});
test('Quest Completer runs one Quest at a time, soonest-expiring first', async () => {
    const late = questFixture('late', 'WATCH_VIDEO', 30, enrolledAgo(100));
    const soon = questFixture('soon', 'WATCH_VIDEO', 30, enrolledAgo(100)); soon.config.expiresAt = new Date(QUEST_T0 + 864e5).toISOString();
    const b = questHarness({quests:[late, soon]});
    b.connect(); await b.run();
    const order = b.requests.map(r => r.url.split('/')[2]);
    assert.equal(order[0], 'soon');
    assert.ok(order.lastIndexOf('soon') < order.indexOf('late'), 'never interleaved');
    assert.ok(b.map.get('late').userStatus.completedAt && b.map.get('soon').userStatus.completedAt);
});
test('Quest Completer only finishes Quests you accepted when Accept new Quests is off', async () => {
    const b = questHarness({quests:[questFixture('new', 'WATCH_VIDEO', 30), questFixture('mine', 'WATCH_VIDEO', 30, enrolledAgo(100))], settings:{questsEnroll:false}});
    b.connect(); await b.run();
    assert.equal(b.requests.some(r => r.url.includes('/new/')), false);
    assert.ok(b.map.get('mine').userStatus.completedAt);
});
test('Quest Completer turns a captcha into a quiet skip instead of opening a screen', async () => {
    const b = questHarness({quests:[questFixture('q1', 'WATCH_VIDEO', 30)], fail:{enroll:{ok:false, status:400, body:{captcha_key:['captcha-required']}}}});
    b.connect(); await b.run();
    assert.equal(b.requests.filter(r => r.url === '/quests/q1/enroll').length, 1, 'not retried right away');
    assert.deepEqual(b.ui, []);
    b.advance(7 * 3600 * 1000); b.connect(); await b.run();
    assert.equal(b.requests.filter(r => r.url === '/quests/q1/enroll').length, 2, 'tried again hours later');
});
test('Quest Completer waits out Discord\'s rate limit before accepting more', async () => {
    const b = questHarness({quests:[questFixture('q1', 'WATCH_VIDEO', 30), questFixture('q2', 'WATCH_VIDEO', 30)],
        fail:{enroll:{ok:false, status:429, body:{retry_after:600}}}});
    b.connect(); await b.run(5 * 60 * 1000);
    assert.equal(b.requests.filter(r => r.url.endsWith('/enroll')).length, 1);
    b.advance(11 * 60 * 1000); b.connect(); await b.run(60 * 1000);
    assert.equal(b.requests.filter(r => r.url.endsWith('/enroll')).length, 2, 'tries the next one after the wait');
});
test('Quest Completer stops a running Quest when switched off and on logout', async () => {
    const b = questHarness({quests:[questFixture('q1', 'WATCH_VIDEO', 600, enrolledAgo(0))]});
    b.connect(); await b.run(60 * 1000);
    const sent = b.requests.length; assert.ok(sent > 0);
    b.api.setSetting('quests', false); await b.run();
    assert.equal(b.requests.length, sent, 'nothing sent after switching off'); assert.equal(b.timers.length, 0);
    b.api.setSetting('quests', true); await b.run(60 * 1000);
    assert.ok(b.requests.length > sent, 'resumes when switched back on');
    const resumed = b.requests.length;
    b.subs.get('LOGOUT').forEach(fn => fn({type:'LOGOUT'})); await b.run();
    assert.equal(b.requests.length, resumed);
});
test('Quest Completer asks Discord for Quests when the phone hasn\'t loaded them yet', async () => {
    const b = questHarness({fetched:false});
    b.connect(); await b.run();
    assert.equal(b.fetches, 1);
});
test('Quest Completer settings page has its switches and stays alphabetical', () => {
    const b = settingsHarness();
    assert.equal(b.registry.VENUS_QUESTS.type, 'route'); assert.equal(b.registry.VENUS_QUESTS.parent, 'VENUS_PLUGINS');
    assert.equal(b.registry.VENUS_QUESTS.useTitle(), 'Quests');
    const node = b.registry.VENUS_PLUGINS.screen.getComponent()().props.node;
    assert.ok(node.sections.at(-1).settings.includes('VENUS_QUESTS_ROW'));
    // Patched in, but off until you turn it on in Discord.
    assert.equal(b.api.settings.quests, false); assert.equal(b.api.setSetting('quests', true), true); assert.equal(b.api.settings.quests, true);
    for (const key of ['questsVideo', 'questsPlay', 'questsActivity', 'questsEnroll']) {
        assert.equal(b.api.settings[key], true); assert.equal(b.api.setSetting(key, false), true); assert.equal(b.api.settings[key], false);
    }
});
test('Quest Completer starts off in Discord and sends nothing until you turn it on', async () => {
    const b = boot({quests:true});
    const timers = [];
    b.context.setTimeout = (fn, ms) => { timers.push(fn); return timers.length; };
    b.context.clearTimeout = () => {};
    const subs = new Map();
    b.load({default:{subscribe:(event, fn) => subs.set(event, fn), dispatch(){}}}, null, 585);
    assert.equal(b.api.settings.quests, false);
    subs.get('CONNECTION_OPEN')({user:{id:'1'}});
    assert.equal(timers.length, 0);
    b.api.setSetting('quests', true);
    assert.equal(timers.length, 1);
});
test('unselected Quest Completer never touches QuestStore or the dispatcher', () => {
    const b = boot({readAll:true});
    let subscribed = 0, listened = 0;
    b.load({default:{subscribe:() => subscribed++, dispatch(){}}}, null, 585);
    b.load({default:{getQuest(){}, addChangeListener:() => listened++}}, null, 7120);
    assert.equal(subscribed, 0); assert.equal(listened, 0);
    assert.equal(b.api.setSetting('quests', true), false);
});

// ---- 1.4.4 regressions ----
test('Read All hands back the newest server bar props, not an older result sharing the same list data',()=>{
    const b=readAllHarness();
    const hook=b.load({default:props=>props},null,15929);
    const older=Object.freeze({listProps:{scroll:1},listDataProps:b.data}), newer=Object.freeze({listProps:{scroll:2},listDataProps:b.data});
    const a=hook.default(older), c=hook.default(newer);
    assert.equal(a.listProps.scroll,1);assert.equal(c.listProps.scroll,2,'the newer render must keep its own listProps');
    assert.equal(a.listDataProps,c.listDataProps,'the wrapped list data is still shared, so the list does not redraw');
    assert.equal(hook.default(newer),c,'same result, same view');
});
test('Quest Completer asks for the game again after a dropped connection instead of leaving it unnamed', async () => {
    const app = {id:'1402418491272986635', name:'Marvel Rivals', executables:[{os:'win32', name:'win64/marvel.exe'}]};
    const b = questHarness({quests:[playFixture('p1', 60, enrolledAgo(5)), playFixture('p2', 60, enrolledAgo(5))], apps:{'1402418491272986635':app}});
    const get = b.http.get; let offline = true;
    // Only the first lookup drops; the connection is back by the next Quest.
    b.http.get = request => { if (offline) { offline = false; return Promise.reject(new Error('Network request failed')); } return get(request); };
    b.connect(); await b.run();
    const first = b.requests.find(r => r.url === '/quests/p1/heartbeat');
    assert.ok(first); assert.equal('executable_path' in first.body, false, 'nothing made up while offline');
    const later = b.requests.filter(r => r.url === '/quests/p2/heartbeat').at(-1);
    assert.equal(later.body.executable_path, 'win64/marvel.exe', 'looked up again once online');
});
test('Quest Completer retries accepting a Quest soon after a dropped connection, but waits hours after a refusal', async () => {
    const b = questHarness({quests:[questFixture('q1', 'WATCH_VIDEO', 30)]});
    const post = b.http.post; let offline = true;
    b.http.post = request => offline && request.url.endsWith('/enroll') ? Promise.reject(new Error('Network request failed')) : post(request);
    b.connect(); await b.run(60 * 1000);
    assert.equal(b.requests.filter(r => r.url === '/quests/q1/enroll').length, 0);
    offline = false; b.advance(6 * 60 * 1000); b.connect(); await b.run();
    assert.ok(b.requests.some(r => r.url === '/quests/q1/enroll'), 'tried again minutes later, not 6 hours later');
    assert.ok(b.map.get('q1').userStatus.completedAt);
});
test('Quest Completer gives up on a Quest Discord stops counting instead of sending heartbeats forever', async () => {
    const b = questHarness({quests:[playFixture('p1', 900, enrolledAgo(5))]});
    const post = b.http.post;
    // Discord keeps answering, but the Quest is stuck at two minutes.
    b.http.post = request => { const sent = post(request);
        return request.url.endsWith('/heartbeat') ? sent.then(() => ({body:{quest_id:'p1', completed_at:null, progress:{PLAY_ON_DESKTOP:{value:120}}}})) : sent; };
    b.connect(); await b.run(20 * 60 * 1000);
    const beats = b.requests.filter(r => r.url === '/quests/p1/heartbeat').length;
    assert.ok(beats >= 5 && beats <= 7, 'stopped after a few beats with no progress, sent ' + beats);
});
test('Quest Completer settings page has no 5-second redraw timer', async () => {
    const b = questHarness({quests:[questFixture('v1', 'WATCH_VIDEO', 30, enrolledAgo(100))]});
    let intervals = 0; b.context.setInterval = () => { intervals++; return 0; };
    const React = {createElement:(type, props, ...children) => ({type, props:{...props, children:children.length > 1 ? children : children[0]}}),
        useState:v => [v, () => {}], useEffect:fn => { fn(); }, useRef:v => ({current:v}), useMemo:f => f(), useCallback:f => f, Fragment:'Fragment'};
    b.load(React, null, 17); b.load({View:'View', Text:'Text', Modal:'Modal', ScrollView:'ScrollView'}, null, 19);
    const registry = b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route'}}}, null, 14130).SETTING_RENDERER_CONFIG;
    registry.VENUS_QUESTS.screen.getComponent()();
    assert.equal(intervals, 0, 'no 5-second polling');
});
test('ReviewDB review menu closes its own sheet', async () => {
    const b=reviewHarness();b.api.setSetting('reviewDB',true);const m=await loadedReviews(b,'222222222222222222');
    const profileCard=m.render().props.children;const rows=profileCard.props.children[0].props.children;
    rows[1].type(rows[1].props).props.children.props.onLongPress();
    b.simple.at(-1).header.onClose();assert.equal(b.hiddenSheets.at(-1),'ReviewOverflow');
});
test('NoDelete restoring an unchanged archive at startup does not rewrite it', async () => {
    const raw={id:'1',channel_id:'c',author:{id:'u'},content:'saved'};
    const saved=JSON.stringify({version:1,accountId:'owner',messages:[{id:'1',channelId:'c',message:raw}]});
    const b=await archiveHarness(saved);await new Promise(r=>setTimeout(r,900));await flush();
    assert.equal(b.store.getMessage('c','1').content,'saved');
    assert.equal(b.writes.filter(([name])=>name==='venus-deleted-messages.json').length,0,'nothing changed, nothing written');
    assert.equal(b.api.status.archive,'saved locally');
    const other=await archiveHarness(JSON.stringify({version:1,accountId:'owner',messages:[{id:'1',channelId:'c',message:raw},{id:'bad'}]}));
    await new Promise(r=>setTimeout(r,900));await flush();
    assert.equal(other.writes.filter(([name])=>name==='venus-deleted-messages.json').length,1,'a cleaned-up archive is written once');
});

test('Force system emojis is saved, starts on and offers to reopen Discord through its own native method',async()=>{
    const b=boot({systemEmoji:true,systemFont:true});const writes=[],requests=[],alerts=[];
    b.load({View:'View',Text:'Text',Modal:'Modal',Alert:{alert:(...args)=>alerts.push(args)}},null,17);
    b.context.setTimeout=(fn)=>{fn();return 0;};
    b.load(native({writeFile:async(...args)=>writes.push(args),fileExists:async uri=>{requests.push(['exists',uri]);return false;},
        getVideoDimensions:async uri=>{requests.push(['video',uri]);return 'restarting';}}));
    await flush();await flush();
    assert.equal(b.api.settings.systemEmoji,true);
    b.api.setSetting('systemEmoji',false);await flush();await flush();
    assert.equal(alerts.length,1);assert.equal(alerts[0][0],"Use Discord's emojis");assert.match(alerts[0][1],/emojis everywhere/);
    alerts[0][2][1].onPress();await flush();await flush();await flush();
    assert.equal(JSON.parse(writes.at(-1)[2]).systemEmoji,false);
    assert.deepEqual(requests.at(-1),['video','venus-emoji-v1:restart']);
    assert.ok(!requests.some(([kind,uri])=>kind==='exists'&&uri.startsWith('venus-emoji')),'emoji reopen must not share the font bridge');
    b.api.setSetting('systemEmoji',true);await flush();assert.equal(alerts.length,1);
    b.api.setSetting('systemFont',true);await flush();assert.equal(alerts.length,2);assert.equal(alerts[1][0],"Use your phone's font");
    assert.equal(boot({}).api.setSetting('systemEmoji',false),false);
});
// Discord drawing its emojis at launch reads the saved setting; these start from one saved with emojis on.
async function emojiOn() {
    const b=boot({systemEmoji:true});b.load({default:native({fileExists:async()=>true,readFile:async()=>JSON.stringify({systemEmoji:true})})});
    await flush();await flush();await flush();return b;
}
test('Force system emojis draws only Unicode emojis with the phone font in React Native',async()=>{
    const b=await emojiOn();const seen=[];
    const Emoji=function Emoji(props){seen.push(props);return 'emoji';};
    const exports=b.load({default:Object.freeze({$$typeof:Symbol.for('react.memo'),type:Emoji})},null,6552);
    const render=props=>exports.default.type(props);
    const twemoji={name:'\u{1F600}',src:'asset:/emoji-1f600.png',textEmojiStyle:{fontSize:16}};
    render(twemoji);assert.equal(seen.at(-1).forceTextEmoji,true);assert.equal(twemoji.forceTextEmoji,undefined);
    assert.equal(seen.at(-1).textEmojiStyle,twemoji.textEmojiStyle);
    const custom={name:'blobwave',src:'https://cdn.discordapp.com/emojis/1.webp'};render(custom);assert.equal(seen.at(-1),custom);
    const customUnicodeName={name:'\u{1F600}',src:{uri:'https://cdn.discordapp.com/emojis/2.png'}};render(customUnicodeName);assert.equal(seen.at(-1),customUnicodeName);
    const plain={name:'\u2764\uFE0F'};render(plain);assert.equal(seen.at(-1).forceTextEmoji,true);
    const off=boot({});const untouched={default:Emoji};assert.equal(off.load(untouched,null,6552).default,Emoji);
});
test('Hide gift button removes it from both message bar sides and comes back when switched off',()=>{
    const b=boot({hideGift:true});reactHarness(b);const seen=[];
    const left=b.load({displayName:'ChatInputActions',default:Object.freeze({$$typeof:Symbol.for('react.memo'),
        type:Object.freeze({$$typeof:Symbol.for('react.forward_ref'),render(props,ref){seen.push(['left',props,ref]);return 'left';}})})},null,11609);
    const right=b.load({default:Object.freeze({$$typeof:Symbol.for('react.memo'),type:function Right(props){seen.push(['right',props]);return 'right';}})},null,11817);
    const props=Object.freeze({channel:{id:'1'},shouldShowGiftButton:true,canStartThreads:true});
    assert.equal(left.default.type.render(props,'ref'),'left');
    assert.equal(seen.at(-1)[1].shouldShowGiftButton,false);assert.equal(seen.at(-1)[1].canStartThreads,true);assert.equal(seen.at(-1)[2],'ref');
    assert.equal(left.default.$$typeof,Symbol.for('react.memo'));assert.equal(left.default.type.$$typeof,Symbol.for('react.forward_ref'));
    right.default.type(props);assert.equal(seen.at(-1)[1].shouldShowGiftButton,false);
    const none={shouldShowGiftButton:false};right.default.type(none);assert.equal(seen.at(-1)[1],none);
    b.api.setSetting('hideGift',false);right.default.type(props);assert.equal(seen.at(-1)[1],props);
    const off=boot({});const stock={default:function Right(){}};assert.equal(off.load(stock,null,11817).default,stock.default);
});
test('Hide Quests promotion gives Discord its own empty-dock answer and unmounts the dock',()=>{
    const b=boot({hideQuestDock:true});const {React}=reactHarness(b);
    b.context.__r=id=>id===5764?{AdCreativeType:{QUEST:1,BOUNTY:3,NO_FILL:4}}:null;
    const quest={type:1,quest:{id:'q'}};
    const hooks=b.load({useMobileQuestDock:()=>quest,useMobileQuestDockHeight:()=>88,useIsMobileQuestDockRendered:()=>true,
        useIsMobileQuestDockRenderedBase:()=>true,useIsMobileQuestDockVisibleToUser:()=>true,useQuestDockHeroAsset:()=>'hero'},null,14608);
    assert.deepEqual({...hooks.useMobileQuestDock()},{type:4});assert.equal(hooks.useMobileQuestDockHeight(),0);
    assert.equal(hooks.useIsMobileQuestDockRendered(),false);assert.equal(hooks.useIsMobileQuestDockRenderedBase(),false);
    assert.equal(hooks.useIsMobileQuestDockVisibleToUser(),false);assert.equal(hooks.useQuestDockHeroAsset(),'hero');
    function QuestDock(){return 'dock';}
    const dock=b.load({default:QuestDock,QuestDockQuestContent:function(){}},null,14700);
    assert.equal(dock.default({}),null);assert.equal(typeof dock.QuestDockQuestContent,'function');
    b.api.setSetting('hideQuestDock',false);
    assert.equal(hooks.useMobileQuestDock(),quest);assert.equal(hooks.useMobileQuestDockHeight(),88);assert.equal(hooks.useIsMobileQuestDockRendered(),true);
    const element=dock.default({a:1});assert.equal(element.type,QuestDock);assert.equal(element.props.a,1);
    const off=boot({});const stock={useMobileQuestDock:()=>quest};assert.equal(off.load(stock,null,14608).useMobileQuestDock,stock.useMobileQuestDock);
});
test('the new switches sit in their groups with one-line titles',()=>{
    const b=settingsHarness();const rows=Object.fromEntries(settingsRows(b));
    assert.ok(rows.Appearance.includes('Hide the gift button'));assert.ok(rows.Quests.includes('Hide the Quests banner'));
    assert.deepEqual(rows.Appearance.slice(0,2),["Use your phone's font","Use your phone's emojis"]);
    assert.match(b.registry.VENUS_SYSTEMEMOJI.useDescription(),/reopens/);
    const only=settingsHarness({hideGift:true});assert.deepEqual(settingsRows(only),[['Appearance',['Hide the gift button']]]);
});

function gestureHarness(features={gestures:true}) {
    const b=boot(features);const calls=[];let me='me';
    b.load({default:{getCurrentUser:()=>({id:me})}},null,1378);
    const timers=[];b.context.setTimeout=(fn,ms)=>{timers.push(fn);return timers.length;};b.context.clearTimeout=id=>{timers[id-1]=null;};
    const modules={11047:{default:o=>calls.push(['reply',o.message.id,o.actionSource])},
        11032:{handleEdit:(m,c,ref,source)=>calls.push(['edit',m.id,source])},
        11120:{default:(m,uid)=>m.author.id===uid&&m.state!=='SENDING'},
        6880:{default:{deleteMessage:(c,id)=>{calls.push(['delete',id]);return Promise.resolve();}}}};
    b.context.__r=id=>modules[id];
    let reacted=0;const utils=b.load({handleAddDefaultDoubleTapReaction(){reacted++;return 'react';}},null,7414);
    const tap=(m,c={id:'c'})=>utils.handleAddDefaultDoubleTapReaction(m,c);
    const flushTimers=()=>{timers.splice(0).forEach(fn=>fn&&fn());};
    // Discord builds one MessagesHandlers per chat and defines handleTapMessage on it in the constructor.
    let singles=0;
    class MessagesHandlers { constructor(){this.handleTapMessage=e=>{singles++;return 'tap:'+e.nativeEvent.messageId;};} get params(){return 'p';} }
    const Wrapped=b.load({MessagesHandlers},null,10905).MessagesHandlers;const handlers=new Wrapped();
    const single=m=>handlers.handleTapMessage({nativeEvent:{messageId:m.id,channelId:'c'}});
    return {...b,calls,tap,single,handlers,flushTimers,reacted:()=>reacted,singles:()=>singles,setMe:id=>{me=id;}};
}
test('Message tap gestures: double-tap replies, edits your own, and is off by default',()=>{
    const g=gestureHarness();const theirs={id:'1',author:{id:'other'}},mine={id:'2',author:{id:'me'},state:'SENT'};
    assert.equal(g.tap(theirs),'react','starts off: Discord reacts as usual');assert.equal(g.reacted(),1);
    g.api.setSetting('gestures',true);g.tap(theirs);assert.deepEqual(g.calls.at(-1),['reply','1','message_swipe']);assert.equal(g.reacted(),1);
    g.tap(mine);assert.equal(g.calls.length,1,'waits briefly for a third tap');g.flushTimers();assert.deepEqual(g.calls.at(-1),['edit','2','message_swipe']);
    g.api.setSetting('gestureOwn','reply');g.tap(mine);g.flushTimers();assert.deepEqual(g.calls.at(-1),['reply','2','message_swipe']);
    assert.equal(g.api.setSetting('gestureOwn','react'),false);
});
test('Message tap gestures: three taps delete only your own message, once',()=>{
    const g=gestureHarness();g.api.setSetting('gestures',true);const mine={id:'2',author:{id:'me'},state:'SENT'},theirs={id:'1',author:{id:'other'}};
    g.tap(mine);g.tap(mine);g.flushTimers();assert.deepEqual(g.calls,[['delete','2']]);
    g.tap(mine);g.flushTimers();assert.equal(g.calls.length,1,'the taps that deleted it are ignored');
    g.tap(theirs);g.tap(theirs);assert.deepEqual(g.calls.slice(1).map(c=>c[0]),['reply','reply'],'never deletes someone else\'s message');
    g.api.setSetting('gestureTripleDelete',false);const other={id:'3',author:{id:'me'},state:'SENT'};
    g.tap(other);assert.deepEqual(g.calls.at(-1),['edit','3','message_swipe'],'no wait when three taps can\'t delete');
});
test('Message tap gestures: the third tap, which Discord reports as a single tap, deletes your own message',()=>{
    // Android: tap, tap = handleAddDefaultDoubleTapReaction; Discord's tracker then starts over, so tap three
    // reaches MessagesHandlers.handleTapMessage about 300 ms later. 1.6.0 opened the editor before it arrived.
    const g=gestureHarness();g.api.setSetting('gestures',true);const mine={id:'2',author:{id:'me'},state:'SENT'},theirs={id:'1',author:{id:'other'}};
    g.tap(mine);assert.equal(g.calls.length,0,'the editor waits for a third tap');
    assert.equal(g.single(mine),undefined,'the third tap is used, not passed on');assert.deepEqual(g.calls,[['delete','2']]);
    g.flushTimers();assert.equal(g.calls.length,1,'the editor never opens after deleting');
    g.tap(mine);g.flushTimers();assert.equal(g.calls.length,1,'later taps on the deleted message are ignored');
    assert.equal(g.single(theirs),'tap:1','other single taps reach Discord');assert.equal(g.singles(),1);
    const other={id:'3',author:{id:'me'},state:'SENT'};g.tap(other);assert.equal(g.single(theirs),'tap:1','a tap on another message deletes nothing');
    g.flushTimers();assert.deepEqual(g.calls.at(-1),['edit','3','message_swipe']);
    g.tap(theirs);assert.equal(g.single(theirs),'tap:1');assert.deepEqual(g.calls.at(-1),['reply','1','message_swipe'],'someone else\'s message is never deleted');
    g.api.setSetting('gestureTripleDelete',false);const four={id:'4',author:{id:'me'},state:'SENT'};g.tap(four);
    assert.equal(g.single(four),'tap:4','with three taps off, a single tap is Discord\'s');assert.deepEqual(g.calls.at(-1),['edit','4','message_swipe']);
    assert.equal(g.handlers.params,'p','Discord\'s own handler class still works');
    const off=boot({});class Stock{};assert.equal(off.load({MessagesHandlers:Stock},null,10905).MessagesHandlers,Stock,'untouched without the patch');
});
test('Message tap gestures: a message you can\'t edit gets a reply, and the reaction tip is hidden',()=>{
    const g=gestureHarness();g.api.setSetting('gestures',true);g.api.setSetting('gestureTripleDelete',false);
    g.tap({id:'4',author:{id:'me'},state:'SENDING'});assert.deepEqual(g.calls.at(-1),['reply','4','message_swipe']);
    const nudge=g.load({DoubleTapEmojiEditNudge:()=>'tip'},null,11105);assert.equal(nudge.DoubleTapEmojiEditNudge(),null);
    const toast=g.load({maybeShowDoubleTapReminderToast:()=>'toast'},null,9652);assert.equal(toast.maybeShowDoubleTapReminderToast(),undefined);
    const banner=g.load({DoubleTapToReactChatInputBanner:()=>'banner'},null,11666);assert.equal(banner.DoubleTapToReactChatInputBanner(),null);
    g.api.setSetting('gestures',false);assert.equal(nudge.DoubleTapEmojiEditNudge(),'tip');
    assert.equal(toast.maybeShowDoubleTapReminderToast(),'toast');
    assert.equal(banner.DoubleTapToReactChatInputBanner(),'banner');
    const off=boot({});const untouched={handleAddDefaultDoubleTapReaction(){return 'react';}};assert.equal(off.load(untouched,null,7414).handleAddDefaultDoubleTapReaction,untouched.handleAddDefaultDoubleTapReaction);
});
test('Message tap gestures: passes chatInputRef & invertible, checks canReplyToMessage, triggers haptic feedback, and never triple-deletes unsent messages',()=>{
    const b=boot({gestures:true});b.api.setSetting('gestures',true);
    b.load({default:{getCurrentUser:()=>({id:'me'})}},null,1378);
    const timers=[];b.context.setTimeout=(fn,ms)=>{timers.push(fn);return timers.length;};b.context.clearTimeout=id=>{timers[id-1]=null;};
    let canReply=true,haptics=0,keyboardOpened=0;
    const chatInputRef={current:{openSystemKeyboard(){keyboardOpened++;}}};
    const replyPayloads=[],editCalls=[],deletedIds=[];
    const modules={
        4802:{triggerHapticFeedback:t=>{haptics++;assert.equal(t,0);},HapticFeedbackTypes:{IMPACT_LIGHT:0}},
        4803:{default:{IMPACT_LIGHT:0}},
        7422:{canReplyToMessage:(c,m)=>canReply&&m.state!=='SENDING'},
        11047:{default:o=>{replyPayloads.push(o);if(o.chatInputRef&&o.chatInputRef.current)o.chatInputRef.current.openSystemKeyboard();}},
        11032:{handleEdit:(m,c,ref,source,inv)=>{editCalls.push({m,c,ref,source,inv});if(ref&&ref.current)ref.current.openSystemKeyboard();}},
        11120:{default:(m,uid)=>m.author.id===uid&&m.state==='SENT'},
        6880:{default:{deleteMessage:(c,id)=>{deletedIds.push(id);return Promise.resolve();}}}
    };
    b.context.__r=id=>modules[id];
    const utils=b.load({handleAddDefaultDoubleTapReaction(){return 'react';}},null,7414);
    class MessagesHandlers {
        constructor(){this.handleTapMessage=()=>'tap';this.handleDoubleTapMessage=e=>utils.handleAddDefaultDoubleTapReaction(e.message,e.channel);}
        get params(){return {chatInputRef,selectedChannelId:'c1'};}
    }
    const Wrapped=b.load({MessagesHandlers},null,10905).MessagesHandlers;
    const handlers=new Wrapped();
    const channel={id:'c1'};
    const theirs={id:'10',author:{id:'other'},state:'SENT'};
    const mine={id:'20',author:{id:'me'},state:'SENT'};
    const sending={id:'30',author:{id:'me'},state:'SENDING'};

    // 1. Reply passes chatInputRef + invertible:true and triggers haptic feedback
    handlers.handleDoubleTapMessage({message:theirs,channel});
    assert.equal(replyPayloads.length,1);
    assert.equal(replyPayloads[0].chatInputRef,chatInputRef);
    assert.equal(replyPayloads[0].invertible,true);
    assert.equal(keyboardOpened,1);
    assert.equal(haptics,1);

    // 2. Edit passes chatInputRef + invertible:true after triple-tap window and triggers haptic feedback
    handlers.handleDoubleTapMessage({message:mine,channel});
    timers.splice(0).forEach(fn=>fn&&fn());
    assert.equal(editCalls.length,1);
    assert.equal(editCalls[0].ref,chatInputRef);
    assert.equal(editCalls[0].inv,true);
    assert.equal(keyboardOpened,2);
    assert.equal(haptics,2);

    // 3. canReplyToMessage guard blocks replies in read-only/archived channels or to non-replyable messages
    canReply=false;
    handlers.handleDoubleTapMessage({message:theirs,channel});
    assert.equal(replyPayloads.length,1,'blocked by canReplyToMessage');
    canReply=true;

    // 4. Unsent/failed messages (state !== "SENT") do not wait for triple-tap or call deleteMessage
    handlers.handleDoubleTapMessage({message:sending,channel});
    assert.equal(timers.length,0,'unsent message does not arm triple-delete timer');
    handlers.handleDoubleTapMessage({message:sending,channel});
    assert.equal(deletedIds.length,0,'unsent message is never deleted via API');
});
test('Hide call button removes Call from profiles, and Message takes the whole row',()=>{
    const b=boot({hideCall:true});const {React,RN}=reactHarness(b);
    function PhoneCallIcon(){} function ChatIcon(){} function Button(){} function IconButton(){}
    let animated=0;RN.LayoutAnimation={Presets:{easeInEaseOut:'ease'},configureNext:p=>{assert.equal(p,'ease');animated++;}};
    let refValue;React.useRef=v=>{if(refValue===undefined)refValue={current:v};return refValue;};
    b.context.__r=id=>({7309:{PhoneCallIcon}}[id]||null);
    const el=(type,props,...children)=>React.createElement(type,props,...children);
    // Discord's two-button layout: each button in its own flex:1 slot, side by side.
    const two=()=>el('View',{style:{flexDirection:'row',gap:12}},
        el('View',{style:{flex:1}},el(Button,{text:'Message',icon:el(ChatIcon,{size:'md'}),grow:true})),
        el('View',{style:{flex:1}},el(Button,{text:'Call',icon:el(PhoneCallIcon,{size:'md'}),grow:true})));
    // With a friend button: Message and Call are icon buttons in one group.
    const three=()=>el('View',null,el('View',{style:{flexGrow:1}},el(Button,{text:'Add Friend'})),
        el('View',{style:{flexDirection:'row'}},el(IconButton,{icon:el(ChatIcon,{})}),el(IconButton,{icon:el(PhoneCallIcon,{})})));
    let layout=two;const Buttons=b.load({default:function UserProfileContactButtons(){return layout();}},null,12696).default;
    const types=n=>{const out=[];(function walk(v){if(!v||typeof v!=='object')return;if(Array.isArray(v))return v.forEach(walk);out.push(v.type);walk(v.props&&v.props.children);walk(v.props&&v.props.icon);})(n);return out;};
    let tree=Buttons({});const row=tree.props.children;
    assert.ok(!types(tree).includes(PhoneCallIcon),'no Call button');assert.ok(types(tree).includes(ChatIcon),'Message stays');
    assert.ok(!Array.isArray(row)||row.length===1,'Call\'s slot is gone too, so Message\'s flex:1 slot fills the row');
    layout=three;tree=Buttons({});assert.ok(!types(tree).includes(PhoneCallIcon));assert.equal(types(tree).filter(t=>t===IconButton).length,1);
    assert.equal(animated,0,'nothing animates on first open');
    b.api.setSetting('hideCall',false);layout=two;tree=Buttons({});assert.ok(types(tree).includes(PhoneCallIcon),'switched off: Call is back');
    assert.equal(animated,1,'Message slides across when the setting changes');
    const off=boot({});const stock={default:function C(){}};assert.equal(off.load(stock,null,12696).default,stock.default,'untouched without the patch');
    const rows=Object.fromEntries(settingsRows(settingsHarness({hideCall:true})));assert.deepEqual(rows.Appearance,['Hide the call button']);
});
function editHarness(saved) {
    const b=boot(allFeatures);const store=new Map();let disk=saved;const writes=[];
    store.set('c:1',{id:'1',channel_id:'c',author:{id:'u'},content:'first',timestamp:'2026-10-01T00:00:00.000Z',state:'SENT'});
    b.load({default:{getMessage:(c,id)=>store.get(c+':'+id),getMessages:()=>new MessageCollection(),emitChange(){}}},null,5057);
    b.load({createMessageRecord:raw=>({...raw})},null,5059);b.load({default:{getCurrentUser:()=>({id:'owner'})}},null,1378);
    const flux={dispatch(event){if(event.type==='MESSAGE_UPDATE'&&event.message.edited_timestamp){const old=store.get(event.message.channel_id+':'+event.message.id);
        store.set(event.message.channel_id+':'+event.message.id,{...old,content:event.message.content,editedTimestamp:event.message.edited_timestamp});}}};
    const dispatch=b.load({default:flux},null,585).default;
    class Rows{generate(row){return row.result;}}b.load({default:Rows},null,7378);
    b.load(native({fileExists:async p=>p.endsWith('venus-deleted-messages.json')&&!!disk,readFile:async()=>disk,
        writeFile:async(dir,name,text)=>{writes.push(name);if(name==='venus-deleted-messages.json')disk=text;}}));
    const edit=(content,at)=>dispatch.dispatch({type:'MESSAGE_UPDATE',message:{id:'1',channel_id:'c',content,edited_timestamp:at||'2026-10-02T00:00:00.000Z'}});
    const row=()=>new Rows().generate({rowType:1,message:{id:'1',channel_id:'c'},result:{message:{id:'1',channelId:'c',content:[{type:'text',content:store.get('c:1').content}]}}});
    return {...b,dispatch,edit,row,store,getDisk:()=>disk,writes};
}
test('NoDelete shows what an edited message said before, in one quote above it',()=>{
    const b=editHarness();b.api.setSetting('noDelete',true);
    assert.equal(b.row().message.content.length,1,'nothing shown before any edit');
    b.edit('second');b.edit('third');
    const content=b.row().message.content;assert.equal(content.length,2);
    const quote=content[0];assert.equal(quote.type,'blockQuote');
    const lines=quote.content.filter(n=>n.type==='subtext');assert.equal(lines.length,2);
    assert.equal(JSON.stringify(lines.map(l=>l.content[0].type)),'["s","s"]');assert.equal(JSON.stringify(lines.map(l=>l.content[0].content[0].content)),'["first","second"]');
    assert.equal(quote.content[1].type,'br');assert.equal(JSON.stringify(content[1]),'{"type":"text","content":"third"}');
    assert.equal(b.row().message.content[0],quote,'built once, reused on every render');
});
test('NoDelete ignores updates that are not edits, and forgets history when switched off',()=>{
    const b=editHarness();b.api.setSetting('noDelete',true);
    b.dispatch.dispatch({type:'MESSAGE_UPDATE',message:{id:'1',channel_id:'c',embeds:[{}]}});
    b.dispatch.dispatch({type:'MESSAGE_UPDATE',message:{id:'1',channel_id:'c',content:'first',edited_timestamp:'x'}});
    b.dispatch.dispatch({type:'MESSAGE_UPDATE',message:{id:'1',channel_id:'c',content:'no edit time'}});
    assert.equal(b.row().message.content.length,1,'link previews, same text and kept-message updates are not edits');
    b.edit('second');assert.equal(b.row().message.content.length,2);
    b.api.setSetting('noDeleteEdits',false);assert.equal(b.row().message.content.length,1);
    b.api.setSetting('noDeleteEdits',true);assert.equal(b.row().message.content.length,1,'history was forgotten, not hidden');
    b.edit('third');b.api.setSetting('noDelete',false);b.api.setSetting('noDelete',true);assert.equal(b.row().message.content.length,1);
});
test('NoDelete saves edit history with Save permanently and restores it for the same account',async()=>{
    const b=editHarness();await flush();await flush();b.api.setSetting('noDelete',true);b.api.setSetting('noDeleteSave',true);await flush();await flush();
    b.edit('second');await new Promise(r=>setTimeout(r,800));await flush();await flush();
    const disk=JSON.parse(b.getDisk());assert.equal(disk.edits[0].versions[0].content,'first');assert.equal(disk.messages.length,0);
    const again=editHarness(b.getDisk());again.store.set('c:1',{...again.store.get('c:1'),content:'second'});
    await flush();await flush();again.api.setSetting('noDelete',true);again.api.setSetting('noDeleteSave',true);await flush();await flush();await flush();
    const content=again.row().message.content;assert.equal(content.length,2);assert.equal(content[0].content[0].content[0].content[0].content,'first');
    // A file from before this release has no edits key and still loads.
    const old=editHarness(JSON.stringify({version:1,accountId:'owner',messages:[]}));await flush();await flush();
    old.api.setSetting('noDelete',true);old.api.setSetting('noDeleteSave',true);await flush();await flush();assert.equal(old.api.status.archive,'saved locally');
});

// ---- 1.7.1 regressions ----
test('QuickDelete link previews ask again once QuickDelete itself is off',()=>{
    const b=boot(allFeatures);let confirmed=0;
    const translations={message:'Delete Message',embed:'Remove all embeds'};
    b.load({t:{AMvpS4:'message','vXZ+Fo':'embed'},intl:{string:key=>translations[key]}},null,1127);
    const action=b.load({default:{show(value){return value;}}},null,5205).default;
    const embed={body:translations.embed,onConfirm(){confirmed++;}};
    b.api.setSetting('quickDelete',true);b.api.setSetting('quickDeleteEmbeds',true);
    action.show(embed);assert.equal(confirmed,1);
    b.api.setSetting('quickDelete',false);assert.equal(action.show(embed),embed);assert.equal(confirmed,1);
});
test('NoDelete maximum of 0 becomes the lowest allowed, not 512',()=>{
    const b=deletionHarness();b.api.setSetting('noDelete',true);b.api.setSetting('noDeleteLimit','20');
    b.api.setSetting('noDeleteLimit','0');assert.equal(b.api.settings.noDeleteLimit,1);
    b.api.setSetting('noDeleteLimit',-5);assert.equal(b.api.settings.noDeleteLimit,1);
    b.api.setSetting('noDeleteLimit','abc');assert.equal(b.api.settings.noDeleteLimit,512);
});
test('Quest Completer saved on starts even when Discord connects before settings load', async () => {
    const b = boot({quests:true});
    const timers = [];
    b.context.setTimeout = (fn, ms) => { timers.push(ms); return timers.length; };
    b.context.clearTimeout = () => {};
    const subs = new Map();
    b.load({default:{subscribe:(event, fn) => subs.set(event, fn), dispatch(){}}}, null, 585);
    let release;
    const saved = new Promise(resolve => { release = resolve; });
    b.load({default:native({fileExists:async () => true, readFile:() => saved})});
    subs.get('CONNECTION_OPEN')({user:{id:'1'}});
    assert.equal(timers.length, 0);
    release(JSON.stringify({quests:true}));
    await flush(); await flush(); await flush();
    assert.equal(b.api.settings.quests, true);
    assert.deepEqual(timers, [8000]);
});
test('Force system emojis also draws keycap emojis with the phone font',async()=>{
    const b=await emojiOn();const seen=[];
    const Emoji=function Emoji(props){seen.push(props);return 'emoji';};
    const exports=b.load({default:Emoji},null,6552);
    for (const name of ['1\uFE0F\u20E3','#\uFE0F\u20E3','*\u20E3']) {exports.default({name});assert.equal(seen.at(-1).forceTextEmoji,true,name);}
    for (const name of ['12','emoji_1','1','#']) {const props={name};exports.default(props);assert.equal(seen.at(-1),props,name);}
});
test('Read All says the DMs could not be cleared instead of "Nothing unread"',()=>{
    const b=readAllHarness();b.context.__r=(old=>id=>id===6532?null:old(id))(b.context.__r);
    b.api.setSetting('readAllMode','both');pressReadAll(b);
    assert.equal(b.calls.guilds.length,1);
    assert.match(b.calls.toasts.at(-1),/^Couldn't mark as read: .*\(2 servers were marked as read\)$/);
    b.api.setSetting('readAllMode','dms');pressReadAll(b);
    assert.doesNotMatch(b.calls.toasts.at(-1),/Nothing unread|servers were/);
});
test('Force system emojis matches Discord\'s native emojis when saved settings are damaged',async()=>{
    const b=boot({systemEmoji:true});const seen=[];
    const Emoji=function Emoji(props){seen.push(props);return 'emoji';};
    const exports=b.load({default:Emoji},null,6552);
    b.load({default:native({fileExists:async()=>true,readFile:async()=>'{broken'})});
    await flush();await flush();await flush();
    assert.equal(b.api.status.storage,'read failed (defaults)');
    const props={name:'\u{1F600}'};exports.default(props);assert.equal(seen.at(-1),props);
});
test('Hidden Channels hands the channel list the same renamed record each time',()=>{
    const b=boot(allFeatures);b.api.setSetting('hiddenChannels',true);
    b.load({Permissions:{VIEW_CHANNEL:1024}},null,1086);
    const record=Object.freeze({id:'c1',guild_id:'g',type:0,name:'hidden'});
    b.load({default:{getChannel:id=>id==='c1'?record:null,getBasicChannel:()=>null}},null,2051);
    b.load({default:{can:()=>false,canBasicChannel:()=>false}},null,4472);
    let list;
    b.context.__d((g,r,importDefault,importAll,module)=>{module.exports={store:importDefault(2051)};},6952,[]);
    const module={exports:{}};
    b.factories.get(6952)(b.context,()=>{},id=>id===2051?{default:{getChannel:id=>id==='c1'?record:null,getBasicChannel:()=>null}}:{},()=>{},module,module.exports,[]);
    list=module.exports.store.default||module.exports.store;
    const first=list.getChannel('c1'),second=list.getChannel('c1');
    assert.notEqual(first,record);assert.equal(first,second);assert.equal(first.id,'c1');
});
test('Message tap gestures: switching gestures off while waiting for a third tap does nothing',()=>{
    const g=gestureHarness();g.api.setSetting('gestures',true);const mine={id:'2',author:{id:'me'},state:'SENT'};
    g.tap(mine);g.api.setSetting('gestures',false);g.flushTimers();assert.equal(g.calls.length,0);
    g.api.setSetting('gestures',true);g.tap(mine);g.flushTimers();assert.deepEqual(g.calls.at(-1),['edit','2','message_swipe']);
});
test('NoDelete forgets kept messages and edit history of a server you leave, but not after an outage',()=>{
    const b=deletionHarness();b.api.setSetting('noDelete',true);
    const channels={a:{id:'a',guild_id:'g1'},b:{id:'b',guild_id:'g2'}};
    b.load({default:{getChannel:id=>channels[id],getBasicChannel:()=>null}},null,2051);
    b.messages.set('a:1',{content:'one'});b.messages.set('b:2',{content:'two'});
    b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'a',id:'1'});b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'b',id:'2'});
    assert.equal(b.messages.size,2);
    b.dispatch.dispatch({type:'GUILD_DELETE',guild:{id:'g1',unavailable:true}});
    b.events.length=0;b.api.setSetting('noDelete',false);
    const removed=b.events.map(e=>e.channelId);assert.deepEqual(removed.sort(),['a','b'],'an outage keeps both');
    b.api.setSetting('noDelete',true);b.messages.set('a:1',{content:'one'});b.messages.set('b:2',{content:'two'});
    b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'a',id:'1'});b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'b',id:'2'});
    b.dispatch.dispatch({type:'GUILD_DELETE',guild:{id:'g1'}});
    b.events.length=0;b.api.setSetting('noDelete',false);
    assert.deepEqual(b.events.map(e=>e.channelId),['b'],'leaving g1 forgets only its channel');
});
test('Force system font does not reopen Discord when the setting could not be saved',async()=>{
    const b=boot({systemFont:true});const requests=[],alerts=[];let failing=false;
    b.load({View:'View',Text:'Text',Modal:'Modal',Alert:{alert:(...args)=>alerts.push(args)}},null,17);
    b.context.setTimeout=(fn)=>{fn();return 0;};
    b.load(native({writeFile:async()=>{if(failing)throw new Error('disk full');},fileExists:async uri=>{requests.push(uri);return false;}}));
    await flush();await flush();
    b.api.setSetting('systemFont',true);await flush();await flush();
    failing=true;alerts[0][2][1].onPress();await flush();await flush();await flush();
    assert.equal(requests.filter(uri=>uri.startsWith('venus-font-v1:')).length,0,'no reopen');
    assert.equal(alerts.at(-1)[0],"Couldn't save the setting");
});
test('sticker link text escapes spoiler, strikethrough and heading markup',()=>{
    const b=nitroHarness();b.stickers['20'].name='||boo|| ~~x~~ #1';
    b.actions.sendStickers('channel',['20'],{content:''});
    assert.match(b.sent.at(-1)[2].content,/^\[\\\|\\\|boo\\\|\\\| \\~\\~x\\~\\~ \\#1\]\(https:\/\/media\.discordapp\.net\/stickers\/20\.png\?size=160\)$/);
});
test('file size badge shows a known size at once and never the old photo\'s size on a reused tile',async()=>{
    const b=boot({picker:true});const {React,RN}=reactHarness(b);
    let state, effect;
    React.useState=init=>{if(state===undefined)state=typeof init==='function'?init():init;return [state,fn=>{state=typeof fn==='function'?fn(state):fn;}];};
    React.useEffect=fn=>{effect=fn;};
    b.load({default:native({getSize:async uri=>uri==='file://a'?2048:4096})});await flush();await flush();
    await b.api.getSize('file://a');
    function Pressable(props){return props;}Pressable.displayName='Pressable';
    const tile=b.load({default:Pressable},null,414).default;
    const badgeOf=uri=>tile({children:[{props:{localImageSource:{uri}}}]}).children.props.children[1];
    const render=badge=>badge.type(badge.props);
    const first=render(badgeOf('file://a'));assert.equal(first.props.children.props.children,'2 KB','cached size, first frame');
    const style=first.props.style;
    assert.equal(render(badgeOf('file://b')),null,'a reused tile hides the old size until the new one is read');
    effect();await flush();await flush();
    assert.equal(render(badgeOf('file://b')).props.children.props.children,'4 KB');
    assert.equal(render(badgeOf('file://b')).props.style,style,'one shared style object');
});

// Fix unknown mentions, profile bar settings button and long messages.
function validHarness(users = {}) {
    const b=boot({validUser:true});
    const timers=[];b.context.setTimeout=(fn,ms)=>{timers.push(fn);return timers.length;};
    const run=async()=>{for (let i=0;i<50 && timers.length;i++){timers.shift()();await flush();await flush();}};
    const known=new Map(Object.entries(users));const subs={};const dispatched=[];
    const dispatcher={subscribe(type,fn){(subs[type]||(subs[type]=[])).push(fn);},dispatch(event){dispatched.push(event);
        if (event.type==='USER_UPDATE') known.set(event.user.id,event.user);(subs[event.type]||[]).forEach(fn=>fn(event));}};
    b.load({default:{getUser:id=>known.get(id),getCurrentUser:()=>({id:'me'})}},null,1378);
    b.load({default:dispatcher},null,585);
    const asked=[];let answer=id=>{known.set(id,{id,username:'u'+id});return Promise.resolve({id});};
    b.context.__r=id=>id===7630?{getUser:userId=>{asked.push(userId);return answer(userId);}}:null;
    return {...b,dispatcher,dispatched,known,asked,run,setAnswer:fn=>{answer=fn;},subs};
}
test('Fix unknown mentions looks up unknown people automatically and redraws the message',async()=>{
    const b=validHarness({'11111111111111111':{id:'11111111111111111'}});
    const message={id:'m1',channel_id:'c',content:'hi <@22222222222222222> and <@!11111111111111111>',
        embeds:[{description:'<@33333333333333333>'}],components:[{type:17,components:[{type:10,content:'<@44444444444444444>'}]}]};
    b.dispatcher.dispatch({type:'MESSAGE_CREATE',channelId:'c',message});
    await b.run();
    assert.deepEqual(b.asked,['22222222222222222','33333333333333333','44444444444444444'],'only unknown people, once each');
    const updates=b.dispatched.filter(e=>e.type==='MESSAGE_UPDATE');
    assert.equal(updates.length,2);assert.equal(updates[0].message.content,message.content+'\u200b');
    assert.notEqual(updates[0].message.embeds,message.embeds,'embeds cloned on temp update');
    assert.deepEqual(updates[0].message.embeds,message.embeds);
    assert.equal(updates[1].message.content,message.content);assert.equal(updates[1].message.id,'m1');
    assert.notEqual(updates[1].message.embeds,message.embeds,'embeds cloned on restore');
    assert.notEqual(updates[1].message.components,message.components,'components cloned on restore');
    // Embed-only message (empty content) also clones embeds/components so MessageStore sees a new array reference.
    const embedOnly={id:'m_embed',channel_id:'c',content:'',embeds:[{description:'<@77777777777777777>'}]};
    b.dispatcher.dispatch({type:'MESSAGE_CREATE',channelId:'c',message:embedOnly});
    await b.run();
    const embedUpdate=b.dispatched.filter(e=>e.type==='MESSAGE_UPDATE'&&e.message.id==='m_embed');
    assert.equal(embedUpdate.length,1);
    assert.notEqual(embedUpdate[0].message.embeds,embedOnly.embeds,'embed-only redraw clones embeds array');
    assert.deepEqual(embedUpdate[0].message.embeds,embedOnly.embeds);
    // Its own redraw isn't checked again, and the same people are never asked for twice.
    b.dispatcher.dispatch({type:'LOAD_MESSAGES_SUCCESS',channelId:'c',messages:[{id:'m2',content:'<@22222222222222222>'}]});
    await b.run();assert.equal(b.asked.length,4);
});
test('Fix unknown mentions marks deleted accounts and retries other errors later',async()=>{
    const b=validHarness();
    b.setAnswer(id=>Promise.reject(id==='55555555555555555'?{status:404,body:{code:10013}}:{status:500}));
    b.dispatcher.dispatch({type:'MESSAGE_CREATE',message:{id:'m',channel_id:'c',content:'<@55555555555555555> <@66666666666666666>'}});
    await b.run();
    assert.equal(b.known.get('55555555555555555').username,'Deleted User');
    assert.equal(b.known.has('66666666666666666'),false);
    b.dispatcher.dispatch({type:'MESSAGE_CREATE',message:{id:'n',channel_id:'c',content:'<@66666666666666666>'}});
    await b.run();assert.equal(b.asked.filter(id=>id==='66666666666666666').length,2,'a failed lookup is tried again');
});
test('Fix unknown mentions does nothing while switched off',async()=>{
    const b=validHarness();b.api.setSetting('validUser',false);
    b.dispatcher.dispatch({type:'MESSAGE_CREATE',message:{id:'m',channel_id:'c',content:'<@22222222222222222>'}});
    await b.run();assert.deepEqual(b.asked,[]);
    const off=boot({});const subs=[];off.load({default:{subscribe:t=>subs.push(t),dispatch(){}}},null,585);assert.deepEqual(subs,[]);
});
test('profile bar gets a settings button next to the notifications bell',()=>{
    const b=boot({youBarSettings:true});const {React}=reactHarness(b);React.Fragment='Fragment';
    function YouBarButton(){} function SettingsIcon(){} function SettingsList(props){return {type:SettingsList,props};}
    const opened=[];
    const registryMod={SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route',IconComponent(){}}}};
    const listMod={SettingsList};
    b.context.__r=id=>{
        if (id===14130) return b.load(registryMod,null,14130);
        if (id===14236) return b.load(listMod,null,14236);
        return ({16031:{default:YouBarButton},6799:{SettingsIcon},14615:{YOU_BAR_BUTTON_ICON_SIZE:20},6801:{openUserSettings:options=>opened.push(options)}})[id];
    };
    function Bell(){return 'bell';}
    const memo={$$typeof:Symbol.for('react.memo'),type:Bell,compare:null};
    const exports=b.load({default:memo},null,16032);
    assert.equal(exports.default.$$typeof,Symbol.for('react.memo'));
    const tree=exports.default.type({hasNameplate:true});
    assert.equal(tree.type,'Fragment');assert.equal(tree.props.children[0],'bell');
    const extra=tree.props.children[1];const button=extra.type(extra.props);
    assert.equal(button.type,YouBarButton);assert.equal(button.props.accessibilityLabel,'Venus settings');
    assert.equal(button.props.icon.type,SettingsIcon);assert.equal(button.props.hasNameplate,true);
    // Even on first tap after restart (before Discord Settings was ever opened), openSettings() lazily
    // initializes 14130 (SettingsRendererConfig) and 14236 (SettingListRenderer) so it opens VENUS_PLUGINS
    // directly instead of Discord account settings or a blank black screen (#58).
    assert.equal(b.context.__venusPatches.status.menu,false,'settings menu not yet loaded before first tap');
    button.props.onPress();
    assert.equal(b.context.__venusPatches.status.menu,true,'14130 initialized on first tap (#58)');
    assert.equal(opened.length,1);
    assert.deepEqual(JSON.parse(JSON.stringify(opened[0])),{screen:'VENUS_PLUGINS'},'opens Venus settings on first tap after restart (#58)');
    const pluginsScreen=registryMod.SETTING_RENDERER_CONFIG.VENUS_PLUGINS.screen.getComponent()();
    assert.ok(pluginsScreen && pluginsScreen.type===SettingsList,'VenusSettingsPage renders SettingsList instead of null black screen (#58)');
    b.api.setSetting('youBarSettings',false);assert.equal(extra.type(extra.props),null);
    const again=exports.default.type({});assert.equal(again.type,'Fragment','same shape when off, so the bell never remounts');
});
function splitHarness(premium=false) {
    const b=boot({splitMessages:true});const sent=[];
    const timers=[];b.context.setTimeout=(fn)=>{timers.push(fn);return 1;};
    const run=async()=>{for (let i=0;i<50;i++){await flush();if(!timers.length)break;timers.shift()();}await flush();};
    const constants=b.load({MAX_MESSAGE_LENGTH:2000,MAX_MESSAGE_LENGTH_PREMIUM:4000,OTHER:1},null,1086);
    b.load({default:{getCurrentUser:()=>({id:'me',premiumType:premium?2:0}),getUser(){}}},null,1378);
    b.load({default:{getChannel:()=>({id:'c',rateLimitPerUser:0})}},null,2051);
    const actions=b.load({default:{sendMessage(channel,message,a,b2){sent.push([channel,message,a,b2]);return Promise.resolve();}}},null,6880).default;
    const length=b.load({default:()=>premium?4000:2000,getMaxMessageLength:()=>premium?4000:2000},null,8602);
    return {...b,sent,actions,constants,length,run};
}
test('long messages are split into parts within the limit, code blocks kept closed',async()=>{
    const b=splitHarness();
    assert.equal(b.length.getMaxMessageLength(),1<<30);assert.equal(b.constants.MAX_MESSAGE_LENGTH,1<<30);assert.equal(b.constants.OTHER,1);
    const lines=Array.from({length:300},(_,i)=>'line number '+i+' with some words');
    const content=lines.slice(0,100).join('\n')+'\n```js\n'+lines.slice(100).join('\n')+'\n```';
    b.actions.sendMessage('c',{content,tts:false,invalidEmojis:[]},true,{messageReference:{message_id:'r'}});
    await b.run();
    assert.ok(b.sent.length>=4,'several parts: '+b.sent.length);
    for (const [,message] of b.sent) { assert.ok(message.content.length<=2000,'part too long: '+message.content.length);
        assert.equal((message.content.match(/```/g)||[]).length%2,0,'code block left open'); }
    assert.equal(b.sent[0][3].messageReference.message_id,'r','the reply stays on the first part');
    assert.equal(JSON.stringify(b.sent[1][3]),'{}');
    const joined=b.sent.map(([,m])=>m.content).join('\n').replace(/\n```\n```js\n/g,'\n');
    for (const line of lines) assert.ok(joined.includes(line),'lost: '+line);
});
test('short messages, premium limits and the off switch are left alone',async()=>{
    const b=splitHarness(true);const msg={content:'x'.repeat(3500)};
    b.actions.sendMessage('c',msg);await b.run();assert.equal(b.sent.length,1);assert.equal(b.sent[0][1],msg);
    b.api.setSetting('splitMessages',false);
    assert.equal(b.length.getMaxMessageLength(),4000);
    assert.equal(b.constants.MAX_MESSAGE_LENGTH,1<<30,'Constants (1086) keeps SPLIT_UNLIMITED while features.splitMessages is built in so DraftStore (5201) never truncates drafts at startup');
    const big={content:'y '.repeat(5000)};b.actions.sendMessage('c',big);await b.run();assert.equal(b.sent.at(-1)[1],big);
    const off=boot({});const stock={MAX_MESSAGE_LENGTH:2000};assert.equal(off.load(stock,null,1086).MAX_MESSAGE_LENGTH,2000);
});
test('Send long messages: restores real limit when 8602 captured SPLIT_UNLIMITED at startup, preserves tts/flags/allowedMentions, bypasses slowmode when permitted, and stops on error or toggle off',async()=>{
    const b=boot({splitMessages:true});
    // Simulate startup before venus-patches.json finishes loading: features.splitMessages is true, but settings.splitMessages is still false when 1086 and 8602 load!
    b.api.setSetting('splitMessages',false);
    const constants=b.load({MAX_MESSAGE_LENGTH:2000,MAX_MESSAGE_LENGTH_PREMIUM:4000},null,1086);
    assert.equal(constants.MAX_MESSAGE_LENGTH,1<<30,'DraftStore and 8602 capture SPLIT_UNLIMITED even before settings finish loading');
    let isPremium=false;
    b.load({default:{getCurrentUser:()=>({id:'me',premiumType:isPremium?2:0}),getUser(){}}},null,1378);
    // 8602 captures constants.MAX_MESSAGE_LENGTH / MAX_MESSAGE_LENGTH_PREMIUM in its closure at factory time:
    const capturedNormal=constants.MAX_MESSAGE_LENGTH, capturedPremium=constants.MAX_MESSAGE_LENGTH_PREMIUM;
    const length=b.load({default:()=>isPremium?capturedPremium:capturedNormal,getMaxMessageLength:()=>isPremium?capturedPremium:capturedNormal},null,8602);
    assert.equal(length.getMaxMessageLength(),2000,'returns real 2000 limit when splitMessages setting is off even though 8602 captured SPLIT_UNLIMITED');
    isPremium=true;
    assert.equal(length.getMaxMessageLength(),4000,'returns real 4000 premium limit when splitMessages setting is off');
    isPremium=false;
    b.api.setSetting('splitMessages',true);
    assert.equal(length.getMaxMessageLength(),1<<30,'returns SPLIT_UNLIMITED once splitMessages is enabled');

    // Verify slowmode bypass, preserved options/tts, scheduledTimestamp guard, and failure/cancellation abort:
    const waits=[];const timers=[];
    b.context.setTimeout=(fn,ms)=>{waits.push(ms);timers.push(fn);return timers.length;};
    const run=async()=>{for (let i=0;i<50;i++){await flush();if(!timers.length)break;timers.shift()();}await flush();};
    b.load({default:{getChannel:()=>null,getBasicChannel:id=>id==='slow'?{id:'slow',rateLimitPerUser:30}:null}},null,2051);
    let canBypass=true;
    b.context.__r=id=>id===7105?{canBypassSlowmode:()=>canBypass}:null;
    const sent=[];let failFirst=false;
    const actions=b.load({default:{sendMessage(ch,msg,wait,opts){
        sent.push([ch,msg,wait,opts]);
        return Promise.resolve(failFirst && sent.length===1 ? {ok:false,hasErr:true} : {ok:true,hasErr:false});
    }}},null,6880).default;

    const longText='a'.repeat(1500)+'\n'+'b'.repeat(1500);
    // 1. Scheduled messages are not split:
    actions.sendMessage('slow',{content:longText,tts:true},true,{scheduledTimestamp:123456789});
    await run();
    assert.equal(sent.length,1,'scheduled messages are never split into immediate follow-ups');
    sent.length=0;waits.length=0;

    // 2. Slowmode bypassed when user has BYPASS_SLOWMODE, and tts/waitForReady/flags/allowedMentions/location preserved:
    actions.sendMessage('slow',{content:longText,tts:true,invalidEmojis:['e1'],validNonShortcutEmojis:['e2']},false,
        {location:'chat_input',flags:4096,allowedMentions:{parse:[]},eagerDispatch:false,doNotNotifyOnError:true,messageReference:{message_id:'r1'}});
    await run();
    assert.equal(sent.length,2);
    assert.equal(waits[0],1000,'uses 1000ms gap instead of 30500ms when canBypassSlowmode is true');
    assert.equal(sent[1][1].tts,true,'preserves tts on follow-up chunks');
    assert.equal(sent[1][2],false,'preserves waitForReady on follow-up chunks');
    assert.deepEqual(JSON.parse(JSON.stringify(sent[1][3])),{location:'chat_input',flags:4096,allowedMentions:{parse:[]},eagerDispatch:false,doNotNotifyOnError:true},
        'preserves flags, allowedMentions, location, eagerDispatch, and doNotNotifyOnError while stripping messageReference');
    sent.length=0;waits.length=0;

    // 3. When canBypassSlowmode is false, uses slowmode delay (even from basic channel record):
    canBypass=false;
    actions.sendMessage('slow',{content:longText,tts:false},true,{});
    await run();
    assert.equal(waits[0],30500,'respects rateLimitPerUser from basic channel record when not bypassing slowmode');
    sent.length=0;waits.length=0;

    // 4. If chunk 1 resolves with {hasErr: true}, follow-up chunks abort:
    failFirst=true;
    actions.sendMessage('slow',{content:longText,tts:false},true,{});
    await run();
    assert.equal(sent.length,1,'aborts follow-up chunks when chunk 1 fails with hasErr: true');
});
test('the three new switches sit in their groups',()=>{
    const rows=Object.fromEntries(settingsRows(settingsHarness()));
    assert.ok(rows.Sending.includes('Send long messages'));
    assert.ok(rows.People.includes('Fix unknown mentions'));
    assert.ok(rows.Appearance.includes('Venus button on profile bar'));
});

// Translate messages: a fake Google Translate, a Flux dispatcher that records redraws, and the row generator.
function translateHarness({answer, locale='en-US', system='de-DE', on=true}={}) {
    const b=boot({translate:true});const {React}=reactHarness(b);
    const timers=[];b.context.setTimeout=(fn,ms)=>{timers.push(fn);return timers.length;};b.context.clearTimeout=()=>{};
    const requests=[];
    // Google's batch answer: one [text, language] pair per q=.
    let reply=answer || (texts=>texts.map(t=>[t.replace(/hola/g,'hello').replace(/perro/g,'dog').replace(/amigo/g,'friend'),'es']));
    b.context.fetch=async(url,options)=>{
        const texts=options.body.split('&').map(p=>decodeURIComponent(p.slice(2)));requests.push({url,texts,options});
        const result=reply(texts,url);
        if (result && result.status) return {ok:false,status:result.status,json:async()=>({})};
        return {ok:true,status:200,json:async()=>result};
    };
    b.load({default:{getCurrentUser:()=>({id:'me'}),getUser(){}}},null,1378);
    const localeStore={locale,systemLocale:system,listeners:[],addChangeListener(fn){this.listeners.push(fn);}};
    b.load({default:localeStore},null,2115);
    const dispatched=[];const subs={};
    b.load({default:{dispatch(e){dispatched.push(e);},subscribe(t,fn){(subs[t]||(subs[t]=[])).push(fn);}}},null,585);
    class Rows{generate(row){return row.result;}}b.load({default:Rows},null,7378);
    // Switching on asks for a redraw a moment later: let that happen before the test's messages exist.
    if (on) { b.api.setSetting('translate',true); while (timers.length) timers.shift()(); }
    const run=async()=>{for (let i=0;i<40;i++){await flush();if(!timers.length)break;timers.shift()();}await flush();await flush();};
    const row=(id,content,raw,author='them')=>new Rows().generate({rowType:1,message:{id,channel_id:'c',content:raw,author:{id:author}},
        result:{message:{id,channelId:'c',authorId:author,content}}}).message;
    return {...b,React,Rows,localeStore,requests,dispatched,subs,run,row,timers,setReply:fn=>{reply=fn;}};
}
const T=text=>({type:'text',content:text});
test('Translate messages translates other languages in batches and keeps mentions, emojis and formatting',async()=>{
    const b=translateHarness();
    const mention={type:'mention',userId:'1',content:[T('@Ana')]};const emoji={type:'customEmoji',id:'9',name:'wave'};
    const first=[T('hola '),mention,T(', mi '),{type:'strong',content:[T('perro')]},T(' '),emoji];
    assert.equal(b.row('1',first,'hola <@1>, mi **perro** <:wave:9>').content,first,'original until the translation arrives');
    b.row('2',[T('hola amigo')],'hola amigo');
    await b.run();
    assert.equal(b.requests.length,1,'both messages in one request');
    assert.match(b.requests[0].url,/^https:\/\/translate\.googleapis\.com\/translate_a\/t\?client=dict-chrome-ex&sl=auto&tl=en$/);
    assert.equal(b.requests[0].options.credentials,'omit');
    assert.deepEqual(b.requests[0].texts,['hola amigo','hola <a i=0/>, mi <g i=1>perro</g> <a i=2/>'],'newest first');
    // Each translated message is redrawn once, with a zero-width space that is then taken out again.
    const updates=b.dispatched.filter(e=>e.type==='MESSAGE_UPDATE');
    assert.deepEqual(updates.map(e=>e.message.content),['hola amigo\u200b','hola <@1>, mi **perro** <:wave:9>\u200b','hola amigo','hola <@1>, mi **perro** <:wave:9>']);
    const shown=b.row('1',first,'hola <@1>, mi **perro** <:wave:9>').content;
    assert.equal(shown[1],mention,'the very same mention node');assert.equal(shown[5],emoji);
    assert.deepEqual(JSON.parse(JSON.stringify(shown.slice(0,5))),[T('hello '),{type:'mention',userId:'1',content:[T('@Ana')]},T(', mi '),{type:'strong',content:[T('dog')]},T(' ')]);
    assert.equal(shown.at(-1).type,'subtext');assert.equal(shown.at(-1).content[0].content,'Translated from Spanish');
    assert.equal(b.row('1',first,'hola <@1>, mi **perro** <:wave:9>').content,shown,'built once, reused on every render');
    // The redraw's zero-width space never asks for a new translation.
    b.row('1',[T('hola '),mention,T(', mi '),{type:'strong',content:[T('perro')]},T(' \u200b'),emoji],'x');await b.run();
    assert.equal(b.requests.length,1);
});
test('Translate messages leaves your own messages, your language, short text and broken answers alone',async()=>{
    const b=translateHarness({answer:texts=>texts.map(t=>t==='good morning everyone'?[t,'en']:t.startsWith('bonjour')?['hello <a i=0/> <a i=0/>','fr']:[t.toUpperCase(),'es'])});
    b.row('1',[T('hola amigo')],'hola amigo','me');
    b.row('2',[T('ok'),{type:'emoji',name:'x'}],'ok :x:');
    b.row('3',[T('good morning everyone')],'good morning everyone');
    const broken=[T('bonjour '),{type:'mention',userId:'5'}];b.row('4',broken,'bonjour <@5>');
    await b.run();
    assert.deepEqual(b.requests.flatMap(r=>r.texts).sort(),['bonjour <a i=0/>','good morning everyone'],'own messages and "ok" are never sent');
    assert.equal(b.row('3',[T('good morning everyone')],'good morning everyone').content.length,1,'already English');
    assert.equal(b.row('4',broken,'bonjour <@5>').content,broken,'a doubled mention means the original is shown');
    assert.equal(b.dispatched.filter(e=>e.type==='MESSAGE_UPDATE').length,0,'nothing changed, so nothing is redrawn');
    b.row('3',[T('good morning everyone')],'good morning everyone');await b.run();assert.equal(b.requests.length,1,'never asked again');
});
test('Translate messages follows Discord\'s or the phone\'s language, and the note and original options',async()=>{
    const b=translateHarness({locale:'zh-TW',system:'pt-BR'});
    b.row('1',[T('hola amigo')],'hola amigo');await b.run();
    assert.match(b.requests[0].url,/tl=zh-TW$/);
    b.dispatched.length=0;
    b.localeStore.locale='fr-FR';b.localeStore.listeners.forEach(fn=>fn());await b.run();
    assert.ok(b.dispatched.some(e=>e.type==='MESSAGE_UPDATE'&&e.message.id==='1'),'changing Discord\'s language redraws messages when Translate into is Discord\'s language');
    b.row('1',[T('hola amigo')],'hola amigo');await b.run();assert.match(b.requests.at(-1).url,/tl=fr$/);
    b.api.setSetting('translateTarget','phone');assert.equal(b.api.settings.translateTarget,'phone');
    assert.equal(b.api.setSetting('translateTarget','klingon'),false);
    await b.run();
    b.row('1',[T('hola amigo')],'hola amigo');await b.run();assert.match(b.requests.at(-1).url,/tl=pt$/);
    b.api.setSetting('translateNote',false);await b.run();
    assert.deepEqual(JSON.parse(JSON.stringify(b.row('1',[T('hola amigo')],'hola amigo').content)),[T('hello friend')],'no note');
    b.api.setSetting('translateOriginal',true);await b.run();
    const content=b.row('1',[T('hola amigo')],'hola amigo').content;
    assert.equal(content.at(-2).content[0].content,'Translated from Spanish. Original:');
    assert.deepEqual(JSON.parse(JSON.stringify(content.at(-1))),{type:'blockQuote',content:[T('hola amigo')]});
});
test('Translate messages waits and tries the other server when Google says to slow down',async()=>{
    let calls=0;const b=translateHarness({answer:(texts,url)=>(++calls===1?{status:429}:texts.map(t=>['hello friend','es']))});
    b.row('1',[T('hola amigo')],'hola amigo');await b.run();
    assert.equal(b.requests.length,2);
    assert.match(b.requests[0].url,/^https:\/\/translate\.googleapis\.com\//);assert.match(b.requests[1].url,/^https:\/\/clients5\.google\.com\//);
    assert.equal(JSON.stringify(b.row('1',[T('hola amigo')],'hola amigo').content[0]),JSON.stringify(T('hello friend')));
});
test('Translate messages starts off, sends nothing while off and redraws when switched on or off',async()=>{
    const b=translateHarness({on:false});
    assert.equal(b.api.settings.translate,false,'starts off');
    const content=[T('hola amigo')];
    assert.equal(b.row('1',content,'hola amigo').content,content);await b.run();assert.equal(b.requests.length,0);
    b.api.setSetting('translate',true);await b.run();
    assert.deepEqual(b.dispatched.filter(e=>e.type==='MESSAGE_UPDATE').map(e=>e.message.content),['hola amigo\u200b','hola amigo'],'switching on redraws what was on screen');
    b.row('1',content,'hola amigo');await b.run();assert.equal(b.requests.length,1);
    b.api.setSetting('translate',false);await b.run();
    assert.equal(b.row('1',content,'hola amigo').content,content,'switched off: the original again');
    const off=boot({});const unpatched=[];off.load({default:{dispatch(){},subscribe:t=>unpatched.push(t)}},null,585);assert.deepEqual(unpatched,[]);
});
test('Translate messages has a settings row with its own page in Messages',()=>{
    const b=settingsHarness();const rows=Object.fromEntries(settingsRows(b));
    assert.ok(rows.Messages.includes('Translate messages'));
    assert.equal(b.registry.VENUS_TRANSLATE.useTitle(),'Translate messages');
});
test('Pastelize colors the text of the message a reply quotes when Color message text is on (#45)',()=>{
    const b=boot(allFeatures);const {RN}=reactHarness(b);RN.processColor=hex=>parseInt(hex.slice(1),16)|0xff000000;
    b.load(seed=>Array.from(seed).reduce((a,c)=>a+c.charCodeAt(0),0),null,1252);
    class Rows{generate(row){return row.result;}}b.load({default:Rows},null,7378);const rows=new Rows();
    // Discord gives every message, quoted ones too, its theme text color.
    const quoted={authorId:'111',username:'Ana',roleColor:null,textColor:-1,content:[{type:'text',content:'Hi'}]};
    const row={rowType:1,message:{},result:{message:{authorId:'222',username:'Bo',roleColor:null,textColor:-1,content:[],referencedMessage:{state:'LOADED',message:quoted}}}};
    let reply=rows.generate(row).message.referencedMessage.message;
    assert.equal('textColor' in reply,false,'off: the preview keeps Discord\'s own reply color');
    assert.equal(typeof reply.roleColor,'number','the quoted name is still pastel');
    b.api.setSetting('pastelContent',true);
    const shown=rows.generate(row).message;reply=shown.referencedMessage.message;
    assert.equal(typeof reply.textColor,'number');assert.notEqual(reply.textColor,-1);
    assert.equal(reply.textColor,rows.generate({...row,result:{message:{...quoted}}}).message.textColor,'the same color as that person\'s own messages');
    assert.notEqual(shown.textColor,reply.textColor,'each person keeps their own color');
    assert.equal(quoted.textColor,-1,'Discord\'s record is never changed');
    b.api.setSetting('pastelize',false);
    reply=rows.generate(row).message.referencedMessage.message;
    assert.equal('textColor' in reply,false,'switched off: Discord\'s reply color again');assert.equal(reply.roleColor,null);
});
test('every feature starts off, and its options keep their own defaults',()=>{
    const b=boot(allFeatures,true,false);const s=b.api.settings;
    for (const key of Object.keys(allFeatures)) if (key in s) assert.equal(s[key],false,key+' starts off');
    for (const key of ['emojis','stickers','hyperlinks','noDeleteEdits','piDmHeader','piUserList','piProfile','reviewWarning','questsVideo','gestureTripleDelete','translateNote'])
        assert.equal(s[key],true,key+' is on once its feature is');
});
// The translator, three requests at a time and saving what it translated, against a fake Google and a fake phone.
function fastHarness({answer, disk=null, files={}}={}) {
    const b=boot({translate:true});reactHarness(b);
    const timers=[];b.context.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};b.context.clearTimeout=()=>{};
    const requests=[], pending=[];let saved=disk;const writes=[];
    b.context.fetch=(url,options)=>new Promise((resolve,reject)=>{
        const texts=options.body.split('&').map(p=>decodeURIComponent(p.slice(2)));const request={url,texts,resolve,reject};requests.push(request);
        const reply=answer&&answer(request,requests.length);
        if (reply==='hang') return pending.push(request);
        if (reply&&reply.status) return resolve({ok:false,status:reply.status,json:async()=>({})});
        resolve({ok:true,status:200,json:async()=>texts.map(t=>[t.replace(/hola/g,'hello').replace(/amigo/g,'friend'),'es'])});
    });
    b.load({default:native({fileExists:async p=>p.endsWith('venus-translations.json')&&saved!==null,readFile:async p=>p.endsWith('venus-translations.json')?saved:'{}',
        writeFile:async(dir,name,text)=>{writes.push(name);if(name==='venus-translations.json')saved=text;},...files})});
    b.load({default:{getCurrentUser:()=>({id:'me'}),getUser(){}}},null,1378);
    b.load({default:{locale:'en-US',systemLocale:'en-US'}},null,2115);
    const dispatched=[];b.load({default:{dispatch(e){dispatched.push(e);},subscribe(){}}},null,585);
    class Rows{generate(row){return row.result;}}b.load({default:Rows},null,7378);
    const run=async(rounds=60)=>{for (let i=0;i<rounds;i++){await flush();if(!timers.length)break;timers.shift().fn();}await flush();await flush();};
    const row=(id,text)=>new Rows().generate({rowType:1,message:{id,channel_id:'c',content:text,author:{id:'them'}},
        result:{message:{id,channelId:'c',authorId:'them',content:[{type:'text',content:text}]}}}).message.content;
    return {...b,requests,pending,run,row,timers,dispatched,writes,getDisk:()=>saved};
}
test('Translate messages sends up to three requests at once and a slow one never holds up the rest',async()=>{
    const b=fastHarness({answer:(request,n)=>n===1?'hang':null});
    await flush();await flush();b.api.setSetting('translate',true);await b.run(5);
    // 200 messages: 5 batches of 40, never more than three in flight while the first hangs.
    for (let i=0;i<200;i++) b.row('m'+i,'hola amigo numero '+i);
    await b.run();
    assert.ok(b.requests.length>=4,'kept going past the stuck request: '+b.requests.length);
    assert.ok(b.requests.every(r=>r.texts.length<=40));
    assert.equal(JSON.stringify(b.row('m199','hola amigo numero 199')[0]),JSON.stringify({type:'text',content:'hello friend numero 199'}),'newest translated first, without waiting for the stuck one');
});
test('Translate messages tries the other server at once after a timeout and does not give up',async()=>{
    const b=fastHarness({answer:(request,n)=>n===1?{status:503}:null});
    await flush();await flush();b.api.setSetting('translate',true);await b.run(5);
    b.row('1','hola amigo');await b.run();
    assert.equal(b.requests.length,2);assert.match(b.requests[1].url,/clients5\.google\.com/);
    const waits=b.timers.map(t=>t.ms);assert.ok(!waits.some(ms=>ms>=15000),'a network error waits a moment, not 15 seconds');
    assert.equal(b.row('1','hola amigo')[0].content,'hello friend');
});
test('Translate messages keeps translations on the phone, so a chat opened after a restart shows them at once',async()=>{
    const first=fastHarness();await flush();await flush();first.api.setSetting('translate',true);await first.run(5);
    first.row('1','hola amigo');await first.run();assert.equal(first.requests.length,1);
    const disk=first.getDisk();assert.ok(disk,'saved');const saved=JSON.parse(disk);assert.deepEqual(saved.entries,[['en','hola amigo','hello friend','es']]);
    const again=fastHarness({disk});await flush();await flush();again.api.setSetting('translate',true);await again.run(5);
    assert.equal(again.row('1','hola amigo')[0].content,'hello friend','straight from the phone');await again.run();
    assert.equal(again.requests.length,0,'nothing sent to Google again');
    const broken=fastHarness({disk:'{not json'});await flush();await flush();broken.api.setSetting('translate',true);await broken.run(5);
    broken.row('1','hola amigo');await broken.run();assert.equal(broken.requests.length,1,'a damaged file is ignored');
});
// ---- 1.10.0 settings overhaul ----
function pageNodes(tree){const out=[];(function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n))return n.forEach(walk);out.push(n);walk(n.props&&n.props.children);})(tree);return out;}
test('Clear kept messages removes kept deletions from chat and the saved file, after asking',async()=>{
    const b=deletionHarness();const {RN}=reactHarness(b);const alerts=[];RN.Alert={alert:(...args)=>alerts.push(args)};
    b.context.__r=id=>({5916:{TableRow:'Row'}}[id]||null);
    const registry=b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route',IconComponent(){}}}},null,14130).SETTING_RENDERER_CONFIG;
    b.api.setSetting('noDelete',true);
    const page=()=>registry.VENUS_NODELETE.screen.getComponent()();
    const clear=()=>pageNodes(page()).find(n=>n.type==='Row'&&n.props.label==='Clear kept messages');
    assert.equal(clear().props.disabled,true,'nothing to clear yet');
    b.messages.set('c:1',{content:'one',state:'SENT'});b.messages.set('c:2',{content:'two',state:'SENT'});
    b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'2'});
    assert.equal(b.messages.size,2,'kept');
    assert.ok(pageNodes(page()).some(n=>typeof n.props.children==='string'&&/^2 deleted messages and 0 edited messages kept/.test(n.props.children)));
    const row=clear();assert.equal(row.props.disabled,false);assert.equal(row.props.variant,'danger');
    row.props.onPress();assert.equal(alerts.length,1);assert.equal(alerts[0][0],'Clear kept messages?');assert.equal(b.messages.size,2,'nothing removed before confirming');
    alerts[0][2].find(button=>button.text==='Clear').onPress();
    assert.equal(b.messages.size,0,'gone from chat');assert.equal(b.events.at(-1).type,'MESSAGE_DELETE_BULK');
    b.dispatch.dispatch({type:'MESSAGE_DELETE',channelId:'c',id:'1'});assert.equal(b.messages.size,0,'and not kept again');
    assert.equal(clear().props.disabled,true);
});
test('Clear saved translations forgets them on the phone and translates the screen again',async()=>{
    const b=fastHarness();const {RN}=reactHarness(b);const alerts=[];RN.Alert={alert:(...args)=>alerts.push(args)};
    b.context.__r=id=>({5916:{TableRow:'Row'}}[id]||null);
    const registry=b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route',IconComponent(){}}}},null,14130).SETTING_RENDERER_CONFIG;
    const clear=()=>pageNodes(registry.VENUS_TRANSLATE.screen.getComponent()()).find(n=>n.type==='Row'&&n.props.label==='Clear saved translations');
    assert.equal(clear().props.disabled,true);assert.equal(clear().props.subLabel,'Nothing saved yet.');
    await flush();await flush();b.api.setSetting('translate',true);await b.run(5);
    b.row('1','hola amigo');await b.run();
    assert.match(clear().props.subLabel,/^1 translation kept on this phone/);
    clear().props.onPress();alerts[0][2].find(button=>button.text==='Clear').onPress();await flush();await flush();
    assert.equal(b.getDisk(),'{"version":1,"entries":[]}','the saved file is emptied');
    const before=b.requests.length;b.row('1','hola amigo');await b.run();assert.equal(b.requests.length,before+1,'translated again');
});
test('choice pages use Discord\'s radio list: tap gestures, Read all and Translate',()=>{
    const b=settingsHarness();function TableRadioGroup(){} function TableRadioRow(){}
    b.context.__r=id=>({5995:{TableRadioGroup},5994:{TableRadioRow}}[id]||null);
    const radios=key=>pageNodes(b.registry[key].screen.getComponent()()).filter(n=>n.type===TableRadioGroup);
    const [own]=radios('VENUS_GESTURES');assert.equal(own.props.title,'Double-tap your own message');assert.equal(own.props.value,'edit');
    own.props.onChange('reply');assert.equal(b.api.settings.gestureOwn,'reply');
    assert.equal(radios('VENUS_READALL')[0].props.title,'When you tap Read all');
    const [mode,target]=radios('VENUS_TRANSLATE');assert.equal(mode.props.title,'When to translate');assert.equal(mode.props.value,'auto');
    mode.props.onChange('manual');assert.equal(b.api.settings.translateMode,'manual');assert.equal(target.props.title,'Translate into');target.props.onChange('phone');assert.equal(b.api.settings.translateTarget,'phone');
});
// ---- Quoted replies (#51), translating single messages (#50) and the settings language ----
function replyRow(b, quoted) {
    return new b.Rows().generate({rowType:1,message:{id:'r1',channel_id:'c',content:'ok',author:{id:'them'},messageReference:{message_id:quoted.id}},
        result:{message:{id:'r1',channelId:'c',authorId:'them',content:[T('ok')],referencedMessage:{state:'LOADED',message:quoted}}}}).message;
}
test('a reply shows the message it quotes translated, like that message in chat (#51)',async()=>{
    const b=translateHarness();
    const quoted={id:'q1',authorId:'them',content:[T('hola amigo')]};
    assert.equal(replyRow(b,quoted).referencedMessage.message.content,quoted.content,'as written until it is translated');
    await b.run();
    assert.equal(b.requests.length,1);assert.deepEqual(b.requests[0].texts,['hola amigo'],'the quote is asked for, once');
    assert.ok(b.dispatched.some(e=>e.type==='MESSAGE_UPDATE'&&e.message.id==='r1'),'the reply is redrawn when its quote is translated');
    const shown=replyRow(b,quoted).referencedMessage.message;
    assert.deepEqual(JSON.parse(JSON.stringify(shown.content)),[T('hello friend')],'translated, without the note');
    assert.equal(quoted.content[0].content,'hola amigo','Discord\'s record is never changed');
    // The quoted message itself in chat shares the same translation: no second request.
    b.row('q1',[T('hola amigo')],'hola amigo');await b.run();assert.equal(b.requests.length,1);
    // Your own quoted message stays as you wrote it.
    const mine={id:'q2',authorId:'me',content:[T('hola perro')]};replyRow(b,mine);await b.run();
    assert.equal(b.requests.length,1,'own messages are never sent');
    // Switching off or toggling a quoted message redraws the reply even when the reply itself is your own message or in your language.
    const b2=translateHarness({answer:texts=>texts.map(t=>t==='good morning everyone'?[t,'en']:[t.replace(/hola/g,'hello').replace(/amigo/g,'friend'),'es'])});
    const englishReply=(id,author,q)=>new b2.Rows().generate({rowType:1,message:{id,channel_id:'c',content:'good morning everyone',author:{id:author},messageReference:{message_id:q.id}},
        result:{message:{id,channelId:'c',authorId:author,content:[T('good morning everyone')],referencedMessage:{state:'LOADED',message:q}}}}).message;
    englishReply('r-en','them',quoted);
    englishReply('r-me','me',quoted);
    await b2.run();
    b2.dispatched.length=0;
    b2.api.setSetting('translate',false);await b2.run();
    const redrawnOff=new Set(b2.dispatched.filter(e=>e.type==='MESSAGE_UPDATE').map(e=>e.message.id));
    assert.ok(redrawnOff.has('r-en'),'English reply quoting a translated message is redrawn when switched off');
    assert.ok(redrawnOff.has('r-me'),'own reply quoting a translated message is redrawn when switched off');
    // Manual mode: holding the quoted message and tapping Translate redraws the reply that quotes it.
    b2.api.setSetting('translate',true);b2.api.setSetting('translateMode','manual');await b2.run();
    const unquoted={id:'q3',authorId:'them',content:[T('hola amigo')]};
    englishReply('r-man','me',unquoted);
    b2.dispatched.length=0;
    const sheet=b2.load({default(props){return {type:'Sheet',props:{children:[{type:'Row',key:'copy',props:{label:'Copy Text',onPress(){}}}]}};}},null,11023);
    sheet.default({message:{id:'q3',channel_id:'c',content:'hola amigo',author:{id:'them'}}}).props.children[1].props.onPress();
    assert.ok(b2.dispatched.some(e=>e.type==='MESSAGE_UPDATE'&&e.message.id==='r-man'),'toggling a quoted message in manual mode redraws the reply');
});
test('Only when you ask: nothing is sent until you tap Translate in the hold menu, and Show original undoes it (#50)',async()=>{
    const b=translateHarness();b.api.setSetting('translateMode','manual');await b.run();
    const content=[T('hola amigo')];
    assert.equal(b.row('1',content,'hola amigo').content,content);await b.run();
    assert.equal(b.requests.length,0,'manual: nothing sent');
    // The hold menu (LongPressMessageActionSheet 11023) gets a Translate row next to Discord's own.
    const own={label:'Copy Text',onPress(){},icon:{props:{IconComponent(){}}}};
    const sheet=b.load({default(props){return {type:'Sheet',props:{children:[{type:'Row',key:'copy',props:own}]}};}},null,11023);
    const message={id:'1',channel_id:'c',content:'hola amigo',author:{id:'them'}};
    const rowsOf=tree=>tree.props.children.map(child=>child.props.label);
    let tree=sheet.default({message});assert.deepEqual(rowsOf(tree),['Copy Text','Translate']);
    tree.props.children[1].props.onPress();
    // Discord draws the row again after the redraw.
    b.row('1',content,'hola amigo');await b.run();
    assert.equal(b.requests.length,1,'only the message you picked is sent');
    assert.deepEqual(JSON.parse(JSON.stringify(b.row('1',content,'hola amigo').content[0])),T('hello friend'));
    tree=sheet.default({message});assert.equal(tree.props.children[1].props.label,'Show original');
    tree.props.children[1].props.onPress();await b.run();
    assert.equal(b.row('1',content,'hola amigo').content,content,'back to the original');
    // Automatic mode: Show original keeps one message as written, the rest stay translated.
    b.api.setSetting('translateMode','auto');await b.run();
    b.row('2',[T('hola perro')],'hola perro');await b.run();
    const message2={id:'2',channel_id:'c',content:'hola perro',author:{id:'them'}};
    tree=sheet.default({message:message2});assert.equal(tree.props.children[1].props.label,'Show original');
    tree.props.children[1].props.onPress();await b.run();
    assert.equal(b.row('2',[T('hola perro')],'hola perro').content[0].content,'hola perro');
    assert.equal(b.api.setSetting('translateMode','sometimes'),false);
    // Switched off: the hold menu is Discord's own.
    b.api.setSetting('translate',false);assert.deepEqual(rowsOf(sheet.default({message})),['Copy Text']);
});
test('your own message can be translated from the hold menu, and a message in your language says so',async()=>{
    const b=translateHarness({answer:texts=>texts.map(t=>t==='good morning everyone'?[t,'en']:[t.replace(/hola/g,'hello'),'es'])});
    const toasts=[];b.context.__r=id=>id===4531?{default:{open:t=>toasts.push(t.content)}}:null;
    const sheet=b.load({default(props){return {type:'Sheet',props:{children:[{type:'Row',props:{label:'Copy Text',onPress(){}}}]}};}},null,11023);
    const label=message=>sheet.default({message}).props.children[1].props.label;
    const mine={id:'m',channel_id:'c',content:'hola',author:{id:'me'}};
    assert.equal(label(mine),'Translate','your own message starts as written');
    sheet.default({message:mine}).props.children[1].props.onPress();
    b.row('m',[T('hola amigo')],'hola amigo','me');await b.run();assert.equal(b.requests.length,1);
    const english={id:'e',channel_id:'c',content:'good morning everyone',author:{id:'them'}};
    b.api.setSetting('translateMode','manual');await b.run();
    sheet.default({message:english}).props.children[1].props.onPress();
    b.row('e',[T('good morning everyone')],'good morning everyone');await b.run();
    b.row('e',[T('good morning everyone')],'good morning everyone');await b.run();
    assert.deepEqual(toasts,['This message is already in your language']);
    // Forwarded messages (messageSnapshots with outer content === "") show Translate in the hold menu and redraw via message_snapshots.
    b.api.setSetting('translateMode','auto');await b.run();
    const forwarded={id:'f1',channel_id:'c',content:'',author:{id:'them'},messageSnapshots:[{message:{content:'hola amigo',timestamp:'2026-01-01T00:00:00.000Z'},moderatorReport:null}],
        getContentMessage(){return this.messageSnapshots[0].message;}};
    const forwardRow=()=>new b.Rows().generate({rowType:1,message:forwarded,result:{message:{id:'f1',channelId:'c',authorId:'them',content:[T('hola amigo')]}}}).message;
    assert.equal(label(forwarded),'Show original','forwarded message with inner text gets hold menu item');
    assert.equal(forwardRow().content[0].content,'hello amigo','forwarded message is translated');
    b.dispatched.length=0;
    sheet.default({message:forwarded}).props.children[1].props.onPress();await b.run();
    const snapUpdates=b.dispatched.filter(e=>e.type==='MESSAGE_UPDATE'&&e.message.id==='f1');
    assert.equal(snapUpdates.length,2,'forwarded message is redrawn via MESSAGE_UPDATE');
    assert.equal(snapUpdates[0].message.message_snapshots[0].message.content,'hola amigo\u200b');
    assert.equal(snapUpdates[1].message.message_snapshots[0].message.content,'hola amigo');
    assert.equal('content' in snapUpdates[0].message,false,'outer empty content is never overwritten with a zero-width space');
    assert.equal(forwardRow().content[0].content,'hola amigo','Show original restores forwarded message');
});
function languageHarness({locale='en-US', packs={}}={}) {
    const b=settingsHarness();const reads=[];
    const timers=[];b.context.setTimeout=(fn)=>{timers.push(fn);return timers.length;};
    b.load({default:native({readAsset:async(uri,encoding)=>{reads.push([uri,encoding]);const code=uri.split(':')[1];
        if (!packs[code]) throw new Error('missing');return JSON.stringify({code,strings:packs[code]});}})});
    const store={locale,listeners:[],addChangeListener(fn){this.listeners.push(fn);}};b.load({default:store},null,2115);
    const run=async()=>{for (let i=0;i<10;i++){await flush();while (timers.length) timers.shift()();}};
    return {...b,reads,store,run};
}
const RU={'Features':'Функции','Language':'Язык','Keep deleted messages':'Сохранять удалённые сообщения','Cancel':'Отмена',
    '{n} translations':{one:'{n} перевод',few:'{n} перевода',many:'{n} переводов',other:'{n} переводов'},'{n} translation':'{n} перевод',
    '{on} of {total} features on. Turn them on or off in Features.':'Включено {on} из {total}.'};
test('Venus settings follow Discord\'s language, and Language picks another one',async()=>{
    const b=languageHarness({locale:'ru',packs:{ru:RU}});
    const title=key=>b.registry[key].useTitle();
    assert.equal(title('VENUS_PLUGINS'),'Features','English until the language file has loaded');
    await b.run();
    assert.deepEqual(b.reads,[['venus-i18n-v1:ru','utf8']],'read once, from the patched APK');
    assert.equal(title('VENUS_PLUGINS'),'Функции');assert.equal(title('VENUS_LANGUAGE'),'Язык');
    assert.equal(b.registry.VENUS_NODELETE_ROW.useTitle(),'Сохранять удалённые сообщения');
    assert.equal(title('VENUS_GENERAL'),'About','a text the file doesn\'t have stays English');
    assert.match(b.registry.VENUS_VERSION.useDescription(),/^Включено \d+ из \d+\.$/,'with its numbers filled in');
    // Picking English from Language beats Discord's language, and is saved.
    assert.equal(b.api.setSetting('language','en'),true);assert.equal(b.api.settings.language,'en');
    assert.equal(title('VENUS_PLUGINS'),'Features');
    assert.equal(b.api.setSetting('language','klingon'),false);
    b.api.setSetting('language','auto');assert.equal(title('VENUS_PLUGINS'),'Функции');
    // Discord switched to a language with no file: English, not a half-translated page.
    b.store.locale='de';b.store.listeners.forEach(fn=>fn());await b.run();
    assert.equal(title('VENUS_PLUGINS'),'Features');assert.ok(b.reads.some(r=>r[0]==='venus-i18n-v1:de'));
    // The Language page lists every language in its own words.
    function TableRadioGroup(){} function TableRadioRow(){}
    b.context.__r=id=>({5995:{TableRadioGroup},5994:{TableRadioRow}}[id]||null);
    const page=pageNodes(b.registry.VENUS_LANGUAGE.screen.getComponent()());
    const group=page.find(n=>n.type===TableRadioGroup);assert.equal(group.props.value,'auto');
    const labels=page.filter(n=>n.type===TableRadioRow).map(n=>n.props.label);
    assert.ok(labels.length>=30);assert.ok(labels.includes('\u0420\u0443\u0441\u0441\u043a\u0438\u0439'));assert.ok(labels.includes('Deutsch'));
    group.props.onChange('ru');assert.equal(b.api.settings.language,'ru');
});
test('plural forms come from the language file, for every form its language has',async()=>{
    const b=fastHarness({files:{readAsset:async()=>JSON.stringify({code:'ru',strings:RU})}});
    await flush();await flush();b.api.setSetting('translate',true);b.api.setSetting('language','ru');await b.run(5);
    b.context.__r=id=>({5916:{TableRow:'Row'}}[id]||null);
    const registry=b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route',IconComponent(){}}}},null,14130).SETTING_RENDERER_CONFIG;
    const sub=()=>pageNodes(registry.VENUS_TRANSLATE.screen.getComponent()()).find(n=>n.type==='Row'&&n.props.label==='Clear saved translations').props.subLabel;
    for (const n of [1,3,5]) b.row('p'+n,'hola amigo numero '+n);
    await b.run();
    assert.match(sub(),/^3 перевода/,'few');
    for (const n of [6,7]) b.row('p'+n,'hola amigo numero '+n);
    await b.run();assert.match(sub(),/^5 переводов/,'many');
});
test('every language file has every Venus text and keeps its {placeholders}',()=>{
    const folder='patches/src/main/resources/venus/i18n';
    const codes=fs.readFileSync(folder+'/index.txt','utf8').split('\n').filter(Boolean);
    assert.ok(codes.includes('ru'));assert.ok(codes.length>=29);
    const start=raw.indexOf('UI_LANGUAGES');assert.ok(start>0);
    const names=raw.slice(start,raw.indexOf('UI_CODES',start)).replace(/\s/g,'');
    for (const code of codes) {
        assert.ok(names.includes('["'+code+'",'),code+' is listed in Language');
        const pack=JSON.parse(fs.readFileSync(folder+'/'+code+'.json','utf8'));assert.equal(pack.code,code);
        for (const [english,value] of Object.entries(pack.strings)) for (const text of typeof value==='object'?Object.values(value):[value])
            assert.deepEqual((text.match(/\{\w+\}/g)||[]).sort(),(english.match(/\{\w+\}/g)||[]).sort(),code+': '+english);
        assert.ok(Object.keys(pack.strings).length>=300,code+' is complete');
    }
});

function userNotifHarness({friends=['111111111111111111','222222222222222222'], statuses={'111111111111111111':'online','222222222222222222':'offline','333333333333333333':'online'}, disk=null}={}) {
    const b=boot({userNotif:true});const {React,RN}=reactHarness(b);
    let clock=1_800_000_000_000;
    b.context.__clock=()=>clock;vm.runInContext('Date.now=function(){return __clock();}',b.context);
    const toasts=[], subs={}, writes=[];let saved=disk;
    const users={'111111111111111111':{id:'111111111111111111',username:'alice',globalName:'Alice',avatar:'a1'},
        '222222222222222222':{id:'222222222222222222',username:'bob',globalName:'Bob'},
        '333333333333333333':{id:'333333333333333333',username:'stranger',globalName:'Stranger'}};
    const channels={'dm1':{id:'dm1',type:1},'ch1':{id:'ch1',type:0,name:'general',guild_id:'g1'}};
    const basicChannels={'ch_basic':{id:'ch_basic',type:0,name:'lounge',guild_id:'444444444444444444'}};
    const guilds={'g1':{id:'g1',name:'Venus Hub'},'444444444444444444':{id:'444444444444444444',name:'Lazy Guild'}};
    const subscribedGuilds=[];
    const dispatcher={
        subscribe(type,fn){(subs[type]||(subs[type]=[])).push(fn);},
        unsubscribe(type,fn){if(subs[type])subs[type]=subs[type].filter(f=>f!==fn);},
        dispatch(event){(subs[event.type]||[]).slice().forEach(fn=>fn(event));}
    };
    b.load({default:native({fileExists:async()=>saved!==null,readFile:async()=>saved||'{}',writeFile:async(d,n,t)=>{writes.push([n,t]);saved=t;}})});
    b.load({default:{getCurrentUser:()=>({id:'999999999999999999'}),getUser:id=>users[id],addChangeListener(){},removeChangeListener(){}}},null,1378);
    b.load({default:{getChannel:id=>channels[id],getBasicChannel:id=>basicChannels[id]}},null,2051);
    b.load({default:{getGuild:id=>guilds[id],getGuildIds:()=>Object.keys(guilds)}},null,2073);
    b.load({default:{getFriendIDs:()=>friends,isFriend:id=>friends.includes(id),getNickname:id=>id==='111111111111111111'?'Ally':null,addChangeListener(){},removeChangeListener(){}}},null,4482);
    b.load({default:{getStatus:id=>statuses[id],addChangeListener(){},removeChangeListener(){}}},null,4877);
    b.load({default:dispatcher},null,585);
    function TableCheckboxRow(props){return {type:TableCheckboxRow,props};}
    function SearchField(props){return {type:SearchField,props};}
    b.context.__r=id=>({4531:{default:{open:t=>toasts.push(t.content)}},5916:{TableRow:'Row'},5997:{TableRowGroup:'Group'},
        6621:{TableSwitchRow:'Switch'},5913:{TableCheckboxRow},6472:{SearchField},9044:{BellIcon(){}},
        6731:{subscribeGuild:gid=>subscribedGuilds.push(gid)}}[id]||null);
    const registry=b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route',IconComponent(){}}}},null,14130).SETTING_RENDERER_CONFIG;
    return {...b,React,RN,toasts,subs,dispatcher,users,statuses,subscribedGuilds,registry,TableCheckboxRow,SearchField,writes,getSaved:()=>saved,advance:ms=>{clock+=ms;}};
}
test('User activity notifications watches friends and custom user IDs for status, typing and messages with cooldowns',async()=>{
    const b=userNotifHarness();await flush();await flush();
    assert.equal(Object.keys(b.subs).length,0,'unsubscribed while switched off');
    b.api.setSetting('userNotif',true);
    assert.ok(b.subs.PRESENCE_UPDATES && b.subs.PRESENCE_UPDATES.length===1,'subscribed once enabled');
    // Same status as seeded from PresenceStore: no false notification.
    b.dispatcher.dispatch({type:'PRESENCE_UPDATES',updates:[{user:{id:'111111111111111111'},status:'online'}]});
    assert.deepEqual(b.toasts,[]);
    // Friend changes status -> uses friend nickname.
    b.dispatcher.dispatch({type:'PRESENCE_UPDATES',updates:[{user:{id:'111111111111111111'},status:'dnd'}]});
    assert.equal(b.toasts.at(-1),'Ally is now Do Not Disturb');
    // Cooldown suppresses duplicate status change within 8s.
    b.dispatcher.dispatch({type:'PRESENCE_UPDATES',updates:[{user:{id:'111111111111111111'},status:'online'}]});
    b.dispatcher.dispatch({type:'PRESENCE_UPDATES',updates:[{user:{id:'111111111111111111'},status:'dnd'}]});
    assert.equal(b.toasts.length,2);
    // CONNECTION_OPEN followed by CONNECTION_OPEN_SUPPLEMENTAL seeds initial presences without false alerts,
    // and an unseeded user whose PresenceStore already updated to 'online' before subscriber ran still triggers a notification.
    b.statuses['111111111111111111']='offline';
    b.dispatcher.dispatch({type:'CONNECTION_OPEN'});
    b.statuses['111111111111111111']='online';
    b.dispatcher.dispatch({type:'CONNECTION_OPEN_SUPPLEMENTAL'});
    b.advance(9000);
    b.dispatcher.dispatch({type:'PRESENCE_UPDATES',updates:[{user:{id:'111111111111111111'},status:'online'}]});
    assert.equal(b.toasts.length,2,'no false online notification after CONNECTION_OPEN_SUPPLEMENTAL');
    // Unseeded friend whose PresenceStore already updated before subscriber ran:
    b.users['555555555555555555']={id:'555555555555555555',username:'eve',globalName:'Eve'};
    b.load({default:{getFriendIDs:()=>['111111111111111111','222222222222222222','555555555555555555'],isFriend:id=>['111111111111111111','222222222222222222','555555555555555555'].includes(id),getNickname:id=>id==='111111111111111111'?'Ally':null,addChangeListener(){},removeChangeListener(){}}},null,4482);
    // Simulate unseeded status transition where PresenceStore updated to 'online' before subscriber ran:
    b.statuses['555555555555555555']='online';
    b.dispatcher.dispatch({type:'PRESENCE_UPDATES',updates:[{user:{id:'555555555555555555'},status:'online'}]});
    assert.equal(b.toasts.at(-1),'Eve is now Online');
    // Typing in DM (both cached and uncached DM channels) and server channels (including getBasicChannel lazy cache).
    assert.ok(b.subscribedGuilds.includes('444444444444444444'),'subscribes guilds for typing/activity events when enabled');
    b.dispatcher.dispatch({type:'TYPING_START',userId:'222222222222222222',channelId:'uncached_dm'});
    assert.equal(b.toasts.at(-1),'Bob is typing in your DM');
    b.advance(9000);
    b.dispatcher.dispatch({type:'TYPING_START',userId:'222222222222222222',channelId:'ch1'});
    assert.equal(b.toasts.at(-1),'Bob is typing in #general (Venus Hub)');
    b.advance(9000);
    b.dispatcher.dispatch({type:'TYPING_START',userId:'222222222222222222',channelId:'ch_basic',guildId:'444444444444444444'});
    assert.equal(b.toasts.at(-1),'Bob is typing in #lounge (Lazy Guild)');
    // Message in server channel and DM; own messages and optimistic sends are ignored.
    b.dispatcher.dispatch({type:'MESSAGE_CREATE',channelId:'ch1',message:{id:'m1',channel_id:'ch1',author:{id:'111111111111111111'}}});
    assert.equal(b.toasts.at(-1),'Ally sent a message in #general (Venus Hub)');
    b.dispatcher.dispatch({type:'MESSAGE_CREATE',optimistic:true,channelId:'dm1',message:{id:'m2',author:{id:'222222222222222222'}}});
    b.dispatcher.dispatch({type:'MESSAGE_CREATE',channelId:'dm1',message:{id:'m3',author:{id:'999999999999999999'}}});
    assert.equal(b.toasts.length,7,'optimistic and own messages ignored');
    // Stranger is ignored until added by User ID backup.
    b.dispatcher.dispatch({type:'MESSAGE_CREATE',channelId:'ch1',message:{id:'m4',author:{id:'333333333333333333'}}});
    assert.equal(b.toasts.length,7);
    // Turning off unsubscribes cleanly.
    b.api.setSetting('userNotif',false);
    assert.equal(b.subs.PRESENCE_UPDATES.length,0);
});
test('User activity notifications friend picker and user ID backup persist and work for strangers',async()=>{
    const b=userNotifHarness();await flush();await flush();
    b.api.setSetting('userNotif',true);
    const page=()=>pageNodes(b.registry.VENUS_USERNOTIF.screen.getComponent()());
    // All friends: one summary row with an avatar pile instead of a wall of checkboxes, and the segmented choice.
    assert.equal(page().filter(n=>n.type===b.TableCheckboxRow).length,0,'no checklist while watching all friends');
    assert.ok(page().some(n=>n.type==='Row'&&n.props.label==='2 friends'),'all-friends summary row');
    const tab=label=>page().find(n=>n.props&&n.props.accessibilityRole==='tab'&&n.props.accessibilityLabel===label);
    assert.equal(tab('All friends').props.accessibilityState.selected,true);
    // "People I pick" keeps everyone who was watched ticked, so nothing goes quiet by surprise.
    tab('People I pick').props.onPress();
    assert.equal(b.api.settings.userNotifFriends,false);
    let checks=page().filter(n=>n.type===b.TableCheckboxRow);
    assert.equal(checks.length,2);assert.ok(checks.every(c=>c.props.checked===true),'both friends stay picked');
    // Friend rows show the avatar with a status dot.
    assert.ok(checks[0].props.icon,'avatar with status');
    // Unticking Alice keeps Bob.
    checks.find(c=>c.props.label==='Ally').props.onPress();
    assert.equal(page().filter(n=>n.type===b.TableCheckboxRow&&n.props.checked).length,1);
    b.dispatcher.dispatch({type:'TYPING_START',userId:'111111111111111111',channelId:'dm1'});
    assert.equal(b.toasts.length,0,'unchecked friend is no longer watched');
    b.dispatcher.dispatch({type:'TYPING_START',userId:'222222222222222222',channelId:'dm1'});
    assert.equal(b.toasts.at(-1),'Bob is typing in your DM');
    // Add a non-friend stranger via the User ID backup input.
    let draft='';
    const withDraft=()=>{let strCalls=0;b.React.useState=init=>{if(init===''&&++strCalls===2)return [draft,v=>{draft=v;}];return [init,()=>{}];};return page();};
    let inputs=withDraft().filter(n=>n.props&&n.props.keyboardType==='number-pad');
    assert.equal(inputs.length,1);
    (inputs[0].props.onChange||inputs[0].props.onChangeText)('333333333333333333');
    const addButton=withDraft().find(n=>n.props&&n.props.accessibilityRole==='button'&&n.props.accessibilityLabel==='Add');
    assert.equal(addButton.props.disabled,false);
    addButton.props.onPress();await flush();await flush();
    // Stranger now triggers notifications in shared server and persists in venus-patches.json.
    b.dispatcher.dispatch({type:'MESSAGE_CREATE',channelId:'ch1',message:{id:'m5',channel_id:'ch1',author:{id:'333333333333333333'}}});
    assert.equal(b.toasts.at(-1),'Stranger sent a message in #general (Venus Hub)');
    const saved=JSON.parse(b.getSaved());
    assert.deepEqual(saved.userNotifIds,['222222222222222222','333333333333333333']);
    // Restoring in a new session keeps those watched IDs.
    const restored=userNotifHarness({disk:b.getSaved()});await flush();await flush();
    assert.equal(restored.api.settings.userNotifFriends,false);
    restored.dispatcher.dispatch({type:'TYPING_START',userId:'333333333333333333',channelId:'ch1'});
    assert.equal(restored.toasts.at(-1),'Stranger is typing in #general (Venus Hub)');
    // Resetting the people list turns All friends back on and re-seeds friend statuses so an unchanged online status doesn't false-fire.
    restored.api.setSetting('userNotif',true);
    restored.RN.Alert={alert:(t,m,btns)=>btns.find(x=>x.text==='Reset').onPress()};
    const resetPage=()=>pageNodes(restored.registry.VENUS_USERNOTIF.screen.getComponent()());
    const resetRow=resetPage().find(n=>n.type==='Row'&&n.props.label==='Reset chosen people');
    assert.ok(resetRow && !resetRow.props.disabled);
    const toastsBefore=restored.toasts.length;
    resetRow.props.onPress();
    assert.equal(restored.api.settings.userNotifFriends,true,'Reset watched people turns All friends back on');
    assert.equal(restored.toasts.at(-1),'People list reset');
    restored.dispatcher.dispatch({type:'PRESENCE_UPDATES',updates:[{user:{id:'111111111111111111'},status:'online'}]});
    assert.equal(restored.toasts.length,toastsBefore+1,'no false status alert for friend already online when reset');
});
test('User activity notifications push option requests permissions, sends local notifications in background and keeps Gateway open',async()=>{
    const b=userNotifHarness();await flush();await flush();
    let appState='active', authRequested=0, authStatus=2, settingsOpened=0, socketCloses=0, pausedState=null;
    const localPushes=[], fgActive=new Map(), alerts=[];
    b.RN.NativeModules={NativePermissionManager:{
        requestNotificationAuthorization:async()=>{authRequested++;return 'authorized';},
        getNotificationAuthorizationStatus:async()=>authStatus,
        openSettings:()=>{settingsOpened++;}
    }};
    const socket={close(clean){socketCloses++;}};
    b.load({socket},null,13174);
    const pauseMod=b.load({setIsPaused:v=>{pausedState=v;},getIsPaused:()=>pausedState},null,13212);
    const origR=b.context.__r;
    b.context.__r=id=>({
        1986:{default:{getState:()=>appState}},
        7179:{default:{updateServiceHandler:(k,v)=>fgActive.set(k,v),removeServiceHandler:k=>fgActive.delete(k)}},
        8741:{default:{presentLocalNotification:n=>localPushes.push(n),openNotificationSettings:()=>{settingsOpened++;}}},
        13212:pauseMod,
        5205:{default:{show:a=>alerts.push(a)}}
    }[id]||origR(id));
    b.api.setSetting('userNotif',true);
    assert.equal(fgActive.size,0,'foreground service idle while push is off');
    // Enabling userNotifPush requests notification permission and activates background keep-alive.
    b.api.setSetting('userNotifPush',true);await flush();await flush();
    assert.equal(authRequested,1,'permission requested when turning on push notifications');
    assert.ok(fgActive.has('venus-background'),'foreground service started while watching in background');
    // Foreground notification: toast shown, no system push notification.
    b.dispatcher.dispatch({type:'TYPING_START',userId:'222222222222222222',channelId:'dm1'});
    assert.equal(b.toasts.length,1);
    assert.equal(localPushes.length,0,'no local push while app is active');
    // Leaving the app: Gateway socket.close(true) and headless setIsPaused(true) are blocked and local push notification is sent.
    appState='background';
    socket.close(true);
    assert.equal(socketCloses,0,'Gateway background close is prevented while push keep-alive is active');
    assert.equal(pausedState,false,'Gateway socket pause cleared via named PauseGatewaySocket export');
    pauseMod.setIsPaused(true);
    assert.equal(pausedState,false,'headless FCM task setIsPaused(true) is intercepted while background keep-alive is active');
    assert.equal(pauseMod.getIsPaused(),false,'getIsPaused() reports false while background keep-alive is active');
    b.advance(9000);
    b.dispatcher.dispatch({type:'TYPING_START',userId:'222222222222222222',channelId:'dm1'});
    assert.equal(localPushes.length,1,'system push notification sent while in background');
    assert.equal(localPushes[0].alertTitle,'Activity notifications');
    assert.equal(localPushes[0].alertBody,'Bob is typing in your DM');
    assert.equal(localPushes[0].channelId,'venus-user-notif');
    assert.equal(localPushes[0].messageId,'2');
    b.dispatcher.dispatch({type:'TYPING_START',userId:'111111111111111111',channelId:'dm1'});
    assert.equal(localPushes.length,2);
    assert.notEqual(localPushes[0].messageId,localPushes[1].messageId,'each push notification gets a distinct messageId so Android does not overwrite previous notifications');
    // If Android notifications are disabled in system settings, prompts user to open settings.
    authStatus=1;
    b.api.setSetting('userNotifPush',false);
    assert.equal(fgActive.size,0,'foreground service removed when push turned off');
    socket.close(true);
    assert.equal(socketCloses,1,'Gateway background close allowed once idle');
    b.api.setSetting('userNotifPush',true);await flush();await flush();
    assert.equal(alerts.length,1,'prompts when Android notifications are disabled');
    alerts[0].onConfirm();
    assert.equal(settingsOpened,1,'opens system notification settings on confirm');
});
test('Quest Completer keeps Gateway open and holds foreground service while completing a Quest in background',async()=>{
    const b=boot({quests:true});
    const timers=[];let nextId=1;
    b.context.setTimeout=(fn,ms)=>{const id=nextId++;timers.push({id,fn,ms});return id;};
    b.context.clearTimeout=id=>{const i=timers.findIndex(t=>t.id===id);if(i>=0)timers.splice(i,1);};
    let appState='background', socketCloses=0;
    const fgActive=new Map(), requests=[];
    const socket={close(clean){socketCloses++;}};
    b.load({socket},null,13174);
    const questItem={
        id:'q1',
        config:{expiresAt:'2099-01-01T00:00:00.000Z',messages:{questName:'Background Quest'},taskConfigV2:{tasks:{WATCH_VIDEO_ON_MOBILE:{target:5}}}},
        userStatus:{enrolledAt:'2020-01-01T00:00:00.000Z',completedAt:null,progress:{WATCH_VIDEO_ON_MOBILE:{value:0}}}
    };
    const store={quests:new Map([['q1',questItem]]),getQuest:id=>id==='q1'?questItem:null,addChangeListener(){}};
    b.load({default:store},null,7120);
    b.load({default:{subscribe(){},dispatch(){}}},null,585);
    b.load({default:native({fileExists:async()=>false,readFile:async()=>'{}',writeFile:async()=>{}})});
    let resolveProgress;
    b.context.__r=id=>({
        1986:{default:{getState:()=>appState}},
        7179:{default:{updateServiceHandler:(k,v)=>fgActive.set(k,v),removeServiceHandler:k=>fgActive.delete(k)}},
        13212:{default:{setIsPaused(){}}},
        7120:{default:store},
        1283:{HTTP:{post:req=>{requests.push(req);return new Promise(r=>{resolveProgress=r;});}}}
    }[id]||null);
    await flush();await flush();
    b.api.setSetting('quests',true);
    // Run the initial scan timer (at most 5 steps, since questsRefetchLoop re-schedules itself every 30 min).
    for (let i=0;i<5 && timers.length;i++) timers.shift().fn();
    await flush();
    assert.equal(requests.length,1,'Quest progress request started');
    assert.ok(fgActive.has('venus-background'),'Foreground service active while Quest is running');
    // Leaving the app while Quest is running must not close the Gateway socket.
    socket.close(true);
    assert.equal(socketCloses,0,'Gateway close(true) blocked while Quest is running in background');
    // Finish the Quest -> foreground service is released and Gateway can close normally when idle.
    resolveProgress({ok:true,status:200,body:{quest_id:'q1',completed_at:'2026-10-14T00:00:00.000Z'}});
    await flush();await flush();await flush();
    assert.equal(fgActive.size,0,'Foreground service stopped once Quest finishes');
    socket.close(true);
    assert.equal(socketCloses,1,'Gateway close(true) allowed after Quest finishes');
});

test('Account switcher unlocks MultiAccountStore, seeds active token, raises limit, and injects You bar button',()=>{
    const b=boot({accountSwitcher:true,youBarSettings:true});const {React,RN}=reactHarness(b);React.Fragment='Fragment';
    const alerts=[];RN.Alert={alert:(...args)=>alerts.push(args)};
    // 11801 Constants: MAX_ACCOUNTS is raised to 50 as soon as 11801 loads (even before venus-patches.json finishes
    // restoring settings.accountSwitcher) because MultiAccountStore (11800) caches MAX_ACCOUNTS once at module factory
    // evaluation time and would otherwise splice >5 accounts on CONNECTION_OPEN (#59).
    const constants=b.load({MAX_ACCOUNTS:5,MAX_PUSH_SYNC_ACCOUNTS:5,SWITCH_ACCOUNTS_MODAL_KEY:'switch-accounts-modal',MultiAccountSwitchLocation:{YOU_ACCOUNT_ACTION_SHEET:'you_account_action_sheet'}},null,11801);
    assert.equal(constants.MAX_ACCOUNTS,50,'limit raised to 50 at module load time so MultiAccountStore never caches 5 (#59)');
    assert.equal(constants.MAX_PUSH_SYNC_ACCOUNTS,50,'push sync limit raised to 50 at module load time (#59)');
    b.api.setSetting('accountSwitcher',true);
    assert.equal(constants.MAX_ACCOUNTS,50,'limit remains 50 when Account switcher is enabled');

    // 11802 Staff check and 11800 MultiAccountStore + 1112 TokenManager seeding.
    const staffMod=b.load({isStaffFromRawUser:()=>false},null,11802);
    assert.equal(staffMod.isStaffFromRawUser({id:'111',flags:0}),true,'staff gate bypassed while Account switcher is enabled');

    const storedTokens=new Map();
    const tokenManager={
        getToken:id=>id?storedTokens.get(id):'active-user-token',
        setToken:(tok,id)=>{if(id)storedTokens.set(id,tok);}
    };
    const me={id:'111',username:'venus_main',discriminator:'0',avatar:'av1',email:'main@example.com',phone:null};
    const alt={id:'222',username:'venus_alt',discriminator:'0',avatar:'av2'};
    b.load({default:{getCurrentUser:()=>me,getUser:id=>id==='111'?me:id==='222'?alt:null,addChangeListener(){},removeChangeListener(){}}},null,1378);

    let storeState={users:[],canUseMultiAccountMobile:false};
    const multiStore={
        getCanUseMultiAccountMobile:()=>storeState.canUseMultiAccountMobile,
        getHasLoggedInAccounts:()=>storeState.users.length>0,
        getUsers:()=>storeState.users,
        getValidUsers:()=>storeState.users.filter(u=>u.tokenStatus===2),
        getIsValidatingUsers:()=>false,
        initialize:s=>{storeState={users:Array.isArray(s?.users)?s.users:[],canUseMultiAccountMobile:!!s?.canUseMultiAccountMobile};},
        emitChange(){},
        addChangeListener(){},
        removeChangeListener(){}
    };
    const sheetCalls=[],modalCalls=[],switched=[],removed=[];
    function YouBarButton(props){return {type:YouBarButton,props};}
    function GroupIcon(props){return {type:GroupIcon,props};}
    function SettingsIcon(props){return {type:SettingsIcon,props};}
    b.context.__r=id=>({
        1112:{default:tokenManager},
        1378:{default:{getCurrentUser:()=>me,getUser:uid=>uid==='111'?me:uid==='222'?alt:null,addChangeListener(){},removeChangeListener(){}}},
        5404:{GroupIcon},
        6799:{SettingsIcon},
        11800:{default:multiStore,MultiAccountTokenStatus:{INVALID:0,VALIDATING:1,VALID:2}},
        11801:constants,
        11804:{default:{
            validateMultiAccountTokens(){},
            switchAccount:(uid,cb,loc)=>switched.push([uid,loc]),
            removeAccount:uid=>removed.push(uid)
        }},
        14615:{YOU_BAR_BUTTON_ICON_SIZE:20},
        16007:{showYouAccountActionSheet:arg=>sheetCalls.push(arg)},
        16012:{default:route=>modalCalls.push(route)},
        16014:{ManageAccountsModalRoutes:{MANAGE_ACCOUNTS:'manage_accounts',LOGIN:'login'}},
        16031:{default:YouBarButton},
        5916:{TableRow:'Row'},5997:{TableRowGroup:'Group'},6621:{TableSwitchRow:'Switch'},5280:{Stack:'Stack'},5918:{Card:'Card'}
    }[id]||null);

    b.load({default:multiStore,MultiAccountTokenStatus:{INVALID:0,VALIDATING:1,VALID:2}},null,11800);
    assert.equal(multiStore.getCanUseMultiAccountMobile(),true,'MultiAccountStore unlocked');
    assert.equal(storedTokens.get('111'),'active-user-token','active user token seeded into TokenManager by userId');
    assert.equal(multiStore.getUsers().length,1,'current user seeded into MultiAccountStore');
    assert.equal(multiStore.getUsers()[0].id,'111');

    // YouBarNotificationsButton (16032): YouBarAccountSwitcherButton starts on by default and can be toggled with accountSwitcherYouBar.
    function Bell(){return 'bell';}
    const barMod=b.load({default:{$$typeof:Symbol.for('react.memo'),type:Bell,compare:null}},null,16032);
    const barTree=barMod.default.type({hasNameplate:false});
    const swComp=barTree.props.children[1];
    const barBtn=swComp.type(swComp.props);
    assert.equal(barBtn.type,YouBarButton,'You bar button starts on by default');
    assert.equal(barBtn.props.accessibilityLabel,'Switch accounts');
    barBtn.props.onPress();
    assert.deepEqual(sheetCalls,[false],'tapping You bar button opens quick switcher sheet');
    barBtn.props.onLongPress();
    assert.deepEqual(modalCalls,['manage_accounts'],'long-pressing You bar button opens Manage Accounts modal');
    b.api.setSetting('accountSwitcherYouBar',false);
    assert.equal(swComp.type(swComp.props),null,'You bar button hides when accountSwitcherYouBar is turned off');

    // AccountSwitcherSettings page: shows saved accounts, switches on tap, removes on long-press, and opens Add/Manage modals.
    storeState.users.push({id:'222',username:'venus_alt',discriminator:'0',avatar:'av2',tokenStatus:2});
    const registry=b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route',IconComponent(){}}}},null,14130).SETTING_RENDERER_CONFIG;
    const page=()=>pageNodes(registry.VENUS_ACCOUNTSWITCHER.screen.getComponent()());
    const statusText=page().find(n=>n.type===RN.Text&&typeof n.props.children==='string'&&n.props.children.includes('accounts saved'));
    assert.ok(statusText && statusText.props.children.includes('(up to 50)'),'pl() interpolates {max} in account switcher status card');
    const altRow=page().find(n=>n.type==='Row'&&n.props.label==='venus_alt');
    assert.ok(altRow,'saved secondary account listed in settings');
    altRow.props.onPress();
    assert.equal(switched.length,1);assert.equal(switched[0][0],'222');
    altRow.props.onLongPress();
    assert.equal(alerts.length,1,'long-pressing secondary account prompts to remove');
    alerts[0][2].find(btn=>btn.text==='Remove').onPress();
    assert.deepEqual(removed,['222']);

    const addRow=page().find(n=>n.type==='Row'&&n.props.label==='Add account');
    addRow.props.onPress();
    assert.equal(modalCalls.at(-1),'login','Add account opens native login modal');

    // Initialized PersistedStore with more than 5 saved accounts: the active account is added without truncation (#59).
    let persistedSaved=0;
    const savedSixAccounts=[1,2,3,4,5,6].map(n=>({id:'u'+n,username:'user'+n,discriminator:'0',avatar:null,tokenStatus:2}));
    const fullStore={
        _isInitialized:true,
        state:{users:savedSixAccounts.slice(),canUseMultiAccountMobile:true},
        initializeIfNeeded(){throw new Error('Venus must never initialize MultiAccountStore itself (#63)');},
        getState(){return this.state;},
        getUsers(){return this.state.users;},
        getValidUsers(){return this.state.users.filter(u=>u.tokenStatus===2);},
        getCanUseMultiAccountMobile(){return this.state.canUseMultiAccountMobile;},
        getHasLoggedInAccounts(){return this.state.users.length>0;},
        initialize(s){this.state={users:Array.isArray(s?.users)?s.users:[],canUseMultiAccountMobile:!!s?.canUseMultiAccountMobile};},
        asyncPersist(){persistedSaved++;},
        emitChange(){}
    };
    b.load({default:fullStore,MultiAccountTokenStatus:{INVALID:0,VALIDATING:1,VALID:2}},null,11800);
    assert.ok(persistedSaved>=1,'asyncPersist called after adding the current user (#59)');
    assert.equal(fullStore.state.users.length,7,'all 6 persisted accounts + active account preserved without 5-account truncation (#59)');
    const savesBefore=persistedSaved;b.api.setSetting('accountSwitcherYouBar',true);
    assert.equal(persistedSaved,savesBefore,'nothing is rewritten when the active account is already saved');
});

test('Account switcher never wipes saved accounts on a cold start before Discord loaded its storage (#63)',()=>{
    const b=boot({accountSwitcher:true});reactHarness(b);
    b.api.setSetting('accountSwitcher',true);
    const saved=[{id:'111',username:'main',discriminator:'0',avatar:null,tokenStatus:2},{id:'222',username:'alt',discriminator:'0',avatar:null,tokenStatus:2},{id:'333',username:'alt2',discriminator:'0',avatar:null,tokenStatus:2}];
    const storage={hasLoaded:false,data:{}};
    let writes=0,initializedEarly=false;
    // Behaves like Discord's PersistedStore: initializeIfNeeded reads storage exactly once.
    const store={
        _isInitialized:false,users:[],
        initializeIfNeeded(){if(this._isInitialized)return;this._isInitialized=true;if(!storage.hasLoaded)initializedEarly=true;this.users=(storage.data.MultiAccountStore||{users:[]}).users.slice();},
        initialize(s){this.users=s&&Array.isArray(s.users)?s.users:[];},
        getState(){return {users:this.users,canUseMultiAccountMobile:false};},
        getUsers(){return this.users;},getValidUsers(){return this.users;},getCanUseMultiAccountMobile(){return false;},getHasLoggedInAccounts(){return this.users.length>0;},
        asyncPersist(){writes++;storage.data.MultiAccountStore={users:this.users.slice()};},
        emitChange(){}
    };
    let me=null;
    b.context.__r=id=>({510:{Storage:storage},1112:{default:{getToken:()=>null,setToken(){}}},
        1378:{default:{getCurrentUser:()=>me,getUser:()=>null,addChangeListener(){},removeChangeListener(){}}},
        11800:{default:store,MultiAccountTokenStatus:{INVALID:0,VALIDATING:1,VALID:2}}}[id]||null);
    b.load({default:{getCurrentUser:()=>me,getUser:()=>null,addChangeListener(){},removeChangeListener(){}}},null,1378);
    const patched=b.load({default:store,MultiAccountTokenStatus:{INVALID:0,VALIDATING:1,VALID:2}},null,11800).default;
    // Venus's own settings finish loading while Discord's storage is still being read.
    me={id:'111',username:'main'};
    b.api.setSetting('accountSwitcherYouBar',false);
    assert.equal(initializedEarly,false,'MultiAccountStore is not read before Discord loaded its storage');
    assert.equal(writes,0,'nothing is saved before Discord loaded its storage');
    // Discord finishes loading and initializes the store itself.
    storage.data.MultiAccountStore={users:saved.slice()};storage.hasLoaded=true;store.initializeIfNeeded();
    b.api.setSetting('accountSwitcherYouBar',true);
    assert.deepEqual(patched.getUsers().map(u=>u.id),['111','222','333'],'all three saved accounts survive the restart');
    assert.equal(writes,0,'the saved list is not rewritten when the active account is already in it');
});

test('Unlock app icons marks all alternate icons non-premium, blocks background reset, and strips the Nitro upsell button and header',()=>{
    const b=boot({appIcons:true});const {React,RN}=reactHarness(b);
    const me={id:'me',premiumType:null};
    b.load({default:{getCurrentUser:()=>me}},null,1378);
    const appIconsProduct={};
    const catalog=b.load({APP_ICONS:appIconsProduct,canUserUse:(feat,u)=>u?.premiumType===2},null,13528);
    const premium=b.load({default:{canUsePremiumAppIcons:u=>u?.premiumType===2},canUsePremiumAppIcons:u=>u?.premiumType===2},null,4491);

    const defaultIcon=Object.freeze({id:'Default',name:'Default',isPremium:false});
    const officialIcons=Object.freeze([Object.freeze({id:'BrandInverted',name:'Blurple Twilight',isPremium:true}),Object.freeze({id:'Manga',name:'Manga',isPremium:true})]);
    const limitedIcons=Object.freeze([Object.freeze({id:' Pirate',name:'Pirate',isPremium:true})]);
    const allIcons=Object.freeze([defaultIcon,...officialIcons,...limitedIcons]);
    const constants=b.load({
        getDefaultIcon:()=>defaultIcon,
        getOfficialAlternateIcons:()=>officialIcons,
        getLimitedAlternateIcons:()=>limitedIcons,
        getIcons:()=>allIcons,
        getIconById:id=>allIcons.find(i=>i.id===id)
    },null,8621);

    let resetCalls=0,validateCalls=0;
    const managerObj={
        validateAndResetIfNeeded(){validateCalls++;},
        resetIcon(reason){resetCalls++;}
    };
    const managerMod=b.load({default:managerObj},null,17096);

    function NitroUpsellButton(props){return {type:NitroUpsellButton,props};}
    function TableRowGroup(props){return {type:TableRowGroup,props};}
    b.context.__r=id=>({9421:{NitroUpsellButton,default:NitroUpsellButton},5997:{TableRowGroup}}[id]||null);

    const rowsMod=b.load({default:function AppIconRows(){
        return React.createElement(RN.View,null,
            React.createElement(TableRowGroup,null,'default-row'),
            React.createElement(TableRowGroup,{title:'Nitro'},'alt-rows')
        );
    }},null,15066);
    const screenMod=b.load({default:function UserSettingsAppIcons(){
        return React.createElement(RN.View,{style:{flex:1}},
            React.createElement('ScrollView',null,rowsMod.default({})),
            React.createElement(RN.View,{style:{paddingHorizontal:16}},
                React.createElement(NitroUpsellButton,{text:'Unlock all icons with Nitro'})
            )
        );
    }},null,15065);

    // Starts off: icons require Nitro and upsell is rendered.
    assert.equal(b.api.settings.appIcons,false);
    assert.equal(constants.getOfficialAlternateIcons()[0].isPremium,true);
    assert.equal(constants.getIconById('Manga').isPremium,true);
    assert.equal(premium.default.canUsePremiumAppIcons(me),false);
    assert.equal(catalog.canUserUse(appIconsProduct,me),false);
    let tree=screenMod.default({});
    assert.ok(pageNodes(tree).some(n=>n.type===NitroUpsellButton),'Nitro upsell button present while off');
    assert.ok(pageNodes(tree).some(n=>n.type===TableRowGroup&&n.props.title==='Nitro'),'Nitro group title present while off');

    // Turn Unlock app icons on: all icons report isPremium:false, reset is blocked, and Nitro upsell + header are removed.
    b.api.setSetting('appIcons',true);
    assert.equal(constants.getOfficialAlternateIcons().every(i=>i.isPremium===false),true,'official alternate icons unlocked');
    assert.equal(constants.getLimitedAlternateIcons().every(i=>i.isPremium===false),true,'limited icons unlocked');
    assert.equal(constants.getIcons().every(i=>i.isPremium===false),true,'all icons unlocked');
    assert.equal(constants.getIconById('BrandInverted').isPremium,false,'getIconById unlocked');
    assert.equal(officialIcons[0].isPremium,true,'original icon constant objects not mutated');
    assert.equal(premium.default.canUsePremiumAppIcons(me),true);
    assert.equal(premium.canUsePremiumAppIcons(me),true);
    assert.equal(catalog.canUserUse(appIconsProduct,me),true);

    managerMod.default.validateAndResetIfNeeded();
    managerMod.default.resetIcon('PREMIUM_LOST');
    assert.equal(validateCalls,0,'validateAndResetIfNeeded suppressed while appIcons is on');
    assert.equal(resetCalls,0,'resetIcon(PREMIUM_LOST) suppressed while appIcons is on');

    tree=screenMod.default({});
    assert.equal(pageNodes(tree).some(n=>n.type===NitroUpsellButton),false,'"Unlock all icons with Nitro" upsell button removed');
    assert.equal(tree.props.children.filter(Boolean).length,1,'upsell button container removed');
    const groups=pageNodes(tree).filter(n=>n.type===TableRowGroup);
    assert.equal(groups.length,2);
    assert.equal(groups.every(g=>!g.props.title),true,'"Nitro" lock header removed from alternate icons group');
});

test('Custom themes installs Revenge JSON themes via links, compiles colors into RawColors & SemanticColors in place, invalidates ThemeContext key, and restores stock colors when turned off (#57)', async () => {
    const b = boot({customThemes:true});
    const {React, RN} = reactHarness(b);
    const writes = [], toasts = [], alerts = [];
    let savedThemesFile = null;
    RN.Alert = {alert:(...args) => alerts.push(args)};
    b.load({default:native({
        fileExists: async p => p.endsWith('venus-themes.json') && savedThemesFile !== null,
        readFile: async p => p.endsWith('venus-themes.json') && savedThemesFile ? savedThemesFile : '{}',
        writeFile: async (dir, name, text) => { writes.push([name, text]); if (name === 'venus-themes.json') savedThemesFile = text; }
    })});

    const rawColorsTable = {
        NEUTRAL_86: '#313338',
        NEUTRAL_79: '#2b2d31',
        NEUTRAL_92: '#1e1f22',
        NEUTRAL_5: '#dbdee1',
        NEUTRAL_2: '#f2f3f5',
        NEUTRAL_29: '#949ba4',
        BLURPLE_50: '#5865f2',
        PRIMARY_600: '#313338',
        BRAND_500: '#5865f2'
    };
    const semanticColorsTable = {
        BACKGROUND_BASE_LOWER: {
            category: 'background',
            dark: {raw:'NEUTRAL_86', opacity:1},
            darker: {raw:'NEUTRAL_69', opacity:1},
            light: {raw:'NEUTRAL_2', opacity:1},
            midnight: {raw:'NEUTRAL_100', opacity:1}
        },
        BACKGROUND_BASE_LOW: {
            category: 'background',
            dark: {raw:'NEUTRAL_82', opacity:1},
            darker: {raw:'NEUTRAL_66', opacity:1},
            light: {raw:'NEUTRAL_2', opacity:1},
            midnight: {raw:'NEUTRAL_100', opacity:1}
        },
        BACKGROUND_SURFACE_HIGH: {
            category: 'background',
            dark: {raw:'NEUTRAL_79', opacity:1},
            darker: {raw:'NEUTRAL_64', opacity:1},
            light: {raw:'NEUTRAL_1', opacity:1},
            midnight: {raw:'NEUTRAL_96', opacity:1}
        },
        TEXT_DEFAULT: {
            category: 'text',
            dark: {raw:'NEUTRAL_5', opacity:1},
            darker: {raw:'NEUTRAL_4', opacity:1},
            light: {raw:'NEUTRAL_72', opacity:1},
            midnight: {raw:'NEUTRAL_12', opacity:1}
        },
        TEXT_STRONG: {
            category: 'text',
            dark: {raw:'NEUTRAL_2', opacity:1},
            darker: {raw:'NEUTRAL_1', opacity:1},
            light: {raw:'NEUTRAL_76', opacity:1},
            midnight: {raw:'NEUTRAL_10', opacity:1}
        },
        MESSAGE_MENTIONED_BACKGROUND_DEFAULT: {
            category: 'background',
            dark: {raw:'OPACITY_YELLOW_8', opacity:0.08},
            darker: {raw:'OPACITY_YELLOW_8', opacity:0.08},
            light: {raw:'OPACITY_YELLOW_8', opacity:0.08},
            midnight: {raw:'OPACITY_YELLOW_8', opacity:0.08}
        },
        CHANNEL_BACKGROUND_DEFAULT: {
            category: 'background',
            dark: {raw:'NEUTRAL_86', opacity:1},
            darker: {raw:'NEUTRAL_69', opacity:1},
            light: {raw:'NEUTRAL_2', opacity:1},
            midnight: {raw:'NEUTRAL_100', opacity:1}
        },
        STATUS_ONLINE: {
            category: 'status',
            dark: {raw:'GREEN_360', opacity:1},
            darker: {raw:'GREEN_360', opacity:1},
            light: {raw:'GREEN_360', opacity:1},
            midnight: {raw:'GREEN_360', opacity:1}
        },
        ICON_STATUS_DND: {
            category: 'status',
            dark: {raw:'RED_400', opacity:1},
            darker: {raw:'RED_400', opacity:1},
            light: {raw:'RED_400', opacity:1},
            midnight: {raw:'RED_400', opacity:1}
        },
        MOBILE_CHAT_NEW_MESSAGE_BORDER: {
            category: 'border',
            dark: {raw:'RED_400', opacity:1},
            darker: {raw:'RED_400', opacity:1},
            light: {raw:'RED_400', opacity:1},
            midnight: {raw:'RED_400', opacity:1}
        }
    };
    rawColorsTable.GREEN_360 = '#23a55a';
    rawColorsTable.RED_400 = '#f23f43';
    b.load({_private:{RawColors:rawColorsTable}}, null, 592);
    b.load({_private:{SemanticColors:semanticColorsTable}}, null, 590);
    let themeStoreChanges = 0;
    const themeStore = {theme:'dark', emitChange(){ themeStoreChanges++; }};
    b.load({default:themeStore}, null, 1194);
    const themeCtxMod = b.load({
        FALLBACK_THEME_CONTEXT_VALUE: {key:'{"theme":"dark","flags":0}'},
        createThemedContext(ctx) {
            return Object.assign({}, ctx, {key:JSON.stringify(ctx)});
        }
    }, null, 4551);
    const chatWrapperMod = b.load({
        default: function ChatViewWrapper(props) {
            return React.createElement(RN.View, {testID:'chat-wrapper'}, props && props.children);
        }
    }, null, 9542);

    const fetchedUrls = [];
    const rosePineTheme = {
        name: 'Rose Pine Moon',
        description: 'Soho vibes for the classy minimalist',
        authors: [{name:'Moodle'}],
        spec: 2,
        rawColors: {
            PRIMARY_600: '#232136',
            PRIMARY_100: '#e0def4',
            BRAND_500: '#3e8fb0'
        },
        semanticColors: {
            BACKGROUND_PRIMARY: ['#232136', '#faf4ed', '#191724'],
            BACKGROUND_SECONDARY: ['2a273f'],
            TEXT_NORMAL: ['rgba(224, 222, 244, 1)'],
            HEADER_PRIMARY: ['hsl(35, 88%, 72%)'],
            BACKGROUND_MENTIONED: ['#f6c17733']
        },
        background: {
            url: 'https://example.com/wallpaper.png',
            alpha: 0.75,
            blur: 0.2,
            color: '#191724'
        },
        plus: {
            version: 0,
            mentionLineColor: '#ebbcba',
            unreadBadgeColor: '#eb6f92',
            icons: {
                StatusOnline: '#9ccfd8',
                StatusDND: ['#eb6f92']
            }
        }
    };
    b.context.fetch = async url => {
        fetchedUrls.push(url);
        return {ok:true, status:200, text:async () => JSON.stringify(rosePineTheme)};
    };
    b.context.__r = id => ({
        590: {_private:{SemanticColors:semanticColorsTable}},
        592: {_private:{RawColors:rawColorsTable}},
        1194: {default:themeStore},
        4551: themeCtxMod,
        4531: {default:{open:t => toasts.push(t.content)}},
        5916: {TableRow:'Row'},
        5997: {TableRowGroup:'Group'},
        6621: {TableSwitchRow:'Switch'},
        6021: {TextInput:'Input'},
        5280: {Stack:'Stack'},
        5918: {Card:'Card'},
        6614: {Clipboard:{getString:async () => 'https://github.com/rose-pine/discord-mobile/blob/main/rosepinemoon.json'}}
    }[id] || null);

    await flush(); await flush();
    assert.equal(b.api.settings.customThemes, false, 'customThemes starts off');
    assert.equal(themeCtxMod.createThemedContext({theme:'dark'}).key, '{"theme":"dark"}', 'stock ThemeContext key untouched before any theme change');

    b.api.setSetting('customThemes', true);
    const registry = b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route', IconComponent(){}}}}, null, 14130).SETTING_RENDERER_CONFIG;
    const page = () => pageNodes(registry.VENUS_CUSTOMTHEMES.screen.getComponent()());

    // Paste link from clipboard and install via GitHub blob -> raw.githubusercontent.com normalization.
    let draft = '';
    const withDraft = () => {
        React.useState = init => typeof init === 'string' ? [draft, v => { draft = v; }] : [init, () => {}];
        return page();
    };
    // One field and one button beside it: Paste while the box is empty, Install once it holds a link.
    const button = () => withDraft().find(n => n.props && n.props.accessibilityRole === 'button' && /^(Paste|Install)$/.test(n.props.accessibilityLabel));
    assert.equal(withDraft().filter(n => n.type === 'Row' && /Install theme|Paste link/.test(n.props.label)).length, 0, 'no separate Install and Paste rows');
    assert.equal(button().props.accessibilityLabel, 'Paste');
    button().props.onPress();
    await flush(); await flush();
    assert.equal(draft, 'https://github.com/rose-pine/discord-mobile/blob/main/rosepinemoon.json', 'clipboard link pasted into draft');

    const installRow = button();
    assert.equal(installRow.props.accessibilityLabel, 'Install');
    assert.equal(installRow.props.disabled, false);
    installRow.props.onPress();
    await flush(); await flush(); await flush();

    assert.deepEqual(fetchedUrls, ['https://raw.githubusercontent.com/rose-pine/discord-mobile/main/rosepinemoon.json'], 'GitHub blob URL normalized to raw URL');
    assert.equal(toasts.at(-1), 'Applied Rose Pine Moon');
    assert.ok(themeStoreChanges >= 1, 'ThemeStore.emitChange() called to refresh UI');

    // Verify in-place token compilation: BACKGROUND_PRIMARY -> BACKGROUND_BASE_LOWER, TEXT_NORMAL -> TEXT_DEFAULT, etc.
    const darkRawKey = semanticColorsTable.BACKGROUND_BASE_LOWER.dark.raw;
    const lightRawKey = semanticColorsTable.BACKGROUND_BASE_LOWER.light.raw;
    const midnightRawKey = semanticColorsTable.BACKGROUND_BASE_LOWER.midnight.raw;
    assert.equal(rawColorsTable[darkRawKey], '#232136', 'dark BACKGROUND_BASE_LOWER compiled in-place');
    assert.equal(rawColorsTable[lightRawKey], '#faf4ed', 'light BACKGROUND_BASE_LOWER compiled in-place');
    assert.equal(rawColorsTable[midnightRawKey], '#191724', 'midnight BACKGROUND_BASE_LOWER compiled in-place');
    assert.equal(rawColorsTable[semanticColorsTable.BACKGROUND_BASE_LOW.dark.raw], '#2a273f', '6-digit hex without leading # parsed cleanly');
    assert.equal(rawColorsTable[semanticColorsTable.TEXT_DEFAULT.dark.raw], '#e0def4', 'rgba() color parsed and bridged to TEXT_DEFAULT');
    assert.equal(rawColorsTable[semanticColorsTable.TEXT_STRONG.dark.raw], '#f6c279', 'hsl() color parsed and bridged to TEXT_STRONG');
    assert.equal(rawColorsTable[semanticColorsTable.MESSAGE_MENTIONED_BACKGROUND_DEFAULT.dark.raw], '#f6c177', '8-digit hex color separated into 6-digit hex + opacity');
    assert.equal(semanticColorsTable.MESSAGE_MENTIONED_BACKGROUND_DEFAULT.dark.opacity, 0.2, '8-digit hex alpha (#33 = 0.2) stored on semantic slot opacity');
    assert.equal(rawColorsTable.BLURPLE_50, '#3e8fb0', 'BRAND_500 bridged to BLURPLE_50');
    assert.equal(rawColorsTable.GREEN_360, '#9ccfd8', 'plus.icons.StatusOnline compiled into GREEN_360');
    assert.equal(rawColorsTable[semanticColorsTable.ICON_STATUS_DND.dark.raw], '#eb6f92', 'plus.icons.StatusDND compiled into ICON_STATUS_DND');
    assert.equal(rawColorsTable[semanticColorsTable.MOBILE_CHAT_NEW_MESSAGE_BORDER.dark.raw], '#eb6f92', 'plus.unreadBadgeColor compiled into MOBILE_CHAT_NEW_MESSAGE_BORDER');
    assert.equal(semanticColorsTable.CHANNEL_BACKGROUND_DEFAULT.dark.opacity, 0.75, 'background.alpha applied to chat surface token when wallpaper is active');
    assert.match(themeCtxMod.createThemedContext({theme:'dark'}).key, /^\{.*\}#v\d+$/, 'ThemeContext key bumped with revision suffix to invalidate style caches once');
    assert.match(themeCtxMod.FALLBACK_THEME_CONTEXT_VALUE.key, /^\{.*\}#v\d+$/, 'FALLBACK_THEME_CONTEXT_VALUE.key also bumped so createLegacyClassComponentStyles invalidates cache');

    // ChatViewWrapper (9542) renders the static RN.Image wallpaper behind chat when customThemesBackground is on.
    let chatTree = chatWrapperMod.default({children:'messages'});
    const bgImg = pageNodes(chatTree).find(n => n.type === RN.Image);
    assert.ok(bgImg, 'static RN.Image wallpaper rendered behind ChatViewWrapper');
    assert.equal(bgImg.props.source.uri, 'https://example.com/wallpaper.png');
    assert.equal(bgImg.props.blurRadius, 5, 'blur:0.2 scaled to blurRadius:5');

    // Toggling customThemesBackground off hides the wallpaper and restores opaque chat surfaces.
    b.api.setSetting('customThemesBackground', false);
    assert.equal(semanticColorsTable.CHANNEL_BACKGROUND_DEFAULT.dark.opacity, 1, 'chat surface opacity restored to 1 when background image is turned off');
    chatTree = chatWrapperMod.default({children:'messages'});
    assert.equal(pageNodes(chatTree).some(n => n.type === RN.Image), false, 'wallpaper hidden when customThemesBackground is off');
    b.api.setSetting('customThemesBackground', true);

    // Turning customThemes off restores Discord's original RawColors and SemanticColors in-place.
    b.api.setSetting('customThemes', false);
    assert.equal(semanticColorsTable.BACKGROUND_BASE_LOWER.dark.raw, 'NEUTRAL_86', 'original SemanticColors slot restored when turned off');
    assert.equal(rawColorsTable.NEUTRAL_86, '#313338', 'original RawColors entry restored when turned off');
    assert.equal(rawColorsTable.BLURPLE_50, '#5865f2', 'original BLURPLE_50 restored when turned off');
    assert.equal(Object.keys(rawColorsTable).some(k => k.startsWith('__VENUS_')), false, 'synthetic keys cleaned up when turned off');

    // Turning customThemes back on re-applies the saved theme from venus-themes.json.
    b.api.setSetting('customThemes', true);
    assert.equal(rawColorsTable[semanticColorsTable.BACKGROUND_BASE_LOWER.dark.raw], '#232136', 'theme re-applied when turned back on');

    // Tapping the active theme row toggles it off; long-pressing removes it.
    const themeRow = withDraft().find(n => n.type === 'Row' && n.props.label === 'Rose Pine Moon' && n.props.trailing);
    assert.ok(themeRow, 'installed theme listed as active');
    themeRow.props.onPress();
    assert.equal(semanticColorsTable.BACKGROUND_BASE_LOWER.dark.raw, 'NEUTRAL_86', 'tapping active theme deselects it and restores stock colors');
    themeRow.props.onLongPress();
    alerts.at(-1)[2].find(btn => btn.text === 'Remove').onPress();
    assert.equal(toasts.at(-1), 'Removed Rose Pine Moon');
});

test('Read All clears lurking, guest and event-only servers, >20 unread DMs, and skips message requests',()=>{
    const b=readAllHarness({unreadGuilds:['g1','g_lurk','g_guest'],dms:Array.from({length:20},(_,i)=>'d'+(i+1))});
    const prev=b.context.__r;
    const allDms=Array.from({length:25},(_,i)=>'d'+(i+1)).concat(['req_dm','spam_dm','read_dm']);
    const unreadDms=new Set(Array.from({length:25},(_,i)=>'d'+(i+1)).concat(['req_dm','spam_dm']));
    b.context.__r=id=>{
        if (id===4473) return {default:{lurkingGuildIds:()=>['g_lurk']}};
        if (id===2073) return {default:{getGuildIds:()=>['g1','g2','g3','g4','g_guest','g_event']}};
        if (id===5019) return {ReadStateTypes:{CHANNEL:0,GUILD_EVENT:1}};
        if (id===4852) return {default:{
            lastMessageId:ch=>'m-'+ch,
            hasUnread:(targetId,type)=>type===1&&targetId==='g_event',
            hasUnreadOrMentions:ch=>unreadDms.has(ch)
        }};
        if (id===6640) return {default:{getPrivateChannelIds:()=>allDms}};
        if (id===13384) return {filterOutMessageRequestsAndSpamById:ids=>ids.filter(ch=>ch!=='req_dm'&&ch!=='spam_dm')};
        return prev(id);
    };
    b.api.setSetting('readAllMode','both');
    pressReadAll(b);
    assert.equal(JSON.stringify(b.calls.guilds),JSON.stringify([[['g1','g_lurk','g_guest','g_event'],'guild list']]),'lurking, guest and event-unread servers included');
    assert.equal(b.calls.acks.length,1,'single bulkAck batch for 25 DMs');
    assert.equal(b.calls.acks[0].length,25,'all 25 unread DMs included beyond the 20-DM cap, excluding message requests/spam and already-read DMs');
    assert.equal(b.calls.toasts.at(-1),'Marked 4 servers and 25 DMs as read');
});

test('Read All reports an error when read state stores have not loaded yet and retries createStyles once tokens load',()=>{
    const b=readAllHarness();
    const prev=b.context.__r;
    let tokensReady=false,createStylesCalls=0;
    b.context.__r=id=>{
        if (id===7054||id===13299||id===6640) return null;
        if (id===588) return tokensReady?{default:{colors:{BACKGROUND_MOD_NORMAL:'#111',BACKGROUND_MOD_STRONG:'#222',TEXT_DEFAULT:'#fff'}}}:null;
        if (id===4837) return {createStyles:spec=>{createStylesCalls++;return ()=>spec;}};
        return prev(id);
    };
    pressReadAll(b);
    assert.match(b.calls.toasts.at(-1),/^Couldn't mark as read: Discord's read states haven't loaded yet/);
    b.api.setSetting('readAllMode','dms');
    pressReadAll(b);
    assert.match(b.calls.toasts.at(-1),/^Couldn't mark as read: Discord's read states haven't loaded yet/);
    // ReadAllButton retries createStyles once theme tokens become available.
    const buttonNode=findReadAll(b.props().listDataProps.renderItem(6,0));
    buttonNode.type(buttonNode.props);
    assert.equal(createStylesCalls,0,'tokens not ready yet');
    tokensReady=true;
    const rendered=buttonNode.type(buttonNode.props);
    assert.equal(createStylesCalls,1,'createStyles called once tokens are ready');
    assert.equal(rendered.props.children.props.style({pressed:false})[1].backgroundColor,'#111');
});

test('Message highlights customizes left bar thickness and reply/mention & deleted colors with live preview in settings (#60)', async () => {
    const b = boot({messageHighlight:true, noDelete:true});
    const {React, RN} = reactHarness(b);
    RN.processColor = str => {
        const clean = str.replace(/^#/, '');
        if (clean.length === 6) return (0xff000000 | parseInt(clean, 16)) >>> 0;
        if (clean.length === 8) {
            const rgb = parseInt(clean.slice(0, 6), 16);
            const a = parseInt(clean.slice(6, 8), 16);
            return ((a << 24) | rgb) >>> 0;
        }
        return 0;
    };
    const dispatched = [];
    const flux = b.load({default:{dispatch(e){ dispatched.push(e); }}}, null, 585).default;
    b.load({default:{getCurrentUser:() => ({id:'me_123', username:'fariz70', globalName:'FaRiz70', avatar:'av_hash'})}}, null, 1378);
    b.load({default:{getUserAvatarURL:(u, anim, size) => `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=${size}`}}, null, 1403);
    const liveMessages = new Map();
    b.load({default:{getMessage:(ch, id) => liveMessages.get(ch + ':' + id)}}, null, 5057);

    // Hook MessageRowGenerator.prototype.generate (7378)
    class MessageRowGenerator {
        generate(row) {
            return row.result;
        }
    }
    b.load({default:MessageRowGenerator}, null, 7378);
    const gen = new MessageRowGenerator();

    // 1. Default settings: messageHighlight starts off, options default to thickness 2 (4 dp) and default colors
    assert.equal(b.api.settings.messageHighlight, false);
    assert.equal(b.api.settings.messageHighlightThickness, 2);
    assert.equal(b.api.settings.messageHighlightPingColor, 'default');
    assert.equal(b.api.settings.messageHighlightDeletedColor, 'default');
    b.api.setSetting('messageHighlight', true);

    // Mention row with stock backgroundHighlight encodes multiplier 2 into gutterColor alpha (256 - 2 = 254 = 0xfe)
    const stockYellowGutter = RN.processColor('#f0b232') | 0;
    const stockYellowBg = RN.processColor('#f0b2321a') | 0;
    const mentionSource = {id:'m_ping', channel_id:'c1', content:'hey @FaRiz70', mentioned:true};
    liveMessages.set('c1:m_ping', mentionSource);
    let pingRow = gen.generate({
        rowType:1,
        message:mentionSource,
        result:{message:{id:'m_ping', channelId:'c1'}, backgroundHighlight:{backgroundColor:stockYellowBg, gutterColor:stockYellowGutter}}
    });
    assert.equal((pingRow.backgroundHighlight.gutterColor >>> 24) & 0xff, 254, '2x thickness encoded as alpha 254');
    assert.equal(pingRow.backgroundHighlight.gutterColor & 0x00ffffff, 0xf0b232, 'stock yellow RGB preserved');

    // 2. Custom ping color ('cyan' -> #00a8fc) and thickness 4 (8 dp -> alpha 252)
    b.api.setSetting('messageHighlightThickness', 4);
    b.api.setSetting('messageHighlightPingColor', 'cyan');
    assert.ok(dispatched.some(e => e.type === 'MESSAGE_UPDATE' && e.message.id === 'm_ping'), 'live MESSAGE_UPDATE dispatched to redraw cached rows');
    pingRow = gen.generate({
        rowType:1,
        message:{id:'m_reply', channel_id:'c1', content:'replying', referenced_message:{author:{id:'me_123'}}},
        result:{message:{id:'m_reply', channelId:'c1'}}
    });
    assert.equal((pingRow.backgroundHighlight.gutterColor >>> 24) & 0xff, 252, '4x thickness encoded as alpha 252');
    assert.equal(pingRow.backgroundHighlight.gutterColor & 0x00ffffff, 0x00a8fc, 'cyan RGB applied to reply row');

    // 3. Deleted message row with custom hex color ('#9b59b6')
    b.api.setSetting('noDelete', true);
    b.api.setSetting('messageHighlightDeletedColor', '#9b59b6');
    liveMessages.set('c1:m_del', {id:'m_del', channel_id:'c1', content:'deleted text', state:'SENT'});
    flux.dispatch({type:'MESSAGE_DELETE', channelId:'c1', id:'m_del'});
    const delRow = gen.generate({
        rowType:1,
        message:{id:'m_del', channel_id:'c1', content:'deleted text'},
        result:{message:{id:'m_del', channelId:'c1'}}
    });
    assert.equal((delRow.backgroundHighlight.gutterColor >>> 24) & 0xff, 252, '4x thickness encoded on deleted row');
    assert.equal(delRow.backgroundHighlight.gutterColor & 0x00ffffff, 0x9b59b6, 'custom purple RGB applied to deleted row');

    // 4. Settings UI renders accurate Discord reply + deleted message preview card, thickness radio group, and visual color swatches + custom hex inputs
    b.context.__r = id => ({
        1403: {default:{getUserAvatarURL:(u, anim, size) => `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=${size}`}},
        5916: {TableRow:'Row'},
        5997: {TableRowGroup:'Group'},
        5995: {TableRadioGroup:'RadioGroup'},
        5994: {TableRadioRow:'RadioRow'},
        6021: {TextInput:'Input'},
        5280: {Stack:'Stack'}
    }[id] || null);
    const registry = b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route', IconComponent(){}}}}, null, 14130).SETTING_RENDERER_CONFIG;
    const page = () => pageNodes(registry.VENUS_MESSAGEHIGHLIGHT.screen.getComponent()());
    const hp = page().find(n => n.type && n.type.name === 'HighlightPreview');
    const saved = {useState:React.useState, useRef:React.useRef, useEffect:React.useEffect};
    const nodes = hookHost(b, React, hp).render(); Object.assign(React, saved);
    const preview = nodes.find(n => n.props && n.props.accessibilityLabel === 'Message highlight preview');
    assert.ok(preview, 'live reply & deleted message preview card rendered');
    const avatarImages = nodes.filter(n => n.type === RN.Image && n.props.source && n.props.source.uri && n.props.source.uri.includes('av_hash'));
    assert.equal(avatarImages.length, 2, 'renders both 16dp reply avatar and 40dp main avatar using user avatar URL');
    const mentionPillText = nodes.find(n => n.type === RN.Text && n.props.children === '@FaRiz70' && n.props.style && n.props.style.color === '#c9cdfb');
    assert.ok(mentionPillText, 'renders authentic Discord blurple mention pill for @user');

    // Swatch rows (one per highlight) allow 1-tap preset selection, with a check on the chosen one.
    const swatches = label => page().filter(n => n.type === RN.Pressable && n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label);
    assert.equal(swatches('Purple').length, 2, 'swatches rendered for replies & mentions and for kept deleted messages');
    assert.equal(swatches('Any color').length, 2, 'an any-color swatch for each highlight');
    swatches('Blurple')[0].props.onPress();
    assert.equal(b.api.settings.messageHighlightPingColor, 'blurple', 'tapping Blurple swatch updates ping color immediately');
    assert.equal(swatches('Blurple')[0].props.accessibilityState.selected, true);

    // Bar width is a segmented choice.
    page().find(n => n.props && n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === '6 dp').props.onPress();
    assert.equal(b.api.settings.messageHighlightThickness, 3);

    // Any color opens Discord's color picker (14140) with the presets suggested; its pick is saved as hex.
    const picks = [];
    const prevR = b.context.__r;
    b.context.__r = id => id === 14140 ? {default:opts => picks.push(opts)} : prevR(id);
    swatches('Any color')[0].props.onPress();
    assert.equal(picks.length, 1, 'native color picker opened');
    assert.ok(picks[0].suggestedColors.includes('#5865f2'));
    picks[0].onSelect(0x12abef);
    assert.equal(b.api.settings.messageHighlightPingColor, '#12abef', 'picked color applied to ping color');

    // Without the picker, a hex box opens instead.
    b.context.__r = prevR;
    let target = '', draft = '#ff5500';
    React.useState = init => init === '' ? (React.useState.n = (React.useState.n || 0) + 1) % 2 ? [draft, v => { draft = v; }] : [target, v => { target = v; }] : [init, () => {}];
    React.useState.n = 0; swatches('Any color')[1].props.onPress();
    assert.equal(target, 'messageHighlightDeletedColor', 'hex box opens for the deleted color');
    assert.equal(draft, '#9b59b6', 'hex box starts from the current custom color');
    draft = '#ff5500';
    React.useState.n = 0; const use = page().find(n => n.props && n.props.accessibilityLabel === 'Use');
    assert.ok(use && !use.props.disabled); use.props.onPress();
    assert.equal(b.api.settings.messageHighlightDeletedColor, '#ff5500', 'typed hex applied to deleted color');

    // Reset to defaults.
    React.useState = init => [init, () => {}];
    const reset = page().find(n => n.type === 'Row' && n.props.label === 'Reset to defaults');
    assert.equal(reset.props.disabled, false); reset.props.onPress();
    assert.equal(b.api.settings.messageHighlightThickness, 2);
    assert.equal(b.api.settings.messageHighlightPingColor, 'default');
    assert.equal(b.api.settings.messageHighlightDeletedColor, 'default');
});





test('every option page renders in the shared design: status card only when useful, row icons, and no crash on or off',()=>{
    const b=settingsHarness();const {React}=reactHarness(b);React.useState=init=>[init,()=>{}];
    function TableSwitchRow(){} function TableRowGroup(){} function TableRadioGroup(){} function TableRadioRow(){} function TableRowIcon(){} function Text(){}
    b.context.__r=id=>({6621:{TableSwitchRow},5997:{TableRowGroup},5995:{TableRadioGroup},5994:{TableRadioRow},5922:{TableRowIcon},4833:{Text},5916:{TableRow:'Row'},
        1378:{default:{getCurrentUser:()=>({id:'1',username:'me'}),getUser:()=>null}}}[id]||null);
    const pages={VENUS_NODELETE:'noDelete',VENUS_MESSAGEHIGHLIGHT:'messageHighlight',VENUS_TRANSLATE:'translate',VENUS_GESTURES:'gestures',VENUS_FREENITRO:'freeNitro',
        VENUS_PASTELIZE:'pastelize',VENUS_PLATFORMINDICATORS:'platformIndicators',VENUS_REVIEWDB:'reviewDB',VENUS_USERNOTIF:'userNotif',VENUS_ACCOUNTSWITCHER:'accountSwitcher',
        VENUS_READALL:'readAll',VENUS_CUSTOMTHEMES:'customThemes',VENUS_QUESTS:'quests',VENUS_HIDDENCHANNELS:'hiddenChannels',VENUS_LANGUAGE:null};
    // Pages with live runtime status always show a status card when on; others lead directly with their preview or controls.
    const liveStatus=new Set(['VENUS_TRANSLATE','VENUS_REVIEWDB','VENUS_USERNOTIF','VENUS_ACCOUNTSWITCHER','VENUS_CUSTOMTHEMES','VENUS_QUESTS']);
    for (const on of [true,false]) for (const [id,key] of Object.entries(pages)) {
        if (key) b.api.setSetting(key,on);
        const nodes=pageNodes(b.registry[id].screen.getComponent()());
        assert.ok(nodes.length>3,id+' renders');
        // The Language list is the exception: 30 names in their own words read best without icons.
        if (id!=='VENUS_LANGUAGE') for (const row of nodes.filter(n=>n.type===TableSwitchRow||n.type===TableRadioRow))
            assert.equal(row.props.icon&&row.props.icon.type,TableRowIcon,id+': '+row.props.label+' has a row icon');
        const titles=nodes.filter(n=>n.type===Text&&n.props.variant==='text-md/semibold').map(n=>n.props.children);
        if (liveStatus.has(id) && on) assert.ok(titles.length,id+' shows its live status card');
        if (!on && key) assert.ok(titles.includes('Turned off'),id+' says it is turned off');
    }
});

// UI motion and feedback (1.15.0): every page still renders without Animated, and with it each group rises in.
function animatedHarness(b, RN) {
    const runs = [];
    class Value { constructor(v) { this.v = v; } setValue(v) { this.v = v; } interpolate(c) { return {interpolated:c, from:this}; } }
    const animation = (kind, value, config) => ({start(){ runs.push({kind, value, config}); value.v = config.toValue; }, stop(){}});
    RN.Animated = {Value, View:'AnimatedView', timing:(v, c) => animation('timing', v, c), spring:(v, c) => animation('spring', v, c),
        sequence:list => ({start(){ runs.push({kind:'sequence', list}); }, stop(){}}), loop:a => ({start(){ runs.push({kind:'loop'}); }, stop(){}}), delay:ms => ({ms})};
    let layout = 0; RN.LayoutAnimation = {Presets:{easeInEaseOut:'ease'}, create:() => 'custom', configureNext:() => { layout++; }};
    b.load(RN, null, 17);
    return {runs, get layout() { return layout; }};
}
test('option pages reveal their groups in turn on the native driver, and a switch eases the layout', () => {
    const b = settingsHarness(); const {React} = reactHarness(b); const RN = {View:'View', Text:'Text', Image:'Image', Modal:'Modal', Pressable:'Pressable', ScrollView:'Scroll'};
    const motion = animatedHarness(b, RN);
    const effects = []; React.useEffect = fn => effects.push(fn); let ref; React.useRef = v => ({current:v}); React.useState = init => [init, () => {}];
    function TableSwitchRow(){} b.context.__r = id => ({6621:{TableSwitchRow}}[id] || null);
    b.api.setSetting('gestures', true);
    const page = b.registry.VENUS_GESTURES.screen.getComponent()();
    const reveals = pageNodes(page).filter(n => n.type && n.type.name === 'VenusReveal');
    assert.ok(reveals.length >= 4, 'each group is wrapped');
    assert.deepEqual(reveals.map(n => n.props.index), reveals.map((_, i) => i), 'in order, so they rise one after another');
    // Render one reveal: it starts hidden and its effect times it in on the native driver, delayed by its place.
    const second = reveals[1].type(reveals[1].props);
    assert.equal(second.type, 'AnimatedView');
    effects.splice(0).forEach(fn => fn());
    const run = motion.runs.at(-1);
    assert.equal(run.kind, 'timing'); assert.equal(run.config.useNativeDriver, true); assert.equal(run.config.delay, 45);
    // A switch on the page eases the layout change it causes.
    const row = pageNodes(page).find(n => n.type === TableSwitchRow);
    const before = motion.layout; row.props.onValueChange(false); assert.equal(motion.layout, before + 1);
});
test('pages still render plainly when React Native has no Animated', () => {
    const b = settingsHarness(); const {React} = reactHarness(b); React.useRef = v => ({current:v});
    b.api.setSetting('quests', true);
    const reveals = pageNodes(b.registry.VENUS_QUESTS.screen.getComponent()()).filter(n => n.type && n.type.name === 'VenusReveal');
    const child = reveals[0].type(reveals[0].props);
    assert.equal(child, reveals[0].props.children, 'no wrapper view without Animated');
});
test('the Quests status card shows the running Quest\'s progress and the minutes left', async () => {
    const b = questHarness({quests:[playFixture('p1', 900, enrolledAgo(5))]});
    const {React} = reactHarness(b); React.useRef = v => ({current:v});
    b.connect();
    // Run until the first heartbeat is answered, not to the end.
    await b.run(30 * 1000);
    b.load({SettingsList(){}},null,14236);
    const registry = b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route', IconComponent(){}}}}, null, 14130).SETTING_RENDERER_CONFIG;
    const nodes = pageNodes(registry.VENUS_QUESTS.screen.getComponent()());
    const bar = nodes.find(n => n.type && n.type.name === 'VenusProgress');
    assert.ok(bar, 'a progress bar while a Quest runs');
    assert.ok(bar.props.value > 0 && bar.props.value < 1, 'part way: ' + bar.props.value);
    assert.ok(nodes.some(n => typeof n.props.children === 'string' && /About 14 minutes left\./.test(n.props.children)), 'minutes left');
    await b.run(30 * 60 * 1000);
    const after = pageNodes(registry.VENUS_QUESTS.screen.getComponent()());
    assert.equal(after.filter(n => n.type && n.type.name === 'VenusProgress').length, 0, 'no bar once nothing runs');
});
test('Read all shows a check for a moment after it clears something, and its label stays for screen readers', () => {
    const b = readAllHarness(); const timers = []; b.context.setTimeout = (fn, ms) => { timers.push(fn); return timers.length; };
    const render = () => { const button = findReadAll(b.props().listDataProps.renderItem(6,0)); return button.type(button.props).props.children; };
    assert.equal(render().props.children.type, 'Text');
    pressReadAll(b);
    const pill = render();
    assert.equal(pill.props.accessibilityLabel, 'Read all');
    assert.equal(pill.props.children.type.name, 'PopIn', 'a check pops in');
    timers.splice(0).forEach(fn => fn());
    assert.equal(render().props.children.type, 'Text', 'back to its label');
});
// Renders one component again and again with real hook order: state slots, refs and effects (run after each render,
// with deps), and fake timers you can run. Enough to test a preview's Watch and Try it modes end to end.
function hookHost(b, React, node) {
    const slots = [], refs = [], effects = [], timers = [];
    let i = 0, r = 0, e = 0, id = 0;
    b.context.setTimeout = (fn, ms) => { const t = {fn, ms, id:++id}; timers.push(t); return t.id; };
    b.context.clearTimeout = tid => { const k = timers.findIndex(t => t.id === tid); if (k >= 0) timers.splice(k, 1); };
    React.useState = init => { const k = i++; if (!(k in slots)) slots[k] = typeof init === 'function' ? init() : init;
        return [slots[k], v => { slots[k] = typeof v === 'function' ? v(slots[k]) : v; }]; };
    React.useRef = v => { const k = r++; if (!(k in refs)) refs[k] = {current:v}; return refs[k]; };
    React.useEffect = (fn, deps) => { const k = e++; const old = effects[k];
        const changed = !old || !deps || !old.deps || deps.length !== old.deps.length || deps.some((d, j) => d !== old.deps[j]);
        if (changed) effects[k] = {fn, deps, pending:true, cleanup:old && old.cleanup}; };
    function render() {
        i = r = e = 0;
        const tree = node.type(node.props);
        effects.forEach(x => { if (x.pending) { x.pending = false; if (typeof x.cleanup === 'function') x.cleanup(); x.cleanup = x.fn(); } });
        // The Watch / Try it switch is its own small component (no hooks of its own besides theme styles): draw it inline.
        const nodes = pageNodes(tree);
        return nodes.concat(...nodes.filter(n => n.type && ['PreviewToggle', 'NitroPicker'].includes(n.type.name)).map(n => pageNodes(n.type(n.props))));
    }
    // Runs timers one at a time (each may add the next), re-rendering after each, up to n steps.
    function run(n) { for (let k = 0; k < n && timers.length; k++) { const t = timers.shift(); t.fn(); render(); } }
    return {render, run, timers, texts:() => render().flatMap(x => Array.isArray(x.props.children) ? x.props.children : [x.props.children]).filter(c => typeof c === 'string')};
}
function previewNode(b, id, name) { return pageNodes(b.registry[id].screen.getComponent()()).find(n => n.type && n.type.name === name); }
// The caption shown by the player strip, its step badge (2/5) and time (0:03 / 0:24).
function strip(host) {
    const nodes = host.render(), texts = nodes.filter(n => typeof n.props.children === 'string').map(n => n.props.children);
    return {step:texts.find(t => /^\d+\/\d+$/.test(t)), time:texts.find(t => /^\d+:\d\d \/ \d+:\d\d$/.test(t)),
        button:label => nodes.find(n => n.props && n.props.accessibilityLabel === label)};
}
test('the Tap gestures preview can be tried: a tip shows what to tap next, double-tap replies or edits, triple-tap deletes', () => {
    const b = settingsHarness(); const {React} = reactHarness(b);
    let clock = 1000; b.context.__clock = () => clock; vm.runInContext('Date.now=function(){return __clock();}', b.context);
    b.api.setSetting('gestures', true);
    const host = hookHost(b, React, previewNode(b, 'VENUS_GESTURES', 'GesturePreview'));
    host.render();
    host.render().find(n => n.props && n.props.accessibilityLabel === 'Try it').props.onPress();
    host.timers.length = 0;
    // Find the pressable of each message by the message key it wraps.
    const msg = who => host.render().find(n => n.props && n.props.key === who && n.props.children && pageNodes(n.props.children).some(c => c.props && c.props.accessibilityRole === 'button'));
    const tap = who => { pageNodes(msg(who).props.children).find(c => c.props && c.props.accessibilityRole === 'button').props.onPress(); clock += 100; };
    assert.ok(host.texts().includes("Double-tap Sam's message to reply"), 'a tip says what to try first');
    assert.ok(!host.render().some(n => n.props && n.props.accessibilityLabel === 'Pause'), 'no player in Try it');
    tap('theirs'); assert.ok(!host.texts().includes('Replying to Sam'), 'one tap does nothing');
    tap('theirs'); assert.ok(host.texts().includes('Replying to Sam'));
    assert.ok(host.texts().includes('Now double-tap your message to edit it'), 'then the next thing to try');
    // Your own: a double-tap waits a moment for a third tap, then edits.
    tap('mine'); tap('mine'); assert.ok(!host.texts().includes('Editing message'), 'waits for a possible third tap');
    host.run(1); assert.ok(host.texts().includes('Editing message'));
    assert.ok(host.texts().includes('Now tap your message three times to delete it'));
    // A third tap deletes it, and it comes back a moment later.
    clock += 2000; tap('mine'); tap('mine'); tap('mine');
    assert.ok(host.texts().includes('Message deleted')); assert.ok(!host.texts().includes("I'm in!"), 'gone from the chat');
    assert.ok(host.texts().includes("That's everything. Double-tap again any time."));
    host.run(1); assert.ok(host.texts().includes("I'm in!"), 'back again');
    b.api.setSetting('gestureOwn', 'reply'); b.api.setSetting('gestureTripleDelete', false); clock += 2000;
    tap('mine'); tap('mine'); assert.ok(host.texts().includes('Replying to You'));
});
// Runs a Watch story once through and returns how long each caption stayed up (ms), plus everything it showed.
function storyTimes(host, max = 300) {
    let now = 0, cap = null, from = 0; const times = [], seen = new Set();
    host.render();
    for (let k = 0; k < max; k++) {
        const t = host.timers[0]; if (!t) break; now += t.ms; host.run(1);
        const nodes = host.render(), texts = nodes.filter(n => typeof n.props.children === 'string').map(n => n.props.children); texts.forEach(x => seen.add(x));
        const capNode = nodes.find(n => n.type && n.type.name === 'PopIn' && /^cap:/.test(n.props.key)), c = capNode ? capNode.props.key.slice(4) : null;
        if (c !== cap) { if (cap) times.push([cap, now - from]); cap = c; from = now; }
        if (/^0:00 \//.test(texts.find(x => / \/ /.test(x)) || '') && k > 2) break;
    }
    return {times, seen};
}
test('Watch plays like a short video: each caption stays up long enough to read, with its step, the time, pause and start over', () => {
    const b = settingsHarness(); const {React} = reactHarness(b);
    b.api.setSetting('gestures', true);
    const host = hookHost(b, React, previewNode(b, 'VENUS_GESTURES', 'GesturePreview'));
    host.render();
    // Follow the clock: how long each caption stays on screen.
    let now = 0; const shownAt = new Map(), seen = new Set(), steps = new Set(), drafts = new Set(); let ripples = 0, prev = null, total = null;
    for (let k = 0; k < 120; k++) {
        const t = host.timers[0]; if (!t) break; now += t.ms; host.run(1);
        const st = strip(host); const cap = host.texts().find(x => /^(Sam asks|You double-tap|A reply to Sam|You send it|Then Sam says|You change your mind|It's deleted)/.test(x));
        host.texts().forEach(x => seen.add(x)); if (st.step) steps.add(st.step); if (!total && st.time) total = st.time.split(' / ')[1];
        if (cap && cap !== prev) { if (prev) shownAt.set(prev, now - shownAt.get(prev)); shownAt.set(cap, now); prev = cap; }
        if (host.render().some(n => n.type && n.type.name === 'TapRipple')) ripples++;
        host.render().filter(n => n.type === 'Text' && n.props.numberOfLines === 1).forEach(n => drafts.add(n.props.children));
        if (seen.has('Message deleted') && k > 40) break;
    }
    for (const t of ["Sam asks if anyone wants to play", "You double-tap Sam's message", 'A reply to Sam opens, ready to type', 'You send it',
        'Then Sam says it starts at 6 AM', 'You change your mind and tap your message three times', "It's deleted at once, with no question",
        'Replying to Sam', 'Great, it starts at 6 AM!', 'Message deleted']) assert.ok(seen.has(t), 'shows: ' + t);
    for (const [cap, ms] of shownAt) if (typeof ms === 'number' && ms < 1e9 && ms > 0) assert.ok(ms >= 2400, cap + ' stays up ' + ms + ' ms');
    assert.ok(drafts.has('I'), 'types the reply letter by letter'); assert.ok(ripples >= 5, 'a ripple for each tap: ' + ripples);
    assert.ok(steps.has('1/7') && steps.has('7/7'), 'shows which step of how many: ' + [...steps]);
    assert.match(total, /^0:[1-5]\d$/, 'about half a minute long: ' + total);
    // Pause stops time; Play goes on; Start over goes back to 0:00.
    const before = strip(host).time; strip(host).button('Pause').props.onPress(); host.render();
    assert.equal(host.timers.length, 0, 'paused: nothing runs'); assert.equal(strip(host).time, before);
    assert.ok(strip(host).button('Play')); strip(host).button('Play').props.onPress(); host.render(); assert.ok(host.timers.length > 0);
    strip(host).button('Start over').props.onPress(); host.render(); assert.match(strip(host).time, /^0:00 \//);
    // Every caption, through one whole loop, stays up long enough to read.
    const run = storyTimes(hookHost(b, React, previewNode(b, 'VENUS_GESTURES', 'GesturePreview')));
    assert.equal(run.times.length, 7); for (const [cap, ms] of run.times) assert.ok(ms >= 2400, cap + ': ' + ms + ' ms');
    // Without triple-tap, the story ends by editing instead.
    b.api.setSetting('gestureTripleDelete', false);
    const again = hookHost(b, React, previewNode(b, 'VENUS_GESTURES', 'GesturePreview'));
    again.render(); const seen2 = new Set();
    for (let k = 0; k < 120 && !seen2.has('Editing message'); k++) { again.run(1); again.texts().forEach(t => seen2.add(t)); }
    assert.ok(seen2.has('It opens for editing, so you can fix it') && !seen2.has('Message deleted'));
});
test('Hidden channels preview lists the locked channel only while it is on', () => {
    const b = settingsHarness(); const {React} = reactHarness(b);
    const names = on => { b.api.setSetting('hiddenChannels', on);
        const host = hookHost(b, React, previewNode(b, 'VENUS_HIDDENCHANNELS', 'HiddenChannelsPreview'));
        return host.render().filter(n => n.type === 'Text' && /^[a-z-]+$/.test(n.props.children)).map(n => n.props.children); };
    assert.deepEqual(names(true), ['general', 'staff-only', 'memes', 'clips']);
    assert.deepEqual(names(false), ['general', 'memes', 'clips']);
});
test('Hidden channels preview plays at a readable pace: scrolling past opens nothing, a tap opens Discord\'s dialog or does nothing', () => {
    const b = settingsHarness(); const {React} = reactHarness(b);
    b.api.setSetting('hiddenChannels', true);
    const host = hookHost(b, React, previewNode(b, 'VENUS_HIDDENCHANNELS', 'HiddenChannelsPreview'));
    let ripple = false; const orig = host.run; host.run = n => { orig(n); if (host.render().find(x => x.type && x.type.name === 'HiddenPreviewRow').props.ripple) ripple = true; };
    const run = storyTimes(host), caps = run.times.map(x => x[0]);
    for (const t of ['Locked channels show in the list with a lock, like staff-only here', 'Scrolling past it, or opening the server, opens nothing',
        'Only a tap on it opens its details', 'You see when it was made and last used. View Anyway would open it']) assert.ok(caps.includes(t), 'caption: ' + t);
    for (const [cap, ms] of run.times) assert.ok(ms >= 2400, cap + ': ' + ms + ' ms');
    for (const t of ['Game Night', 'TEXT CHANNELS', 'Locked channel', 'LAST MESSAGE', 'View Anyway', 'Cancel']) assert.ok(run.seen.has(t), 'shows: ' + t);
    assert.ok(ripple, 'the tap shows where it lands');
    b.api.setSetting('hiddenChannelsMenu', false);
    const off = hookHost(b, React, previewNode(b, 'VENUS_HIDDENCHANNELS', 'HiddenChannelsPreview'));
    let shook = 0; const o2 = off.run; off.run = n => { o2(n); shook = Math.max(shook, off.render().find(x => x.type && x.type.name === 'HiddenPreviewRow').props.shake); };
    const r2 = storyTimes(off);
    assert.ok(r2.times.some(([c]) => c === 'Nothing happens: you turned its details off') && !r2.seen.has('Locked channel'));
    assert.equal(shook, 1, 'the row shakes instead');
});
test('the Features entry says how many are on', () => {
    const b = settingsHarness();
    const on = () => { const m = /^(\d+) of 31 turned on$/.exec(b.registry.VENUS_PLUGINS.useDescription()); assert.ok(m); return Number(m[1]); };
    b.api.setSetting('dashless', false); const before = on();
    b.api.setSetting('dashless', true); assert.equal(on(), before + 1);
});
test('Message highlights preview glows only the highlight you just changed, never on first open', () => {
    const b = boot({messageHighlight:true, noDelete:true}); const {React} = reactHarness(b);
    const ref = {current:null}; React.useRef = () => ref; React.useState = init => [init, () => {}];
    b.api.setSetting('messageHighlight', true);
    const registry = b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route', IconComponent(){}}}}, null, 14130).SETTING_RENDERER_CONFIG;
    const fresh = () => { const f = pageNodes(registry.VENUS_MESSAGEHIGHLIGHT.screen.getComponent()()).find(n => n.type && n.type.name === 'HighlightPreview').props.fresh;
        return f ? [f.reply, f.deleted] : [false, false]; };
    assert.deepEqual(fresh(), [false, false], 'nothing glows when the page opens');
    b.api.setSetting('messageHighlightPingColor', 'pink');
    assert.deepEqual(fresh(), [true, false], 'only replies and mentions');
    assert.deepEqual(fresh(), [false, false], 'and only once');
    b.api.setSetting('messageHighlightThickness', 3);
    assert.deepEqual(fresh(), [true, true], 'a new width shows on both');
});
test('Message highlights preview shows a clean static picture of your question, Sam\'s reply and Alex\'s kept deleted message, without a Watch player', () => {
    const b = boot({messageHighlight:true, noDelete:true}); const {React} = reactHarness(b);
    b.api.setSetting('messageHighlight', true);
    const registry = b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route', IconComponent(){}}}}, null, 14130).SETTING_RENDERER_CONFIG;
    const node = () => pageNodes(registry.VENUS_MESSAGEHIGHLIGHT.screen.getComponent()()).find(n => n.type && n.type.name === 'HighlightPreview');
    const host = hookHost(b, React, node());
    const glows = () => host.render().filter(n => n.type && n.type.name === 'HighlightGlow');
    assert.equal(glows().length, 2, 'both the reply and the kept deleted message are shown right away');
    for (const t of ['Did everyone see the new update?', 'Yes, it looks great!', 'Oops, wrong chat. Deleting this.'])
        assert.ok(host.texts().some(s => s.includes(t)), 'shows: ' + t);
    assert.ok(!host.render().some(n => n.props && (n.props.accessibilityLabel === 'Try it' || n.props.accessibilityLabel === 'Pause')), 'no Watch / Try it toggle or player');
});
test('Hidden channels preview uses Discord\'s locked-channel icon and tapping it does what a real tap does', () => {
    const b = settingsHarness(); const {React} = reactHarness(b); const shown = [];
    b.context.__r = id => ({5393:{TextLockIcon:'TL'}, 5205:{default:{show:o => shown.push(o)}}, 4833:{Text(){}}}[id] || null);
    b.api.setSetting('hiddenChannels', true);
    const host = hookHost(b, React, previewNode(b, 'VENUS_HIDDENCHANNELS', 'HiddenChannelsPreview'));
    host.render(); host.render().find(n => n.props && n.props.accessibilityLabel === 'Try it').props.onPress(); host.timers.length = 0;
    const row = () => host.render().find(n => n.type && n.type.name === 'HiddenPreviewRow');
    const icon = row().props.children[0];
    assert.equal(icon.type({size:'sm'}).type, 'TL', 'the # with a small lock, not a separate big lock');
    row().props.onPress(); assert.equal(shown.length, 1, 'opens the same details Discord shows for a locked channel');
    assert.equal(shown[0].confirmText, 'View Anyway');
    shown[0].onCancel();
    b.api.setSetting('hiddenChannelsMenu', false); row().props.onPress(); assert.equal(shown.length, 1, 'with the menu off, nothing opens');
    assert.equal(row().props.shake, 1, 'it shakes instead');
});
test('Device indicators preview shows the real screens around the icons and follows every option directly without a Watch loop', () => {
    const b = settingsHarness(); const {React} = reactHarness(b);
    b.api.setSetting('platformIndicators', true);
    const host = hookHost(b, React, previewNode(b, 'VENUS_PLATFORMINDICATORS', 'PlatformPreview'));
    host.render();
    assert.ok(!host.render().some(n => n.props && (n.props.accessibilityLabel === 'Watch' || n.props.accessibilityLabel === 'Pause')), 'directly interactive without a Watch loop');
    const nodes = () => { const n = host.render(); return n.concat(...n.filter(x => x.type && x.type.name === 'PreviewSegmented').map(x => pageNodes(x.props.items.map(i => ({type:'Tab', props:{label:i.label, onPress:() => x.props.onChange(i.value)}}))))); };
    const icons = () => nodes().filter(n => n.type && n.type.name === 'PopIn' && /^pi/.test(n.props.key)).map(n => n.props.key.split(':')[0]);
    const pick = label => nodes().find(n => n.type === 'Tab' && n.props.label === label).props.onPress();
    const texts = () => host.texts();
    // A DM: Discord's header with Alex, the chat and the message bar; the icons sit next to the name.
    assert.deepEqual(icons(), ['piDmHeader']);
    assert.ok(texts().includes('Are you coming to the game tonight?') && texts().includes('Message @Alex'));
    // Members: Discord's Online header, Alex and two others, each with their own icons.
    pick('Members'); assert.deepEqual(icons(), ['piUserList', 'piUserList', 'piUserList']);
    assert.ok(texts().some(t => /^ONLINE — 3$/.test(t)) && texts().includes('Riley'));
    // Profile: the name, a Message button.
    pick('Profile'); assert.deepEqual(icons(), ['piProfile']); assert.ok(texts().includes('Message'));
    // Each screen follows its own switch, and says when it's off.
    b.api.setSetting('piProfile', false); assert.deepEqual(icons(), []); assert.ok(texts().includes('Off in your options: no icons here'));
    b.api.setSetting('piProfile', true);
    // Change Alex's devices: on a phone only, the avatar shows Discord's phone badge unless Hide the phone badge is on.
    const phone = () => nodes().some(n => n.props && n.props.style && n.props.style.borderRadius === 2);
    const change = () => nodes().find(n => n.props && n.props.accessibilityHint === "Tap to change Alex's devices").props.onPress();
    assert.match(texts().find(t => /^Alex is on: /.test(t)), /Desktop \(Online\), Mobile \(Idle\)/);
    change(); assert.equal(texts().find(t => /^Alex is on: /.test(t)), 'Alex is on: Mobile (Online)');
    assert.equal(phone(), false, 'hidden by default');
    b.api.setSetting('piHideMobile', false); assert.equal(phone(), true, 'phone badge shows when not hidden');
    b.api.setSetting('platformIndicators', false);
    const off = hookHost(b, React, previewNode(b, 'VENUS_PLATFORMINDICATORS', 'PlatformPreview'));
    assert.deepEqual(off.render().filter(n => n.type && n.type.name === 'PopIn' && /^pi/.test(n.props.key)), [], 'no icons while off');
});
test('Nitro preview shows Discord\'s own Wumpus, sent from Discord\'s expression picker without a lock badge; Try it guides you through an emoji and a sticker', () => {
    const b = nitroHarness(); const {React} = reactHarness(b);
    let read = 0; b.load({default:{getCustomEmojiById:() => null, getGuilds:() => { read++; return {}; }}}, null, 5772);
    const registry = b.load({SETTING_RENDERER_CONFIG:{ACCOUNT:{type:'route', IconComponent(){}}}}, null, 14130).SETTING_RENDERER_CONFIG;
    b.api.setSetting('freeNitro', true);
    const node = pageNodes(registry.VENUS_FREENITRO.screen.getComponent()()).find(x => x.type && x.type.name === 'NitroPreview');
    const host = hookHost(b, React, node);
    host.render(); host.render().find(n => n.props && n.props.accessibilityLabel === 'Try it').props.onPress(); host.timers.length = 0;
    const arts = () => host.render().filter(x => x.type && x.type.name === 'NitroArt').map(n => pageNodes(n.type(n.props)).find(x => x.type === 'Image').props.source.uri);
    const sent = () => host.texts().find(t => /^Sent as /.test(t));
    const send = () => host.render().find(n => n.props && n.props.accessibilityHint === 'Tap to send it').props.onPress();
    assert.ok(host.texts().includes('Nothing sent yet') && host.texts().includes('Tap the Nitro emoji below to send it as a link'));
    assert.ok(host.texts().includes('Find the perfect emoji') && host.texts().includes('GAME NIGHT'), 'looks like Discord\'s expression picker');
    const nitroBtn = host.render().find(n => n.props && n.props.accessibilityHint === 'Tap to send it');
    assert.equal(nitroBtn.props.accessibilityLabel, 'wumpus_wave', 'the picker has the Nitro emoji');
    assert.ok(!pageNodes(nitroBtn).some(n => n.type && /Lock/.test(n.type.name || '')), 'no lock badge when unlocked by the feature');
    send(); assert.deepEqual(arts(), ['modules_guilds_bar_native_images_wumpus_wave'], 'an image bundled in Discord, shown as chat shows it');
    assert.equal(sent(), 'Sent as [wumpus_wave](\u2026)');
    assert.ok(host.texts().includes('Tap the emoji button in the message bar to try a sticker'));
    host.render().find(n => n.props && n.props.accessibilityLabel === 'Open expression picker').props.onPress();
    assert.ok(host.texts().includes('Find the perfect sticker') && host.texts().includes('Tap the Nitro sticker below to send it as a link'));
    send();
    assert.deepEqual(arts(), ['modules_guilds_bar_native_images_wumpus_wave', 'images_native_gifting_wumpus_box_premium120'], 'then the sticker');
    assert.ok(host.texts().includes("That's how everyone sees it. Tap the emoji button to send more"));
    b.api.setSetting('hyperlinks', false); assert.match(sent(), /^Sent as https:\/\/media\.discordapp\.net\/stickers\//);
    assert.equal(read, 0, 'never reads your servers\' emojis or stickers');
});
test('Nitro preview plays at a readable pace: open the picker from the emoji button, pick the unlocked Nitro emoji, everyone sees it; then a sticker', () => {
    const b = settingsHarness(); const {React} = reactHarness(b);
    b.api.setSetting('freeNitro', true);
    const host = hookHost(b, React, previewNode(b, 'VENUS_FREENITRO', 'NitroPreview'));
    const kinds = new Set(); const orig = host.run; host.run = n => { orig(n); host.render().filter(x => x.type && x.type.name === 'NitroArt').forEach(x => kinds.add(x.props.kind)); };
    const run = storyTimes(host), caps = run.times.map(x => x[0]);
    for (const t of ['You open the emoji picker', "You pick a Nitro emoji from another server. Venus unlocks it so there's no lock",
        'Venus sends it as a short link, and everyone sees the emoji', 'Then you open the sticker picker', "It's sent as a short link too, and everyone sees the sticker"])
        assert.ok(caps.includes(t), 'caption: ' + t + ' / ' + caps.join(' | '));
    for (const [cap, ms] of run.times) assert.ok(ms >= 2400, cap + ': ' + ms + ' ms');
    assert.deepEqual([...kinds].sort(), ['emoji', 'sticker']);
    // With only stickers on, it skips the emoji.
    b.api.setSetting('emojis', false);
    const only = storyTimes(hookHost(b, React, previewNode(b, 'VENUS_FREENITRO', 'NitroPreview')));
    assert.ok(!only.times.some(([c]) => c === 'You open the emoji picker') && only.times.some(([c]) => /sticker/.test(c)));
    // Both off: no toggle, nothing plays.
    b.api.setSetting('stickers', false);
    const none = hookHost(b, React, previewNode(b, 'VENUS_FREENITRO', 'NitroPreview'));
    assert.ok(!none.render().some(n => n.props && n.props.accessibilityLabel === 'Watch')); assert.equal(none.timers.length, 0);
});
test('Deleted messages and Pastel names previews show the final chat picture directly and follow their options live without a Watch loop', () => {
    const b = settingsHarness(); const {React} = reactHarness(b);
    b.api.setSetting('noDelete', true); b.api.setSetting('noDeleteEdits', true);
    const host = hookHost(b, React, previewNode(b, 'VENUS_NODELETE', 'NoDeletePreview'));
    assert.ok(!host.render().some(n => n.props && (n.props.accessibilityLabel === 'Try it' || n.props.accessibilityLabel === 'Pause')), 'no Watch / Try it on Deleted messages');
    assert.equal(host.render().filter(n => n.type && n.type.name === 'PopIn' && /^old:/.test(n.props.key)).length, 2, 'shows both earlier versions crossed out');
    for (const t of ['See you at 6', 'See you at 7', 'See you at 8', 'Oops, wrong chat. Deleting this.'])
        assert.ok(host.texts().includes(t), 'shows: ' + t);
    b.api.setSetting('noDeleteEdits', false);
    const plain = hookHost(b, React, previewNode(b, 'VENUS_NODELETE', 'NoDeletePreview'));
    assert.equal(plain.render().filter(n => n.type && n.type.name === 'PopIn' && /^old:/.test(n.props.key)).length, 0, 'no history when Show edit history is off');
    b.api.setSetting('pastelize', true);
    const pastel = hookHost(b, React, previewNode(b, 'VENUS_PASTELIZE', 'PastelPreview'));
    assert.ok(!pastel.render().some(n => n.props && (n.props.accessibilityLabel === 'Try it' || n.props.accessibilityLabel === 'Pause')), 'no Watch / Try it on Pastel names');
    for (const t of ['Alex', 'Sam', 'Jordan', 'Has anyone tried the new update?', 'Yes, it looks great!', 'Same here.'])
        assert.ok(pastel.texts().includes(t), 'shows: ' + t);
});
test('Translate preview plays your choice at a readable pace (on its own, or Hold and Translate in the menu); Try it guides you', () => {
    const b = settingsHarness(); const {React} = reactHarness(b);
    b.api.setSetting('translate', true);
    const play = () => storyTimes(hookHost(b, React, previewNode(b, 'VENUS_TRANSLATE', 'TranslatePreview')));
    const auto = play(), caps = auto.times.map(x => x[0]);
    assert.ok(caps.includes('Lucía writes in Spanish') && caps.some(c => /translates it on its own$/.test(c)) && caps.some(c => /^Now it reads in /.test(c)), caps.join(' | '));
    assert.ok(caps.includes('The small note under it says what language it was in'));
    for (const [cap, ms] of auto.times) assert.ok(ms >= 2400, cap + ': ' + ms + ' ms');
    assert.ok(auto.seen.has('Translating…') && auto.seen.has("Hi everyone! Who's coming tonight?"));
    b.api.setSetting('translateMode', 'manual');
    const manual = play(), mcaps = manual.times.map(x => x[0]);
    assert.ok(mcaps.includes('You hold the message to open its menu') && mcaps.includes('And tap Translate'), mcaps.join(' | '));
    assert.ok(manual.seen.has('Reply') && manual.seen.has('Copy Text'), 'Discord\'s message menu shows');
    for (const [cap, ms] of manual.times) assert.ok(ms >= 2400, cap + ': ' + ms + ' ms');
    // Try it: hold the message to open Discord's message menu, then tap Translate or Show original in the menu.
    const host = hookHost(b, React, previewNode(b, 'VENUS_TRANSLATE', 'TranslatePreview'));
    host.render(); host.render().find(n => n.props && n.props.accessibilityLabel === 'Try it').props.onPress(); host.timers.length = 0;
    assert.ok(host.texts().includes('Hold the message to open its menu'));
    assert.ok(!host.texts().includes("Hi everyone! Who's coming tonight?"), 'starts in Spanish when mode is manual');
    const hold = () => host.render().find(n => n.props && n.props.accessibilityHint === 'Hold the message to open its menu').props.onLongPress();
    hold();
    assert.ok(host.texts().includes('Reply') && host.texts().includes('Copy Text') && host.texts().includes('Tap Translate in the menu'), 'menu opens on hold');
    host.render().find(n => n.props && n.props.key === 'translate' && n.props.onPress).props.onPress();
    assert.ok(host.texts().includes("Hi everyone! Who's coming tonight?") && host.texts().includes('Hold it again to show the original'));
    hold();
    assert.ok(host.texts().includes('Tap Show original in the menu'));
    host.render().find(n => n.props && n.props.key === 'translate' && n.props.onPress).props.onPress();
    assert.ok(!host.texts().includes("Hi everyone! Who's coming tonight?") && !host.texts().includes('Hold it again to show the original'));
});
