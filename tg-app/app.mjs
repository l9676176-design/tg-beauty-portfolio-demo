// Интерфейс без фреймворков: маршруты, тема Telegram и полный цикл записи.
import { icon } from './icons.mjs';
import { createPortfolioApi } from './portfolio-store.mjs';
import { createRuntimeApi } from './runtime-api.mjs';
import { canModifyBooking,confirmationModel,masterSections,notificationStatusLabel } from './portfolio-ui.mjs';
const tg=window.Telegram?.WebApp;
const $=s=>document.querySelector(s);
const dataMode=$('meta[name="app-data-mode"]')?.content==='portfolio'?'portfolio':'server';
const portfolioApi=dataMode==='portfolio'?createPortfolioApi():null;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const state={boot:null,route:{name:'services'},trail:[],category:'all',workCategory:'all',bookingTab:'future',adminView:'journal',positions:{},pending:null,calendar:null,version:0,theme:null};
const rootScreens=['services','works','bookings','about','admin'];
const titles={services:'',works:'',about:'',bookings:'',service:'Услуга',photo:'Работа',calendar:'Выбор времени',checkout:'Проверьте запись',success:'Готово',booking:'Ваша запись',admin:'Кабинет мастера',client:'История клиента',notifications:'Уведомления'};
let toastTimer;
// Сезон задаётся календарём студии: март–май, июнь–август, сентябрь–ноябрь, зима.
function seasonAt(date=new Date()){
  const month=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Yakutsk',month:'numeric'}).format(date));
  return month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';
}
function updateSeason(){document.documentElement.dataset.season=seasonAt();}
const celebratedBookings=new Set();
function effectsLayer(){
  const host=document.querySelector('dialog[open]')||document.body;
  let layer=host.querySelector(':scope > .beauty-effects');
  if(!layer){layer=document.createElement('div');layer.className='beauty-effects';layer.setAttribute('aria-hidden','true');host.append(layer);}
  return layer;
}
function sparkle(event){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const control=event.target.closest('button,a,input,select');
  if(!control||control.disabled||control.getAttribute('aria-disabled')==='true')return;
  const rect=control.getBoundingClientRect(),layer=effectsLayer();
  // На датах и времени искры живут вдвое дольше, чем на остальных элементах.
  const sparkDuration=control.matches('.day,.slot')?1200:600;
  const x=event.detail?event.clientX:rect.left+rect.width/2,y=event.detail?event.clientY:rect.top+rect.height/2;
  // Ограничиваем количество частиц при частых касаниях, не блокируя само действие.
  while(layer.children.length>35)layer.firstElementChild.remove();
  for(let i=0;i<6;i++){
    const star=document.createElement('i'),angle=i*Math.PI/3;
    star.className='tap-spark';star.style.left=`${x}px`;star.style.top=`${y}px`;
    star.style.animationDuration=`${sparkDuration}ms`;
    star.style.setProperty('--dx',`${Math.cos(angle)*25}px`);star.style.setProperty('--dy',`${Math.sin(angle)*25}px`);
    layer.append(star);setTimeout(()=>star.remove(),sparkDuration+50);
  }
}
function celebrateBooking(){
  if(state.route.name!=='success'||state.route.booking?.status==='pending'||!document.querySelector('.success-mark')||celebratedBookings.has(state.route.id))return;
  celebratedBookings.add(state.route.id);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const layer=effectsLayer(),rect=document.querySelector('#app').getBoundingClientRect();
  // Два небольших воздушных залпа: тонкие светящиеся искры вместо лепестков.
  for(let i=0;i<24;i++){
    const star=document.createElement('i'),group=Math.floor(i/12),angle=(i%12)*Math.PI/6;
    star.className='celebration-spark';
    star.style.left=`${rect.left+rect.width*(group?.72:.28)}px`;star.style.top=group?'35vh':'25vh';
    star.style.setProperty('--dx',`${Math.cos(angle)*(65+i%3*10)}px`);
    star.style.setProperty('--dy',`${Math.sin(angle)*(65+i%3*10)}px`);
    star.style.animationDelay=`${group*280}ms`;
    layer.append(star);setTimeout(()=>star.remove(),1800);
  }
}
document.addEventListener('click',sparkle,true);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)theme();});
setInterval(()=>{if(!document.hidden&&document.documentElement.dataset.season!==seasonAt())theme();},60000);
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4400);}
function theme(){
  updateSeason();
  let saved;try{saved=localStorage.getItem('beauty-theme');}catch{}
  const dark=tg?.initData ? tg.colorScheme==='dark' : (state.theme||saved|| (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))==='dark';
  document.documentElement.dataset.theme=dark?'dark':'light';
  const p=tg?.initData?tg.themeParams:{};
  const mappings={accent:'button_color','accent-text':'button_text_color'};
  for(const [key,value] of Object.entries(mappings)){if(/^#[0-9a-f]{6}$/i.test(p?.[value]||''))document.documentElement.style.setProperty(`--${key}`,p[value]);}
  const bottom=Math.max(tg?.safeAreaInset?.bottom||0,tg?.contentSafeAreaInset?.bottom||0);
  const top=tg?.isFullscreen?Math.max(tg?.safeAreaInset?.top||0,tg?.contentSafeAreaInset?.top||0):0;
  document.documentElement.style.setProperty('--safe-bottom',`max(env(safe-area-inset-bottom, 0px), ${bottom}px)`);
  document.documentElement.style.setProperty('--safe-top',`${top}px`);
  try{tg?.setHeaderColor(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());tg?.setBackgroundColor(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());}catch{}
  $('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
}
theme();tg?.ready();tg?.expand();tg?.MainButton?.hide();tg?.onEvent('themeChanged',()=>{theme();header();});tg?.onEvent('safeAreaChanged',theme);tg?.onEvent('contentSafeAreaChanged',theme);tg?.onEvent('backButtonClicked',back);
const api=createRuntimeApi({mode:dataMode,localApi:portfolioApi});
const post=(path,data)=>api(path,{method:'POST',body:JSON.stringify(data)});
const service=id=>state.boot?.services.find(s=>s.id===id);
const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(n);
const duration=n=>n>=60?`${Math.floor(n/60)} ч${n%60?` ${n%60} мин`:''}`:`${n} мин`;
const dateLabel=(ms,opts={day:'numeric',month:'long'})=>new Intl.DateTimeFormat('ru-RU',{...opts,timeZone:state.boot?.studio.timezone||'Asia/Yakutsk'}).format(ms);
const hour=ms=>dateLabel(ms,{hour:'2-digit',minute:'2-digit'});
const localDay=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:state.boot?.studio.timezone||'Asia/Yakutsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
const dateEpoch=d=>Date.parse(`${d}T12:00:00${state.boot?.studio.offset||'+09:00'}`);
const today=()=>localDay(Date.now());
const photo=(n,cls,alt)=>`<div class="photo ${cls}" data-photo="${Number(n)||0}" role="img" aria-label="${escape(alt)}"></div>`;
const btn=(text,action,extra='',type='primary')=>`<button class="${type}" data-action="${action}" ${extra}>${text}</button>`;
const disclaimer=()=>state.boot?.studio.demoContent?'<p class="disclaimer">Изображения и услуги — демонстрационные примеры.</p>':'';
const summary=s=>`<div class="service-summary">${photo(s.image,'summary-photo',s.title)}<div><h3>${escape(s.title)}</h3><p>${money(s.price)} · ${duration(s.duration)}</p></div></div>`;
function empty(title,text,action='services',label='Выбрать услугу',symbol='calendar'){return `<div class="empty"><div class="empty-icon">${icon(symbol,32)}</div><h2>${escape(title)}</h2><p>${escape(text)}</p>${btn(label,action)}</div>`;}
function header(){
  const r=state.route,main=rootScreens.includes(r.name),title=titles[r.name]||'';
  $('#header').innerHTML=`${main?`<div class="brand-mark">${icon('leaf',28)}</div>`:(!tg?.initData?`<button class="icon-button" data-action="back" aria-label="Назад">${icon('back')}</button>`:'')}<div class="header-title"><div class="brand-title">${escape(main?`${state.boot?.studio.name||'Ольга'} · студия маникюра`:title)}</div>${main?`<div class="brand-subtitle">${escape(state.boot?.studio.city||'Благовещенск')}</div>`:''}</div>${!tg?.initData?`<button class="icon-button" data-action="theme" aria-label="Переключить тему">${icon(document.documentElement.dataset.theme==='dark'?'sun':'moon')}</button>`:''}`;
  try{main?tg?.BackButton.hide():tg?.BackButton.show();}catch{}
  $('#tabs').hidden=!main;
  // Пятая вкладка доступна только роли, полученной от сервера.
  const tabs=[['services','grid','Услуги'],['works','image','Работы'],['bookings','calendar','Мои записи'],['about','user','О мастере']];
  if(state.boot?.user?.role==='owner')tabs.push(['admin','settings','Кабинет']);
  $('#tabs').classList.toggle('owner-tabs',tabs.length===5);
  $('#tabs').innerHTML=tabs.map(([name,symbol,label])=>`<button class="tab ${r.name===name?'active':''}" data-action="tab" data-tab="${name}" ${r.name===name?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span></button>`).join('');
  $('#app').classList.toggle('nested',!main);
}
function actionBar(html='',summaryText=''){$('#action-bar').hidden=!html;$('#action-bar').innerHTML=(summaryText?`<div class="summary">${summaryText}</div>`:'')+html;$('#app').classList.toggle('no-action',!html);}
function go(route,{replace=false,scroll=0}={}){
  if(['admin','client'].includes(route.name)&&state.boot?.user?.role!=='owner'){toast('Кабинет доступен только мастеру.');return;}
  if(rootScreens.includes(route.name)){if(rootScreens.includes(state.route.name))state.positions[state.route.name]=scrollY;state.trail=[];scroll=state.positions[route.name]||0;}
  else if(!replace)state.trail.push({route:{...state.route},scroll:scrollY});
  state.route=route;render(scroll);
}
function back(){
  if($('#dialog').open){$('#dialog').close();return;}
  if(state.route.name==='success'){go({name:'bookings'});return;}
  const prev=state.trail.pop();if(prev){state.route=prev.route;render(prev.scroll);}else go({name:'services'});
}
function chips(category,action){return `<div class="chips" aria-label="Категории">${[['all','Все'],['manicure','Маникюр'],['pedicure','Педикюр']].map(([id,title])=>`<button class="chip ${category===id?'active':''}" data-action="${action}" data-category="${id}" aria-pressed="${category===id}">${title}</button>`).join('')}</div>`;}
function catalog(){
  const filtered=state.boot.services.filter(s=>state.category==='all'||s.category===state.category);
  return `<div class="intro"><div><h1>Красота в деталях</h1><p>Выберите время для себя</p></div><div class="intro-symbol">${icon('leaf',27)}</div></div>${chips(state.category,'category')}<div class="service-list">${filtered.map(s=>`<button class="service-card" data-action="service" data-id="${s.id}"><div class="card-photo photo" data-photo="${s.image}" role="img" aria-label="${escape(s.title)}">${s.tag?`<span class="photo-badge">${escape(s.tag)}</span>`:''}</div><div class="card-body"><h3>${escape(s.title)}</h3><div class="card-subtitle">${escape(s.subtitle)}</div><div class="price-line"><div class="card-meta"><span class="price">${money(s.price)}</span><span class="duration">${icon('clock',16)}${duration(s.duration)}</span></div><span class="arrow-circle">${icon('arrow',18)}</span></div></div></button>`).join('')}</div>${filtered.length?'':empty('Пока нет услуг','Попробуйте выбрать другую категорию.','all-services','Все услуги')}${disclaimer()}`;
}
function detail(){
  const s=service(state.route.id);if(!s)return empty('Услуга недоступна','Выберите другую услугу или напишите мастеру.');
  actionBar(btn(`Выбрать время ${icon('arrow',19)}`,'book',`data-id="${s.id}"`),`<span>${duration(s.duration)}</span><strong>${money(s.price)}</strong>`);
  return `<button class="detail-photo photo" data-photo="${s.image}" data-action="photo" data-service="${s.id}" data-image="${s.image}" aria-label="Посмотреть фото ${escape(s.title)}"></button><h1 class="detail-heading">${escape(s.title)}</h1><div class="detail-price"><strong class="price">${money(s.price)}</strong><span class="duration">${icon('clock',18)}${duration(s.duration)}</span></div><p class="muted">${escape(s.subtitle)}</p><h2 class="section-title">Что входит</h2><div class="panel">${s.includes.map(t=>`<div class="list-row">${icon('check',18)}<span>${escape(t)}</span></div>`).join('')}</div><h2 class="section-title">Перед записью</h2><p class="muted small">${escape(s.extras)}</p>${btn(`${icon('message',19)} Задать вопрос`,'contact',`data-service="${s.id}"`,'text-button')}${disclaimer()}`;
}
function gallery(){return `<div class="intro"><div><h1>Работы</h1><p>Найдите свой оттенок</p></div></div>${chips(state.workCategory,'work-category')}<div class="gallery">${state.boot.works.filter(w=>state.workCategory==='all'||service(w.serviceId)?.category===state.workCategory).map(w=>`<button class="work-card" data-action="photo" data-service="${w.serviceId}" data-image="${w.image}" data-title="${escape(w.title)}">${photo(w.image,'',w.title)}<div class="work-label">${escape(w.title)}<div class="work-subtitle">${escape(service(w.serviceId)?.title)}</div></div></button>`).join('')}</div>${disclaimer()}`;}
function fullPhoto(){const s=service(state.route.id);actionBar(btn('Посмотреть услугу','photo-service',`data-id="${escape(s?.id)}"`));return `${photo(state.route.image,'full-photo',state.route.title||s?.title)}<h1>${escape(state.route.title||s?.title)}</h1><p class="muted small" style="margin-top:10px">${escape(s?.subtitle)}</p>${disclaimer()}`;}
function about(){const b=state.boot,st=b.studio;return `<section class="profile"><div class="portrait" aria-label="Демонстрационный аватар мастера">О</div><h1>${escape(st.name)}</h1><p class="muted">${escape(st.title)} · ${escape(st.city)}</p><p style="margin-top:16px">${escape(st.about)}</p>${st.demoContent?'<p class="profile-note">Демонстрационный профиль</p>':''}</section><div class="panel"><div class="contact-row">${icon('pin')}<div>${escape(st.city)}<p class="small muted">${escape(st.address)}</p></div></div><div class="contact-row">${icon('clock')}<div>По предварительной записи<p class="small muted">Доступное время — в календаре услуги</p></div></div></div>${btn(`${icon('message',20)} Написать мастеру`,'contact')}${st.mapUrl?btn(`${icon('pin',20)} Открыть карту`,'map','','text-button'):''}<div class="notice">Перенести или отменить запись можно в приложении не позднее чем за ${state.boot.rules.changeMinutes/60} ч до визита.</div>${b.mode==='portfolio'?btn('Посмотреть уведомления','notifications','','secondary'):''}${btn('Как используются данные','privacy','','text-button')}${b.user?.role==='owner'?btn(`${icon('settings',20)} Кабинет мастера`,'admin','','secondary'):''}${['demo','portfolio'].includes(b.mode)?`<div class="demo-tools"><p class="small muted">Для знакомства с приложением</p>${btn(b.user?.role==='owner'?'Вернуться в режим клиента':'Посмотреть режим мастера','demo-role','','text-button')}${b.mode==='portfolio'?btn('Сбросить демонстрацию','reset-demo','','text-button'):''}<p class="small muted">${b.mode==='portfolio'?'Данные хранятся только в этом браузере.':'Действия сохраняются только в тестовой базе.'}</p></div>`:''}${disclaimer()}`;}
function newBooking(id,booking=null){
  if(!state.boot.user){toast('Для записи откройте приложение из Telegram.');return;}
  state.pending={serviceId:id,booking,key:uid(),start:null,name:state.boot.user.name,consent:false};state.calendar={month:today().slice(0,7),date:today()};go({name:'calendar'});
}
async function calendar(){
  const p=state.pending;if(!p){go({name:'services'});return '';}
  const s=p.booking||service(p.serviceId),c=state.calendar;
  const q=new URLSearchParams({serviceId:p.serviceId,month:c.month,date:c.date,...(p.booking?{bookingId:p.booking.id}:{})});
  const [month,day]=await Promise.all([api(`month?${q}`),api(`slots?${q}`)]);
  const first=new Date(`${c.month}-01T12:00:00Z`),offset=(first.getUTCDay()+6)%7;
  const cells=Array.from({length:offset},()=>'<span></span>').concat(Object.entries(month.days).map(([d,count])=>`<button class="day ${d===c.date?'selected':''} ${d===today()?'today':''} ${count?'has-slots':''}" data-action="date" data-date="${d}" ${!count?'disabled':''} aria-label="${escape(dateLabel(dateEpoch(d)))}${count?', есть свободное время':''}" aria-pressed="${d===c.date}">${Number(d.slice(-2))}</button>`)).join('');
  actionBar(btn(p.booking?'Продолжить перенос':'Продолжить','checkout',p.start?'':'disabled'));
  return `${summary(s)}${p.booking?`<div class="notice">Перенос с ${dateLabel(p.booking.start)}, ${hour(p.booking.start)}. Прежнее время сохранится до подтверждения.</div>`:''}<div class="calendar-panel"><div class="calendar-head"><button class="icon-button" data-action="month" data-delta="-1" aria-label="Предыдущий месяц" ${c.month<=today().slice(0,7)?'disabled':''}>${icon('back')}</button><h2>${escape(dateLabel(dateEpoch(`${c.month}-15`),{month:'long',year:'numeric'}))}</h2><button class="icon-button" data-action="month" data-delta="1" aria-label="Следующий месяц" ${c.month>=localDay(Date.now()+state.boot.rules.horizonDays*86400000).slice(0,7)?'disabled':''}>${icon('chevron')}</button></div><div class="weekdays">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></div><p class="small muted">${icon('pin',15)} ${escape(state.boot.studio.timezoneLabel)}</p><div class="slot-label">${escape(dateLabel(dateEpoch(c.date)))} · свободное время</div><div class="slots">${day.slots.map(slot=>`<button class="slot ${p.start===slot.start?'selected':''}" data-action="slot" data-start="${slot.start}" aria-pressed="${p.start===slot.start}">${slot.time}</button>`).join('')}</div>${day.slots.length?'':`<div class="panel"><h3>На этот день окон нет</h3><p class="muted small">Выберите другую дату в календаре.</p>${btn('Задать вопрос мастеру','contact','','text-button')}</div>`}`;
}
function checkout(){const p=state.pending;if(!p?.start)return empty('Выберите время','Чтобы записаться, начните с услуги.');const s=p.booking||service(p.serviceId);actionBar(btn(p.booking?'Подтвердить перенос':'Подтвердить запись','confirm',!p.consent?'disabled':''));return `${summary(s)}<div class="panel"><div class="checkout-row"><span>Дата</span><strong>${dateLabel(p.start)}</strong></div><div class="checkout-row"><span>Время</span><strong>${hour(p.start)}–${hour(p.start+s.duration*60000)}</strong></div><div class="checkout-row"><span>Стоимость</span><strong>${money(s.price)}</strong></div><div class="checkout-row"><span>Место</span><strong>${escape(state.boot.studio.city)}</strong></div>${btn('Изменить время','edit-time','','text-button')}</div><p class="small muted">${escape(state.boot.studio.timezoneLabel)}. ${escape(state.boot.studio.address)}.</p>${!p.booking?`<label style="margin-top:18px">Ваше имя<input id="client-name" name="name" autocomplete="given-name" minlength="2" maxlength="70" value="${escape(p.name)}" placeholder="Как к вам обращаться?"></label>`:''}<p class="legal">${escape(s.terms||s.extras)} Перенос и отмена — не позднее чем за ${state.boot.rules.changeMinutes/60} ч до начала.</p><label class="check-label"><input type="checkbox" id="consent" ${p.consent?'checked':''}>Условия записи мне понятны</label>${btn('Обработка данных','privacy','','text-button')}${state.boot.mode==='demo'?'<p class="notice">Это демонстрационная запись. Реальный мастер её не получит.</p>':''}`;}
function bookingSummary(b){return `<div class="panel"><div class="checkout-row"><span>Услуга</span><strong>${escape(b.title)}</strong></div><div class="checkout-row"><span>Дата</span><strong>${dateLabel(b.start)}</strong></div><div class="checkout-row"><span>Время</span><strong>${hour(b.start)}–${hour(b.end)}</strong></div><div class="checkout-row"><span>Стоимость</span><strong>${money(b.price)}</strong></div><div class="checkout-row"><span>Город</span><strong>${escape(state.boot.studio.city)}</strong></div></div>`;}
async function success(){const {booking:b}=await api(`bookings/${state.route.id}`);state.route.booking=b;const model=confirmationModel(b,window.location.href);actionBar(btn('Мои записи','bookings'));return `<div class="success-mark">${icon(b.status==='pending'?'clock':'check',40)}</div><div class="success-head"><h1>${escape(model.title)}</h1><p class="muted">${b.status==='pending'?'Запись сохранена и ожидает вашего решения':'Демонстрационное подтверждение сохранено'}</p></div>${bookingSummary(b)}<p class="small muted" style="text-align:center">№ ${escape(b.id.slice(0,8).toUpperCase())} · ${escape(state.boot.studio.timezoneLabel)}</p>${b.status==='pending'?`<div class="confirmation-link"><p class="small muted">Персональная ссылка</p><a href="${escape(model.url)}">${escape(model.url)}</a></div><div class="gap-stack">${btn('Открыть ссылку подтверждения','open-confirm-link',`data-url="${escape(model.url)}"`)}${btn('Скопировать ссылку','copy-confirm-link',`data-url="${escape(model.url)}"`,'secondary')}</div><div class="notice">${escape(model.note)}</div>`:`<div class="notice">Напоминание сформировано автоматически. Посмотреть его можно в разделе уведомлений.</div>${state.boot.mode==='portfolio'?btn('Посмотреть уведомления','notifications','','secondary'):''}`}${btn('К услугам','services','','text-button')}`;}
function status(b){return b.status==='pending'?'Ждёт подтверждения':b.status==='cancelled'?'Отменена':b.status==='completed'?'Завершена':b.end<Date.now()?'Визит прошёл':'Подтверждена';}
function bookingCard(b,admin=false){return `<button class="booking" data-action="booking" data-id="${b.id}" ${admin?'data-admin="true"':''}><div class="booking-top"><strong>${dateLabel(b.start)}</strong><span class="status ${b.status==='cancelled'?'cancelled':''}">${status(b)}</span></div><h3>${escape(b.title)}</h3>${admin?`<p class="small muted">${escape(b.name)}</p>`:''}<div class="booking-time">${icon('clock',16)}${hour(b.start)} · ${duration(b.duration)} · ${money(b.price)}</div></button>`;}
async function bookings(){if(!state.boot.user)return empty('Ваши записи здесь','Откройте приложение из Telegram, чтобы увидеть личные визиты.');const {bookings:list}=await api('bookings');const isFuture=b=>['pending','confirmed'].includes(b.status)&&b.end>=Date.now();const filtered=list.filter(b=>state.bookingTab==='future'?isFuture(b):!isFuture(b));if(state.bookingTab==='history')filtered.reverse();return `<div class="intro"><div><h1>Мои записи</h1><p>Ваше время — под рукой</p></div></div><div class="chips">${[['future','Предстоящие'],['history','История']].map(([id,t])=>`<button class="chip ${state.bookingTab===id?'active':''}" data-action="booking-tab" data-tab="${id}">${t}</button>`).join('')}</div>${filtered.map(b=>bookingCard(b)).join('')||empty(state.bookingTab==='future'?'Пока нет записей':'История ещё впереди','Выберите услугу и удобное время. Мы сохраним всё здесь.')}`;}
async function bookingDetail(){const {booking:b}=await api(`bookings/${state.route.id}`);state.route.booking=b;const mayEdit=canModifyBooking(b,{now:Date.now(),changeMinutes:state.boot.rules.changeMinutes,admin:state.route.admin});const events={created:'Запись создана',confirmed:'Запись подтверждена',reminder_sent:'Напоминание отправлено в демо',rescheduled:'Время перенесено',cancelled:'Вы отменили запись',cancelled_owner:'Мастер отменил запись',completed:'Визит завершён'};const model=confirmationModel(b,window.location.href);return `<span class="status ${b.status==='cancelled'?'cancelled':''}">${status(b)}</span><h1 style="margin-top:16px">${escape(b.title)}</h1><p class="small muted" style="margin-top:8px">Запись № ${escape(b.id.slice(0,8).toUpperCase())}</p>${bookingSummary(b)}<p class="small muted">${escape(state.boot.studio.timezoneLabel)}. ${escape(state.boot.studio.address)}.</p><p class="legal">${escape(b.terms)}</p>${b.status==='pending'?btn('Подтвердить запись','open-confirm-link',`data-url="${escape(model.url)}"`):''}${mayEdit?`<div class="gap-stack">${btn('Перенести запись','reschedule')}${btn('Отменить запись','cancel','','danger-button')}</div>`:b.status==='confirmed'?'<p class="notice">Самостоятельное изменение уже закрыто. Свяжитесь с мастером.</p>':''}${state.route.admin&&b.status==='confirmed'&&b.end<=Date.now()?btn('Отметить завершённым','complete','','secondary'):''}${btn('Написать мастеру','contact','','text-button')}<h2 class="section-title">История записи</h2><div class="panel">${b.events.map(e=>`<div class="event">${events[e.kind]||'Запись обновлена'}${e.kind==='rescheduled'?(()=>{try{const d=JSON.parse(e.detail);return `<p class="small muted">${dateLabel(d.from)} ${hour(d.from)} → ${dateLabel(d.to)} ${hour(d.to)}</p>`;}catch{return '';}})():''}<time>${dateLabel(e.at)} · ${hour(e.at)}</time></div>`).join('')}</div>`;}
async function notifications(){const {notifications:list}=await api('notifications');return `<div class="intro"><div><h1>Уведомления</h1><p>Так выглядели бы сообщения клиенту</p></div></div><div class="notice">Это имитация: сообщения никому не отправляются.</div>${list.map(item=>`<article class="notification-card"><div><span class="status">${escape(notificationStatusLabel(item.status))}</span><h3>${escape(item.title)}</h3><p class="small muted">${dateLabel(item.bookingStart)} · ${hour(item.bookingStart)}</p></div><time>${dateLabel(item.deliverAt)} · ${hour(item.deliverAt)}</time></article>`).join('')||empty('Уведомлений пока нет','Создайте и подтвердите запись — сообщения появятся здесь.')}${btn('Сбросить демонстрацию','reset-demo','','text-button')}`;}
const adminNavigation=()=>`<div class="admin-sections">${masterSections.map(item=>`<button class="chip ${state.adminView===item.id?'active':''}" data-action="admin-view" data-view="${item.id}">${item.label}</button>`).join('')}</div>`;
async function adminPortfolio(){
  const date=state.route.date||today();state.route.date=date;
  const head=`<div class="intro"><div><h1>Кабинет мастера</h1><p>Полный цикл работы с записью</p></div></div><div class="notice">Демонстрационный кабинет. Данные находятся только в этом браузере.</div>${adminNavigation()}`;
  if(state.adminView==='clients'){
    const {clients}=await api('clients');
    return `${head}<h2 class="section-title">Клиенты</h2>${clients.map(client=>`<button class="booking client-card" data-action="client" data-id="${escape(client.id)}"><div><h3>${escape(client.name)}</h3><p class="small muted">Записей: ${client.bookingsCount}</p></div><span class="arrow-circle">${icon('chevron',18)}</span></button>`).join('')||'<p class="muted small">Клиенты появятся после первой записи.</p>'}`;
  }
  if(state.adminView==='notifications'){
    const {notifications:list}=await api('notifications');
    return `${head}<h2 class="section-title">Очередь сообщений</h2>${list.map(item=>`<article class="notification-card"><div><span class="status">${escape(notificationStatusLabel(item.status))}</span><h3>${escape(item.title)}</h3><p class="small muted">${dateLabel(item.bookingStart)} · ${hour(item.bookingStart)}</p></div><time>${dateLabel(item.deliverAt)} · ${hour(item.deliverAt)}</time></article>`).join('')||'<p class="muted small">Уведомлений пока нет.</p>'}`;
  }
  const data=await api(`admin?date=${date}`),s=data.schedule;
  if(state.adminView==='journal')return `${head}<label>Журнал на дату<input type="date" id="admin-date" value="${date}"></label><h2 class="section-title">Визиты</h2>${data.bookings.map(b=>bookingCard(b,true)).join('')||'<p class="muted small">На этот день записей нет.</p>'}`;
  return `${head}<label>Календарь на дату<input type="date" id="admin-date" value="${date}"></label><h2 class="section-title">Закрытое время</h2>${data.blocks.map(b=>`<div class="panel"><p>${hour(b.start)}–${hour(b.end)}</p>${btn('Открыть это время','unblock',`data-id="${b.id}"`,'text-button')}</div>`).join('')||'<p class="muted small">Блокировок на этот день нет.</p>'}<form id="block-form" class="panel admin-form"><div class="two-fields"><label>С<input type="time" name="from" required value="16:00"></label><label>До<input type="time" name="to" required value="17:00"></label></div><button class="secondary" type="submit">Заблокировать время</button></form><h2 class="section-title">Рабочий график</h2><form id="schedule-form" class="panel admin-form"><div class="week-toggle">${['Вс','Пн','Вт','Ср','Чт','Пт','Сб'].map((d,i)=>`<label><input type="checkbox" name="weekday" value="${i}" ${s.weekdays.includes(i)?'checked':''}>${d}</label>`).join('')}</div><div class="two-fields"><label>Начало<input type="time" name="open" value="${s.open}" required></label><label>Окончание<input type="time" name="close" value="${s.close}" required></label><label>Перерыв с<input type="time" name="breakStart" value="${s.breakStart}" required></label><label>Перерыв до<input type="time" name="breakEnd" value="${s.breakEnd}" required></label></div><button class="primary" type="submit">Сохранить график</button></form>`;
}
async function clientDetail(){const {client}=await api(`clients/${state.route.id}`);return `<h1>${escape(client.name)}</h1><p class="muted" style="margin-top:8px">История клиента · ${client.bookings.length} записей</p><h2 class="section-title">Посещения и изменения</h2>${client.bookings.map(b=>bookingCard(b,true)).join('')}`;}
async function admin(){if(state.boot.mode==='portfolio')return adminPortfolio();const date=state.route.date||today();state.route.date=date;const data=await api(`admin?date=${date}`),s=data.schedule;return `<div class="intro"><div><h1>Расписание</h1><p>${escape(state.boot.studio.timezoneLabel)}</p></div></div>${state.boot.mode==='demo'?'<div class="notice">Демонстрационный режим мастера. Рабочие записи недоступны.</div>':''}<label>Записи на день<input type="date" id="admin-date" value="${date}"></label><h2 class="section-title">Визиты</h2>${data.bookings.map(b=>bookingCard(b,true)).join('')||'<p class="muted small">На этот день записей нет.</p>'}<h2 class="section-title">Закрытое время</h2>${data.blocks.map(b=>`<div class="panel"><p>${hour(b.start)}–${hour(b.end)}</p>${btn('Открыть это время','unblock',`data-id="${b.id}"`,'text-button')}</div>`).join('')}<form id="block-form" class="panel admin-form"><div class="two-fields"><label>С<input type="time" name="from" required value="16:00"></label><label>До<input type="time" name="to" required value="17:00"></label></div><button class="secondary" type="submit">Заблокировать время</button></form><h2 class="section-title">Рабочий график</h2><form id="schedule-form" class="panel admin-form"><div class="week-toggle">${['Вс','Пн','Вт','Ср','Чт','Пт','Сб'].map((d,i)=>`<label><input type="checkbox" name="weekday" value="${i}" ${s.weekdays.includes(i)?'checked':''}>${d}</label>`).join('')}</div><div class="two-fields"><label>Начало<input type="time" name="open" value="${s.open}" required></label><label>Окончание<input type="time" name="close" value="${s.close}" required></label><label>Перерыв с<input type="time" name="breakStart" value="${s.breakStart}" required></label><label>Перерыв до<input type="time" name="breakEnd" value="${s.breakEnd}" required></label></div><button class="primary" type="submit">Сохранить график</button><p class="small muted">Изменение не удалит существующие визиты. Если возникнет конфликт, сначала согласуйте перенос с клиентом.</p></form>`;}
// Обе автопрокрутки занимают 450 мс; при смене экрана анимация прекращается.
function scrollToCenter(element){
  if(!element)return;
  const rect=element.getBoundingClientRect(),from=scrollY;
  const target=Math.max(0,Math.min(document.documentElement.scrollHeight-innerHeight,from+rect.top+rect.height/2-innerHeight/2));
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){window.scrollTo({top:target,behavior:'instant'});return;}
  const started=performance.now(),version=state.version;
  function step(now){
    if(version!==state.version)return;
    const progress=Math.min(1,(now-started)/450),eased=progress*progress*(3-2*progress);
    window.scrollTo({top:from+(target-from)*eased,behavior:'instant'});
    if(progress<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
async function render(scroll=0,showSlots=false){
  const version=++state.version;header();actionBar();$('#screen').innerHTML='<div class="skeleton"></div><p class="loading">Загружаем…</p>';
  try{const views={services:catalog,service:detail,works:gallery,photo:fullPhoto,about,calendar,checkout,success,bookings,booking:bookingDetail,admin,client:clientDetail,notifications};const html=await (views[state.route.name]||catalog)();if(version!==state.version)return;$('#screen').innerHTML=`<div class="screen-enter">${html}</div>`;window.scrollTo({top:scroll,behavior:'instant'});$('#screen').focus({preventScroll:true});}
  catch(error){if(version!==state.version)return;actionBar();$('#screen').innerHTML=`<div class="error-box"><h2>Не удалось загрузить</h2><p>${escape(error.message)}</p>${btn('Повторить','retry')}${btn('К услугам','services','','text-button')}</div>`;}
  // После загрузки выбранной даты показываем время; устаревший запрос не двигает экран.
  if(showSlots&&version===state.version&&state.route.name==='calendar')scrollToCenter($('.slots'));
  // На шаге подтверждения показываем форму; согласие клиент отмечает самостоятельно.
  if(version===state.version&&state.route.name==='checkout')scrollToCenter($('.check-label'));
  if(version===state.version)celebrateBooking();
}
function showDialog(title,text,buttons=[{label:'Понятно',action:'close-dialog'}]){$('#dialog').innerHTML=`<h2 id="dialog-title">${escape(title)}</h2><p>${escape(text)}</p>${buttons.map(b=>btn(escape(b.label),b.action,'',b.type||'primary')).join('')}`;$('#dialog').showModal();}
function contact(id){const st=state.boot.studio;if(!st.telegramUsername){showDialog('Это демонстрация','Контакт реального мастера ещё не подключён. В готовом приложении здесь откроется личный чат. Сейчас можно попробовать запись через календарь.');return;}const text=id?`Здравствуйте! Хочу уточнить условия услуги «${service(id)?.title||id}».`:'Здравствуйте! Помогите, пожалуйста, выбрать услугу.';const url=`https://t.me/${encodeURIComponent(st.telegramUsername.replace(/^@/,''))}?text=${encodeURIComponent(text)}`;if(tg?.initData)tg.openTelegramLink(url);else window.open(url,'_blank','noopener');}
async function confirm(button){const p=state.pending;if(!p?.consent)return;const name=$('#client-name')?.value.trim()||p.name;p.name=name;if(!p.booking&&name.length<2){toast('Подскажите ваше имя.');$('#client-name')?.focus();return;}const path=p.booking?`bookings/${p.booking.id}/reschedule`:'bookings',payload=p.booking?{key:p.key,start:p.start}:{key:p.key,start:p.start,serviceId:p.serviceId,name};
  button.disabled=true;button.textContent='Сохраняем…';
  try{let data;try{data=await post(path,payload);}catch(error){if(!error.status){const found=await api(`operations/${p.key}`).catch(()=>null);if(found?.booking)data=found;else throw error;}else throw error;}
    if(p.booking){toast('Запись перенесена');go({name:'booking',id:data.booking.id,admin:state.boot.user.role==='owner'},{replace:true});}else{state.bookingTab='future';go({name:'success',id:data.booking.id},{replace:true});}state.pending=null;
  }catch(error){toast(error.message);button.disabled=false;button.textContent=p.booking?'Повторить перенос':'Повторить подтверждение';if(error.status===409){p.start=null;p.key=uid();go({name:'calendar'},{replace:true});}}
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const a=b.dataset.action;
  try{tg?.HapticFeedback?.selectionChanged();}catch{}
  try{
    if(a==='tab')return go({name:b.dataset.tab});
    if(a==='back')return back();
    if(a==='services'||a==='bookings'){if(a==='bookings')state.bookingTab='future';return go({name:a});}
    if(a==='category'||a==='work-category'){state[a==='category'?'category':'workCategory']=b.dataset.category;return render(scrollY);}
    if(a==='all-services'){state.category='all';return go({name:'services'});}
    if(a==='service')return go({name:'service',id:b.dataset.id});
    if(a==='photo')return go({name:'photo',id:b.dataset.service,image:Number(b.dataset.image),title:b.dataset.title});
    if(a==='photo-service'){const previous=state.trail.at(-1);if(previous?.route.name==='service'&&previous.route.id===b.dataset.id)return back();return go({name:'service',id:b.dataset.id});}
    if(a==='book')return newBooking(b.dataset.id);
    if(a==='date'){state.calendar.date=b.dataset.date;state.pending.start=null;state.pending.key=uid();return render(scrollY,true);}
    if(a==='month'){const d=new Date(`${state.calendar.month}-15T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+Number(b.dataset.delta));state.calendar.month=d.toISOString().slice(0,7);state.calendar.date=state.calendar.month===today().slice(0,7)?today():`${state.calendar.month}-01`;state.pending.start=null;state.pending.key=uid();return render(scrollY);}
    if(a==='slot'){state.pending.start=Number(b.dataset.start);state.pending.key=uid();document.querySelectorAll('.slot').forEach(x=>{const active=x===b;x.classList.toggle('selected',active);x.setAttribute('aria-pressed',String(active));});const next=$('[data-action="checkout"]');if(next)next.disabled=false;return;}
    if(a==='checkout')return go({name:'checkout'});
    if(a==='edit-time')return back();
    if(a==='confirm')return await confirm(b);
    if(a==='open-confirm-link'){window.location.assign(b.dataset.url);return;}
    if(a==='copy-confirm-link'){await navigator.clipboard.writeText(b.dataset.url);toast('Ссылка скопирована');return;}
    if(a==='notifications')return go({name:'notifications'});
    if(a==='booking')return go({name:'booking',id:b.dataset.id,admin:b.dataset.admin==='true'});
    if(a==='client')return go({name:'client',id:b.dataset.id});
    if(a==='admin-view'){state.adminView=b.dataset.view;return render();}
    if(a==='booking-tab'){state.bookingTab=b.dataset.tab;return render();}
    if(a==='reschedule')return newBooking(state.route.booking.serviceId,state.route.booking);
    if(a==='cancel'){state.cancelKey=uid();return showDialog('Отменить запись?',`${dateLabel(state.route.booking.start)}, ${hour(state.route.booking.start)} · ${state.route.booking.title}. Время станет доступно другим клиентам.`,[{label:'Оставить запись',action:'close-dialog'},{label:'Да, отменить',action:'confirm-cancel',type:'danger-button'}]);}
    if(a==='confirm-cancel'){b.disabled=true;try{await post(`bookings/${state.route.id}/cancel`,{key:state.cancelKey});$('#dialog').close();toast('Запись отменена');return render();}catch(error){b.disabled=false;throw error;}}
    if(a==='close-dialog')return $('#dialog').close();
    if(a==='privacy')return showDialog('Данные для записи',state.boot.mode==='portfolio'?'Имя, тестовые визиты и уведомления хранятся только в этом браузере. Они не отправляются мастеру или на сервер. Не вводите реальные конфиденциальные сведения.':state.boot.mode==='demo'?'В демо сохраняются имя и тестовые визиты. Браузер получает технический cookie, чтобы показать ваши записи при следующем открытии. Данные не отправляются реальному мастеру. Не вводите конфиденциальные сведения.':'Для ведения записи сохраняются имя, идентификатор Telegram и сведения о визитах. Мастер видит эти данные для организации приёма. По вопросам изменения или удаления данных свяжитесь с мастером.');
    if(a==='contact')return contact(b.dataset.service);
    if(a==='map'){if(/^https:\/\//.test(state.boot.studio.mapUrl)){tg?.initData?tg.openLink(state.boot.studio.mapUrl):window.open(state.boot.studio.mapUrl,'_blank','noopener');}return;}
    if(a==='theme'){state.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('beauty-theme',state.theme);}catch{}theme();return header();}
    if(a==='retry')return state.boot?render():init();
    if(a==='demo-role'){const {user}=await post('demo-role',{role:state.boot.user.role==='owner'?'client':'owner'});state.boot.user=user;toast(user.role==='owner'?'Демо: режим мастера':'Демо: режим клиента');return user.role==='owner'?go({name:'admin'}):render();}
    if(a==='reset-demo')return showDialog('Сбросить демонстрацию?','Удалятся только тестовые записи и уведомления этого приложения в текущем браузере.',[{label:'Оставить данные',action:'close-dialog'},{label:'Сбросить',action:'confirm-reset',type:'danger-button'}]);
    if(a==='confirm-reset'){portfolioApi?.reset();$('#dialog').close();state.route={name:'services'};state.trail=[];return init();}
    if(a==='admin')return go({name:'admin'});
    if(a==='unblock'){await api(`admin/blocks/${b.dataset.id}`,{method:'DELETE',body:'{}'});toast('Время открыто');return render(scrollY);}
    if(a==='complete'){await post(`admin/complete/${state.route.id}`,{});toast('Визит завершён');return render();}
  }catch(error){toast(error.message);}
});
document.addEventListener('input',e=>{if(e.target.id==='client-name'&&state.pending){state.pending.name=e.target.value;state.pending.key=uid();}});
document.addEventListener('change',e=>{if(e.target.id==='consent'&&state.pending){state.pending.consent=e.target.checked;const b=$('[data-action="confirm"]');if(b)b.disabled=!e.target.checked;}if(e.target.id==='admin-date'){state.route.date=e.target.value;render();}});
document.addEventListener('submit',async e=>{if(!['schedule-form','block-form'].includes(e.target.id))return;e.preventDefault();const form=e.target,button=form.querySelector('button[type="submit"]'),d=new FormData(form);button.disabled=true;try{if(form.id==='schedule-form'){const payload=Object.fromEntries(d);payload.weekdays=d.getAll('weekday').map(Number);await post('admin/schedule',payload);toast('График сохранён');}else{await post('admin/blocks',{date:state.route.date,from:d.get('from'),to:d.get('to')});toast('Время закрыто');}await render(scrollY);}catch(error){toast(error.message);button.disabled=false;}});
async function init(){try{state.boot=await post('bootstrap',{initData:tg?.initData||''});$('#demo-banner').hidden=!['demo','portfolio'].includes(state.boot.mode);$('#demo-banner').textContent=state.boot.mode==='portfolio'?'Портфолио-демо · сообщения никому не отправляются':'Демо · запись не отправляется мастеру';const token=dataMode==='portfolio'?new URL(window.location.href).searchParams.get('confirm'):'';if(token){const {booking}=await post(`confirm/${token}`,{});const clean=new URL(window.location.href);clean.searchParams.delete('confirm');history.replaceState({},'',clean);state.route={name:'success',id:booking.id,booking};}await render();}catch(error){header();$('#screen').innerHTML=`<div class="error-box"><h2>Откроем студию?</h2><p>${escape(error.message)}</p>${btn('Попробовать ещё раз','retry')}</div>`;}}
init();
