const test=require('node:test'),assert=require('node:assert/strict');
const ready=import('../scripts/deploy-cloudflare-worker.mjs');

test('Cloudflare deployment forwards validated build secrets to the Worker runtime',async()=>{
 const {deploymentSecrets}=await ready;
 const values={ACCESS_ISSUER:'https://gentle-wind-35c2.cloudflareaccess.com',ACCESS_AUD:'a'.repeat(64),TEACHER_EMAIL:'teacher@example.test'};
 assert.deepEqual(deploymentSecrets(values),values);
 assert.throws(()=>deploymentSecrets({...values,ACCESS_AUD:''}),/ACCESS_AUD/);
 assert.throws(()=>deploymentSecrets({...values,ACCESS_ISSUER:values.ACCESS_ISSUER+'/'}),/ACCESS_ISSUER/);
 assert.throws(()=>deploymentSecrets({...values,TEACHER_EMAIL:' teacher@example.test'}),/TEACHER_EMAIL/);
});
