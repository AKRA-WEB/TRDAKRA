const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const ctx=vm.createContext({state:{items:[],historySearch:'',historySort:'request',historyDir:'desc',historyPage:0},document:{getElementById:()=>null}});
function section(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
vm.runInContext(section('        function parseFormattedDate(', '        function getLastDispatchInfo(')+section('        function getFilteredHistory()', '        function renderHistoryList('),ctx);
vm.runInContext('var seen=[];function renderHistoryCards(items){seen=items.map(i=>i.id);return "cards";}',ctx);
const row=(id,date,status='จัดส่งแล้ว',dispatch='')=>({id,itemName:'สินค้า '+id,rawDate:date,status,dispatchTimestamp:dispatch});
ctx.state.items=[row('a','2026-01-01','จัดส่งแล้ว','01-01-2569'),row('b','2026-01-02','จัดส่งแล้ว','02-01-2026'),row('waiting','2025-01-01','รอตรวจรับ',''),row('excluded','2026-01-03','รอจัด'),row('tie','2026-01-02','รับสินค้าแล้ว','02-01-2569')];
const ids=()=>Array.from(ctx.getFilteredHistory(),i=>i.id);
assert.deepEqual(ids(),['waiting','b','tie','a']);
ctx.state.historyDir='asc';assert.deepEqual(ids(),['waiting','a','b','tie']);
ctx.state.historySort='dispatch';assert.deepEqual(ids(),['a','b','tie','waiting']);
ctx.state.historyDir='desc';assert.deepEqual(ids(),['waiting','b','tie','a']);
ctx.state.historySearch='TIE';assert.deepEqual(ids(),['tie']);
ctx.state.historySearch='missing';assert.deepEqual(ids(),[]);ctx.state.historySearch='';
ctx.state.items=[row('invalid','invalid'),row('valid','2026-01-01'),row('empty','')];ctx.state.historySort='request';assert.deepEqual(ids(),['invalid','valid','empty'],'invalid dates preserve stable comparator behavior');
ctx.state.items=Array.from({length:121},(_,i)=>row(String(i),new Date(1700000000000+i*1000).toISOString()));
const before=ctx.state.items.slice();let visited=[];
for(let p=0;p<3;p++){ctx.state.historyPage=p;ctx.renderHistoryPage('w1');assert.ok(ctx.seen.length<=50);visited.push(...ctx.seen);}
assert.equal(new Set(visited).size,121,'every history row remains discoverable');assert.equal(ctx.state.items.length,121,'complete dataset retained for analytics');assert.deepEqual(ctx.state.items,before,'sorting does not mutate source ordering');
ctx.state.historyPage=99;ctx.renderHistoryPage('w1');assert.equal(ctx.state.historyPage,2);
ctx.updateHistorySearch('0');assert.equal(ctx.state.historyPage,0);
ctx.state.historyPage=2;ctx.setHistorySort('dispatch');assert.equal(ctx.state.historyPage,0);
ctx.state.historyPage=2;ctx.toggleHistoryDir();assert.equal(ctx.state.historyPage,0);
ctx.state.items=[];ctx.renderHistoryPage('w1');assert.equal(ctx.state.historyPage,0);assert.equal(ctx.seen.length,0);
console.log('PASS TRDAKRA: all scripts parse, Thai/ISO dates, missing/invalid dates, stable ties, status-first order, search, complete page coverage, page reset/clamping, no source mutation');
