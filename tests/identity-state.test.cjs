const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/\r\n/g,'\n');
const original={id:'reused-name',name:'Original',roles:['ADMIN'],identityId:'10000000-0000-4000-8000-000000000011',sessionVersion:1,authorizationRevision:'rev-one'};
const replacement={...original,identityId:'10000000-0000-4000-8000-000000000012'};
const token='header.'+Buffer.from(JSON.stringify(original)).toString('base64url')+'.forged';
const section=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start+a.length);assert(start>=0&&end>start);return html.slice(start,end);};
const tick=()=>new Promise(setImmediate);
function fixture({verify=async()=>original,search='?sso='+token,hostname='akra-web.github.io'}={}){
 const store=new Map(),events={},nodes=new Map(),calls=[],errors=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},hidden:false,innerHTML:'',textContent:''});return nodes.get(id);};
 const window={location:{search,hostname,pathname:'/TRDAKRA/'},history:{replaceState(){}},addEventListener:(n,fn)=>events[n]=fn,
  AkraModule:{embedded:false,getToken:()=>'',isLocalPreview:()=>hostname==='localhost'&&search==='?demo=1',verifySession:verify,authRequired(){}}};
 const ctx=vm.createContext({window,location:window.location,document:{getElementById:node,title:'Fixture'},URLSearchParams,Buffer,
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  console:{log(){},warn(){},error(){}},alert:m=>errors.push(m),setTimeout(){},showLoading(){},hideLoading(){},render(){},
  fetchInitialData:()=>calls.push('initial'),TRD_API_URL:'https://fixture.invalid/trd',performance:{now:()=>0},
  fetch:()=>{throw Error('unconfigured transport');},state:{items:[],products:[],checkStockCheckedLocations:{},surveyData:{},surveyLogsRequestId:0,productMovementRequestId:0,productMovementDetailRequestId:0}});
 vm.runInContext(section('        const SSO_CONFIG','        function sendAppLog('),ctx);
 vm.runInContext(section('        const TRD_CACHE_TTL','        function itemsUrl('),ctx);
 const user=(u,t=token)=>{window.appSession=u?{...u}:null;ctx.boundToken=u?t:null;vm.runInContext('sessionToken=boundToken',ctx);};
 return{ctx,window,store,events,node,calls,errors,user};
}
test('TRD URL/cached tokens and localhost wait for verified Main, never local decoded claims',async()=>{
 for(const mode of ['url','cached','localhost'])for(const outcome of ['allow','deny','replaced']){
  let finish,verified=0;
  const f=fixture({hostname:mode==='localhost'?'localhost':undefined,verify:(id,t)=>{assert.equal(id,'app-trd');assert.equal(t,token);verified++;return new Promise((resolve,reject)=>finish=()=>outcome==='deny'?reject(Error('denied')):resolve(original));}});
  if(mode==='cached'){f.window.location.search='';f.store.set('akra_trdakra_session',JSON.stringify({...original,token}));}
  const pending=f.ctx.ssoInit();await tick();assert.equal(f.calls.length,0,'no data/cache before verification');assert.equal(verified,1);
  if(outcome==='replaced')f.store.set('akra_trdakra_session','new-login');finish();await pending;
  assert.equal(f.calls.length,outcome==='allow'?1:0);
  if(outcome==='allow')assert.equal(f.window.appSession.identityId,original.identityId);
  if(outcome==='replaced')assert.equal(f.store.get('akra_trdakra_session'),'new-login');
 }
});
test('TRD cache and checked-location/survey state isolate owner; cache also isolates session/revision',()=>{
 const f=fixture();f.store.set('TRDAKRA_DATA',JSON.stringify({_ts:Date.now(),_d:'legacy'}));f.user(original);
 assert.equal(f.ctx.getCache('TRDAKRA_DATA',60000),null);f.ctx.setCache('TRDAKRA_DATA','original');
 f.ctx.setTrdUserState('TRDAKRA_CHECKED_LOCATIONS',{W1:'date'});f.ctx.setTrdUserState('TRDAKRA_SURVEY_SESSION',{floor:'1',data:{A:{currentStock:'2'}}});
 f.user(replacement);assert.equal(f.ctx.getCache('TRDAKRA_DATA',60000),null);assert.equal(f.ctx.getTrdUserState('TRDAKRA_SURVEY_SESSION'),null);
 f.user({...original,authorizationRevision:'rev-two'});assert.equal(f.ctx.getCache('TRDAKRA_DATA',60000),null);assert.equal(f.ctx.getTrdUserState('TRDAKRA_CHECKED_LOCATIONS').W1,'date');
 f.user({...original,sessionVersion:2});assert.equal(f.ctx.getCache('TRDAKRA_DATA',60000),null);
 f.user(original);assert.equal(f.ctx.getCache('TRDAKRA_DATA',60000),'original');f.ctx.removeCache('TRDAKRA_DATA');assert.equal(f.ctx.getCache('TRDAKRA_DATA',60000),null);
 assert.equal(JSON.parse(f.store.get('TRDAKRA_DATA'))._d,'legacy');f.user(null);assert.equal(f.ctx.setTrdUserState('x',{}),false);
});
test('TRD standalone own-session replacement hides UI, keeps new login and blocks late mutation',async()=>{
 const f=fixture();await f.ctx.ssoInit();let finish;
 vm.runInContext(section('        async function postMutation(','        // ข้อความ error'),f.ctx);
 f.ctx.fetch=()=>new Promise(resolve=>finish=resolve);
 const pending=f.ctx.postMutation({action:'updateProductDetails'});
 f.store.set('akra_trdakra_session','new-login');f.events.storage({key:'akra_trdakra_session',oldValue:'old',newValue:'new'});
 finish({ok:true,json:async()=>({success:true})});await assert.rejects(pending,e=>e.reason==='session_changed');
 assert.equal(f.node('app-root').hidden,true);assert.equal(f.window.appSession,null);assert.equal(f.store.get('akra_trdakra_session'),'new-login');
 for(const id of ['trd-topbar','trd-module-nav','trd-mobile-menu-root'])assert.equal(f.node(id).hidden,true,id);
});
test('TRD bootstrap late data cannot overwrite a new session or newer request; denial hides cache',async()=>{
 const f=fixture();f.user(original);const pending=[];let renders=0;
 Object.assign(f.ctx,{mapItemData:x=>x,needsFullHistoryForCurrentView:()=>false,render:()=>renders++,fetch:()=>new Promise(resolve=>pending.push(resolve))});
 vm.runInContext(section('        async function fetchInitialData(','        // ส่ง mutation'),f.ctx);
 const old=f.ctx.fetchInitialData(),fresh=f.ctx.fetchInitialData(true);
 pending[1]({ok:true,json:async()=>({items:[{id:'fresh'}]})});await fresh;pending[0]({ok:true,json:async()=>({items:[{id:'stale'}]})});await old;
 assert.equal(f.ctx.state.items[0].id,'fresh');
 const prior=f.ctx.fetchInitialData(true);f.user(replacement,'replacement-token');pending[2]({ok:true,json:async()=>({items:[{id:'old-owner'}]})});await prior;
 assert.equal(f.ctx.state.items[0].id,'fresh');
 const denied=f.ctx.fetchInitialData();pending[3]({ok:false,status:403,json:async()=>({reason:'permission_denied'})});await denied;
 assert.equal(f.window.appSession,null);assert.equal(f.node('app-root').hidden,true);
});
test('TRD explicit demo remains network-free and does not authorize mutations or load legacy state',async()=>{
 const f=fixture({search:'?demo=1',hostname:'localhost'});let network=0;
 Object.assign(f.ctx,{fetch:()=>{network++;throw Error('unexpected network');},needsFullHistoryForCurrentView:()=>false});
 vm.runInContext(section('        async function fetchInitialData(','        // ข้อความ error'),f.ctx);
 await f.ctx.ssoInit();assert.equal(network,0);
 await assert.rejects(f.ctx.postMutation({action:'updateProductDetails'}));assert.equal(network,0);
});
test('TRD full history and survey late responses cannot repopulate replaced-account data',async()=>{
 for(const kind of ['history','survey']){
  const f=fixture();f.user(original);let finish;
  f.ctx.fetch=()=>new Promise(resolve=>finish=resolve);f.ctx.mergeItemsById=(_old,rows)=>rows;
  vm.runInContext(kind==='history'?section('        async function ensureFullHistoryLoaded(','        async function fetchInitialData('):section('        async function fetchSurveyLogs(','        function selectSurveyMonth('),f.ctx);
  const pending=kind==='history'?f.ctx.ensureFullHistoryLoaded():f.ctx.fetchSurveyLogs('2026_09');
  f.user(replacement,'new-token');finish({ok:true,json:async()=>({status:'success',items:[{id:'old-owner'}],records:[{id:'old-owner'}]})});await pending;
  assert.equal(f.ctx.state.items.length,0);assert.equal(f.ctx.state.surveyLogs,undefined);
 }
});
test('TRD newer bootstrap supersedes in-flight full history and its finalizer',async()=>{
 const f=fixture();f.user(original);const requests=[];
 Object.assign(f.ctx,{mergeItemsById:(_old,rows)=>rows,mapItemData:x=>x,needsFullHistoryForCurrentView:()=>false,fetch:()=>new Promise(resolve=>requests.push(resolve))});
 vm.runInContext(section('        async function ensureFullHistoryLoaded(','        // ส่ง mutation'),f.ctx);
 const history=f.ctx.ensureFullHistoryLoaded(),fresh=f.ctx.fetchInitialData(true);
 requests[1]({ok:true,json:async()=>({items:[{id:'fresh'}]})});await fresh;
 requests[0]({ok:true,json:async()=>({items:[{id:'stale'}]})});await history;
 assert.equal(f.ctx.state.items[0].id,'fresh');assert.equal(f.ctx.state.fullHistoryLoaded,false);
});
test('TRD startup state construction performs no storage reads or malformed legacy restore',()=>{
 let reads=0;const c=vm.createContext({Date,productMovementIsoWeekValue:()=> '2026-W38',localStorage:{getItem(){reads++;throw Error('malformed legacy');}}});
 vm.runInContext(section('        let state = {','        function showLoading('),c);
 assert.equal(reads,0);assert.equal(Object.keys(vm.runInContext('state.checkStockCheckedLocations',c)).length,0);
});
test('TRD zone report failure or changed owner cannot mark a zone checked or report success',async()=>{
 for(const mode of ['replaced','failure','success']){
  const f=fixture();f.user(original);let finish;
  Object.assign(f.ctx.state,{checkStockLocation:{floor:'1',location:'A'},products:[{name:'A',floor:'1',location:'A',parLevel:5}],checkStockEdits:{}});
  Object.assign(f.ctx,{AppVersionGuard:{blockIfStale:async()=>false},extractZone:x=>x,compareCheckStockProducts:()=>0,
   formatDateTime:()=> 'fixture-date',getActiveRequestNames:()=>new Set(),sendAppLog(){},
   postMutation:()=>new Promise((resolve,reject)=>finish=()=>mode==='success'?resolve({status:'success'}):reject(Error(mode==='replaced'?'session_changed':'permission_denied')))});
  vm.runInContext(section('        async function handleCheckStockSubmit(','        // ── Render Helpers: Check Stock'),f.ctx);
  const pending=f.ctx.handleCheckStockSubmit();await tick();
  if(mode==='replaced')f.user(replacement,'replacement-token');finish();await pending;
  assert.equal(Object.keys(f.ctx.state.checkStockCheckedLocations).length,mode==='success'?1:0);
  assert.equal(f.errors.some(m=>m.includes('✅ บันทึกสต๊อกสำเร็จ')),mode==='success');
 }
});
