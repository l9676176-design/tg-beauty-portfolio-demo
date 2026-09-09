// Проверка реального HTTP API и SQLite на изолированной тестовой базе, без внешних записей.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID,createHmac } from 'node:crypto';
import { createApp,verifyTelegram } from '../server.mjs';
import { dateAt,addDays } from '../database.mjs';

test('Полный цикл записи через HTTP, конкурентные запросы и сохранение базы',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'beauty-api-test-'));
  let app=createApp({mode:'demo',dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  let base=`http://127.0.0.1:${app.server.address().port}`;
  t.after(()=>{app.server.close();app.store.close();});
  function client(){let cookie='';return async(path,data,method)=>{const r=await fetch(`${base}/api/${path}`,{method:method||(data?'POST':'GET'),headers:{'Content-Type':'application/json',Cookie:cookie},...(data?{body:JSON.stringify(data)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:await r.json()};};}
  const a=client(),b=client();assert.equal((await a('bootstrap',{})).body.mode,'demo');await b('bootstrap',{});
  let date=addDays(dateAt(),1),slots=[];
  for(let i=0;i<7;i++,date=addDays(date,1)){slots=(await a(`slots?serviceId=nude&date=${date}`)).body.slots;if(slots.length>=3)break;}
  assert.ok(slots.length>=3,'Есть свободные окна');
  const payload={key:randomUUID(),serviceId:'nude',start:slots[0].start,name:'Тестовая клиентка'};
  const [one,two]=await Promise.all([a('bookings',payload),b('bookings',{...payload,key:randomUUID()})]);
  assert.deepEqual([one.status,two.status].sort(),[201,409],'Одна бронь на один интервал');
  const winner=one.status===201?a:b,other=one.status===201?b:a,booking=(one.status===201?one:two).body.booking;
  const winningPayload=one.status===201?payload:null;
  if(winningPayload){const repeat=await winner('bookings',winningPayload);assert.equal(repeat.body.booking.id,booking.id,'Идемпотентность');}
  assert.equal((await other(`bookings/${booking.id}`)).status,404,'Чужая запись скрыта');
  assert.equal((await other(`bookings/${booking.id}/cancel`,{key:randomUUID()})).status,404,'Чужую запись нельзя отменить');
  assert.equal((await other(`bookings/${booking.id}/reschedule`,{key:randomUUID(),start:slots[1].start})).status,404);
  assert.equal((await other('admin')).status,403,'Клиент не управляет графиком');
  const taken=(await winner(`slots?serviceId=nude&date=${date}`)).body.slots;
  assert.ok(!taken.some(s=>s.start===slots[0].start));
  const overlap=await other('bookings',{key:randomUUID(),serviceId:'natural',start:slots[0].start+30*60000,name:'Тест'});
  assert.equal(overlap.status,409,'Защита от пересечения, а не только одинакового начала');
  let otherDate=addDays(date,1),otherSlots=[];
  for(let i=0;i<7;i++,otherDate=addDays(otherDate,1)){otherSlots=(await winner(`slots?serviceId=nude&date=${otherDate}`)).body.slots;if(otherSlots.length)break;}
  const occupied=await other('bookings',{key:randomUUID(),serviceId:'nude',start:otherSlots[0].start,name:'Другая клиентка'});assert.equal(occupied.status,201);
  const failed=await winner(`bookings/${booking.id}/reschedule`,{key:randomUUID(),start:otherSlots[0].start});assert.equal(failed.status,409);
  assert.equal((await winner(`bookings/${booking.id}`)).body.booking.start,booking.start,'Прежняя запись сохранена после конфликта');
  const free=(await winner(`slots?serviceId=nude&date=${otherDate}`)).body.slots[0];assert.ok(free);
  const moved=await winner(`bookings/${booking.id}/reschedule`,{key:randomUUID(),start:free.start});assert.equal(moved.status,200);assert.equal(moved.body.booking.start,free.start);
  assert.ok((await winner(`slots?serviceId=nude&date=${date}`)).body.slots.some(s=>s.start===booking.start),'Старое время освобождено');
  const cancelled=await winner(`bookings/${booking.id}/cancel`,{key:randomUUID()});assert.equal(cancelled.body.booking.status,'cancelled');
  assert.ok((await winner(`slots?serviceId=nude&date=${otherDate}`)).body.slots.some(s=>s.start===free.start),'Отмена освобождает время');
  assert.deepEqual((await winner(`bookings/${booking.id}`)).body.booking.events.map(x=>x.kind),['created','rescheduled','cancelled']);
  await winner('demo-role',{role:'owner'});
  const admin=await winner(`admin?date=${otherDate}`);assert.equal(admin.status,200);
  const saved=await winner('admin/schedule',{...admin.body.schedule,open:'12:00'});assert.equal(saved.status,409,'Нельзя молча вытеснить существующие записи');
  const blocked=await winner('admin/blocks',{date:otherDate,from:'10:00',to:'19:00'});assert.equal(blocked.status,409,'Блокировка не стирает бронь');
  assert.equal((await winner(`admin/complete/${occupied.body.booking.id}`,{})).status,409,'Будущий визит нельзя назвать состоявшимся');
  for(const path of ['/portfolio.html','/portfolio-store.mjs','/portfolio-ui.mjs','/runtime-api.mjs'])assert.equal((await fetch(`${base}${path}`)).status,200,'Публичные файлы автономного демо доступны');
  for(const path of ['/.data/demo.sqlite','/server.mjs','/database.mjs','/tests/booking.test.mjs'])assert.equal((await fetch(`${base}${path}`)).status,404,'Приватные файлы не раздаются');
  const csrf=await fetch(`${base}/api/bootstrap`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://another.example'},body:'{}'});assert.equal(csrf.status,403);
  await new Promise(r=>app.server.close(r));app.store.close();
  app=createApp({mode:'demo',dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await winner(`bookings/${booking.id}`)).body.booking.status,'cancelled','История и сессия переживают перезапуск сервера');
  assert.equal((await winner('bookings')).body.bookings.length,1,'В истории нет дубликатов');
});

test('Проверка подписанных данных Telegram: подпись, срок и роль',()=>{
  const token='test-token-only',id=12345;
  function signed(authDate,user={id,first_name:'Ольга'}){const p=new URLSearchParams({auth_date:String(authDate),query_id:'example',user:JSON.stringify(user)});const sorted=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update(sorted).digest('hex'));return p.toString();}
  const now=Math.floor(Date.now()/1000),raw=signed(now);
  assert.equal(verifyTelegram(raw,token,id).role,'owner');
  assert.equal(verifyTelegram(raw,token,99).role,'client');
  assert.throws(()=>verifyTelegram(raw.replace('example','modified'),token,id));
  assert.throws(()=>verifyTelegram(signed(now-7200),token,id));
  assert.throws(()=>verifyTelegram(signed(now+600),token,id));
  assert.throws(()=>verifyTelegram(raw+'&user=bad',token,id));
  assert.throws(()=>createApp({mode:'production',token:'x',ownerId:'1'}),/реальный контакт/,'С демо-контентом рабочий режим не запускается');
});
