'use strict';
const reserved=new Set(['instagram.com','www.instagram.com','m.instagram.com','p','reel','reels','stories','explore','accounts','direct','share','about']);
function parseInstagramHandle(value){let s=String(value||'').trim().toLowerCase();if(!s)return null;
 if(/^(?:https?:\/\/|(?:www\.|m\.)?instagram\.com(?:\/|$))/.test(s)){try{const u=new URL(/^https?:\/\//.test(s)?s:'https://'+s);if(!['instagram.com','www.instagram.com','m.instagram.com'].includes(u.hostname)||u.username||u.password||u.port)return null;const parts=u.pathname.split('/').filter(Boolean);if(parts.length!==1)return null;s=decodeURIComponent(parts[0]);}catch{return null;}}
 else if(s.includes('/')||s.includes(':')||s.includes('?')||s.includes('#'))return null;
 s=s.replace(/^@/,'');return /^[a-z0-9._]{1,30}$/.test(s)&&!reserved.has(s)?s:null;
}
module.exports={parseInstagramHandle};
