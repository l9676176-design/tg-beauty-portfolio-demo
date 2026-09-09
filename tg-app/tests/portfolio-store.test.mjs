import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortfolioApi} from '../portfolio-store.mjs';

function memoryStorage(){
  const data=new Map();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
}

test('автономная запись сохраняется после повторного открытия и не допускает пересечение',async()=>{
  const storage=memoryStorage();
  const now=()=>Date.parse('2026-09-10T00:00:00Z');
  let id=0;
  const randomUUID=()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`;
  const first=createPortfolioApi({storage,now,randomUUID});
  const boot=await first.request('bootstrap',{method:'POST',body:'{}'});
  assert.equal(boot.mode,'portfolio');
  assert.equal(boot.user.role,'client');

  const payload={key:'operation-key-0001',serviceId:'nude',start:Date.parse('2026-09-11T01:00:00Z'),name:'Юлия'};
  const created=await first.request('bookings',{method:'POST',body:JSON.stringify(payload)});
  assert.equal(created.booking.status,'pending');
  assert.equal(created.booking.name,'Юлия');

  const reopened=createPortfolioApi({storage,now,randomUUID});
  const list=await reopened.request('bookings');
  assert.equal(list.bookings.length,1);
  assert.equal(list.bookings[0].id,created.booking.id);

  await assert.rejects(
    reopened.request('bookings',{method:'POST',body:JSON.stringify({...payload,key:'operation-key-0002',name:'Анна'})}),
    error=>error.status===409&&/недоступно/.test(error.message),
  );
});

test('персональная ссылка подтверждает запись один раз и автоматически отправляет демо-напоминание',async()=>{
  const storage=memoryStorage();
  let clock=Date.parse('2026-09-10T00:00:00Z'),id=10;
  const api=createPortfolioApi({storage,now:()=>clock,randomUUID:()=>`10000000-0000-4000-8000-${String(++id).padStart(12,'0')}`});
  const created=(await api.request('bookings',{method:'POST',body:JSON.stringify({
    key:'confirm-key-00001',serviceId:'nude',start:Date.parse('2026-09-11T01:00:00Z'),name:'Юлия',
  })})).booking;

  await assert.rejects(api.request('confirm/wrong-token',{method:'POST',body:'{}'}),error=>error.status===404);
  const confirmed=(await api.request(`confirm/${created.confirmToken}`,{method:'POST',body:'{}'})).booking;
  assert.equal(confirmed.status,'confirmed');
  assert.deepEqual(confirmed.events.map(event=>event.kind),['created','confirmed']);
  assert.deepEqual((await api.request(`confirm/${created.confirmToken}`,{method:'POST',body:'{}'})).booking.events.map(event=>event.kind),['created','confirmed']);

  let notifications=(await api.request('notifications')).notifications;
  assert.deepEqual(notifications.map(item=>item.status).sort(),['scheduled','sent']);
  clock+=11_000;
  notifications=(await api.request('notifications')).notifications;
  assert.equal(notifications.every(item=>item.status==='sent'),true);
  const detail=(await api.request(`bookings/${created.id}`)).booking;
  assert.deepEqual(detail.events.map(event=>event.kind),['created','confirmed','reminder_sent']);
});

test('перенос, отмена и карточка клиента сохраняют полную историю',async()=>{
  const storage=memoryStorage();
  const now=()=>Date.parse('2026-09-10T00:00:00Z');
  let id=20;
  const api=createPortfolioApi({storage,now,randomUUID:()=>`20000000-0000-4000-8000-${String(++id).padStart(12,'0')}`});
  const created=(await api.request('bookings',{method:'POST',body:JSON.stringify({
    key:'lifecycle-key-001',serviceId:'nude',start:Date.parse('2026-09-11T01:00:00Z'),name:'Анна',
  })})).booking;
  await api.request(`confirm/${created.confirmToken}`,{method:'POST',body:'{}'});

  const moved=(await api.request(`bookings/${created.id}/reschedule`,{method:'POST',body:JSON.stringify({
    key:'lifecycle-key-002',start:Date.parse('2026-09-11T03:00:00Z'),
  })})).booking;
  assert.equal(moved.start,Date.parse('2026-09-11T03:00:00Z'));
  const cancelled=(await api.request(`bookings/${created.id}/cancel`,{method:'POST',body:JSON.stringify({key:'lifecycle-key-003'})})).booking;
  assert.equal(cancelled.status,'cancelled');

  const clients=(await api.request('clients')).clients;
  assert.equal(clients.length,1);
  assert.equal(clients[0].name,'Анна');
  assert.equal(clients[0].bookingsCount,1);
  const client=(await api.request(`clients/${clients[0].id}`)).client;
  assert.deepEqual(client.bookings[0].events.map(event=>event.kind),['created','confirmed','rescheduled','cancelled']);
  assert.equal((await api.request('notifications')).notifications.filter(item=>item.bookingId===created.id).length,4);
});
