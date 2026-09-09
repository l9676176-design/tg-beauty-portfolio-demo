// Серверная база SQLite: интервалы, права владельца записи и атомарные изменения.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { studio, rules, services, defaultSchedule } from './content.mjs';

export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new AppError(status, message); };
export const dateAt = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: studio.timezone, year:'numeric',month:'2-digit',day:'2-digit' }).format(ms);
export const addDays = (date, count) => new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0,10);
export const epoch = (date, time) => Date.parse(`${date}T${time}:00${studio.offset}`);
const minutes = t => Number(t.slice(0,2))*60 + Number(t.slice(3));
const timeOf = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const validTime = t => typeof t==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t);
const validDate = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(epoch(d,'12:00')) && dateAt(epoch(d,'12:00'))===d;

export function createStore(file) {
  mkdirSync(dirname(file), { recursive:true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT,name TEXT,role TEXT,expires INTEGER);
    CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,userId TEXT NOT NULL,name TEXT NOT NULL,serviceId TEXT NOT NULL,
      title TEXT NOT NULL,price INTEGER NOT NULL,duration INTEGER NOT NULL,image INTEGER NOT NULL,terms TEXT NOT NULL,
      start INTEGER NOT NULL,end INTEGER NOT NULL,occupiedEnd INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS bookings_interval ON bookings(status,start,occupiedEnd);
    CREATE INDEX IF NOT EXISTS bookings_owner ON bookings(userId);
    CREATE TABLE IF NOT EXISTS blocks(id TEXT PRIMARY KEY,start INTEGER NOT NULL,end INTEGER NOT NULL,label TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,bookingId TEXT NOT NULL,kind TEXT NOT NULL,at INTEGER NOT NULL,detail TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS operations(userId TEXT NOT NULL,key TEXT NOT NULL,payload TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(userId,key));`);
  db.prepare('INSERT OR IGNORE INTO settings VALUES(1,?)').run(JSON.stringify(defaultSchedule));
  const schedule = () => JSON.parse(db.prepare('SELECT value FROM settings WHERE id=1').get().value);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result=fn(); db.exec('COMMIT'); return result; }
    catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  const event = (id,kind,detail='') => db.prepare('INSERT INTO events(bookingId,kind,at,detail) VALUES(?,?,?,?)').run(id,kind,Date.now(),detail);
  const service = id => services.find(x=>x.id===id && x.active) || fail(404,'Эта услуга сейчас недоступна.');
  const get = id => db.prepare('SELECT * FROM bookings WHERE id=?').get(id) || fail(404,'Запись не найдена.');
  const mine = (user,id) => { const b=get(id); if(b.userId!==user.id && user.role!=='owner') fail(404,'Запись не найдена.'); return b; };
  const owner = user => { if(user.role!=='owner') fail(403,'Управление доступно только мастеру.'); };
  function inHours(start,occupiedEnd,s = schedule()) {
    const date=dateAt(start), day=new Date(`${date}T12:00:00Z`).getUTCDay();
    if(!s.weekdays.includes(day) || dateAt(occupiedEnd)!==date) return false;
    if(start<epoch(date,s.open) || occupiedEnd>epoch(date,s.close)) return false;
    return !(start<epoch(date,s.breakEnd) && occupiedEnd>epoch(date,s.breakStart));
  }
  function collision(start,end,ignore='') {
    return !!(db.prepare("SELECT id FROM bookings WHERE status='confirmed' AND id<>? AND start<? AND occupiedEnd>? LIMIT 1").get(ignore,end,start)
      || db.prepare('SELECT id FROM blocks WHERE start<? AND end>? LIMIT 1').get(end,start));
  }
  function available(start,duration,ignore='') {
    if(!Number.isFinite(start) || start < Date.now()+rules.leadMinutes*60000) return false;
    if(dateAt(start)>addDays(dateAt(),rules.horizonDays)) return false;
    const date=dateAt(start), diff=(start-epoch(date,'00:00'))/60000;
    if(diff%rules.stepMinutes!==0) return false;
    const end=start+(duration+rules.bufferMinutes)*60000;
    return inHours(start,end) && !collision(start,end,ignore);
  }
  function slotsFor(s,date,ignore='') {
    if(!validDate(date)) fail(400,'Некорректная дата.');
    if(date<dateAt() || date>addDays(dateAt(),rules.horizonDays)) return [];
    const out=[], hours=schedule();
    for(let n=Math.ceil(minutes(hours.open)/rules.stepMinutes)*rules.stepMinutes;n<minutes(hours.close);n+=rules.stepMinutes){
      const start=epoch(date,timeOf(n));
      if(available(start,s.duration,ignore)) out.push({ start, time:timeOf(n) });
    }
    return out;
  }
  function editAllowed(user,b) {
    if(b.status!=='confirmed') fail(409,'Эта запись уже изменена. Обновите список.');
    if(user.role!=='owner' && b.start-Date.now()<rules.changeMinutes*60000) fail(409,'До визита меньше двух часов. Свяжитесь с мастером.');
  }
  function idempotent(user,key,payload,fn) {
    if(typeof key!=='string' || !/^[\w-]{16,100}$/.test(key)) fail(400,'Не удалось определить запрос. Откройте запись заново.');
    return transaction(()=>{
      const old=db.prepare('SELECT * FROM operations WHERE userId=? AND key=?').get(user.id,key), serialized=JSON.stringify(payload);
      if(old){ if(old.payload!==serialized) fail(409,'Запрос уже использован. Проверьте «Мои записи».'); return JSON.parse(old.result); }
      const result=fn();
      db.prepare('INSERT INTO operations VALUES(?,?,?,?)').run(user.id,key,serialized,JSON.stringify(result)); return result;
    });
  }
  return {
    db, close:()=>db.close(), schedule, service,
    createSession(token,user,expires) { db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()); db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(token,user.id,user.name,user.role,expires); },
    session(token) { const s=db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(token,Date.now()); return s?{id:s.userId,name:s.name,role:s.role}:null; },
    deleteSession(token) {db.prepare('DELETE FROM sessions WHERE token=?').run(token);},
    slots(user,{serviceId,date,bookingId}) { const b=bookingId?mine(user,bookingId):null; if(b) {editAllowed(user,b);service(b.serviceId);} return slotsFor(b || service(serviceId),date,b?.id); },
    month(user,{serviceId,month,bookingId}) {
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(400,'Некорректный месяц.');
      const b=bookingId?mine(user,bookingId):null; if(b){editAllowed(user,b);service(b.serviceId);}
      const s=b || service(serviceId), days={};
      for(let d=`${month}-01`;d.startsWith(month);d=addDays(d,1)) days[d]=slotsFor(s,d,b?.id).length;
      return days;
    },
    create(user,data) {
      return idempotent(user,data.key,{action:'create',serviceId:data.serviceId,start:data.start,name:data.name},()=>{
        const s=service(data.serviceId), name=typeof data.name==='string'?data.name.trim():'';
        if(name.length<2 || name.length>70) fail(400,'Укажите имя от 2 до 70 символов.');
        if(typeof data.start!=='number' || !available(data.start,s.duration)) fail(409,'Это время уже недоступно. Выберите другое окно.');
        const id=randomUUID(), end=data.start+s.duration*60000;
        db.prepare('INSERT INTO clients VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run(user.id,name);
        db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user.id,name,s.id,s.title,s.price,s.duration,s.image,s.extras,data.start,end,end+rules.bufferMinutes*60000,'confirmed',Date.now());
        event(id,'created'); return get(id);
      });
    },
    reschedule(user,id,data) {
      return idempotent(user,data.key,{action:'reschedule',id,start:data.start},()=>{
        const b=mine(user,id); editAllowed(user,b);service(b.serviceId);
        if(typeof data.start!=='number'||!available(data.start,b.duration,id)) fail(409,'Новое время уже недоступно. Прежняя запись сохранена.');
        const end=data.start+b.duration*60000;
        db.prepare('UPDATE bookings SET start=?,end=?,occupiedEnd=? WHERE id=?').run(data.start,end,end+rules.bufferMinutes*60000,id);
        event(id,'rescheduled',JSON.stringify({from:b.start,to:data.start})); return get(id);
      });
    },
    cancel(user,id,data) {
      return idempotent(user,data.key,{action:'cancel',id},()=>{
        const b=mine(user,id);if(b.status==='cancelled') return b;editAllowed(user,b);
        db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(id);event(id,user.role==='owner'?'cancelled_owner':'cancelled');return get(id);
      });
    },
    list(user) {return db.prepare('SELECT * FROM bookings WHERE userId=? ORDER BY start ASC').all(user.id);},
    detail(user,id) {const b=mine(user,id);return {...b,events:db.prepare('SELECT kind,at,detail FROM events WHERE bookingId=? ORDER BY id').all(id)};},
    operation(user,key) {const op=db.prepare('SELECT result FROM operations WHERE userId=? AND key=?').get(user.id,key);return op?JSON.parse(op.result):null;},
    admin(user,date) {owner(user);if(!validDate(date)) fail(400,'Некорректная дата.');return {schedule:schedule(),bookings:db.prepare('SELECT * FROM bookings WHERE start>=? AND start<? ORDER BY start').all(epoch(date,'00:00'),epoch(addDays(date,1),'00:00')),blocks:db.prepare('SELECT * FROM blocks WHERE start>=? AND start<? ORDER BY start').all(epoch(date,'00:00'),epoch(addDays(date,1),'00:00'))};},
    updateSchedule(user,s) {
      owner(user);
      if(!s || !Array.isArray(s.weekdays)||s.weekdays.length<1||s.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(s.weekdays).size!==s.weekdays.length) fail(400,'Выберите рабочие дни.');
      if(![s.open,s.close,s.breakStart,s.breakEnd].every(validTime)||!(s.open<s.close&&s.breakStart>=s.open&&s.breakEnd<=s.close&&s.breakStart<s.breakEnd)) fail(400,'Проверьте рабочие часы и перерыв.');
      const clean={weekdays:s.weekdays,open:s.open,close:s.close,breakStart:s.breakStart,breakEnd:s.breakEnd};
      return transaction(()=>{const conflicts=db.prepare("SELECT * FROM bookings WHERE status='confirmed' AND occupiedEnd>?").all(Date.now()).filter(b=>!inHours(b.start,b.occupiedEnd,clean));if(conflicts.length) fail(409,`Новый график пересекается с записями: ${conflicts.length}. Сначала согласуйте их перенос.`);db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(clean));return clean;});
    },
    block(user,data) {owner(user); if(!validDate(data.date)||!validTime(data.from)||!validTime(data.to)||data.from>=data.to) fail(400,'Проверьте дату и время блокировки.');return transaction(()=>{const start=epoch(data.date,data.from),end=epoch(data.date,data.to);if(start<Date.now()||collision(start,end)) fail(409,'Интервал занят или уже прошёл. Записи не изменены.');const id=randomUUID();db.prepare('INSERT INTO blocks VALUES(?,?,?,?)').run(id,start,end,'Занято мастером');return {id};});},
    unblock(user,id) {owner(user);db.prepare('DELETE FROM blocks WHERE id=?').run(id);return {ok:true};},
    complete(user,id) {owner(user);return transaction(()=>{const b=get(id);if(b.status!=='confirmed'||b.end>Date.now()) fail(409,'Завершить можно только состоявшийся визит.');db.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(id);event(id,'completed');return get(id);});},
  };
}
