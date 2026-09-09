// Проверяем длительность прокрутки и уважение настройки уменьшения движения.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
test('Прокрутка длится 450 мс и завершается точно в цели',()=>{
  const start=source.indexOf('function scrollToCenter(');
  assert.ok(start>=0,'Нужна прокрутка с управляемой длительностью');
  for(const reduced of [false,true]){
    let callback,position=0;
    const context={state:{version:1},innerHeight:600,scrollY:0,document:{documentElement:{scrollHeight:1800}},performance:{now:()=>0},matchMedia:()=>({matches:reduced}),requestAnimationFrame:fn=>{callback=fn;},window:{scrollTo:({top})=>{position=top;}}};
    runInNewContext(source.slice(start,source.indexOf('async function render(',start)),context);
    context.scrollToCenter({getBoundingClientRect:()=>({top:800,height:100})});
    if(!reduced){callback(225);assert.ok(position>0&&position<550);callback(450);}
    assert.equal(position,550);
  }
});
