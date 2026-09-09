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

  async function request(path,options={}){
    const method=options.method??'GET';
    processNotifications();
    if(path==='bootstrap'&&method==='POST')return {
      mode:'portfolio',user:state.user,studio,rules,
      services:services.filter(item=>item.active),
      works:works.filter(work=>services.some(item=>item.id===work.serviceId&&item.active)),
      schedule:state.schedule,
      today:new Intl.DateTimeFormat('en-CA',{timeZone:studio.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now()),
    };
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
      if(item.status!=='confirmed')fail(409,'Эта запись уже изменена. Обновите список.');
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
    fail(404,'Раздел не найден.');
  }

  return {request,reset(){storage.removeItem(STORAGE_KEY);state=initialState();}};
}
