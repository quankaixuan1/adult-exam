const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReceipt, validateTime } = require('../cloudfunctions/admin-api/payment-ocr');
const parse = text => parseReceipt(text.split('\n').map(DetectedText=>({DetectedText})));
test('extract labeled payment date and amount, ignore order and status bar time',()=>{
 const r=parse('12:30\n订单创建时间 2025-01-01 12:00\n付款时间\n2025年1月2日 13:04:05\n付款金额 ￥680.00\n交易单号 123456789012\n微信支付');
 assert.equal(r.paidAt,'2025-01-02T13:04:05');assert.equal(r.amount,'680.00');assert.equal(r.channel,'微信');
});
test('ambiguous dates and missing payment labels require manual review',()=>{
 assert.equal(parse('付款时间 2025-01-01 12:00\n到账时间 2025-01-02 12:00').paidAt,'');
 assert.equal(parse('退款时间 2025-01-01 12:00').paidAt,'');
 assert.equal(parse('订单创建时间 2025-01-01 12:00').paidAt,'');
});
test('reject invalid dates and convert China time',()=>{
 assert.throws(()=>validateTime('2025-02-30T12:00'));
 assert.throws(()=>validateTime('2099-01-01T12:00'));
 assert.equal(validateTime('2025-01-02T00:00'),'2025-01-01T16:00:00.000Z');
});
test('actual-date statistics do not allocate multiple proofs or mismatched balances',()=>{
 const {summarize}=require('../cloudfunctions/admin-api/statistics');
 const p={paymentInfo:{paidAt:'2025-01-01T00:00:00Z',amount:100,confirmedAt:'2025-01-02'}};
 const base={_id:'a',paymentStatus:'paid',actualPaidAmount:100,paymentProofs:[p]};
 const f={mode:'payments',dateBasis:'actual',start:'2025-01-01',end:'2025-01-01'};
 assert.equal(summarize([base],f).amount,10000);
 assert.equal(summarize([{...base,paymentProofs:[p,p]}],f).total,0);
 assert.equal(summarize([{...base,actualPaidAmount:200}],f).total,0);
});
test('OCR works without global fetch or AbortSignal and handles bad responses', async () => {
 const https = require('https'); const {EventEmitter}=require('events');
 const original = https.request, oldFetch=global.fetch, oldAbort=global.AbortSignal;
 const oldId=process.env.OCR_SECRET_ID, oldKey=process.env.OCR_SECRET_KEY;
 let status=200, body=JSON.stringify({Response:{TextDetections:[{DetectedText:'付款时间 2025-01-02 13:04:05'}]}});
 try {
  global.fetch=undefined; global.AbortSignal=undefined;
  process.env.OCR_SECRET_ID='test';process.env.OCR_SECRET_KEY='test';
  https.request=(url, options, callback)=>{
   assert.equal(url,'https://ocr.tencentcloudapi.com');
   const req=new EventEmitter();req.destroy=e=>{req.emit('error',e);req.emit('close');};
   req.end=()=>process.nextTick(()=>{const res=new EventEmitter();res.statusCode=status;callback(res);res.emit('data',Buffer.from(body));res.emit('end');req.emit('close');});return req;
  };
  const {recognize}=require('../cloudfunctions/admin-api/payment-ocr');
  assert.equal((await recognize('test')).paidAt,'2025-01-02T13:04:05');
  status=503;await assert.rejects(recognize('test'),/暂时不可用/);
  status=200;body='not json';await assert.rejects(recognize('test'),/返回异常/);
 } finally {
  https.request=original;global.fetch=oldFetch;global.AbortSignal=oldAbort;
  for(const [key,value] of [['OCR_SECRET_ID',oldId],['OCR_SECRET_KEY',oldKey]]) if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
