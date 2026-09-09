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

  async function request(path,options={}){
    const method=options.method??'GET';
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
      if(typeof data.key!=='string'||data.key.length<16)fail(400,'Не удалось определить запрос. Откройте запись заново.');
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
    fail(404,'Раздел не найден.');
  }

  return {request,reset(){storage.removeItem(STORAGE_KEY);state=initialState();}};
}
