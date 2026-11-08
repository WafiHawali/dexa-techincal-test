import 'dotenv/config';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const cwd=fileURLToPath(new URL('../',import.meta.url));
if(!process.env.npm_execpath) throw new Error('Run via npm exec --offline --call="node scripts/dev-smoke.mjs"');
const env={...process.env};
if(env.INTEGRATION_MYSQL_PORT) {const url=new URL(env.DATABASE_URL);url.port=env.INTEGRATION_MYSQL_PORT;env.DATABASE_URL=url.toString();}
const child=spawn(process.execPath,['scripts/dev.mjs'],{cwd,env,stdio:'ignore',detached:process.platform!=='win32'});
const done=new Promise(resolve=>child.once('exit',resolve));
try {
  let ready=false;
  for(let attempt=0;attempt<120;attempt++) {
    if(child.exitCode!==null) throw new Error('Development supervisor exited before readiness');
    try {const res=await fetch('http://localhost:5173/api/health',{signal:AbortSignal.timeout(1000)});if(res.ok) {ready=true;break;}} catch {}
    await delay(500);
  }
  if(!ready) throw new Error('Development services failed to become ready in 60 seconds');
  const integration=spawn(process.execPath,['scripts/integration.mjs'],{cwd,env:{...env,INTEGRATION_BASE_URL:'http://localhost:5173/api'},stdio:'inherit'});
  const timeout=setTimeout(()=>integration.kill(),150000);
  const code=await new Promise(resolve=>integration.once('exit',resolve));clearTimeout(timeout);
  if(code!==0) throw new Error('Development-mode integration failed');
  console.log('PASS npm run dev: all source services, decorator metadata, Vite proxy, and full API flow');
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {
  if(process.platform==='win32') {
    const killer=spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});
    await new Promise(resolve=>{killer.once('error',resolve);killer.once('exit',resolve);});
  } else {try {process.kill(-child.pid,'SIGTERM');} catch {}}
  await Promise.race([done,delay(5000)]);
}
