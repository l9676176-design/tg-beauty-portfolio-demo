# Portfolio Booking Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить к существующему приложению бесплатный автономный HTML-режим, в котором посетитель проходит цикл «запись → подтверждение → напоминание → перенос/отмена → история клиента», а мастер видит журнал, календарь, клиентов и уведомления.

**Architecture:** Серверный режим Node.js/SQLite остаётся без изменений. Новый `portfolio.html` включает локальный адаптер `portfolio-store.mjs`, который реализует используемый интерфейс API поверх `localStorage`; `app.mjs` выбирает адаптер по мета-признаку страницы и продолжает использовать те же экраны.

**Tech Stack:** HTML, CSS, JavaScript ES modules, browser `localStorage`, Node.js 24 test runner.

**Spec:** `docs/superpowers/specs/2026-09-09-portfolio-booking-automation-design.md`

## Global Constraints

- Портфолио-режим не выполняет сетевые запросы и никому не отправляет сообщения.
- Данные одного браузера изолированы и хранятся под версионированным ключом приложения.
- Обычный `index.html` и текущий Node.js/SQLite API продолжают работать.
- Перенос при конфликте не изменяет прежнее время.
- Персональная ссылка подтверждения работает только в исходном браузере; интерфейс сообщает об этом.
- Реальные Telegram/MAX, общий сервер, платежи и несколько мастеров не входят в объём.

---

### Task 1: Локальное хранилище и основной контракт записи

**Files:**
- Create: `tg-app/portfolio-store.mjs`
- Create: `tg-app/tests/portfolio-store.test.mjs`

**Interfaces:**
- Produces: `createPortfolioApi({storage, now, randomUUID})` → `{request(path, options), reset()}`.
- `request()` возвращает объекты того же вида, которые сейчас получает `app.mjs` от `/api/*`.

- [ ] **Step 1: Write the failing test**

Проверить загрузку исходных данных, создание записи со статусом `pending`, запрет пересечения времени и сохранение состояния после создания нового экземпляра адаптера с тем же хранилищем.

```js
const api=createPortfolioApi({storage,now:()=>clock,randomUUID:ids});
const boot=await api.request('bootstrap');
const created=await api.request('bookings',{method:'POST',body:JSON.stringify(payload)});
assert.equal(created.booking.status,'pending');
assert.equal((await api.request('bookings')).bookings.length,1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/portfolio-store.test.mjs`

Expected: FAIL because `portfolio-store.mjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

Реализовать версионированное состояние, безопасный разбор JSON, исходный график из `content.mjs`, расчёт доступных дней/слотов, идемпотентное создание записи и проверку занятости.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portfolio-store.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add tg-beauty-catalog/tg-app/portfolio-store.mjs tg-beauty-catalog/tg-app/tests/portfolio-store.test.mjs
git commit -m "feat: add portfolio booking store"
```

### Task 2: Подтверждение, уведомления и история клиента

**Files:**
- Modify: `tg-app/portfolio-store.mjs`
- Modify: `tg-app/tests/portfolio-store.test.mjs`

**Interfaces:**
- Produces: `request('confirm/<token>', {method:'POST'})`.
- Produces: `request('notifications')`, `request('clients')`, `request('clients/<id>')`.
- Booking events: `created`, `confirmed`, `reminder_sent`, `rescheduled`, `cancelled`, `completed`.

- [ ] **Step 1: Write failing confirmation tests**

Проверить уникальный токен, повторное подтверждение без дублей, ошибку для неверного токена, создание уведомления о подтверждении и запланированного напоминания.

```js
const confirmed=await api.request(`confirm/${created.booking.confirmToken}`,{method:'POST'});
assert.equal(confirmed.booking.status,'confirmed');
assert.deepEqual(confirmed.booking.events.map(e=>e.kind),['created','confirmed']);
assert.equal((await api.request('notifications')).notifications.length,2);
```

- [ ] **Step 2: Run and verify expected failure**

Run: `node --test tests/portfolio-store.test.mjs`

Expected: FAIL because confirmation and notifications are missing.

- [ ] **Step 3: Implement confirmation and due reminders**

Добавить идемпотентное подтверждение. Напоминание получает `deliverAt`; каждый вызов API обрабатывает наступившие сроки и единожды добавляет событие `reminder_sent`.

- [ ] **Step 4: Write failing lifecycle and client-history tests**

Проверить перенос, откат при конфликте, отмену, историю одной клиентки и агрегаты ближайшего/последнего визита.

- [ ] **Step 5: Run and verify expected failure**

Run: `node --test tests/portfolio-store.test.mjs`

Expected: FAIL because lifecycle/client endpoints are missing.

- [ ] **Step 6: Implement lifecycle and client endpoints**

Реализовать перенос/отмену/завершение, уведомления каждого действия, список клиентов и детальную историю.

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test tests/portfolio-store.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add tg-beauty-catalog/tg-app/portfolio-store.mjs tg-beauty-catalog/tg-app/tests/portfolio-store.test.mjs
git commit -m "feat: add confirmation notifications and client history"
```

### Task 3: Подключение автономного режима к интерфейсу

**Files:**
- Create: `tg-app/portfolio.html`
- Modify: `tg-app/app.mjs`
- Modify: `tg-app/server.mjs`
- Modify: `tg-app/tests/navigation.test.mjs`
- Modify: `tg-app/tests/booking.test.mjs`

**Interfaces:**
- `portfolio.html` sets `<meta name="app-data-mode" content="portfolio">`.
- `app.mjs` imports `createPortfolioApi` and exposes one internal `api(path, options)` dispatcher.
- Server public-file allowlist includes `portfolio.html` and `portfolio-store.mjs` without exposing private files.

- [ ] **Step 1: Write failing mode-selection test**

Проверить, что портфолио-страница содержит мета-признак и что клиентский модуль направляет вызовы в локальный адаптер.

- [ ] **Step 2: Run and verify expected failure**

Run: `node --test tests/navigation.test.mjs`

Expected: FAIL because the portfolio entry and dispatcher do not exist.

- [ ] **Step 3: Implement entry page and dispatcher**

Создать оболочку `portfolio.html`, добавить мета-признак и подключить локальный адаптер в `app.mjs`. Серверный путь оставить прежним.

- [ ] **Step 4: Extend private-file HTTP test**

Проверить, что `portfolio.html` и `portfolio-store.mjs` доступны, а база, тесты и серверные модули по-прежнему возвращают 404.

- [ ] **Step 5: Run affected tests**

Run: `node --test tests/navigation.test.mjs tests/booking.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add tg-beauty-catalog/tg-app/portfolio.html tg-beauty-catalog/tg-app/app.mjs tg-beauty-catalog/tg-app/server.mjs tg-beauty-catalog/tg-app/tests/navigation.test.mjs tg-beauty-catalog/tg-app/tests/booking.test.mjs
git commit -m "feat: connect standalone portfolio mode"
```

### Task 4: Клиентский цикл подтверждения и уведомлений

**Files:**
- Modify: `tg-app/app.mjs`
- Modify: `tg-app/styles.css`
- Create: `tg-app/tests/portfolio-ui.test.mjs`

**Interfaces:**
- Routes: `confirm`, `notifications`.
- Actions: `open-confirm-link`, `copy-confirm-link`, `notifications`, `reset-demo`.

- [ ] **Step 1: Write failing UI rendering tests**

Проверить тексты «Ожидает подтверждения», персональную ссылку, предупреждение о локальном браузере, статусы уведомлений и кнопку безопасного сброса.

- [ ] **Step 2: Run and verify expected failure**

Run: `node --test tests/portfolio-ui.test.mjs`

Expected: FAIL because the screens and actions are absent.

- [ ] **Step 3: Implement client flow**

После создания показывать pending-экран, формировать URL с token, подтверждать через route, показывать уведомления и обновлять статус без перезагрузки. Добавить короткий таймер обновления только при открытой portfolio page.

- [ ] **Step 4: Implement scoped reset**

Добавить подтверждающий диалог и удалять только версионированный ключ этого приложения.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/portfolio-ui.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add tg-beauty-catalog/tg-app/app.mjs tg-beauty-catalog/tg-app/styles.css tg-beauty-catalog/tg-app/tests/portfolio-ui.test.mjs
git commit -m "feat: add portfolio confirmation experience"
```

### Task 5: Кабинет мастера — журнал, календарь, клиенты и уведомления

**Files:**
- Modify: `tg-app/app.mjs`
- Modify: `tg-app/styles.css`
- Modify: `tg-app/tests/portfolio-ui.test.mjs`

**Interfaces:**
- `state.adminView`: `journal | calendar | clients | notifications`.
- Routes: `admin`, `client`.
- Actions: `admin-view`, `client`.

- [ ] **Step 1: Write failing master-office tests**

Проверить четыре переключателя кабинета, строки журнала, карточку клиентки с историей и очередь уведомлений.

- [ ] **Step 2: Run and verify expected failure**

Run: `node --test tests/portfolio-ui.test.mjs`

Expected: FAIL because master-office views are absent.

- [ ] **Step 3: Implement master-office views**

Разделить существующий admin renderer на компактные представления, сохранив формы графика/блокировок в «Календаре». В журнале показывать дату, время, услугу, клиентку и статус; в клиентской карточке — агрегаты и события.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/portfolio-ui.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add tg-beauty-catalog/tg-app/app.mjs tg-beauty-catalog/tg-app/styles.css tg-beauty-catalog/tg-app/tests/portfolio-ui.test.mjs
git commit -m "feat: add portfolio master office"
```

### Task 6: Документация и итоговая проверка

**Files:**
- Modify: `AGENT.md`

**Interfaces:**
- Documents: local opening command, static deployment entry, reset behavior, privacy limitations.

- [ ] **Step 1: Document the exact portfolio flow**

Описать запуск через локальный HTTP-сервер, путь `/portfolio.html`, бесплатное статическое размещение и ограничения локального хранилища. Не называть имитацию настоящей отправкой.

- [ ] **Step 2: Run the complete automated suite**

Run: `node --test tests/*.test.mjs`

Expected: all tests PASS with no warnings.

- [ ] **Step 3: Perform one browser verification**

Открыть `/portfolio.html` на мобильной ширине и пройти: создание → ссылка → подтверждение → напоминание → перенос → отмена → клиентская история → сброс. Проверить отсутствие внешних API-запросов и горизонтальной прокрутки.

- [ ] **Step 4: Commit**

```powershell
git add tg-beauty-catalog/AGENT.md
git commit -m "docs: describe standalone portfolio demo"
```
