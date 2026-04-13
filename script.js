    /*
    Главный файл логики сайта.
    Что чем управляется:
    1) Валидация и нормализация объектов и риелторов.
    2) Генерация карточек из конфигов.
    3) Админ-модалки и генераторы сниппетов.
    4) Фильтры, карта, overlay, пагинация.

    Важно по фото объектов:
    - mainPhoto: главное фото карточки и основное фото объекта.
    - photos: дополнительные фото (рекомендуется массив URL в конфиге).
    - Для обратной совместимости также поддерживается строка через запятую.
    - Галерея overlay строится из mainPhoto + photos.
    */

        const ANALYTICS_STORAGE_KEY = 'venera_analytics_events_v1';
        const ANALYTICS_DAY_MS = 24 * 60 * 60 * 1000;

        function getAnalyticsStore() {
            try {
                const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
                if (!raw) {
                    return { events: [] };
                }
                const parsed = JSON.parse(raw);
                if (!parsed || !Array.isArray(parsed.events)) {
                    return { events: [] };
                }
                return parsed;
            } catch (_) {
                return { events: [] };
            }
        }

        function saveAnalyticsStore(store) {
            try {
                localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(store));
            } catch (_) {
                // ignore storage quota errors
            }
        }

        function pushAnalyticsEvent(type, payload = {}) {
            const store = getAnalyticsStore();
            const now = Date.now();
            const event = {
                id: `${type}_${now}_${Math.random().toString(36).slice(2, 8)}`,
                type,
                ts: now,
                payload
            };
            store.events.push(event);

            // Keep analytics storage bounded.
            if (store.events.length > 20000) {
                store.events = store.events.slice(-20000);
            }

            saveAnalyticsStore(store);
        }

        function detectTrafficSource(referrer) {
            if (!referrer) return 'Прямой переход';

            const value = String(referrer).toLowerCase();
            if (value.includes('facebook.com') || value.includes('fb.com')) return 'Facebook';
            if (value.includes('instagram.com')) return 'Instagram';
            if (value.includes('tiktok.com')) return 'TikTok';
            if (value.includes('youtube.com') || value.includes('youtu.be')) return 'YouTube';
            if (value.includes('t.me') || value.includes('telegram')) return 'Telegram';
            if (value.includes('wa.me') || value.includes('whatsapp')) return 'WhatsApp';
            if (value.includes('viber')) return 'Viber';
            if (value.includes('google.')) return 'Google';
            return 'Другие источники';
        }

        function trackVisitEvent() {
            const isAdminPage = /admin\.html$/i.test(window.location.pathname || '');
            if (isAdminPage) return;

            const todayKey = new Date().toISOString().slice(0, 10);
            const sessionKey = `venera_visit_logged_${todayKey}`;

            try {
                if (sessionStorage.getItem(sessionKey) === '1') {
                    return;
                }
                sessionStorage.setItem(sessionKey, '1');
            } catch (_) {
                // If sessionStorage unavailable, still track the visit.
            }

            pushAnalyticsEvent('visit', {
                source: detectTrafficSource(document.referrer || '')
            });
        }

        function recordSearchAnalytics(criteria) {
            pushAnalyticsEvent('search', {
                district: String(criteria.district || '').trim() || 'Все районы',
                city: String(criteria.city || '').trim() || 'Все города',
                listingMode: String(criteria.listingMode || '').trim() || 'all'
            });
        }

        function recordPropertyViewAnalytics(payload) {
            pushAnalyticsEvent('property_view', {
                propertyId: String(payload.propertyId || '').trim(),
                rieltorId: String(payload.rieltorId || '').trim(),
                agentName: String(payload.agentName || '').trim() || 'Не указан',
                propertyTitle: String(payload.propertyTitle || '').trim()
            });
        }

        function buildAnalyticsSummary(days) {
            const safeDays = Math.max(1, Number(days) || 30);
            const now = Date.now();
            const dayStart = new Date();
            dayStart.setHours(0, 0, 0, 0);
            const startTs = safeDays === 1 ? dayStart.getTime() : (now - safeDays * ANALYTICS_DAY_MS);
            const store = getAnalyticsStore();
            const events = store.events.filter(item => Number(item.ts) >= startTs);

            const sourceCounts = {};
            const districtCounts = {};
            const districtByCity = {};
            const agentCounts = {};
            const dailyMap = {};
            const hourlyMap = {};

            for (let hour = 0; hour < 24; hour += 1) {
                const key = String(hour).padStart(2, '0');
                hourlyMap[key] = { visits: 0, searches: 0, views: 0 };
            }

            for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
                const date = new Date(now - offset * ANALYTICS_DAY_MS);
                const key = date.toISOString().slice(0, 10);
                dailyMap[key] = { visits: 0, searches: 0, views: 0 };
            }

            events.forEach(event => {
                const type = String(event.type || '');
                const payload = event.payload || {};
                const eventDate = new Date(event.ts);
                const dayKey = eventDate.toISOString().slice(0, 10);
                const hourKey = String(eventDate.getHours()).padStart(2, '0');

                if (!dailyMap[dayKey]) {
                    dailyMap[dayKey] = { visits: 0, searches: 0, views: 0 };
                }

                if (type === 'visit') {
                    const source = String(payload.source || 'Другие источники');
                    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
                    dailyMap[dayKey].visits += 1;
                    if (hourlyMap[hourKey]) hourlyMap[hourKey].visits += 1;
                }

                if (type === 'search') {
                    const district = String(payload.district || 'Все районы');
                    const city = String(payload.city || 'Все города');
                    districtCounts[district] = (districtCounts[district] || 0) + 1;

                    if (!districtByCity[city]) {
                        districtByCity[city] = {};
                    }
                    districtByCity[city][district] = (districtByCity[city][district] || 0) + 1;

                    dailyMap[dayKey].searches += 1;
                    if (hourlyMap[hourKey]) hourlyMap[hourKey].searches += 1;
                }

                if (type === 'property_view') {
                    const agentName = String(payload.agentName || payload.rieltorId || 'Не указан');
                    const agentId = String(payload.rieltorId || '').trim();
                    const key = `${agentId}::${agentName}`;
                    agentCounts[key] = (agentCounts[key] || 0) + 1;
                    dailyMap[dayKey].views += 1;
                    if (hourlyMap[hourKey]) hourlyMap[hourKey].views += 1;
                }
            });

            const toSortedArray = (obj) => Object.entries(obj)
                .map(([label, value]) => ({ label, value }))
                .sort((a, b) => b.value - a.value);

            const agentMeta = {};
            try {
                if (Array.isArray(agents)) {
                    agents.forEach(agent => {
                        agentMeta[String(agent.rieltor_id || '').trim()] = {
                            name: String(agent.name || '').trim(),
                            photo: String(agent.photo || '').trim()
                        };
                    });
                }
            } catch (_) {
                // ignore missing global agents
            }

            const agentEntries = Object.entries(agentCounts)
                .map(([compoundKey, value]) => {
                    const [rieltorId, fallbackName] = compoundKey.split('::');
                    const meta = agentMeta[String(rieltorId || '').trim()] || {};
                    return {
                        rieltorId,
                        label: meta.name || fallbackName || 'Не указан',
                        photo: meta.photo || '',
                        value
                    };
                })
                .sort((a, b) => b.value - a.value);

            const totalVisits = events.filter(e => e.type === 'visit').length;
            const totalSearches = events.filter(e => e.type === 'search').length;
            const totalViews = events.filter(e => e.type === 'property_view').length;

            const daily = Object.entries(dailyMap)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, value]) => ({ date, ...value }));

            const hourly = Object.entries(hourlyMap)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([hour, value]) => ({ hour, ...value }));

            return {
                days: safeDays,
                totalVisits,
                totalSearches,
                totalViews,
                sources: toSortedArray(sourceCounts),
                districts: toSortedArray(districtCounts),
                districtByCity,
                agents: agentEntries,
                daily,
                hourly
            };
        }

        function getSourceColor(label) {
            const key = String(label || '').toLowerCase();
            if (key === 'прямой переход') return '#FFD700';
            if (key === 'facebook') return '#1B4F9C';
            if (key === 'instagram') return '#FF4FA1';
            if (key === 'tiktok') return '#FFFFFF';
            if (key === 'telegram') return '#38BDF8';
            if (key === 'youtube') return '#FF0000';
            return '#64748B';
        }

        function renderAdminAnalyticsDashboard(days) {
            if (typeof Chart === 'undefined') {
                return;
            }

            const root = document.getElementById('admin-analytics-view');
            if (!root) {
                return;
            }

            const summary = buildAnalyticsSummary(days);
            const fmtNum = (num) => Number(num || 0).toLocaleString('ru-RU');

            const visitsEl = document.getElementById('analytics-total-visits');
            const searchesEl = document.getElementById('analytics-total-searches');
            const viewsEl = document.getElementById('analytics-total-views');
            const updatedEl = document.getElementById('analytics-updated-at');

            if (visitsEl) visitsEl.textContent = fmtNum(summary.totalVisits);
            if (searchesEl) searchesEl.textContent = fmtNum(summary.totalSearches);
            if (viewsEl) viewsEl.textContent = fmtNum(summary.totalViews);
            if (updatedEl) updatedEl.textContent = new Date().toLocaleString('ru-RU');

            const chartState = window.__veneraAdminCharts || {};
            window.__veneraAdminCharts = chartState;

            function setChart(chartKey, canvasId, config) {
                if (chartState[chartKey]) {
                    chartState[chartKey].destroy();
                }
                const canvas = document.getElementById(canvasId);
                if (!canvas) return;
                chartState[chartKey] = new Chart(canvas, config);
            }

            const sourceLabels = summary.sources.length ? summary.sources.map(item => item.label) : ['Нет данных'];
            const sourceValues = summary.sources.length ? summary.sources.map(item => item.value) : [0];
            const sourceColors = summary.sources.length ? summary.sources.map(item => getSourceColor(item.label)) : ['#64748B'];

            setChart('sources', 'analytics-sources-chart', {
                type: 'doughnut',
                data: {
                    labels: sourceLabels,
                    datasets: [{
                        data: sourceValues,
                        backgroundColor: sourceColors
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#e5e7eb' } } }
                }
            });

            const districtTop = summary.districts.slice(0, 8);
            const districtLabels = districtTop.length ? districtTop.map(item => item.label) : ['Нет данных'];
            const districtValues = districtTop.length ? districtTop.map(item => item.value) : [0];

            setChart('districts', 'analytics-districts-chart', {
                type: 'bar',
                data: {
                    labels: districtLabels,
                    datasets: [{
                        label: 'Поисков',
                        data: districtValues,
                        backgroundColor: '#FFD700'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(203,213,225,0.15)' } },
                        y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(203,213,225,0.15)' } }
                    },
                    plugins: { legend: { labels: { color: '#e5e7eb' } } }
                }
            });

            const agentTop = summary.agents.slice(0, 8);
            const agentLabels = agentTop.length ? agentTop.map(item => item.label) : ['Нет данных'];
            const agentValues = agentTop.length ? agentTop.map(item => item.value) : [0];

            setChart('agents', 'analytics-agents-chart', {
                type: 'bar',
                data: {
                    labels: agentLabels,
                    datasets: [{
                        label: 'Просмотров объектов',
                        data: agentValues,
                        backgroundColor: '#F59E0B'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(203,213,225,0.15)' } },
                        y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(203,213,225,0.15)' } }
                    },
                    plugins: { legend: { labels: { color: '#e5e7eb' } } }
                }
            });

            const citySelect = document.getElementById('analytics-city-select');
            const cityNames = Object.keys(summary.districtByCity || {}).sort((a, b) => a.localeCompare(b, 'ru'));
            const normalizedCityOptions = cityNames.length ? cityNames : ['Все города'];

            if (citySelect) {
                const currentCityValue = citySelect.value || normalizedCityOptions[0];
                citySelect.innerHTML = normalizedCityOptions
                    .map(city => `<option value="${city}">${city}</option>`)
                    .join('');
                citySelect.value = normalizedCityOptions.includes(currentCityValue) ? currentCityValue : normalizedCityOptions[0];

                if (!citySelect.dataset.bound) {
                    citySelect.addEventListener('change', function() {
                        renderAdminAnalyticsDashboard(days);
                    });
                    citySelect.dataset.bound = '1';
                }
            }

            const selectedCity = citySelect ? citySelect.value : normalizedCityOptions[0];
            const cityDistrictMap = summary.districtByCity[selectedCity] || {};
            const cityDistrictTop = Object.entries(cityDistrictMap)
                .map(([label, value]) => ({ label, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 12);

            const cityDistrictLabels = cityDistrictTop.length ? cityDistrictTop.map(item => item.label) : ['Нет данных'];
            const cityDistrictValues = cityDistrictTop.length ? cityDistrictTop.map(item => item.value) : [0];

            setChart('districtsByCity', 'analytics-city-districts-chart', {
                type: 'bar',
                data: {
                    labels: cityDistrictLabels,
                    datasets: [{
                        label: `Поисков (${selectedCity})`,
                        data: cityDistrictValues,
                        backgroundColor: '#38BDF8'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(203,213,225,0.15)' } },
                        y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(203,213,225,0.15)' } }
                    },
                    plugins: { legend: { labels: { color: '#e5e7eb' } } }
                }
            });

            const activityRows = summary.days === 1 ? summary.hourly : summary.daily;
            const activityLabels = summary.days === 1
                ? activityRows.map(item => `${item.hour}:00`)
                : activityRows.map(item => item.date.slice(5));
            setChart('activity', 'analytics-activity-chart', {
                type: 'line',
                data: {
                    labels: activityLabels,
                    datasets: [
                        {
                            label: 'Визиты',
                            data: activityRows.map(item => item.visits),
                            borderColor: '#22C55E',
                            backgroundColor: 'rgba(34,197,94,0.2)',
                            fill: true,
                            tension: 0.3
                        },
                        {
                            label: 'Поиски',
                            data: activityRows.map(item => item.searches),
                            borderColor: '#38BDF8',
                            backgroundColor: 'rgba(56,189,248,0.18)',
                            fill: true,
                            tension: 0.3
                        },
                        {
                            label: 'Просмотры объектов',
                            data: activityRows.map(item => item.views),
                            borderColor: '#F59E0B',
                            backgroundColor: 'rgba(245,158,11,0.18)',
                            fill: true,
                            tension: 0.3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(203,213,225,0.12)' } },
                        y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(203,213,225,0.12)' } }
                    },
                    plugins: { legend: { labels: { color: '#e5e7eb' } } }
                }
            });

            const agentCardsRoot = document.getElementById('analytics-agent-cards');
            if (agentCardsRoot) {
                const topAgents = summary.agents.slice(0, 12);
                agentCardsRoot.innerHTML = topAgents.length
                    ? topAgents.map(agent => `
                        <div class="analytics-agent-card">
                            <img src="${agent.photo || 'https://via.placeholder.com/64x64?text=VR'}" alt="${agent.label}" class="analytics-agent-photo">
                            <div class="analytics-agent-body">
                                <div class="analytics-agent-name">${agent.label}</div>
                                <div class="analytics-agent-views">Просмотров объектов: <span>${agent.value}</span></div>
                            </div>
                        </div>
                    `).join('')
                    : '<div class="text-sm text-gray-400">Пока нет данных по просмотрам объектов риелторов за выбранный период.</div>';
            }
        }

        window.VENERA_ANALYTICS = {
            recordSearchAnalytics,
            recordPropertyViewAnalytics,
            buildAnalyticsSummary,
            renderAdminAnalyticsDashboard
        };

        // Справочник типов недвижимости для бейджей и data-атрибутов карточки.
        function getPropertyTypeMeta(typeValue) {
            const normalized = String(typeValue || '').trim().toLowerCase();
            const map = {
                premium: { label: 'ПРЕМИУМ', tagClass: 'premium-tag', dataType: 'premium' },
                'премиум': { label: 'ПРЕМИУМ', tagClass: 'premium-tag', dataType: 'premium' },
                'вторичка': { label: 'ВТОРИЧКА', tagClass: 'secondary-tag', dataType: 'Вторичка' },
                secondary: { label: 'ВТОРИЧКА', tagClass: 'secondary-tag', dataType: 'Вторичка' },
                newbuilding: { label: 'НОВОСТРОЙ', tagClass: 'newbuilding-tag', dataType: 'newbuilding' },
                'новострой': { label: 'НОВОСТРОЙ', tagClass: 'newbuilding-tag', dataType: 'newbuilding' },
                commercial: { label: 'КОММЕРЧЕСКАЯ', tagClass: 'commercial-tag', dataType: 'commercial' },
                'коммерческая': { label: 'КОММЕРЧЕСКАЯ', tagClass: 'commercial-tag', dataType: 'commercial' },
                rental: { label: 'АРЕНДА', tagClass: 'rental-tag', dataType: 'rental' },
                'аренда': { label: 'АРЕНДА', tagClass: 'rental-tag', dataType: 'rental' },
                garage: { label: 'ГАРАЖ', tagClass: 'garage-tag', dataType: 'гараж' },
                'гараж': { label: 'ГАРАЖ', tagClass: 'garage-tag', dataType: 'гараж' },
                parking: { label: 'ПАРКОВКА', tagClass: 'parking-tag', dataType: 'парковка' },
                'парковка': { label: 'ПАРКОВКА', tagClass: 'parking-tag', dataType: 'парковка' },
                storage: { label: 'КЛАДОВКА', tagClass: 'storage-tag', dataType: 'кладовка' },
                'кладовка': { label: 'КЛАДОВКА', tagClass: 'storage-tag', dataType: 'кладовка' },
                house: { label: 'ДОМ', tagClass: 'house-tag', dataType: 'дом' },
                'дом': { label: 'ДОМ', tagClass: 'house-tag', dataType: 'дом' },
                land: { label: 'УЧАСТОК', tagClass: 'land-tag', dataType: 'участок' },
                'участок': { label: 'УЧАСТОК', tagClass: 'land-tag', dataType: 'участок' }
            };

            return map[normalized] || { label: 'ПРЕМИУМ', tagClass: 'premium-tag', dataType: 'premium' };
        }

        function formatPriceValue(value) {
            const price = Number(value) || 0;
            return `€${price.toLocaleString('en-US')}`;
        }

        function toPositiveNumber(value, fallback = 0) {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return fallback;
            }
            return parsed;
        }

        function normalizeFloorsValue(value, fallback = '1') {
            const raw = String(value == null ? '' : value).trim();
            if (!raw) return fallback;

            if (/^\d+(\/\d+)?$/.test(raw)) {
                return raw;
            }

            const numeric = Number(raw);
            if (Number.isFinite(numeric) && numeric >= 0) {
                return String(Math.trunc(numeric));
            }

            return fallback;
        }

        function normalizeCoords(rawCoords) {
            if (typeof rawCoords !== 'string' || !rawCoords.trim()) {
                return '';
            }

            const parts = rawCoords.split(',').map(part => part.trim());
            if (parts.length !== 2) {
                return '';
            }

            const lat = Number(parts[0]);
            const lng = Number(parts[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return '';
            }

            return `${lat}, ${lng}`;
        }

        function normalizePhotosValue(rawPhotos) {
            if (Array.isArray(rawPhotos)) {
                return rawPhotos
                    .map(item => String(item || '').trim())
                    .filter(Boolean);
            }

            if (typeof rawPhotos === 'string') {
                return rawPhotos
                    .split(',')
                    .map(item => item.trim())
                    .filter(Boolean);
            }

            return [];
        }

        function serializePhotosForDataAttr(photos) {
            return normalizePhotosValue(photos).join(', ');
        }

        // Проверка и очистка данных объекта перед добавлением на страницу.
        function validateAndNormalizeConfiguredProperty(property, index) {
            if (!property || typeof property !== 'object') {
                console.warn(`Конфиг объекта #${index + 1} пропущен: ожидался объект.`);
                return null;
            }

            const title = String(property.title || '').trim();
            const city = String(property.city || '').trim();
            const district = String(property.district || '').trim();

            if (!title) {
                console.warn(`Конфиг объекта #${index + 1} пропущен: поле title обязательно.`);
                return null;
            }

            if (!city) {
                console.warn(`Конфиг объекта "${title}" пропущен: поле city обязательно.`);
                return null;
            }

            if (!district) {
                console.warn(`Конфиг объекта "${title}" пропущен: поле district обязательно.`);
                return null;
            }

            const normalized = {
                ...property,
                id: property.id ? String(property.id).trim() : '',
                title,
                city,
                district,
                type: String(property.type || 'Премиум').trim(),
                listingMode: normalizeListingMode(property.listingMode, property.type),
                coords: normalizeCoords(property.coords),
                rieltorId: property.rieltorId ? String(property.rieltorId).trim() : '',
                price: toPositiveNumber(property.price, 0),
                area: toPositiveNumber(property.area, 0),
                rooms: toPositiveNumber(property.rooms, 0),
                floors: normalizeFloorsValue(property.floors, ''),
                year: toPositiveNumber(property.year, ''),
                land: toPositiveNumber(property.land, ''),
                parking: toPositiveNumber(property.parking, ''),
                address: String(property.address || '').trim(),
                fullAddress: String(property.fullAddress || '').trim(),
                description: String(property.description || '').trim(),
                condition: String(property.condition || '').trim(),
                bathroom: String(property.bathroom || '').trim(),
                balcony: String(property.balcony || '').trim(),
                mainPhoto: String(property.mainPhoto || '').trim(),
                photos: normalizePhotosValue(property.photos)
            };

            if (!normalized.coords) {
                console.warn(`Объект "${title}": поле coords пустое или некорректное. Карточка добавлена без точной метки на карте.`);
            }

            return normalized;
        }

        function getCurrentMaxPropertyIdNumber() {
            let maxId = 0;
            document.querySelectorAll('.property-card').forEach(card => {
                const rawId = card.dataset.id || '';
                const numeric = parseInt(String(rawId).replace(/\D/g, ''), 10);
                if (!Number.isNaN(numeric) && numeric > maxId) {
                    maxId = numeric;
                }
            });
            return maxId;
        }

        // Сборка HTML карточки объекта из записи конфига.
        function buildPropertyFeatureItems(property) {
            const items = [];
            const area = Number(property.area);
            const rooms = Number(property.rooms);
            const floors = String(property.floors || '').trim();
            const land = Number(property.land);
            const parking = Number(property.parking);
            const year = Number(property.year);
            const condition = String(property.condition || '').trim();
            const bathroom = String(property.bathroom || '').trim();
            const balcony = String(property.balcony || '').trim();

            if (Number.isFinite(area) && area > 0) items.push({ label: 'Площадь', value: `${area} м²` });
            if (Number.isFinite(rooms) && rooms > 0) items.push({ label: 'Комнат', value: String(rooms) });
            if (floors) items.push({ label: 'Этаж', value: floors });
            if (Number.isFinite(land) && land > 0) items.push({ label: 'Участок', value: `${land} сот.` });
            if (Number.isFinite(parking) && parking > 0) items.push({ label: 'Парковка', value: String(parking) });
            if (Number.isFinite(year) && year > 0) items.push({ label: 'Год', value: String(year) });
            if (condition) items.push({ label: 'Состояние', value: condition });
            if (bathroom) items.push({ label: 'Санузел', value: bathroom });
            if (balcony) items.push({ label: 'Балкон', value: balcony });

            return items;
        }

        function buildPropertyCardHtml(property, propertyId) {
            const typeMeta = getPropertyTypeMeta(property.type);
            const city = property.city || '';
            const district = property.district || '';
            const shortAddress = property.address || '';
            const fullAddress = property.fullAddress || `${city}, ${district}, ${shortAddress}`.replace(/(^,\s*)|(,\s*,)/g, '').replace(/,\s*$/, '');
            const image = property.mainPhoto || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1470&q=80';
            const title = property.title || `Объект ${propertyId}`;
            const listingMode = normalizeListingMode(property.listingMode, property.type);
            const priceValue = Number(property.price) || 0;
            const area = property.area || 0;
            const rooms = property.rooms || 0;
            const floors = normalizeFloorsValue(property.floors, '');
            const rieltorId = property.rieltorId || '';
            const photosSerialized = serializePhotosForDataAttr(property.photos);
            const listingBadgeClass = listingMode === 'rent' ? 'listing-mode-badge' : 'listing-mode-badge hidden';

            return `
                <div class="property-card glass-effect rounded-xl overflow-hidden transition duration-500 ease-in-out hover:shadow-lg"
                     data-id="${propertyId}" data-city="${city}" data-district="${district}" data-type="${typeMeta.dataType}" data-listing-mode="${listingMode}" data-coords="${property.coords || ''}" data-rieltor-id="${rieltorId}"
                     data-price="${priceValue}" data-area="${area}" data-rooms="${rooms}" data-floors="${floors}"
                     data-year="${property.year || ''}" data-land="${property.land || ''}" data-parking="${property.parking || ''}" data-address="${shortAddress}"
                     data-full-address="${fullAddress}" data-description="${property.description || ''}" data-condition="${property.condition || 'Евроремонт'}"
                     data-bathroom="${property.bathroom || 'Раздельный'}" data-balcony="${property.balcony || '1 балкон'}" data-main-photo="${image}" data-photos="${photosSerialized}">
                    <div class="relative">
                        <img src="${image}" alt="${title}" class="w-full h-64 object-cover">
                        <div class="property-badges">
                            <div class="type-tag ${typeMeta.tagClass}">${typeMeta.label}</div>
                            <div class="${listingBadgeClass}">Аренда</div>
                        </div>
                        <div class="price-tag gold-bg text-black font-bold px-4 py-2 rounded-full">
                            ${formatPriceValue(priceValue)}
                        </div>
                        <div class="agent-badge">
                            <img src="" alt="Agent" class="w-12 h-12 rounded-full border-2 border-white object-cover agent-photo" data-rieltor-id="${rieltorId}">
                        </div>
                    </div>
                    <div class="p-6">
                        <h3 class="text-xl font-semibold mb-2 truncate">${title}</h3>
                        <div class="flex items-center text-gray-400 mb-4">
                            <i class="fas fa-map-marker-alt mr-2 gold-text"></i>
                            <span class="truncate">${fullAddress}</span>
                        </div>
                        <div class="grid grid-cols-3 gap-2 mb-4">
                            <div class="text-center">
                                <div class="text-sm text-gray-400 property-spec-label"><i class="fas fa-ruler-combined property-spec-icon" aria-hidden="true"></i><span>Площадь</span></div>
                                <div class="font-semibold">${area > 0 ? `${area} м²` : '-'}</div>
                            </div>
                            <div class="text-center">
                                <div class="text-sm text-gray-400 property-spec-label"><i class="fas fa-bed property-spec-icon" aria-hidden="true"></i><span>Комнат</span></div>
                                <div class="font-semibold">${rooms > 0 ? rooms : '-'}</div>
                            </div>
                            <div class="text-center">
                                <div class="text-sm text-gray-400 property-spec-label"><i class="fas fa-layer-group property-spec-icon" aria-hidden="true"></i><span>Этаж</span></div>
                                <div class="font-semibold">${floors || '-'}</div>
                            </div>
                        </div>
                        <button class="view-details-btn w-full gold-bg text-black font-bold py-2 px-4 rounded-lg btn-gold hover:bg-yellow-600 transition duration-300" data-price="${priceValue}">
                            Подробнее
                        </button>
                    </div>
                </div>
            `;
        }

        function createPropertyCardElement(property, propertyId) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = buildPropertyCardHtml(property, propertyId).trim();
            return wrapper.firstElementChild;
        }

        function appendPropertyCardToGrid(property, propertiesGrid, existingIds, currentMaxId) {
            let propertyId = property.id;
            let maxId = currentMaxId;

            if (!propertyId || existingIds.has(propertyId)) {
                maxId += 1;
                propertyId = `O${maxId}`;
            }

            const card = createPropertyCardElement(property, propertyId);
            if (!card) {
                return { added: false, maxId };
            }

            propertiesGrid.appendChild(card);
            existingIds.add(propertyId);
            return { added: true, card, propertyId, maxId };
        }

        // Загрузка объектов из properties.config.js в каталог сайта.
        function appendConfiguredProperties() {
            const extraProperties = Array.isArray(window.VENERA_PROPERTIES_CONFIG)
                ? window.VENERA_PROPERTIES_CONFIG
                : [];

            if (extraProperties.length === 0) {
                return;
            }

            const propertiesGrid = document.getElementById('properties-grid');
            if (!propertiesGrid) {
                return;
            }

            const existingIds = new Set(Array.from(document.querySelectorAll('.property-card')).map(card => card.dataset.id));
            let maxId = getCurrentMaxPropertyIdNumber();
            let addedCount = 0;
            let skippedCount = 0;

            extraProperties.forEach((rawProperty, index) => {
                const property = validateAndNormalizeConfiguredProperty(rawProperty, index);
                if (!property) {
                    skippedCount += 1;
                    return;
                }

                const appendResult = appendPropertyCardToGrid(property, propertiesGrid, existingIds, maxId);
                maxId = appendResult.maxId;

                if (appendResult.added) {
                    addedCount += 1;
                }
            });

            if (addedCount > 0 || skippedCount > 0) {
                console.info(`Конфиг объектов: добавлено ${addedCount}, пропущено ${skippedCount}.`);
            }
        }

        appendConfiguredProperties();

        // Обновляем счётчик "Объектов в продаже" по реальному числу карточек.
        function updatePropertiesForSaleCount() {
            const el = document.getElementById('properties-for-sale-count');
            if (!el) return;
            el.textContent = document.querySelectorAll('.property-card').length;
        }

        updatePropertiesForSaleCount();
        function filterAdminProperties(searchTerm) {
            searchTerm = searchTerm.toLowerCase();
            const propertyCards = document.querySelectorAll('.property-card');
            let hasMatches = false;

            propertyCards.forEach(card => {
                const title = card.querySelector('h3').textContent.toLowerCase();
                const city = card.dataset.city ? card.dataset.city.toLowerCase() : '';
                const district = card.dataset.district ? card.dataset.district.toLowerCase() : '';
                const address = card.dataset.address ? card.dataset.address.toLowerCase() : '';
                const fullAddress = card.dataset.fullAddress ? card.dataset.fullAddress.toLowerCase() : '';
                const coords = card.dataset.coords || '';
                const rieltorId = card.dataset.rieltorId || '';

                // Find agent name by rieltor ID
                let agentName = '';
                const agent = agents.find(a => String(a.rieltor_id) === String(rieltorId));
                if (agent) {
                    agentName = agent.name.toLowerCase();
                }

                const matches = title.includes(searchTerm) || 
                               city.includes(searchTerm) || 
                               district.includes(searchTerm) || 
                               address.includes(searchTerm) || 
                               fullAddress.includes(searchTerm) ||
                               coords.includes(searchTerm) ||
                               agentName.includes(searchTerm);

                // Highlight matching cards in admin panel
                const adminCard = document.querySelector(`.admin-property-card[data-id="${card.dataset.id}"]`);
                if (adminCard) {
                    if (matches || !searchTerm) {
                        adminCard.style.display = 'block';
                        hasMatches = true;
                    } else {
                        adminCard.style.display = 'none';
                    }
                }
            });

            return hasMatches;
        }

        // === Доступ к админ-панели только в локальной среде (без пароля в клиентском коде) ===
        const ADMIN_SESSION_KEY = 'venera_admin_authenticated';

        function isLocalEnvironment() {
            const host = window.location.hostname;
            return host === 'localhost' || host === '127.0.0.1';
        }

        function getUniqueCitiesAndDistricts() {
            const cities = new Set();
            const districtsByCity = {};

            const properties = Array.isArray(window.VENERA_PROPERTIES_CONFIG) ? window.VENERA_PROPERTIES_CONFIG : [];
            properties.forEach(prop => {
                if (prop.city) {
                    cities.add(prop.city);
                    if (!districtsByCity[prop.city]) {
                        districtsByCity[prop.city] = new Set();
                    }
                    if (prop.district) {
                        districtsByCity[prop.city].add(prop.district);
                    }
                }
            });

            return {
                cities: Array.from(cities).sort(),
                districtsByCity: Object.keys(districtsByCity).reduce((acc, city) => {
                    acc[city] = Array.from(districtsByCity[city]).sort();
                    return acc;
                }, {})
            };
        }

        function registerCityDistrict(city, district) {
            const cleanCity = String(city || '').trim();
            const cleanDistrict = String(district || '').trim();
            if (!cleanCity) return;

            if (!cityDistricts[cleanCity]) {
                cityDistricts[cleanCity] = ['Все районы'];
            }

            if (cleanDistrict && cleanDistrict !== 'Все районы' && !cityDistricts[cleanCity].includes(cleanDistrict)) {
                cityDistricts[cleanCity].push(cleanDistrict);
            }

            cityDistricts[cleanCity] = Array.from(new Set(cityDistricts[cleanCity])).sort((a, b) => {
                if (a === 'Все районы') return -1;
                if (b === 'Все районы') return 1;
                return a.localeCompare(b, 'ru');
            });
        }

        function syncCityDistrictCatalog() {
            const { cities, districtsByCity } = getUniqueCitiesAndDistricts();
            cities.forEach(city => registerCityDistrict(city, 'Все районы'));
            Object.keys(districtsByCity).forEach(city => {
                districtsByCity[city].forEach(district => registerCityDistrict(city, district));
            });

            document.querySelectorAll('.property-card').forEach(card => {
                registerCityDistrict(card.dataset.city, card.dataset.district);
            });
        }

        function populateSearchCitySelect() {
            const searchCity = document.getElementById('city');
            if (!searchCity) return;

            const currentValue = searchCity.value || 'Все';
            searchCity.innerHTML = '';

            const allOption = document.createElement('option');
            allOption.value = 'Все';
            allOption.textContent = 'Все города';
            searchCity.appendChild(allOption);

            Object.keys(cityDistricts)
                .sort((a, b) => a.localeCompare(b, 'ru'))
                .forEach(city => {
                    const option = document.createElement('option');
                    option.value = city;
                    option.textContent = city;
                    searchCity.appendChild(option);
                });

            const canRestore = Array.from(searchCity.options).some(option => option.value === currentValue);
            searchCity.value = canRestore ? currentValue : 'Все';
        }

        function populateCitySelect() {
            const citySelect = document.getElementById('property-city');
            if (!citySelect) return;

            syncCityDistrictCatalog();
            const cities = Object.keys(cityDistricts).sort((a, b) => a.localeCompare(b, 'ru'));
            const currentValue = citySelect.value || '';
            citySelect.innerHTML = '<option value="">-- Выберите город --</option>';
            
            cities.forEach(city => {
                const option = document.createElement('option');
                option.value = city;
                option.textContent = city;
                citySelect.appendChild(option);
            });

            if (currentValue && Array.from(citySelect.options).some(option => option.value === currentValue)) {
                citySelect.value = currentValue;
            }

            citySelect.addEventListener('change', populateDistrictSelect);
        }

        function populateDistrictSelect() {
            const citySelect = document.getElementById('property-city');
            const districtSelect = document.getElementById('property-district');
            if (!districtSelect) return;

            const selectedCity = citySelect.value;
            const currentDistrict = districtSelect.value || '';
            const districts = cityDistricts[selectedCity] || ['Все районы'];

            districtSelect.innerHTML = '<option value="">-- Выберите район --</option>';
            
            districts.forEach(district => {
                const option = document.createElement('option');
                option.value = district;
                option.textContent = district;
                districtSelect.appendChild(option);
            });

            if (currentDistrict && Array.from(districtSelect.options).some(option => option.value === currentDistrict)) {
                districtSelect.value = currentDistrict;
            }
        }

        function openAdminPanelWithAuth() {
            if (!isLocalEnvironment()) {
                alert('Админ-панель доступна только в локальной версии сайта.');
                return;
            }

            const adminPanel = document.getElementById('admin-panel');
            if (!adminPanel) return;

            try {
                sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
            } catch (e) {
                console.log('SessionStorage not available');
            }

            adminPanel.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            initAdminPanel();
        }

        // Admin panel functionality
        document.addEventListener('DOMContentLoaded', function() {
            // Admin property search handler
            document.getElementById('admin-property-search').addEventListener('input', function(e) {
                filterAdminProperties(e.target.value);
            });
            const adminPanel = document.getElementById('admin-panel');
            const closeAdminPanel = document.getElementById('close-admin-panel');
            const openAdminPanelLinks = document.querySelectorAll('#admin-panel-link, #admin-panel-link-desktop');

            // Open admin panel - через авторизацию
            openAdminPanelLinks.forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    openAdminPanelWithAuth();
                });
            });

            // Close admin panel
            closeAdminPanel.addEventListener('click', function() {
                if (document.body.classList.contains('admin-standalone')) {
                    window.location.href = 'index.html';
                    return;
                }
                adminPanel.classList.add('hidden');
                document.body.style.overflow = 'auto';
            });

            // Initialize admin panel
            initAdminPanel();

            // Оставляем только кнопку закрытия legacy-модала авторизации.
            const authModal = document.getElementById('admin-auth-modal');
            const authCancelBtn = document.getElementById('admin-auth-cancel');
            if (authModal && authCancelBtn) {
                authCancelBtn.addEventListener('click', function() {
                    authModal.classList.add('hidden');
                });
            }
        });
        
        function initAdminPanel() {
            populateCitySelect();
            countAgentProperties();
            renderPropertiesList();
            renderAgentsList();
        }
        
        function renderPropertiesList() {
            const propertiesList = document.getElementById('properties-list');
            propertiesList.innerHTML = '';
            
            document.querySelectorAll('.property-card').forEach((card, index) => {
                const title = card.querySelector('h3').textContent;
                const imageSrc = card.querySelector('img').src;
                const price = card.querySelector('.price-tag').textContent;
                const type = card.querySelector('.type-tag').textContent;
                const propertyDiv = document.createElement('div');
                propertyDiv.className = 'p-4 bg-gray-800 rounded-lg flex flex-col admin-property-card h-full';
                propertyDiv.dataset.id = card.dataset.id;
                propertyDiv.innerHTML = `
                    <div class="flex-grow">
                        <div class="relative mb-3 overflow-hidden rounded-lg">
                            <img src="${card.dataset.mainPhoto || imageSrc}" alt="${title}" class="w-full h-40 object-cover">
                            <div class="absolute top-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                                ${type}
                            </div>
                            <div class="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded">
                                ${price}
                            </div>
                        </div>
                        <h4 class="font-semibold text-sm mb-2 line-clamp-2">${title}</h4>
                        <div class="text-xs text-gray-400 mb-3 line-clamp-1 flex items-center">
                            <i class="fas fa-map-marker-alt mr-1 flex-shrink-0"></i>
                            <span class="truncate">${card.dataset.fullAddress || card.dataset.address || ''}</span>
                        </div>
                    </div>
                    <div class="flex gap-2 mt-auto pt-3">
                        <button class="edit-property flex-1 text-blue-400 py-2 text-xs font-medium bg-gray-700 hover:bg-gray-600 rounded transition" data-index="${index}">Изменить</button>
                        <button class="delete-property flex-1 text-red-400 py-2 text-xs font-medium bg-gray-700 hover:bg-gray-600 rounded transition" data-index="${index}">Удалить</button>
                    </div>
                `;
                propertiesList.appendChild(propertyDiv);
            });
        }
        
        function renderAgentsList() {
            const agentsList = document.getElementById('agents-list');
            agentsList.innerHTML = '';

            const propertyCountsByAgent = {};
            document.querySelectorAll('.property-card').forEach(card => {
                const agentId = String(card.dataset.rieltorId || '').trim();
                if (!agentId) return;
                propertyCountsByAgent[agentId] = (propertyCountsByAgent[agentId] || 0) + 1;
            });
            
            agents.forEach((agent, index) => {
                const agentId = String(agent.rieltor_id || '').trim();
                const exactCount = propertyCountsByAgent[agentId] || 0;
                agent.properties_count = exactCount;

                const agentDiv = document.createElement('div');
                agentDiv.className = 'p-4 bg-gray-800 rounded-lg flex flex-col h-full';
                agentDiv.innerHTML = `
                    <div class="flex-grow">
                        <div class="flex items-center mb-4">
                            <img src="${agent.photo}" alt="${agent.name}" class="w-14 h-14 rounded-full object-cover mr-3 flex-shrink-0">
                            <div class="min-w-0 flex-1">
                                <h4 class="font-semibold text-sm truncate">${agent.name}</h4>
                                <p class="text-xs text-gray-400 truncate">${agent.position}</p>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-2 mb-3">
                            <div class="bg-gray-700 px-2 py-2 rounded text-center">
                                <div class="text-xs text-gray-400"><i class="fas fa-phone mr-1"></i>Телефон</div>
                                <div class="text-xs break-all">${agent.phone || '-'}</div>
                            </div>
                            <div class="bg-gray-700 px-2 py-2 rounded text-center">
                                <div class="text-xs text-gray-400">Объектов</div>
                                <div class="text-xs font-bold">${exactCount}</div>
                            </div>
                        </div>
                        <div class="text-center bg-gray-700 rounded py-2">
                            <span class="text-xs text-gray-300">${agent.email || 'Email не указан'}</span>
                        </div>
                    </div>
                    <div class="flex gap-2 mt-auto pt-3">
                        <button class="edit-agent flex-1 text-blue-400 py-2 text-xs font-medium bg-gray-700 hover:bg-gray-600 rounded transition" data-index="${index}">Изменить</button>
                        <button class="delete-agent flex-1 text-red-400 py-2 text-xs font-medium bg-gray-700 hover:bg-gray-600 rounded transition" data-index="${index}">Удалить</button>
                    </div>
                `;
                agentsList.appendChild(agentDiv);
            });
        }
        
        // Property edit modal functions
        function openPropertyEditModal(index = null) {
            const modal = document.getElementById('property-edit-modal');
            const title = document.getElementById('property-modal-title');
            const snippetField = document.getElementById('property-config-snippet');
            const statusEl = document.getElementById('property-edit-status');

            if (statusEl) {
                statusEl.classList.add('hidden');
                statusEl.textContent = '';
            }
            
            // Populate realtor dropdown
            populateRealtorDropdown();
            
            if (index !== null) {
                // Edit existing property
                title.textContent = 'Изменить объект';
                const card = document.querySelectorAll('.property-card')[index];
                const data = card.dataset;
                
                document.getElementById('property-id').value = card.dataset.id || '';
                document.getElementById('property-title').value = card.querySelector('h3').textContent;
                document.getElementById('property-main-photo').value = card.querySelector('img').src || '';
                document.getElementById('property-photos').value = card.dataset.photos || '';
                registerCityDistrict(data.city, data.district);
                populateCitySelect();
                document.getElementById('property-city').value = data.city || '';
                populateDistrictSelect();
                document.getElementById('property-district').value = data.district || '';
                document.getElementById('property-listing-mode').value = normalizeListingMode(data.listingMode, data.type);
                document.getElementById('property-type').value = getPropertyTypeForSelect(data.type || 'premium');
                document.getElementById('property-price').value = data.price || '';
                document.getElementById('property-area').value = data.area || '';
                document.getElementById('property-rooms').value = data.rooms || '';
                document.getElementById('property-floors').value = data.floors || '';
                document.getElementById('property-land').value = data.land || '';
                document.getElementById('property-parking').value = data.parking || '';
                document.getElementById('property-condition').value = data.condition || 'Евроремонт';
                document.getElementById('property-bathroom').value = data.bathroom || 'Раздельный';
                document.getElementById('property-balcony').value = data.balcony || '1 балкон';
                document.getElementById('property-full-address').value = data.fullAddress || '';
                document.getElementById('property-description').value = data.description || '';
                document.getElementById('property-coords').value = data.coords || '';
                
                // Set realtor ID in dropdown
                const realtorSelect = document.getElementById('property-rieltor-id');
                const realtorId = data.rieltorId || '';
                if (realtorSelect.querySelector(`option[value="${realtorId}"]`)) {
                    realtorSelect.value = realtorId;
                } else {
                    realtorSelect.selectedIndex = 0;
                }

                const propertyTemplateSelect = document.getElementById('property-config-template');
                if (propertyTemplateSelect) {
                    propertyTemplateSelect.value = inferPropertyConfigTemplate(data.type, data.land);
                }
            } else {
                // Add new property
                title.textContent = 'Добавить объект';
                document.getElementById('property-edit-form').reset();
                document.getElementById('property-id').value = '';
                
                // Reset realtor dropdown to first option
                document.getElementById('property-rieltor-id').selectedIndex = 0;
                document.getElementById('property-listing-mode').value = 'sale';
                populateCitySelect();
                populateDistrictSelect();
                syncPropertyConfigTemplateSelection();
            }

            if (snippetField) {
                snippetField.value = '';
            }
            
            modal.classList.remove('hidden');
        }
        
        // Populate realtor dropdown with agents data
        function populateRealtorDropdown() {
            const realtorSelect = document.getElementById('property-rieltor-id');
            
            // Clear existing options except the first one
            while (realtorSelect.options.length > 1) {
                realtorSelect.remove(1);
            }
            
            // Add agents as options
            agents.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.rieltor_id;
                option.textContent = `${agent.rieltor_id}: ${agent.name} (${agent.position})`;
                realtorSelect.appendChild(option);
            });
        }
        
        function closePropertyEditModal() {
            const snippetField = document.getElementById('property-config-snippet');
            const statusEl = document.getElementById('property-edit-status');
            if (snippetField) {
                snippetField.value = '';
            }
            if (statusEl) {
                statusEl.classList.add('hidden');
                statusEl.textContent = '';
            }
            document.getElementById('property-edit-modal').classList.add('hidden');
        }

        function getPropertyTypeForConfig(rawType) {
            const normalized = String(rawType || '').trim().toLowerCase();
            const map = {
                premium: 'Премиум',
                secondary: 'Вторичка',
                newbuilding: 'Новострой',
                rental: 'Премиум',
                commercial: 'Коммерческая',
                garage: 'Гараж',
                parking: 'Парковка',
                storage: 'Кладовка',
                house: 'Дом',
                land: 'Участок'
            };

            return map[normalized] || rawType || 'Премиум';
        }

        function getPropertyTypeForSelect(rawType) {
            const normalized = String(rawType || '').trim().toLowerCase();
            const map = {
                'премиум': 'premium',
                'вторичка': 'secondary',
                'новострой': 'newbuilding',
                'аренда': 'premium',
                'коммерческая': 'commercial',
                'гараж': 'garage',
                'парковка': 'parking',
                'кладовка': 'storage',
                'дом': 'house',
                'участок': 'land'
            };

            return map[normalized] || 'premium';
        }

        function inferPropertyConfigTemplate(rawType, landValue) {
            const normalizedType = String(rawType || '').trim().toLowerCase();
            const normalizedLand = Number(landValue);

            if (normalizedType === 'house' || normalizedType === 'дом') {
                return 'house';
            }

            if (Number.isFinite(normalizedLand) && normalizedLand > 0) {
                return 'house';
            }

            return 'apartment';
        }

        function getPropertyTemplateReference(templateKey) {
            return templateKey === 'house'
                ? 'window.VENERA_HOUSE_TEMPLATE'
                : 'window.VENERA_APARTMENT_TEMPLATE';
        }

        function syncPropertyConfigTemplateSelection() {
            const templateSelect = document.getElementById('property-config-template');
            const typeSelect = document.getElementById('property-type');
            const landInput = document.getElementById('property-land');

            if (!templateSelect || !typeSelect || !landInput) {
                return;
            }

            templateSelect.value = inferPropertyConfigTemplate(typeSelect.value, landInput.value);
        }

        const PROPERTY_DRAFT_STORAGE_KEY = 'venera_property_form_draft_v1';

        function collectPropertyFormData() {
            return {
                id: document.getElementById('property-id').value.trim(),
                title: document.getElementById('property-title').value.trim(),
                city: document.getElementById('property-city').value.trim(),
                district: document.getElementById('property-district').value.trim(),
                listingMode: document.getElementById('property-listing-mode').value.trim(),
                type: document.getElementById('property-type').value,
                coords: document.getElementById('property-coords').value.trim(),
                rieltorId: document.getElementById('property-rieltor-id').value.trim(),
                price: Number(document.getElementById('property-price').value) || 0,
                area: Number(document.getElementById('property-area').value) || 0,
                rooms: Number(document.getElementById('property-rooms').value) || 0,
                floors: normalizeFloorsValue(document.getElementById('property-floors').value, ''),
                year: document.getElementById('property-year') ? document.getElementById('property-year').value.trim() : '',
                land: document.getElementById('property-land').value.trim(),
                parking: document.getElementById('property-parking').value.trim(),
                address: document.getElementById('property-full-address').value.trim() || document.getElementById('property-city').value.trim(),
                fullAddress: document.getElementById('property-full-address').value.trim(),
                description: document.getElementById('property-description').value.trim(),
                condition: document.getElementById('property-condition').value.trim(),
                bathroom: document.getElementById('property-bathroom').value.trim(),
                balcony: document.getElementById('property-balcony').value.trim(),
                mainPhoto: document.getElementById('property-main-photo').value.trim(),
                photos: normalizePhotosValue(document.getElementById('property-photos').value.trim())
            };
        }

        function validatePropertyFormData(property, modeLabel) {
            const requiredFields = ['title', 'city', 'district'];
            const missing = requiredFields.filter(field => !property[field]);
            if (missing.length > 0) {
                alert(`Заполните обязательные поля перед ${modeLabel}: ${missing.join(', ')}`);
                return false;
            }
            return true;
        }

        function buildPropertyConfigSnippetFromForm() {
            const collected = collectPropertyFormData();
            const property = collected;
            if (!validatePropertyFormData(property, 'генерацией')) {
                return '';
            }

            const templateReference = getPropertyTemplateReference(inferPropertyConfigTemplate(property.type, property.land));
            const configProperty = {
                ...property,
                type: getPropertyTypeForConfig(property.type)
            };

            return JSON.stringify(configProperty, null, 4)
                .split('\n')
                .map(line => `    ${line}`)
                .join('\n')
                .replace(/^\s*\{/, `    {\n        ...${templateReference},`)
                .replace(/\n\s*\}$/, '\n    }')
                .replace(/"([^"]+)":/g, '$1:');
        }

        function previewPropertyFromForm() {
            const collected = collectPropertyFormData();
            const property = collected;
            if (!validatePropertyFormData(property, 'добавлением в каталог')) {
                return;
            }

            const normalized = validateAndNormalizeConfiguredProperty(property, 0);
            if (!normalized) {
                return;
            }

            const propertiesGrid = document.getElementById('properties-grid');
            if (!propertiesGrid) {
                alert('Контейнер объектов не найден.');
                return;
            }

            const existingIds = new Set(Array.from(document.querySelectorAll('.property-card')).map(card => card.dataset.id));
            const appendResult = appendPropertyCardToGrid(
                normalized,
                propertiesGrid,
                existingIds,
                getCurrentMaxPropertyIdNumber()
            );

            if (!appendResult.added || !appendResult.card) {
                alert('Не удалось добавить объект в каталог.');
                return;
            }

            appendResult.card.classList.add('visible');
            propertyCounter = getCurrentMaxPropertyIdNumber();

            const detailsBtn = appendResult.card.querySelector('.view-details-btn');
            if (detailsBtn) {
                detailsBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    openPropertyOverlay(this);
                });
            }

            if (typeof updateAgentPhotos === 'function') {
                updateAgentPhotos();
            }
            if (typeof countAgentProperties === 'function') {
                countAgentProperties();
            }
            if (typeof renderAgents === 'function') {
                renderAgents();
            }
            if (typeof renderPropertiesList === 'function') {
                renderPropertiesList();
            }
            if (typeof updatePropertiesForSaleCount === 'function') {
                updatePropertiesForSaleCount();
            }
            if (typeof updateListingModeBadgesVisibility === 'function') {
                updateListingModeBadgesVisibility();
            }

            if (mainMap) {
                mainMap.remove();
                mainMap = null;
                propertyMarkers.length = 0;
                initMainMap();
            }

            appendResult.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alert(`Объект ${appendResult.propertyId} добавлен в каталог (предпросмотр).`);
        }

        function savePropertyDraft() {
            const draft = collectPropertyFormData();
            localStorage.setItem(PROPERTY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
            alert('Черновик сохранен локально в браузере.');
        }

        function loadPropertyDraft() {
            const raw = localStorage.getItem(PROPERTY_DRAFT_STORAGE_KEY);
            if (!raw) {
                alert('Черновик не найден.');
                return;
            }

            try {
                const draft = JSON.parse(raw);
                document.getElementById('property-id').value = draft.id || '';
                document.getElementById('property-title').value = draft.title || '';
                document.getElementById('property-main-photo').value = draft.mainPhoto || '';
                document.getElementById('property-photos').value = Array.isArray(draft.photos)
                    ? draft.photos.join(', ')
                    : (draft.photos || '');
                registerCityDistrict(draft.city, draft.district);
                populateCitySelect();
                document.getElementById('property-city').value = draft.city || '';
                populateDistrictSelect();
                document.getElementById('property-district').value = draft.district || '';
                document.getElementById('property-listing-mode').value = normalizeListingMode(draft.listingMode, draft.type);
                document.getElementById('property-type').value = getPropertyTypeForSelect(draft.type || 'premium');
                document.getElementById('property-price').value = draft.price || '';
                document.getElementById('property-area').value = draft.area || '';
                document.getElementById('property-rooms').value = draft.rooms || '';
                document.getElementById('property-floors').value = draft.floors || '';
                document.getElementById('property-land').value = draft.land || '';
                document.getElementById('property-parking').value = draft.parking || '';
                document.getElementById('property-condition').value = draft.condition || 'Евроремонт';
                document.getElementById('property-bathroom').value = draft.bathroom || '';
                document.getElementById('property-balcony').value = draft.balcony || '';
                document.getElementById('property-full-address').value = draft.fullAddress || '';
                document.getElementById('property-description').value = draft.description || '';
                document.getElementById('property-coords').value = draft.coords || '';

                const realtorSelect = document.getElementById('property-rieltor-id');
                if (realtorSelect && draft.rieltorId && realtorSelect.querySelector(`option[value="${draft.rieltorId}"]`)) {
                    realtorSelect.value = draft.rieltorId;
                }

                alert('Черновик загружен.');
            } catch (error) {
                console.error('Ошибка чтения черновика:', error);
                alert('Не удалось загрузить черновик.');
            }
        }

        function clearPropertyDraft() {
            localStorage.removeItem(PROPERTY_DRAFT_STORAGE_KEY);
            alert('Черновик удален.');
        }

        async function copyPropertyConfigSnippet() {
            const snippetField = document.getElementById('property-config-snippet');
            if (!snippetField || !snippetField.value.trim()) {
                alert('Сначала сгенерируйте блок конфигурации.');
                return;
            }

            try {
                await navigator.clipboard.writeText(snippetField.value);
                alert('Блок скопирован в буфер обмена.');
            } catch (error) {
                snippetField.select();
                document.execCommand('copy');
                alert('Блок скопирован в буфер обмена.');
            }
        }

        function collectAgentFormData() {
            return {
                id: document.getElementById('agent-id').value.trim(),
                rieltor_id: document.getElementById('agent-rieltor-id').value.trim(),
                name: document.getElementById('agent-name').value.trim(),
                position: document.getElementById('agent-position').value.trim(),
                phone: document.getElementById('agent-phone').value.trim(),
                email: document.getElementById('agent-email').value.trim(),
                whatsapp: document.getElementById('agent-whatsapp').value.trim(),
                telegram: document.getElementById('agent-telegram').value.trim(),
                viber: document.getElementById('agent-viber').value.trim(),
                photo: document.getElementById('agent-photo').value.trim()
            };
        }

        function validateAgentFormData(agent, modeLabel) {
            const requiredFields = ['rieltor_id', 'name', 'position'];
            const missing = requiredFields.filter(field => !agent[field]);
            if (missing.length > 0) {
                alert(`Заполните обязательные поля перед ${modeLabel}: ${missing.join(', ')}`);
                return false;
            }
            return true;
        }

        function buildAgentConfigSnippetFromForm() {
            const agent = collectAgentFormData();
            if (!validateAgentFormData(agent, 'генерацией')) {
                return '';
            }

            return JSON.stringify(agent, null, 4)
                .split('\n')
                .map(line => `    ${line}`)
                .join('\n')
                .replace(/^\s*\{/, '    {\n        ...window.VENERA_AGENT_TEMPLATE,')
                .replace(/\n\s*\}$/, '\n    }')
                .replace(/"([^"]+)":/g, '$1:');
        }

        async function copyAgentConfigSnippet() {
            const snippetField = document.getElementById('agent-config-snippet');
            if (!snippetField || !snippetField.value.trim()) {
                alert('Сначала сгенерируйте блок конфигурации риелтора.');
                return;
            }

            try {
                await navigator.clipboard.writeText(snippetField.value);
                alert('Блок риелтора скопирован в буфер обмена.');
            } catch (error) {
                snippetField.select();
                document.execCommand('copy');
                alert('Блок риелтора скопирован в буфер обмена.');
            }
        }
        
        // Agent edit modal functions
        function openAgentEditModal(index = null) {
            const modal = document.getElementById('agent-edit-modal');
            const title = document.getElementById('agent-modal-title');
            const statusEl = document.getElementById('agent-edit-status');

            if (statusEl) {
                statusEl.classList.add('hidden');
                statusEl.textContent = '';
            }
            
            if (index !== null) {
                // Edit existing agent
                title.textContent = 'Изменить риелтора';
                const agent = agents[index];
                
                document.getElementById('agent-id').value = agent.id || '';
                document.getElementById('agent-name').value = agent.name || '';
                document.getElementById('agent-position').value = agent.position || '';
                document.getElementById('agent-phone').value = agent.phone || '';
                document.getElementById('agent-email').value = agent.email || '';
                document.getElementById('agent-whatsapp').value = agent.whatsapp || '';
                document.getElementById('agent-telegram').value = agent.telegram || '';
                document.getElementById('agent-viber').value = agent.viber || '';
                document.getElementById('agent-photo').value = agent.photo || '';
                document.getElementById('agent-rieltor-id').value = agent.rieltor_id || '';
            } else {
                // Add new agent
                title.textContent = 'Добавить риелтора';
                document.getElementById('agent-edit-form').reset();
                document.getElementById('agent-id').value = '';
            }
            
            modal.classList.remove('hidden');
        }
        
        function closeAgentEditModal() {
            const snippetField = document.getElementById('agent-config-snippet');
            const statusEl = document.getElementById('agent-edit-status');
            if (snippetField) {
                snippetField.value = '';
            }
            if (statusEl) {
                statusEl.classList.add('hidden');
                statusEl.textContent = '';
            }
            document.getElementById('agent-edit-modal').classList.add('hidden');
        }
        
        // Save property - реально обновляет карточку в каталоге или добавляет новую
        function saveProperty(e) {
            e.preventDefault();
            const cardId = document.getElementById('property-id').value.trim();
            const isNew = cardId === '';

            const collected = collectPropertyFormData();
            const formProperty = collected;
            if (!validatePropertyFormData(formProperty, isNew ? 'добавлением' : 'сохранением')) {
                return false;
            }

            const normalized = validateAndNormalizeConfiguredProperty(formProperty, 0);
            if (!normalized) {
                alert('Не удалось обработать данные объекта. Проверьте поля.');
                return false;
            }

            const propertiesGrid = document.getElementById('properties-grid');

            if (isNew) {
                const existingIds = new Set(Array.from(document.querySelectorAll('.property-card')).map(c => c.dataset.id));
                const appendResult = appendPropertyCardToGrid(normalized, propertiesGrid, existingIds, getCurrentMaxPropertyIdNumber());
                if (appendResult.added && appendResult.card) {
                    appendResult.card.classList.add('visible');
                    propertyCounter = getCurrentMaxPropertyIdNumber();
                    const detailsBtn = appendResult.card.querySelector('.view-details-btn');
                    if (detailsBtn) {
                        detailsBtn.addEventListener('click', function(ev) {
                            ev.preventDefault();
                            openPropertyOverlay(this);
                        });
                    }
                }
            } else {
                const card = document.querySelector(`.property-card[data-id="${cardId}"]`);
                if (card) {
                    const typeMeta = getPropertyTypeMeta(normalized.type);
                    const priceValue = normalized.price;
                    const image = normalized.mainPhoto || card.querySelector('img').src;

                    card.dataset.city = normalized.city;
                    card.dataset.district = normalized.district;
                    card.dataset.type = typeMeta.dataType;
                    card.dataset.listingMode = normalizeListingMode(normalized.listingMode, normalized.type);
                    card.dataset.coords = normalized.coords;
                    card.dataset.rieltorId = normalized.rieltorId;
                    card.dataset.price = priceValue;
                    card.dataset.area = normalized.area;
                    card.dataset.rooms = normalized.rooms;
                    card.dataset.floors = normalized.floors;
                    card.dataset.condition = normalized.condition;
                    card.dataset.bathroom = normalized.bathroom;
                    card.dataset.balcony = normalized.balcony;
                    card.dataset.fullAddress = normalized.fullAddress;
                    card.dataset.description = normalized.description;
                    card.dataset.mainPhoto = image;
                    card.dataset.photos = serializePhotosForDataAttr(normalized.photos);

                    const cardImg = card.querySelector('img');
                    if (cardImg) { cardImg.src = image; cardImg.alt = normalized.title; }
                    const typeTag = card.querySelector('.type-tag');
                    if (typeTag) { typeTag.textContent = typeMeta.label; typeTag.className = `type-tag ${typeMeta.tagClass}`; }
                    const priceTag = card.querySelector('.price-tag');
                    if (priceTag) priceTag.textContent = formatPriceValue(priceValue);
                    const titleEl = card.querySelector('h3');
                    if (titleEl) titleEl.textContent = normalized.title;
                    const addressEl = card.querySelector('.flex.items-center span');
                    if (addressEl) addressEl.textContent = normalized.fullAddress;
                    const oldVisibleClass = card.classList.contains('visible');
                    const replacement = createPropertyCardElement(normalized, card.dataset.id);
                    if (replacement) {
                        replacement.dataset.index = card.dataset.index || '';
                        if (oldVisibleClass) replacement.classList.add('visible');
                        card.replaceWith(replacement);
                    }
                    const updatedCard = replacement || card;
                    const viewBtn = updatedCard.querySelector('.view-details-btn');
                    if (viewBtn) viewBtn.dataset.price = priceValue;
                }
            }

            if (typeof updateAgentPhotos === 'function') updateAgentPhotos();
            if (typeof countAgentProperties === 'function') countAgentProperties();
            if (typeof renderAgents === 'function') renderAgents();
            if (typeof renderPropertiesList === 'function') renderPropertiesList();
            if (typeof updatePropertiesForSaleCount === 'function') updatePropertiesForSaleCount();
            if (typeof updateListingModeBadgesVisibility === 'function') updateListingModeBadgesVisibility();
            registerCityDistrict(normalized.city, normalized.district);
            syncCityDistrictCatalog();
            populateSearchCitySelect();
            populateCitySelect();

            if (mainMap) {
                mainMap.remove();
                mainMap = null;
                propertyMarkers.length = 0;
                initMainMap();
            }

            closePropertyEditModal();
            alert(isNew ? 'Объект добавлен в каталог.' : 'Объект обновлён.');
            return false;
        }
        
        // Save agent
        function saveAgent(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const index = document.getElementById('agent-id').value;
            const isNew = index === '';
            
            // Create agent data object
            const agentData = {
                id: isNew ? `A${++agentCounter}` : document.getElementById('agent-id').value,
                name: document.getElementById('agent-name').value,
                position: document.getElementById('agent-position').value,
                phone: document.getElementById('agent-phone').value,
                email: document.getElementById('agent-email').value,
                whatsapp: document.getElementById('agent-whatsapp').value,
                telegram: document.getElementById('agent-telegram').value,
                viber: document.getElementById('agent-viber').value,
                photo: document.getElementById('agent-photo').value,
                rieltor_id: document.getElementById('agent-rieltor-id').value
            };
            
            // Update realtor dropdown in property edit form
            populateRealtorDropdown();
            
            if (isNew) {
                // Add new agent (in a real app, this would update the database)
                console.log('Adding new agent:', agentData);
                alert('Новый риелтор добавлен! В реальном приложении данные были бы сохранены в базе данных.');
            } else {
                // Update existing agent (in a real app, this would update the database)
                console.log('Updating agent at index:', index, agentData);
                alert('Данные риелтора обновлены! В реальном приложении данные были бы сохранены в базе данных.');
            }
            
            closeAgentEditModal();
            return false;
        }
        
        // Delete property - реально удаляет карточку из каталога
        function deleteProperty(index) {
            if (!confirm('Вы уверены, что хотите удалить этот объект?')) return;
            const card = document.querySelectorAll('.property-card')[index];
            if (!card) return;
            card.remove();
            propertyCounter = getCurrentMaxPropertyIdNumber();
            if (mainMap) {
                mainMap.remove();
                mainMap = null;
                propertyMarkers.length = 0;
                initMainMap();
            }
            if (typeof countAgentProperties === 'function') countAgentProperties();
            if (typeof renderAgents === 'function') renderAgents();
            if (typeof renderPropertiesList === 'function') renderPropertiesList();
            if (typeof updatePropertiesForSaleCount === 'function') updatePropertiesForSaleCount();
            if (typeof updateListingModeBadgesVisibility === 'function') updateListingModeBadgesVisibility();
        }

        // Delete agent - реально удаляет риелтора из списка
        function deleteAgent(index) {
            if (!confirm('Вы уверены, что хотите удалить этого риелтора?')) return;
            agents.splice(index, 1);
            agentCounter = getCurrentMaxAgentIdNumber(agents);
            if (typeof countAgentProperties === 'function') countAgentProperties();
            if (typeof renderAgents === 'function') renderAgents();
            if (typeof renderAgentsList === 'function') renderAgentsList();
        }

        function normalizeAgentConfig(agent, index) {
            if (!agent || typeof agent !== 'object') {
                console.warn(`Конфиг риелтора #${index + 1} пропущен: ожидался объект.`);
                return null;
            }

            const rieltorId = String(agent.rieltor_id || '').trim();
            const name = String(agent.name || '').trim();
            const position = String(agent.position || '').trim();

            if (!rieltorId || !name || !position) {
                console.warn(`Конфиг риелтора #${index + 1} пропущен: обязательны rieltor_id, name, position.`);
                return null;
            }

            return {
                ...agent,
                id: String(agent.id || rieltorId).trim(),
                rieltor_id: rieltorId,
                name,
                position,
                phone: String(agent.phone || '').trim(),
                email: String(agent.email || '').trim(),
                whatsapp: String(agent.whatsapp || '').trim(),
                telegram: String(agent.telegram || '').trim(),
                viber: String(agent.viber || '').trim(),
                photo: String(agent.photo || '').trim(),
                properties_count: toPositiveNumber(agent.properties_count, 0)
            };
        }

        function getCurrentMaxAgentIdNumber(agentList) {
            return agentList.reduce((maxId, agent) => {
                const numeric = parseInt(String(agent.rieltor_id).replace(/\D/g, ''), 10);
                if (!Number.isNaN(numeric) && numeric > maxId) {
                    return numeric;
                }
                return maxId;
            }, 0);
        }
        
        // Counters for unique IDs
        let agents = Array.isArray(window.VENERA_AGENTS_CONFIG)
            ? window.VENERA_AGENTS_CONFIG
                .map((agent, index) => normalizeAgentConfig(agent, index))
                .filter(Boolean)
            : [];
        let agentCounter = getCurrentMaxAgentIdNumber(agents);
        let propertyCounter = getCurrentMaxPropertyIdNumber(); // Auto-detect current max property id

        // City districts data
        const cityDistricts = {
            'Кишинёв': ['Все районы', 'Центр', 'Ботаника', 'Рышкановка', 'Чеканы', 'Телецентр', 'Буюканы', 'Скулянка', 'Бубуечь', 'Дурлешты', 'Ватра', 'Друмул Таберей', 'Ставчены', 'Трушены'],
            'Бельцы': ['Все районы', 'Центр', 'Северный', 'Южный', 'Западный', 'Восточный'],
            'Тирасполь': ['Все районы', 'Центр', 'Микрорайон', 'Кировский', 'Октябрьский'],
            'Бендеры': ['Все районы', 'Центр', 'Ленинский', 'Фрунзенский'],
            'Рыбница': ['Все районы', 'Центр', 'Северный', 'Южный'],
            'Кагул': ['Все районы', 'Центр', 'Северный', 'Южный'],
            'Унгень': ['Все районы', 'Центр', 'Северный', 'Южный'],
            'Сороки': ['Все районы', 'Центр', 'Северный', 'Южный'],
            'Оргеев': ['Все районы', 'Центр', 'Северный', 'Южный'],
            'Комрат': ['Все районы', 'Центр', 'Северный', 'Южный'],
            'Чадыр-Лунга': ['Все районы', 'Центр', 'Северный', 'Южный'],
            'Страшены': ['Все районы', 'Центр'],
            'Дрокия': ['Все районы', 'Центр'],
            'Единцы': ['Все районы', 'Центр'],
            'Флорешты': ['Все районы', 'Центр'],
            'Резина': ['Все районы', 'Центр'],
            'Глодяны': ['Все районы', 'Центр'],
            'Кантемир': ['Все районы', 'Центр'],
            'Леова': ['Все районы', 'Центр'],
            'Ниспорены': ['Все районы', 'Центр'],
            'Окница': ['Все районы', 'Центр'],
            'Вадул-луй-Водэ': ['Все районы', 'Центр']
        };

        // Map initialization
        let mainMap, propertyMap;
        const propertyMarkers = [];
        const markerGroups = {}; // To track markers by coordinates
        
        // Property coordinates will be read from data-coords attribute

        function initMainMap() {
            mainMap = L.map('main-map').setView([47.0245, 28.8323], 13);
            
            L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
                attribution: '',
                detectRetina: true
            }).addTo(mainMap);

            // Custom icons for different property types
            const iconPremium = L.divIcon({
                className: 'custom-icon premium-icon',
                html: '<i class="fas fa-crown"></i>',
                iconSize: [30, 30]
            });

            const iconSecondary = L.divIcon({
                className: 'custom-icon secondary-icon',
                html: '<i class="fas fa-home"></i>',
                iconSize: [30, 30]
            });

            const iconNewbuilding = L.divIcon({
                className: 'custom-icon newbuilding-icon',
                html: '<i class="fas fa-building"></i>',
                iconSize: [30, 30]
            });

            const iconCommercial = L.divIcon({
                className: 'custom-icon commercial-icon',
                html: '<i class="fas fa-briefcase"></i>',
                iconSize: [30, 30]
            });

            const iconRental = L.divIcon({
                className: 'custom-icon rental-icon',
                html: '<i class="fas fa-key"></i>',
                iconSize: [30, 30]
            });

            const iconGarage = L.divIcon({
                className: 'custom-icon garage-icon',
                html: '<i class="fas fa-warehouse"></i>',
                iconSize: [30, 30]
            });

            const iconParking = L.divIcon({
                className: 'custom-icon parking-icon',
                html: '<i class="fas fa-parking"></i>',
                iconSize: [30, 30]
            });

            const iconStorage = L.divIcon({
                className: 'custom-icon storage-icon',
                html: '<i class="fas fa-box-open"></i>',
                iconSize: [30, 30]
            });

            const iconHouse = L.divIcon({
                className: 'custom-icon house-icon',
                html: '<i class="fas fa-home"></i>',
                iconSize: [30, 30]
            });

            const iconLand = L.divIcon({
                className: 'custom-icon land-icon',
                html: '<i class="fas fa-tree"></i>',
                iconSize: [30, 30]
            });

            // Collect all properties with their coordinates
            const properties = [];
            document.querySelectorAll('.property-card').forEach((card, index) => {
                card.dataset.index = index;
                const coords = card.dataset.coords;
                if (!coords) {
                    console.warn('Property card missing coordinates:', card.querySelector('h3').textContent);
                    return;
                }
                
                const [latStr, lngStr] = coords.split(',');
                const lat = parseFloat(latStr.trim());
                const lng = parseFloat(lngStr.trim());
                
                if (isNaN(lat) || isNaN(lng)) {
                    console.error('Invalid coordinates for property:', card.querySelector('h3').textContent, coords);
                    return;
                }
                
                properties.push({
                    card: card,
                    lat: lat,
                    lng: lng,
                    index: index,
                    listingMode: normalizeListingMode(card.dataset.listingMode, card.dataset.type)
                });
            });

            // Group properties by coordinates (proximity ~11m) regardless of listing mode
            const groupedProperties = {};
            properties.forEach(prop => {
                const keyLat = Math.round(prop.lat * 10000) / 10000;
                const keyLng = Math.round(prop.lng * 10000) / 10000;
                const key = `${keyLat},${keyLng}`;
                if (!groupedProperties[key]) {
                    groupedProperties[key] = [];
                }
                groupedProperties[key].push(prop);
            });

            // Create markers for each group
            Object.keys(groupedProperties).forEach(key => {
                const group = groupedProperties[key];
                const firstProperty = group[0];
                const lat = firstProperty.lat;
                const lng = firstProperty.lng;
                const card = firstProperty.card;
                
                const title = card.querySelector('h3').textContent;
                const typeTag = card.querySelector('.type-tag');
                const type = typeTag ? typeTag.textContent.trim() : '';
                const groupListingModes = [...new Set(group.map(p => p.listingMode))];

                let icon;
                switch(type.toLowerCase()) {
                    case 'премиум':
                        icon = iconPremium;
                        break;
                    case 'вторичка':
                        icon = iconSecondary;
                        break;
                    case 'новострой':
                        icon = iconNewbuilding;
                        break;
                    case 'коммерческая':
                        icon = iconCommercial;
                        break;
                    case 'гараж':
                        icon = iconGarage;
                        break;
                    case 'парковка':
                        icon = iconParking;
                        break;
                    case 'кладовка':
                        icon = iconStorage;
                        break;
                    case 'дом':
                        icon = iconHouse;
                        break;
                    case 'участок':
                        icon = iconLand;
                        break;
                    default:
                        icon = iconPremium;
                }

                const baseIconClass = icon.options.className;
                const baseIconHtml = icon.options.html;

                // Add count badge for grouped markers (rent chip only in popup, not on marker)
                if (group.length > 1) {
                    const badgeHtml = `<div style="position:relative;display:inline-block;">
                        ${baseIconHtml}
                        <div style="position:absolute;top:-8px;right:-8px;background:#ff0000;color:white;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;border:2px solid white;">${group.length}</div>
                    </div>`;
                    icon = L.divIcon({
                        className: baseIconClass,
                        html: badgeHtml,
                        iconSize: [30, 30]
                    });
                }

                // Create marker
                const marker = L.marker([lat, lng], {
                    icon: icon,
                    title: title
                }).addTo(mainMap);
                
                // Bind popup with list of properties if multiple, or single property if one
                if (group.length > 1) {
                    let popupContent = `<div class="map-popup-list" style="max-height: 400px; overflow-y: auto; padding: 5px;">`;
                    
                    group.forEach(prop => {
                        const propertyCard = prop.card;
                        const propertyImage = propertyCard.querySelector('img').src;
                        const propertyTitle = propertyCard.querySelector('h3').textContent;
                        const propertyAddress = propertyCard.querySelector('.flex.items-center span').textContent;
                        const propertyPrice = propertyCard.querySelector('.price-tag').textContent;
                        const propertyType = propertyCard.querySelector('.type-tag').textContent;
                        const propertyListingMode = normalizeListingMode(propertyCard.dataset.listingMode, propertyCard.dataset.type);
                        const rentBadgeHtml = propertyListingMode === 'rent'
                            ? '<div class="map-popup-rent-badge">Аренда</div>'
                            : '';
                        const propertyFeatures = Array.from(propertyCard.querySelectorAll('.grid-cols-3 > div')).map(feature => ({
                            label: feature.querySelector('.text-sm').textContent,
                            value: feature.querySelector('.font-semibold').textContent
                        }));
                        
                        popupContent += `
                        <div class="map-popup-mini" style="width: 250px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <div class="relative">
                                <img src="${propertyImage}" alt="${propertyTitle}" class="w-full h-32 object-cover rounded-t-lg">
                                <div style="position:absolute;top:8px;left:8px;display:flex;flex-direction:column;gap:3px;z-index:3;">
                                    <div class="map-popup-type-chip ${propertyType === 'ПРЕМИУМ' ? 'popup-chip-premium' : 'popup-chip-default'}">${propertyType}</div>
                                    ${rentBadgeHtml}
                                </div>
                                <div class="absolute top-2 right-2 bg-yellow-500 text-black font-bold text-xs px-2 py-1 rounded-full">
                                    ${propertyPrice}
                                </div>
                            </div>
                            <div class="p-3">
                                <h4 class="font-bold text-sm mb-1 truncate">${propertyTitle}</h4>
                                <p class="text-gray-600 text-xs mb-2 truncate">
                                    <i class="fas fa-map-marker-alt text-yellow-500 mr-1"></i>
                                    ${propertyAddress}
                                </p>
                                <div class="grid grid-cols-3 gap-1 mb-3">
                                    ${propertyFeatures.slice(0, 3).map(feature => `
                                        <div class="text-center">
                                            <div class="text-xs text-gray-500">${feature.label}</div>
                                            <div class="text-sm font-semibold">${feature.value}</div>
                                        </div>
                                    `).join('')}
                                </div>
                                <button class="w-full bg-yellow-500 text-black text-xs font-bold py-2 px-3 rounded hover:bg-yellow-600 transition"
                                        onclick="openPropertyOverlay(${prop.index})">
                                    Подробнее
                                </button>
                            </div>
                        </div>`;
                    });
                    
                    popupContent += `</div>`;
                    
                    marker.bindPopup(popupContent, {
                        maxWidth: 270,
                        className: 'map-popup-list-container',
                        closeButton: true
                    });
                } else {
                    // Single property popup (existing code)
                    const propertyCard = card;
                    const propertyImage = propertyCard.querySelector('img').src;
                    const propertyTitle = propertyCard.querySelector('h3').textContent;
                    const propertyAddress = propertyCard.querySelector('.flex.items-center span').textContent;
                    const propertyPrice = propertyCard.querySelector('.price-tag').textContent;
                    const propertyType = propertyCard.querySelector('.type-tag').textContent;
                    const propertyListingMode = normalizeListingMode(propertyCard.dataset.listingMode, propertyCard.dataset.type);
                    const rentBadgeHtml = propertyListingMode === 'rent'
                        ? '<div class="map-popup-rent-badge">Аренда</div>'
                        : '';
                    const propertyFeatures = Array.from(propertyCard.querySelectorAll('.grid-cols-3 > div')).map(feature => ({
                        label: feature.querySelector('.text-sm').textContent,
                        value: feature.querySelector('.font-semibold').textContent
                    }));
                    
                    const popupContent = `
                        <div class="map-popup-mini" style="width: 250px;">
                            <div class="relative">
                                <img src="${propertyImage}" alt="${propertyTitle}" class="w-full h-32 object-cover rounded-t-lg">
                                <div style="position:absolute;top:8px;left:8px;display:flex;flex-direction:column;gap:3px;z-index:3;">
                                    <div class="map-popup-type-chip ${propertyType === 'ПРЕМИУМ' ? 'popup-chip-premium' : 'popup-chip-default'}">${propertyType}</div>
                                    ${rentBadgeHtml}
                                </div>
                                <div class="absolute top-2 right-2 bg-yellow-500 text-black font-bold text-xs px-2 py-1 rounded-full">
                                    ${propertyPrice}
                                </div>
                            </div>
                            <div class="p-3">
                                <h4 class="font-bold text-sm mb-1 truncate">${propertyTitle}</h4>
                                <p class="text-gray-600 text-xs mb-2 truncate">
                                    <i class="fas fa-map-marker-alt text-yellow-500 mr-1"></i>
                                    ${propertyAddress}
                                </p>
                                <div class="grid grid-cols-3 gap-1 mb-3">
                                    ${propertyFeatures.slice(0, 3).map(feature => `
                                        <div class="text-center">
                                            <div class="text-xs text-gray-500">${feature.label}</div>
                                            <div class="text-sm font-semibold">${feature.value}</div>
                                        </div>
                                    `).join('')}
                                </div>
                                <button class="w-full bg-yellow-500 text-black text-xs font-bold py-2 px-3 rounded hover:bg-yellow-600 transition"
                                        onclick="openPropertyOverlay(${firstProperty.index})">
                                    Подробнее
                                </button>
                            </div>
                        </div>
                    `;
                    
                    marker.bindPopup(popupContent, {
                        maxWidth: 300,
                        minWidth: 200,
                        className: 'map-popup-mini-container',
                        closeButton: false,
                        offset: L.point(0, -20)
                    });
                }

                // Pre-extract display data for dynamic popup filtering by category
                marker.allProps = group.map(prop => {
                    const c = prop.card;
                    return {
                        index: prop.index,
                        listingMode: prop.listingMode,
                        image: c.querySelector('img').src,
                        title: c.querySelector('h3').textContent,
                        address: (c.querySelector('.flex.items-center span') || {}).textContent || '',
                        price: c.querySelector('.price-tag').textContent,
                        type: c.querySelector('.type-tag') ? c.querySelector('.type-tag').textContent : '',
                        features: Array.from(c.querySelectorAll('.grid-cols-3 > div')).map(f => ({
                            label: f.querySelector('.text-sm') ? f.querySelector('.text-sm').textContent : '',
                            value: f.querySelector('.font-semibold') ? f.querySelector('.font-semibold').textContent : ''
                        }))
                    };
                });
                marker.baseIconClass = baseIconClass;
                marker.baseIconHtml = baseIconHtml;
                marker.listingModes = groupListingModes;
                propertyMarkers.push(marker);
            });
        }

        function getMiniMapMarkerMeta(typeValue) {
            const normalized = String(typeValue || '').trim().toLowerCase();
            const map = {
                premium: { className: 'custom-icon premium-icon', html: '<i class="fas fa-crown"></i>' },
                'премиум': { className: 'custom-icon premium-icon', html: '<i class="fas fa-crown"></i>' },
                secondary: { className: 'custom-icon secondary-icon', html: '<i class="fas fa-home"></i>' },
                'вторичка': { className: 'custom-icon secondary-icon', html: '<i class="fas fa-home"></i>' },
                newbuilding: { className: 'custom-icon newbuilding-icon', html: '<i class="fas fa-building"></i>' },
                'новострой': { className: 'custom-icon newbuilding-icon', html: '<i class="fas fa-building"></i>' },
                commercial: { className: 'custom-icon commercial-icon', html: '<i class="fas fa-briefcase"></i>' },
                'коммерческая': { className: 'custom-icon commercial-icon', html: '<i class="fas fa-briefcase"></i>' },
                garage: { className: 'custom-icon garage-icon', html: '<i class="fas fa-warehouse"></i>' },
                'гараж': { className: 'custom-icon garage-icon', html: '<i class="fas fa-warehouse"></i>' },
                parking: { className: 'custom-icon parking-icon', html: '<i class="fas fa-parking"></i>' },
                'парковка': { className: 'custom-icon parking-icon', html: '<i class="fas fa-parking"></i>' },
                storage: { className: 'custom-icon storage-icon', html: '<i class="fas fa-box-open"></i>' },
                'кладовка': { className: 'custom-icon storage-icon', html: '<i class="fas fa-box-open"></i>' },
                house: { className: 'custom-icon house-icon', html: '<i class="fas fa-home"></i>' },
                'дом': { className: 'custom-icon house-icon', html: '<i class="fas fa-home"></i>' },
                land: { className: 'custom-icon land-icon', html: '<i class="fas fa-tree"></i>' },
                'участок': { className: 'custom-icon land-icon', html: '<i class="fas fa-tree"></i>' }
            };
            return map[normalized] || map.premium;
        }

        function createMiniMapMarkerIcon(typeValue, listingModeValue) {
            const markerMeta = getMiniMapMarkerMeta(typeValue);

            return L.divIcon({
                className: markerMeta.className,
                html: markerMeta.html,
                iconSize: [30, 30]
            });
        }

        function initPropertyMap(lat, lng, typeValue = 'premium', listingModeValue = 'sale') {
            // Remove existing map if it exists
            if (propertyMap) {
                propertyMap.remove();
                propertyMap = null;
            }

            // Create new map
            propertyMap = L.map('property-map', {
                zoomControl: false,
                attributionControl: false
            }).setView([lat, lng], 15);

            L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
                attribution: '',
                detectRetina: true
            }).addTo(propertyMap);

            const miniMapIcon = createMiniMapMarkerIcon(typeValue, listingModeValue);

            // Add marker
            L.marker([lat, lng], { icon: miniMapIcon }).addTo(propertyMap);

            // Force map to update its size
            setTimeout(() => {
                propertyMap.invalidateSize();
            }, 0);
        }

        function openFullscreenPropertyMap(lat, lng, typeValue = 'premium', listingModeValue = 'sale') {
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return;
            }

            const mapOverlay = document.getElementById('map-overlay');
            if (!mapOverlay) {
                return;
            }

            disableBodyScroll();
            mapOverlay.classList.add('active');

            if (window.overlayMap) {
                window.overlayMap.remove();
                window.overlayMap = null;
            }

            window.overlayMap = L.map('map-overlay-container', {
                zoomControl: true
            }).setView([lat, lng], 16);

            L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
                attribution: '',
                detectRetina: true
            }).addTo(window.overlayMap);

            const miniMapIcon = createMiniMapMarkerIcon(typeValue, listingModeValue);
            L.marker([lat, lng], { icon: miniMapIcon }).addTo(window.overlayMap);
        }

        // Function to update districts based on selected city
        function updateDistricts() {
            const citySelect = document.getElementById('city');
            const districtSelect = document.getElementById('district');
            const selectedCity = citySelect.value;
            
            // Clear current options
            districtSelect.innerHTML = '';
            
            // Add new options based on selected city
            if (selectedCity && cityDistricts[selectedCity]) {
                cityDistricts[selectedCity].forEach(district => {
                    const option = document.createElement('option');
                    option.value = district;
                    option.textContent = district;
                    districtSelect.appendChild(option);
                });
            } else {
                // Default option if city not found
                const option = document.createElement('option');
                option.value = 'Все районы';
                option.textContent = 'Все районы';
                districtSelect.appendChild(option);
            }
        }

        function isRentalType(typeValue) {
            const normalized = String(typeValue || '').toLowerCase().trim();
            return normalized === 'rental' || normalized === 'аренда';
        }

        function updateListingModeBadgesVisibility() {
            document.querySelectorAll('.property-card').forEach(card => {
                const mode = normalizeListingMode(card.dataset.listingMode, card.dataset.type);
                const shouldShowRentBadge = mode === 'rent';

                let badge = card.querySelector('.listing-mode-badge');
                if (!badge) {
                    const mediaWrap = card.querySelector('.relative');
                    if (!mediaWrap) return;
                    badge = document.createElement('div');
                    badge.className = 'listing-mode-badge hidden';
                    badge.textContent = 'Аренда';
                    mediaWrap.appendChild(badge);
                }

                badge.classList.toggle('hidden', !shouldShowRentBadge);
            });
        }

        function normalizeListingMode(modeValue, fallbackType) {
            const normalizedMode = String(modeValue || '').toLowerCase().trim();
            if (normalizedMode === 'rent' || normalizedMode === 'аренда') {
                return 'rent';
            }
            if (normalizedMode === 'sale' || normalizedMode === 'продажа') {
                return 'sale';
            }
            return isRentalType(fallbackType) ? 'rent' : 'sale';
        }

        function buildMarkerPopupContent(props) {
            if (props.length === 0) return '<div style="padding:8px;font-size:12px;color:#666;">Нет объектов</div>';
            if (props.length === 1) {
                const p = props[0];
                const rentBadge = p.listingMode === 'rent' ? '<div class="map-popup-rent-badge">Аренда</div>' : '';
                return `
                    <div class="map-popup-mini" style="width: 250px;">
                        <div class="relative">
                            <img src="${p.image}" alt="${p.title}" class="w-full h-32 object-cover rounded-t-lg">
                            <div style="position:absolute;top:8px;left:8px;display:flex;flex-direction:column;gap:3px;z-index:3;">
                                <div class="map-popup-type-chip ${p.type === 'ПРЕМИУМ' ? 'popup-chip-premium' : 'popup-chip-default'}">${p.type}</div>
                                ${rentBadge}
                            </div>
                            <div class="absolute top-2 right-2 bg-yellow-500 text-black font-bold text-xs px-2 py-1 rounded-full">
                                ${p.price}
                            </div>
                        </div>
                        <div class="p-3">
                            <h4 class="font-bold text-sm mb-1 truncate">${p.title}</h4>
                            <p class="text-gray-600 text-xs mb-2 truncate">
                                <i class="fas fa-map-marker-alt text-yellow-500 mr-1"></i>
                                ${p.address}
                            </p>
                            <div class="grid grid-cols-3 gap-1 mb-3">
                                ${p.features.slice(0, 3).map(f => `
                                    <div class="text-center">
                                        <div class="text-xs text-gray-500">${f.label}</div>
                                        <div class="text-sm font-semibold">${f.value}</div>
                                    </div>
                                `).join('')}
                            </div>
                            <button class="w-full bg-yellow-500 text-black text-xs font-bold py-2 px-3 rounded hover:bg-yellow-600 transition"
                                    onclick="openPropertyOverlay(${p.index})">
                                Подробнее
                            </button>
                        </div>
                    </div>
                `;
            }
            let html = `<div class="map-popup-list" style="max-height: 400px; overflow-y: auto; padding: 5px;">`;
            props.forEach(p => {
                const rentBadge = p.listingMode === 'rent' ? '<div class="map-popup-rent-badge">Аренда</div>' : '';
                html += `
                <div class="map-popup-mini" style="width: 250px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div class="relative">
                        <img src="${p.image}" alt="${p.title}" class="w-full h-32 object-cover rounded-t-lg">
                        <div style="position:absolute;top:8px;left:8px;display:flex;flex-direction:column;gap:3px;z-index:3;">
                            <div class="map-popup-type-chip ${p.type === 'ПРЕМИУМ' ? 'popup-chip-premium' : 'popup-chip-default'}">${p.type}</div>
                            ${rentBadge}
                        </div>
                        <div class="absolute top-2 right-2 bg-yellow-500 text-black font-bold text-xs px-2 py-1 rounded-full">
                            ${p.price}
                        </div>
                    </div>
                    <div class="p-3">
                        <h4 class="font-bold text-sm mb-1 truncate">${p.title}</h4>
                        <p class="text-gray-600 text-xs mb-2 truncate">
                            <i class="fas fa-map-marker-alt text-yellow-500 mr-1"></i>
                            ${p.address}
                        </p>
                        <div class="grid grid-cols-3 gap-1 mb-3">
                            ${p.features.slice(0, 3).map(f => `
                                <div class="text-center">
                                    <div class="text-xs text-gray-500">${f.label}</div>
                                    <div class="text-sm font-semibold">${f.value}</div>
                                </div>
                            `).join('')}
                        </div>
                        <button class="w-full bg-yellow-500 text-black text-xs font-bold py-2 px-3 rounded hover:bg-yellow-600 transition"
                                onclick="openPropertyOverlay(${p.index})">
                            Подробнее
                        </button>
                    </div>
                </div>`;
            });
            html += `</div>`;
            return html;
        }

        function bindMarkerPopup(marker, props) {
            const content = buildMarkerPopupContent(props);
            if (props.length <= 1) {
                marker.bindPopup(content, { maxWidth: 300, minWidth: 200, className: 'map-popup-mini-container', closeButton: false, offset: L.point(0, -20) });
            } else {
                marker.bindPopup(content, { maxWidth: 270, className: 'map-popup-list-container', closeButton: true });
            }
        }

        function filterMapMarkers() {
            if (!mainMap) return;
            const listingCategory = (document.getElementById('listing-category') || {}).value || 'all';
            propertyMarkers.forEach(marker => {
                const allProps = marker.allProps || [];
                const filtered = listingCategory === 'all'
                    ? allProps
                    : allProps.filter(p => p.listingMode === listingCategory);
                const shouldShow = filtered.length > 0;
                if (shouldShow) {
                    const markerBaseClass = marker.baseIconClass || 'custom-icon premium-icon';
                    const markerBaseHtml = marker.baseIconHtml || '<i class="fas fa-crown"></i>';

                    if (filtered.length > 1) {
                        const badgeHtml = `<div style="position:relative;display:inline-block;">
                            ${markerBaseHtml}
                            <div style="position:absolute;top:-8px;right:-8px;background:#ff0000;color:white;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;border:2px solid white;">${filtered.length}</div>
                        </div>`;
                        marker.setIcon(L.divIcon({
                            className: markerBaseClass,
                            html: badgeHtml,
                            iconSize: [30, 30]
                        }));
                    } else {
                        marker.setIcon(L.divIcon({
                            className: markerBaseClass,
                            html: markerBaseHtml,
                            iconSize: [30, 30]
                        }));
                    }

                    if (!mainMap.hasLayer(marker)) marker.addTo(mainMap);
                    bindMarkerPopup(marker, filtered);
                } else {
                    if (mainMap.hasLayer(marker)) mainMap.removeLayer(marker);
                }
            });
        }

        function getInputValueByIds(ids) {
            for (const id of ids) {
                const element = document.getElementById(id);
                if (!element) continue;
                const value = String(element.value || '').trim();
                if (value) return value;
            }
            return '';
        }

        function getNumericMinByIds(ids) {
            const raw = getInputValueByIds(ids);
            if (!raw) return 0;
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        function getNumericMaxByIds(ids) {
            const raw = getInputValueByIds(ids);
            if (!raw) return Infinity;
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : Infinity;
        }

        function buildAdvancedSearchToggleContent(expanded) {
            const label = expanded ? 'Закрыть расширенный поиск' : 'Расширенный поиск';
            const icon = expanded ? 'fa-chevron-up' : 'fa-sliders-h';
            return `<i class="fas ${icon} mr-2"></i>${label}`;
        }

        function setAdvancedSearchExpanded(expanded) {
            const panel = document.getElementById('advanced-search-panel');
            if (!panel) return;

            panel.classList.toggle('is-open', !!expanded);

            ['advanced-search-toggle', 'advanced-search-toggle-desktop', 'advanced-search-toggle-mobile'].forEach(buttonId => {
                const button = document.getElementById(buttonId);
                if (!button) return;
                button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                button.innerHTML = buildAdvancedSearchToggleContent(expanded);
            });
        }

        function toggleAdvancedSearch() {
            const panel = document.getElementById('advanced-search-panel');
            if (!panel) return;
            setAdvancedSearchExpanded(!panel.classList.contains('is-open'));
        }

        function bindMirroredInputs(inputIdA, inputIdB) {
            const inputA = document.getElementById(inputIdA);
            const inputB = document.getElementById(inputIdB);
            if (!inputA || !inputB) return;

            inputA.addEventListener('input', function() {
                inputB.value = inputA.value;
            });

            inputB.addEventListener('input', function() {
                inputA.value = inputB.value;
            });
        }

        function applyPropertyFilters(options = {}) {
            const {
                scrollToResults = false,
                showNoMatchesAlert = true
            } = options;

            const city = document.getElementById('city').value;
            const district = document.getElementById('district').value;
            const propertyType = document.getElementById('search-property-type').value;
            const listingCategory = (document.getElementById('listing-category') || {}).value || 'all';
            const minPrice = parseInt(document.getElementById('min-price').value, 10) || 0;
            const maxPrice = parseInt(document.getElementById('max-price').value, 10) || Infinity;
            const minArea = getNumericMinByIds(['min-area', 'min-area-advanced']);
            const maxArea = getNumericMaxByIds(['max-area', 'max-area-advanced']);
            const minRooms = getNumericMinByIds(['min-rooms']);
            const maxRooms = getNumericMaxByIds(['max-rooms']);
            const minLand = getNumericMinByIds(['min-land']);
            const maxLand = getNumericMaxByIds(['max-land']);
            const minParking = getNumericMinByIds(['min-parking']);
            const maxParking = getNumericMaxByIds(['max-parking']);
            const floorsQuery = getInputValueByIds(['floors-query']).toLowerCase();
            const conditionQuery = getInputValueByIds(['search-condition']).toLowerCase();
            const bathroomQuery = getInputValueByIds(['search-bathroom-query']).toLowerCase();
            const balconyQuery = getInputValueByIds(['search-balcony-query']).toLowerCase();
            const addressQuery = getInputValueByIds(['search-address-query']).toLowerCase();

            const propertyCards = document.querySelectorAll('.property-card');
            let hasMatches = false;

            const isMobile = window.innerWidth < 768;
            const itemsPerPage = isMobile ? 5 : 6;
            visibleCount = 0;

            let matchingCount = 0;
            const matchingCards = [];

            propertyCards.forEach(card => {
                const cardCity = card.dataset.city || '';
                const cardDistrict = card.dataset.district || '';
                const cardPrice = parseInt(card.dataset.price, 10) || 0;
                const cardArea = parseInt(card.dataset.area, 10) || 0;
                const cardRooms = parseInt(card.dataset.rooms, 10) || 0;
                const cardLand = parseInt(card.dataset.land, 10) || 0;
                const cardParking = parseInt(card.dataset.parking, 10) || 0;
                const cardFloors = String(card.dataset.floors || '').toLowerCase();
                const cardCondition = String(card.dataset.condition || '').toLowerCase();
                const cardBathroom = String(card.dataset.bathroom || '').toLowerCase();
                const cardBalcony = String(card.dataset.balcony || '').toLowerCase();
                const cardFullAddress = String(card.dataset.fullAddress || '').toLowerCase();
                const cardType = card.dataset.type || '';
                const cardListingCategory = normalizeListingMode(card.dataset.listingMode, cardType);

                const cityMatch = city === 'Все города' || city === 'Все' || !city ||
                    city.toLowerCase() === cardCity.toLowerCase();
                const districtMatch = district === 'Все районы' || district === 'Все' || !district ||
                    district.toLowerCase() === cardDistrict.toLowerCase();
                const typeMatch = propertyType === 'Все типы' || propertyType === 'Все' || !propertyType ||
                    propertyType.toLowerCase() === cardType.toLowerCase() ||
                    (propertyType === 'Премиум' && cardType.toLowerCase() === 'premium') ||
                    (propertyType === 'Вторичка' && cardType.toLowerCase() === 'вторичка') ||
                    (propertyType === 'Новострой' && cardType.toLowerCase() === 'newbuilding') ||
                    (propertyType === 'Коммерческая' && cardType.toLowerCase() === 'commercial');
                const priceMatch = cardPrice >= minPrice && cardPrice <= maxPrice;
                const areaMatch = cardArea >= minArea && cardArea <= maxArea;
                const roomsMatch = cardRooms >= minRooms && cardRooms <= maxRooms;
                const landMatch = cardLand >= minLand && cardLand <= maxLand;
                const parkingMatch = cardParking >= minParking && cardParking <= maxParking;
                const floorsMatch = !floorsQuery || cardFloors.includes(floorsQuery);
                const conditionMatch = !conditionQuery || cardCondition === conditionQuery;
                const bathroomMatch = !bathroomQuery || cardBathroom.includes(bathroomQuery);
                const balconyMatch = !balconyQuery || cardBalcony.includes(balconyQuery);
                const addressMatch = !addressQuery || cardFullAddress.includes(addressQuery);
                const listingMatch = listingCategory === 'all' || listingCategory === cardListingCategory;

                if (
                    cityMatch &&
                    districtMatch &&
                    typeMatch &&
                    priceMatch &&
                    areaMatch &&
                    roomsMatch &&
                    landMatch &&
                    parkingMatch &&
                    floorsMatch &&
                    conditionMatch &&
                    bathroomMatch &&
                    balconyMatch &&
                    addressMatch &&
                    listingMatch
                ) {
                    matchingCards.push(card);
                    matchingCount += 1;
                    hasMatches = true;
                }

                card.classList.remove('visible');
            });

            const showCount = Math.min(itemsPerPage, matchingCount);
            for (let i = 0; i < showCount; i++) {
                matchingCards[i].classList.add('visible');
            }

            visibleCount = showCount;
            currentFilteredAgentId = null;
            filteredProperties = Array.from(matchingCards);

            if (matchingCount <= itemsPerPage) {
                loadMoreBtn.style.display = 'none';
                closeBtn.classList.add('hidden');
            } else {
                loadMoreBtn.style.display = 'inline-flex';
                closeBtn.classList.add('hidden');
            }

            updateListingModeBadgesVisibility();
            filterMapMarkers();

            if (!hasMatches && showNoMatchesAlert) {
                alert('По вашему запросу ничего не найдено. Попробуйте изменить параметры поиска.');
            } else if (hasMatches && scrollToResults) {
                document.getElementById('properties').scrollIntoView({ behavior: 'smooth' });
            }
        }

        function setListingMode(mode, options = {}) {
            const { applyFilters = true } = options;
            const listingCategory = document.getElementById('listing-category');
            const saleBtn = document.getElementById('listing-sale-btn');
            const allBtn = document.getElementById('listing-all-btn');
            const rentBtn = document.getElementById('listing-rent-btn');
            if (!listingCategory || !saleBtn || !allBtn || !rentBtn) return;

            const safeMode = mode === 'rent' || mode === 'sale' ? mode : 'all';
            listingCategory.value = safeMode;

            saleBtn.classList.toggle('active', safeMode === 'sale');
            allBtn.classList.toggle('active', safeMode === 'all');
            rentBtn.classList.toggle('active', safeMode === 'rent');
            saleBtn.setAttribute('aria-selected', safeMode === 'sale' ? 'true' : 'false');
            allBtn.setAttribute('aria-selected', safeMode === 'all' ? 'true' : 'false');
            rentBtn.setAttribute('aria-selected', safeMode === 'rent' ? 'true' : 'false');

            updateListingModeBadgesVisibility();
            filterMapMarkers();

            const searchForm = document.getElementById('search-form');
            if (applyFilters && searchForm) {
                applyPropertyFilters({ scrollToResults: false, showNoMatchesAlert: false });
            }
        }

        // Function to render agents with pagination
        let visibleAgents = [];
        let currentAgentPage = 0;
        const agentsPerPage = 4;

        function renderAgents() {
            const container = document.getElementById('agents-container');
            container.innerHTML = '';
            
            // Calculate agents to show
            const visibleCount = Math.min((currentAgentPage + 1) * agentsPerPage, agents.length);
            visibleAgents = agents.slice(0, visibleCount);
            
            // Render visible agents
            visibleAgents.forEach(agent => {
                const agentHtml = `
                <div class="glass-effect rounded-xl p-6 text-center transition duration-500 ease-in-out hover:shadow-lg">
                    <div class="agent-photo mx-auto mb-6 w-32 h-32 rounded-full overflow-hidden border-4 border-gray-700">
                        <img src="${agent.photo}" alt="${agent.name}" class="w-full h-full object-cover">
                    </div>
                    <h3 class="text-xl font-semibold mb-2">${agent.name}</h3>
                    <p class="text-gray-400 mb-4">${agent.position}</p>
                    <div class="gold-bg text-black font-bold px-3 py-1 rounded-full text-sm inline-block mb-4">
                        ${agent.properties_count} объектов
                    </div>
                    <div class="flex justify-center space-x-4 mb-4">
                        <a href="https://wa.me/${agent.phone.replace(/\D/g, '')}" class="social-icon text-gray-400 hover:text-green-500"><i class="fab fa-whatsapp text-xl"></i></a>
                        <a href="https://t.me/${agent.phone.replace(/\D/g, '')}" class="social-icon text-gray-400 hover:text-blue-500"><i class="fab fa-telegram text-xl"></i></a>
                        <a href="viber://chat?number=${agent.phone.replace(/\D/g, '')}" class="social-icon text-gray-400 hover:text-purple-500"><i class="fab fa-viber text-xl"></i></a>
                        <a href="tel:${agent.phone}" class="social-icon text-gray-400 hover:text-gold-500"><i class="fas fa-phone-alt text-xl"></i></a>
                    </div>
                    <button class="w-full gold-bg text-black font-bold py-2 px-4 rounded-lg btn-gold hover:bg-yellow-600 transition duration-300" 
                            onclick="filterByAgent(${agent.rieltor_id})">
                        Посмотреть объекты
                    </button>
                </div>
                `;
                container.insertAdjacentHTML('beforeend', agentHtml);
            });
            
            // Update buttons visibility
            const loadMoreBtn = document.getElementById('load-more-agents-btn');
            const closeBtn = document.getElementById('close-agents-btn');
            
            if (agents.length <= agentsPerPage) {
                loadMoreBtn.classList.add('hidden');
                closeBtn.classList.add('hidden');
                return;
            }

            if (visibleCount >= agents.length) {
                loadMoreBtn.classList.add('hidden');
            } else {
                loadMoreBtn.classList.remove('hidden');
            }

            // Show "Close" as soon as list is expanded beyond first page.
            if (currentAgentPage > 0) {
                closeBtn.classList.remove('hidden');
            } else {
                closeBtn.classList.add('hidden');
            }
        }

        function loadMoreAgents() {
            if ((currentAgentPage + 1) * agentsPerPage >= agents.length) {
                return;
            }

            currentAgentPage++;
            renderAgents();
            
            // Scroll to the last agent card smoothly
            const agentCards = document.querySelectorAll('#agents-container > div');
            if (agentCards.length > 0) {
                agentCards[agentCards.length - 1].scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            }
        }

        function closeAgents() {
            currentAgentPage = 0;
            renderAgents();
            document.getElementById('agents').scrollIntoView({ behavior: 'smooth' });
        }

        // Global variables for agent filtering
        let currentFilteredAgentId = null;
        let filteredProperties = [];

        // Function to filter properties by agent
        function filterByAgent(rieltorId) {
            currentFilteredAgentId = rieltorId;
            const propertyCards = document.querySelectorAll('.property-card');
            filteredProperties = [];
            
            // Collect matching properties
            propertyCards.forEach(card => {
                if (parseInt(card.dataset.rieltorId) === rieltorId) {
                    filteredProperties.push(card);
                }
            });
            
            if (filteredProperties.length > 0) {
                // Reset to initial visible count
                const initialCount = window.innerWidth < 768 ? 5 : 6;
                
                // Hide all properties first
                propertyCards.forEach(card => card.classList.remove('visible'));
                
                // Show initial batch
                for (let i = 0; i < Math.min(initialCount, filteredProperties.length); i++) {
                    filteredProperties[i].classList.add('visible');
                }
                
                // Update buttons
                if (filteredProperties.length > initialCount) {
                    loadMoreBtn.style.display = 'inline-flex';
                    closeBtn.classList.add('hidden');
                } else {
                    loadMoreBtn.style.display = 'none';
                    closeBtn.classList.add('hidden');
                }
                
                document.getElementById('properties').scrollIntoView({ behavior: 'smooth' });
            } else {
                alert('У этого риелтора пока нет объектов в базе.');
            }
        }

        // Function to count properties per agent
        function countAgentProperties() {
            agents.forEach(agent => {
                agent.properties_count = document.querySelectorAll(`.property-card[data-rieltor-id="${agent.rieltor_id}"]`).length;
            });
        }

        // Function to update agent photos on property cards
        function updateAgentPhotos() {
            document.querySelectorAll('.agent-photo').forEach(img => {
                const rieltorId = img.dataset.rieltorId;
                const agent = agents.find(a => a.rieltor_id == rieltorId);
                if (agent) {
                    img.src = agent.photo;
                    img.alt = agent.name;
                }
            });
        }

        // Initialize main map when page loads
        document.addEventListener('DOMContentLoaded', function() {
            trackVisitEvent();
            syncCityDistrictCatalog();
            populateSearchCitySelect();
            populateCitySelect();
            countAgentProperties();
            renderAgents();
            initMainMap();
            updateAgentPhotos();

            const saleModeBtn = document.getElementById('listing-sale-btn');
            const allModeBtn = document.getElementById('listing-all-btn');
            const rentModeBtn = document.getElementById('listing-rent-btn');
            const searchForm = document.getElementById('search-form');

            function bindListingModeButton(button, mode) {
                if (!button) return;

                button.addEventListener('click', function() {
                    setListingMode(mode);
                });

                button.addEventListener('pointerup', function(e) {
                    if (e.pointerType === 'touch') {
                        setListingMode(mode);
                    }
                });

                button.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setListingMode(mode);
                    }
                });
            }

            bindListingModeButton(saleModeBtn, 'sale');
            bindListingModeButton(allModeBtn, 'all');
            bindListingModeButton(rentModeBtn, 'rent');

            setListingMode('all', { applyFilters: false });

                // Advanced search toggle functionality
                const advancedSearchBtn = document.getElementById('advanced-search-btn');
                const advancedSearchPanel = document.getElementById('advanced-search-panel');
            
                if (advancedSearchBtn && advancedSearchPanel) {
                    advancedSearchBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        const isOpen = advancedSearchPanel.classList.contains('is-open');
                        advancedSearchPanel.classList.toggle('is-open', !isOpen);
                        advancedSearchBtn.setAttribute('aria-expanded', !isOpen);
                    });
                }
            
            // Set up city change event
            document.getElementById('city').addEventListener('change', updateDistricts);
            
            // Initialize districts for default city
            updateDistricts();
            
            // Show initial properties based on screen size
            const initialCount = window.innerWidth < 768 ? 5 : 6;
            document.querySelectorAll('.property-card').forEach((card, index) => {
                if (index < initialCount) {
                    card.classList.add('visible');
                }
            });
            visibleCount = initialCount;
            updateListingModeBadgesVisibility();
            
            // Add expand button to main map
            const expandBtn = document.createElement('button');
            expandBtn.className = 'map-expand-btn';
            expandBtn.innerHTML = '<i class="fas fa-expand"></i>';
            expandBtn.title = 'Развернуть карту';
            document.querySelector('.map-container').appendChild(expandBtn);
            
            // Expand map functionality
            expandBtn.addEventListener('click', function() {
                document.getElementById('map-overlay').classList.add('active');
                disableBodyScroll();

                if (window.overlayMap) {
                    window.overlayMap.remove();
                    window.overlayMap = null;
                }
                
                window.overlayMap = L.map('map-overlay-container', {
                    zoomControl: true
                }).setView(mainMap.getCenter(), mainMap.getZoom());
                
                L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
                    attribution: '',
                    detectRetina: true
                }).addTo(window.overlayMap);
                
                // Copy markers from main map to overlay
                propertyMarkers.forEach(marker => {
                    const listingCategory = (document.getElementById('listing-category') || {}).value || 'all';
                    const markerModes = Array.isArray(marker.listingModes) && marker.listingModes.length > 0
                        ? marker.listingModes
                        : ['sale'];
                    const shouldShow = listingCategory === 'all' || markerModes.includes(listingCategory);
                    if (!shouldShow) {
                        return;
                    }

                    const overlayMarker = L.marker(marker.getLatLng(), {
                        icon: marker.options.icon
                    }).addTo(window.overlayMap);
                    
                    // Copy popup content
                    if (marker._popup) {
                        overlayMarker.bindPopup(marker._popup._content, {
                            maxWidth: 300,
                            minWidth: 200,
                            className: 'map-popup-mini-container',
                            closeButton: false,
                            offset: L.point(0, -20)
                        });
                    }
                });
            });

            const propertyMapEl = document.getElementById('property-map');
            const propertyMapExpandBtn = document.getElementById('property-map-expand-btn');
            const openPropertyMapFullscreen = function() {
                if (!propertyMapEl || !propertyMapEl.dataset.coords) return;
                const [lat, lng] = propertyMapEl.dataset.coords.split(',').map(Number);
                openFullscreenPropertyMap(
                    lat,
                    lng,
                    propertyMapEl.dataset.markerType || 'premium',
                    propertyMapEl.dataset.listingMode || 'sale'
                );
            };

            if (propertyMapExpandBtn) {
                propertyMapExpandBtn.addEventListener('click', openPropertyMapFullscreen);
            }

            if (propertyMapEl) {
                propertyMapEl.addEventListener('dblclick', openPropertyMapFullscreen);
            }
            
            // Close overlay map
            document.getElementById('map-overlay-close').addEventListener('click', function() {
                document.getElementById('map-overlay').classList.remove('active');
                enableBodyScroll();
            });
        });

        // Property search functionality
        document.getElementById('search-form').addEventListener('submit', function(e) {
            e.preventDefault();
            if (window.VENERA_ANALYTICS && typeof window.VENERA_ANALYTICS.recordSearchAnalytics === 'function') {
                window.VENERA_ANALYTICS.recordSearchAnalytics({
                    city: document.getElementById('city') ? document.getElementById('city').value : 'Все города',
                    district: document.getElementById('district') ? document.getElementById('district').value : 'Все районы',
                    listingMode: document.getElementById('listing-category') ? document.getElementById('listing-category').value : 'all'
                });
            }
            applyPropertyFilters({ scrollToResults: true, showNoMatchesAlert: true });
            setAdvancedSearchExpanded(false);
        });

        // Mobile menu toggle
        document.getElementById('mobile-menu-button').addEventListener('click', function() {
            const menu = document.getElementById('mobile-menu');
            menu.classList.toggle('hidden');
        });

        // Property details overlay
        const viewDetailsButtons = document.querySelectorAll('.view-details-btn');
        
        // Admin panel event listeners
        document.addEventListener('click', function(e) {
            // Add property
            if (e.target.id === 'add-property') {
                openPropertyEditModal();
            }
            
            // Add agent
            if (e.target.id === 'add-agent') {
                openAgentEditModal();
            }
            
            // Edit property
            if (e.target.classList.contains('edit-property')) {
                const index = e.target.dataset.index;
                openPropertyEditModal(parseInt(index));
            }
            
            // Delete property
            if (e.target.classList.contains('delete-property')) {
                const index = e.target.dataset.index;
                deleteProperty(parseInt(index));
            }
            
            // Edit agent
            if (e.target.classList.contains('edit-agent')) {
                const index = e.target.dataset.index;
                openAgentEditModal(parseInt(index));
            }
            
            // Delete agent
            if (e.target.classList.contains('delete-agent')) {
                const index = e.target.dataset.index;
                deleteAgent(parseInt(index));
            }
            
            // Close modals
            if (e.target.id === 'close-property-modal' || e.target.id === 'cancel-property-edit') {
                closePropertyEditModal();
            }
            
            if (e.target.id === 'close-agent-modal' || e.target.id === 'cancel-agent-edit') {
                closeAgentEditModal();
            }
        });
        
        // Form submissions - отключены, используются новые из admin.js
        // document.getElementById('property-edit-form').addEventListener('submit', saveProperty);
        // document.getElementById('agent-edit-form').addEventListener('submit', saveAgent);

        const generateSnippetBtn = document.getElementById('generate-config-snippet');
        if (generateSnippetBtn) {
            generateSnippetBtn.addEventListener('click', function() {
                const snippetField = document.getElementById('property-config-snippet');
                const snippet = buildPropertyConfigSnippetFromForm();
                if (snippetField && snippet) {
                    snippetField.value = `${snippet},`;
                }
            });
        }

        const copySnippetBtn = document.getElementById('copy-config-snippet');
        if (copySnippetBtn) {
            copySnippetBtn.addEventListener('click', copyPropertyConfigSnippet);
        }

        const previewPropertyBtn = document.getElementById('preview-config-property');
        if (previewPropertyBtn) {
            previewPropertyBtn.addEventListener('click', previewPropertyFromForm);
        }

        const savePropertyDraftBtn = document.getElementById('save-property-draft');
        if (savePropertyDraftBtn) {
            savePropertyDraftBtn.addEventListener('click', savePropertyDraft);
        }

        const loadPropertyDraftBtn = document.getElementById('load-property-draft');
        if (loadPropertyDraftBtn) {
            loadPropertyDraftBtn.addEventListener('click', loadPropertyDraft);
        }

        const clearPropertyDraftBtn = document.getElementById('clear-property-draft');
        if (clearPropertyDraftBtn) {
            clearPropertyDraftBtn.addEventListener('click', clearPropertyDraft);
        }

        const propertyTypeSelect = document.getElementById('property-type');
        if (propertyTypeSelect) {
            propertyTypeSelect.addEventListener('change', syncPropertyConfigTemplateSelection);
        }

        const propertyLandInput = document.getElementById('property-land');
        if (propertyLandInput) {
            propertyLandInput.addEventListener('input', syncPropertyConfigTemplateSelection);
        }

        const generateAgentSnippetBtn = document.getElementById('generate-agent-config-snippet');
        if (generateAgentSnippetBtn) {
            generateAgentSnippetBtn.addEventListener('click', function() {
                const snippetField = document.getElementById('agent-config-snippet');
                const snippet = buildAgentConfigSnippetFromForm();
                if (snippetField && snippet) {
                    snippetField.value = `${snippet},`;
                }
            });
        }

        const copyAgentSnippetBtn = document.getElementById('copy-agent-config-snippet');
        if (copyAgentSnippetBtn) {
            copyAgentSnippetBtn.addEventListener('click', copyAgentConfigSnippet);
        }

        syncPropertyConfigTemplateSelection();
        
        // Close modals when clicking outside
        document.getElementById('property-edit-modal').addEventListener('click', function(e) {
            if (e.target === this) closePropertyEditModal();
        });
        
        document.getElementById('agent-edit-modal').addEventListener('click', function(e) {
            if (e.target === this) closeAgentEditModal();
        });
        const overlay = document.getElementById('property-overlay');
        const closeOverlay = document.querySelector('.close-overlay');

        function disableBodyScroll() {
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
        }

        function enableBodyScroll() {
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
        }

        function parsePropertyImages(propertyData, fallbackImage) {
            const images = [];
            const primaryImage = String(propertyData.mainPhoto || fallbackImage || '').trim();

            if (primaryImage) {
                images.push(primaryImage);
            }

            const extraImages = normalizePhotosValue(propertyData.photos);

            extraImages.forEach(image => {
                if (!images.includes(image)) {
                    images.push(image);
                }
            });

            if (images.length === 0 && fallbackImage) {
                images.push(fallbackImage);
            }

            return images;
        }

        function renderPropertyCarousel(images, title) {
            const carousel = document.querySelector('.property-carousel');
            const prevButton = carousel ? carousel.querySelector('.carousel-prev') : null;
            const thumbsContainer = document.getElementById('property-carousel-thumbs');

            if (!carousel || !prevButton) {
                return;
            }

            carousel.querySelectorAll('.carousel-item').forEach(item => item.remove());
            if (thumbsContainer) {
                thumbsContainer.innerHTML = '';
            }

            images.forEach((image, index) => {
                const slide = document.createElement('div');
                slide.className = `carousel-item${index === 0 ? ' active' : ''}`;
                slide.innerHTML = `<img src="${image}" alt="${title}" class="property-carousel-image w-full h-full object-cover rounded-tl-xl lg:rounded-bl-xl lg:rounded-tr-none" data-image-index="${index}">`;
                carousel.insertBefore(slide, prevButton);

                if (thumbsContainer) {
                    const thumb = document.createElement('button');
                    thumb.type = 'button';
                    thumb.className = `property-thumb${index === 0 ? ' active' : ''}`;
                    thumb.dataset.slideIndex = String(index);
                    thumb.setAttribute('aria-label', `Открыть фото ${index + 1}`);
                    thumb.innerHTML = `<img src="${image}" alt="${title} миниатюра ${index + 1}">`;
                    thumbsContainer.appendChild(thumb);
                }
            });

            currentPropertyImages = [...images];
            currentPropertySlide = 0;
            updatePropertyCarouselControls();
        }

        function updatePropertyCarouselControls() {
            const propertySlides = document.querySelectorAll('.property-carousel .carousel-item');
            const propertyThumbs = document.querySelectorAll('.property-thumb');
            const carouselCounter = document.getElementById('property-carousel-counter');
            const shouldHideArrows = propertySlides.length <= 1;

            if (propertyPrev) {
                propertyPrev.style.display = shouldHideArrows ? 'none' : 'flex';
            }

            if (propertyNext) {
                propertyNext.style.display = shouldHideArrows ? 'none' : 'flex';
            }

            propertyThumbs.forEach((thumb, index) => {
                thumb.classList.toggle('active', index === currentPropertySlide);
            });

            if (carouselCounter) {
                const total = propertySlides.length || 1;
                carouselCounter.textContent = `${currentPropertySlide + 1} / ${total}`;
            }
        }

        function updateLightboxControls() {
            const counter = document.getElementById('image-lightbox-counter');
            const hideNav = currentPropertyImages.length <= 1;

            if (counter) {
                const total = currentPropertyImages.length || 1;
                counter.textContent = `${currentLightboxIndex + 1} / ${total}`;
            }

            if (imageLightboxPrev) {
                imageLightboxPrev.style.display = hideNav ? 'none' : 'flex';
            }

            if (imageLightboxNext) {
                imageLightboxNext.style.display = hideNav ? 'none' : 'flex';
            }
        }

        function renderLightboxImage() {
            const lightbox = document.getElementById('image-lightbox');
            const image = document.getElementById('image-lightbox-content');

            if (!lightbox || !image || currentPropertyImages.length === 0) {
                return;
            }

            currentLightboxIndex = (currentLightboxIndex + currentPropertyImages.length) % currentPropertyImages.length;
            image.src = currentPropertyImages[currentLightboxIndex];
            image.alt = `Property image fullscreen ${currentLightboxIndex + 1}`;
            updateLightboxControls();
        }

        function openPropertyImageLightbox(src, altText, imageIndex) {
            const lightbox = document.getElementById('image-lightbox');
            if (!lightbox || !src) {
                return;
            }

            const matchedIndex = typeof imageIndex === 'number'
                ? imageIndex
                : currentPropertyImages.findIndex(item => item === src);

            currentLightboxIndex = matchedIndex >= 0 ? matchedIndex : 0;
            renderLightboxImage();
            lightbox.classList.remove('hidden');
        }

        function closePropertyImageLightbox() {
            const lightbox = document.getElementById('image-lightbox');
            const image = document.getElementById('image-lightbox-content');

            if (!lightbox || !image) {
                return;
            }

            lightbox.classList.add('hidden');
            image.src = '';
        }

        function showNextLightboxImage(step) {
            if (currentPropertyImages.length <= 1) {
                return;
            }

            currentLightboxIndex += step;
            renderLightboxImage();
        }

        function openPropertyOverlay(buttonOrIndex) {
            // Handle both button element and index number
            const button = typeof buttonOrIndex === 'number' 
                ? document.querySelectorAll('.view-details-btn')[buttonOrIndex]
                : buttonOrIndex;
            
            disableBodyScroll();
            const propertyCard = button.closest('.property-card');
            const propertyData = propertyCard.dataset;
            const agentImg = propertyCard.querySelector('.agent-badge img').src;
            const agentName = propertyCard.querySelector('.p-6 h3').textContent;
            const propertyImg = propertyCard.querySelector('img').src;
            const propertyImages = parsePropertyImages(propertyData, propertyImg);
            const propertyType = propertyCard.querySelector('.type-tag').textContent;
            const overlayRentBadge = document.getElementById('property-overlay-rent-badge');
            const isRentalListing = normalizeListingMode(propertyData.listingMode, propertyData.type) === 'rent';

            if (window.VENERA_ANALYTICS && typeof window.VENERA_ANALYTICS.recordPropertyViewAnalytics === 'function') {
                window.VENERA_ANALYTICS.recordPropertyViewAnalytics({
                    propertyId: propertyData.id || '',
                    rieltorId: propertyData.rieltorId || '',
                    agentName: agentName || '',
                    propertyTitle: propertyCard.querySelector('h3') ? propertyCard.querySelector('h3').textContent : ''
                });
            }

            if (overlayRentBadge) {
                overlayRentBadge.classList.toggle('hidden', !isRentalListing);
            }
            
            // Update overlay with property data
            document.querySelector('#property-overlay .p-8 h3').textContent = propertyCard.querySelector('h3').textContent;
            const price = button.dataset.price ? `€${parseInt(button.dataset.price).toLocaleString()}` : `€${parseInt(propertyData.price || '0').toLocaleString()}`;
            document.querySelector('#property-overlay .p-8 .gold-bg').textContent = price;
            // Update address in overlay
            const addressElement = document.getElementById('property-overlay-full-address');
            addressElement.textContent = propertyData.fullAddress || `${propertyData.city || ''}, ${propertyData.district || ''}, ${propertyData.address || ''}`.replace(/, , /g, ', ').replace(/^, |, $/g, '');
            
            // Update property features
            const overlayFeaturesContainer = document.getElementById('property-overlay-features');
            if (overlayFeaturesContainer) {
                const areaNum = Number(propertyData.area);
                const roomsNum = Number(propertyData.rooms);
                const floorsValue = String(propertyData.floors || '').trim();
                const conditionValue = String(propertyData.condition || '').trim();
                const bathroomValue = String(propertyData.bathroom || '').trim();
                const balconyValue = String(propertyData.balcony || '').trim();
                const landNum = Number(propertyData.land);
                const parkingNum = Number(propertyData.parking);
                const yearNum = Number(propertyData.year);

                const overlayFeatureItems = [];
                if (Number.isFinite(areaNum) && areaNum > 0) overlayFeatureItems.push({ label: 'Площадь', value: `${areaNum} м²`, icon: 'fa-ruler-combined' });
                if (Number.isFinite(roomsNum) && roomsNum > 0) overlayFeatureItems.push({ label: 'Комнат', value: String(roomsNum), icon: 'fa-bed' });
                if (floorsValue) overlayFeatureItems.push({ label: 'Этаж', value: floorsValue, icon: 'fa-layer-group' });
                if (conditionValue) overlayFeatureItems.push({ label: 'Состояние', value: conditionValue, icon: 'fa-tools' });
                if (bathroomValue) overlayFeatureItems.push({ label: 'Санузел', value: bathroomValue, icon: 'fa-bath' });
                if (balconyValue) overlayFeatureItems.push({ label: 'Балкон', value: balconyValue, icon: 'fa-door-open' });
                if (Number.isFinite(landNum) && landNum > 0) overlayFeatureItems.push({ label: 'Участок', value: `${landNum} сот.`, icon: 'fa-tree' });
                if (Number.isFinite(parkingNum) && parkingNum > 0) overlayFeatureItems.push({ label: 'Парковка', value: String(parkingNum), icon: 'fa-parking' });
                if (Number.isFinite(yearNum) && yearNum > 0) overlayFeatureItems.push({ label: 'Год', value: String(yearNum), icon: 'fa-calendar-alt' });

                overlayFeaturesContainer.classList.toggle('hidden', overlayFeatureItems.length === 0);
                overlayFeaturesContainer.innerHTML = overlayFeatureItems.length > 0
                    ? overlayFeatureItems.map(item => `
                        <div class="glass-effect rounded-lg p-3 text-center overlay-feature-card">
                            <div class="text-sm text-gray-400 property-spec-label">
                                <i class="fas ${item.icon || 'fa-circle-info'} property-spec-icon" aria-hidden="true"></i>
                                <span>${item.label}</span>
                            </div>
                            <div class="font-semibold text-gray-300">${item.value}</div>
                        </div>
                    `).join('')
                    : '';
            }
            
            // Update description
            document.querySelector('#property-overlay .p-8 p.text-gray-400').textContent = 
                propertyData.description || 'Описание данного объекта недвижимости.';
            
            // Update agent info if exists
            const rieltorId = propertyCard.dataset.rieltorId;
            const agentInfoContainer = document.querySelector('#property-overlay .mb-6:has(h4.gold-text)');
            
            if (rieltorId) {
                const agent = agents.find(a => a.rieltor_id == rieltorId);
                if (agent) {
                    agentInfoContainer.style.display = 'block';
                    document.querySelector('#property-overlay .flex.items-center img').src = agent.photo;
                    document.querySelector('#property-overlay .flex.items-center .font-semibold').textContent = agent.name;
                    document.querySelector('#property-overlay .flex.items-center .text-sm').textContent = agent.position;
                    
                    // Update contact buttons
                    const callBtn = document.querySelector('#property-overlay .contact-call-btn');
                    callBtn.innerHTML = `<i class="fas fa-phone-alt mr-2"></i> ${agent.phone}`;
                    callBtn.onclick = function() { window.location.href = `tel:${agent.phone}`; };
                    
                    const whatsappBtn = document.querySelector('#property-overlay a:has(i.fa-whatsapp)');
                    whatsappBtn.href = `https://wa.me/${agent.phone.replace(/\D/g, '')}`;
                    
                    const telegramBtn = document.querySelector('#property-overlay a:has(i.fa-telegram)');
                    telegramBtn.href = `https://t.me/${agent.phone.replace(/\D/g, '')}`;
                    
                    const viberBtn = document.querySelector('#property-overlay a:has(i.fa-viber)');
                    viberBtn.href = `viber://chat?number=${agent.phone.replace(/\D/g, '')}`;
                }
            } else {
                agentInfoContainer.style.display = 'none';
            }
            
            // Собираем реальную галерею из mainPhoto и photos.
            renderPropertyCarousel(propertyImages, agentName);
            
            // Get coordinates from property card and init map
            const coords = propertyCard.dataset.coords;
            if (coords) {
                const propertyMapEl = document.getElementById('property-map');
                propertyMapEl.dataset.coords = coords;
                propertyMapEl.dataset.markerType = propertyData.type || propertyType || 'premium';
                propertyMapEl.dataset.listingMode = propertyData.listingMode || 'sale';
                const [lat, lng] = coords.split(',').map(Number);
                setTimeout(() => {
                    initPropertyMap(lat, lng, propertyData.type || propertyType || 'premium', propertyData.listingMode || 'sale');
                }, 100);
            } else {
                const propertyMapEl = document.getElementById('property-map');
                propertyMapEl.dataset.coords = '';
                propertyMapEl.dataset.markerType = propertyData.type || propertyType || 'premium';
                propertyMapEl.dataset.listingMode = propertyData.listingMode || 'sale';
                // Default coordinates if no coords specified
                setTimeout(() => {
                    initPropertyMap(47.0245, 28.8323, propertyData.type || propertyType || 'premium', propertyData.listingMode || 'sale');
                }, 100);
            }
            
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        // Используем делегирование событий вместо прямого bind к кнопкам
        // Это позволяет обработчикам срабатывать на динамически добавленные карточки
        document.addEventListener('click', function(e) {
            const detailsBtn = e.target.closest('.view-details-btn');
            if (detailsBtn) {
                e.preventDefault();
                openPropertyOverlay(detailsBtn);
                return;
            }

            const propertyCard = e.target.closest('.property-card');
            if (!propertyCard) return;

            // Do not hijack clicks on interactive elements inside a card.
            if (e.target.closest('a, button, input, select, textarea, label')) return;

            const cardDetailsBtn = propertyCard.querySelector('.view-details-btn');
            if (!cardDetailsBtn) return;

            e.preventDefault();
            openPropertyOverlay(cardDetailsBtn);
        });

        closeOverlay.addEventListener('click', function(e) {
            e.preventDefault();
            overlay.classList.remove('active');
            enableBodyScroll();
            
            // Clean up map when overlay closes
            if (propertyMap) {
                propertyMap.remove();
                propertyMap = null;
            }
        });

        // Close overlay when clicking outside content
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                enableBodyScroll();
            }
        });

        // Carousel functionality for property details
        let currentPropertySlide = 0;
        let currentPropertyImages = [];
        let currentLightboxIndex = 0;
        const propertyPrev = document.querySelector('.property-carousel .carousel-prev');
        const propertyNext = document.querySelector('.property-carousel .carousel-next');
        const propertyCarousel = document.querySelector('.property-carousel');
        const propertyThumbsContainer = document.getElementById('property-carousel-thumbs');
        const imageLightbox = document.getElementById('image-lightbox');
        const imageLightboxClose = document.getElementById('image-lightbox-close');
        const imageLightboxPrev = document.getElementById('image-lightbox-prev');
        const imageLightboxNext = document.getElementById('image-lightbox-next');

        function showPropertySlide(n) {
            const propertySlides = document.querySelectorAll('.property-carousel .carousel-item');
            if (propertySlides.length === 0) {
                return;
            }

            propertySlides.forEach(slide => slide.classList.remove('active'));
            currentPropertySlide = (n + propertySlides.length) % propertySlides.length;
            propertySlides[currentPropertySlide].classList.add('active');
            updatePropertyCarouselControls();
        }

        if (propertyPrev) {
            propertyPrev.addEventListener('click', () => showPropertySlide(currentPropertySlide - 1));
        }

        if (propertyNext) {
            propertyNext.addEventListener('click', () => showPropertySlide(currentPropertySlide + 1));
        }

        if (propertyThumbsContainer) {
            propertyThumbsContainer.addEventListener('click', function(e) {
                const thumb = e.target.closest('.property-thumb');
                if (!thumb) {
                    return;
                }

                const slideIndex = Number(thumb.dataset.slideIndex);
                if (!Number.isNaN(slideIndex)) {
                    showPropertySlide(slideIndex);
                }
            });
        }

        if (propertyCarousel) {
            let touchStartX = 0;
            let touchEndX = 0;

            propertyCarousel.addEventListener('click', function(e) {
                const image = e.target.closest('.property-carousel-image');
                if (!image) {
                    return;
                }

                const slideIndex = Number(image.dataset.imageIndex);
                openPropertyImageLightbox(image.src, image.alt, Number.isNaN(slideIndex) ? currentPropertySlide : slideIndex);
            });

            propertyCarousel.addEventListener('touchstart', function(e) {
                touchStartX = e.changedTouches[0].clientX;
            }, { passive: true });

            propertyCarousel.addEventListener('touchend', function(e) {
                touchEndX = e.changedTouches[0].clientX;
                const deltaX = touchEndX - touchStartX;
                const threshold = 40;

                if (Math.abs(deltaX) < threshold) {
                    return;
                }

                if (deltaX < 0) {
                    showPropertySlide(currentPropertySlide + 1);
                } else {
                    showPropertySlide(currentPropertySlide - 1);
                }
            }, { passive: true });
        }

        if (imageLightboxClose) {
            imageLightboxClose.addEventListener('click', closePropertyImageLightbox);
        }

        if (imageLightboxPrev) {
            imageLightboxPrev.addEventListener('click', function() {
                showNextLightboxImage(-1);
            });
        }

        if (imageLightboxNext) {
            imageLightboxNext.addEventListener('click', function() {
                showNextLightboxImage(1);
            });
        }

        if (imageLightbox) {
            imageLightbox.addEventListener('click', function(e) {
                if (e.target === imageLightbox) {
                    closePropertyImageLightbox();
                }
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closePropertyImageLightbox();
                return;
            }

            if (!imageLightbox || imageLightbox.classList.contains('hidden')) {
                return;
            }

            if (e.key === 'ArrowRight') {
                showNextLightboxImage(1);
            }

            if (e.key === 'ArrowLeft') {
                showNextLightboxImage(-1);
            }
        });

        // Testimonial carousel
        let currentTestimonial = 0;
        const testimonials = document.querySelectorAll('.testimonial-item');
        const testimonialPrev = document.querySelector('.carousel-prev');
        const testimonialNext = document.querySelector('.carousel-next');

        function showTestimonial(n) {
            testimonials.forEach(testimonial => testimonial.classList.remove('active'));
            currentTestimonial = (n + testimonials.length) % testimonials.length;
            testimonials[currentTestimonial].classList.add('active');
        }

        testimonialPrev.addEventListener('click', () => showTestimonial(currentTestimonial - 1));
        testimonialNext.addEventListener('click', () => showTestimonial(currentTestimonial + 1));

        // Auto-rotate testimonials
        setInterval(() => {
            showTestimonial(currentTestimonial + 1);
        }, 5000);

        // Reset page to initial state function
        function resetPage() {
            // 1. Reset search filters
            document.getElementById('search-form').reset();
            updateDistricts(); // Reset districts dropdown
            
            // 2. Show initial properties count based on screen size
            const initialCount = window.innerWidth < 768 ? 5 : 6;
            let visibleProperties = 0;
            
            document.querySelectorAll('.property-card').forEach((card, index) => {
                card.classList.remove('hidden'); // Make sure all cards are visible for filtering
                
                if (index < initialCount) {
                    card.classList.add('visible');
                    visibleProperties++;
                } else {
                    card.classList.remove('visible');
                }
            });
            
            // 3. Update pagination buttons
            visibleCount = visibleProperties;
            const totalProperties = document.querySelectorAll('.property-card').length;
            
            // 5. Hide "Show more" button if there are no more properties to load
            if (visibleCount >= totalProperties) {
                loadMoreBtn.style.display = 'none';
                closeBtn.classList.add('hidden');
            } else {
                loadMoreBtn.style.display = 'inline-flex';
                closeBtn.classList.add('hidden');
            }
            
            // Reset agents to initial state
            const initialAgentsCount = window.innerWidth < 768 ? 3 : 4;
            document.querySelectorAll('#agents .glass-effect').forEach((card, index) => {
                if (index < initialAgentsCount) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
            
            // Close any open overlays
            overlay.classList.remove('active');
            document.getElementById('map-overlay').classList.remove('active');
            document.body.style.overflow = 'auto';
            
            // Close mobile menu if open
            document.getElementById('mobile-menu').classList.add('hidden');
            
            // Scroll to top smoothly
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
            
            // Reset main map view
            if (mainMap) {
                mainMap.setView([47.0245, 28.8323], 13);
            }
        }

        // Reset page function
        function resetPage() {
            // 1. Close all overlays
            document.getElementById('property-overlay').classList.remove('active');
            document.getElementById('map-overlay').classList.remove('active');
            enableBodyScroll();
            
            // 2. Reset search form and agent filter
            document.getElementById('search-form').reset();
            updateDistricts();
            setListingMode('all');
            setAdvancedSearchExpanded(false);
            currentFilteredAgentId = null;
            filteredProperties = [];
            
            // 3. Reset properties to initial state
            const initialCount = window.innerWidth < 768 ? 5 : 6;
            document.querySelectorAll('.property-card').forEach((card, index) => {
                if (index < initialCount) {
                    card.classList.add('visible');
                } else {
                    card.classList.remove('visible');
                }
            });
            
            // 4. Reset buttons
            loadMoreBtn.style.display = document.querySelectorAll('.property-card').length > initialCount ? 'inline-flex' : 'none';
            closeBtn.classList.add('hidden');
            
            // 5. Reset agents to initial state
            currentAgentPage = 0;
            renderAgents();
            
            // 6. Close mobile menu if open
            document.getElementById('mobile-menu').classList.add('hidden');
            
            // 7. Scroll to top
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
            
            // 8. Reset map view if exists
            if (mainMap) {
                mainMap.setView([47.0245, 28.8323], 13);
            }
        }

        // Reset page when clicking logo or home links
        document.querySelectorAll('#home-link, #mobile-home-link, #footer-home-link, #logo-link').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                resetPage();
            });
        });

        // Smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;
                
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 80,
                        behavior: 'smooth'
                    });
                    
                    // Close mobile menu if open
                    const mobileMenu = document.getElementById('mobile-menu');
                    mobileMenu.classList.add('hidden');
                }
            });
        });

        // Initialize agents on page load
        renderAgents();
        
        // Agents buttons handlers
        const loadMoreAgentsBtn = document.getElementById('load-more-agents-btn');
        const closeAgentsBtn = document.getElementById('close-agents-btn');
        if (loadMoreAgentsBtn) loadMoreAgentsBtn.addEventListener('click', loadMoreAgents);
        if (closeAgentsBtn) closeAgentsBtn.addEventListener('click', closeAgents);

        // Property pagination
        const propertyCards = document.querySelectorAll('.property-card');
        const loadMoreBtn = document.getElementById('load-more-btn');
        const closeBtn = document.getElementById('close-btn');
        let visibleCount = 0;
        const itemsPerPage = 5;

        function showNextProperties() {
            const isMobile = window.innerWidth < 768;
            const itemsPerPage = isMobile ? 5 : 6;
            
            if (filteredProperties.length > 0) {
                // Filtered by agent or search - show next batch from filtered properties
                const visibleCount = document.querySelectorAll('.property-card.visible').length;
                const showCount = Math.min(itemsPerPage, filteredProperties.length - visibleCount);
                
                for (let i = visibleCount; i < visibleCount + showCount; i++) {
                    if (filteredProperties[i]) {
                        filteredProperties[i].classList.add('visible');
                    }
                }
                
                // Update buttons
                if (visibleCount + showCount >= filteredProperties.length) {
                    loadMoreBtn.style.display = 'none';
                    closeBtn.classList.remove('hidden');
                } else {
                    loadMoreBtn.style.display = 'inline-flex';
                    closeBtn.classList.add('hidden');
                }
            } else {
                // Regular pagination - show next batch from all properties
                const hiddenCards = Array.from(document.querySelectorAll('.property-card:not(.visible)'));
                const showCount = Math.min(itemsPerPage, hiddenCards.length);
                
                for (let i = 0; i < showCount; i++) {
                    hiddenCards[i].classList.add('visible');
                }
                
                // Update buttons
                const remainingHidden = document.querySelectorAll('.property-card:not(.visible)').length;
                if (remainingHidden === 0) {
                    loadMoreBtn.style.display = 'none';
                    closeBtn.classList.remove('hidden');
                } else {
                    loadMoreBtn.style.display = 'inline-flex';
                    closeBtn.classList.add('hidden');
                }
            }
        }

        function closeProperties() {
            const initialCount = window.innerWidth < 768 ? 5 : 6;
            
            if (filteredProperties.length > 0) {
                // Filtered by agent or search - show only initial batch
                document.querySelectorAll('.property-card').forEach(card => card.classList.remove('visible'));
                
                for (let i = 0; i < Math.min(initialCount, filteredProperties.length); i++) {
                    filteredProperties[i].classList.add('visible');
                }
                
                loadMoreBtn.style.display = filteredProperties.length > initialCount ? 'inline-flex' : 'none';
                closeBtn.classList.add('hidden');
            } else {
                // Regular pagination - show initial batch
                document.querySelectorAll('.property-card').forEach((card, index) => {
                    if (index < initialCount) {
                        card.classList.add('visible');
                    } else {
                        card.classList.remove('visible');
                    }
                });
                
                loadMoreBtn.style.display = document.querySelectorAll('.property-card').length > initialCount ? 'inline-flex' : 'none';
                closeBtn.classList.add('hidden');
            }
        }

        // Initialize based on screen size
        const initialCount = window.innerWidth < 768 ? 5 : 6;
        document.querySelectorAll('.property-card').forEach((card, index) => {
            if (index < initialCount) {
                card.classList.add('visible');
            }
        });
        visibleCount = initialCount;
        
        if (propertyCards.length <= initialCount) {
            loadMoreBtn.classList.add('hidden');
        }

        // Load more on button click
        loadMoreBtn.addEventListener('click', showNextProperties);
        closeBtn.addEventListener('click', closeProperties);

        // Animation on scroll
        const animatedElements = document.querySelectorAll('.slide-up, .fade-in');
        
        function checkScroll() {
            animatedElements.forEach(element => {
                const elementTop = element.getBoundingClientRect().top;
                const windowHeight = window.innerHeight;
                
                if (elementTop < windowHeight - 100) {
                    element.style.opacity = '1';
                    element.style.transform = 'translateY(0)';
                }
            });
        }
        
        // Initial check
        checkScroll();
        
        // Handle window resize
        window.addEventListener('resize', function() {
            const initialCount = window.innerWidth < 768 ? 5 : 6;
            if (visibleCount <= initialCount) {
                propertyCards.forEach((card, index) => {
                    if (index < initialCount) {
                        card.classList.add('visible');
                    } else {
                        card.classList.remove('visible');
                    }
                });
                visibleCount = initialCount;
                closeBtn.classList.add('hidden');
            }
            
            if (propertyCards.length <= initialCount) {
                loadMoreBtn.classList.add('hidden');
            } else {
                loadMoreBtn.classList.remove('hidden');
            }
        });

        // Check on scroll
        window.addEventListener('scroll', checkScroll);

// Initialize EmailJS
        emailjs.init("PpKk5iquwdfCvid0B");
        
        // Handle contact form submission
        document.getElementById('contact-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const form = this;
            const nameVal = form.querySelector('#name').value.trim();
            const phoneVal = form.querySelector('#phone').value.trim();
            const emailVal = form.querySelector('#email').value.trim();
            const messageVal = form.querySelector('#message').value.trim();
            const statusEl = document.getElementById('contact-form-status');
            const submitBtn = document.getElementById('contact-submit-btn');

            function showStatus(msg, color) {
                if (!statusEl) return;
                statusEl.textContent = msg;
                statusEl.className = `mt-4 text-sm text-center ${color}`;
                statusEl.classList.remove('hidden');
            }

            if (!nameVal) {
                showStatus('Введите ваше имя.', 'text-red-400');
                return;
            }
            if (!phoneVal && !emailVal) {
                showStatus('Укажите телефон или email для связи.', 'text-red-400');
                return;
            }

            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Отправляется...'; }
            if (statusEl) statusEl.classList.add('hidden');

            const formData = { from_name: nameVal, phone: phoneVal, email: emailVal, message: messageVal };

            const restore = function() {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = 'Отправить <i class="fas fa-paper-plane ml-2"></i>'; }
            };

            emailjs.send('service_2tli96l', 'template_x0ddy0m', formData)
                .then(function() {
                    showStatus('✓ Сообщение отправлено! Мы свяжемся с вами в ближайшее время.', 'text-green-400');
                    form.reset();
                    restore();
                }, function(error) {
                    showStatus('Ошибка при отправке. Позвоните нам напрямую.', 'text-red-400');
                    console.error('EmailJS error:', error);
                    restore();
                });
        });

