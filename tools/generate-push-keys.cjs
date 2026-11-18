'use strict';
// Run locally or in a protected hosting terminal. Never paste output into chat or Git.
const {generateVAPIDKeys}=require('../server/node_modules/web-push');
const k=generateVAPIDKeys();console.log('PUSH_VAPID_PUBLIC_KEY='+k.publicKey);console.log('PUSH_VAPID_PRIVATE_KEY='+k.privateKey);
