const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),low=require('lowdb'),Memory=require('lowdb/adapters/Memory');
const {mount}=require('../discovery');
test('actual Express router: shared CRM import, recommendation, claim, draft and reply',async()=>{
 const old=process.env.DISCOVERY_ENABLED;process.env.DISCOVERY_ENABLED='1';const db=low(new Memory());db.defaults({bloggers:[],batches:[],activity:[]}).write();
 const app=express();app.use(express.json());const auth=(req,res,next)=>{if(req.headers.authorization!=='Bearer fixture')return res.status(401).json({error:'No token'});req.user={id:'manager1',username:'Менеджер',role:'manager'};next()};
 mount(app,{db,auth,parse:require('csv-parse/sync').parse,makeBlogger:d=>({...d,assigned_manager_id:null})});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,authorized=true){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer fixture'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
 try{assert.equal((await call('/api/discovery/outbox',null,false)).status,401);const payload={format:'json',content:JSON.stringify([{username:'demo_beauty',relatedProfiles:[{username:'demo_related'}]}]),dryRun:true};
 const preview=await call('/api/discovery/import',payload);assert.equal(preview.data.created,2);assert.equal(db.get('bloggers').value().length,0);
 assert.equal((await call('/api/discovery/import',{...payload,dryRun:false})).status,200);assert.equal(db.get('bloggers').value().length,2);
 await call('/api/discovery/import',{...payload,dryRun:false});assert.equal(db.get('bloggers').value().length,2);
 const b=db.get('bloggers').value()[0];await call('/api/discovery/claim',{id:b.id});assert.equal(b.assigned_manager_id,'manager1');
 const draft=await call('/api/discovery/draft',{blogger_id:b.id,text:'Здравствуйте!'});assert.equal(draft.data.sending_enabled,false);assert.equal((await call('/api/discovery/outbox')).data.drafts.length,1);
 await call('/api/discovery/contact-status',{id:b.id,status:'replied'});assert.equal((await call('/api/discovery/draft-sent',{id:draft.data.id})).status,409);
 assert.equal((await fetch(base+'/discovery/',{redirect:'manual'})).status,200);assert.equal((await fetch(base+'/discovery',{redirect:'manual'})).status,302);
 }finally{await new Promise(r=>server.close(r));if(old===undefined)delete process.env.DISCOVERY_ENABLED;else process.env.DISCOVERY_ENABLED=old;}
});
