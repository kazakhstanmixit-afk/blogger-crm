'use strict';
const crypto=require('crypto');
function createCommunication({db,env=process.env,fetchImpl=fetch,clock=()=>new Date()}){
 let busy=false;
 const state=()=>{const s=db.getState();s.communication=s.communication||{messages:[],seen:{}};return s.communication};
 const drafts=()=>db.getState().discovery_outbox||[];
 function allowed(b,user,isReply=false){if(!b||b.assigned_manager_id!==user.id)throw Error('Блогер закреплён за другим сотрудником');if(['declined','do_not_contact',...(isReply?[]:['replied'])].includes(b.status))throw Error('Контакт ограничен или ответ уже получен');}
 function enqueue(id,user){const d=drafts().find(x=>x.id===id);if(!d||d.manager_id!==user.id)throw Error('Черновик недоступен');const b=db.get('bloggers').find({id:d.blogger_id}).value();allowed(b,user,d.kind==='reply');
  if(['queued','sending','accepted','sent','delivered','read'].includes(d.status))return d;
  if(d.status!=='draft')throw Error('Черновик уже обработан');if(d.text.length>1000)throw Error('Сообщение Instagram должно быть до 1000 символов');
  if(!env.WAZZUP_API_KEY||!env.INSTAGRAM_CHANNEL_ID||env.DISCOVERY_SEND_MODE!=='on')throw Error('Автоотправка не включена в настройках сервера');
  const handle=String(b.instagram_url||'').split('instagram.com/')[1]?.split(/[/?#]/)[0];if(!/^[a-zA-Z0-9._]{1,30}$/.test(handle||''))throw Error('Проверьте Instagram-профиль');
  Object.assign(d,{status:'queued',channelId:env.INSTAGRAM_CHANNEL_ID,chatId:handle.toLowerCase(),queuedAt:new Date().toISOString()});db.write();return d;
 }
 async function drain(){if(busy||env.INSTAGRAM_TRANSPORT!=='wazzup'||env.DISCOVERY_SEND_MODE!=='on')return;busy=true;try{
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).format(clock());const hour=+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Almaty',hour:'2-digit',hour12:false}).format(clock());if(hour<10||hour>=20)return;
  const cap=Math.max(1,Math.min(100,Number(env.DISCOVERY_DAILY_CAP)||10));
  for(const d of drafts().filter(x=>x.status==='queued').slice(0,1)){
   if(drafts().filter(x=>x.sendDay===day).length>=cap)break;
   const b=db.get('bloggers').find({id:d.blogger_id}).value();try{allowed(b,{id:d.manager_id},d.kind==='reply')}catch{d.status='cancelled';db.write();continue}
   // Persist sending before network. A crash/timeout is uncertain and is never blindly retried.
   d.status='sending';d.sendDay=day;db.write();
   try{const r=await fetchImpl('https://api.wazzup24.com/v3/message',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.WAZZUP_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({channelId:d.channelId,chatType:'instagram',chatId:d.chatId,text:d.text,crmMessageId:'mixit-instagram:'+d.id,clearUnanswered:false})});
    if(!r.ok){d.status='failed';d.lastError='Wazzup HTTP '+r.status;db.write();continue}const j=await r.json();if(!j.messageId)throw Error('no_message_id');d.providerMessageId=j.messageId;d.status='accepted';d.acceptedAt=new Date().toISOString();db.write();
   }catch{d.status='uncertain';d.lastError='Результат не подтверждён. Проверьте чат перед повтором.';db.write();}
  }
 }finally{busy=false}}
 function ingest(body){const s=state();let changed=0;for(const m of body.messages||[]){
  if(m.channelId!==env.INSTAGRAM_CHANNEL_ID||m.chatType!=='instagram'||!m.messageId||s.seen[m.messageId]||m.isDeleted||m.isEdited)continue;
  const nick=String(m.chatId||'').toLowerCase();const b=db.get('bloggers').value().find(b=>String(b.instagram_url||'').toLowerCase().replace(/\/$/,'').split('/').pop()===nick);if(!b)continue;
  s.seen[m.messageId]=true;const own=drafts().find(d=>d.providerMessageId===m.messageId||m.crmMessageId==='mixit-instagram:'+d.id);
  s.messages.push({id:m.messageId,blogger_id:b.id,manager_id:b.assigned_manager_id,channel:'instagram',direction:m.isEcho?'out':'in',text:String(m.text||'').slice(0,10000),contentUri:String(m.contentUri||''),type:m.type,at:m.dateTime||new Date().toISOString()});
  if(own&&m.isEcho){own.providerMessageId=m.messageId;if(['queued','sending','uncertain','accepted'].includes(own.status))own.status='sent';if(['new','in_work','transferred'].includes(b.status))b.status='contacted';}
  if(!m.isEcho){if(['new','in_work','transferred','contacted','later'].includes(b.status))b.status='replied';for(const d of drafts())if(d.blogger_id===b.id&&['queued','draft'].includes(d.status))d.status='cancelled';}
  changed++;
 }
 for(const item of body.statuses||[]){const d=drafts().find(x=>x.providerMessageId===item.messageId);if(!d)continue;if(['sent','delivered','read'].includes(item.status)){const order={queued:0,sending:0,uncertain:0,accepted:0,sent:1,delivered:2,read:3};if((order[item.status]||0)>(order[d.status]||0))d.status=item.status;const b=db.get('bloggers').find({id:d.blogger_id}).value();if(b&&['new','in_work','transferred'].includes(b.status))b.status='contacted';}else if(item.status==='error'){d.status='failed';d.lastError=String(item.error?.error||'Ошибка канала');}changed++;}
 if(changed)db.write();return {ok:true,processed:changed};
 }
 function mount(app,auth){
  if(env.DISCOVERY_ENABLED!=='1')return;
  const staff=(req,res,next)=>['admin','manager'].includes(req.user.role)?next():res.status(403).json({error:'Нет доступа'});
  app.post('/api/discovery/barter',auth,staff,async(req,res)=>{try{
    const b=db.get('bloggers').find({id:req.body.blogger_id}).value();if(!b||b.assigned_manager_id!==req.user.id&&req.user.role!=='admin')return res.status(403).json({error:'Другой ответственный'});
    if(!env.BARTER_BOX_ORIGIN||new URL(env.BARTER_BOX_ORIGIN).protocol!=='https:'||(env.FLOW_CRM_SECRET||'').length<32)return res.status(503).json({error:'Не настроена связь с Barter Box'});
    let map={};try{map=JSON.parse(env.FLOW_EMPLOYEE_MAP_JSON||'{}')}catch{}
    const response=await fetchImpl(new URL('/api/automation/crm-blogger',env.BARTER_BOX_ORIGIN),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.FLOW_CRM_SECRET,'Content-Type':'application/json'},body:JSON.stringify({crmBloggerId:b.id,instagram:b.instagram_url,name:b.name,phone:b.blogger_whatsapp||'',responsible:map[b.assigned_manager_id]||''})});
    if(!response.ok)return res.status(502).json({error:'Barter Box не подтвердил связь: HTTP '+response.status});res.json({url:env.BARTER_BOX_ORIGIN+'/?crm_blogger='+encodeURIComponent(b.id)});
   }catch{res.status(502).json({error:'Не удалось связаться с Barter Box'})}});
  app.post('/api/discovery/reply',auth,staff,(req,res)=>{try{const b=db.get('bloggers').find({id:req.body.blogger_id}).value();allowed(b,req.user,true);const text=String(req.body.text||'').trim();if(!text||text.length>1000)throw Error('Введите ответ до 1000 символов');const d={id:crypto.randomUUID(),kind:'reply',blogger_id:b.id,manager_id:req.user.id,text,instagram_url:b.instagram_url,status:'draft',created_at:new Date().toISOString()};const s=db.getState();s.discovery_outbox=s.discovery_outbox||[];s.discovery_outbox.push(d);db.write();res.json(enqueue(d.id,req.user));drain().catch(()=>{});}catch(e){res.status(409).json({error:e.message})}});
  app.post('/api/discovery/send',auth,staff,(req,res)=>{try{res.json(enqueue(req.body.id,req.user));drain().catch(()=>{})}catch(e){res.status(409).json({error:e.message})}});
  app.get('/api/discovery/messages',auth,staff,(req,res)=>res.json({messages:state().messages.filter(x=>req.user.role==='admin'||x.manager_id===req.user.id).slice(-200)}));
  app.post('/api/discovery/wazzup-event',(req,res)=>{const expected=env.CRM_COMMS_WEBHOOK_SECRET||'',given=String(req.headers.authorization||'').replace(/^Bearer /,'');if(expected.length<32||Buffer.byteLength(expected)!==Buffer.byteLength(given)||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(given)))return res.status(403).json({error:'Нет доступа'});try{res.json(ingest(req.body||{}))}catch{res.status(500).json({error:'Событие не сохранено'})}});
  for(const d of drafts())if(d.status==='sending')d.status='uncertain';db.write();
  const timer=setInterval(()=>drain().catch(()=>{}),15000);timer.unref();
 }
 return {enqueue,drain,ingest,mount};
}
module.exports={createCommunication};
