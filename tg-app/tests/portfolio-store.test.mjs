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
