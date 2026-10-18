const express = require('express');
const { createService } = require('../core/registration');
const { AppError } = require('../core/errors');
const { createAuthService } = require('../core/auth');
const { createWechatProvider } = require('../providers/wechat');
const { publicCatalog } = require('../core/catalog');
function createApp(repository, { wechat = createWechatProvider({}), now = Date.now } = {}) {
  const app = express(), service = createService(repository), auth = createAuthService(repository,wechat,now);
  const demoAuth = createAuthService(repository, {
    configured: true,
    async exchange(code) { return { appId: 'local-demo', openId: code }; }
  }, now);
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if (req.headers.origin) return res.status(403).json({message:'仅支持本地开发者工具请求'});
    next();
  });
  const limit = maximum => {
    let start=now(),count=0;
    return (req,res,next)=>{
      if(now()-start>=60000){start=now();count=0;}
      if(++count>maximum)return res.status(429).set('Retry-After','60').json({message:'操作过于频繁，请稍后再试'});
      next();
    };
  };
  app.use('/api',limit(120));
  app.use(express.json({limit:'8kb'}));
  const token=req=>/^Bearer ([^\s]+)$/.exec(req.headers.authorization || '')?.[1] || '';
  const signedIn=async(req,res,next)=>{req.student=await auth.authenticate(token(req));next();};
  app.get('/api/health',(req,res)=>res.json({ok:true,mode:'local-development',version:'0.2.0'}));
  app.get('/api/auth/config',(req,res)=>res.json({wechatReady:auth.configured(),demoMode:!auth.configured()}));
  app.post('/api/auth/wechat',limit(20),async(req,res)=>res.json(await auth.login(req.body)));
  app.post('/api/auth/demo',limit(20),async(req,res)=>{
    if (auth.configured()) throw new AppError(404, '接口不存在');
    res.json(await demoAuth.login(req.body));
  });
  app.post('/api/auth/logout',async(req,res)=>res.json(await auth.logout(token(req))));
  app.get('/api/me',signedIn,(req,res)=>res.json({student:req.student}));
  app.get('/api/catalog',(req,res)=>res.json({demo:true,programs:publicCatalog()}));
  app.get('/api/me/registration',signedIn,async(req,res)=>res.json({registration:await service.mine(req.student)}));
  app.post('/api/registrations',signedIn,async(req,res)=>res.status(201).json({registration:await service.register(req.body,req.student)}));
  app.patch('/api/me/registration',signedIn,async(req,res)=>res.json({registration:await service.update(req.body,req.student)}));
  // Legacy status-only access is restricted to unbound v1 records. No self-service claim endpoint.
  app.get('/api/registrations/me/status',async(req,res)=>res.json(await service.legacyStatus(token(req))));
  app.post('/api/drafts',(req,res)=>res.status(410).json({message:'请更新小程序并通过微信登录后报名'}));
  app.use((req,res)=>res.status(404).json({message:'接口不存在'}));
  app.use((err,req,res,next)=>{
    const status=err instanceof AppError ? err.status : err.type==='entity.too.large' ? 413 : err.type==='entity.parse.failed' ? 400 : 500;
    res.status(status).json({code:err instanceof AppError ? err.code : 'REQUEST_FAILED',message:err instanceof AppError ? err.message : status===400 ? '请求格式错误' : status===413 ? '提交内容过大' : '服务暂时不可用，请稍后再试'});
  });
  return app;
}
module.exports={createApp};
