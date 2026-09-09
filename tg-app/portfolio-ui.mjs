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
