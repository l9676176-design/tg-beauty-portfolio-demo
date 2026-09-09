import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeApi} from '../runtime-api.mjs';

test('портфолио-режим выполняет запрос через локальный адаптер без fetch',async()=>{
  const calls=[];
  const api=createRuntimeApi({
    mode:'portfolio',
    localApi:{request:async(path,options)=>{calls.push([path,options]);return {mode:'portfolio'};}},
    fetchImpl:async()=>{throw new Error('Сетевой запрос не должен выполняться');},
  });
  assert.deepEqual(await api('bootstrap',{method:'POST',body:'{}'}),{mode:'portfolio'});
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'bootstrap');
});

test('серверный режим сохраняет обработку HTTP-ошибки',async()=>{
  const api=createRuntimeApi({
    mode:'server',
    fetchImpl:async()=>({ok:false,status:409,json:async()=>({error:'Время занято'})}),
  });
  await assert.rejects(api('bookings'),error=>error.status===409&&error.message==='Время занято');
});
