'use strict';
const crypto=require('crypto');
const path=require('path');
class DiscoveryError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function need(v,m,s){if(!v)throw new DiscoveryError(m,s)}
function nickname(value){let s=String(value||'').trim().toLowerCase();if(s.includes('instagram.com/'))s=s.split('instagram.com/')[1].split(/[/?#]/)[0];s=s.replace(/^@/,'');return /^[a-z0-9._]{1,30}$/.test(s)&&!['p','reel','reels','stories','explore','accounts'].includes(s)?s:null;}
function expandRelated(rows){
 need(Array.isArray(rows),'Нужен массив строк');
 const expanded=[];
 for(const row of rows){expanded.push(row);if(!row||typeof row!=='object')continue;
  let related=row.relatedProfiles;if(typeof related==='string'){try{related=JSON.parse(related)}catch{related=[];}}
  if(!Array.isArray(related))continue;
  const seed=nickname(row.username||row.handle||row.profileUrl||row.url);
  for(const profile of related.slice(0,100)){if(profile&&typeof profile==='object'&&nickname(profile.username||profile.url))expanded.push({...profile,_relatedSeed:seed});}
 }
 need(expanded.length<=5000,'С рекомендациями больше 5000 строк. Разделите файл.');return expanded;
}
function planImport(rows,existing,makeBlogger){
 need(Array.isArray(rows)&&rows.length<=5000,'Нужен массив до 5000 строк');
 const used=new Set(existing.map(b=>nickname(b.instagram_url)).filter(Boolean)),ids=new Set(existing.map(b=>b.instagram_platform_id).filter(Boolean).map(String));
 const result={additions:[],duplicates:[],errors:[]};
 for(let i=0;i<rows.length;i++){
  const row=rows[i];if(!row||typeof row!=='object'||Array.isArray(row)){result.errors.push({row:i+1,error:'Нужен объект'});continue;}
  const nick=nickname(row.username||row.handle||row.instagram_url||row.profileUrl||row.url),platformId=String(row.id||row.userId||'');
  if(!nick){result.errors.push({row:i+1,error:'Нет корректного username / profileUrl'});continue;}
  if(used.has(nick)||(platformId&&ids.has(platformId))){result.duplicates.push({row:i+1,username:nick});continue;}
  const followers=Number(row.followersCount??row.followers??0);if(!Number.isSafeInteger(followers)||followers<0){result.errors.push({row:i+1,error:'Некорректное число подписчиков'});continue;}
  used.add(nick);if(platformId)ids.add(platformId);
  result.additions.push({id:crypto.randomUUID(),...makeBlogger({name:String(row.fullName||row.name||nick).slice(0,150),instagram_url:'https://www.instagram.com/'+nick+'/',instagram_followers:followers,status:'new'}),
   instagram_platform_id:platformId||null,discovery_status:'unreviewed',discovery_source:row._relatedSeed?'apify_recommendation':'apify_import',discovery_seed:row._relatedSeed||null,discovery_evidence:row._relatedSeed?'Рекомендации из выгрузки для @'+row._relatedSeed:'Данные из выгрузки; аудитория и тематика требуют проверки',
   city:String(row.city||'').slice(0,100),batch_id:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
 }
 return result;
}
function claim(bloggers,id,user){const b=bloggers.find(x=>x.id===id);need(b,'Блогер не найден',404);need(!['declined','do_not_contact'].includes(b.status),'Контакт ограничен',409);
 need(!b.assigned_manager_id||b.assigned_manager_id===user.id,'Уже закреплён за другим менеджером',409);
 b.assigned_manager_id=user.id;b.manager_name=user.username;b.in_work=true;b.status='in_work';b.discovery_status='accepted';b.updated_at=new Date().toISOString();return b;}
function mount(app,{db,auth,parse,makeBlogger}){
 if(process.env.DISCOVERY_ENABLED!=='1')return;
 const guard=fn=>(req,res)=>{try{need(['admin','manager'].includes(req.user.role),'Недостаточно прав',403);res.json(fn(req))}catch(e){res.status(e.status||500).json({error:e.status?e.message:'Ошибка обработки'});}};
 app.get(/^\/discovery$/,(req,res)=>res.redirect('/discovery/'));
 app.get('/discovery/',(req,res)=>res.sendFile(path.join(__dirname,'discovery-mobile','index.html')));
 for(const file of ['app.js','style.css','manifest.webmanifest','icon.svg'])app.get('/discovery/'+file,(req,res)=>res.sendFile(path.join(__dirname,'discovery-mobile',file)));
 app.get('/api/discovery/outbox',auth,guard(req=>({drafts:(db.getState().discovery_outbox||[]).filter(x=>req.user.role==='admin'||x.manager_id===req.user.id)})));
 app.post('/api/discovery/contact-status',auth,guard(req=>{
  const b=db.get('bloggers').find({id:req.body.id}).value();need(b,'Блогер не найден',404);
  need(b.assigned_manager_id===req.user.id||req.user.role==='admin','Другой ответственный',403);
  need(['replied','declined','do_not_contact','later'].includes(req.body.status),'Неверный статус');
  if(req.body.status==='later')need(/^\d{4}-\d{2}-\d{2}$/.test(req.body.follow_up||''),'Укажите дату возврата');
  b.status=req.body.status;b.last_comment=String(req.body.note||'').slice(0,2000);b.updated_at=new Date().toISOString();
  if(b.status==='later')b.discovery_follow_up=req.body.follow_up;
  if(['replied','declined','do_not_contact'].includes(b.status))for(const d of db.getState().discovery_outbox||[])if(d.blogger_id===b.id&&d.status==='draft')d.status='cancelled';
  db.write();return {ok:true};
 }));
 app.post('/api/discovery/draft-sent',auth,guard(req=>{
  const draft=(db.getState().discovery_outbox||[]).find(x=>x.id===req.body.id);need(draft,'Черновик не найден',404);need(draft.manager_id===req.user.id,'Другой ответственный',403);
  const b=db.get('bloggers').find({id:draft.blogger_id}).value();need(b,'Блогер не найден',404);
  need(b.assigned_manager_id===req.user.id&&!['replied','declined','do_not_contact'].includes(b.status),'Контакт ограничен или изменился ответственный',409);
  if(draft.status==='manually_sent')return {ok:true};need(draft.status==='draft','Черновик отменён',409);
  draft.status='manually_sent';draft.sent_at=new Date().toISOString();b.status='contacted';b.contacted_at=draft.sent_at;db.write();return {ok:true};
 }));
 app.post('/api/discovery/import',auth,guard(req=>{
  const {format,content,dryRun=true,includeRelated=true}=req.body||{};need(typeof content==='string'&&content.length<8*1024*1024,'Нужен файл до 8 МБ');let rows;
  try{rows=format==='csv'?parse(content.replace(/^\uFEFF/,''),{columns:true,skip_empty_lines:true,trim:true,delimiter:content.split('\n')[0].includes(';')?';':','}):JSON.parse(content);if(!Array.isArray(rows))rows=rows.items||rows.data;}catch{throw new DiscoveryError('Не удалось прочитать CSV / JSON');}
  const result=planImport(includeRelated?expandRelated(rows):rows,db.get('bloggers').value(),makeBlogger);
  if(dryRun===false){need(!result.errors.length,'Исправьте ошибки: ничего не импортировано',422);const before=JSON.parse(JSON.stringify(db.getState()));
   try{const batchId=crypto.randomUUID(),state=db.getState();state.bloggers.push(...result.additions.map(b=>({...b,batch_id:batchId})));state.batches.push({id:batchId,name:'Apify discovery',created_at:new Date().toISOString(),created_by:req.user.id});
    state.activity.push({id:crypto.randomUUID(),blogger_id:null,user_id:req.user.id,action:'discovery_import',details:'Импортировано: '+result.additions.length,created_at:new Date().toISOString()});db.write();
   }catch(e){db.setState(before);throw e;}
  }
  return {created:result.additions.length,duplicates:result.duplicates.length,errors:result.errors,preview:result.additions.slice(0,12),dryRun:dryRun!==false};
 }));
 app.post('/api/discovery/claim',auth,guard(req=>{const before=JSON.parse(JSON.stringify(db.getState()));try{const result=claim(db.get('bloggers').value(),req.body.id,req.user);db.write();return result;}catch(e){db.setState(before);throw e;}}));
 app.post('/api/discovery/draft',auth,guard(req=>{
  const b=db.get('bloggers').find({id:req.body.blogger_id}).value();need(b,'Блогер не найден',404);need(b.assigned_manager_id===req.user.id,'Сначала возьмите блогера в работу',409);
  need(!['declined','do_not_contact','replied'].includes(b.status),'Контакт ограничен или ответ уже получен',409);
  const message=String(req.body.text||'').trim();need(message&&message.length<=4000,'Введите текст до 4000 символов');
  const state=db.getState(),outbox=state.discovery_outbox||(state.discovery_outbox=[]);
  const existing=outbox.find(x=>x.blogger_id===b.id&&x.status==='draft');if(existing)return existing;
  const draft={id:crypto.randomUUID(),blogger_id:b.id,manager_id:req.user.id,text:message,instagram_url:b.instagram_url,status:'draft',created_at:new Date().toISOString(),sending_enabled:false};outbox.push(draft);db.write();return draft;
 }));
}
module.exports={mount,planImport,claim,nickname,expandRelated,DiscoveryError};
