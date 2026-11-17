'use strict';
const crypto=require('crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function createFinanceBridge({db,env=process.env}){
 function authorize(req){const want=env.FLOW_CRM_SECRET||'',got=String(req.headers.authorization||'').replace(/^Bearer /,'');return want.length>=32&&Buffer.byteLength(want)===Buffer.byteLength(got)&&crypto.timingSafeEqual(Buffer.from(want),Buffer.from(got))}
 function create(payload,key){
  if(!key||key.length>150)throw Error('Нужен ключ повторного запроса');const s=db.getState();const prior=(s.finance_bridge_keys||[]).find(x=>x.key===key);const fingerprint=hash(payload);if(prior){if(prior.fingerprint!==fingerprint)throw Error('Ключ уже использован для других данных');return s.payments.find(p=>p.id===prior.paymentId)}
  const b=s.bloggers.find(b=>b.id===payload.bloggerId),manager=s.users.find(u=>u.id===payload.managerId);if(!b||!manager||b.assigned_manager_id!==manager.id)throw Error('Нужны подтверждённые ID блогера и ответственного CRM');
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
 function status(payment){return {crmPaymentId:payment.id,integrationIds:payment.flow_integration_ids||[],stage:payment.flow_stage,status:payment.status,amountMinor:Math.round(Number(payment.amount)*100),
  receipts:[...(payment.receipts||[]),...(payment.receipts_video||[]),...(payment.receipts_product||[])].map(x=>({url:x.url,uploadedAt:x.uploaded_at})),updatedAt:payment.updated_at,invoiceSha256:payment.payment_invoice?.sha256||null,bitrixStatus:payment.bitrix_payment?.status||null,bitrixItemId:payment.bitrix_payment?.itemId||null};}
 function mount(app){if(env.FINANCE_BRIDGE_ENABLED!=='1')return;
  app.post('/api/integrations/payments',(req,res)=>{if(!authorize(req))return res.status(403).json({error:'Нет межсерверного доступа'});try{res.json(status(create(req.body||{},req.headers['idempotency-key'])))}catch(e){res.status(409).json({error:e.message})}});
  app.get('/api/integrations/payments/:id',(req,res)=>{if(!authorize(req))return res.status(403).json({error:'Нет межсерверного доступа'});const p=db.get('payments').find({id:req.params.id}).value();if(!p||!p.flow_integration_ids)return res.status(404).json({error:'Связанная заявка не найдена'});res.json(status(p));});
 }
 return {create,status,mount};
}
module.exports={createFinanceBridge};
