/*
Главный конфиг риелторов.
Что чем управляется:
1) VENERA_AGENT_TEMPLATE: шаблон одного риелтора.
2) VENERA_AGENTS_CONFIG: список всех риелторов сайта.

Связь с объектами:
- В properties.config.js поле rieltorId у объекта должно совпадать с rieltor_id у риелтора.
*/

window.VENERA_AGENT_TEMPLATE = {
    id: "",
    rieltor_id: "",
    name: "",
    position: "Риелтор",
    phone: "",
    email: "",
    whatsapp: "",
    telegram: "",
    viber: "",
    photo: "",
    properties_count: 0
};

// Список риелторов для блока специалистов, карточек объектов и фильтрации.
window.VENERA_AGENTS_CONFIG = [
    {
        ...window.VENERA_AGENT_TEMPLATE,
        id: "1",
        rieltor_id: 1,
        name: "Анна Петренко",
        position: "Старший риелтор",
        phone: "+373 22 111 111",
        email: "anna@venera-rielt.md",
        whatsapp: "+37322111111",
        telegram: "anna_venera_rielt",
        viber: "+37322111111",
        photo: "https://randomuser.me/api/portraits/women/44.jpg"
    },
    {
        ...window.VENERA_AGENT_TEMPLATE,
        id: "2",
        rieltor_id: 2,
        name: "Виктор Кожухарь",
        position: "Риелтор по коммерческой недвижимости",
        phone: "+373 22 111 112",
        email: "viktor@venera-rielt.md",
        whatsapp: "+37322111112",
        telegram: "viktor_venera_rielt",
        viber: "+37322111112",
        photo: "https://randomuser.me/api/portraits/men/32.jpg"
    },
    {
        ...window.VENERA_AGENT_TEMPLATE,
        id: "3",
        rieltor_id: 3,
        name: "Елена Волошина",
        position: "Эксперт по загородной недвижимости",
        phone: "+373 22 111 113",
        email: "elena@venera-rielt.md",
        whatsapp: "+37322111113",
        telegram: "elena_venera_rielt",
        viber: "+37322111113",
        photo: "https://randomuser.me/api/portraits/women/68.jpg"
    },
    {
        ...window.VENERA_AGENT_TEMPLATE,
        id: "4",
        rieltor_id: 4,
        name: "Дмитрий Сырбу",
        position: "Риелтор по новостройкам",
        phone: "+373 22 111 114",
        email: "dmitri@venera-rielt.md",
        whatsapp: "+37322111114",
        telegram: "dmitri_venera_rielt",
        viber: "+37322111114",
        photo: "https://randomuser.me/api/portraits/men/75.jpg"
    }
];

/*
Как добавить нового риелтора:
1) Скопируйте пример внутри VENERA_AGENTS_CONFIG.
2) Заполните минимум: rieltor_id, name, position.
3) phone, whatsapp, telegram и viber можно указывать отдельно.
4) Связь объекта с риелтором идет через поле rieltorId в properties.config.js.
*/