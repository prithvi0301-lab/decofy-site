// Run: node whatsapp/check-flow.mjs (Node 18+)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const flow=JSON.parse(readFileSync(new URL('./decofy-lead-flow.json',import.meta.url),'utf8'));
assert.equal(flow.version,'7.3');
assert.equal(flow.screens.length,4);
assert.equal(flow.screens.filter(x=>x.terminal===true).length,1);
const ids=new Set(flow.screens.map(x=>x.id));
const expected=['product','project_type','timeline','area'];
for(let i=0;i<flow.screens.length;i++){
 const s=flow.screens[i],components=s.layout.children[0].children;
 const f=components.at(-1), field=components.find(c=>c.name===expected[i]);
 assert.ok(field && field.required);
 assert.ok(field['data-source'].length>=3);
 assert.equal(f.type,'Footer');
 const action=f['on-click-action'];
 if(i<3){assert.equal(action.name,'navigate');assert.ok(ids.has(action.next.name));}
 else {assert.equal(action.name,'complete');assert.deepEqual(Object.keys(action.payload).sort(),expected.slice().sort());}
}
console.log('Structure checks passed. Live Meta Flow validation still required.');
