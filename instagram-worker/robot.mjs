import {observeChat} from './network-incoming.mjs';
import {readVisibleMessages} from './incoming.mjs';
const exact=value=>new RegExp('^'+value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
async function selectRecipientRow(scope,handle,timeout){
 const result=await scope.evaluateHandle((root,handle)=>{
  const norm=s=>String(s||'').trim().replace(/^@/,'').toLowerCase(),visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const matches=[...root.querySelectorAll('*')].filter(e=>visible(e)&&norm(e.innerText||e.textContent)===handle&&!Array.from(e.children).some(c=>visible(c)&&norm(c.innerText||c.textContent)===handle));
  if(!matches.length)return {reason:'В результатах Direct пока нет точного ника'};
  const selector='button,[role="button"],[role="option"],label';
  const rows=[...root.querySelectorAll(selector)].filter(e=>visible(e)&&matches.every(m=>e.contains(m)));
  const smallest=rows.filter(e=>!rows.some(other=>other!==e&&e.contains(other)));
  if(smallest.length!==1)return {reason:'В Direct несколько разных строк с этим ником; выбор остановлен'};
  const row=smallest[0],controls=row.querySelectorAll('input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"]');
  const nested=[...row.querySelectorAll(selector)].filter(e=>matches.some(m=>e.contains(m)));
  const leaves=nested.filter(e=>!nested.some(other=>other!==e&&e.contains(other)));
  if(controls.length>1||!controls.length&&leaves.length>1)return {reason:'Не удалось выделить одну строку получателя'};
  return {row};
 },handle);
 try{const reason=await (await result.getProperty('reason')).jsonValue();if(reason)return reason;const row=(await result.getProperty('row')).asElement();if(!row)return 'Не найдена строка получателя';const controls=await row.$$('input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"]');if(controls.length===1&&await controls[0].isVisible())await controls[0].click({timeout});else await row.click({timeout});return null;}finally{await result.dispose();}
}
async function openDirect(page,handle,origin,entryWaitMs,setStep=()=>{}){
 setStep('Открытие Direct');
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
 setStep('Поиск получателя Direct');await search.fill(handle);const recipient=scope.getByText(exact(handle),{exact:true});await recipient.first().waitFor({state:'visible',timeout:entryWaitMs}).catch(()=>{});
 setStep('Выбор точной строки получателя');const selectionError=await selectRecipientRow(scope,handle.toLowerCase(),entryWaitMs);if(selectionError)return selectionError;
 setStep('Нажатие Chat');const next=scope.getByRole('button',{name:/^(Chat|Next|Чат|Далее)$/i});
 if(await next.count()!==1)return 'Не найдена однозначная кнопка открытия диалога';try{await next.click({timeout:entryWaitMs});}catch{return 'Instagram не подтвердил выбор получателя: кнопка Chat недоступна';}return null;
}
// Verify a profile URL in chat UI, never an arbitrary matching sidebar link or display name.
async function verifyChatRecipient(page,handle,origin,headerSelector,timeout){
 try{
  const evidence=await page.waitForFunction(({handle,origin,headerSelector})=>{
   const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
   const username=a=>{try{const u=new URL(a.getAttribute('href'),origin);if(u.origin!==origin)return null;const p=u.pathname.replace(/\/+$/,'');return /^\/[a-z0-9._]{1,30}$/i.test(p)?p.slice(1).toLowerCase():null;}catch{return null;}};
   const headerLinks=[...document.querySelectorAll(headerSelector)].filter(visible).flatMap(h=>[...h.querySelectorAll('a[href]')]).filter(visible);
   const headerUsers=headerLinks.map(username).filter(Boolean);
   if(headerUsers.some(u=>u!==handle))return {verified:false,reason:'Ссылка в шапке чата указывает на другого адресата'};
   if(headerUsers.includes(handle))return {verified:true,source:'chat_header_profile_link'};
   const cards=[...document.querySelectorAll('main a[href],[role="main"] a[href]')].filter(a=>visible(a)&&!a.closest('nav,aside,[role="navigation"],[role="row"]')&&/^(View profile|Смотреть профиль|Посмотреть профиль)$/i.test((a.getAttribute('aria-label')||a.innerText||'').trim()));
   const users=cards.map(username).filter(Boolean);
   if(users.some(u=>u!==handle))return {verified:false,reason:'Карточка профиля в чате указывает на другого адресата'};
   if(users.includes(handle))return {verified:true,source:'chat_profile_card_link'};
   return false;
  },{handle:handle.toLowerCase(),origin,headerSelector},{timeout});
  try{return await evidence.jsonValue();}finally{await evidence.dispose();}
 }catch{return {verified:false,reason:'Не найдена подтверждённая ссылка адресата в шапке или карточке чата'};}
}
// Instagram's editor may be contenteditable without an accessible name. Never use inbox Search.
async function findComposer(page,timeout){
 const h=await page.waitForFunction(()=>{
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const label=e=>[e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.getAttribute('data-placeholder')].find(v=>v?.trim())?.trim()||'';
  const editors=[...document.querySelectorAll('[contenteditable="true"],textarea,input[type="text"]')].filter(e=>visible(e)&&!e.closest('nav,aside,[role="navigation"],[role="dialog"]')&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'&&!e.readOnly);
  const named=editors.filter(e=>/^(Message|Сообщение|Напишите сообщение)(?:\.{3}|…)?$/i.test(label(e)));
  if(named.length===1)return named[0];if(named.length>1)return false;
  const unnamed=editors.filter(e=>!label(e)&&!e.matches('input')&&(e.getAttribute('role')==='textbox'||e.matches('textarea')));
  return unnamed.length===1?unnamed[0]:false;
 },null,{timeout}).catch(()=>null);
 return h?.asElement()||null;
}
const normalText=value=>String(value||'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').trim();
async function editorText(editor){return normalText(await editor.evaluate(e=>'value'in e?e.value:e.innerText));}
async function visibleTextEvidence(page,text){
 return page.evaluate(text=>{
  const norm=s=>String(s||'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').trim();
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  return [...document.querySelectorAll('body *')].filter(e=>visible(e)&&!e.closest('nav,aside,[role="navigation"],[contenteditable="true"],textarea,input')&&norm(e.innerText)===text&&!Array.from(e.children).some(c=>visible(c)&&norm(c.innerText)===text)).length;
 },normalText(text));
}
async function findSend(page,timeout){
 const h=await page.waitForFunction(()=>{
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const buttons=[...document.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&!e.closest('nav,aside,[role="navigation"],[role="dialog"]')&&/^(Send|Отправить)$/i.test((e.getAttribute('aria-label')||e.innerText||'').trim()));
  const leaves=buttons.filter(e=>!buttons.some(other=>other!==e&&e.contains(other)));
  return leaves.length===1&&!leaves[0].disabled&&leaves[0].getAttribute('aria-disabled')!=='true'?leaves[0]:false;
 },null,{timeout}).catch(()=>null);
 return h?.asElement()||null;
}
export async function sendApproved(page,job,report,{origin='https://www.instagram.com',headerSelector='header',messageRowSelector='[role="row"]',waitMs=10000,entryWaitMs=8000,ownInstagramId,incomingConfig}={}){
 if(!/^[a-z0-9._]{1,30}$/i.test(job.handle)||(job.operation!=='inspect'&&!job.text?.trim())||job.text.length>1000)throw Error('Invalid approved recipient/message');let sending=false,step='Открытие профиля';const screenshot=async()=>Buffer.from(await page.screenshot({type:'png'})).toString('base64');
 const observer=ownInstagramId?observeChat(page,job.handle,ownInstagramId):null;
 try{await page.goto(origin+'/'+encodeURIComponent(job.handle)+'/',{waitUntil:'domcontentloaded'});
 if(/\/accounts\/login|\/challenge|\/checkpoint/.test(page.url())||await page.getByRole('textbox',{name:/password|пароль/i}).count())return report('needs_login',{note:'Требуется ручной вход / проверка Instagram',screenshot:await screenshot()});
 const entry=page.getByRole('button',{name:/^(Message|Send message|Сообщение|Написать|Отправить сообщение)$/i});await entry.first().waitFor({state:'visible',timeout:entryWaitMs}).catch(()=>{});if(await entry.count()===1&&await entry.isVisible())await entry.click();else{const reason=await openDirect(page,job.handle,origin,entryWaitMs,value=>{step=value;});if(reason)return report(/вход|проверка Instagram/.test(reason)?'needs_login':'needs_review',{note:reason,screenshot:await screenshot()});}
 step='Проверка ссылки адресата в открытом чате';const recipient=await verifyChatRecipient(page,job.handle,origin,headerSelector,entryWaitMs);if(!recipient.verified)return report('needs_review',{note:recipient.reason,screenshot:await screenshot()});
 if(job.operation==='inspect'){step='Чтение сообщений';let snapshot=observer?await observer.snapshot():{supported:false};if(!snapshot.supported)snapshot=await readVisibleMessages(page,incomingConfig);return report('inspected',{note:snapshot.supported?'Видимые сообщения считаны; полная история не гарантируется':snapshot.reason,snapshot,screenshot:await screenshot()});}
 step='Поиск поля сообщения';let composer=await findComposer(page,entryWaitMs);if(!composer)return report('needs_review',{note:'Не найдено одно видимое поле сообщения в чате; отправка не выполнялась',screenshot:await screenshot()});
 const before=await visibleTextEvidence(page,job.text);if(before)return report('needs_review',{note:'Такой текст уже виден в переписке; повторная отправка остановлена',screenshot:await screenshot()});
 step='Ввод согласованного текста';if(await composer.evaluate(e=>e.isContentEditable)){await composer.fill('');await composer.focus();const lines=job.text.split(/\r\n?|\n/);for(let i=0;i<lines.length;i++){if(i)await page.keyboard.press('Shift+Enter');if(lines[i])await page.keyboard.insertText(lines[i]);}}else await composer.fill(job.text);await composer.dispose();composer=await findComposer(page,entryWaitMs);if(!composer||await editorText(composer)!==normalText(job.text))return report('needs_review',{note:'Текст в поле не совпал с согласованным; отправка не выполнялась',screenshot:await screenshot()});
 step='Проверка кнопки отправки';const send=await findSend(page,entryWaitMs);if(!send)return report('needs_review',{note:'Кнопка отправки не определена однозначно или недоступна; сообщение не отправлялось',screenshot:await screenshot()});
 const finalRecipient=await verifyChatRecipient(page,job.handle,origin,headerSelector,entryWaitMs);if(!finalRecipient.verified)return report('needs_review',{note:finalRecipient.reason,screenshot:await screenshot()});
 if(await editorText(composer)!==normalText(job.text))return report('needs_review',{note:'Текст изменился перед отправкой; отправка остановлена',screenshot:await screenshot()});
 await report('sending',{recipientVerified:true,screenshot:await screenshot()});sending=true;await send.click();await send.dispose();
 step='Подтверждение появления сообщения';await page.waitForFunction(({text,before})=>{
  const norm=s=>String(s||'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').trim();const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const matches=[...document.querySelectorAll('body *')].filter(e=>visible(e)&&!e.closest('nav,aside,[role="navigation"],[contenteditable="true"],textarea,input')&&norm(e.innerText)===text&&!Array.from(e.children).some(c=>visible(c)&&norm(c.innerText)===text));return matches.length>before;
 },{text:normalText(job.text),before},{timeout:waitMs});
 composer=await findComposer(page,Math.min(entryWaitMs,1500));if(!composer||await editorText(composer))throw Error('Composer did not clear');
 const failed=page.getByText(/^(Failed to send|Не удалось отправить|Not delivered|Не доставлено|Tap to retry|Try Again Later|Повторите попытку позже|We restrict certain activity)$/i).filter({visible:true});if(await failed.count())throw Error('Instagram did not confirm sending');
 await report('sent_ui',{note:'Сообщение появилось в интерфейсе; доставка/прочтение API не подтверждены',screenshot:await screenshot()});
 }catch{await report(sending?'uncertain':'failed',{note:sending?'Проверьте чат перед повтором':'Не завершён шаг: '+step,screenshot:await screenshot().catch(()=>undefined)})}finally{observer?.stop();}
}
