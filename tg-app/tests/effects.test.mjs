// Проверяем запуск фейерверка только для успешной записи и очистку декора.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('Искры даты и времени длятся 1200 мс, остальные — 600 мс',()=>{
  const source=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function sparkle(event){'),source.indexOf('function celebrateBooking(){'));
  for(const calendarControl of [true,false]){
    const particles=[],delays=[];
    const control={disabled:false,getAttribute:()=>null,matches:()=>calendarControl,getBoundingClientRect:()=>({left:0,top:0,width:44,height:44})};
    const context={matchMedia:()=>({matches:false}),effectsLayer:()=>({children:particles,append:p=>particles.push(p)}),document:{createElement:()=>({style:{setProperty(){}},remove(){}})},setTimeout:(_fn,ms)=>delays.push(ms)};
    runInNewContext(code,context);context.sparkle({target:{closest:()=>control},detail:0});
    assert.equal(particles.length,6);
    assert.ok(particles.every(p=>p.style.animationDuration===(calendarControl?'1200ms':'600ms')));
    assert.ok(delays.every(ms=>ms===(calendarControl?1250:650)));
  }
});
test('Фейерверк: успех один раз, без движения при reduced-motion, удаление частиц',()=>{
  const source=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function celebrateBooking(){'),source.indexOf("document.addEventListener('click',sparkle"));
  for(const reduced of [false,true]){
    const particles=[],timers=[];
    const context={state:{route:{name:'calendar',id:'test'}},celebratedBookings:new Set(),matchMedia:()=>({matches:reduced}),effectsLayer:()=>({append:p=>particles.push(p)}),document:{querySelector:()=>({getBoundingClientRect:()=>({left:0,width:320})}),createElement:()=>({style:{setProperty(){}},remove(){this.removed=true;}})},setTimeout:fn=>timers.push(fn)};
    runInNewContext(code,context);
    context.celebrateBooking();assert.equal(particles.length,0);
    context.state.route.name='success';context.celebrateBooking();context.celebrateBooking();
    assert.equal(particles.length,reduced?0:24);
    assert.ok(particles.every(p=>p.className==='celebration-spark'));
    timers.forEach(fn=>fn());assert.ok(particles.every(p=>p.removed));
  }
});
