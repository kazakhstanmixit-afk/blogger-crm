'use strict';
const crypto=require('crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function createFinanceBridge({db,makeBlogger,env=process.env}){
 function authorize(req){const want=env.FLOW_CRM_SECRET||'',got=String(req.headers.authorization||'').replace(/^Bearer /,'');return want.length>=32&&Buffer.byteLength(want)===Buffer.byteLength(got)&&crypto.timingSafeEqual(Buffer.from(want),Buffer.from(got))}
 function create(payload,key){
  if(!key||key.length>150)throw Error('Нужен ключ повторного запроса');const s=db.getState();const prior=(s.finance_bridge_keys||[]).find(x=>x.key===key);const fingerprint=hash(payload);if(prior){if(prior.fingerprint!==fingerprint)throw Error('Ключ уже использован для других данных');return s.payments.find(p=>p.id===prior.paymentId)}
  const b=s.bloggers.find(b=>b.id===payload.bloggerId),manager=s.users.find(u=>u.id===payload.managerId);if(!b||!manager)throw Error('Нужны подтверждённые ID блогера и ответственного CRM');
  const ids=[...new Set((payload.integrationIds||[]).map(String))];if(!ids.length)throw Error('Нужны связанные интеграции');
  const stage=String(payload.stage||'').trim();if(!stage)throw Error('Укажите этап оплаты');
  if(s.payments.some(p=>p.flow_stage===stage&&(p.flow_integration_ids||[]).some(id=>ids.includes(id))))throw Error('Заявка этого этапа уже существует');
  if(!['ip','cash'].includes(payload.settlement))throw Error('Укажите ИП или наличные');
  if(!Number.isSafeInteger(payload.amountMinor)||payload.amountMinor<=0)throw Error('Подтвердите сумму в тиынах');if(!String(payload.recipientName||'').trim())throw Error('Нужен получатель');
  const payment={id:crypto.randomUUID(),blogger_id:b.id,manager_id:manager.id,created_by:manager.id,recipient_name:String(payload.recipientName).slice(0,200),iin:payload.iin||null,payment_name:payload.recipientName,
   amount:payload.amountMinor/100,amount_video:payload.amountMinor/100,amount_product:null,is_ip:payload.settlement==='ip',settlement:payload.settlement,status:'pending',notes:String(payload.notes||'').slice(0,3000),
   flow_integration_ids:ids,flow_stage:stage,flow_invoice_reference:payload.invoiceReference||null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  s.payments.push(payment);s.finance_bridge_keys=s.finance_bridge_keys||[];s.finance_bridge_keys.push({key,fingerprint,paymentId:payment.id});s.activity.push({id:crypto.randomUUID(),blogger_id:b.id,user_id:manager.id,action:'payment_submitted',details:'Заявка из Barter Box: '+stage,created_at:new Date().toISOString()});db.write();return payment;
 }
 // Barter Box подаёт на оплату блогера, которого ещё нет в CRM: находим по Instagram/TikTok/нику или заводим за ответственным.
 const nick=u=>{const s=String(u||'').trim().toLowerCase().replace(/#.*$/,'').replace(/[?].*$/,'').replace(/\/+$/,'');return (s.split('/').pop()||'').replace(/^@/,'').trim()||null};
 function ensure(p){const s=db.getState(),manager=s.users.find(u=>u.id===p.managerId);if(!manager)throw Error('Ответственный не найден в CRM');
  const ig=nick(p.instagram),tt=nick(p.tiktok),nm=String(p.name||'').trim().toLowerCase().replace(/^@/,'');if(!ig&&!tt&&!nm)throw Error('Нужен Instagram, TikTok или ник блогера');
  const found=s.bloggers.find(b=>{const bi=nick(b.instagram_url),bt=nick(b.tiktok_url),bn=String(b.name||'').trim().toLowerCase().replace(/^@/,'');return (ig&&(bi===ig||bn===ig))||(tt&&bt===tt)||(nm&&(bn===nm||bi===nm))});
  if(found){if(!found.assigned_manager_id){found.assigned_manager_id=manager.id;found.updated_at=new Date().toISOString();db.write();}return {crmBloggerId:found.id,created:false};}
  const igUrl=ig?(/^https?:/i.test(p.instagram)?String(p.instagram).trim():'https://www.instagram.com/'+ig):null,ttUrl=tt?(/^https?:/i.test(p.tiktok)?String(p.tiktok).trim():'https://www.tiktok.com/@'+tt):null;
  const now=new Date().toISOString(),b={id:crypto.randomUUID(),batch_id:null,created_at:now,updated_at:now,...makeBlogger({name:String(p.name||ig||tt).slice(0,150),instagram_url:igUrl,tiktok_url:ttUrl,instagram_followers:p.followers,instagram_avg_reach:p.avgReach,tiktok_followers:p.followersTT,tiktok_avg_reach:p.avgReachTT,er:p.er?String(p.er):null,category:p.category||null,status:'in_work',in_work:true,assigned_manager_id:manager.id,blogger_whatsapp:String(p.phone||'').slice(0,30)||null,notes:'Заведён автоматически из Barter Box при подаче на оплату'})};
  s.bloggers.push(b);s.activity.push({id:crypto.randomUUID(),blogger_id:b.id,user_id:manager.id,action:'created',details:'Блогер заведён из Barter Box (подача на оплату)',created_at:now});db.write();return {crmBloggerId:b.id,created:true};}
 function status(payment){return {crmPaymentId:payment.id,integrationIds:payment.flow_integration_ids||[],stage:payment.flow_stage,status:payment.status,amountMinor:Math.round(Number(payment.amount)*100),
  receipts:[...(payment.receipts||[]),...(payment.receipts_video||[]),...(payment.receipts_product||[])].map(x=>({url:x.url,uploadedAt:x.uploaded_at})),updatedAt:payment.updated_at,invoiceSha256:payment.payment_invoice?.sha256||null,bitrixStatus:payment.bitrix_payment?.status||null,bitrixItemId:payment.bitrix_payment?.itemId||null};}
 function mount(app){if(env.FINANCE_BRIDGE_ENABLED!=='1')return;
  app.post('/api/integrations/bloggers/ensure',(req,res)=>{if(!authorize(req))return res.status(403).json({error:'Нет межсерверного доступа'});try{res.json(ensure(req.body||{}))}catch(e){res.status(409).json({error:e.message})}});
  app.post('/api/integrations/payments',(req,res)=>{if(!authorize(req))return res.status(403).json({error:'Нет межсерверного доступа'});try{res.json(status(create(req.body||{},req.headers['idempotency-key'])))}catch(e){res.status(409).json({error:e.message})}});
  app.get('/api/integrations/payments/:id',(req,res)=>{if(!authorize(req))return res.status(403).json({error:'Нет межсерверного доступа'});const p=db.get('payments').find({id:req.params.id}).value();if(!p||!p.flow_integration_ids)return res.status(404).json({error:'Связанная заявка не найдена'});res.json(status(p));});
 }
 return {create,ensure,status,mount};
}
module.exports={createFinanceBridge};
