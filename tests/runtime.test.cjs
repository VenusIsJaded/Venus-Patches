const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const raw = fs.readFileSync('patches/src/main/resources/venus/bootstrap.js', 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function boot(features = {picker:true, voice:true}) {
    const warnings = [];
    const context = vm.createContext({console: {warn: (...args) => warnings.push(args)}});
    const source = raw.replace('/*__FEATURES__*/', JSON.stringify(features));
    vm.runInContext(source, context);
    const factories = new Map();
    context.__d = (factory, id) => factories.set(id, factory);
    function load(exports, factory, explicitId) {
        const value = exports && exports.default || exports;
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
test('pre-existing Metro definition is decorated', () => {
    const factories = new Map();
    const context = vm.createContext({__d:(f,id) => factories.set(id,f), console});
    vm.runInContext(raw.replace('/*__FEATURES__*/', '{picker:true,voice:true}'), context);
    context.__d((g,r,i,a,module) => { module.exports = {getAttachmentPayload:() => ({})}; }, 5377, []);
    const module = {exports:{}};
    factories.get(5377)(context,null,null,null,module,module.exports);
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
test('root menu wraps Discord only and preserves provider arguments', () => {
    const b=boot(); const registrations=[];
    const registry=b.load({registerComponent(...args){registrations.push(args);return 1;}});
    const provider=arg => {assert.equal(arg,'extra');return function App(){};};
    registry.registerComponent('Discord',provider,true);
    assert.equal(typeof registrations[0][1]('extra'),'function'); assert.equal(b.api.status.menu,true);
    registry.registerComponent('LogBox',provider); assert.equal(registrations[1][1],provider);
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
test('conversion disabled has no codec bridge calls for audio uploads', async () => {
    const b=boot();let calls=0;
    b.load({default:native({getSize:async () => {calls++;return 1;}})});
    class CloudUpload {constructor(){this.item={uri:'content://audio',mimeType:'audio/mp3'};this.mimeType='audio/mp3';}
        reactNativeCompressAndExtractData(){return Promise.resolve(this);}}
    b.load({CloudUpload}); const upload=new CloudUpload();
    await upload.reactNativeCompressAndExtractData();assert.equal(calls,0);
});
