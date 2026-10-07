import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchNotifications} from '../../lib/support/notification-delivery.ts';

const job={id:'test-job',recipient:'jamesrae.rosario18@gmail.com',body:'Test resolution',claim:'random-claim'};
test('notification dry run never calls a paid provider or claims live delivery',async()=>{
 const calls=[];
 const rpc=async(action,data)=>{calls.push({action,data});return action==='notification_claim'?job:{}};
 const result=await dispatchNotifications(rpc,{dryRun:true,appUrl:'https://queuedrop-test.vercel.app',send:()=>{throw Error('Provider must not be called')}});
 assert.deepEqual(result,{sent:0,simulated:1,failed:0});assert.equal(calls[1].data.state,'simulated');
});
test('live delivery goes only to the support inbox with a stable idempotency key',async()=>{
 const calls=[];let request;
 const rpc=async(action,data)=>{calls.push({action,data});return action==='notification_claim'?job:{}};
 const result=await dispatchNotifications(rpc,{dryRun:false,apiKey:'synthetic-test-key',from:'QueueDrop <support@example.invalid>',replyTo:'owner@gmail.com',appUrl:'https://getqueuedrop.com',send:async(url,init)=>{request={url,init};return new Response(JSON.stringify({id:'provider-test'}),{status:200});}});
 assert.equal(result.sent,1);assert.equal(request.init.headers['Idempotency-Key'],'support-owner/test-job');assert.deepEqual(JSON.parse(request.init.body).to,[job.recipient]);assert.equal(JSON.parse(request.init.body).reply_to,'owner@gmail.com');assert.equal(JSON.parse(request.init.body).from,'QueueDrop <support@example.invalid>');assert.equal(calls[1].data.state,'sent');
});
test('provider failure is persisted for retry without exposing provider secrets',async()=>{
 const calls=[];const rpc=async(action,data)=>{calls.push({action,data});return action==='notification_claim'?job:{}};
 const result=await dispatchNotifications(rpc,{dryRun:false,apiKey:'synthetic-test-key',from:'support@example.invalid',appUrl:'https://getqueuedrop.com',send:async()=>new Response(JSON.stringify({error:'secret details'}),{status:500})});
 assert.equal(result.failed,1);assert.equal(calls[1].data.state,'failed');assert.doesNotMatch(calls[1].data.error,/secret/);
});
test('unconfigured live delivery leaves outbox untouched',async()=>{
 let called=false;await assert.rejects(()=>dispatchNotifications(async()=>{called=true},{dryRun:false,appUrl:'https://getqueuedrop.com'}),/not configured/);assert.equal(called,false);
});
test('legacy client jobs never reach the email provider, in live or dry-run mode',async()=>{
 for(const dryRun of [true,false]){
  const calls=[];let sent=false;
  const rpc=async(action,data)=>{calls.push({action,data});return action==='notification_claim'?{...job,recipient:'client@example.invalid'}:{}};
  const result=await dispatchNotifications(rpc,{dryRun,apiKey:'synthetic',from:'support@example.invalid',appUrl:'https://getqueuedrop.com',send:()=>{sent=true;throw Error('Must not send')}});
  assert.equal(sent,false);assert.equal(result.failed,1);assert.equal(calls[1].data.state,'failed');assert.match(calls[1].data.error,/disabled/);
 }
});
