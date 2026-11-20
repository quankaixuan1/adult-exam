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
   assert.equal(options.headers['X-TC-Action'], 'GeneralAccurateOCR');
   const req=new EventEmitter();req.destroy=e=>{req.emit('error',e);req.emit('close');};
   req.end=(payload)=>{assert.deepEqual(JSON.parse(payload), { ImageBase64: 'test' }); return process.nextTick(()=>{const res=new EventEmitter();res.statusCode=status;callback(res);res.emit('data',Buffer.from(body));res.emit('end');req.emit('close');});};return req;
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

test('extracts received amounts from WeChat and successful Alipay bills', () => {
 const parse = lines => require('../cloudfunctions/admin-api/payment-ocr').parseReceipt(lines.map(DetectedText => ({DetectedText})));
 const wechat = parse(['二维码收款', '+220.00', '已收钱', '收款时间', '2025年11月17日 14:20:57', '本服务由财付通提供']);
 assert.equal(wechat.amount, '220.00');
 assert.equal(wechat.paidAt, '2025-11-17T14:20:57');
 assert.equal(wechat.channel, '微信');
 const alipay = parse(['账单详情', '+220.00', '交易成功', '创建时间 2025–11–18 16:45:41', '收款方式', '支付宝商家服务']);
 assert.equal(alipay.amount, '220.00');
 assert.equal(alipay.paidAt, '2025-11-18T16:45:41');
 assert.equal(parse(['创建时间 2025-11-18 16:45:41', '+220.00']).paidAt, '');
 assert.equal(parse(['二维码收款', '已收钱', '+220.00', '+320.00']).amount, '');
});

test('extracts negative display amounts only from successful outgoing payments', () => {
 const {parseReceipt} = require('../cloudfunctions/admin-api/payment-ocr');
 const amount = (...lines) => parseReceipt(lines.map(DetectedText => ({DetectedText}))).amount;
 assert.equal(amount('支付成功', '−￥220.00'), '220.00');
 assert.equal(amount('账单详情', '交易成功', '支出', '-220.00'), '220.00');
 assert.equal(amount('退款成功', '-220.00'), '');
 assert.equal(amount('支付成功', '已退款', '-220.00'), '');
 assert.equal(amount('账单详情', '-220.00'), '');
 assert.equal(amount('支付成功', '-220.00', '-320.00'), '');
});
