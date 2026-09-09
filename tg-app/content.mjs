// Демонстрационный контент. Здесь меняются мастер, прайс, фотографии и правила записи.
export const studio = {
  name: 'Ольга', title: 'Студия маникюра', city: 'Благовещенск', region: 'Амурская область',
  address: 'Центр города · адрес после записи', currency: 'RUB', locale: 'ru-RU',
  timezone: 'Asia/Yakutsk', timezoneLabel: 'Благовещенск · UTC+9', offset: '+09:00',
  telegramUsername: '', mapUrl: '', demoContent: true,
  about: 'Аккуратная форма, спокойные оттенки и внимание к деталям. Маникюр и педикюр в комфортном ритме — время только для вас.',
  note: 'Название, цены и расписание — пример для демонстрации. Изображения созданы для макета; это не реальные работы мастера.',
};
export const rules = { horizonDays: 45, leadMinutes: 60, changeMinutes: 120, bufferMinutes: 15, stepMinutes: 30 };
export const defaultSchedule = { weekdays: [1, 2, 3, 4, 5, 6], open: '10:00', close: '19:00', breakStart: '14:00', breakEnd: '14:30' };
export const services = [
  { id: 'nude', category: 'manicure', title: 'Маникюр с покрытием', subtitle: 'Ваш любимый оттенок', price: 2500, duration: 90, image: 0, active: true, tag: 'На каждый день',
    includes: ['Маникюр и придание формы', 'Однотонное покрытие гель-лаком', 'Масло для кутикулы'],
    extras: 'Снятие и сложный дизайн не входят. Если они нужны, уточните состав и время у мастера до записи.' },
  { id: 'french', category: 'manicure', title: 'Френч', subtitle: 'Тонкая линия, безупречная форма', price: 3000, duration: 120, image: 1, active: true, tag: 'Классика',
    includes: ['Маникюр и придание формы', 'Покрытие с французским дизайном', 'Уход за кутикулой'], extras: 'Цена за классический френч. Наращивание и снятие не входят.' },
  { id: 'natural', category: 'manicure', title: 'Маникюр без покрытия', subtitle: 'Естественно и ухоженно', price: 1400, duration: 60, image: 0, active: true,
    includes: ['Обработка кутикулы', 'Придание формы ногтям', 'Уход за руками'], extras: 'Снятие старого покрытия согласовывается отдельно.' },
  { id: 'strength', category: 'manicure', title: 'Укрепление и цвет', subtitle: 'Для красивой длины', price: 2900, duration: 120, image: 2, active: true,
    includes: ['Маникюр', 'Укрепление натуральных ногтей', 'Однотонное покрытие'], extras: 'Без наращивания. Снятие и объёмный дизайн не входят.' },
  { id: 'pedicure', category: 'pedicure', title: 'Педикюр с покрытием', subtitle: 'Лёгкость до кончиков пальцев', price: 3300, duration: 90, image: 3, active: true, tag: 'Для себя',
    includes: ['Обработка ногтей и стоп', 'Однотонное покрытие', 'Завершающий уход'], extras: 'Эстетическая процедура. Медицинские услуги не оказываются.' },
  { id: 'care', category: 'pedicure', title: 'Педикюр без покрытия', subtitle: 'Бережный уход', price: 2400, duration: 60, image: 3, active: true,
    includes: ['Форма и обработка ногтей', 'Обработка стоп', 'Увлажняющий уход'], extras: 'Без покрытия и медицинских процедур.' },
];
export const works = [
  { id: 'milk', serviceId: 'nude', image: 0, title: 'Молочный нюд', caption: 'Мягкий оттенок на каждый день' },
  { id: 'white', serviceId: 'french', image: 1, title: 'Тонкий френч', caption: 'Классика в деталях' },
  { id: 'cherry', serviceId: 'strength', image: 2, title: 'Спелая вишня', caption: 'Глубокий цвет и мягкая форма' },
  { id: 'spa', serviceId: 'pedicure', image: 3, title: 'Лёгкость шага', caption: 'Спокойный оттенок для педикюра' },
];
