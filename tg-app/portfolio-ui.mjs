// Чистые модели интерфейса автономной демонстрации.
export const masterSections=[
  {id:'journal',label:'Журнал'},
  {id:'calendar',label:'Календарь'},
  {id:'clients',label:'Клиенты'},
  {id:'notifications',label:'Уведомления'},
];

export function confirmationModel(booking,currentUrl){
  if(booking.status!=='pending')return {title:'Запись подтверждена',url:'',note:'Демонстрационное подтверждение сохранено.'};
  const url=new URL(currentUrl);
  url.search='';url.hash='';url.searchParams.set('confirm',booking.confirmToken);
  return {
    title:'Подтвердите запись',
    url:url.toString(),
    note:'Персональная демонстрационная ссылка работает только в этом браузере. Реальное сообщение никому не отправляется.',
  };
}

export function notificationStatusLabel(status){
  return status==='scheduled'?'Запланировано':status==='sent'?'Отправлено в демо':status==='cancelled'?'Отменено':'Обновлено';
}

export function canModifyBooking(booking,{now=Date.now(),changeMinutes=0,admin=false}={}){
  return ['pending','confirmed'].includes(booking.status)&&(admin||booking.start-now>=changeMinutes*60000);
}

const isoDay=date=>date.toISOString().slice(0,10);
const addDays=(date,count)=>new Date(date.getTime()+count*86400000);

export function journalDates(anchor,range='day'){
  const selected=new Date(`${anchor}T12:00:00Z`);
  if(range==='week'){
    const monday=addDays(selected,-((selected.getUTCDay()+6)%7));
    return Array.from({length:7},(_,index)=>isoDay(addDays(monday,index)));
  }
  if(range==='month'){
    const first=new Date(Date.UTC(selected.getUTCFullYear(),selected.getUTCMonth(),1,12));
    const last=new Date(Date.UTC(selected.getUTCFullYear(),selected.getUTCMonth()+1,0,12));
    return Array.from({length:last.getUTCDate()},(_,index)=>isoDay(addDays(first,index)));
  }
  return [isoDay(selected)];
}

export function masterCalendarModel(selectedDate){
  const days=journalDates(selectedDate,'month');
  const first=new Date(`${days[0]}T12:00:00Z`);
  return {
    offset:(first.getUTCDay()+6)%7,
    days:days.map((date,index)=>({date,number:index+1,selected:date===selectedDate})),
  };
}
