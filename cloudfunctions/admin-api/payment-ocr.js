const https = require('https');
const { createHash, createHmac } = require('crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
function parseReceipt(lines) {
  const text = lines.map(l => l.DetectedText || '').join('\n').normalize('NFKC').replace(/[–—−]/g, '-');
  const alipayReceipt = /账单详情/.test(text) && /支付宝/.test(text) && /交易成功/.test(text) && /收款方式|收钱码收款/.test(text);
  const receivedReceipt = /已收钱/.test(text) && /二维码收款/.test(text);
  const dates = [];
  const pattern = /(?:付款时间|支付时间|交易时间|转账时间|到账时间|收款时间)[：:\s]*(20\d{2})[年\/-](\d{1,2})[月\/-](\d{1,2})日?\s*(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?/g;
  const matches = [...text.matchAll(pattern)];
  if (!matches.length && alipayReceipt) {
    matches.push(...text.matchAll(new RegExp(pattern.source.replace('付款时间|支付时间|交易时间|转账时间|到账时间|收款时间', '创建时间'), 'g')));
  }
  for (const m of matches) {
    const local = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T${m[4].padStart(2,'0')}:${m[5]}:${m[6] || '00'}`;
    try { validateTime(local); dates.push(local); } catch (_) {}
  }
  const unique = [...new Set(dates)];
  const amounts = [...text.matchAll(/(?:实付金额|付款金额|支付金额|转账金额|交易金额)[：:\s]*[¥￥]?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/g)].map(m=>m[1].replaceAll(',',''));
  const paidReceipt = !/退款|退回|撤销|交易关闭/.test(text) && (
    /付款成功|支付成功|转账成功/.test(text) ||
    (/账单详情|账单/.test(text) && /交易成功/.test(text) && /支出|付款方式|支付方式/.test(text))
  );
  if (!amounts.length) {
    for (const line of text.split('\n')) {
      const match = line.trim().match(/^([+-])\s*¥?\s*(\d+(?:,\d{3})*\.\d{2})$/);
      if (!match || Number(match[2].replaceAll(',', '')) <= 0) continue;
      const validDirection = match[1] === '+' ? receivedReceipt || alipayReceipt : paidReceipt;
      if (validDirection) amounts.push(match[2].replaceAll(',', ''));
    }
  }
  const amountValues = [...new Set(amounts)];
  return { paidAt: unique.length === 1 ? unique[0] : '', amount: amountValues.length === 1 ? amountValues[0] : '', transactionNo: text.match(/(?:交易单号|交易号|转账单号)[：:\s]*([A-Za-z0-9]{8,80})/)?.[1] || '', channel: /微信|财付通/.test(text) ? '微信' : /支付宝/.test(text) ? '支付宝' : /银行/.test(text) ? '银行转账' : '', warning: unique.length !== 1 ? '付款时间缺失或存在多个时间，请查看原图手动核对。' : '识别结果仅供参考，请核对原图后确认。' };
}
function validateTime(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) throw Error('请填写完整的实际付款时间');
  const normalized = value.length === 16 ? value + ':00' : value;
  const time = Date.parse(normalized + '+08:00');
  if (!Number.isFinite(time) || new Date(time+8*3600000).toISOString().slice(0,19) !== normalized || time > Date.now()+300000) throw Error('实际付款时间无效或晚于当前时间');
  return new Date(time).toISOString();
}
async function recognize(base64) {
  const id = process.env.OCR_SECRET_ID, key = process.env.OCR_SECRET_KEY;
  if (!id || !key) throw Error('尚未配置OCR服务，可先手动填写付款信息');
  const body = JSON.stringify({ ImageBase64: base64 });
  const timestamp = Math.floor(Date.now()/1000), date = new Date(timestamp*1000).toISOString().slice(0,10);
  const scope = `${date}/ocr/tc3_request`;
  const canonical = `POST\n/\n\ncontent-type:application/json\nhost:ocr.tencentcloudapi.com\n\ncontent-type;host\n${hash(body)}`;
  const signature = createHmac('sha256',hmac(hmac(hmac(`TC3${key}`,date),'ocr'),'tc3_request')).update(`TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`).digest('hex');
  const result = await new Promise((resolve, reject) => {
    const req = https.request('https://ocr.tencentcloudapi.com', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      'X-TC-Action': 'GeneralAccurateOCR', 'X-TC-Version': '2018-11-19',
      'X-TC-Timestamp': String(timestamp), 'X-TC-Region': 'ap-guangzhou',
      Authorization: `TC3-HMAC-SHA256 Credential=${id}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`
    } }, res => {
      let size = 0; const chunks = [];
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) { req.destroy(new Error('识别响应过大，请手动填写')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('识别服务暂时不可用，请重试或手动填写'));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')).Response); }
        catch (_) { reject(new Error('识别服务返回异常，请重试或手动填写')); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('识别超时，请重试或手动填写')), 20000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end(body);
  });
  if (!result || result.Error) throw Error('凭证识别失败，请检查OCR服务配置或手动填写');
  return parseReceipt(result.TextDetections || []);
}
module.exports = { recognize, parseReceipt, validateTime };
