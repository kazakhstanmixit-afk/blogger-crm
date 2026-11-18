'use strict';
const crypto=require('crypto');
function createNegotiation({db,env=process.env}){
 const all=()=>db.getState().blogger_proposals||(db.getState().blogger_proposals=[]);
 const lead=u=>u.role==='admin'||String(env.NEGOTIATION_APPROVER_IDS||'').split(',').map(x=>x.trim()).includes(u.id);
 function create(input,user){
  const b=db.get('bloggers').find({id:input.blogger_id}).value();
  if(!b||b.assigned_manager_id!==user.id||['declined','do_not_contact'].includes(b.status))throw Error('Проверьте ответственного и ограничения контакта');
  const money=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('Суммы указываются целыми тенге');return n;};
  if(!Array.isArray(input.products)||!input.products.length||input.products.length>30)throw Error('Выберите от 1 до 30 товаров');
  const products=input.products.map(p=>{let catalogId=null;if(p.product_id){const item=(db.getState().negotiation_catalog?.items||[]).find(x=>x.id===p.product_id);if(!item)throw Error('Товар отсутствует в каталоге');if(p.expected_cost_minor!==undefined&&p.expected_cost_minor!==item.costMinor)throw Error('Себестоимость изменилась');catalogId=item.id;p={...p,name:item.name,unit_cost_kzt:item.costMinor/100};}const name=String(p.name||'').trim();if(!name||name.length>200)throw Error('Укажите название товара');const quantity=money(p.quantity);if(!quantity||quantity>100)throw Error('Проверьте количество');return {catalog_id:catalogId,name,quantity,unit_cost_kzt:money(p.unit_cost_kzt),markup_kzt:money(p.markup_kzt)};});
  const text=String(input.text||'').trim();if(!text||text.length>1000)throw Error('Текст предложения до 1000 символов');
  const p={id:crypto.randomUUID(),blogger_id:b.id,manager_id:user.id,instagram_url:b.instagram_url,quoted_price_kzt:money(input.quoted_price_kzt),cash_kzt:money(input.cash_kzt),delivery_kzt:money(input.delivery_kzt),products,text,scope:String(input.scope||'').slice(0,1000),source_note:String(input.source_note||'').slice(0,2000),status:'pending',created_at:new Date().toISOString()};
  p.goods_cost_kzt=products.reduce((s,x)=>s+x.quantity*x.unit_cost_kzt,0);p.goods_estimate_kzt=products.reduce((s,x)=>s+x.quantity*(x.unit_cost_kzt+x.markup_kzt),0);p.total_cost_kzt=p.cash_kzt+p.goods_cost_kzt+p.delivery_kzt;
  if(!Number.isSafeInteger(p.total_cost_kzt)||!Number.isSafeInteger(p.goods_estimate_kzt))throw Error('Слишком большая сумма');
  all().push(p);db.write();return p;
 }
 function decide(id,decision,user,note=''){
  if(!lead(user))throw Error('Решение доступно тимлиду');const p=all().find(p=>p.id===id);if(!p)throw Error('Предложение не найдено');if(p.manager_id===user.id)throw Error('Своё предложение должен согласовать другой тимлид');
  if(!['approved','rejected','changes_requested'].includes(decision))throw Error('Неверное решение');if(p.status!=='pending'){if(p.status===decision)return p;throw Error('Решение уже принято');}
  p.status=decision;p.decided_by=user.id;p.decided_at=new Date().toISOString();p.decision_note=String(note).slice(0,2000);db.write();return p;
 }
 function draft(id,user){const p=all().find(p=>p.id===id);if(!p||p.manager_id!==user.id||p.status!=='approved')throw Error('Нужно одобрение тимлида');const b=db.get('bloggers').find({id:p.blogger_id}).value();if(!b||b.assigned_manager_id!==user.id||b.instagram_url!==p.instagram_url||['declined','do_not_contact'].includes(b.status))throw Error('Контакт или ответственный изменился');const s=db.getState();s.discovery_outbox=s.discovery_outbox||[];const old=s.discovery_outbox.find(d=>d.proposal_id===id);if(old)return old;const d={id:crypto.randomUUID(),blogger_id:b.id,manager_id:user.id,instagram_url:p.instagram_url,text:p.text,status:'draft',proposal_id:p.id,created_at:new Date().toISOString()};s.discovery_outbox.push(d);db.write();return d;}
 function mount(app,auth){if(env.DISCOVERY_ENABLED!=='1')return;const wrap=fn=>(req,res)=>{try{if(!['admin','manager'].includes(req.user.role))return res.status(403).json({error:'Нет доступа'});res.json(fn(req));}catch(e){res.status(409).json({error:e.message});}};
 app.get('/api/discovery/proposal-catalog',auth,async(req,res)=>{if(!['admin','manager'].includes(req.user.role))return res.status(403).end();try{if(!env.BARTER_BOX_ORIGIN||new URL(env.BARTER_BOX_ORIGIN).protocol!=='https:'||(env.FLOW_CRM_SECRET||'').length<32)throw Error('Не настроена связь с каталогом Barter Box');const r=await fetch(new URL('/api/automation/crm-catalog',env.BARTER_BOX_ORIGIN),{headers:{Authorization:'Bearer '+env.FLOW_CRM_SECRET},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Каталог Barter Box недоступен');const data=await r.json();if(!Array.isArray(data.items)||data.items.some(p=>!p.id||!p.name||!Number.isSafeInteger(p.costMinor)||p.costMinor<0))throw Error('Некорректный каталог');db.getState().negotiation_catalog={items:data.items,at:new Date().toISOString()};db.write();res.json(data);}catch(e){res.status(503).json({error:e.message})}});
 app.get('/api/discovery/proposals',auth,wrap(r=>({canApprove:lead(r.user),proposals:all().filter(p=>lead(r.user)||p.manager_id===r.user.id)})));
 app.post('/api/discovery/proposals',auth,wrap(r=>create(r.body,r.user)));
 app.post('/api/discovery/proposals/:id/decision',auth,wrap(r=>decide(r.params.id,r.body.decision,r.user,r.body.note)));
 app.post('/api/discovery/proposals/:id/draft',auth,wrap(r=>draft(r.params.id,r.user)));
 }
 return {create,decide,draft,mount};
}
module.exports={createNegotiation};
