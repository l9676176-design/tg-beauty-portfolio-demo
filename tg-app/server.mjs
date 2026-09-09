// HTTP-сервер без фреймворков. Демо и рабочая база физически разделены режимом запуска.
import http from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createStore, AppError, dateAt } from './database.mjs';
import { studio,rules,services,works } from './content.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const digest = x=>createHash('sha256').update(x).digest('hex');
export function verifyTelegram(raw,token,ownerId) {
  if(typeof raw!=='string'||!token) throw new AppError(401,'Откройте приложение из Telegram.');
  const p=new URLSearchParams(raw),hash=p.get('hash');
  if(!hash||!/^[a-f0-9]{64}$/.test(hash)||new Set([...p.keys()]).size!==[...p.keys()].length) throw new AppError(401,'Сессия Telegram не подтверждена.');
  p.delete('hash');const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  const expected=createHmac('sha256',secret).update(check).digest();
  if(!timingSafeEqual(Buffer.from(hash,'hex'),expected)) throw new AppError(401,'Сессия Telegram не подтверждена.');
  const age=Date.now()/1000-Number(p.get('auth_date'));
  if(!Number.isFinite(age)||age>3600||age< -60) throw new AppError(401,'Сессия устарела. Откройте приложение заново.');
  let user;try{user=JSON.parse(p.get('user'));}catch{throw new AppError(401,'Не удалось определить пользователя.');}
  if(!Number.isSafeInteger(user?.id)||user.id<=0) throw new AppError(401,'Не удалось определить пользователя.');
  return {id:`tg:${user.id}`,name:String(user.first_name||'Клиент').slice(0,70),role:String(user.id)===String(ownerId)?'owner':'client'};
}
export function createApp(options={}) {
  const mode=options.mode||process.env.APP_MODE||'demo';
  if(!['demo','production'].includes(mode)) throw Error('APP_MODE должен быть demo или production');
  const token=options.token??process.env.BOT_TOKEN, ownerId=options.ownerId??process.env.OWNER_TELEGRAM_ID;
  if(mode==='production' && (!token||!ownerId||studio.demoContent||!studio.telegramUsername)) throw Error('Для рабочего запуска нужны BOT_TOKEN, OWNER_TELEGRAM_ID, реальный контакт и demoContent:false в content.mjs');
  const dataRoot=options.dataDir||process.env.DATA_DIR||join(root,'.data');
  const store=createStore(join(dataRoot,mode==='demo'?'demo.sqlite':'production.sqlite'));
  const staticFiles=new Map([['/','index.html'],['/index.html','index.html'],['/portfolio.html','portfolio.html'],['/styles.css','styles.css'],['/app.mjs','app.mjs'],['/portfolio-store.mjs','portfolio-store.mjs'],['/portfolio-ui.mjs','portfolio-ui.mjs'],['/runtime-api.mjs','runtime-api.mjs'],['/icons.mjs','icons.mjs'],['/content.mjs','content.mjs'],['/assets/icon.svg','assets/icon.svg'],['/assets/nails.png','assets/nails.png']]);
  const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
  const sessionCookie=req=>cookies(req).beauty_session||'';
  const current=req=>store.session(digest(sessionCookie(req)));
  const auth=req=>current(req)||(()=>{throw new AppError(401,'Откройте приложение из Telegram, чтобы увидеть свои записи.');})();
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  function setSession(req,res,user) {const secret=randomBytes(32).toString('hex');store.createSession(digest(secret),user,Date.now()+86400000);res.setHeader('Set-Cookie',`beauty_session=${secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${mode==='production'?'; Secure':''}`);return user;}
  async function body(req) {let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16384) throw new AppError(413,'Слишком большой запрос.');}try{return JSON.parse(text||'{}');}catch{throw new AppError(400,'Некорректные данные запроса.');}}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    try{
      const url=new URL(req.url,'http://localhost'),p=url.pathname.replace(/^\/tg-app(?=\/|$)/,'')||'/';
      if(!p.startsWith('/api/')){
        if(!['GET','HEAD'].includes(req.method)) throw new AppError(405,'Метод недоступен.');
        const file=staticFiles.get(p);if(!file||!existsSync(join(root,file))) throw new AppError(404,'Файл не найден.');
        const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',mjs:'text/javascript; charset=utf-8',svg:'image/svg+xml',png:'image/png'};
        res.writeHead(200,{'Content-Type':types[file.split('.').at(-1)],'Cache-Control':file.endsWith('.png')?'public, max-age=3600':'no-cache'});res.end(req.method==='HEAD'?undefined:readFileSync(join(root,file)));return;
      }
      if(req.method!=='GET'){
        if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{throw new AppError(403,'Недопустимый источник запроса.');}if(origin.host!==req.headers.host) throw new AppError(403,'Недопустимый источник запроса.');}
        if(!req.headers['content-type']?.startsWith('application/json')) throw new AppError(415,'Ожидается JSON.');
      }
      if(p==='/api/bootstrap' && req.method==='POST'){
        const data=await body(req);let user=current(req);
        if(mode==='production'){
          if(data.initData){user=verifyTelegram(data.initData,token,ownerId);setSession(req,res,user);}
        }else if(!user){user=setSession(req,res,{id:`demo:${randomBytes(16).toString('hex')}`,name:'Гость студии',role:'client'});}
        json(res,200,{mode,user,studio,rules,services:services.filter(x=>x.active),works:works.filter(w=>services.some(s=>s.id===w.serviceId&&s.active)),schedule:store.schedule(),today:dateAt()});return;
      }
      if(p==='/api/health'){json(res,200,{ok:true,mode});return;}
      if(p==='/api/demo-role'&&req.method==='POST'){
        if(mode!=='demo') throw new AppError(404,'Раздел недоступен.');
        const old=auth(req),data=await body(req),user={...old,role:data.role==='owner'?'owner':'client'};
        store.deleteSession(digest(sessionCookie(req)));setSession(req,res,user);json(res,200,{user});return;
      }
      const user=auth(req), query=Object.fromEntries(url.searchParams);
      if(p==='/api/slots'&&req.method==='GET'){json(res,200,{slots:store.slots(user,query)});return;}
      if(p==='/api/month'&&req.method==='GET'){json(res,200,{days:store.month(user,query)});return;}
      if(p==='/api/bookings'){
        if(req.method==='GET') json(res,200,{bookings:store.list(user)});
        else if(req.method==='POST') json(res,201,{booking:store.create(user,await body(req))});
        else throw new AppError(405,'Метод недоступен.');return;
      }
      const booking=p.match(/^\/api\/bookings\/([\w-]+)(?:\/(reschedule|cancel))?$/);
      if(booking){if(!booking[2]&&req.method==='GET') json(res,200,{booking:store.detail(user,booking[1])});else if(booking[2]&&req.method==='POST') json(res,200,{booking:store[booking[2]](user,booking[1],await body(req))});else throw new AppError(405,'Метод недоступен.');return;}
      const operation=p.match(/^\/api\/operations\/([\w-]+)$/);
      if(operation&&req.method==='GET'){json(res,200,{booking:store.operation(user,operation[1])});return;}
      if(p==='/api/admin'&&req.method==='GET'){json(res,200,store.admin(user,query.date||dateAt()));return;}
      if(p==='/api/admin/schedule'&&req.method==='POST'){json(res,200,{schedule:store.updateSchedule(user,await body(req))});return;}
      if(p==='/api/admin/blocks'&&req.method==='POST'){json(res,201,store.block(user,await body(req)));return;}
      const block=p.match(/^\/api\/admin\/blocks\/([\w-]+)$/);
      if(block&&req.method==='DELETE'){json(res,200,store.unblock(user,block[1]));return;}
      const complete=p.match(/^\/api\/admin\/complete\/([\w-]+)$/);
      if(complete&&req.method==='POST'){json(res,200,{booking:store.complete(user,complete[1])});return;}
      throw new AppError(404,'Раздел не найден.');
    }catch(error){if(!(error instanceof AppError)) console.error('Ошибка сервера:',error.message);json(res,error.status||500,{error:error.status?error.message:'Не удалось сохранить изменения. Попробуйте ещё раз.'});}
  });
  return {server,store,mode};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createApp(),port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
  app.server.listen(port,host,()=>console.log(`Студия Ольги: http://${host}:${port} · режим ${app.mode}`));
  const stop=()=>app.server.close(()=>{app.store.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
