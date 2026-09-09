// Автономное хранилище портфолио-демо. Оно не отправляет данные во внешнюю сеть.
import {studio,rules,services,works,defaultSchedule} from './content.mjs';

const STORAGE_KEY='tg-beauty-portfolio:v1';

export class PortfolioError extends Error{
  constructor(status,message){super(message);this.status=status;}
}
const fail=(status,message)=>{throw new PortfolioError(status,message);};
const initialState=()=>({
  version:1,
  user:{id:'portfolio:visitor',name:'Гость студии',role:'client'},
  schedule:structuredClone(defaultSchedule),
  bookings:[],blocks:[],notifications:[],operations:{},
});

export function createPortfolioApi(options={}){
  const storage=options.storage??globalThis.localStorage;
  const now=options.now??Date.now;
  const randomUUID=options.randomUUID??(()=>globalThis.crypto.randomUUID());
  const load=()=>{
    try{
      const value=JSON.parse(storage.getItem(STORAGE_KEY));
      return value?.version===1&&Array.isArray(value.bookings)?value:initialState();
    }catch{return initialState();}
  };
  let state=load();
  const save=()=>storage.setItem(STORAGE_KEY,JSON.stringify(state));
  const body=options=>{try{return JSON.parse(options?.body||'{}');}catch{fail(400,'Некорректные данные запроса.');}};
  const service=id=>services.find(item=>item.id===id&&item.active)||fail(404,'Эта услуга сейчас недоступна.');
  const overlaps=(start,end,ignore='')=>state.bookings.some(item=>item.id!==ignore&&['pending','confirmed'].includes(item.status)&&start<item.occupiedEnd&&end>item.start);
  const booking=id=>state.bookings.find(item=>item.id===id)||fail(404,'Запись не найдена.');
  const addEvent=(item,kind,detail='')=>item.events.push({kind,at:now(),detail});
  const addNotification=(item,kind,status='sent',deliverAt=now())=>{
    const titles={confirmed:'Запись подтверждена',reminder:'Напоминание о визите',rescheduled:'Запись перенесена',cancelled:'Запись отменена'};
    state.notifications.push({id:randomUUID(),bookingId:item.id,clientId:item.userId,kind,title:titles[kind],status,deliverAt,sentAt:status==='sent'?now():null,bookingStart:item.start});
  };
  const processNotifications=()=>{
    let changed=false;
    for(const notification of state.notifications){
      if(notification.status==='scheduled'&&notification.deliverAt<=now()){
        notification.status='sent';notification.sentAt=now();
        const item=state.bookings.find(value=>value.id===notification.bookingId);
        if(item&&!item.events.some(event=>event.kind==='reminder_sent'))addEvent(item,'reminder_sent');
        changed=true;
      }
    }
    if(changed)save();
  };
  const requireKey=data=>{
    if(typeof data.key!=='string'||data.key.length<16)fail(400,'Не удалось определить запрос. Откройте запись заново.');
  };
  const dateAt=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:studio.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
  const addDays=(date,count)=>new Date(Date.parse(`${date}T12:00:00Z`)+count*86400000).toISOString().slice(0,10);
  const epoch=(date,time)=>Date.parse(`${date}T${time}:00${studio.offset}`);
  const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
  const timeOf=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
  const slotsFor=(selected,date,ignore='')=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))fail(400,'Некорректная дата.');
    if(date<dateAt(now())||date>addDays(dateAt(now()),rules.horizonDays))return [];
    const day=new Date(`${date}T12:00:00Z`).getUTCDay();
    if(!state.schedule.weekdays.includes(day))return [];
    const result=[];
    for(let value=minutes(state.schedule.open);value<minutes(state.schedule.close);value+=rules.stepMinutes){
      const start=epoch(date,timeOf(value)),end=start+selected.duration*60000,occupiedEnd=end+rules.bufferMinutes*60000;
      const crossesBreak=start<epoch(date,state.schedule.breakEnd)&&occupiedEnd>epoch(date,state.schedule.breakStart);
      const blocked=state.blocks.some(block=>start<block.end&&occupiedEnd>block.start);
      if(start>=now()+rules.leadMinutes*60000&&occupiedEnd<=epoch(date,state.schedule.close)&&!crossesBreak&&!blocked&&!overlaps(start,occupiedEnd,ignore))result.push({start,time:timeOf(value)});
    }
    return result;
  };

  async function request(path,options={}){
    const method=options.method??'GET';
    const url=new URL(path,'https://portfolio.invalid/');
    path=url.pathname.replace(/^\//,'');
    const query=Object.fromEntries(url.searchParams);
    processNotifications();
    if(path==='bootstrap'&&method==='POST')return {
      mode:'portfolio',user:state.user,studio,rules,
      services:services.filter(item=>item.active),
      works:works.filter(work=>services.some(item=>item.id===work.serviceId&&item.active)),
      schedule:state.schedule,
      today:dateAt(now()),
    };
    if(path==='demo-role'&&method==='POST'){
      state.user.role=body(options).role==='owner'?'owner':'client';save();return {user:structuredClone(state.user)};
    }
    if(path==='slots'&&method==='GET'){
      const existing=query.bookingId?booking(query.bookingId):null;
      return {slots:slotsFor(existing||service(query.serviceId),query.date,existing?.id)};
    }
    if(path==='month'&&method==='GET'){
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month||''))fail(400,'Некорректный месяц.');
      const existing=query.bookingId?booking(query.bookingId):null,selected=existing||service(query.serviceId),days={};
      for(let date=`${query.month}-01`;date.startsWith(query.month);date=addDays(date,1))days[date]=slotsFor(selected,date,existing?.id).length;
      return {days};
    }
    if(path==='bookings'&&method==='GET')return {bookings:state.bookings.filter(item=>item.userId===state.user.id).sort((a,b)=>a.start-b.start)};
    if(path==='bookings'&&method==='POST'){
      const data=body(options),serialized=JSON.stringify({serviceId:data.serviceId,start:data.start,name:data.name});
      requireKey(data);
      const previous=state.operations[data.key];
      if(previous){if(previous.payload!==serialized)fail(409,'Запрос уже использован. Проверьте «Мои записи».');return {booking:previous.booking};}
      const selected=service(data.serviceId),name=typeof data.name==='string'?data.name.trim():'';
      if(name.length<2||name.length>70)fail(400,'Укажите имя от 2 до 70 символов.');
      const start=Number(data.start),end=start+selected.duration*60000,occupiedEnd=end+rules.bufferMinutes*60000;
      if(!Number.isFinite(start)||start<now()+rules.leadMinutes*60000||overlaps(start,occupiedEnd))fail(409,'Это время уже недоступно. Выберите другое окно.');
      const booking={
        id:randomUUID(),userId:state.user.id,name,serviceId:selected.id,title:selected.title,price:selected.price,
        duration:selected.duration,image:selected.image,terms:selected.extras,start,end,occupiedEnd,status:'pending',
        created:now(),confirmToken:randomUUID(),events:[{kind:'created',at:now(),detail:''}],
      };
      state.user.name=name;
      state.bookings.push(booking);
      state.operations[data.key]={payload:serialized,booking};
      save();
      return {booking};
    }
    const confirmation=path.match(/^confirm\/([\w-]+)$/);
    if(confirmation&&method==='POST'){
      const item=state.bookings.find(value=>value.confirmToken===confirmation[1])||fail(404,'Ссылка подтверждения недействительна.');
      if(item.status==='pending'){
        item.status='confirmed';
        addEvent(item,'confirmed');
        addNotification(item,'confirmed');
        addNotification(item,'reminder','scheduled',now()+10_000);
        save();
      }
      return {booking:structuredClone(item)};
    }
    if(path==='notifications'&&method==='GET')return {notifications:structuredClone(state.notifications).sort((a,b)=>b.deliverAt-a.deliverAt)};
    const bookingRoute=path.match(/^bookings\/([\w-]+)(?:\/(reschedule|cancel))?$/);
    if(bookingRoute&&!bookingRoute[2]&&method==='GET')return {booking:structuredClone(booking(bookingRoute[1]))};
    if(bookingRoute&&bookingRoute[2]&&method==='POST'){
      const item=booking(bookingRoute[1]),data=body(options);requireKey(data);
      if(!['pending','confirmed'].includes(item.status))fail(409,'Эта запись уже изменена. Обновите список.');
      if(bookingRoute[2]==='reschedule'){
        const start=Number(data.start),end=start+item.duration*60000,occupiedEnd=end+rules.bufferMinutes*60000;
        if(!Number.isFinite(start)||start<now()+rules.leadMinutes*60000||overlaps(start,occupiedEnd,item.id))fail(409,'Новое время уже недоступно. Прежняя запись сохранена.');
        const from=item.start;
        Object.assign(item,{start,end,occupiedEnd});
        addEvent(item,'rescheduled',JSON.stringify({from,to:start}));
        addNotification(item,'rescheduled');
        for(const notification of state.notifications){if(notification.bookingId===item.id&&notification.kind==='reminder'&&notification.status==='scheduled')notification.bookingStart=start;}
      }else{
        item.status='cancelled';
        addEvent(item,'cancelled');
        addNotification(item,'cancelled');
        for(const notification of state.notifications){if(notification.bookingId===item.id&&notification.kind==='reminder'&&notification.status==='scheduled')notification.status='cancelled';}
      }
      save();
      return {booking:structuredClone(item)};
    }
    if(path==='clients'&&method==='GET'){
      const groups=new Map();
      for(const item of state.bookings){
        const value=groups.get(item.userId)??{id:item.userId,name:item.name,bookingsCount:0,lastVisit:null,nextVisit:null};
        value.name=item.name;value.bookingsCount++;
        if(item.end<now()&&(!value.lastVisit||item.start>value.lastVisit))value.lastVisit=item.start;
        if(['pending','confirmed'].includes(item.status)&&item.start>=now()&&(!value.nextVisit||item.start<value.nextVisit))value.nextVisit=item.start;
        groups.set(item.userId,value);
      }
      return {clients:[...groups.values()]};
    }
    const clientRoute=path.match(/^clients\/([\w:.-]+)$/);
    if(clientRoute&&method==='GET'){
      const items=state.bookings.filter(item=>item.userId===clientRoute[1]).sort((a,b)=>b.start-a.start);
      if(!items.length)fail(404,'Клиент не найден.');
      return {client:{id:clientRoute[1],name:items[0].name,bookings:structuredClone(items)}};
    }
    if(path==='admin'&&method==='GET'){
      if(state.user.role!=='owner')fail(403,'Управление доступно только мастеру.');
      const start=epoch(query.date,'00:00'),end=epoch(addDays(query.date,1),'00:00');
      return {schedule:structuredClone(state.schedule),bookings:structuredClone(state.bookings.filter(item=>item.start>=start&&item.start<end).sort((a,b)=>a.start-b.start)),blocks:structuredClone(state.blocks.filter(item=>item.start>=start&&item.start<end).sort((a,b)=>a.start-b.start))};
    }
    if(path==='admin/schedule'&&method==='POST'){
      if(state.user.role!=='owner')fail(403,'Управление доступно только мастеру.');
      const data=body(options),validTime=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
      if(!Array.isArray(data.weekdays)||!data.weekdays.length||data.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6))fail(400,'Выберите рабочие дни.');
      if(![data.open,data.close,data.breakStart,data.breakEnd].every(validTime)||!(data.open<data.close&&data.breakStart>=data.open&&data.breakEnd<=data.close&&data.breakStart<data.breakEnd))fail(400,'Проверьте рабочие часы и перерыв.');
      state.schedule={weekdays:[...new Set(data.weekdays)],open:data.open,close:data.close,breakStart:data.breakStart,breakEnd:data.breakEnd};save();return {schedule:structuredClone(state.schedule)};
    }
    if(path==='admin/blocks'&&method==='POST'){
      if(state.user.role!=='owner')fail(403,'Управление доступно только мастеру.');
      const data=body(options),start=epoch(data.date,data.from),end=epoch(data.date,data.to);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||start<now()||overlaps(start,end)||state.blocks.some(block=>start<block.end&&end>block.start))fail(409,'Интервал занят или уже прошёл. Записи не изменены.');
      const item={id:randomUUID(),start,end,label:'Занято мастером'};state.blocks.push(item);save();return {id:item.id};
    }
    const blockRoute=path.match(/^admin\/blocks\/([\w-]+)$/);
    if(blockRoute&&method==='DELETE'){
      if(state.user.role!=='owner')fail(403,'Управление доступно только мастеру.');
      state.blocks=state.blocks.filter(item=>item.id!==blockRoute[1]);save();return {ok:true};
    }
    const completeRoute=path.match(/^admin\/complete\/([\w-]+)$/);
    if(completeRoute&&method==='POST'){
      if(state.user.role!=='owner')fail(403,'Управление доступно только мастеру.');
      const item=booking(completeRoute[1]);
      if(item.status!=='confirmed'||item.end>now())fail(409,'Завершить можно только состоявшийся визит.');
      item.status='completed';addEvent(item,'completed');save();return {booking:structuredClone(item)};
    }
    fail(404,'Раздел не найден.');
  }

  return {request,reset(){storage.removeItem(STORAGE_KEY);state=initialState();}};
}
