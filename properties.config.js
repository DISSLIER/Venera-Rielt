/*
Главный конфиг объектов недвижимости.
Что чем управляется:
1) VENERA_APARTMENT_TEMPLATE: полноценный шаблон квартир, апартаментов, офисов.
2) VENERA_HOUSE_TEMPLATE: полноценный шаблон домов, вилл и коттеджей.
3) VENERA_PROPERTIES_CONFIG: основной массив объектов для каталога сайта.

Как работать с фото:
- mainPhoto: главное фото карточки.
- photos: дополнительные фото массивом URL.
    Пример:
    photos: ["https://site.com/1.jpg", "https://site.com/2.jpg", "https://site.com/3.jpg"]
*/

window.VENERA_APARTMENT_TEMPLATE = {
    id: "",
    title: "",
    city: "",
    district: "",
    type: "Премиум",
    coords: "",
    rieltorId: "",
    price: 0,
    area: 0,
    rooms: 0,
    address: "",
    fullAddress: "",
    description: "",
    mainPhoto: "", // Главное фото объекта.
    photos: [], // Дополнительные фото массивом URL.
    floors: 1,
    year: "",
    land: "",
    parking: "",
    condition: "Евроремонт",
    bathroom: "Раздельный",
    balcony: "1 балкон"
};

window.VENERA_HOUSE_TEMPLATE = {
    id: "",
    title: "",
    city: "",
    district: "",
    type: "Дом",
    coords: "",
    rieltorId: "",
    price: 0,
    area: 0,
    rooms: 0,
    address: "",
    fullAddress: "",
    description: "",
    mainPhoto: "", // Главное фото объекта.
    photos: [], // Дополнительные фото массивом URL.
    floors: 2,
    year: "",
    land: "",
    parking: 2,
    condition: "Евроремонт",
    bathroom: "2 санузла",
    balcony: "Терраса"
};

window.VENERA_PROPERTY_TEMPLATE = window.VENERA_APARTMENT_TEMPLATE;
window.VENERA_PROPERTY_TEMPLATE_MAP = {
    apartment: window.VENERA_APARTMENT_TEMPLATE,
    house: window.VENERA_HOUSE_TEMPLATE
};

// Основной каталог объектов, который рендерится на сайте.
window.VENERA_PROPERTIES_CONFIG = [
    {
        ...window.VENERA_HOUSE_TEMPLATE,
        id: "O1",
        title: "Вилла в Буюканах",
        city: "Кишинёв",
        district: "Буюканы",
        type: "Премиум",
        coords: "47.038673, 28.770806",
        rieltorId: "1",
        price: 450000,
        area: 250,
        rooms: 5,
        floors: 2,
        year: 2018,
        land: 10,
        parking: 2,
        address: "ул. Мирча чел Бэтрын 15",
        fullAddress: "Кишинёв, Буюканы, ул. Алба Юлия 194/2",
        description: "Элитная вилла в престижном районе Буюканы. Просторные светлые помещения, высокие потолки, панорамные окна. Современная отделка премиальными материалами. Кухня-гостиная с выходом на террасу и в сад. Мастер-спальня с гардеробной и собственной ванной комнатой. Дополнительно: камин, система 'умный дом', видеонаблюдение, автономное отопление. Ухоженный сад с зоной отдыха и летней кухней.",
        mainPhoto: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1470&q=80",
        photos: [
            "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1470&q=80",
            "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1470&q=80",
            "https://images.unsplash.com/photo-1600573472550-8090b5e0745e?auto=format&fit=crop&w=1470&q=80"
        ]
    },
    {
        ...window.VENERA_APARTMENT_TEMPLATE,
        id: "O2",
        title: "Апартаменты в Центре",
        city: "Кишинёв",
        district: "Центр",
        type: "Вторичка",
        coords: "47.038673, 28.770806",
        rieltorId: "2",
        price: 220000,
        area: 120,
        rooms: 3,
        floors: 7,
        year: 2015,
        parking: 1,
        address: "ул.Михай Еминеску 39",
        fullAddress: "Кишинёв, Центр, ул.Михай Еминеску 39",
        description: "Просторные апартаменты в историческом центре Кишинёва. Высокие потолки, панорамные окна с видом на город. Современный ремонт с использованием качественных материалов. Большая гостиная, отдельная кухня, 2 санузла. В шаговой доступности все инфраструктурные объекты: рестораны, театры, парки.",
        mainPhoto: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1470&q=80",
        photos: [
            "https://images.unsplash.com/photo-1600607687644-aac4c3eac7f4?auto=format&fit=crop&w=1470&q=80",
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1470&q=80"
        ]
    },
    {
        ...window.VENERA_APARTMENT_TEMPLATE,
        id: "O3",
        title: "Пентхаус на Рышкановке",
        city: "Кишинёв",
        district: "Рышкановка",
        type: "Премиум",
        coords: "47.038673, 28.770806",
        rieltorId: "3",
        price: 380000,
        area: 180,
        rooms: 4,
        floors: 12,
        address: "ул. Албишоара 42",
        fullAddress: "Кишинёв, Рышкановка, Мирона Костин 8",
        mainPhoto: "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=1470&q=80",
        photos: [
            "https://images.unsplash.com/photo-1600210492493-0946911123ea?auto=format&fit=crop&w=1470&q=80",
            "https://images.unsplash.com/photo-1600047509358-9dc75507daeb?auto=format&fit=crop&w=1470&q=80"
        ]
    },
    {
        ...window.VENERA_HOUSE_TEMPLATE,
        id: "O4",
        title: "Загородный дом в Вадул-луй-Водэ",
        city: "Вадул-луй-Водэ",
        district: "Центр",
        type: "Премиум",
        coords: "47.087155, 29.082526",
        rieltorId: "4",
        price: 320000,
        area: 300,
        rooms: 6,
        floors: 2,
        land: 15,
        address: "ул. Штефан чел Маре 22",
        fullAddress: "Вадул-луй-Водэ, ул. Штефан чел Маре 22",
        mainPhoto: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1470&q=80",
        photos: [
            "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1470&q=80",
            "https://images.unsplash.com/photo-1600607687644-aac4c3eac7f4?auto=format&fit=crop&w=1470&q=80"
        ]
    },
    {
        ...window.VENERA_APARTMENT_TEMPLATE,
        id: "O5",
        title: "Офисное помещение",
        city: "Кишинёв",
        district: "Центр",
        type: "Коммерческая",
        coords: "47.026676, 28.838697",
        rieltorId: "1",
        price: 280000,
        area: 150,
        rooms: 8,
        floors: 3,
        fullAddress: "Кишинёв, Центр, ул. Александр Пушкин 44/1",
        description: "Просторное офисное помещение в центре Кишинёва. 8 отдельных кабинетов, переговорная комната, кухня-столовая, 2 санузла. Современный ремонт, панорамные окна с видом на город. Отличная транспортная доступность, охраняемая парковка.",
        mainPhoto: "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1470&q=80",
        photos: [
            "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1470&q=80",
            "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1470&q=80"
        ]
    },
    {
        ...window.VENERA_APARTMENT_TEMPLATE,
        id: "O6",
        title: "Апартаменты на Чеканах",
        city: "Кишинёв",
        district: "Чеканы",
        type: "Новострой",
        coords: "47.042654, 28.89339",
        rieltorId: "2",
        price: 190000,
        area: 90,
        rooms: 2,
        floors: 5,
        fullAddress: "Кишинёв, Чеканы, ул. Петру Заднипру 14",
        description: "Современные апартаменты в новом жилом комплексе на Чеканах. Просторная гостиная с кухней-нишей, 2 спальни, санузел. Лоджия с панорамным остеклением. Подземный паркинг, детская площадка, зона отдыха. Отличная инфраструктура района.",
        mainPhoto: "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1470&q=80",
        photos: [
            "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1470&q=80",
            "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1470&q=80"
        ]
    },
    {
        ...window.VENERA_HOUSE_TEMPLATE,
        id: "O7",
        title: "Современный дом у парка",
        city: "Кишинёв",
        district: "Ботаника",
        type: "Дом",
        coords: "46.9979, 28.8572",
        rieltorId: "1",
        price: 285000,
        area: 165,
        rooms: 4,
        floors: 2,
        year: 2020,
        land: 6,
        parking: 2,
        address: "ул. Трандафирилор 18",
        fullAddress: "Кишинёв, Ботаника, ул. Трандафирилор 18",
        description: "Современный дом с террасой, зеленым двором и удобным выездом в центр города.",
        bathroom: "2 санузла",
        balcony: "Терраса",
        mainPhoto: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1470&q=80",
        photos: [
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1470&q=80",
            "https://images.unsplash.com/photo-1600607687644-aac4c3eac7f4?auto=format&fit=crop&w=1470&q=80"
        ]
    }
];

/*
Как добавить новый объект:
1) Скопируйте пример внутри VENERA_PROPERTIES_CONFIG.
2) Заполните минимум: title, city, district, price, area, rooms.
3) Для квартир, апартаментов, пентхаусов и офисов используйте window.VENERA_APARTMENT_TEMPLATE.
4) Для домов, вилл и коттеджей используйте window.VENERA_HOUSE_TEMPLATE.
5) id можно оставить пустым, он сгенерируется автоматически.
6) coords в формате "47.0245, 28.8323" (если оставить пустым, карточка добавится без метки на карте).
7) Поддерживаемые type: Премиум, Вторичка, Новострой, Коммерческая, Аренда, Гараж, Парковка, Кладовка, Дом, Участок.
8) Все дополнительные фото добавляются в поле photos массивом URL.
*/
