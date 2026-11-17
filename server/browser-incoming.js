'use strict';
const crypto=require('crypto');
function storeIncoming(db,job,snapshot){
 if(!snapshot||snapshot.supported!==true)return {saved:0,supported:false};
 if(!Array.isArray(snapshot.messages)||snapshot.messages.length>200)throw Error('Некорректный снимок сообщений');
 const b=db.get('bloggers').find({id:job.bloggerId}).value();if(!b)throw Error('Блогер не найден');
 const s=db.getState();s.instagram_messages=s.instagram_messages||[];let saved=0;
 const prepared=snapshot.messages.map(m=>{if(typeof m.externalId!=='string'||!m.externalId||m.externalId.length>300||!['incoming','outgoing'].includes(m.sender)||typeof m.text!=='string'||m.text.length>10000)throw Error('Нет проверенного автора / ID / текста');return m;});
 for(const m of prepared){const key=crypto.createHash('sha256').update(JSON.stringify([job.accountId,job.bloggerId,m.externalId])).digest('hex');if(s.instagram_messages.some(x=>x.key===key))continue;s.instagram_messages.push({id:crypto.randomUUID(),key,blogger_id:b.id,manager_id:job.managerId,account_id:job.accountId,external_id:m.externalId,direction:m.sender,text:m.text,sent_at:m.sentAt&&Number.isFinite(Date.parse(m.sentAt))?m.sentAt:null,captured_at:new Date().toISOString(),source:'browser_visible_dom'});saved++;if(m.sender==='incoming'){if(['new','in_work','contacted','transferred'].includes(b.status))b.status='replied';b.instagram_unread=true;for(const d of s.discovery_outbox||[])if(d.blogger_id===b.id&&d.status==='draft'&&!d.proposal_id)d.status='cancelled';}}
 db.write();return {saved,supported:true};
}
module.exports={storeIncoming};
