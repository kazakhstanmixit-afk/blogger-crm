import {observeChat} from './network-incoming.mjs';
import {readVisibleMessages} from './incoming.mjs';
const exact=value=>new RegExp('^'+value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
async function openDirect(page,handle,origin,entryWaitMs){
 await page.goto(origin+'/direct/new/',{waitUntil:'domcontentloaded'});
 if(/\/accounts\/login|\/challenge|\/checkpoint/.test(page.url()))return 'Требуется ручной вход / проверка Instagram';
 let dialog=page.getByRole('dialog');await dialog.first().waitFor({state:'visible',timeout:Math.min(entryWaitMs,1500)}).catch(()=>{});
 if(await dialog.count()===0){
  let opened=false;
  for(const name of [/^(Send message|Отправить сообщение)$/i,/^(New message|Новое сообщение)$/i]){
   const control=page.getByRole('button',{name});await control.first().waitFor({state:'visible',timeout:entryWaitMs}).catch(()=>{});
   if(await control.count()===1&&await control.isVisible()){await control.click();opened=true;break;}
  }
  if(!opened)return 'Открыт Direct, но не найдена кнопка нового сообщения';
  dialog=page.getByRole('dialog');await dialog.first().waitFor({state:'visible',timeout:entryWaitMs}).catch(()=>{});
 }
 if(await dialog.count()!==1||!await dialog.isVisible())return 'Не открылось однозначное окно выбора получателя Direct';
 const scope=dialog;

 let search=scope.getByRole('textbox',{name:/^(Search|Search\.\.\.|Поиск|Поиск\.\.\.|To:|Кому:)$/i});
 if(await search.count()!==1)search=scope.getByPlaceholder(/^(Search|Search\.\.\.|Поиск|Поиск\.\.\.)$/i);
 await search.first().waitFor({state:'visible',timeout:entryWaitMs}).catch(()=>{});
 if(await search.count()!==1||!await search.isVisible())return 'В Direct не найдено однозначное поле поиска получателя';
 await search.fill(handle);const recipient=scope.getByText(exact(handle),{exact:true});await recipient.first().waitFor({state:'visible',timeout:entryWaitMs}).catch(()=>{});
 if(await recipient.count()!==1||!await recipient.isVisible())return 'Direct не показал единственного получателя с точным ником';
 await recipient.click();const next=scope.getByRole('button',{name:/^(Chat|Next|Чат|Далее)$/i});
 if(await next.count()!==1)return 'Не найдена однозначная кнопка открытия диалога';await next.click();return null;
}
export async function sendApproved(page,job,report,{origin='https://www.instagram.com',headerSelector='header',messageRowSelector='[role="row"]',waitMs=10000,entryWaitMs=8000,ownInstagramId,incomingConfig}={}){
 if(!/^[a-z0-9._]{1,30}$/i.test(job.handle)||(job.operation!=='inspect'&&!job.text?.trim())||job.text.length>1000)throw Error('Invalid approved recipient/message');let sending=false;const screenshot=async()=>Buffer.from(await page.screenshot({type:'png'})).toString('base64');
 const observer=ownInstagramId?observeChat(page,job.handle,ownInstagramId):null;
 try{await page.goto(origin+'/'+encodeURIComponent(job.handle)+'/',{waitUntil:'domcontentloaded'});
 if(/\/accounts\/login|\/challenge|\/checkpoint/.test(page.url())||await page.getByRole('textbox',{name:/password|пароль/i}).count())return report('needs_login',{note:'Требуется ручной вход / проверка Instagram',screenshot:await screenshot()});
 const entry=page.getByRole('button',{name:/^(Message|Send message|Сообщение|Написать|Отправить сообщение)$/i});await entry.first().waitFor({state:'visible',timeout:entryWaitMs}).catch(()=>{});if(await entry.count()===1&&await entry.isVisible())await entry.click();else{const reason=await openDirect(page,job.handle,origin,entryWaitMs);if(reason)return report(/вход|проверка Instagram/.test(reason)?'needs_login':'needs_review',{note:reason,screenshot:await screenshot()});}
 const profile=page.locator(headerSelector).locator('a[href="/'+job.handle+'/"],a[href="/'+job.handle+'"],a[href="'+origin+'/'+job.handle+'/"],a[href="'+origin+'/'+job.handle+'"]');await profile.first().waitFor({state:'visible',timeout:1500}).catch(()=>{});if(await profile.count()!==1||!await profile.first().isVisible())return report('needs_review',{note:'Адресат в заголовке не подтверждён',screenshot:await screenshot()});const href=await profile.getAttribute('href');if(!href||new URL(href,origin).pathname.replace(/\/$/,'')!=='/'+job.handle)return report('needs_review',{note:'Ссылка адресата не совпадает',screenshot:await screenshot()});
 if(job.operation==='inspect'){let snapshot=observer?await observer.snapshot():{supported:false};if(!snapshot.supported)snapshot=await readVisibleMessages(page,incomingConfig);return report('inspected',{note:snapshot.supported?'Видимые сообщения считаны; полная история не гарантируется':snapshot.reason,snapshot,screenshot:await screenshot()});}
 const composer=page.getByRole('textbox',{name:/^(Message|Message\.\.\.|Сообщение|Сообщение\.\.\.)$/i});if(await composer.count()!==1)return report('needs_review',{note:'Поле сообщения не определено',screenshot:await screenshot()});await composer.fill(job.text);const before=await page.locator(messageRowSelector).filter({hasText:job.text}).count();
 const send=page.getByRole('button',{name:/^(Send|Отправить)$/i});await send.first().waitFor({state:'visible',timeout:entryWaitMs}).catch(()=>{});if(await send.count()!==1||!await send.isEnabled())return report('needs_review',{note:'Кнопка отправки не определена однозначно или недоступна; сообщение не отправлялось',screenshot:await screenshot()});await report('sending',{recipientVerified:true,screenshot:await screenshot()});sending=true;await send.click();
 await page.waitForFunction(({selector,text,count})=>[...document.querySelectorAll(selector)].filter(n=>n.textContent.includes(text)).length>count,{selector:messageRowSelector,text:job.text,count:before},{timeout:waitMs});const left=await composer.evaluate(n=>'value'in n?n.value:n.textContent);if(left.trim())throw Error('Composer did not clear');await report('sent_ui',{note:'Сообщение появилось в интерфейсе; доставка/прочтение API не подтверждены',screenshot:await screenshot()});
 }catch{await report(sending?'uncertain':'failed',{note:sending?'Проверьте чат перед повтором':'Браузерный шаг не завершён',screenshot:await screenshot().catch(()=>undefined)})}finally{observer?.stop();}
}
