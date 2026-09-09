// Проверяем настоящий рендер панели для клиента и мастера без запуска браузера.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
function panel(role,route){
  const elements={};
  const context={state:{boot:{user:{role},studio:{}},route:{name:route}},tg:null,icon:()=>'',escape:String,document:{documentElement:{dataset:{theme:'light'}}},$:id=>elements[id]??=( {classList:{toggle(){}}})};
  runInNewContext(source.match(/const rootScreens=.*;/)[0]+source.match(/const titles=.*;/)[0]+source.slice(source.indexOf('function header(){'),source.indexOf('function actionBar('))+'header();',context);
  return elements['#tabs'];
}
test('Клиент не видит вкладку мастера',()=>assert.doesNotMatch(panel('client','services').innerHTML,/data-tab="admin"/));
test('Мастер видит пятую вкладку и остаётся в панели на экране расписания',()=>{
  const tabs=panel('owner','admin');
  assert.equal(tabs.hidden,false);
  assert.equal((tabs.innerHTML.match(/data-tab=/g)||[]).length,5);
  assert.match(tabs.innerHTML,/data-tab="admin" aria-current="page"/);
});
