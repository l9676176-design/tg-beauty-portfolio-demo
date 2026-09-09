// Границы сезонов проверяются по времени студии, а не часовому поясу клиента.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('Сезоны автоматически переключаются по календарю Благовещенска',()=>{
  const source=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
  const start=source.indexOf('function seasonAt(');
  assert.ok(start>=0,'Определение сезона ещё не добавлено');
  const context={Intl,Date};
  runInNewContext(source.slice(start,source.indexOf('function updateSeason(',start)),context);
  for(const [date,expected] of [['2026-02-28T14:59:00Z','winter'],['2026-02-28T15:00:00Z','spring'],['2026-05-31T15:00:00Z','summer'],['2026-08-31T15:00:00Z','autumn'],['2026-11-30T15:00:00Z','winter']])assert.equal(context.seasonAt(new Date(date)),expected);
});
