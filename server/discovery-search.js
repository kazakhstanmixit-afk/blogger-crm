'use strict';
const crypto=require('crypto');const {planImport,expandRelated}=require('./discovery');
function createSearch({db,makeBlogger,env=process.env,fetchImpl=fetch}){
 let busy=false;const jobs=()=>db.getState().discovery_search_jobs||(db.getState().discovery_search_jobs=[]);
 function create(raw,actor){const query=String(raw.query||'').trim();if(query.length<2||query.length>500)throw Error('Введите ключевые слова до 500 символов');const budget=Number(raw.maxUsd),limit=Math.min(20,Number(env.APIFY_SEARCH_BUDGET_LIMIT_USD)||2);if(!(budget>0&&budget<=limit))throw Error('Бюджет запуска должен быть до '+limit+' USD');
  const managers=[...new Set(raw.managerIds||[])];if(managers.some(id=>!db.get('users').value().some(u=>u.id===id&&u.role==='manager')))throw Error('Выберите действующих менеджеров');
  const j={id:crypto.randomUUID(),query,maxUsd:budget,managerIds:managers,daily:raw.daily===true,status:'pending',nextAt:Date.now(),createdBy:actor,createdAt:new Date().toISOString(),runs:[]};jobs().push(j);db.write();return j;
 }
 async function call(path,body){const response=await fetchImpl('https://api.apify.com/v2/'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+env.APIFY_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!response.ok)throw Error('Apify HTTP '+response.status);return response.json();}
 function importResults(job,rows){const normalized=rows.map(row=>row.ownerUsername&&!row.username?{...row,username:row.ownerUsername,id:row.ownerId||row.owner?.id||null,fullName:row.ownerFullName||row.owner?.fullName||row.ownerUsername,followersCount:row.owner?.followersCount||0}:row);const s=db.getState(),plan=planImport(expandRelated(normalized),s.bloggers,makeBlogger);if(plan.errors.length){job.status='needs_review';job.errors=plan.errors.slice(0,30);db.write();return}
  const loads=Object.fromEntries(job.managerIds.map(id=>[id,s.bloggers.filter(b=>b.assigned_manager_id===id&&b.in_work).length]));
  for(const b of plan.additions){if(job.managerIds.length){const id=job.managerIds.slice().sort((a,b)=>loads[a]-loads[b])[0];b.assigned_manager_id=id;b.manager_name=s.users.find(u=>u.id===id)?.username;b.in_work=true;b.status='transferred';loads[id]++;}b.discovery_search_id=job.id;s.bloggers.push(b);}
  job.lastResult={created:plan.additions.length,duplicates:plan.duplicates.length};job.runs.push({runId:job.runId,datasetId:job.datasetId,...job.lastResult,completedAt:new Date().toISOString()});job.status=job.daily?'waiting':'done';job.nextAt=Date.now()+24*3600000;delete job.runId;delete job.datasetId;db.write();
 }
 async function drain(){if(busy||env.DISCOVERY_SEARCH_ENABLED!=='1'||!env.APIFY_TOKEN||!env.APIFY_SEARCH_TASK_ID||!env.APIFY_QUERY_FIELD)return;busy=true;try{
  for(const job of jobs().filter(j=>['pending','waiting','running','importing'].includes(j.status)&&j.nextAt<=Date.now()).slice(0,2)){
   try{
    if(['pending','waiting'].includes(job.status)){
     // Lost start response is uncertain: never launch another paid run automatically.
     job.status='starting';db.write();const input=JSON.parse(env.APIFY_SEARCH_BASE_INPUT_JSON||'{}');input[env.APIFY_QUERY_FIELD]=env.APIFY_QUERY_IS_ARRAY==='1'?job.query.split(/\n/).map(s=>s.trim()).filter(Boolean):job.query;
     const started=await call('actor-tasks/'+encodeURIComponent(env.APIFY_SEARCH_TASK_ID)+'/runs?maxTotalChargeUsd='+encodeURIComponent(job.maxUsd)+'&timeout=600',input);if(!started.data?.id)throw Error('Ответ Apify без run ID');job.runId=started.data.id;job.status='running';job.nextAt=Date.now()+30000;db.write();continue;
    }
    if(job.status==='running'){const run=(await call('actor-runs/'+encodeURIComponent(job.runId))).data;if(run.status==='SUCCEEDED'){job.datasetId=run.defaultDatasetId;job.status='importing';db.write();}else if(['FAILED','TIMED-OUT','ABORTED'].includes(run.status)){job.status='failed';job.lastError='Apify: '+run.status;db.write();continue}else{job.nextAt=Date.now()+30000;db.write();continue}}
    if(job.status==='importing'){const rows=await call('datasets/'+encodeURIComponent(job.datasetId)+'/items?clean=true&format=json&limit=5000');if(!Array.isArray(rows))throw Error('Неверный формат dataset');importResults(job,rows)}
   }catch(e){if(job.status==='starting')job.status='uncertain';job.lastError=/^Apify HTTP \d+$/.test(e.message)?e.message:'Поиск не завершён: проверьте настройки и результат Apify';job.nextAt=Date.now()+60000;db.write();}
  }
 }finally{busy=false}}
 function mount(app,auth){if(env.DISCOVERY_ENABLED!=='1')return;
  app.get('/api/discovery/search-jobs',auth,(req,res)=>{if(!['admin','manager'].includes(req.user.role))return res.status(403).json({error:'Нет доступа'});res.json({jobs:jobs(),configured:Boolean(env.APIFY_TOKEN&&env.APIFY_SEARCH_TASK_ID&&env.APIFY_QUERY_FIELD),enabled:env.DISCOVERY_SEARCH_ENABLED==='1'})});
  app.post('/api/discovery/search-jobs',auth,(req,res)=>{if(req.user.role!=='admin')return res.status(403).json({error:'Платный поиск настраивает администратор'});try{res.json(create(req.body||{},req.user.id));drain().catch(()=>{})}catch(e){res.status(400).json({error:e.message})}});
  app.post('/api/discovery/search-jobs/:id/pause',auth,(req,res)=>{if(req.user.role!=='admin')return res.status(403).json({error:'Нет доступа'});const j=jobs().find(j=>j.id===req.params.id);if(!j)return res.status(404).json({error:'Задание не найдено'});j.daily=false;if(['pending','waiting'].includes(j.status))j.status='paused';db.write();res.json(j)});
  for(const j of jobs())if(j.status==='starting')j.status='uncertain';db.write();const timer=setInterval(()=>drain().catch(()=>{}),30000);timer.unref();
 }
 return {create,drain,importResults,mount};
}
module.exports={createSearch};
