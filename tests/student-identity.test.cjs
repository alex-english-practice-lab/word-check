const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../student-identity-core.js');
function memory(){const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size}}}
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('Guest storage is memory-only; named students and legacy history are separate',()=>{
 const local=memory();local.setItem('word-check.learn.v1.check.old','legacy');const guest=C.scopedStorage(local,null),a=C.scopedStorage(local,A),b=C.scopedStorage(local,B);
 guest.setItem('wordcheck.v3.practice.local.v1','guest');a.setItem('wordcheck.v3.practice.local.v1','Alice');b.setItem('wordcheck.v3.practice.local.v1','Bob');
 assert.equal(C.scopedStorage(local,null).getItem('wordcheck.v3.practice.local.v1'),null);assert.equal(a.getItem('wordcheck.v3.practice.local.v1'),'Alice');assert.equal(b.getItem('wordcheck.v3.practice.local.v1'),'Bob');
 assert.deepEqual([a.length,a.key(0)], [1,'wordcheck.v3.practice.local.v1']);assert.equal(local.getItem('word-check.learn.v1.check.old'),'legacy');
 a.clear();assert.equal(a.length,0);assert.equal(b.length,1);
});
test('restored selection is tied to UUID and revalidated; Guest bypass leaves named history intact',async()=>{
 const local=memory(),session=memory();let reloads=0;
 const fetcher=async(url,init)=>({ok:true,json:async()=>({student:{id:init.body.includes('irving')?B:A,displayName:'Zining'},accessToken:'opaque'})});
 let c=C.create({apiBase:'https://api.example.test',local,session,fetcher,refresh:()=>reloads++});assert.equal(c.mode,'guest');
 await c.choose(' Isabella ');assert.equal(reloads,1);assert.equal(JSON.parse(local.getItem(C.KEY)).id,A);assert.equal(local.getItem('word-check.learn.v1.identity'),null);
 c=C.create({apiBase:'https://api.example.test',local,session,fetcher,refresh:()=>reloads++});assert.equal(c.mode,'named');c.storage.setItem('word-check.learn.v1.identity','Zining local');
 assert.equal((await c.restore()).status,'ready');assert.equal(c.token,'opaque');c.noRecording();assert.equal(session.getItem(C.GUEST),'1');assert.equal(reloads,2);
 const guest=C.create({apiBase:'https://api.example.test',local,session,fetcher,refresh:()=>reloads++});assert.equal(guest.mode,'guest');assert.equal(guest.storage.getItem('word-check.learn.v1.identity'),null);
 assert.equal(C.scopedStorage(local,A).getItem('word-check.learn.v1.identity'),'Zining local');
 guest.leaveGuest();assert.equal(reloads,3);c=C.create({apiBase:'https://api.example.test',local,session,fetcher:async()=>({ok:true,json:async()=>({student:{id:B,displayName:'Another'},accessToken:'opaque'})}),refresh:()=>reloads++});
 assert.equal((await c.restore()).status,'changed');assert.equal(local.getItem(C.KEY),null);
 local.setItem(C.KEY,JSON.stringify({id:A,displayName:'Zining',alias:'isabella'}));
 const invalid=C.create({apiBase:'https://api.example.test',local,session,fetcher:async()=>({ok:false,status:404,json:async()=>({error:'disabled'})}),refresh:()=>reloads++});
 assert.equal((await invalid.restore()).status,'invalid');assert.equal(local.getItem(C.KEY),null);
});
test('without configured backend the established local-only storage is unchanged',()=>{
 const local=memory(),c=C.create({apiBase:'',local,session:memory()});assert.equal(c.mode,'legacy');assert.equal(c.storage,local);
 local.setItem(C.MARKER,'1');const rollback=C.create({apiBase:'',local,session:memory()});assert.equal(rollback.mode,'guest');assert.notEqual(rollback.storage,local);
});
test('assigned student temporarily overrides a different default without changing either profile',async()=>{
 const local=memory(),session=memory(),defaultStudent={id:A,displayName:'Zining',alias:'isabella'},assignedStudent={id:B,displayName:'Irving',alias:'irving'};
 local.setItem(C.KEY,JSON.stringify(defaultStudent));C.scopedStorage(local,A).setItem('history','default');C.scopedStorage(local,B).setItem('history','assigned');
 let reloads=0;const response={student:{id:B,displayName:'Irving'},alias:'irving',assignmentId:'assignment-1',accessToken:'opaque'};
 const fetcher=async()=>({ok:true,json:async()=>({student:{id:B,displayName:'Irving'},accessToken:'opaque'})});
 const options={apiBase:'https://api.example.test',local,session,fetcher,refresh:()=>reloads++,assignedToken:'assignment-token'};
 let ctrl=C.create(options);assert.equal(ctrl.current.id,A);assert.equal(ctrl.acceptAssigned(response),false);assert.equal(reloads,1);
 assert.deepEqual(JSON.parse(local.getItem(C.KEY)),defaultStudent);
 ctrl=C.create(options);assert.equal(ctrl.mode,'named');assert.equal(ctrl.current.id,B);assert.equal(ctrl.storage.getItem('history'),'assigned');
 assert.equal(ctrl.acceptAssigned(response),true);assert.equal(ctrl.token,'opaque');
 assert.throws(()=>ctrl.noRecording(),/不能以 Guest/);
 const ordinary=C.create({...options,assignedToken:null});assert.equal(ordinary.current.id,A);assert.equal(ordinary.storage.getItem('history'),'default');
 await ctrl.logout();assert.deepEqual(JSON.parse(local.getItem(C.KEY)),defaultStudent);assert.equal(session.getItem(C.ASSIGNED),null);
 const guestSession=memory();guestSession.setItem(C.GUEST,'1');let guest=C.create({...options,session:guestSession});assert.equal(guest.mode,'guest');
 assert.equal(guest.acceptAssigned(response),false);guest=C.create({...options,session:guestSession});assert.equal(guest.current.id,B);assert.equal(guest.mode,'named');
 assert.equal(guestSession.getItem(C.GUEST),'1');assert.equal(C.create({...options,session:guestSession,assignedToken:null}).mode,'guest');
 const selected=C.create({...options,assignedToken:'another-assignment'});await selected.choose('irving',B);assert.deepEqual(JSON.parse(local.getItem(C.KEY)),defaultStudent);
 assert.equal(C.create({...options,assignedToken:null}).current.id,A);
});
