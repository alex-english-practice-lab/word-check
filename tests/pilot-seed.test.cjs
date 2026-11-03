const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');

test('one-time pilot fixtures use distinct students and the recorded assignment token digest',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../backend/test-fixtures/pilot.sql'),'utf8');
 assert.match(sql,/Test Student A/);assert.match(sql,/Test Student B/);assert.match(sql,/pilot-a/);assert.match(sql,/pilot-b/);
 const token='pilot-assignment-a-20261102-7NQm4wR2vK9xB3cP',digest=crypto.createHash('sha256').update(token).digest('hex');
 assert.match(sql,new RegExp(digest));assert.equal(new Set([...sql.matchAll(/[12]{8}-[12]{4}-4[12]{3}-8[12]{3}-[12]{12}/g)].map(match=>match[0])).size,2);
});
