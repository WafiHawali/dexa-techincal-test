import 'dotenv/config';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
if(process.env.RUN_DISPOSABLE_OUTAGE_TESTS!=='true') throw new Error('Only run against this project’s disposable Compose stack: RUN_DISPOSABLE_OUTAGE_TESTS=true');
const base=process.env.INTEGRATION_BASE_URL ?? 'http://localhost:8080/api';
let passed=0;
async function compose(...args) {
  const child=spawn('docker',['compose',...args],{env:process.env,stdio:'ignore'});
  const timeout=setTimeout(()=>child.kill(),60000);
  const code=await new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('exit',resolve);});
  clearTimeout(timeout);assert.equal(code,0,`Compose ${args.slice(0,2).join(' ')} failed`);
}
async function request(path,{token,body,status=200,binary=false}={}) {
  const res=await fetch(base+path,{headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
  assert.ok((Array.isArray(status) ? status : [status]).includes(res.status),`Unexpected ${path} status: ${res.status}`);
  if(binary) return Buffer.from(await res.arrayBuffer());
  const value=await res.json();return res.ok?value.data:value;
}
async function healthy() {
  for(let i=0;i<90;i++) {try {await request('/health');return;} catch {} await delay(500);}
  throw new Error('Stack did not become healthy');
}
try {
  await healthy();
  const login=await request('/auth/login',{body:{identifier:process.env.SEED_HRD_EMAIL,password:process.env.SEED_HRD_PASSWORD},status:201});
  const token=login.accessToken;
  const list=await request('/attendances?pageSize=1',{token});
  const row=list.items[0];assert.ok(row?.photos?.[0],'Run integration against Docker before resilience checks');
  const photoPath=`/files/${row.photos[0].id}`;
  const before=await request(photoPath,{token,binary:true});assert.ok(before.length);
  await compose('stop','file-service');
  try {
    const failure=await request('/health',{status:[503,504]});assert.ok([503,504].includes(failure.statusCode));
    await request(photoPath,{token,status:[503,504]});
    console.log('PASS Docker file-service outage returns sanitized 503/504');passed++;
  } finally {await compose('start','file-service');}
  await healthy();
  await compose('up','-d','--no-deps','--force-recreate','file-service');
  await healthy();
  const after=await request(photoPath,{token,binary:true});assert.ok(before.equals(after));
  console.log('PASS private image survives file container replacement in persistent volume');passed++;
  await compose('stop','mysql');
  try {
    const failure=await request('/health',{status:[503,504]});assert.ok([503,504].includes(failure.statusCode));
    const authFailure=await request('/auth/me',{token,status:[503,504]});assert.ok([503,504].includes(authFailure.statusCode));
    console.log('PASS actual MySQL outage returns sanitized 503/504 without discarding data');passed++;
  } finally {await compose('start','mysql');}
  await healthy();
  const detail=await request(`/attendances/${row.id}`,{token});assert.equal(detail.id,row.id);
  assert.ok(before.equals(await request(photoPath,{token,binary:true})));
  console.log('PASS database and photos persist after MySQL restart; services reconnect');passed++;
} catch(error) {console.error(error.message);process.exitCode=1;}
console.log(`Docker resilience: ${passed} passed`);
