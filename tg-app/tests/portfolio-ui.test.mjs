import test from 'node:test';
import assert from 'node:assert/strict';
import {canModifyBooking,confirmationModel,journalDates,masterCalendarModel,masterSections,notificationStatusLabel} from '../portfolio-ui.mjs';

test('ожидающая запись получает персональную ссылку текущей портфолио-страницы',()=>{
  const model=confirmationModel({id:'booking-1',status:'pending',confirmToken:'token-123'},'https://example.test/portfolio.html?old=1');
  assert.equal(model.title,'Подтвердите запись');
  assert.equal(model.url,'https://example.test/portfolio.html?confirm=token-123');
  assert.match(model.note,/только в этом браузере/);
});

test('подтверждённая запись показывает завершённое подтверждение',()=>{
  const model=confirmationModel({id:'booking-1',status:'confirmed',confirmToken:'token-123'},'https://example.test/portfolio.html');
  assert.equal(model.title,'Запись подтверждена');
  assert.equal(model.url,'');
});

test('ожидающую подтверждения запись можно перенести или отменить',()=>{
  const now=Date.parse('2026-09-10T00:00:00Z');
  const booking={status:'pending',start:now+24*60*60*1000};
  assert.equal(canModifyBooking(booking,{now,changeMinutes:120}),true);
});

test('кабинет мастера использует понятные разделы и статусы уведомлений',()=>{
  assert.deepEqual(masterSections.map(item=>item.label),['Журнал','Календарь','Клиенты','Уведомления']);
  assert.equal(notificationStatusLabel('scheduled'),'Запланировано');
  assert.equal(notificationStatusLabel('sent'),'Отправлено в демо');
  assert.equal(notificationStatusLabel('cancelled'),'Отменено');
});

test('журнал мастера открывает день, неделю с понедельника и полный месяц',()=>{
  assert.deepEqual(journalDates('2026-09-09','day'),['2026-09-09']);
  assert.deepEqual(journalDates('2026-09-09','week'),[
    '2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13',
  ]);
  const month=journalDates('2026-09-09','month');
  assert.equal(month.length,30);
  assert.equal(month[0],'2026-09-01');
  assert.equal(month.at(-1),'2026-09-30');
});

test('календарь мастера отмечает выбранную дату в сетке месяца',()=>{
  const model=masterCalendarModel('2026-09-09');
  assert.equal(model.offset,1);
  assert.equal(model.days.length,30);
  assert.deepEqual(model.days.find(day=>day.selected),{date:'2026-09-09',number:9,selected:true});
});
