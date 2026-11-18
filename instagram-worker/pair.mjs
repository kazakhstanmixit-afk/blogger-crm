import {chromium} from 'playwright';import {createInterface} from 'node:readline/promises';import {stdin,stdout} from 'node:process';import fs from 'node:fs';import path from 'node:path';
const rl=createInterface({input:stdin,output:stdout});let context;
try{
 const origin=(await rl.question('CRM URL [https://blogger-crm.onrender.com]: ')).trim()||'https://blogger-crm.onrender.com';if(new URL(origin).protocol!=='https:')throw Error('HTTPS CRM URL required');
 const code=(await rl.question('One-time code from MIXIT Connect (24 characters): ')).trim();if(!/^[a-f0-9]{24}$/i.test(code))throw Error('Invalid pairing code');
 const profile=path.resolve(process.env.LOCALAPPDATA||process.env.HOME||'.','MIXIT','instagram-pilot');fs.mkdirSync(profile,{recursive:true});
 context=await chromium.launchPersistentContext(profile,{headless:false,executablePath:process.env.CHROMIUM_PATH||undefined,viewport:{width:1200,height:900}});const page=context.pages()[0]||await context.newPage();await page.goto('https://www.instagram.com/accounts/login/');
 await rl.question('Log into marina_mixit_pr manually. After login, press Enter here (keep browser open): ');
 const id=(await context.cookies('https://www.instagram.com')).find(c=>c.name==='ds_user_id')?.value;if(!/^\d+$/.test(id||''))throw Error('No authenticated Instagram session found');
 const response=await fetch(new URL('/api/instagram-worker/pair',origin),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({code,instagramId:id})});const result=await response.json();if(!response.ok)throw Error(result.error||'Pairing failed');
 const file=path.resolve('.env.local');if(fs.existsSync(file))fs.copyFileSync(file,file+'.before-pair');fs.writeFileSync(file,['CRM_ORIGIN='+new URL(origin).origin,'BROWSER_ACCOUNT_ID='+result.accountId,'INSTAGRAM_BROWSER_WORKER_SECRET='+result.secret,'INSTAGRAM_EXPECTED_ACCOUNT_ID='+result.expectedInstagramId,'INSTAGRAM_BROWSER_PROFILE_DIR='+JSON.stringify(profile)].join('\n')+'\n',{mode:0o600});console.log('Connected to CRM for @'+result.handle+'. Close this window and run windows/start.cmd.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{await context?.close();rl.close();}
