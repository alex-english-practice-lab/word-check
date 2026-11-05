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

test('email reports remain opt-in and enabled deployments require a valid Resend key',async()=>{
 const {deploymentSecrets}=await ready,base={ACCESS_ISSUER:'https://gentle-wind-35c2.cloudflareaccess.com',ACCESS_AUD:'a'.repeat(64),TEACHER_EMAIL:'teacher@example.test'};
 assert.deepEqual(deploymentSecrets({...base,REPORT_EMAIL_ENABLED:'true',RESEND_API_KEY:'re_test_123'}),{...base,REPORT_EMAIL_ENABLED:'true',RESEND_API_KEY:'re_test_123'});
 assert.throws(()=>deploymentSecrets({...base,REPORT_EMAIL_ENABLED:'true'}),/RESEND_API_KEY/);
 assert.throws(()=>deploymentSecrets({...base,REPORT_EMAIL_ENABLED:'yes',RESEND_API_KEY:'re_test'}),/REPORT_EMAIL_ENABLED/);
 assert.throws(()=>deploymentSecrets({...base,REPORT_EMAIL_ENABLED:'true',RESEND_API_KEY:'bad'}),/RESEND_API_KEY/);
 assert.throws(()=>deploymentSecrets({...base,REPORT_EMAIL_ENABLED:'true',RESEND_API_KEY:'re_test',REPORT_TO_EMAIL:' bad@example.test'}),/REPORT_TO_EMAIL/);
});
