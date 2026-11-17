// Explicit DOM contract: never infer authors from bubble colour or page position.
export async function readVisibleMessages(page,{rowSelector,idAttribute,senderAttribute,textSelector,timeSelector}={}){
 if(!rowSelector||!idAttribute||!senderAttribute||!textSelector) return {supported:false,reason:'Настройте и проверьте селекторы сообщений, ID и отправителя на реальном Instagram',messages:[]};
 const rows=await page.locator(rowSelector).evaluateAll((nodes,c)=>nodes.map(n=>({externalId:n.getAttribute(c.idAttribute),sender:n.getAttribute(c.senderAttribute),text:n.querySelector(c.textSelector)?.textContent||'',sentAt:c.timeSelector?n.querySelector(c.timeSelector)?.getAttribute('datetime'):null})),{idAttribute,senderAttribute,textSelector,timeSelector});
 if(rows.some(r=>!r.externalId||!['incoming','outgoing'].includes(r.sender)))return {supported:false,reason:'Автор или постоянный ID сообщения не подтверждены',messages:[]};
 return {supported:true,messages:rows.filter(r=>r.text.trim()).map(r=>({...r,text:r.text.trim().slice(0,10000)}))};
}
