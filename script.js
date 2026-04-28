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
        const CAMPAIGN_SOURCE_CODE_MAP = {
            facebook: 'fb',
            instagram: 'ig',
            tiktok: 'tt',
            telegram: 'tg',
            youtube: 'yt',
            whatsapp: 'wa',
            viber: 'vb',
            google: 'gg',
            other: 'ot'
        };

        const CAMPAIGN_CODE_SOURCE_MAP = {
            fb: 'Facebook',
            ig: 'Instagram',
            tt: 'TikTok',
            tg: 'Telegram',
            yt: 'YouTube',
            wa: 'WhatsApp',
            vb: 'Viber',
            gg: 'Google',
            ot: 'Другие источники'
        };

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
                // Deduplicate campaign_click events by vid — keep only the first occurrence
                const seenVids = new Set();
                const deduped = parsed.events.filter(ev => {
                    if (ev.type === 'campaign_click') {
                        const v = String((ev.payload || {}).vid || '');
                        if (!v || seenVids.has(v)) return false;
                        seenVids.add(v);
                    }
                    return true;
                });
                if (deduped.length !== parsed.events.length) {
                    parsed.events = deduped;
                    try { localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(parsed)); } catch (_) {}
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

        function normalizeSourceLabel(sourceRaw) {
            const value = String(sourceRaw || '').toLowerCase().trim();
            if (!value) return '';
            if (value.includes('facebook') || value === 'fb') return 'Facebook';
            if (value.includes('instagram') || value === 'ig') return 'Instagram';
            if (value.includes('tiktok') || value === 'tt') return 'TikTok';
            if (value.includes('youtube') || value.includes('youtu')) return 'YouTube';
            if (value.includes('telegram') || value === 'tg') return 'Telegram';
            if (value.includes('whatsapp') || value === 'wa') return 'WhatsApp';
            if (value.includes('viber')) return 'Viber';
            if (value.includes('google')) return 'Google';
            return value.charAt(0).toUpperCase() + value.slice(1);
        }

        function detectTrafficSource(referrer, utmSource) {
            const utmLabel = normalizeSourceLabel(utmSource);
            if (utmLabel) return utmLabel;

            if (!referrer) return 'Прямой переход';

            const value = String(referrer).toLowerCase();

            // Self-referral (navigating within the same site) → direct
            if (value.includes('venera-rielt.vercel.app') || value.includes('venera-rielt.ru')) return 'Прямой переход';

            if (value.includes('facebook.com') || value.includes('fb.com')) return 'Facebook';
            if (value.includes('instagram.com')) return 'Instagram';
            if (value.includes('tiktok.com')) return 'TikTok';
            if (value.includes('youtube.com') || value.includes('youtu.be')) return 'YouTube';
            if (value.includes('t.me') || value.includes('telegram')) return 'Telegram';
            if (value.includes('wa.me') || value.includes('whatsapp')) return 'WhatsApp';
            if (value.includes('viber.com')) return 'Viber';
            if (value.includes('google.')) return 'Google';
            return 'Другие источники';
        }

        function getCampaignSourceCode(sourceRaw) {
            const label = normalizeSourceLabel(sourceRaw).toLowerCase();
            if (label === 'facebook') return CAMPAIGN_SOURCE_CODE_MAP.facebook;
            if (label === 'instagram') return CAMPAIGN_SOURCE_CODE_MAP.instagram;
            if (label === 'tiktok') return CAMPAIGN_SOURCE_CODE_MAP.tiktok;
            if (label === 'telegram') return CAMPAIGN_SOURCE_CODE_MAP.telegram;
            if (label === 'youtube') return CAMPAIGN_SOURCE_CODE_MAP.youtube;
            if (label === 'whatsapp') return CAMPAIGN_SOURCE_CODE_MAP.whatsapp;
            if (label === 'viber') return CAMPAIGN_SOURCE_CODE_MAP.viber;
            if (label === 'google') return CAMPAIGN_SOURCE_CODE_MAP.google;
            return CAMPAIGN_SOURCE_CODE_MAP.other;
        }

        function parseCampaignTrackingFromUrl(params) {
            const compactCode = String(params.get('v') || '').trim();
            if (compactCode) {
                const match = compactCode.match(/^([a-z]{2})([a-z0-9]+)$/i);
                if (match) {
                    const sourceCode = match[1].toLowerCase();
                    const vid = match[2];
                    return {
                        vid,
                        compactCode,
                        sourceLabel: CAMPAIGN_CODE_SOURCE_MAP[sourceCode] || ''
                    };
                }
            }

            const vid = String(params.get('vid') || '').trim();
            return {
                vid,
                compactCode: '',
                sourceLabel: normalizeSourceLabel(params.get('utm_source') || '')
            };
        }

        function trackVisitEvent() {
            const isAdminPage = /admin\.html$/i.test(window.location.pathname || '');
            if (isAdminPage) return;

            // Always clean tracking params from URL FIRST — before any dedup check —
            // so that trackCampaignClick() running immediately after won't see stale params.
            const params = new URLSearchParams(window.location.search);
            const parsedCampaign = parseCampaignTrackingFromUrl(params);
            const vid = parsedCampaign.vid;
            if (vid) {
                try {
                    const cleanUrl = window.location.pathname + window.location.hash;
                    history.replaceState(null, '', cleanUrl);
                } catch (_) {}
            }

            // Dedup: only record one visit per browser tab session
            try {
                if (sessionStorage.getItem('__venera_visit_recorded')) return;
                sessionStorage.setItem('__venera_visit_recorded', '1');
            } catch (_) {}

            window.__visitStartTime = Date.now();
            window.addEventListener('beforeunload', function() {
                if (window.__visitStartTime) {
                    var dur = Math.round((Date.now() - window.__visitStartTime) / 1000);
                    if (dur >= 3 && dur < 7200) {
                        pushAnalyticsEvent('time_on_site', { duration: dur });
                    }
                }
            });

            const utmSource = params.get('utm_source') || '';
            const sourceLabel = parsedCampaign.sourceLabel || detectTrafficSource(document.referrer || '', utmSource);

            pushAnalyticsEvent('visit', {
                source: sourceLabel,
                utmSource: String(utmSource).trim(),
                vid: String(vid).trim(),
                trackingCode: String(parsedCampaign.compactCode || '').trim()
            });

            // Fallback: if campaign params exist, also log campaign click here.
            if (vid) {
                const utmMedium = params.get('utm_medium') || '';
                const utmCampaign = params.get('utm_campaign') || '';
                pushAnalyticsEvent('campaign_click', {
                    vid,
                    campaignName: String(utmCampaign).trim(),
                    source: sourceLabel,
                    medium: String(utmMedium).trim()
                });
                window.__venera_campaign_click_logged_for_vid = vid;
            }
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

        function recordPropertyAddedAnalytics(payload) {
            pushAnalyticsEvent('property_added', {
                propertyId: String(payload.propertyId || '').trim(),
                rieltorId: String(payload.rieltorId || '').trim(),
                agentName: String(payload.agentName || '').trim() || 'Не указан'
            });
        }

        function normalizeAnalyticsPeriod(periodInput) {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            if (periodInput && typeof periodInput === 'object' && periodInput.mode === 'custom') {
                const startRaw = String(periodInput.startDate || '').trim();
                const endRaw = String(periodInput.endDate || '').trim();
                const startDate = new Date(`${startRaw}T00:00:00`);
                const endDate = new Date(`${endRaw}T00:00:00`);

                if (Number.isFinite(startDate.getTime()) && Number.isFinite(endDate.getTime())) {
                    const normalizedStart = startDate <= endDate ? startDate : endDate;
                    const normalizedEnd = endDate >= startDate ? endDate : startDate;
                    const endOfDay = new Date(normalizedEnd);
                    endOfDay.setHours(23, 59, 59, 999);
                    const daySpan = Math.max(1, Math.floor((normalizedEnd.getTime() - normalizedStart.getTime()) / ANALYTICS_DAY_MS) + 1);

                    return {
                        mode: 'custom',
                        startDate: normalizedStart,
                        endDate: normalizedEnd,
                        startTs: normalizedStart.getTime(),
                        endTs: endOfDay.getTime(),
                        days: daySpan
                    };
                }
            }

            const safeDays = Math.max(1, Number(periodInput) || 30);
            const startTs = safeDays === 1
                ? todayStart.getTime()
                : (now.getTime() - safeDays * ANALYTICS_DAY_MS);

            return {
                mode: 'preset',
                startDate: new Date(startTs),
                endDate: now,
                startTs,
                endTs: now.getTime(),
                days: safeDays
            };
        }

        function buildAnalyticsSummary(periodInput) {
            const period = normalizeAnalyticsPeriod(periodInput);
            const safeDays = period.days;
            const now = Date.now();
            const startTs = period.startTs;
            const endTs = period.endTs;
            const store = getAnalyticsStore();
            const events = store.events.filter(item => {
                const ts = Number(item.ts);
                return ts >= startTs && ts <= endTs;
            });

            const sourceCounts = {};
            const districtCounts = {};
            const districtByCity = {};
            const agentViewCounts = {};
            const agentAddedCounts = {};
            const campaignClickCounts = {};
            const dailyMap = {};
            const hourlyMap = {};

            for (let hour = 0; hour < 24; hour += 1) {
                const key = String(hour).padStart(2, '0');
                hourlyMap[key] = { visits: 0, searches: 0, views: 0 };
            }

            for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
                const date = new Date(period.endDate.getTime() - offset * ANALYTICS_DAY_MS);
                const key = date.toISOString().slice(0, 10);
                dailyMap[key] = { visits: 0, searches: 0, views: 0 };
            }

            const campaignClicksBySource = {};
            const campaignBySource = campaignClicksBySource;

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
                    agentViewCounts[key] = (agentViewCounts[key] || 0) + 1;
                    dailyMap[dayKey].views += 1;
                    if (hourlyMap[hourKey]) hourlyMap[hourKey].views += 1;
                }

                if (type === 'property_added') {
                    const agentName = String(payload.agentName || payload.rieltorId || 'Не указан');
                    const agentId = String(payload.rieltorId || '').trim();
                    const key = `${agentId}::${agentName}`;
                    agentAddedCounts[key] = (agentAddedCounts[key] || 0) + 1;
                }

                if (type === 'campaign_click') {
                    const campaignLabel = String(payload.campaignName || payload.vid || 'Без названия');
                    campaignClickCounts[campaignLabel] = (campaignClickCounts[campaignLabel] || 0) + 1;
                    const srcLabel = normalizeSourceLabel(String(payload.source || '')) || 'Другие';
                    if (!campaignBySource) campaignBySource = {};
                    campaignBySource[srcLabel] = (campaignBySource[srcLabel] || 0) + 1;
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

            const buildAgentEntries = (counterObject) => {
                const mapped = Object.entries(counterObject).map(([compoundKey, value]) => {
                    const sepIdx = compoundKey.indexOf('::');
                    const rieltorId = sepIdx >= 0 ? compoundKey.slice(0, sepIdx) : compoundKey;
                    const fallbackName = sepIdx >= 0 ? compoundKey.slice(sepIdx + 2) : '';
                    const meta = agentMeta[String(rieltorId || '').trim()] || {};
                    return {
                        rieltorId,
                        label: meta.name || fallbackName || 'Не указан',
                        photo: meta.photo || '',
                        value
                    };
                });
                // Deduplicate by rieltorId, summing values
                const deduped = mapped.reduce((acc, entry) => {
                    const existing = acc.find(e => e.rieltorId === entry.rieltorId);
                    if (existing) {
                        existing.value += entry.value;
                    } else {
                        acc.push({ ...entry });
                    }
                    return acc;
                }, []);
                return deduped.sort((a, b) => b.value - a.value);
            };

            const agentViewEntries = buildAgentEntries(agentViewCounts);
            const agentAddedEntries = buildAgentEntries(agentAddedCounts);

            const totalVisits = events.filter(e => e.type === 'visit').length;
            const totalSearches = events.filter(e => e.type === 'search').length;
            const totalViews = events.filter(e => e.type === 'property_view').length;
            const totalCampaignClicks = events.filter(e => e.type === 'campaign_click').length;

            const timeOnSiteEvents = events.filter(e => e.type === 'time_on_site');
            const avgTime = timeOnSiteEvents.length
                ? Math.round(timeOnSiteEvents.reduce((s, e) => s + Number((e.payload || {}).duration || 0), 0) / timeOnSiteEvents.length)
                : 0;

            // Distribution: <30s, 30s-1m, 1-2m, 2-5m, 5-10m, 10+m
            const timeBuckets = { 'до 30с': 0, '30с–1мин': 0, '1–2 мин': 0, '2–5 мин': 0, '5–10 мин': 0, '10+ мин': 0 };
            timeOnSiteEvents.forEach(e => {
                const d = Number((e.payload || {}).duration || 0);
                if (d < 30) timeBuckets['до 30с']++;
                else if (d < 60) timeBuckets['30с–1мин']++;
                else if (d < 120) timeBuckets['1–2 мин']++;
                else if (d < 300) timeBuckets['2–5 мин']++;
                else if (d < 600) timeBuckets['5–10 мин']++;
                else timeBuckets['10+ мин']++;
            });

            const daily = Object.entries(dailyMap)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, value]) => ({ date, ...value }));

            const hourly = Object.entries(hourlyMap)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([hour, value]) => ({ hour, ...value }));

            return {
                days: safeDays,
                mode: period.mode,
                startDate: period.startDate.toISOString().slice(0, 10),
                endDate: period.endDate.toISOString().slice(0, 10),
                totalVisits,
                totalSearches,
                totalViews,
                totalCampaignClicks,
                avgTime,
                timeBuckets,
                sources: toSortedArray(sourceCounts),
                districts: toSortedArray(districtCounts),
                districtByCity,
                agents: agentViewEntries,
                agentAdded: agentAddedEntries,
                campaignClicks: toSortedArray(campaignClickCounts),
                campaignBySource: toSortedArray(campaignBySource),
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
            if (key === 'whatsapp') return '#25D366';
            if (key === 'viber') return '#7360F2';
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
            const fmtTime = (secs) => {
                const s = Number(secs) || 0;
                if (!s) return '—';
                const m = Math.floor(s / 60);
                const r = s % 60;
                return m > 0 ? `${m} мин ${r} с` : `${s} с`;
            };

            const visitsEl = document.getElementById('analytics-total-visits');
            const searchesEl = document.getElementById('analytics-total-searches');
            const viewsEl = document.getElementById('analytics-total-views');
            const campaignClicksEl = document.getElementById('analytics-total-campaign-clicks');
            const updatedEl = document.getElementById('analytics-updated-at');

            if (visitsEl) visitsEl.textContent = fmtNum(summary.totalVisits);
            if (searchesEl) searchesEl.textContent = fmtNum(summary.totalSearches);
            if (viewsEl) viewsEl.textContent = fmtNum(summary.totalViews);
            if (campaignClicksEl) campaignClicksEl.textContent = fmtNum(summary.totalCampaignClicks);
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

            const agentAddedTop = summary.agentAdded.slice(0, 8);
            const agentAddedLabels = agentAddedTop.length ? agentAddedTop.map(item => item.label) : ['Нет данных'];
            const agentAddedValues = agentAddedTop.length ? agentAddedTop.map(item => item.value) : [0];

            setChart('agentAdditions', 'analytics-agent-additions-chart', {
                type: 'bar',
                data: {
                    labels: agentAddedLabels,
                    datasets: [{
                        label: 'Добавленных объектов',
                        data: agentAddedValues,
                        backgroundColor: '#22C55E'
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

            const _srcIconCls = (s) => ({
                facebook:'fab fa-facebook', instagram:'fab fa-instagram', tiktok:'fab fa-tiktok',
                telegram:'fab fa-telegram', youtube:'fab fa-youtube', whatsapp:'fab fa-whatsapp',
                viber:'fab fa-viber'
            })[String(s||'').toLowerCase()] || 'fas fa-link';

            const campaignBySrc = (summary.campaignBySource || []).filter(x => x.value > 0);
            const bySourceLabels = campaignBySrc.length ? campaignBySrc.map(x => x.label) : ['Нет данных'];
            const bySourceValues = campaignBySrc.length ? campaignBySrc.map(x => x.value) : [0];
            const bySourceColors = bySourceLabels.map(l => getSourceColor(l));

            setChart('campaign', 'analytics-campaign-chart', {
                type: 'bar',
                data: {
                    labels: bySourceLabels,
                    datasets: [{
                        label: 'Кликов',
                        data: bySourceValues,
                        backgroundColor: bySourceColors,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { display: false, grid: { display: false } },
                        y: { ticks: { color: '#cbd5e1', stepSize: 1 }, grid: { color: 'rgba(203,213,225,0.15)' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });

            // Icon strip below campaign chart (appended to card, not wrap)
            const campCanvas = document.getElementById('analytics-campaign-chart');
            if (campCanvas) {
                const wrap = campCanvas.parentElement;
                const card = wrap.parentElement;
                let iconRow = card.querySelector('.camp-icon-row');
                if (!iconRow) {
                    iconRow = document.createElement('div');
                    iconRow.className = 'camp-icon-row';
                    iconRow.style.cssText = 'display:flex;justify-content:space-around;align-items:center;padding:6px 4px 0;margin-top:6px;';
                    card.appendChild(iconRow);
                }
                iconRow.innerHTML = campaignBySrc.length
                    ? campaignBySrc.map(x => `<div style="text-align:center;flex:1;min-width:0;">
                        <i class="${_srcIconCls(x.label)}" style="font-size:1.2rem;color:${getSourceColor(x.label)};display:block;"></i>
                      </div>`).join('')
                    : '<div style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;width:100%">Нет данных</div>';
            }

            // Time on site distribution chart
            const timeBuckets = summary.timeBuckets || {};
            const timeLabels = Object.keys(timeBuckets);
            const timeValues = Object.values(timeBuckets);
            const totalTimeSessions = timeValues.reduce((s, v) => s + v, 0);
            const timeChartData = totalTimeSessions > 0
                ? { labels: timeLabels, values: timeValues }
                : { labels: ['Нет данных'], values: [0] };

            setChart('timeOnSite', 'analytics-time-chart', {
                type: 'bar',
                data: {
                    labels: timeChartData.labels,
                    datasets: [{
                        label: 'Сессий',
                        data: timeChartData.values,
                        backgroundColor: 'rgba(255,215,0,0.75)',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(203,213,225,0.15)' } },
                        y: { ticks: { color: '#cbd5e1', stepSize: 1 }, grid: { color: 'rgba(203,213,225,0.15)' } }
                    },
                    plugins: {
                        legend: { labels: { color: '#e5e7eb' } },
                        tooltip: {
                            callbacks: {
                                afterTitle: () => totalTimeSessions ? `Ср. время: ${fmtTime(summary.avgTime)}` : ''
                            }
                        }
                    }
                }
            });

            const citySelect = document.getElementById('analytics-city-select');
            const cityNames = Object.keys(summary.districtByCity || {}).sort((a, b) => a.localeCompare(b, 'ru'));
            const normalizedCityOptions = cityNames.length ? cityNames : ['Все города'];

            if (citySelect) {
                const PREFERRED_CITY = '\u041a\u0438\u0448\u0438\u043d\u0435\u0432';
                const prevValue = citySelect.value;
                citySelect.innerHTML = normalizedCityOptions
                    .map(city => `<option value="${city}">${city}</option>`)
                    .join('');
                // Prefer previously selected, then Кишинев/Кишинёв, then first option
                let defaultCity = prevValue && normalizedCityOptions.includes(prevValue) ? prevValue : null;
                if (!defaultCity) {
                    defaultCity = normalizedCityOptions.find(c =>
                        c.toLowerCase().replace('\u0451', '\u0435') === PREFERRED_CITY.toLowerCase()
                    ) || normalizedCityOptions[0];
                }
                citySelect.value = defaultCity;

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
                : activityRows.map(item => {
                    const d = new Date(item.date + 'T00:00:00');
                    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                });
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
                            label: 'Просмотры',
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

        }

        // ─── Campaign / tracking links ──────────────────────────────────────────────
        const CAMPAIGN_STORAGE_KEY = 'venera_campaign_links_v1';
        const CAMPAIGN_LANDING_URL = 'https://venera-rielt.vercel.app/';
        const PROPERTY_STATUS_KEY = 'venera_property_status_v1';
        const AGENT_STATUS_KEY = 'venera_agent_status_v1';

        // ─── Toast notification ─────────────────────────────────────────────────────
        function showToast(message, type) {
            type = type || 'success';
            var existing = document.getElementById('venera-toast');
            if (existing) existing.remove();

            var icons = {
                success: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>',
                error: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
                info: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
            };

            var toast = document.createElement('div');
            toast.id = 'venera-toast';
            toast.className = 'venera-toast venera-toast--' + type;
            toast.innerHTML = '<div class="venera-toast__icon">' + (icons[type] || icons.success) + '</div>' +
                '<div class="venera-toast__text">' + message + '</div>';
            document.body.appendChild(toast);

            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    toast.classList.add('venera-toast--visible');
                });
            });

            setTimeout(function () {
                toast.classList.remove('venera-toast--visible');
                toast.addEventListener('transitionend', function () { toast.remove(); });
                setTimeout(function () { toast.remove(); }, 600);
            }, 3000);
        }

        // ─── Confirm Dialog ──────────────────────────────────────────────────────────
        function showConfirm(message, onConfirm) {
            var existing = document.getElementById('venera-confirm-overlay');
            if (existing) existing.remove();
            var overlay = document.createElement('div');
            overlay.id = 'venera-confirm-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);';
            var box = document.createElement('div');
            box.style.cssText = 'background:linear-gradient(145deg,rgba(18,18,20,0.98),rgba(10,10,12,0.98));border:1px solid rgba(255,215,0,0.25);border-radius:18px;box-shadow:0 8px 40px rgba(0,0,0,0.6);padding:32px 28px 24px;max-width:380px;width:90%;text-align:center;';
            box.innerHTML =
                '<div style="width:52px;height:52px;border-radius:50%;background:rgba(239,68,68,0.12);border:1.5px solid rgba(239,68,68,0.35);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>' +
                '</div>' +
                '<p style="color:#e5e7eb;font-size:0.95rem;line-height:1.5;margin-bottom:24px;">' + message + '</p>' +
                '<div style="display:flex;gap:10px;justify-content:center;">' +
                    '<button id="venera-confirm-cancel" style="flex:1;padding:10px 0;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#9ca3af;font-size:0.875rem;font-weight:500;cursor:pointer;">Отмена</button>' +
                    '<button id="venera-confirm-ok" style="flex:1;padding:10px 0;border-radius:10px;border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.15);color:#f87171;font-size:0.875rem;font-weight:600;cursor:pointer;">Удалить</button>' +
                '</div>';
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            function close() { overlay.remove(); }
            overlay.querySelector('#venera-confirm-cancel').addEventListener('click', close);
            overlay.querySelector('#venera-confirm-ok').addEventListener('click', function() { close(); onConfirm(); });
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            function onKey(e) {
                if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
                if (e.key === 'Enter') { close(); onConfirm(); document.removeEventListener('keydown', onKey); }
            }
            document.addEventListener('keydown', onKey);
        }

        // Company fallback contact info (used when agent is hidden)
        const COMPANY_CONTACT = {
            name: 'Venera Rielt',
            position: 'Агентство недвижимости',
            phone: '+373 22 123 456',
            whatsapp: '+37322123456',
            telegram: '+37322123456',
            viber: '+37360123456',
            photo: 'https://i.ibb.co/35ZQ5g8X/logo.png'
        };

        const SITE_CONTENT_STORAGE_KEY = 'venera_site_content_v1';
        const ABOUT_MEDIA_CACHE_NAME = 'venera-about-media-v1';
        const ACTIONS_LOG_KEY = 'venera_actions_log_v1';
        const DEFAULT_SITE_CONTENT = {
            about: {
                title: 'О компании',
                company: 'Venera Rielt',
                text1: 'Мы — лидер на рынке элитной недвижимости Молдовы с 2010 года. Наша компания специализируется на премиальном сегменте жилой и коммерческой недвижимости.',
                text2: 'Наш подход сочетает в себе глубокое знание местного рынка, международные стандарты работы и индивидуальный подход к каждому клиенту.',
                text3: 'За годы работы мы помогли более 500 клиентам найти свой идеальный дом или выгодно инвестировать в недвижимость.',
                stat1Value: '12+',
                stat1Label: 'Лет опыта',
                stat2Value: '500+',
                stat2Label: 'Довольных клиентов',
                stat3Value: '100+',
                stat3Label: 'Объектов',
                stat4Value: '100%',
                stat4Label: 'Надёжность',
                photo1: 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80',
                photo2: 'https://images.unsplash.com/photo-1605146769289-440113cc3d00?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80',
                photo3: 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80',
                photos: []
            },
            contact: {
                title: 'Связаться с нами',
                lead: 'Оставьте свои контакты, и наш специалист свяжется с вами в ближайшее время',
                infoTitle: 'Контактная информация',
                address: 'Молдова, Кишинёв, ул. Пушкина 42, офис 15',
                phoneMain: '+373 22 123 456',
                phoneExtra: '+373 60 123 456 (Viber, WhatsApp)',
                email: 'info@venera-rielt.md',
                hours1: 'Пн-Пт: 9:00 - 18:00',
                hours2: 'Сб: 10:00 - 15:00'
            },
            social: {
                facebook: '#',
                instagram: '#',
                youtube: '#',
                tiktok: 'https://www.tiktok.com/@venera.rielt?_t=ZN-8z4bdlOBmNy&_r=1',
                telegram: '#',
                whatsapp: '#',
                viber: '#'
            }
        };

        function _cloneSiteDefaults() {
            return JSON.parse(JSON.stringify(DEFAULT_SITE_CONTENT));
        }

        function getSiteContentSettings() {
            var base = _cloneSiteDefaults();
            try {
                var raw = localStorage.getItem(SITE_CONTENT_STORAGE_KEY);
                var data = raw ? JSON.parse(raw) : null;
                if (data && typeof data === 'object') {
                    base.about = Object.assign({}, base.about, data.about || {});
                    base.contact = Object.assign({}, base.contact, data.contact || {});
                    base.social = Object.assign({}, base.social, data.social || {});
                }
            } catch (_) {}
            return base;
        }

        function saveSiteContentSettings(settings) {
            try { localStorage.setItem(SITE_CONTENT_STORAGE_KEY, JSON.stringify(settings)); } catch (_) {}
        }

        function _logAction(action, section, details) {
            try {
                var logs = (function() {
                    try { return JSON.parse(localStorage.getItem(ACTIONS_LOG_KEY) || '[]'); } catch(_) { return []; }
                })();
                var adminName = getAdminSession && getAdminSession() ? 'Администратор' : (getRealtorSession ? getRealtorSession() : {}).name || 'Пользователь';
                var entry = {
                    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                    timestamp: new Date().toISOString(),
                    action: action,
                    section: section,
                    user: adminName,
                    details: details || {}
                };
                logs.unshift(entry);
                if (logs.length > 500) logs = logs.slice(0, 500);
                localStorage.setItem(ACTIONS_LOG_KEY, JSON.stringify(logs));
            } catch(_) {}
        }

        function _getActionLogs(section) {
            try {
                var logs = JSON.parse(localStorage.getItem(ACTIONS_LOG_KEY) || '[]');
                if (section) logs = logs.filter(function(l) { return String(l.section || '') === section; });
                return logs;
            } catch(_) { return []; }
        }

        function _clearActionLogs() {
            try { localStorage.removeItem(ACTIONS_LOG_KEY); } catch(_) {}
        }

        function _formatTimestamp(dateStr) {
            try {
                var d = new Date(dateStr);
                var pad = function(n) { return n < 10 ? '0' + n : n; };
                return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' +
                       pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
            } catch(e) {
                return String(dateStr);
            }
        }

        function _renderHistoryLogs(section) {
            var logs = _getActionLogs(section);
            var listEl = null;
            if (section === '\u0411\u0430\u0437\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432') {
                listEl = document.getElementById('clients-history-list');
            } else if (section === '\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u0432\u0441\u0442\u0440\u0435\u0447 \u0438 \u043f\u043e\u043a\u0430\u0437\u043e\u0432') {
                listEl = document.getElementById('calendar-history-list');
            }
            if (!listEl) return;
            
            if (!logs || logs.length === 0) {
                listEl.innerHTML = '<div class="text-gray-500 text-xs">Действия еще не зафиксированы</div>';
                return;
            }
            
            listEl.innerHTML = logs.map(function(entry) {
                var details = '';
                if (entry.details) {
                    if (entry.details.clientName) details += ' \u2013 ' + entry.details.clientName;
                    if (entry.details.phone) details += ' (' + entry.details.phone + ')';
                    if (entry.details.title) details += ' \u2013 ' + entry.details.title;
                    if (entry.details.date && entry.details.action !== '\u0423\u0434\u0430\u043b\u0435\u043d\u0438\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f') details += ' (' + entry.details.date + ')';
                }
                var timeStr = _formatTimestamp(entry.timestamp);
                var userStr = entry.user || '\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u044b\u0439';
                return '<div style=\"padding:0.5rem;border-left:2px solid rgba(255,215,0,0.3);color:#a0a0a0;font-size:0.75rem;\">' +
                       '<span style=\"color:#ffd700;font-weight:500;\">[' + timeStr + ']</span> ' +
                       '<span style=\"color:#c0c0c0;\">' + userStr + ':</span> ' +
                       entry.action + details +
                       '</div>';
            }).join('');
        }

            var s = settings || getSiteContentSettings();
            var list = [];
            if (Array.isArray(s.about.photos) && s.about.photos.length) {
                list = s.about.photos
                    .map(function(item) {
                        if (!item) return null;
                        if (typeof item === 'string') return { url: item, type: 'image', hidden: false };
                        if (typeof item === 'object' && item.url) return { url: item.url, type: item.type === 'video' ? 'video' : 'image', hidden: !!item.hidden };
                        return null;
                    })
                    .filter(function(x) { return !!x && !!x.url; });
            } else {
                list = [s.about.photo1, s.about.photo2, s.about.photo3]
                    .filter(function(x) { return !!x; })
                    .map(function(url) { return { url: url, type: 'image', hidden: false }; });
            }
            return list;
        }

        function _getAboutVisibleEntries(settings) {
            return _getAboutPhotoEntries(settings)
                .filter(function(entry) { return !entry.hidden; });
        }

        function _getAboutPhotos(settings) {
            return _getAboutVisibleEntries(settings)
                .map(function(entry) { return entry.url; });
        }

        function _setAboutPhotos(settings, photos) {
            var cleaned = (photos || [])
                .map(function(item) {
                    if (!item) return null;
                    if (typeof item === 'string') {
                        return item.trim() ? { url: item.trim(), type: 'image', hidden: false } : null;
                    }
                    if (typeof item === 'object' && item.url) {
                        var normalizedUrl = String(item.url || '').trim();
                        if (!normalizedUrl) return null;
                        return { url: normalizedUrl, type: item.type === 'video' ? 'video' : 'image', hidden: !!item.hidden };
                    }
                    return null;
                })
                .filter(function(x) { return !!x; });

            settings.about.photos = cleaned.map(function(item) {
                return { url: item.url, type: item.type === 'video' ? 'video' : 'image', hidden: !!item.hidden };
            });

            var visible = cleaned.filter(function(item) { return !item.hidden; }).map(function(item) { return item.url; });
            settings.about.photo1 = visible[0] || DEFAULT_SITE_CONTENT.about.photo1;
            settings.about.photo2 = visible[1] || DEFAULT_SITE_CONTENT.about.photo2;
            settings.about.photo3 = visible[2] || DEFAULT_SITE_CONTENT.about.photo3;
        }

        function renderAboutPhotosAdmin(settings) {
            var s = settings || getSiteContentSettings();
            var list = document.getElementById('site-about-photos-list');
            if (!list) return;
            var photos = _getAboutPhotoEntries(s);
            list.innerHTML = '';
            photos.forEach(function(photo, idx) {
                var item = document.createElement('div');
                item.className = 'promo-admin-item';
                var previewMedia = photo.type === 'video'
                    ? '<video src="' + photo.url + '" muted class="promo-admin-thumb admin-click-preview" data-preview-type="video" data-preview-src="' + photo.url + '" style="width:90px;height:60px;object-fit:cover;border-radius:8px;cursor:zoom-in;"></video>'
                    : '<img src="' + photo.url + '" class="promo-admin-thumb admin-click-preview" data-preview-type="image" data-preview-src="' + photo.url + '" style="width:90px;height:60px;object-fit:cover;border-radius:8px;cursor:zoom-in;">';
                item.innerHTML =
                    '<div class="promo-admin-media-wrap">' +
                        previewMedia +
                        '<span class="promo-admin-overlay-type">' + (photo.type === 'video' ? 'Видео' : 'Фото') + '</span>' +
                        (photo.hidden ? '<span class="promo-admin-overlay-icon" aria-hidden="true"><i class="fas fa-eye-slash"></i></span>' : '') +
                    '</div>' +
                    '<div class="promo-admin-info" style="min-width:0;">' +
                        '<span class="promo-admin-type">' + (photo.type === 'video' ? 'Видео' : 'Фото') + '</span>' +
                        (photo.hidden ? '<div class="text-xs text-orange-400 mt-1 promo-admin-hidden-label"><i class="fas fa-eye-slash"></i> Скрыт</div>' : '') +
                    '</div>' +
                    '<div class="promo-admin-actions">' +
                        '<button class="site-about-photo-toggle admin-btn-eye" data-i="' + idx + '" title="' + (photo.hidden ? 'Показать слайд' : 'Скрыть слайд') + '"><i class="fas ' + (photo.hidden ? 'fa-eye' : 'fa-eye-slash') + '"></i></button>' +
                        '<button class="site-about-photo-up admin-btn-eye" data-i="' + idx + '" title="Вверх"><i class="fas fa-arrow-up"></i></button>' +
                        '<button class="site-about-photo-down admin-btn-eye" data-i="' + idx + '" title="Вниз"><i class="fas fa-arrow-down"></i></button>' +
                        '<button class="site-about-photo-delete admin-btn-del" data-i="' + idx + '" title="Удалить"><i class="fas fa-trash"></i></button>' +
                    '</div>';
                if (photo.hidden) item.classList.add('promo-admin-item--hidden');
                list.appendChild(item);
            });
            if (!photos.length) {
                list.innerHTML = '<div class="text-gray-500 text-sm">Пока нет слайдов. Добавьте первый выше.</div>';
            }
        }

        function renderAboutCarouselFromSettings(settings) {
            var carousel = document.getElementById('about-testimonial-carousel');
            if (!carousel) return;
            var entries = _getAboutVisibleEntries(settings);
            if (!entries.length) {
                carousel.innerHTML = '';
                window.__veneraAboutCarouselNeedsRebind = true;
                return;
            }
            var slidesHtml = entries.map(function(entry, i) {
                if (entry.type === 'video') {
                    return '<div class="testimonial-item' + (i === 0 ? ' active' : '') + '"><video src="' + entry.url + '" class="w-full h-96 object-cover" autoplay muted loop playsinline></video></div>';
                }
                return '<div class="testimonial-item' + (i === 0 ? ' active' : '') + '"><img src="' + entry.url + '" alt="Luxury Property" class="w-full h-96 object-cover"></div>';
            }).join('');
            var arrows =
                '<button class="carousel-prev absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition"><i class="fas fa-chevron-left"></i></button>' +
                '<button class="carousel-next absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition"><i class="fas fa-chevron-right"></i></button>';
            carousel.innerHTML = slidesHtml + arrows;
            window.__veneraAboutCarouselNeedsRebind = true;
        }

        function _setText(id, value) {
            var el = document.getElementById(id);
            if (el && value != null) el.textContent = String(value);
        }

        function _setHref(id, value) {
            var el = document.getElementById(id);
            if (!el) return;
            var href = (value || '#').trim();
            if (!href) href = '#';
            el.setAttribute('href', href);
            el.setAttribute('target', href === '#' ? '_self' : '_blank');
            el.setAttribute('rel', href === '#' ? '' : 'noopener noreferrer');
        }

        function _setSrc(id, value) {
            var el = document.getElementById(id);
            if (el && value) el.setAttribute('src', value);
        }

        function _sanitizeAboutMediaFileName(name) {
            var base = String(name || '').trim();
            if (!base) return 'about-media-' + Date.now() + '.bin';
            return base
                .replace(/[^a-zA-Z0-9._-]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-+|-+$/g, '') || ('about-media-' + Date.now() + '.bin');
        }

        function _normalizeAboutMediaUrl(url) {
            var value = String(url || '').trim();
            if (!value) return '';
            if (/^(data:|blob:|https?:\/\/)/i.test(value)) return value;
            if (value.charAt(0) === '/') return value;
            if (/^image\/about\//i.test(value)) return '/' + value;
            return '/image/about/' + value.replace(/^\.?\/+/, '');
        }

        function _fileToDataUrl(file) {
            return new Promise(function(resolve, reject) {
                var reader = new FileReader();
                reader.onload = function(ev) { resolve(ev.target.result); };
                reader.onerror = function() { reject(new Error('read_failed')); };
                reader.readAsDataURL(file);
            });
        }

        function _saveAboutMediaToCache(file) {
            var safeFileName = _sanitizeAboutMediaFileName(file && file.name);
            var mediaPath = '/image/about/' + safeFileName;
            if (!window.caches || typeof window.caches.open !== 'function') {
                return _fileToDataUrl(file);
            }
            return window.caches.open(ABOUT_MEDIA_CACHE_NAME)
                .then(function(cache) {
                    var headers = {
                        'Content-Type': file && file.type ? file.type : 'application/octet-stream',
                        'Cache-Control': 'public, max-age=31536000'
                    };
                    return cache.put(mediaPath, new Response(file, { status: 200, headers: headers }))
                        .then(function() { return mediaPath; });
                })
                .catch(function() {
                    return _fileToDataUrl(file);
                });
        }

        function applySiteContentSettings() {
            var s = getSiteContentSettings();

            _setText('about-section-title', s.about.title);
            _setText('about-company-name', s.about.company);
            _setText('about-text-1', s.about.text1);
            _setText('about-text-2', s.about.text2);
            _setText('about-text-3', s.about.text3);
            _setText('about-stat-1-value', s.about.stat1Value);
            _setText('about-stat-1-label', s.about.stat1Label);
            _setText('about-stat-2-value', s.about.stat2Value);
            _setText('about-stat-2-label', s.about.stat2Label);
            _setText('about-stat-3-label', s.about.stat3Label);
            _setText('about-stat-4-value', s.about.stat4Value);
            _setText('about-stat-4-label', s.about.stat4Label);
            _setSrc('about-photo-1', s.about.photo1);
            _setSrc('about-photo-2', s.about.photo2);
            _setSrc('about-photo-3', s.about.photo3);

            _setText('contact-section-title', s.contact.title);
            _setText('contact-section-lead', s.contact.lead);
            _setText('contact-info-title', s.contact.infoTitle);
            _setText('contact-address', s.contact.address);
            _setText('contact-phone-main', s.contact.phoneMain);
            _setText('contact-phone-extra', s.contact.phoneExtra);
            _setText('contact-email', s.contact.email);
            _setText('contact-hours-1', s.contact.hours1);
            _setText('contact-hours-2', s.contact.hours2);

            _setHref('contact-social-facebook', s.social.facebook);
            _setHref('contact-social-instagram', s.social.instagram);
            _setHref('contact-social-youtube', s.social.youtube);
            _setHref('contact-social-tiktok', s.social.tiktok);
            _setHref('contact-social-telegram', s.social.telegram);
            _setHref('contact-social-whatsapp', s.social.whatsapp);
            _setHref('contact-social-viber', s.social.viber);

            _setHref('footer-social-facebook', s.social.facebook);
            _setHref('footer-social-instagram', s.social.instagram);
            _setHref('footer-social-youtube', s.social.youtube);
            _setHref('footer-social-tiktok', s.social.tiktok);
            _setHref('footer-social-telegram', s.social.telegram);
            _setHref('footer-social-whatsapp', s.social.whatsapp);
            _setHref('footer-social-viber', s.social.viber);

            renderAboutCarouselFromSettings(s);

            // Keep fallback contact card in overlay in sync
            COMPANY_CONTACT.name = s.about.company || COMPANY_CONTACT.name;
            COMPANY_CONTACT.phone = s.contact.phoneMain || COMPANY_CONTACT.phone;
            COMPANY_CONTACT.whatsapp = s.contact.phoneMain || COMPANY_CONTACT.whatsapp;

            if (typeof updatePropertiesForSaleCount === 'function') {
                updatePropertiesForSaleCount();
            }
        }

        window.renderSiteContentAdmin = function() {
            var s = getSiteContentSettings();
            function setValue(id, value) {
                var el = document.getElementById(id);
                if (el) el.value = value || '';
            }
            function getCurrentPropertyCount() {
                return document.querySelectorAll('.property-card').length;
            }
            setValue('site-about-title', s.about.title);
            setValue('site-about-company', s.about.company);
            setValue('site-about-text-1', s.about.text1);
            setValue('site-about-text-2', s.about.text2);
            setValue('site-about-text-3', s.about.text3);
            setValue('site-about-stat-1-value', s.about.stat1Value);
            setValue('site-about-stat-1-label', s.about.stat1Label);
            setValue('site-about-stat-2-value', s.about.stat2Value);
            setValue('site-about-stat-2-label', s.about.stat2Label);
            setValue('site-about-stat-3-value', String(getCurrentPropertyCount()));
            setValue('site-about-stat-3-label', s.about.stat3Label);
            setValue('site-about-stat-4-value', s.about.stat4Value);
            setValue('site-about-stat-4-label', s.about.stat4Label);
            setValue('site-about-photo-1', s.about.photo1);
            setValue('site-about-photo-2', s.about.photo2);
            setValue('site-about-photo-3', s.about.photo3);
            setValue('site-contact-title', s.contact.title);
            setValue('site-contact-lead', s.contact.lead);
            setValue('site-contact-info-title', s.contact.infoTitle);
            setValue('site-contact-address', s.contact.address);
            setValue('site-contact-phone-main', s.contact.phoneMain);
            setValue('site-contact-phone-extra', s.contact.phoneExtra);
            setValue('site-contact-email', s.contact.email);
            setValue('site-contact-hours-1', s.contact.hours1);
            setValue('site-contact-hours-2', s.contact.hours2);
            setValue('site-social-facebook', s.social.facebook);
            setValue('site-social-instagram', s.social.instagram);
            setValue('site-social-youtube', s.social.youtube);
            setValue('site-social-tiktok', s.social.tiktok);
            setValue('site-social-telegram', s.social.telegram);
            setValue('site-social-whatsapp', s.social.whatsapp);
            setValue('site-social-viber', s.social.viber);

            var stat3Input = document.getElementById('site-about-stat-3-value');
            if (stat3Input) {
                stat3Input.readOnly = true;
                stat3Input.title = 'Автоматически рассчитывается по опубликованным объектам';
            }

            renderAboutPhotosAdmin(s);
        };

        function getAgentStatusStore() {
            try {
                const raw = localStorage.getItem(AGENT_STATUS_KEY);
                const data = raw ? JSON.parse(raw) : null;
                if (data && typeof data === 'object' && !Array.isArray(data)) return data;
            } catch (_) {}
            return {};
        }

        function saveAgentStatusStore(store) {
            try { localStorage.setItem(AGENT_STATUS_KEY, JSON.stringify(store)); } catch (_) {}
        }

        function isAgentHidden(rieltorId) {
            if (!rieltorId) return false;
            var store = getAgentStatusStore();
            return !!(store[String(rieltorId)] && store[String(rieltorId)].hidden);
        }

        function getPropertyStatusStore() {
            try {
                const raw = localStorage.getItem(PROPERTY_STATUS_KEY);
                const data = raw ? JSON.parse(raw) : null;
                if (data && typeof data === 'object' && !Array.isArray(data)) return data;
            } catch (_) {}
            return {};
        }

        function savePropertyStatusStore(store) {
            try { localStorage.setItem(PROPERTY_STATUS_KEY, JSON.stringify(store)); } catch (_) {}
        }

        function applyPropertyStatuses() {
            const store = getPropertyStatusStore();
            var keys = Object.keys(store);
            console.log('[STATUS] applyPropertyStatuses called, store keys:', keys.length, keys);
            document.querySelectorAll('.property-card').forEach(card => {
                const id = card.dataset.id;
                if (!id) return;
                const entry = store[id] || {};
                const status = entry.status || '';
                const hidden = !!entry.hidden;

                // Set data attributes
                card.dataset.propStatus = status;
                card.dataset.propHidden = hidden ? '1' : '';

                // Apply hidden directly via inline style
                if (hidden) {
                    card.style.display = 'none';
                } else {
                    card.style.removeProperty('display');
                }

                const overlay = card.querySelector('.property-status-overlay');
                if (overlay) {
                    overlay.setAttribute('data-status', status);
                    // Apply overlay styles DIRECTLY via inline styles
                    if (status === 'sold') {
                        overlay.style.opacity = '1';
                        overlay.style.background = 'rgba(185, 28, 28, 0.55)';
                    } else if (status === 'reserved') {
                        overlay.style.opacity = '1';
                        overlay.style.background = 'rgba(202, 138, 4, 0.55)';
                    } else {
                        overlay.style.opacity = '0';
                        overlay.style.background = '';
                    }
                    const label = overlay.querySelector('.property-status-label');
                    if (label) {
                        if (status === 'sold') label.textContent = 'ПРОДАН';
                        else if (status === 'reserved') label.textContent = 'ЗАБРОНИРОВАНО';
                        else label.textContent = '';
                    }
                    if (status) {
                        console.log('[STATUS] card', id, '→ status:', status, ', overlay found:', !!overlay);
                    }
                } else if (status) {
                    console.log('[STATUS] card', id, '→ status:', status, ', overlay NOT FOUND!');
                }
            });
            // Also apply markers
            applyPropertyMarkers();
        }

        // ─── Property markers (hotprice / discount / exclusive) ────────────────────
        function applyPropertyMarkers() {
            const store = getPropertyStatusStore();
            document.querySelectorAll('.property-card').forEach(card => {
                const id = card.dataset.id;
                if (!id) return;
                const entry = store[id] || {};

                // Remove old marker badges
                card.querySelectorAll('.prop-marker-badge').forEach(el => el.remove());
                card.querySelectorAll('.prop-discount-price').forEach(el => el.remove());

                const badgesContainer = card.querySelector('.property-badges');
                if (!badgesContainer) return;

                // Add marker badges below type badges
                if (entry.hotprice) {
                    const b = document.createElement('div');
                    b.className = 'prop-marker-badge hotprice-badge';
                    b.innerHTML = '<i class="fas fa-fire"></i> ГОРЯЧАЯ ЦЕНА';
                    badgesContainer.appendChild(b);
                }
                if (entry.exclusive) {
                    const b = document.createElement('div');
                    b.className = 'prop-marker-badge exclusive-badge';
                    b.innerHTML = '<i class="fas fa-gem"></i> ЭКСКЛЮЗИВ';
                    badgesContainer.appendChild(b);
                }
                if (entry.discount && entry.discountPrice) {
                    const b = document.createElement('div');
                    b.className = 'prop-marker-badge discount-badge';
                    b.innerHTML = '<i class="fas fa-tag"></i> СКИДКА';
                    badgesContainer.appendChild(b);

                    // Show discount price below original price
                    const priceTag = card.querySelector('.price-tag');
                    if (priceTag) {
                        priceTag.classList.add('price-old');
                        // Insert discount price after price tag
                        var discountEl = document.createElement('div');
                        discountEl.className = 'prop-discount-price gold-bg text-black font-bold px-4 py-2 rounded-full';
                        discountEl.textContent = formatPriceValue(Number(entry.discountPrice));
                        priceTag.parentNode.insertBefore(discountEl, priceTag.nextSibling);
                    }
                } else {
                    const priceTag = card.querySelector('.price-tag');
                    if (priceTag) priceTag.classList.remove('price-old');
                }
            });
        }

        window._propToggleMarker = function(marker) {
            var inp = document.getElementById('property-marker-' + marker);
            if (!inp) return;
            var next = inp.value === '1' ? '' : '1';
            inp.value = next;
            var btn = document.getElementById('prop-btn-' + marker);
            if (btn) btn.classList.toggle('active-marker-' + marker, next === '1');

            // Show/hide discount price input
            if (marker === 'discount') {
                var discountRow = document.getElementById('prop-discount-price-row');
                if (discountRow) discountRow.style.display = next === '1' ? 'block' : 'none';
            }
        };

        function _applyPropertyMarkerButtons(entry) {
            entry = entry || {};
            var markers = ['hotprice', 'discount', 'exclusive'];
            markers.forEach(function(m) {
                var inp = document.getElementById('property-marker-' + m);
                if (inp) inp.value = entry[m] ? '1' : '';
                var btn = document.getElementById('prop-btn-' + m);
                if (btn) btn.classList.toggle('active-marker-' + m, !!entry[m]);
            });
            var discountPriceInp = document.getElementById('property-discount-price');
            if (discountPriceInp) discountPriceInp.value = entry.discountPrice || '';
            var discountRow = document.getElementById('prop-discount-price-row');
            if (discountRow) discountRow.style.display = entry.discount ? 'block' : 'none';
        }

        // Global toggle helpers for status buttons (used via onclick in HTML)
        window._propToggleStatus = function(status) {
            var inp = document.getElementById('property-status-val');
            if (!inp) return;
            var current = inp.value;
            var next = (current === status) ? '' : status;
            inp.value = next;
            var btnSold = document.getElementById('prop-btn-sold');
            var btnRes = document.getElementById('prop-btn-reserved');
            if (btnSold) btnSold.classList.toggle('active-sold', next === 'sold');
            if (btnRes) btnRes.classList.toggle('active-reserved', next === 'reserved');
        };
        window._propToggleHidden = function() {
            var inp = document.getElementById('property-hidden-val');
            if (!inp) return;
            var next = inp.value === '1' ? '' : '1';
            inp.value = next;
            var btn = document.getElementById('prop-btn-hidden');
            if (btn) btn.classList.toggle('active-hidden', next === '1');
        };

        function getCampaignStore() {
            try {
                const raw = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
                const data = raw ? JSON.parse(raw) : null;
                if (data && Array.isArray(data.links)) return data;
            } catch (_) {}
            return { links: [] };
        }

        function saveCampaignStore(store) {
            try { localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(store)); } catch (_) {}
        }

        function generateCampaignId() {
            const ts = Date.now().toString(36).slice(-4);
            const rnd = Math.random().toString(36).slice(2, 7);
            return `${ts}${rnd}`;
        }

        function getMainLandingUrl() {
            return CAMPAIGN_LANDING_URL;
        }

        function buildCampaignUrl(vid, source, medium, campaignName) {
            const base = getMainLandingUrl();
            const sourceCode = getCampaignSourceCode(source);
            const params = new URLSearchParams({ v: `${sourceCode}${vid}` });
            return `${base}?${params.toString()}`;
        }

        function createCampaignLink(name, source, medium) {
            const store = getCampaignStore();
            const vid = generateCampaignId();
            const link = {
                id: vid,
                name: String(name || '').trim(),
                source: String(source || '').trim(),
                medium: String(medium || '').trim(),
                createdAt: Date.now(),
                url: buildCampaignUrl(vid, source, medium, name)
            };
            store.links.push(link);
            saveCampaignStore(store);
            return link;
        }

        function deleteCampaignLink(id) {
            const store = getCampaignStore();
            store.links = store.links.filter(l => l.id !== id);
            saveCampaignStore(store);
        }

        function trackCampaignClick() {
            const params = new URLSearchParams(window.location.search);
            const parsedCampaign = parseCampaignTrackingFromUrl(params);
            const vid = parsedCampaign.vid;
            if (!vid) return;

            const hasCampaignClickInThisLoad = (() => {
                try {
                    return window.__venera_campaign_click_logged_for_vid === vid;
                } catch (_) {
                    return false;
                }
            })();
            if (hasCampaignClickInThisLoad) return;

            const store = getCampaignStore();
            const link = store.links.find(l => l.id === vid);
            pushAnalyticsEvent('campaign_click', {
                vid,
                campaignName: link ? link.name : '',
                source: normalizeSourceLabel(link ? link.source : parsedCampaign.sourceLabel),
                medium: link ? link.medium : (params.get('utm_medium') || '')
            });

            window.__venera_campaign_click_logged_for_vid = vid;
        }

        function renderCampaignLinksAdmin() {
            const store = getCampaignStore();
            const links = Array.isArray(store.links) ? store.links : [];
            const container = document.getElementById('campaign-links-list');
            if (!container) return;

            // Migrate older links to the current valid landing URL format.
            let hasUrlUpdates = false;
            links.forEach(link => {
                const expectedUrl = buildCampaignUrl(link.id, link.source, link.medium, link.name);
                if (String(link.url || '') !== expectedUrl) {
                    link.url = expectedUrl;
                    hasUrlUpdates = true;
                }
            });
            if (hasUrlUpdates) {
                store.links = links;
                saveCampaignStore(store);
            }

            // Load click counts from analytics
            const analyticsStore = getAnalyticsStore();
            const clickCounts = {};
            analyticsStore.events.forEach(ev => {
                if (ev.type === 'campaign_click') {
                    const v = String((ev.payload || {}).vid || '');
                    if (v) clickCounts[v] = (clickCounts[v] || 0) + 1;
                }
            });

            if (!links.length) {
                container.innerHTML = '<div class="text-gray-500 text-sm py-2">Ссылок пока нет. Создайте первую выше.</div>';
                return;
            }

            const _srcIconClass = (s) => ({ facebook:'fab fa-facebook', instagram:'fab fa-instagram', tiktok:'fab fa-tiktok', telegram:'fab fa-telegram', youtube:'fab fa-youtube', whatsapp:'fab fa-whatsapp', viber:'fab fa-viber' })[String(s||'').toLowerCase()] || 'fas fa-link';

            container.innerHTML = links.slice().reverse().map(link => {
                const clicks = clickCounts[link.id] || 0;
                const created = new Date(link.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
                const safeUrl = String(link.url || '').replace(/"/g, '&quot;');
                const safeName = String(link.name || '').replace(/</g, '&lt;');
                const safeSource = String(link.source || '').replace(/</g, '&lt;');
                const safeMedium = String(link.medium || '').replace(/</g, '&lt;');
                const srcIcon = _srcIconClass(link.source);
                return `
                <div class="campaign-link-row" data-campaign-id="${link.id}">
                    <div class="campaign-link-info">
                        <div class="campaign-link-name">${safeName}</div>
                        <div class="campaign-link-meta"><i class="${srcIcon}" style="margin-right:5px;color:rgba(255,215,0,0.75);"></i>${safeSource} / ${safeMedium} &nbsp;·&nbsp; создана ${created}</div>
                        <div class="campaign-link-url-wrap">
                            <input class="campaign-link-url" readonly value="${safeUrl}">
                            <button type="button" class="campaign-copy-btn" data-copy="${safeUrl}" title="Копировать"><i class="fas fa-clone"></i></button>
                        </div>
                    </div>
                    <div class="campaign-link-stats">
                        <div class="campaign-click-count">${clicks}</div>
                        <div class="text-xs text-gray-400">кликов</div>
                    </div>
                    <button type="button" class="campaign-delete-btn" data-delete-id="${link.id}" title="Удалить"><i class="fas fa-trash"></i></button>
                </div>`;
            }).join('');

            // bind copy buttons
            container.querySelectorAll('.campaign-copy-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const text = this.dataset.copy;
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(text).then(() => {
                            this.innerHTML = '<i class="fas fa-check"></i>';
                            setTimeout(() => { this.innerHTML = '<i class="fas fa-clone"></i>'; }, 1500);
                        });
                    } else {
                        const el = document.createElement('textarea');
                        el.value = text;
                        document.body.appendChild(el);
                        el.select();
                        document.execCommand('copy');
                        document.body.removeChild(el);
                    }
                });
            });

            // bind delete buttons
            container.querySelectorAll('.campaign-delete-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = this.dataset.deleteId;
                    showConfirm('Удалить трекинговую ссылку?', function() {
                        deleteCampaignLink(id);
                        renderCampaignLinksAdmin();
                        const currentPeriod = window.__veneraCurrentAnalyticsPeriod || 7;
                        renderAdminAnalyticsDashboard(currentPeriod);
                    });
                });
            });
        }

        function initCampaignLinksUI() {
            const form = document.getElementById('campaign-create-form');
            if (!form || form.dataset.bound) return;
            form.dataset.bound = '1';

            // Init custom source dropdown
            const srcBtn = document.getElementById('campaign-source-btn');
            const srcDrop = document.getElementById('campaign-source-drop');
            const srcDisplay = document.getElementById('campaign-source-display');
            const srcHidden = document.getElementById('campaign-source');
            if (srcBtn && srcDrop) {
                srcBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const isOpen = srcDrop.style.display !== 'none';
                    srcDrop.style.display = isOpen ? 'none' : 'block';
                });
                document.addEventListener('click', function() { if(srcDrop) srcDrop.style.display = 'none'; });
                srcDrop.querySelectorAll('.csd-opt').forEach(function(opt) {
                    opt.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const val = this.dataset.val;
                        const icon = this.dataset.icon;
                        if (srcHidden) srcHidden.value = val;
                        srcDisplay.innerHTML = val
                            ? `<i class="${icon}" style="margin-right:6px;color:rgba(255,215,0,0.8);"></i>${this.textContent.trim()}`
                            : '<span style="color:rgba(255,255,255,0.35)">Выберите источник</span>';
                        srcDrop.querySelectorAll('.csd-opt').forEach(o => o.classList.toggle('active', o === this));
                        srcDrop.style.display = 'none';
                    });
                });
            }

            form.addEventListener('submit', function(e) {
                e.preventDefault();
                const nameEl = document.getElementById('campaign-name');
                const mediumEl = document.getElementById('campaign-medium');
                const name = nameEl.value.trim();
                const source = (srcHidden ? srcHidden.value : '').trim();
                const medium = mediumEl.value.trim();
                nameEl.style.borderColor = name ? '' : 'rgba(239,68,68,0.7)';
                if (mediumEl) mediumEl.style.borderColor = medium ? '' : 'rgba(239,68,68,0.7)';
                if (srcBtn) srcBtn.style.borderColor = source ? '' : 'rgba(239,68,68,0.7)';
                if (!name || !source || !medium) {
                    const missing = [];
                    if (!name) missing.push('название');
                    if (!source) missing.push('источник');
                    if (!medium) missing.push('тип трафика');
                    alert('Заполните: ' + missing.join(', ') + '.');
                    return;
                }
                nameEl.style.borderColor = '';
                if (mediumEl) mediumEl.style.borderColor = '';
                if (srcBtn) srcBtn.style.borderColor = '';
                createCampaignLink(name, source, medium);
                form.reset();
                // Reset custom dropdown display
                if (srcDisplay) srcDisplay.innerHTML = '<span style="color:rgba(255,255,255,0.35)">Выберите источник</span>';
                if (srcDrop) srcDrop.querySelectorAll('.csd-opt').forEach(o => o.classList.remove('active'));
                renderCampaignLinksAdmin();
                const currentPeriod = window.__veneraCurrentAnalyticsPeriod || 7;
                renderAdminAnalyticsDashboard(currentPeriod);
            });
            renderCampaignLinksAdmin();
        }

        window.VENERA_ANALYTICS = {
            recordSearchAnalytics,
            recordPropertyViewAnalytics,
            recordPropertyAddedAnalytics,
            buildAnalyticsSummary,
            renderAdminAnalyticsDashboard,
            initCampaignLinksUI,
            renderCampaignLinksAdmin,
            trackCampaignClick
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
                    <div class="relative" style="position:relative">
                        <img src="${image}" alt="${title}" class="w-full h-64 object-cover">
                        <div class="property-status-overlay" data-status=""><span class="property-status-label"></span></div>
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
        applyPropertyStatuses();

        // Auto-apply statuses when localStorage changes from another tab
        window.addEventListener('storage', function(e) {
            if (e.key === PROPERTY_STATUS_KEY) {
                applyPropertyStatuses();
            }
            if (e.key === PROMO_STORAGE_KEY) {
                renderPromoCarousel();
            }
        });

        // Обновляем счётчик "Объектов в продаже" по реальному числу карточек.
        function updatePropertiesForSaleCount() {
            const count = document.querySelectorAll('.property-card').length;
            const ids = ['properties-for-sale-count', 'about-stat-3-value'];
            ids.forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.textContent = String(count);
            });
            const adminInput = document.getElementById('site-about-stat-3-value');
            if (adminInput) adminInput.value = String(count);
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

        // === Пароль доступа в админ-панель (можно изменить) ===
        const ADMIN_PASSWORD = 'venera2026';
        const ADMIN_SESSION_KEY = 'venera_admin_authenticated';
        const REALTOR_SESSION_KEY = 'venera_realtor_session';

        function clearRealtorSession() {
            try { sessionStorage.removeItem(REALTOR_SESSION_KEY); } catch(e) {}
        }

        function getRealtorSession() {
            try { return JSON.parse(sessionStorage.getItem(REALTOR_SESSION_KEY) || 'null'); } catch(e) { return null; }
        }

        function _getCurrentAgentsRuntime() {
            try {
                if (Array.isArray(agents)) return agents;
            } catch (_) {}
            return Array.isArray(window.VENERA_AGENTS_CONFIG) ? window.VENERA_AGENTS_CONFIG : [];
        }

        function renderRealtorStats(period) {
            var session = getRealtorSession();
            if (!session) return;
            var ridStr = String(session.rieltor_id);
            var allClients = typeof _getClients === 'function' ? _getClients() : [];
            var myClients = allClients.filter(function(c) { return String(c.rieltor_id || '') === ridStr; });
            var pending = myClients.filter(function(c) { return (c.status || 'pending') === 'pending'; }).length;
            var success = myClients.filter(function(c) { return c.status === 'success'; }).length;
            var reject = myClients.filter(function(c) { return c.status === 'reject'; }).length;
            var today = new Date().toISOString().slice(0, 10);
            var allNotes = typeof _getCalendarNotes === 'function' ? _getCalendarNotes() : [];
            var sharedTarget = typeof CALENDAR_TARGET_ALL_REALTORS !== 'undefined' ? CALENDAR_TARGET_ALL_REALTORS : 'all_realtors';
            var myNotes = allNotes.filter(function(n) {
                var target = String(n.realtorId || '');
                return target === ridStr || target === sharedTarget;
            });
            var upcoming = myNotes.filter(function(n) { return String(n.date || '') >= today; }).length;

            var analytics = getAnalyticsStore ? getAnalyticsStore() : { events: [] };
            var events = Array.isArray(analytics.events) ? analytics.events : [];
            var now = Date.now();
            var dayMs = 24 * 60 * 60 * 1000;

            // Resolve period to fromTs / toTs
            var periodDays = 30;
            var fromTs, toTs;
            var periodLabel = '30д';
            var viewsDaysWindow = 14;

            if (period && typeof period === 'object' && period.mode === 'custom') {
                fromTs = new Date(period.startDate + 'T00:00:00').getTime();
                toTs = new Date(period.endDate + 'T23:59:59').getTime();
                var diffDays = Math.round((toTs - fromTs) / dayMs);
                periodDays = diffDays || 1;
                var fmt = function(iso) {
                    var d = new Date(iso + 'T00:00:00');
                    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                };
                periodLabel = fmt(period.startDate) + '–' + fmt(period.endDate);
                viewsDaysWindow = Math.min(periodDays, 60);
            } else {
                periodDays = Number(period) || 30;
                fromTs = now - periodDays * dayMs;
                toTs = now;
                if (periodDays === 1) { periodLabel = '1д'; }
                else if (periodDays === 365) { periodLabel = '1 год'; }
                else { periodLabel = periodDays + 'д'; }
                viewsDaysWindow = Math.min(periodDays, 60);
            }

            // Build daily views map for chart
            var dailyViewsMap = {};
            for (var i = viewsDaysWindow - 1; i >= 0; i -= 1) {
                var d = new Date(toTs - i * dayMs);
                var key = d.toISOString().slice(0, 10);
                dailyViewsMap[key] = 0;
            }

            var views30 = 0;
            var added30 = 0;
            events.forEach(function(ev) {
                var ts = Number(ev.ts || 0);
                if (!ts || ts < fromTs || ts > toTs) return;
                var payload = ev.payload || {};
                var evRid = String(payload.rieltorId || '').trim();
                if (String(ev.type || '') === 'property_view' && evRid === ridStr) {
                    views30 += 1;
                    var dKey = new Date(ts).toISOString().slice(0, 10);
                    if (Object.prototype.hasOwnProperty.call(dailyViewsMap, dKey)) {
                        dailyViewsMap[dKey] += 1;
                    }
                }
                if (String(ev.type || '') === 'property_added' && evRid === ridStr) {
                    added30 += 1;
                }
            });

            // Calendar notes inside period
            var recentNotes = myNotes.filter(function(n) {
                var dts = Date.parse(String(n.date || '') + 'T00:00:00');
                return Number.isFinite(dts) && dts >= fromTs && dts <= toTs;
            });
            var weeksInPeriod = Math.max(1, periodDays / 7);
            var weeklyEventsAvg = recentNotes.length ? (recentNotes.length / weeksInPeriod) : 0;
            var conversion = myClients.length ? (success / myClients.length) * 100 : 0;

            var typeCounts = {};
            recentNotes.forEach(function(n) {
                var t = String(n.type || 'Другое');
                typeCounts[t] = (typeCounts[t] || 0) + 1;
            });

            // Update period labels in KPI cards
            var pLblEl = document.getElementById('realtor-period-label');
            var pLblEl2 = document.getElementById('realtor-period-label-2');
            if (pLblEl) pLblEl.textContent = periodLabel;
            if (pLblEl2) pLblEl2.textContent = periodLabel;
            var chartTitleEl = document.getElementById('realtor-views-daily-chart-title');
            if (chartTitleEl) chartTitleEl.textContent = 'Динамика просмотров (' + (viewsDaysWindow <= 1 ? '1 день' : viewsDaysWindow + ' дн') + ')';

            function setEl(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
            setEl('realtor-stat-clients', myClients.length);
            setEl('realtor-stat-pending', pending);
            setEl('realtor-stat-success', success);
            setEl('realtor-stat-upcoming', upcoming);

            setEl('realtor-stat-views-30', Number(views30 || 0).toLocaleString('ru-RU'));
            setEl('realtor-stat-added-30', Number(added30 || 0).toLocaleString('ru-RU'));
            setEl('realtor-stat-conversion', Math.round(conversion) + '%');
            setEl('realtor-stat-weekly-events', weeklyEventsAvg.toFixed(1));

            if (typeof Chart !== 'undefined') {
                var chartState = window.__veneraRealtorCharts || {};
                window.__veneraRealtorCharts = chartState;

                function setChart(chartKey, canvasId, config) {
                    if (chartState[chartKey]) {
                        chartState[chartKey].destroy();
                    }
                    var canvas = document.getElementById(canvasId);
                    if (!canvas) return;
                    chartState[chartKey] = new Chart(canvas, config);
                }

                var viewsLabels = Object.keys(dailyViewsMap);
                var viewsValues = viewsLabels.map(function(k) { return dailyViewsMap[k]; });
                setChart('realtorViewsDaily', 'realtor-views-daily-chart', {
                    type: 'line',
                    data: {
                        labels: viewsLabels.map(function(k) { return k.slice(5); }),
                        datasets: [{
                            label: 'Просмотры',
                            data: viewsValues,
                            borderColor: '#FFD700',
                            backgroundColor: 'rgba(255,215,0,0.2)',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { labels: { color: '#e5e7eb' } } },
                        scales: {
                            x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.08)' } },
                            y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.08)' }, beginAtZero: true }
                        }
                    }
                });

                setChart('realtorClientFunnel', 'realtor-client-funnel-chart', {
                    type: 'bar',
                    data: {
                        labels: ['В ожидании', 'Сделка', 'Отказ'],
                        datasets: [{
                            data: [pending, success, reject],
                            backgroundColor: ['#f59e0b', '#22c55e', '#ef4444']
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.08)' } },
                            y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.08)' }, beginAtZero: true }
                        }
                    }
                });

                var typeLabels = Object.keys(typeCounts);
                var typeValues = typeLabels.map(function(k) { return typeCounts[k]; });
                if (!typeLabels.length) {
                    typeLabels = ['Нет данных'];
                    typeValues = [1];
                }
                setChart('realtorCalendarTypes', 'realtor-calendar-type-chart', {
                    type: 'doughnut',
                    data: {
                        labels: typeLabels,
                        datasets: [{
                            data: typeValues,
                            backgroundColor: ['#a78bfa', '#34d399', '#60a5fa', '#fbbf24', '#64748b']
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { labels: { color: '#e5e7eb' } } }
                    }
                });

                var engagementViews = Math.min(100, Math.round((views30 / 120) * 100));
                var engagementEvents = Math.min(100, Math.round((weeklyEventsAvg / 10) * 100));
                var engagementConv = Math.min(100, Math.round(conversion));
                var engagementNew = Math.min(100, Math.round((added30 / 8) * 100));
                setChart('realtorEngagement', 'realtor-engagement-chart', {
                    type: 'radar',
                    data: {
                        labels: ['Просмотры', 'Планирование', 'Конверсия', 'Новые объекты'],
                        datasets: [{
                            label: 'Ваш индекс',
                            data: [engagementViews, engagementEvents, engagementConv, engagementNew],
                            borderColor: '#FFD700',
                            backgroundColor: 'rgba(255,215,0,0.18)'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { labels: { color: '#e5e7eb' } } },
                        scales: {
                            r: {
                                angleLines: { color: 'rgba(255,255,255,0.12)' },
                                grid: { color: 'rgba(255,255,255,0.12)' },
                                pointLabels: { color: '#d1d5db' },
                                ticks: { color: '#9ca3af', backdropColor: 'transparent', beginAtZero: true, max: 100 }
                            }
                        }
                    }
                });
            }
        }
        window.renderRealtorStats = renderRealtorStats;

        function _applyAdminPanelMode() {
            var panel = document.getElementById('admin-panel');
            if (!panel) return;
            panel.removeAttribute('data-realtor-mode');
            var header = document.getElementById('admin-panel-title');
            if (header) header.textContent = 'Venera Админ-панель';
            var ri = document.getElementById('realtor-panel-info');
            if (ri) ri.classList.add('hidden');
            panel.querySelectorAll('[data-admin-only]').forEach(function(el) { el.style.display = ''; });
            panel.querySelectorAll('[data-realtor-only]').forEach(function(el) { el.style.display = 'none'; });
        }

        function _applyRealtorPanelMode(rieltor_id, name, photo) {
            var panel = document.getElementById('admin-panel');
            if (!panel) return;
            panel.setAttribute('data-realtor-mode', '1');
            var header = document.getElementById('admin-panel-title');
            if (header) header.textContent = 'Панель риелтора';
            var ri = document.getElementById('realtor-panel-info');
            if (ri) {
                var nameEl = ri.querySelector('.realtor-panel-name');
                var photoEl = ri.querySelector('.realtor-panel-photo');
                if (nameEl) nameEl.textContent = name;
                if (photoEl && photo) photoEl.src = photo;
                ri.classList.remove('hidden');
            }
            panel.querySelectorAll('[data-admin-only]').forEach(function(el) { el.style.display = 'none'; });
            panel.querySelectorAll('[data-realtor-only]').forEach(function(el) { el.style.display = ''; });
            // Set calendar realtor filter
            var st = _calendarState();
            st.realtorFilter = String(rieltor_id);
        }

        function _lockBodyForPanel() {
            // In standalone admin page the panel is position:static, body scroll is needed
            var isStandalone = /admin\.html$/i.test(window.location.pathname || '') || document.body.classList.contains('admin-standalone');
            if (isStandalone) {
                document.body.style.overflow = '';
                document.body.style.touchAction = '';
            } else {
                // Fixed overlay panel — block body scroll, but keep touchAction so panel scrolls on mobile
                document.body.style.overflow = 'hidden';
                document.body.style.touchAction = '';
            }
        }

        function _openRealtorPanelAfterAuth(agent) {
            try {
                sessionStorage.setItem(REALTOR_SESSION_KEY, JSON.stringify({
                    rieltor_id: agent.rieltor_id,
                    name: agent.name,
                    photo: agent.photo || ''
                }));
            } catch(e) {}
            var adminPanel = document.getElementById('admin-panel');
            if (!adminPanel) return;
            _applyRealtorPanelMode(agent.rieltor_id, agent.name, agent.photo || '');
            adminPanel.classList.remove('hidden');
            _lockBodyForPanel();
            initAdminPanel();
            // Switch to realtor stats view
            var statsBtn = document.querySelector('[data-admin-view-target="realtor-stats-view"]');
            if (statsBtn) statsBtn.click();
            renderRealtorStats();
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

            if (typeof _cselSync === 'function') _cselSync('property-city');
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
            if (typeof _cselSync === 'function') _cselSync('property-district');
        }

        function openAdminPanelWithAuth() {
            const authModal = document.getElementById('admin-auth-modal');
            if (!authModal) return;

            const isAuthenticated = sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
            if (isAuthenticated) {
                clearRealtorSession();
                authModal.classList.add('hidden');
                const adminPanel = document.getElementById('admin-panel');
                if (!adminPanel) return;
                _applyAdminPanelMode();
                adminPanel.classList.remove('hidden');
                _lockBodyForPanel();
                initAdminPanel();
                return;
            }

            // Check for active realtor session
            const realtorSession = getRealtorSession();
            if (realtorSession && realtorSession.rieltor_id) {
                const agentsList = _getCurrentAgentsRuntime();
                const realtorAgent = agentsList.find(function(a) { return String(a.rieltor_id) === String(realtorSession.rieltor_id); });
                if (realtorAgent) {
                    authModal.classList.add('hidden');
                    _openRealtorPanelAfterAuth(realtorAgent);
                    return;
                }
            }

            const authInput = document.getElementById('admin-password-input');
            const authError = document.getElementById('admin-auth-error');
            if (authInput) authInput.value = '';
            if (authError) authError.classList.add('hidden');
            authModal.classList.remove('hidden');
            setTimeout(() => {
                if (authInput) authInput.focus();
            }, 50);
        }

        function openAdminPanelAfterAuth() {
            const adminPanel = document.getElementById('admin-panel');
            if (!adminPanel) return;

            clearRealtorSession();
            try {
                sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
            } catch (e) {
                console.log('SessionStorage not available');
            }

            _applyAdminPanelMode();
            adminPanel.classList.remove('hidden');
            _lockBodyForPanel();
            initAdminPanel();
        }

        // Admin panel functionality
        document.addEventListener('DOMContentLoaded', function() {
            const isStandaloneAdminPage = /admin\.html$/i.test(window.location.pathname || '');
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

            // Close admin panel (logout — clears session)
            closeAdminPanel.addEventListener('click', function() {
                clearRealtorSession();
                sessionStorage.removeItem(ADMIN_SESSION_KEY);
                _applyAdminPanelMode();
                if (isStandaloneAdminPage || document.body.classList.contains('admin-standalone')) {
                    window.location.href = 'index.html';
                    return;
                }
                adminPanel.classList.add('hidden');
                document.body.style.overflow = '';
                document.body.style.touchAction = '';
                document.body.style.position = '';
            });

            // Logo click — go to main page WITHOUT clearing session (minimize only)
            const adminLogoHome = document.getElementById('admin-logo-home');
            if (adminLogoHome) {
                adminLogoHome.addEventListener('click', function(e) {
                    e.preventDefault();
                    // Hide panel but keep session alive
                    adminPanel.classList.add('hidden');
                    document.body.style.overflow = '';
                    document.body.style.touchAction = '';
                    document.body.style.position = '';
                    // Navigate to main page (for standalone admin page)
                    if (isStandaloneAdminPage || document.body.classList.contains('admin-standalone')) {
                        window.location.href = 'index.html';
                    }
                });
            }

            // Initialize admin panel
            initAdminPanel();

            const authModal = document.getElementById('admin-auth-modal');
            const authInput = document.getElementById('admin-password-input');
            const authError = document.getElementById('admin-auth-error');
            const authSubmitBtn = document.getElementById('admin-auth-submit');
            const authCancelBtn = document.getElementById('admin-auth-cancel');

            function attemptAdminLogin() {
                if (!authInput || !authError) return;

                if (authInput.value === ADMIN_PASSWORD) {
                    clearRealtorSession();
                    openAdminPanelAfterAuth();
                    if (authModal) authModal.classList.add('hidden');
                    return;
                }

                // Check realtor passwords
                const runtimeAgents = _getCurrentAgentsRuntime();
                const matchedRuntimeAgent = runtimeAgents.find(function(a) { return a && a.password && authInput.value === a.password; });
                if (matchedRuntimeAgent) {
                    if (authModal) authModal.classList.add('hidden');
                    _openRealtorPanelAfterAuth(matchedRuntimeAgent);
                    return;
                }

                // Fallback for legacy static config passwords
                const allAgentsCfg = Array.isArray(window.VENERA_AGENTS_CONFIG) ? window.VENERA_AGENTS_CONFIG : [];
                const matchedCfgAgent = allAgentsCfg.find(function(a) { return a.password && authInput.value === a.password; });
                if (matchedCfgAgent) {
                    const runtimeAgent = runtimeAgents.find(function(a) { return String(a.rieltor_id) === String(matchedCfgAgent.rieltor_id); });
                    const matchedAgent = runtimeAgent
                        ? Object.assign({}, matchedCfgAgent, runtimeAgent, { password: runtimeAgent.password || matchedCfgAgent.password })
                        : matchedCfgAgent;
                    if (authModal) authModal.classList.add('hidden');
                    _openRealtorPanelAfterAuth(matchedAgent);
                    return;
                }

                authError.classList.remove('hidden');
                authInput.value = '';
                authInput.focus();
            }

            const passwordToggleBtn = document.getElementById('admin-password-toggle');
            if (passwordToggleBtn && authInput) {
                passwordToggleBtn.addEventListener('click', function() {
                    const icon = passwordToggleBtn.querySelector('i');
                    if (authInput.type === 'password') {
                        authInput.type = 'text';
                        if (icon) {
                            icon.classList.remove('fa-eye');
                            icon.classList.add('fa-eye-slash');
                        }
                    } else {
                        authInput.type = 'password';
                        if (icon) {
                            icon.classList.remove('fa-eye-slash');
                            icon.classList.add('fa-eye');
                        }
                    }
                });
            }

            if (authSubmitBtn) {
                authSubmitBtn.addEventListener('click', attemptAdminLogin);
            }

            if (authInput) {
                authInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') attemptAdminLogin();
                });
            }

            if (authModal && authCancelBtn) {
                authCancelBtn.addEventListener('click', function() {
                    clearRealtorSession();
                    sessionStorage.removeItem(ADMIN_SESSION_KEY);
                    if (isStandaloneAdminPage || document.body.classList.contains('admin-standalone')) {
                        window.location.href = 'index.html';
                        return;
                    }
                    authModal.classList.add('hidden');
                });
            }

            if (isStandaloneAdminPage || document.body.classList.contains('admin-standalone')) {
                openAdminPanelWithAuth();
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
            const statusStore = getPropertyStatusStore();
            
            document.querySelectorAll('.property-card').forEach((card, index) => {
                const title = card.querySelector('h3').textContent;
                const imageSrc = card.querySelector('img').src;
                const price = card.querySelector('.price-tag').textContent;
                const type = card.querySelector('.type-tag').textContent;
                const cardId = card.dataset.id || '';
                const isHidden = !!(statusStore[cardId] && statusStore[cardId].hidden);
                const eyeIcon = isHidden ? 'fa-eye-slash' : 'fa-eye';
                const eyeOpacity = isHidden ? '0.4' : '0.8';
                const propertyDiv = document.createElement('div');
                propertyDiv.className = 'flex flex-col admin-property-card h-full';
                propertyDiv.style.cssText = 'background:linear-gradient(160deg,rgba(0,0,0,0.55) 0%,rgba(10,10,10,0.45) 100%);border:1px solid rgba(255,215,0,0.25);backdrop-filter:blur(14px);border-radius:18px;overflow:hidden;';
                propertyDiv.dataset.id = cardId;
                propertyDiv.innerHTML = `
                    <div class="flex flex-col flex-grow" style="padding:16px;">
                        <div class="relative mb-3 overflow-hidden" style="border-radius:12px;">
                            <img src="${card.dataset.mainPhoto || imageSrc}" alt="${title}" class="w-full h-40 object-cover" style="display:block;">
                            <div class="absolute top-2 left-2 text-xs px-2 py-1" style="background:rgba(0,0,0,0.7);color:rgba(255,215,0,0.9);border-radius:6px;font-weight:600;">${type}</div>
                            <div class="absolute top-2 right-2 text-xs font-bold px-2 py-1" style="background:linear-gradient(90deg,#c8a84b,#ffd700);color:#000;border-radius:6px;">${price}</div>
                        </div>
                        <h4 style="font-size:0.88rem;font-weight:700;color:#fff;margin:0 0 6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${title}</h4>
                        <div style="font-size:0.72rem;color:rgba(255,215,0,0.6);display:flex;align-items:center;gap:4px;margin-bottom:auto;">
                            <i class="fas fa-map-marker-alt" style="flex-shrink:0;"></i>
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${card.dataset.fullAddress || card.dataset.address || ''}</span>
                        </div>
                        <div class="flex gap-2 mt-3">
                            <button class="edit-property admin-btn-edit flex-1 py-2 text-xs font-medium" data-index="${index}">Изменить</button>
                            <button class="toggle-hide-property admin-btn-eye py-2 text-xs" data-index="${index}" data-id="${cardId}" title="${isHidden ? 'Показать' : 'Скрыть'}">
                                <i class="fas ${eyeIcon}" style="opacity:${eyeOpacity};"></i>
                            </button>
                            <button class="delete-property admin-btn-del flex-1 py-2 text-xs font-medium" data-index="${index}">Удалить</button>
                        </div>
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

                const agentStore = getAgentStatusStore();
                const isHidden = !!(agentStore[agentId] && agentStore[agentId].hidden);
                const hiddenClass = isHidden ? 'active-hidden' : '';
                const hiddenLabel = isHidden ? 'Показать' : 'Скрыть';

                const socials = [
                    agent.whatsapp ? `<a href="https://wa.me/${agent.whatsapp.replace(/\D/g,'')}" target="_blank" style="color:#ffd700;opacity:0.8;" title="WhatsApp"><i class="fab fa-whatsapp" style="font-size:1.1rem;"></i></a>` : '',
                    agent.telegram ? `<a href="https://t.me/${agent.telegram.replace(/^@/,'')}" target="_blank" style="color:#ffd700;opacity:0.8;" title="Telegram"><i class="fab fa-telegram" style="font-size:1.1rem;"></i></a>` : '',
                    agent.viber   ? `<a href="viber://chat?number=${agent.viber.replace(/\D/g,'')}" style="color:#ffd700;opacity:0.8;" title="Viber"><i class="fab fa-viber" style="font-size:1.1rem;"></i></a>` : ''
                ].filter(Boolean).join('');

                const agentDiv = document.createElement('div');
                agentDiv.className = 'flex flex-col h-full';
                agentDiv.style.cssText = 'background:linear-gradient(160deg,rgba(0,0,0,0.55) 0%,rgba(10,10,10,0.45) 100%);border:1px solid rgba(255,215,0,0.25);backdrop-filter:blur(14px);border-radius:18px;overflow:hidden;';
                agentDiv.innerHTML = `
                    <div class="flex flex-col flex-grow" style="padding:18px;">
                        <div class="flex items-center gap-4 mb-4">
                            <div style="flex-shrink:0;width:68px;height:68px;border-radius:50%;border:2px solid rgba(255,215,0,0.5);padding:2px;background:rgba(0,0,0,0.3);">
                                <img src="${agent.photo}" alt="${agent.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">
                            </div>
                            <div class="min-w-0 flex-1">
                                <h4 style="font-size:0.95rem;font-weight:700;color:#fff;margin:0 0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${agent.name}</h4>
                                <p style="font-size:0.75rem;color:rgba(255,215,0,0.75);margin:0 0 6px;">${agent.position}</p>
                                ${socials ? `<div style="display:flex;gap:10px;align-items:center;">${socials}</div>` : ''}
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                            <div style="background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.15);border-radius:10px;padding:8px 10px;">
                                <div style="font-size:0.65rem;color:rgba(255,215,0,0.6);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;"><i class="fas fa-phone" style="margin-right:4px;"></i>Телефон</div>
                                <div style="font-size:0.75rem;color:#fff;word-break:break-all;">${agent.phone || '—'}</div>
                            </div>
                            <div style="background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.15);border-radius:10px;padding:8px 10px;text-align:center;">
                                <div style="font-size:0.65rem;color:rgba(255,215,0,0.6);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Объектов</div>
                                <div style="font-size:1.3rem;font-weight:700;color:#ffd700;line-height:1;">${exactCount}</div>
                            </div>
                        </div>
                        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:7px 10px;margin-bottom:auto;">
                            <i class="fas fa-envelope" style="color:rgba(255,215,0,0.5);margin-right:6px;font-size:0.7rem;"></i>
                            <span style="font-size:0.75rem;color:rgba(255,255,255,0.6);">${agent.email || 'Email не указан'}</span>
                        </div>
                        <div class="flex gap-2 mt-3">
                            <button class="edit-agent admin-btn-edit flex-1 py-2 text-xs font-medium" data-index="${index}">Изменить</button>
                            <button class="hide-agent prop-status-btn flex-1 py-2 text-xs font-medium ${hiddenClass}" data-rieltor-id="${agentId}" style="flex:none;width:auto;padding:6px 12px;">
                                <i class="fas fa-eye-slash" style="margin-right:4px;"></i>${hiddenLabel}
                            </button>
                            <button class="delete-agent admin-btn-del flex-1 py-2 text-xs font-medium" data-index="${index}">Удалить</button>
                        </div>
                    </div>
                `;
                agentsList.appendChild(agentDiv);
            });
        }
        
        // Property edit modal functions
        function _applyPropertyStatusButtons(status, hidden) {
            const inp = document.getElementById('property-status-val');
            const hidInp = document.getElementById('property-hidden-val');
            if (inp) inp.value = status;
            if (hidInp) hidInp.value = hidden ? '1' : '';
            const btnSold = document.getElementById('prop-btn-sold');
            const btnReserved = document.getElementById('prop-btn-reserved');
            const btnHidden = document.getElementById('prop-btn-hidden');
            if (btnSold) btnSold.classList.toggle('active-sold', status === 'sold');
            if (btnReserved) btnReserved.classList.toggle('active-reserved', status === 'reserved');
            if (btnHidden) btnHidden.classList.toggle('active-hidden', hidden);
        }

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

                // Load status from store
                const _statusStore = getPropertyStatusStore();
                const _curEntry = _statusStore[card.dataset.id] || {};
                _applyPropertyStatusButtons(_curEntry.status || '', !!_curEntry.hidden);
                _applyPropertyMarkerButtons(_curEntry);
            } else {
                // Add new property
                title.textContent = 'Добавить объект';
                document.getElementById('property-edit-form').reset();
                // Show the next auto-assigned ID immediately
                document.getElementById('property-id').value = getCurrentMaxPropertyIdNumber() + 1;
                
                // Reset realtor dropdown to first option
                document.getElementById('property-rieltor-id').selectedIndex = 0;
                document.getElementById('property-listing-mode').value = 'sale';
                populateCitySelect();
                populateDistrictSelect();
                syncPropertyConfigTemplateSelection();
                _applyPropertyStatusButtons('', false);
                _applyPropertyMarkerButtons({});
            }

            if (snippetField) {
                snippetField.value = '';
            }

            if (typeof _cselSync === 'function') {
                ['property-listing-mode', 'property-type', 'property-condition', 'property-rieltor-id',
                 'property-city', 'property-district'].forEach(id => _cselSync(id));
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
            
            // Add agents as options (deduplicate by rieltor_id)
            const seen = new Set();
            agents.forEach(agent => {
                const rid = String(agent.rieltor_id);
                if (seen.has(rid)) return;
                seen.add(rid);
                const option = document.createElement('option');
                option.value = agent.rieltor_id;
                option.textContent = `${agent.rieltor_id}: ${agent.name} (${agent.position})`;
                realtorSelect.appendChild(option);
            });
            if (typeof _cselSync === 'function') _cselSync('property-rieltor-id');
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
                showToast('Не удалось добавить объект в каталог', 'error');
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
            showToast('Объект ' + appendResult.propertyId + ' добавлен в каталог (предпросмотр)');
        }

        function savePropertyDraft() {
            const draft = collectPropertyFormData();
            localStorage.setItem(PROPERTY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
            showToast('Черновик сохранён локально в браузере');
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
                photo: document.getElementById('agent-photo').value.trim(),
                password: ((document.getElementById('agent-password') || {}).value || '').trim()
            };
        }

        function generateAgentPassword(rieltorId) {
            var rid = String(rieltorId || '').replace(/\D/g, '').trim() || String(Math.floor(1000 + Math.random() * 9000));
            var suffix = Math.random().toString(36).slice(2, 6);
            return 'agent' + rid + suffix;
        }
        window.generateAgentPassword = generateAgentPassword;

        function getConfiguredAgentPassword(rieltorId) {
            var rid = String(rieltorId || '').trim();
            if (!rid) return '';
            var cfgAgents = Array.isArray(window.VENERA_AGENTS_CONFIG) ? window.VENERA_AGENTS_CONFIG : [];
            var cfgAgent = cfgAgents.find(function(a) { return String(a.rieltor_id || '').trim() === rid; });
            return cfgAgent && cfgAgent.password ? String(cfgAgent.password).trim() : '';
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
            const passwordWrap = document.getElementById('agent-password-wrap');
            const passwordField = document.getElementById('agent-password');
            const passwordGenerateBtn = document.getElementById('agent-password-generate');

            var panel = document.getElementById('admin-panel');
            var isRealtorMode = !!(panel && panel.getAttribute('data-realtor-mode') === '1');
            if (passwordWrap) passwordWrap.style.display = isRealtorMode ? 'none' : '';

            if (passwordGenerateBtn && !passwordGenerateBtn.dataset.bound) {
                passwordGenerateBtn.dataset.bound = '1';
                passwordGenerateBtn.addEventListener('click', function() {
                    var ridVal = ((document.getElementById('agent-rieltor-id') || {}).value || '').trim();
                    if (passwordField) passwordField.value = generateAgentPassword(ridVal);
                });
            }

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
                if (passwordField) passwordField.value = String(agent.password || '').trim() || getConfiguredAgentPassword(agent.rieltor_id);
            } else {
                // Add new agent
                title.textContent = 'Добавить риелтора';
                document.getElementById('agent-edit-form').reset();
                document.getElementById('agent-id').value = '';
                // Auto-generate next rieltor_id
                const nextRieltorId = getCurrentMaxAgentIdNumber(agents) + 1;
                const rieltorIdField = document.getElementById('agent-rieltor-id');
                if (rieltorIdField) rieltorIdField.value = nextRieltorId;
                if (passwordField) passwordField.value = generateAgentPassword(nextRieltorId);
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

            // Save and apply property status (sold / reserved / hidden)
            const _propStatusVal = (document.getElementById('property-status-val') || {}).value || '';
            const _propHiddenVal = (document.getElementById('property-hidden-val') || {}).value || '';
            const _statusStore = getPropertyStatusStore();
            const _savedCardId = isNew
                ? document.querySelector('.property-card:last-child')?.dataset.id
                : cardId;
            if (_savedCardId) {
                var _mHotprice = (document.getElementById('property-marker-hotprice') || {}).value === '1';
                var _mDiscount = (document.getElementById('property-marker-discount') || {}).value === '1';
                var _mExclusive = (document.getElementById('property-marker-exclusive') || {}).value === '1';
                var _mDiscountPrice = (document.getElementById('property-discount-price') || {}).value || '';
                if (_propStatusVal || _propHiddenVal === '1' || _mHotprice || _mDiscount || _mExclusive) {
                    _statusStore[_savedCardId] = {
                        status: _propStatusVal, hidden: _propHiddenVal === '1',
                        hotprice: _mHotprice, discount: _mDiscount, exclusive: _mExclusive,
                        discountPrice: _mDiscount ? _mDiscountPrice : ''
                    };
                } else {
                    delete _statusStore[_savedCardId];
                }
                savePropertyStatusStore(_statusStore);
            }
            applyPropertyStatuses();
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
            showToast(isNew ? 'Объект добавлен в каталог' : 'Объект обновлён');
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
                rieltor_id: document.getElementById('agent-rieltor-id').value,
                password: ((document.getElementById('agent-password') || {}).value || '').trim() || generateAgentPassword(document.getElementById('agent-rieltor-id').value)
            };
            
            // Update realtor dropdown in property edit form
            populateRealtorDropdown();
            
            if (isNew) {
                // Add new agent (in a real app, this would update the database)
                console.log('Adding new agent:', agentData);
                showToast('Новый риелтор добавлен!');
            } else {
                // Update existing agent (in a real app, this would update the database)
                console.log('Updating agent at index:', index, agentData);
                showToast('Данные риелтора обновлены!');
            }
            
            closeAgentEditModal();
            return false;
        }
        
        // Delete property - реально удаляет карточку из каталога
        function deleteProperty(index) {
            showConfirm('Удалить этот объект из каталога?', function() {
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
            });
        }

        // Delete agent - реально удаляет риелтора из списка
        function deleteAgent(index) {
            showConfirm('Удалить этого риелтора?', function() {
                var removed = agents[index] || null;
                var removedRid = removed ? String(removed.rieltor_id || '').trim() : '';
                agents.splice(index, 1);
                agentCounter = getCurrentMaxAgentIdNumber(agents);
                if (removedRid) {
                    _forceClientOwnerToCompany(removedRid);
                    if (typeof window.renderClientsAdmin === 'function') window.renderClientsAdmin();
                }
                if (typeof _refreshClientCatalogSelects === 'function') _refreshClientCatalogSelects();
                if (typeof populateRealtorDropdown === 'function') populateRealtorDropdown();
                if (typeof window.renderCalendarAdmin === 'function') window.renderCalendarAdmin();
                if (typeof countAgentProperties === 'function') countAgentProperties();
                if (typeof renderAgents === 'function') renderAgents();
                if (typeof renderAgentsList === 'function') renderAgentsList();
            });
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
                password: String(agent.password || '').trim(),
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
                // Skip cards hidden by admin
                if (card.dataset.propHidden === '1') {
                    card.classList.remove('visible');
                    return;
                }
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
            
            // Render visible agents (skip hidden ones)
            const agentStatusStore = getAgentStatusStore();
            visibleAgents.forEach(agent => {
                const agentKey = String(agent.rieltor_id || '');
                if (agentStatusStore[agentKey] && agentStatusStore[agentKey].hidden) return;
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
                    // If agent is hidden, hide the badge entirely
                    if (isAgentHidden(rieltorId)) {
                        var badge = img.closest('.agent-badge');
                        if (badge) badge.style.display = 'none';
                    } else {
                        var badge = img.closest('.agent-badge');
                        if (badge) badge.style.display = '';
                        img.src = agent.photo;
                        img.alt = agent.name;
                    }
                }
            });
        }

        // ─── Promo Carousel ──────────────────────────────────────────────────────────
        const PROMO_STORAGE_KEY = 'venera_promo_slides_v7';
        const PROMO_HIDDEN_KEY = 'venera_promo_hidden_v1';

        function getPromoSlides() {
            try {
                var raw = localStorage.getItem(PROMO_STORAGE_KEY);
                var data = raw ? JSON.parse(raw) : null;
                if (Array.isArray(data) && data.length) return data;
            } catch (_) {}
            // Demo slides
            var demo = [
                { type: 'image', url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80', alt: 'Премиум недвижимость', link: '' },
                { type: 'video', url: 'image/add/promo-realestate.mp4', alt: 'Недвижимость', link: '' },
                { type: 'video', url: 'image/add/promo-venera.mp4', alt: 'Venera Rielt', link: '' },
                { type: 'image', url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80', alt: 'Элитный дом', link: '' }
            ];
            savePromoSlides(demo);
            return demo;
        }

        function savePromoSlides(slides) {
            try { localStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify(slides)); } catch (_) {}
        }

        function renderPromoCarousel() {
            var slides = getPromoSlides();
            var hidden = localStorage.getItem(PROMO_HIDDEN_KEY) === '1';
            var section = document.getElementById('promo-section');
            var container = document.getElementById('promo-carousel');
            var dotsContainer = document.getElementById('promo-dots');
            if (!section || !container) return;

            if (!slides.length || hidden) {
                section.style.display = 'none';
                return;
            }
            section.style.display = '';

            container.innerHTML = '';
            if (dotsContainer) dotsContainer.innerHTML = '';

            slides.forEach(function(slide, i) {
                if (slide.hidden) return; // skip hidden slides
                var el = document.createElement('div');
                el.className = 'promo-slide' + (i === 0 ? ' active' : '');
                if (slide.type === 'video') {
                    el.innerHTML = '<video autoplay muted playsinline preload="auto" class="promo-media"><source src="' + slide.url + '" type="video/mp4"></video>' +
                        '<div class="promo-video-controls">' +
                        '<button class="promo-vc-btn promo-vc-play" title="Пауза"><i class="fas fa-pause"></i></button>' +
                        '<input type="range" class="promo-vc-seek" min="0" max="100" value="0" step="0.1">' +
                        '<button class="promo-vc-btn promo-vc-mute" title="Звук"><i class="fas fa-volume-mute"></i></button>' +
                        '</div>';
                    var vid = el.querySelector('video');
                    var playBtn = el.querySelector('.promo-vc-play');
                    var seekBar = el.querySelector('.promo-vc-seek');
                    var muteBtn = el.querySelector('.promo-vc-mute');
                    vid.addEventListener('ended', function() { goToPromoSlide(_promoCurrentIndex + 1); });
                    playBtn.addEventListener('click', function(ev) {
                        ev.stopPropagation();
                        if (vid.paused) { vid.play(); playBtn.innerHTML = '<i class="fas fa-pause"></i>'; }
                        else { vid.pause(); playBtn.innerHTML = '<i class="fas fa-play"></i>'; }
                    });
                    muteBtn.addEventListener('click', function(ev) {
                        ev.stopPropagation();
                        vid.muted = !vid.muted;
                        muteBtn.innerHTML = vid.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
                    });
                    vid.addEventListener('timeupdate', function() {
                        if (vid.duration) seekBar.value = (vid.currentTime / vid.duration) * 100;
                    });
                    seekBar.addEventListener('input', function(ev) {
                        ev.stopPropagation();
                        if (vid.duration) vid.currentTime = (seekBar.value / 100) * vid.duration;
                    });
                    seekBar.addEventListener('click', function(ev) { ev.stopPropagation(); });
                } else {
                    el.innerHTML = '<img src="' + slide.url + '" alt="' + (slide.alt || 'Реклама') + '" class="promo-media">';
                }
                if (slide.link) {
                    el.style.cursor = 'pointer';
                    el.addEventListener('click', function() { window.open(slide.link, '_blank'); });
                }
                container.appendChild(el);

                if (dotsContainer && slides.length > 1) {
                    var dot = document.createElement('button');
                    dot.className = 'promo-dot' + (i === 0 ? ' active' : '');
                    dot.dataset.index = i;
                    dot.addEventListener('click', function() { goToPromoSlide(i); });
                    dotsContainer.appendChild(dot);
                }
            });

            // Auto-play video on first slide
            var firstVideo = container.querySelector('.promo-slide.active video');
            if (firstVideo) {
                firstVideo.play().catch(function() {});
                // Don't start timer — wait for ended event
            } else {
                startPromoAutoplay();
            }

            // Hide nav if only 1 visible slide
            var visibleCount = slides.filter(function(s) { return !s.hidden; }).length;
            var navBtns = section.querySelectorAll('.promo-nav');
            navBtns.forEach(function(b) { b.style.display = visibleCount > 1 ? '' : 'none'; });
        }

        var _promoAutoplayTimer = null;
        var _promoCurrentIndex = 0;

        function goToPromoSlide(index) {
            var slides = document.querySelectorAll('#promo-carousel .promo-slide');
            var dots = document.querySelectorAll('#promo-dots .promo-dot');
            if (!slides.length) return;
            _promoCurrentIndex = ((index % slides.length) + slides.length) % slides.length;

            slides.forEach(function(s, i) {
                s.classList.toggle('active', i === _promoCurrentIndex);
                var vid = s.querySelector('video');
                if (vid) {
                    if (i === _promoCurrentIndex) { vid.currentTime = 0; vid.play().catch(function() {}); }
                    else vid.pause();
                }
            });
            dots.forEach(function(d, i) { d.classList.toggle('active', i === _promoCurrentIndex); });

            // For video slides: no timer, wait for ended event. For images: use timer.
            var activeSlide = slides[_promoCurrentIndex];
            var activeVid = activeSlide ? activeSlide.querySelector('video') : null;
            if (activeVid) {
                clearInterval(_promoAutoplayTimer);
            } else {
                resetPromoAutoplay();
            }
        }

        function startPromoAutoplay() {
            clearInterval(_promoAutoplayTimer);
            _promoAutoplayTimer = setInterval(function() {
                goToPromoSlide(_promoCurrentIndex + 1);
            }, 5000);
        }

        function resetPromoAutoplay() {
            clearInterval(_promoAutoplayTimer);
            startPromoAutoplay();
        }

        // Nav buttons
        document.addEventListener('click', function(e) {
            if (e.target.closest('.promo-prev')) goToPromoSlide(_promoCurrentIndex - 1);
            if (e.target.closest('.promo-next')) goToPromoSlide(_promoCurrentIndex + 1);
        });

        function ensureAdminMediaPreviewModal() {
            var existing = document.getElementById('admin-media-preview-modal');
            if (existing) return existing;

            var modal = document.createElement('div');
            modal.id = 'admin-media-preview-modal';
            modal.className = 'hidden';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:350;display:flex;align-items:center;justify-content:center;padding:24px;';
            modal.innerHTML =
                '<button id="admin-media-preview-close" type="button" aria-label="Закрыть" style="position:absolute;top:16px;right:18px;color:#fff;font-size:32px;line-height:1;background:transparent;border:none;cursor:pointer;">&times;</button>' +
                '<div id="admin-media-preview-content" style="max-width:min(1200px,95vw);max-height:90vh;width:auto;height:auto;"></div>';
            document.body.appendChild(modal);
            return modal;
        }

        function closeAdminMediaPreview() {
            var modal = document.getElementById('admin-media-preview-modal');
            var content = document.getElementById('admin-media-preview-content');
            if (!modal || !content) return;
            content.innerHTML = '';
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }

        function openAdminMediaPreview(type, src) {
            if (!src) return;
            var modal = ensureAdminMediaPreviewModal();
            var content = document.getElementById('admin-media-preview-content');
            if (!modal || !content) return;

            if (type === 'video') {
                content.innerHTML = '<video src="' + src + '" controls autoplay style="max-width:95vw;max-height:90vh;border-radius:12px;display:block;"></video>';
            } else {
                content.innerHTML = '<img src="' + src + '" alt="Превью" style="max-width:95vw;max-height:90vh;border-radius:12px;display:block;object-fit:contain;">';
            }

            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }

        // ─── Promo Admin ────────────────────────────────────────────────────────────
        function renderPromoAdmin() {
            var list = document.getElementById('promo-admin-list');
            if (!list) return;
            // Update visibility toggle button
            var isHidden = localStorage.getItem(PROMO_HIDDEN_KEY) === '1';
            var toggleBtn = document.getElementById('promo-toggle-visibility-btn');
            var toggleLabel = document.getElementById('promo-toggle-label');
            var toggleIcon = document.getElementById('promo-toggle-icon');
            if (toggleBtn) {
                toggleBtn.style.borderColor = isHidden ? '#ffd700' : '';
                toggleBtn.style.color = isHidden ? '#ffd700' : '';
            }
            if (toggleLabel) toggleLabel.textContent = isHidden ? 'Показать раздел' : 'Скрыть раздел';
            if (toggleIcon) { toggleIcon.className = isHidden ? 'fas fa-eye' : 'fas fa-eye-slash'; }
            var slides = getPromoSlides();
            list.innerHTML = '';
            slides.forEach(function(slide, i) {
                var div = document.createElement('div');
                div.className = 'promo-admin-item';
                var preview = slide.type === 'video'
                    ? '<video src="' + slide.url + '" muted class="promo-admin-thumb admin-click-preview" data-preview-type="video" data-preview-src="' + slide.url + '" style="cursor:zoom-in;"></video>'
                    : '<img src="' + slide.url + '" class="promo-admin-thumb admin-click-preview" data-preview-type="image" data-preview-src="' + slide.url + '" style="cursor:zoom-in;">';
                var mediaWrap = document.createElement('div');
                mediaWrap.className = 'promo-admin-media-wrap';
                mediaWrap.innerHTML = preview +
                    '<span class="promo-admin-overlay-type">' + (slide.type === 'video' ? 'Видео' : 'Фото') + '</span>' +
                    (slide.hidden ? '<span class="promo-admin-overlay-icon" aria-hidden="true"><i class="fas fa-eye-slash"></i></span>' : '');
                div.innerHTML =
                    mediaWrap.outerHTML +
                    '<div class="promo-admin-info">' +
                        '<span class="promo-admin-type">' + (slide.type === 'video' ? 'Видео' : 'Фото') + '</span>' +
                        (slide.hidden ? '<span class="promo-admin-hidden-label" style="color:#f97316;font-size:0.75rem;margin-left:6px;"><i class="fas fa-eye-slash"></i> Скрыт</span>' : '') +
                        (slide.link ? '<span class="promo-admin-link" title="' + slide.link + '"><i class="fas fa-link"></i></span>' : '') +
                    '</div>' +
                    '<div class="promo-admin-actions">' +
                        '<button class="promo-slide-toggle admin-btn-eye" data-i="' + i + '" title="' + (slide.hidden ? 'Показать слайд' : 'Скрыть слайд') + '"><i class="fas ' + (slide.hidden ? 'fa-eye' : 'fa-eye-slash') + '"></i></button>' +
                        '<button class="promo-move-up admin-btn-eye" data-i="' + i + '" title="Вверх"><i class="fas fa-arrow-up"></i></button>' +
                        '<button class="promo-move-down admin-btn-eye" data-i="' + i + '" title="Вниз"><i class="fas fa-arrow-down"></i></button>' +
                        '<button class="promo-delete admin-btn-del" data-i="' + i + '" title="Удалить"><i class="fas fa-trash"></i></button>' +
                    '</div>';
                if (slide.hidden) div.classList.add('promo-admin-item--hidden');
                list.appendChild(div);
            });
        }

        // Initialize main map when page loads
        document.addEventListener('DOMContentLoaded', function() {
            trackVisitEvent();
            trackCampaignClick();
            syncCityDistrictCatalog();
            populateSearchCitySelect();
            populateCitySelect();
            countAgentProperties();
            renderAgents();
            initMainMap();
            updateAgentPhotos();
            renderPromoCarousel();
            applySiteContentSettings();

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

            // Apply property statuses after all DOM setup
            applyPropertyStatuses();
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

            // Toggle hide property (eye button in admin list)
            if (e.target.closest('.toggle-hide-property')) {
                const btn = e.target.closest('.toggle-hide-property');
                const pid = btn.dataset.id;
                if (pid) {
                    const store = getPropertyStatusStore();
                    const cur = store[pid] || {};
                    cur.hidden = !cur.hidden;
                    if (!cur.status && !cur.hidden && !cur.hotprice && !cur.discount && !cur.exclusive) {
                        delete store[pid];
                    } else {
                        store[pid] = cur;
                    }
                    savePropertyStatusStore(store);
                    applyPropertyStatuses();
                    renderPropertiesList();
                    if (typeof pushSharedSnapshot === 'function') pushSharedSnapshot();
                }
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

            // Hide/show agent
            if (e.target.closest('.hide-agent')) {
                const btn = e.target.closest('.hide-agent');
                const rid = btn.dataset.rieltorId;
                if (rid) {
                    const store = getAgentStatusStore();
                    const cur = store[rid] || {};
                    if (cur.hidden) {
                        delete store[rid];
                    } else {
                        store[rid] = { hidden: true };
                        _forceClientOwnerToCompany(rid);
                    }
                    saveAgentStatusStore(store);
                    renderAgentsList();
                    renderAgents();
                    updateAgentPhotos();
                    if (typeof window.renderClientsAdmin === 'function') window.renderClientsAdmin();
                    if (typeof _refreshClientCatalogSelects === 'function') _refreshClientCatalogSelects();
                    if (typeof populateRealtorDropdown === 'function') populateRealtorDropdown();
                    if (typeof window.renderCalendarAdmin === 'function') window.renderCalendarAdmin();
                }
            }

            // Site requests actions
            if (e.target.id === 'admin-messages-refresh' || e.target.closest('#admin-messages-refresh')) {
                if (typeof window.renderMessagesAdmin === 'function') window.renderMessagesAdmin();
            }
            if (e.target.id === 'admin-messages-clear-read' || e.target.closest('#admin-messages-clear-read')) {
                if (typeof window.deleteReadMessages === 'function') window.deleteReadMessages();
            }
            if (e.target.closest('.message-delete-btn')) {
                var messageId = e.target.closest('.message-delete-btn').dataset.messageId;
                if (messageId && typeof window.deleteMessage === 'function') window.deleteMessage(messageId);
            }

            // About media manager
            if (e.target.id === 'site-about-src-file-btn' || e.target.closest('#site-about-src-file-btn')) {
                var aboutFileBtn = document.getElementById('site-about-src-file-btn');
                var aboutUrlBtn = document.getElementById('site-about-src-url-btn');
                var aboutFileRow = document.getElementById('site-about-src-file-row');
                var aboutUrlRow = document.getElementById('site-about-src-url-row');
                if (aboutFileBtn) { aboutFileBtn.classList.remove('cal-btn-cancel'); aboutFileBtn.classList.add('cal-btn-primary'); }
                if (aboutUrlBtn) { aboutUrlBtn.classList.remove('cal-btn-primary'); aboutUrlBtn.classList.add('cal-btn-cancel'); }
                if (aboutFileRow) aboutFileRow.classList.remove('hidden');
                if (aboutUrlRow) aboutUrlRow.classList.add('hidden');
                return;
            }

            if (e.target.id === 'site-about-src-url-btn' || e.target.closest('#site-about-src-url-btn')) {
                var aboutFileBtn2 = document.getElementById('site-about-src-file-btn');
                var aboutUrlBtn2 = document.getElementById('site-about-src-url-btn');
                var aboutFileRow2 = document.getElementById('site-about-src-file-row');
                var aboutUrlRow2 = document.getElementById('site-about-src-url-row');
                if (aboutUrlBtn2) { aboutUrlBtn2.classList.remove('cal-btn-cancel'); aboutUrlBtn2.classList.add('cal-btn-primary'); }
                if (aboutFileBtn2) { aboutFileBtn2.classList.remove('cal-btn-primary'); aboutFileBtn2.classList.add('cal-btn-cancel'); }
                if (aboutUrlRow2) aboutUrlRow2.classList.remove('hidden');
                if (aboutFileRow2) aboutFileRow2.classList.add('hidden');
                return;
            }

            if (e.target.id === 'site-about-photo-add-btn' || e.target.closest('#site-about-photo-add-btn')) {
                var aboutFileInp = document.getElementById('site-about-photo-add-file');
                if (!aboutFileInp || !aboutFileInp.files || !aboutFileInp.files[0]) {
                    showToast('Выберите файл для загрузки', 'error'); return;
                }
                var aboutFile = aboutFileInp.files[0];
                var aboutType = aboutFile.type.startsWith('video/') ? 'video' : 'image';
                var aboutMaxMB = aboutType === 'video' ? 50 : 5;
                if (aboutFile.size > aboutMaxMB * 1024 * 1024) {
                    showToast('Файл слишком большой (макс. ' + aboutMaxMB + ' МБ)', 'error'); return;
                }
                _saveAboutMediaToCache(aboutFile).then(function(savedUrl) {
                    var stFile = getSiteContentSettings();
                    var media = _getAboutPhotoEntries(stFile);
                    media.push({ url: savedUrl, type: aboutType, hidden: false });
                    _setAboutPhotos(stFile, media);
                    saveSiteContentSettings(stFile);
                    aboutFileInp.value = '';
                    var aboutNameSpan = document.getElementById('site-about-file-name');
                    if (aboutNameSpan) aboutNameSpan.textContent = 'Выбрать файл...';
                    renderAboutPhotosAdmin(stFile);
                    applySiteContentSettings();
                    showToast('Слайд добавлен', 'success');
                }).catch(function() {
                    showToast('Не удалось сохранить файл. Попробуйте снова.', 'error');
                });
                return;
            }

            if (e.target.id === 'site-about-photo-add-url-btn' || e.target.closest('#site-about-photo-add-url-btn')) {
                var addUrlInp = document.getElementById('site-about-photo-add-url');
                var url = addUrlInp ? addUrlInp.value.trim() : '';
                if (!url) { showToast('Введите URL', 'error'); return; }
                var normalizedUrl = _normalizeAboutMediaUrl(url);
                var detectedType = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(normalizedUrl) ? 'video' : 'image';
                var st = getSiteContentSettings();
                var ph = _getAboutPhotoEntries(st);
                ph.push({ url: normalizedUrl, type: detectedType, hidden: false });
                _setAboutPhotos(st, ph);
                saveSiteContentSettings(st);
                if (addUrlInp) addUrlInp.value = '';
                renderAboutPhotosAdmin(st);
                applySiteContentSettings();
                showToast('Слайд добавлен', 'success');
                return;
            }

            if (e.target.closest('.site-about-photo-toggle')) {
                var iToggle = Number(e.target.closest('.site-about-photo-toggle').dataset.i);
                var stToggle = getSiteContentSettings();
                var phToggle = _getAboutPhotoEntries(stToggle);
                if (phToggle[iToggle]) phToggle[iToggle].hidden = !phToggle[iToggle].hidden;
                _setAboutPhotos(stToggle, phToggle);
                saveSiteContentSettings(stToggle);
                renderAboutPhotosAdmin(stToggle);
                applySiteContentSettings();
                return;
            }

            if (e.target.closest('.site-about-photo-up')) {
                var iUp = Number(e.target.closest('.site-about-photo-up').dataset.i);
                var stUp = getSiteContentSettings();
                var phUp = _getAboutPhotoEntries(stUp);
                if (iUp > 0) { var t1 = phUp[iUp]; phUp[iUp] = phUp[iUp - 1]; phUp[iUp - 1] = t1; }
                _setAboutPhotos(stUp, phUp);
                saveSiteContentSettings(stUp);
                renderAboutPhotosAdmin(stUp);
                applySiteContentSettings();
                return;
            }

            if (e.target.closest('.site-about-photo-down')) {
                var iDown = Number(e.target.closest('.site-about-photo-down').dataset.i);
                var stDown = getSiteContentSettings();
                var phDown = _getAboutPhotoEntries(stDown);
                if (iDown < phDown.length - 1) { var t2 = phDown[iDown]; phDown[iDown] = phDown[iDown + 1]; phDown[iDown + 1] = t2; }
                _setAboutPhotos(stDown, phDown);
                saveSiteContentSettings(stDown);
                renderAboutPhotosAdmin(stDown);
                applySiteContentSettings();
                return;
            }

            if (e.target.closest('.site-about-photo-delete')) {
                var iDel = Number(e.target.closest('.site-about-photo-delete').dataset.i);
                showConfirm('Удалить это фото из блока «О компании»?', function() {
                    var stDel = getSiteContentSettings();
                    var phDel = _getAboutPhotoEntries(stDel);
                    phDel.splice(iDel, 1);
                    _setAboutPhotos(stDel, phDel);
                    saveSiteContentSettings(stDel);
                    renderAboutPhotosAdmin(stDel);
                    applySiteContentSettings();
                });
                return;
            }

            if (e.target.id === 'save-site-content-btn' || e.target.closest('#save-site-content-btn')) {
                var s = getSiteContentSettings();
                function getValue(id) {
                    var el = document.getElementById(id);
                    return el ? el.value.trim() : '';
                }
                s.about.title = getValue('site-about-title') || s.about.title;
                s.about.company = getValue('site-about-company') || s.about.company;
                s.about.text1 = getValue('site-about-text-1') || s.about.text1;
                s.about.text2 = getValue('site-about-text-2') || s.about.text2;
                s.about.text3 = getValue('site-about-text-3') || s.about.text3;
                s.about.stat1Value = getValue('site-about-stat-1-value') || s.about.stat1Value;
                s.about.stat1Label = getValue('site-about-stat-1-label') || s.about.stat1Label;
                s.about.stat2Value = getValue('site-about-stat-2-value') || s.about.stat2Value;
                s.about.stat2Label = getValue('site-about-stat-2-label') || s.about.stat2Label;
                s.about.stat3Label = getValue('site-about-stat-3-label') || s.about.stat3Label;
                s.about.stat4Value = getValue('site-about-stat-4-value') || s.about.stat4Value;
                s.about.stat4Label = getValue('site-about-stat-4-label') || s.about.stat4Label;
                _setAboutPhotos(s, _getAboutPhotoEntries(s));

                s.contact.title = getValue('site-contact-title') || s.contact.title;
                s.contact.lead = getValue('site-contact-lead') || s.contact.lead;
                s.contact.infoTitle = getValue('site-contact-info-title') || s.contact.infoTitle;
                s.contact.address = getValue('site-contact-address') || s.contact.address;
                s.contact.phoneMain = getValue('site-contact-phone-main') || s.contact.phoneMain;
                s.contact.phoneExtra = getValue('site-contact-phone-extra') || s.contact.phoneExtra;
                s.contact.email = getValue('site-contact-email') || s.contact.email;
                s.contact.hours1 = getValue('site-contact-hours-1') || s.contact.hours1;
                s.contact.hours2 = getValue('site-contact-hours-2') || s.contact.hours2;

                s.social.facebook = getValue('site-social-facebook') || '#';
                s.social.instagram = getValue('site-social-instagram') || '#';
                s.social.youtube = getValue('site-social-youtube') || '#';
                s.social.tiktok = getValue('site-social-tiktok') || '#';
                s.social.telegram = getValue('site-social-telegram') || '#';
                s.social.whatsapp = getValue('site-social-whatsapp') || '#';
                s.social.viber = getValue('site-social-viber') || '#';

                saveSiteContentSettings(s);
                applySiteContentSettings();
                showToast('Контент сайта обновлён', 'success');
                if (typeof pushSharedSnapshot === 'function') pushSharedSnapshot();
            }

            if (e.target.id === 'admin-media-preview-close' || e.target.closest('#admin-media-preview-close')) {
                closeAdminMediaPreview();
                return;
            }

            var previewModal = document.getElementById('admin-media-preview-modal');
            if (previewModal && e.target === previewModal) {
                closeAdminMediaPreview();
                return;
            }

            var previewThumb = e.target.closest('.admin-click-preview');
            if (previewThumb) {
                openAdminMediaPreview(previewThumb.dataset.previewType || 'image', previewThumb.dataset.previewSrc || previewThumb.getAttribute('src') || '');
                return;
            }

            // Promo admin actions
            if (e.target.closest('.promo-slide-toggle')) {
                var idx = Number(e.target.closest('.promo-slide-toggle').dataset.i);
                var sl = getPromoSlides();
                sl[idx].hidden = !sl[idx].hidden;
                savePromoSlides(sl);
                renderPromoAdmin(); renderPromoCarousel();
            }
            if (e.target.closest('.promo-delete')) {
                var idx = Number(e.target.closest('.promo-delete').dataset.i);
                showConfirm('Удалить этот слайд из карусели?', function() {
                    var sl = getPromoSlides(); sl.splice(idx, 1); savePromoSlides(sl);
                    renderPromoAdmin(); renderPromoCarousel();
                    if (typeof pushSharedSnapshot === 'function') pushSharedSnapshot();
                });
            }
            if (e.target.closest('.promo-move-up')) {
                var idx = Number(e.target.closest('.promo-move-up').dataset.i);
                var sl = getPromoSlides(); if (idx > 0) { var t = sl[idx]; sl[idx] = sl[idx-1]; sl[idx-1] = t; savePromoSlides(sl); renderPromoAdmin(); renderPromoCarousel(); }
            }
            if (e.target.closest('.promo-move-down')) {
                var idx = Number(e.target.closest('.promo-move-down').dataset.i);
                var sl = getPromoSlides(); if (idx < sl.length - 1) { var t = sl[idx]; sl[idx] = sl[idx+1]; sl[idx+1] = t; savePromoSlides(sl); renderPromoAdmin(); renderPromoCarousel(); }
            }
            if (e.target.id === 'promo-add-btn' || e.target.closest('#promo-add-btn')) {
                var fileInp = document.getElementById('promo-add-file');
                var linkInp = document.getElementById('promo-add-link');
                if (!fileInp || !fileInp.files || !fileInp.files[0]) {
                    showToast('Выберите файл для загрузки', 'error'); return;
                }
                var file = fileInp.files[0];
                var fileType = file.type.startsWith('video/') ? 'video' : 'image';
                var maxMB = fileType === 'video' ? 50 : 5;
                if (file.size > maxMB * 1024 * 1024) {
                    showToast('Файл слишком большой (макс. ' + maxMB + ' МБ)', 'error'); return;
                }
                var reader = new FileReader();
                reader.onload = function(ev) {
                    var sl = getPromoSlides();
                    sl.push({ url: ev.target.result, type: fileType, link: linkInp ? linkInp.value.trim() : '', alt: file.name });
                    savePromoSlides(sl);
                    fileInp.value = '';
                    var nameSpan = document.getElementById('promo-file-name');
                    if (nameSpan) nameSpan.textContent = 'Выбрать файл...';
                    if (linkInp) linkInp.value = '';
                    renderPromoAdmin(); renderPromoCarousel();
                    showToast('Слайд добавлен', 'success');
                    if (typeof pushSharedSnapshot === 'function') pushSharedSnapshot();
                };
                reader.readAsDataURL(file);
            }
            if (e.target.id === 'promo-toggle-visibility-btn' || e.target.closest('#promo-toggle-visibility-btn')) {
                var cur = localStorage.getItem(PROMO_HIDDEN_KEY) === '1';
                localStorage.setItem(PROMO_HIDDEN_KEY, cur ? '0' : '1');
                renderPromoAdmin(); renderPromoCarousel();
            }
            if (e.target.id === 'promo-add-url-btn' || e.target.closest('#promo-add-url-btn')) {
                var urlInp = document.getElementById('promo-add-url');
                var linkInp2 = document.getElementById('promo-add-link-url');
                if (!urlInp || !urlInp.value.trim()) { showToast('Введите URL', 'error'); return; }
                var rawUrl = urlInp.value.trim();
                var detectedType = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(rawUrl) ? 'video' : 'image';
                var sl = getPromoSlides();
                sl.push({ url: rawUrl, type: detectedType, link: linkInp2 ? linkInp2.value.trim() : '', alt: '' });
                savePromoSlides(sl);
                urlInp.value = ''; if (linkInp2) linkInp2.value = '';
                renderPromoAdmin(); renderPromoCarousel();
                showToast('Слайд добавлен', 'success');
                if (typeof pushSharedSnapshot === 'function') pushSharedSnapshot();
            }
            
            // Close modals
            if (e.target.id === 'close-property-modal' || e.target.id === 'cancel-property-edit') {
                closePropertyEditModal();
            }
            
            if (e.target.id === 'close-agent-modal' || e.target.id === 'cancel-agent-edit') {
                closeAgentEditModal();
            }
        });

        // Site content photo inputs: URL + file upload previews
        document.addEventListener('change', function(e) {
            if (e.target.id === 'site-about-photo-add-file') {
                var nameSpan = document.getElementById('site-about-file-name');
                if (nameSpan) nameSpan.textContent = e.target.files && e.target.files[0] ? e.target.files[0].name : 'Выбрать файл...';
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeAdminMediaPreview();
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
            var overlayPriceEl = document.querySelector('#property-overlay .p-8 .gold-bg');
            overlayPriceEl.textContent = price;
            // Remove old discount price from overlay
            var oldOverlayDiscount = document.getElementById('overlay-discount-price');
            if (oldOverlayDiscount) oldOverlayDiscount.remove();
            overlayPriceEl.classList.remove('overlay-price-old');
            // Show discount price if applicable
            var _overlayStatusStore = getPropertyStatusStore();
            var _overlayEntry = _overlayStatusStore[propertyData.id] || {};
            if (_overlayEntry.discount && _overlayEntry.discountPrice) {
                overlayPriceEl.classList.add('overlay-price-old');
                var discountDiv = document.createElement('div');
                discountDiv.id = 'overlay-discount-price';
                discountDiv.className = 'gold-bg text-black font-bold px-4 py-2 rounded-full';
                discountDiv.textContent = formatPriceValue(Number(_overlayEntry.discountPrice));
                var priceWrap = overlayPriceEl.closest('.overlay-price-wrap');
                if (priceWrap) {
                    priceWrap.appendChild(discountDiv);
                } else {
                    overlayPriceEl.after(discountDiv);
                }
            }
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
                const agentHidden = isAgentHidden(rieltorId);
                // Use company fallback if agent is hidden
                const contactInfo = (agent && !agentHidden) ? agent : COMPANY_CONTACT;
                
                agentInfoContainer.style.display = 'block';
                document.querySelector('#property-overlay .flex.items-center img').src = contactInfo.photo || '';
                document.querySelector('#property-overlay .flex.items-center .font-semibold').textContent = contactInfo.name || '';
                document.querySelector('#property-overlay .flex.items-center .text-sm').textContent = contactInfo.position || '';
                
                // Update contact buttons
                const callBtn = document.querySelector('#property-overlay .contact-call-btn');
                callBtn.innerHTML = `<i class="fas fa-phone-alt mr-2"></i> ${contactInfo.phone}`;
                callBtn.onclick = function() { window.location.href = `tel:${contactInfo.phone}`; };
                
                const whatsappBtn = document.querySelector('#property-overlay a:has(i.fa-whatsapp)');
                whatsappBtn.href = `https://wa.me/${(contactInfo.whatsapp || contactInfo.phone).replace(/\D/g, '')}`;
                
                const telegramBtn = document.querySelector('#property-overlay a:has(i.fa-telegram)');
                telegramBtn.href = `https://t.me/${(contactInfo.telegram || contactInfo.phone).replace(/\D/g, '')}`;
                
                const viberBtn = document.querySelector('#property-overlay a:has(i.fa-viber)');
                viberBtn.href = `viber://chat?number=${(contactInfo.viber || contactInfo.phone).replace(/\D/g, '')}`;
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
        let testimonials = document.querySelectorAll('#about-testimonial-carousel .testimonial-item');
        let testimonialPrev = document.querySelector('#about-testimonial-carousel .carousel-prev');
        let testimonialNext = document.querySelector('#about-testimonial-carousel .carousel-next');

        function showTestimonial(n) {
            testimonials = document.querySelectorAll('#about-testimonial-carousel .testimonial-item');
            if (!testimonials.length) return;
            testimonials.forEach(testimonial => testimonial.classList.remove('active'));
            currentTestimonial = (n + testimonials.length) % testimonials.length;
            testimonials[currentTestimonial].classList.add('active');
        }

        function bindAboutCarouselControls() {
            testimonialPrev = document.querySelector('#about-testimonial-carousel .carousel-prev');
            testimonialNext = document.querySelector('#about-testimonial-carousel .carousel-next');
            if (testimonialPrev && !testimonialPrev.dataset.bound) {
                testimonialPrev.dataset.bound = '1';
                testimonialPrev.addEventListener('click', () => showTestimonial(currentTestimonial - 1));
            }
            if (testimonialNext && !testimonialNext.dataset.bound) {
                testimonialNext.dataset.bound = '1';
                testimonialNext.addEventListener('click', () => showTestimonial(currentTestimonial + 1));
            }
        }

        bindAboutCarouselControls();

        // Auto-rotate testimonials
        setInterval(() => {
            if (window.__veneraAboutCarouselNeedsRebind) {
                window.__veneraAboutCarouselNeedsRebind = false;
                bindAboutCarouselControls();
            }
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

            // Всегда сохраняем в админку (до попытки отправки email)
            var savedOk = false;
            try {
                var msgs = JSON.parse(localStorage.getItem('venera_contact_messages_v1') || '[]');
                msgs.unshift({
                    id: 'msg_' + Date.now(),
                    name: nameVal,
                    phone: phoneVal,
                    email: emailVal,
                    message: messageVal,
                    timestamp: Date.now(),
                    read: false
                });
                localStorage.setItem('venera_contact_messages_v1', JSON.stringify(msgs));
                savedOk = true;
                window._updateMessagesBadge && window._updateMessagesBadge();
            } catch(e) {
                console.error('Venera: ошибка сохранения заявки в localStorage:', e);
            }

            showStatus('✓ Сообщение отправлено! Мы свяжемся с вами в ближайшее время.', 'text-green-400');
            form.reset();
            restore();

            // Дополнительно пробуем отправить на email (в фоне, не блокирует UX)
            try {
                emailjs.send('service_2tli96l', 'template_x0ddy0m', formData)
                    .then(function() {
                        // email успешно отправлен
                    }, function(error) {
                        console.warn('EmailJS: письмо не отправлено, заявка сохранена в админке.', error);
                    });
            } catch(e) {
                console.warn('EmailJS недоступен, заявка сохранена в админке.', e);
            }
        });

// ====================== ЗАЯВКИ С САЙТА ======================
var MESSAGES_STORAGE_KEY = 'venera_contact_messages_v1';

function _getMessages() {
    try { return JSON.parse(localStorage.getItem(MESSAGES_STORAGE_KEY) || '[]'); } catch(e) { return []; }
}
function _saveMessages(msgs) {
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(msgs));
}

window._updateMessagesBadge = function() {
    var badge = document.getElementById('admin-messages-badge');
    if (!badge) return;
    var unread = _getMessages().filter(function(m) { return !m.read; }).length;
    if (unread > 0) {
        badge.textContent = unread > 99 ? '99+' : unread;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
};

window.renderMessagesAdmin = function() {
    var list = document.getElementById('admin-messages-list');
    if (!list) return;
    var msgs = _getMessages();

    // Помечаем все как прочитанные
    var changed = false;
    msgs.forEach(function(m) { if (!m.read) { m.read = true; changed = true; } });
    if (changed) { _saveMessages(msgs); window._updateMessagesBadge(); }

    if (msgs.length === 0) {
        list.innerHTML = '<div style="color:rgba(255,255,255,0.35);font-size:0.9rem;padding:16px 0;">Заявок пока нет.</div>';
        return;
    }

    list.innerHTML = msgs.map(function(m) {
        var date = new Date(m.timestamp);
        var dateStr = date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
        return '<div class="rounded-2xl p-5 mb-4" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,215,0,0.18);backdrop-filter:blur(12px);" id="msg-card-' + m.id + '">' +
            '<div class="flex justify-between items-start gap-2 mb-3">' +
            '<span style="font-weight:600;color:#fff;font-size:1rem;">' + _escMsg(m.name) + '</span>' +
            '<span style="color:rgba(255,255,255,0.35);font-size:0.75rem;white-space:nowrap;">' + dateStr + '</span>' +
            '</div>' +
            (m.phone ? '<div style="font-size:0.875rem;color:rgba(255,255,255,0.75);margin-bottom:4px;"><i class="fas fa-phone mr-2" style="color:#ffd700;"></i>' + _escMsg(m.phone) + '</div>' : '') +
            (m.email ? '<div style="font-size:0.875rem;color:rgba(255,255,255,0.75);margin-bottom:4px;"><i class="fas fa-envelope mr-2" style="color:#ffd700;"></i>' + _escMsg(m.email) + '</div>' : '') +
            (m.message ? '<div style="font-size:0.875rem;color:rgba(255,255,255,0.5);margin-top:10px;white-space:pre-wrap;line-height:1.6;border-top:1px solid rgba(255,255,255,0.07);padding-top:10px;">' + _escMsg(m.message) + '</div>' : '') +
            '<div style="margin-top:14px;">' +
            '<button type="button" class="admin-btn-del message-delete-btn" data-message-id="' + m.id + '">Удалить</button>' +
            '</div>' +
            '</div>';
    }).join('');
};

function _escMsg(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.deleteMessage = function(id) {
    showConfirm('Удалить эту заявку с сайта?', function() {
        var msgs = _getMessages().filter(function(m) { return m.id !== id; });
        _saveMessages(msgs);
        window.renderMessagesAdmin();
        window._updateMessagesBadge();
    });
};

window.deleteReadMessages = function() {
    showConfirm('Удалить все прочитанные заявки с сайта?', function() {
        var msgs = _getMessages().filter(function(m) { return !m.read; });
        _saveMessages(msgs);
        window.renderMessagesAdmin();
        window._updateMessagesBadge();
    });
};

// Обновляем бейдж при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    window._updateMessagesBadge && window._updateMessagesBadge();
});


// Автообновление заявок при сохранении из другой вкладки (index.html → admin.html)
window.addEventListener('storage', function(e) {
    if (e.key === 'venera_contact_messages_v1') {
        window._updateMessagesBadge && window._updateMessagesBadge();
        // Если сейчас открыта вкладка «Заявки» — обновляем список сразу
        var messagesView = document.getElementById('admin-messages-view');
        if (messagesView && !messagesView.classList.contains('hidden')) {
            if (typeof window.renderMessagesAdmin === 'function') window.renderMessagesAdmin();
        }
    }
    if (e.key === 'venera_clients_db_v1') {
        var clientsView = document.getElementById('admin-clients-view');
        if (clientsView && !clientsView.classList.contains('hidden')) {
            if (typeof window.renderClientsAdmin === 'function') window.renderClientsAdmin();
        }
    }
    if (e.key === SITE_CONTENT_STORAGE_KEY) {
        applySiteContentSettings();
        var contentView = document.getElementById('admin-site-content-view');
        if (contentView && !contentView.classList.contains('hidden') && typeof window.renderSiteContentAdmin === 'function') {
            window.renderSiteContentAdmin();
        }
    }
});

// ====================== БАЗА КЛИЕНТОВ ======================
var CLIENTS_STORAGE_KEY = 'venera_clients_db_v1';
var CLIENT_OWNER_COMPANY_ID = 'company';

function _getClients() {
    try { return JSON.parse(localStorage.getItem(CLIENTS_STORAGE_KEY) || '[]'); } catch(e) { return []; }
}

function _saveClients(items) {
    localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(items));
}

function _getAgentListForClientOwner() {
    if (typeof _getCurrentAgentsRuntime === 'function') {
        return _getCurrentAgentsRuntime();
    }
    if (typeof agents !== 'undefined' && Array.isArray(agents) && agents.length) return agents;
    return Array.isArray(window.VENERA_AGENTS_CONFIG) ? window.VENERA_AGENTS_CONFIG : [];
}

function _getClientOwnerOptions() {
    var store = (typeof getAgentStatusStore === 'function') ? getAgentStatusStore() : {};
    var map = {};
    _getAgentListForClientOwner().forEach(function(a) {
        var rid = String((a && a.rieltor_id) || '').trim();
        if (!rid) return;
        if (store[rid] && store[rid].hidden) return;
        map[rid] = String((a && a.name) || rid).trim() || rid;
    });
    return Object.keys(map)
        .sort(function(a, b) { return map[a].localeCompare(map[b], 'ru'); })
        .map(function(id) { return { value: id, label: map[id] }; });
}

function _normalizeClientOwnerId(rawOwnerId) {
    var ownerId = String(rawOwnerId || '').trim();
    if (!ownerId) return CLIENT_OWNER_COMPANY_ID;
    if (ownerId === CLIENT_OWNER_COMPANY_ID) return CLIENT_OWNER_COMPANY_ID;
    var allowed = _getClientOwnerOptions().some(function(opt) { return opt.value === ownerId; });
    return allowed ? ownerId : CLIENT_OWNER_COMPANY_ID;
}

function _reassignHiddenOrDeletedClientsToCompany() {
    var items = _getClients();
    var changed = false;
    items = items.map(function(item) {
        var normalized = _normalizeClientOwnerId(item && item.rieltor_id);
        if (String((item && item.rieltor_id) || '') !== normalized) {
            changed = true;
            return Object.assign({}, item, { rieltor_id: normalized });
        }
        return item;
    });
    if (changed) _saveClients(items);
    return changed;
}

function _forceClientOwnerToCompany(rieltorId) {
    var rid = String(rieltorId || '').trim();
    if (!rid) return false;
    var items = _getClients();
    var changed = false;
    items = items.map(function(item) {
        if (String((item && item.rieltor_id) || '') !== rid) return item;
        changed = true;
        return Object.assign({}, item, { rieltor_id: CLIENT_OWNER_COMPANY_ID });
    });
    if (changed) _saveClients(items);
    return changed;
}

function _applyClientOwnerControlForMode(prefillOwnerId) {
    var ownerEl = document.getElementById('client-rieltor-id');
    if (!ownerEl) return;

    var panel = document.getElementById('admin-panel');
    var isRealtorMode = !!(panel && panel.getAttribute('data-realtor-mode') === '1');
    var realtorSess = isRealtorMode ? getRealtorSession() : null;
    if (realtorSess && realtorSess.rieltor_id) {
        var rid = String(realtorSess.rieltor_id);
        ownerEl.innerHTML = '<option value="' + _escMsg(rid) + '">' + _escMsg(realtorSess.name || rid) + '</option>';
        ownerEl.value = rid;
        ownerEl.disabled = true;
        if (typeof _cselSync === 'function') _cselSync('client-rieltor-id');
        return;
    }

    var options = [{ value: CLIENT_OWNER_COMPANY_ID, label: 'Компания' }].concat(_getClientOwnerOptions());
    ownerEl.innerHTML = options.map(function(opt) {
        return '<option value="' + _escMsg(opt.value) + '">' + _escMsg(opt.label) + '</option>';
    }).join('');
    ownerEl.disabled = false;
    var wanted = _normalizeClientOwnerId(prefillOwnerId || ownerEl.value || CLIENT_OWNER_COMPANY_ID);
    ownerEl.value = wanted;
    if (typeof _cselSync === 'function') _cselSync('client-rieltor-id');
}

function _toClientNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function _getTypeOptions() {
    var source = document.getElementById('property-type');
    if (!source) return [];
    return Array.from(source.options || [])
        .filter(function(opt) { return opt.value; })
        .map(function(opt) { return { value: opt.value, label: opt.textContent || opt.value }; });
}

function _getConditionOptions() {
    var source = document.getElementById('property-condition');
    if (!source) return [];
    return Array.from(source.options || [])
        .filter(function(opt) { return opt.value; })
        .map(function(opt) { return { value: opt.value, label: opt.textContent || opt.value }; });
}

function _populateSelect(selectId, options, placeholder, keepValue) {
    var el = document.getElementById(selectId);
    if (!el) return;
    var current = keepValue ? el.value : '';
    el.innerHTML = '';
    var base = document.createElement('option');
    base.value = '';
    base.textContent = placeholder;
    el.appendChild(base);
    options.forEach(function(opt) {
        var o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        el.appendChild(o);
    });
    if (current && Array.from(el.options).some(function(o) { return o.value === current; })) {
        el.value = current;
    }
}

function _getCityOptions() {
    if (typeof syncCityDistrictCatalog === 'function') syncCityDistrictCatalog();
    if (typeof cityDistricts === 'undefined' || !cityDistricts) return [];
    return Object.keys(cityDistricts)
        .filter(function(city) { return city && city !== 'Все города'; })
        .sort(function(a, b) { return a.localeCompare(b, 'ru'); })
        .map(function(city) { return { value: city, label: city }; });
}

function _getDistrictOptions(city) {
    if (!city || typeof cityDistricts === 'undefined' || !cityDistricts[city]) return [];
    return cityDistricts[city]
        .filter(function(d) { return d && d !== 'Все районы'; })
        .sort(function(a, b) { return a.localeCompare(b, 'ru'); })
        .map(function(d) { return { value: d, label: d }; });
}

function _refreshClientCatalogSelects() {
    _populateSelect('client-city', _getCityOptions(), '-- Выберите город --', true);
    _populateSelect('clients-filter-city', _getCityOptions(), 'Фильтр: город (все)', true);
    _populateSelect('client-condition', _getConditionOptions(), '-- Выберите состояние --', true);
    _populateSelect('clients-filter-condition', _getConditionOptions(), 'Фильтр: состояние (все)', true);
    _populateSelect('client-type', _getTypeOptions(), '-- Выберите тип --', true);
    _populateSelect('clients-filter-type', _getTypeOptions(), 'Фильтр: тип (все)', true);

    var cityForModal = (document.getElementById('client-city') || {}).value || '';
    _populateSelect('client-district', _getDistrictOptions(cityForModal), '-- Выберите район --', true);

    var cityForFilter = (document.getElementById('clients-filter-city') || {}).value || '';
    _populateSelect('clients-filter-district', _getDistrictOptions(cityForFilter), 'Фильтр: район (все)', true);

    _applyClientOwnerControlForMode();

    if (typeof _cselSync === 'function') {
        ['clients-filter-city', 'clients-filter-district', 'clients-filter-condition', 'clients-filter-type', 'client-rieltor-id'].forEach(function(id) { _cselSync(id); });
    }
}

function _clientStatusMeta(status) {
    if (status === 'success') return { icon: 'fa-check-circle', color: '#22c55e', label: 'Сделка/готов' };
    if (status === 'reject') return { icon: 'fa-times-circle', color: '#ef4444', label: 'Отказ' };
    return { icon: 'fa-hourglass-half', color: '#f59e0b', label: 'В ожидании' };
}

function _getClientFilterValues() {
    var getVal = function(id) {
        var el = document.getElementById(id);
        return el ? String(el.value || '').trim().toLowerCase() : '';
    };

    return {
        fio: getVal('clients-filter-fio'),
        phone: getVal('clients-filter-phone'),
        email: getVal('clients-filter-email'),
        city: getVal('clients-filter-city'),
        district: getVal('clients-filter-district'),
        rooms: getVal('clients-filter-rooms'),
        condition: getVal('clients-filter-condition'),
        type: getVal('clients-filter-type'),
        note: getVal('clients-filter-note'),
        priceFrom: _toClientNumber(getVal('clients-filter-price-from')),
        priceTo: _toClientNumber(getVal('clients-filter-price-to')),
        status: getVal('clients-filter-status') || 'all'
    };
}

function _isClientMatchFilters(item, f) {
    var includes = function(source, value) {
        if (!value) return true;
        return String(source || '').toLowerCase().indexOf(value) !== -1;
    };

    if (f.status !== 'all' && (item.status || 'pending') !== f.status) return false;
    if (!includes(item.fullName, f.fio)) return false;
    if (!includes(item.phone, f.phone)) return false;
    if (!includes(item.email, f.email)) return false;
    if (!includes(item.city, f.city)) return false;
    if (!includes(item.district, f.district)) return false;
    if (!includes(item.rooms, f.rooms)) return false;
    if (!includes(item.condition, f.condition)) return false;
    if (!includes(item.type, f.type)) return false;
    if (!includes(item.note, f.note)) return false;

    var itemPriceFrom = _toClientNumber(item.priceFrom);
    var itemPriceTo = _toClientNumber(item.priceTo);
    if (f.priceFrom !== null && (itemPriceTo === null || itemPriceTo < f.priceFrom)) return false;
    if (f.priceTo !== null && (itemPriceFrom === null || itemPriceFrom > f.priceTo)) return false;

    return true;
}

function _collectClientFormData() {
    var getVal = function(id) {
        var el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
    };

    return {
        fullName: getVal('client-fullname'),
        phone: getVal('client-phone'),
        email: getVal('client-email'),
        rieltor_id: _normalizeClientOwnerId(getVal('client-rieltor-id')),
        note: getVal('client-note'),
        rooms: getVal('client-rooms'),
        city: getVal('client-city'),
        district: getVal('client-district'),
        condition: getVal('client-condition'),
        type: getVal('client-type'),
        priceFrom: _toClientNumber(getVal('client-price-from')),
        priceTo: _toClientNumber(getVal('client-price-to')),
        status: getVal('client-status') || 'pending'
    };
}

function _setClientFormData(item) {
    var setVal = function(id, value) {
        var el = document.getElementById(id);
        if (!el) return;
        el.value = value === null || value === undefined ? '' : value;
    };

    setVal('client-fullname', item ? item.fullName : '');
    setVal('client-phone', item ? item.phone : '');
    setVal('client-email', item ? item.email : '');
    setVal('client-note', item ? item.note : '');
    setVal('client-rooms', item ? item.rooms : '');
    setVal('client-city', item ? item.city : '');
    setVal('client-district', item ? item.district : '');
    setVal('client-condition', item ? item.condition : '');
    setVal('client-type', item ? item.type : '');
    setVal('client-price-from', item && item.priceFrom !== null && item.priceFrom !== undefined ? item.priceFrom : '');
    setVal('client-price-to', item && item.priceTo !== null && item.priceTo !== undefined ? item.priceTo : '');
    setVal('client-status', item ? (item.status || 'pending') : 'pending');
    setVal('client-rieltor-id', item ? _normalizeClientOwnerId(item.rieltor_id) : CLIENT_OWNER_COMPANY_ID);
}

window.openClientModal = function(mode, id) {
    var modal = document.getElementById('client-modal');
    var titleEl = document.getElementById('client-modal-title');
    var editIdEl = document.getElementById('client-edit-id');
    var saveBtn = document.getElementById('save-client-btn');
    if (!modal || !titleEl || !editIdEl || !saveBtn) return;

    _refreshClientCatalogSelects();

    if (mode === 'edit' && id) {
        var target = _getClients().find(function(item) { return item.id === id; });
        if (!target) return;
        editIdEl.value = id;
        titleEl.textContent = 'Изменить покупателя';
        saveBtn.textContent = 'Сохранить изменения';
        _setClientFormData(target);
        _applyClientOwnerControlForMode(target.rieltor_id);
        _populateSelect('client-district', _getDistrictOptions(target.city || ''), '-- Выберите район --', false);
        var districtEl = document.getElementById('client-district');
        if (districtEl) districtEl.value = target.district || '';
    } else {
        editIdEl.value = '';
        titleEl.textContent = 'Добавить покупателя';
        saveBtn.textContent = 'Сохранить';
        _setClientFormData(null);
        _applyClientOwnerControlForMode(CLIENT_OWNER_COMPANY_ID);
    }

    modal.classList.remove('hidden');
};

window.closeClientModal = function() {
    var modal = document.getElementById('client-modal');
    if (!modal) return;
    modal.classList.add('hidden');
};

window.renderClientsAdmin = function() {
    var list = document.getElementById('admin-clients-list');
    if (!list) return;
    _reassignHiddenOrDeletedClientsToCompany();
    var items = _getClients();
    // В режиме риелтора — показываем только его клиентов
    var realtorSess = getRealtorSession();
    if (realtorSess && realtorSess.rieltor_id) {
        var ridFilter = String(realtorSess.rieltor_id);
        items = items.filter(function(item) { return String(item.rieltor_id || '') === ridFilter; });
    }
    var filters = _getClientFilterValues();
    var filteredItems = items.filter(function(item) { return _isClientMatchFilters(item, filters); });

    if (filteredItems.length === 0) {
        list.innerHTML = '<tr><td colspan="7" style="padding:16px 12px;color:rgba(255,255,255,0.35);text-align:center;">По текущим фильтрам клиентов нет.</td></tr>';
        return;
    }

    var ownerAgents = _getAgentListForClientOwner();
    var ownerMap = {};
    ownerAgents.forEach(function(a) {
        var rid = String((a && a.rieltor_id) || '').trim();
        if (!rid) return;
        ownerMap[rid] = a;
    });

    list.innerHTML = filteredItems.map(function(item) {
        var meta = _clientStatusMeta(item.status);
        var params = [
            item.rooms ? ('Комнаты: ' + _escMsg(item.rooms)) : null,
            item.type ? ('Тип: ' + _escMsg(item.type)) : null,
            item.city ? ('Город: ' + _escMsg(item.city)) : null,
            item.district ? ('Район: ' + _escMsg(item.district)) : null,
            item.condition ? ('Состояние: ' + _escMsg(item.condition)) : null,
            (item.priceFrom !== null && item.priceFrom !== undefined) || (item.priceTo !== null && item.priceTo !== undefined)
                ? ('Цена: ' + _escMsg(item.priceFrom || '0') + ' - ' + _escMsg(item.priceTo || '0'))
                : null
        ].filter(function(v) { return !!v; }).join('<br>');

        var ownerId = _normalizeClientOwnerId(item.rieltor_id);
        var ownerAgent = ownerMap[ownerId] || null;
        var ownerCellHtml = ownerAgent && ownerAgent.photo
            ? '<img src="' + _escMsg(ownerAgent.photo) + '" alt="" title="' + _escMsg(ownerAgent.name || ownerId) + '" style="width:42px;height:42px;border-radius:999px;object-fit:cover;border:2px solid rgba(255,215,0,0.28);display:block;flex-shrink:0;">'
            : '<img src="https://i.ibb.co/35ZQ5g8X/logo.png" alt="Компания" title="Компания" style="width:42px;height:42px;border-radius:999px;object-fit:cover;border:2px solid rgba(255,215,0,0.28);display:block;flex-shrink:0;">';

        return '<tr class="admin-tbl-row" style="border-top:1px solid rgba(255,215,0,0.08);">' +
            '<td style="padding:10px 16px;">' +
                '<button onclick="window.cycleClientStatus(\'' + item.id + '\')" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);cursor:pointer;transition:background 0.2s;" title="Сменить статус">' +
                    '<i class="fas ' + meta.icon + '" style="color:' + meta.color + ';"></i>' +
                    '<span style="color:rgba(255,255,255,0.7);font-size:0.75rem;">' + meta.label + '</span>' +
                '</button>' +
                '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">' +
                    '<button onclick="window.editClient(\'' + item.id + '\')" class="admin-btn-edit" style="font-size:0.7rem;padding:4px 8px;">Изменить</button>' +
                    '<button onclick="window.deleteClient(\'' + item.id + '\')" class="admin-btn-del" style="font-size:0.7rem;padding:4px 8px;">Удалить</button>' +
                '</div>' +
            '</td>' +
            '<td style="padding:10px 16px;color:#fff;font-weight:500;">' + _escMsg(item.fullName) + '</td>' +
            '<td style="padding:10px 16px;color:rgba(255,255,255,0.8);">' + _escMsg(item.phone) + '</td>' +
            '<td style="padding:10px 16px;color:rgba(255,255,255,0.65);">' + (item.email ? _escMsg(item.email) : '<span style="color:rgba(255,255,255,0.2);">-</span>') + '</td>' +
            '<td style="padding:10px 16px;color:rgba(255,255,255,0.6);font-size:0.8rem;line-height:1.6;">' + (params || '<span style="color:rgba(255,255,255,0.2);">-</span>') + '</td>' +
            '<td style="padding:10px 16px;color:rgba(255,255,255,0.6);font-size:0.8rem;white-space:pre-wrap;">' + _escMsg(item.note) + '</td>' +
            '<td style="padding:10px 12px;min-width:88px;width:88px;text-align:center;">' + ownerCellHtml + '</td>' +
        '</tr>';
    }).join('');
};

function _refreshRealtorStatsIfVisible() {
    var statsView = document.getElementById('realtor-stats-view');
    if (statsView && !statsView.classList.contains('hidden') && typeof window.renderRealtorStats === 'function') {
        var periodBtn = document.querySelector('#realtor-period-bar .analytics-period-btn.active[data-realtor-days]');
        var period = periodBtn ? (Number(periodBtn.getAttribute('data-realtor-days')) || 30) : 30;
        window.renderRealtorStats(period);
    }
}

window.cycleClientStatus = function(id) {
    var order = ['pending', 'success', 'reject'];
    var items = _getClients();
    items = items.map(function(item) {
        if (item.id !== id) return item;
        var idx = order.indexOf(item.status);
        var next = order[(idx + 1) % order.length];
        return Object.assign({}, item, { status: next });
    });
    _saveClients(items);
    window.renderClientsAdmin();
    _refreshRealtorStatsIfVisible();
};

window.deleteClient = function(id) {
    showConfirm('Удалить этого клиента из базы?', function() {
        var client = _getClients().find(function(item) { return item.id === id; });
        var items = _getClients().filter(function(item) { return item.id !== id; });
        _saveClients(items);
        _logAction('Удаление клиента', 'База клиентов', { clientId: id, clientName: client ? client.fullName : 'Неизвестно' });
        window.renderClientsAdmin();
        _refreshRealtorStatsIfVisible();
    });
};

window.editClient = function(id) {
    window.openClientModal('edit', id);
};

window.initClientsAdmin = function() {
    var form = document.getElementById('admin-clients-form');
    var openBtn = document.getElementById('open-client-modal-btn');
    var closeBtn = document.getElementById('close-client-modal');
    var cancelBtn = document.getElementById('cancel-client-modal');
    var resetBtn = document.getElementById('clients-filter-reset');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';

    if (openBtn) {
        openBtn.addEventListener('click', function() {
            window.openClientModal('create');
        });
    }

    if (closeBtn) closeBtn.addEventListener('click', window.closeClientModal);
    if (cancelBtn) cancelBtn.addEventListener('click', window.closeClientModal);

    var modal = document.getElementById('client-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) window.closeClientModal();
        });
    }

    var clientCitySelect = document.getElementById('client-city');
    if (clientCitySelect) {
        clientCitySelect.addEventListener('change', function() {
            _populateSelect('client-district', _getDistrictOptions(clientCitySelect.value || ''), '-- Выберите район --', false);
        });
    }

    var filterCitySelect = document.getElementById('clients-filter-city');
    if (filterCitySelect) {
        filterCitySelect.addEventListener('change', function() {
            _populateSelect('clients-filter-district', _getDistrictOptions(filterCitySelect.value || ''), 'Фильтр: район (все)', false);
            if (typeof _cselSync === 'function') _cselSync('clients-filter-district');
            window.renderClientsAdmin();
        });
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        var data = _collectClientFormData();
        if (!data.fullName || !data.phone) return;

        var editIdEl = document.getElementById('client-edit-id');
        var editId = editIdEl ? String(editIdEl.value || '').trim() : '';

        var items = _getClients();
        if (editId) {
            items = items.map(function(item) {
                if (item.id !== editId) return item;
                return Object.assign({}, item, data);
            });
        } else {
            var newClientBase = {
                id: 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                createdAt: Date.now()
            };
            var realtorSessForClient = getRealtorSession();
            if (realtorSessForClient && realtorSessForClient.rieltor_id) {
                newClientBase.rieltor_id = realtorSessForClient.rieltor_id;
            } else {
                newClientBase.rieltor_id = _normalizeClientOwnerId(data.rieltor_id);
            }
            items.unshift(Object.assign(newClientBase, data));
        }

        _saveClients(items);
        if (!editId) {
            _logAction('Добавление клиента', 'База клиентов', { clientName: data.fullName || 'Неизвестно', phone: data.phone });
        } else {
            _logAction('Редактирование клиента', 'База клиентов', { clientId: editId, clientName: data.fullName || 'Неизвестно' });
        }
        form.reset();
        var statusSelect = document.getElementById('client-status');
        if (statusSelect) statusSelect.value = 'pending';
        if (editIdEl) editIdEl.value = '';
        window.closeClientModal();
        window.renderClientsAdmin();
        _refreshRealtorStatsIfVisible();
    });

    var filterIds = [
        'clients-filter-fio',
        'clients-filter-phone',
        'clients-filter-email',
        'clients-filter-city',
        'clients-filter-district',
        'clients-filter-rooms',
        'clients-filter-condition',
        'clients-filter-type',
        'clients-filter-price-from',
        'clients-filter-price-to',
        'clients-filter-status',
        'clients-filter-note'
    ];

    filterIds.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        var evName = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evName, function() {
            window.renderClientsAdmin();
        });
    });

    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            filterIds.forEach(function(id) {
                var el = document.getElementById(id);
                if (!el) return;
                if (id === 'clients-filter-status') {
                    el.value = 'all';
                } else {
                    el.value = '';
                }
            });
            _populateSelect('clients-filter-district', [], 'Фильтр: район (все)', false);
            if (typeof _cselSync === 'function') {
                ['clients-filter-city', 'clients-filter-district', 'clients-filter-condition', 'clients-filter-type', 'clients-filter-status'].forEach(function(id) { _cselSync(id); });
            }
            window.renderClientsAdmin();
        });
    }

    var historyToggleBtn = document.getElementById('history-clients-toggle-btn');
    var historyPanel = document.getElementById('clients-history-panel');
    var historyCloseBtn = document.getElementById('clients-history-close-btn');
    
    if (historyToggleBtn && historyPanel) {
        historyToggleBtn.addEventListener('click', function() {
            var isHidden = historyPanel.classList.contains('hidden');
            if (isHidden) {
                historyPanel.classList.remove('hidden');
                _renderHistoryLogs('\u0411\u0430\u0437\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432');
            } else {
                historyPanel.classList.add('hidden');
            }
        });
    }
    
    if (historyCloseBtn) {
        historyCloseBtn.addEventListener('click', function() {
            historyPanel.classList.add('hidden');
        });
    }

    _refreshClientCatalogSelects();
    _reassignHiddenOrDeletedClientsToCompany();
};

document.addEventListener('DOMContentLoaded', function() {
    window.initClientsAdmin && window.initClientsAdmin();
    window.renderClientsAdmin && window.renderClientsAdmin();
});

// ====================== КАЛЕНДАРЬ АДМИНКИ ======================
var CALENDAR_STORAGE_KEY = 'venera_calendar_notes_v1';
var CALENDAR_TARGET_COMPANY = 'company';
var CALENDAR_TARGET_ALL_REALTORS = 'all_realtors';

function _calendarTargetLabel(targetId) {
    if (String(targetId || '') === CALENDAR_TARGET_COMPANY) return 'Компания';
    if (String(targetId || '') === CALENDAR_TARGET_ALL_REALTORS) return 'Все риелторы';
    return '';
}

function _getCalendarNotes() {
    try { return JSON.parse(localStorage.getItem(CALENDAR_STORAGE_KEY) || '[]'); } catch(e) { return []; }
}

function _saveCalendarNotes(items) {
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(items));
}

function _pad2(v) {
    return String(v).padStart(2, '0');
}

function _dateToIso(d) {
    return d.getFullYear() + '-' + _pad2(d.getMonth() + 1) + '-' + _pad2(d.getDate());
}

function _calendarState() {
    if (!window.__VENERA_CALENDAR_STATE__) {
        var now = new Date();
        window.__VENERA_CALENDAR_STATE__ = {
            year: now.getFullYear(),
            month: now.getMonth(),
            selectedDate: _dateToIso(now),
            realtorFilter: 'all'
        };
    }
    return window.__VENERA_CALENDAR_STATE__;
}

function _getCalendarRealtors() {
    var map = {};

    map[CALENDAR_TARGET_COMPANY] = 'Компания';
    map[CALENDAR_TARGET_ALL_REALTORS] = 'Все риелторы';

    try {
        var runtimeAgents = _getAgentListForClientOwner();
        runtimeAgents.forEach(function(a) {
            var id = String(a.rieltor_id || '').trim();
            if (!id) return;
            map[id] = String(a.name || id).trim();
        });
    } catch (_) {}

    _getCalendarNotes().forEach(function(n) {
        var id = String(n.realtorId || '').trim();
        if (!id) return;
        if (!map[id]) map[id] = String(n.realtorName || id).trim();
    });

    return Object.keys(map)
        .map(function(id) { return { id: id, name: map[id] || id }; })
        .sort(function(a, b) { return a.name.localeCompare(b.name, 'ru'); });
}

function _renderCalendarRealtorSelects() {
    var realtors = _getCalendarRealtors();
    var filter = document.getElementById('calendar-realtor-filter');
    var modalSel = document.getElementById('calendar-note-realtor');
    var st = _calendarState();
    var realtorSess = getRealtorSession();
    var realtorSessId = realtorSess && realtorSess.rieltor_id ? String(realtorSess.rieltor_id) : '';

    if (filter) {
        if (realtorSessId) {
            filter.innerHTML = '<option value="' + _escMsg(realtorSessId) + '">' + _escMsg(realtorSess.name || realtorSessId) + '</option>';
            filter.value = realtorSessId;
            st.realtorFilter = realtorSessId;
            filter.disabled = true;
        } else {
            var prev = filter.value || st.realtorFilter || 'all';
            var orderedFilterRealtors = [];
            var filterCompanyOpt = realtors.find(function(r) { return String(r.id) === CALENDAR_TARGET_COMPANY; });
            var filterAllOpt = realtors.find(function(r) { return String(r.id) === CALENDAR_TARGET_ALL_REALTORS; });
            if (filterCompanyOpt) orderedFilterRealtors.push(filterCompanyOpt);
            if (filterAllOpt) orderedFilterRealtors.push(filterAllOpt);
            realtors
                .filter(function(r) {
                    var id = String(r.id);
                    return id !== CALENDAR_TARGET_COMPANY && id !== CALENDAR_TARGET_ALL_REALTORS;
                })
                .forEach(function(r) { orderedFilterRealtors.push(r); });

            filter.innerHTML = '<option value="all">Все события</option>' + orderedFilterRealtors.map(function(r) {
                return '<option value="' + _escMsg(r.id) + '">' + _escMsg(r.name) + '</option>';
            }).join('');
            filter.value = Array.from(filter.options).some(function(o) { return o.value === prev; }) ? prev : 'all';
            st.realtorFilter = filter.value;
            filter.disabled = false;
        }
    }

    if (modalSel) {
        if (realtorSessId) {
            modalSel.innerHTML = '<option value="' + _escMsg(realtorSessId) + '">' + _escMsg(realtorSess.name || realtorSessId) + '</option>';
            modalSel.value = realtorSessId;
            modalSel.disabled = true;
        } else {
            var prevModal = modalSel.value || '';
            var orderedModalRealtors = [];
            var companyOpt = realtors.find(function(r) { return String(r.id) === CALENDAR_TARGET_COMPANY; });
            var allOpt = realtors.find(function(r) { return String(r.id) === CALENDAR_TARGET_ALL_REALTORS; });
            if (companyOpt) orderedModalRealtors.push(companyOpt);
            if (allOpt) orderedModalRealtors.push(allOpt);
            realtors
                .filter(function(r) {
                    var id = String(r.id);
                    return id !== CALENDAR_TARGET_COMPANY && id !== CALENDAR_TARGET_ALL_REALTORS;
                })
                .forEach(function(r) { orderedModalRealtors.push(r); });

            modalSel.innerHTML = '<option value="">Не выбран</option>' + orderedModalRealtors.map(function(r) {
                return '<option value="' + _escMsg(r.id) + '">' + _escMsg(r.name) + '</option>';
            }).join('');
            if (prevModal && Array.from(modalSel.options).some(function(o) { return o.value === prevModal; })) {
                modalSel.value = prevModal;
            }
            modalSel.disabled = false;
        }
    }
}

function _getFilteredCalendarNotes() {
    var st = _calendarState();
    var notes = _getCalendarNotes();
    if (!st.realtorFilter || st.realtorFilter === 'all') return notes;
    var filterId = String(st.realtorFilter || '');
    var realtorSess = getRealtorSession();
    if (realtorSess && realtorSess.rieltor_id) {
        var rid = String(realtorSess.rieltor_id);
        return notes.filter(function(n) {
            var target = String(n.realtorId || '');
            return target === rid || target === CALENDAR_TARGET_ALL_REALTORS;
        });
    }
    return notes.filter(function(n) { return String(n.realtorId || '') === filterId; });
}

function _renderCalendarDayEntries() {
    var st = _calendarState();
    var list = document.getElementById('calendar-day-entries');
    var title = document.getElementById('calendar-selected-date-title');
    if (!list || !title) return;

    var notes = _getFilteredCalendarNotes()
        .filter(function(n) { return String(n.date || '') === st.selectedDate; })
        .sort(function(a, b) { return String(a.time || '').localeCompare(String(b.time || '')); });

    var d = new Date(st.selectedDate + 'T00:00:00');
    title.textContent = 'Записи на ' + d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });

    if (!notes.length) {
        list.innerHTML = '<div class="flex items-center gap-3 py-4 px-4 rounded-xl" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);"><i class="fas fa-calendar-times" style="color:rgba(255,215,0,0.3);font-size:1.2rem;"></i><span class="text-gray-500 text-sm">На эту дату записей нет</span></div>';
        return;
    }

    var typeIcons = { 'Встреча': 'fa-handshake', 'Показ': 'fa-home', 'Звонок': 'fa-phone', 'Другое': 'fa-bookmark' };
    var typeColors = { 'Встреча': '#a78bfa', 'Показ': '#34d399', 'Звонок': '#60a5fa', 'Другое': '#fbbf24' };

    list.innerHTML = notes.map(function(n) {
        var time = n.time ? _escMsg(n.time) : '--:--';
        var realtorTargetId = String(n.realtorId || '');
        var realtorLabel = _calendarTargetLabel(realtorTargetId);
        var realtor = realtorLabel ? _escMsg(realtorLabel) : (n.realtorName ? _escMsg(n.realtorName) : 'Не назначен');
        var type = _escMsg(n.type || 'Другое');
        var icon = typeIcons[n.type] || 'fa-bookmark';
        var color = typeColors[n.type] || '#fbbf24';
        var runtimeAgents = _getAgentListForClientOwner();
        var agentPhoto = null;
        
        // Special targets: company and all realtors
        if (realtorTargetId === CALENDAR_TARGET_COMPANY) {
            agentPhoto = 'https://i.ibb.co/35ZQ5g8X/logo.png';
        } else if (realtorTargetId === CALENDAR_TARGET_ALL_REALTORS) {
            agentPhoto = null; // Will show group icon
        } else {
            var agentObj = runtimeAgents.find(function(a) { return String(a.rieltor_id) === realtorTargetId; });
            agentPhoto = agentObj && agentObj.photo ? agentObj.photo : null;
        }
        
        var realtorSessView = getRealtorSession();
        var canEditNote = !(realtorSessView && realtorSessView.rieltor_id) || realtorTargetId === String(realtorSessView.rieltor_id);
        return '<div style="background:linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02));border:1px solid rgba(255,215,0,0.12);border-radius:14px;padding:14px 16px;transition:box-shadow 0.2s;" ' +
            'onmouseover="this.style.boxShadow=\'0 4px 24px rgba(255,215,0,0.08)\'" onmouseout="this.style.boxShadow=\'none\'">' +
            '<div class="flex items-center gap-3">' +
                '<div style="width:36px;height:36px;border-radius:10px;background:' + color + '22;border:1px solid ' + color + '44;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
                    '<i class="fas ' + icon + '" style="color:' + color + ';font-size:0.85rem;"></i>' +
                '</div>' +
                '<div class="flex-1 min-w-0">' +
                    '<div class="cal-entry-title-desk font-semibold text-white text-sm truncate" style="margin-bottom:4px;">' + _escMsg(n.title || '') + '</div>' +
                    '<div class="cal-entry-meta">' +
                        '<span style="font-size:11px;color:' + color + ';font-weight:600;">' + type + '</span>' +
                        '<span class="cal-entry-title-desk" style="font-size:10px;color:rgba(255,255,255,0.25);">•</span>' +
                        '<span style="font-size:11px;color:rgba(255,215,0,0.8);font-weight:600;">' + time + '</span>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:row;align-items:center;gap:8px;flex-shrink:0;">' +
                    '<span style="font-size:12px;color:rgba(255,255,255,0.8);text-align:right;font-weight:500;max-width:80px;line-height:1.3;">' + realtor + '</span>' +
                    (agentPhoto
                        ? '<img src="' + agentPhoto + '" alt="" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,215,0,0.3);flex-shrink:0;">'
                        : (realtorTargetId === CALENDAR_TARGET_ALL_REALTORS
                            ? '<div style="width:38px;height:38px;border-radius:50%;background:rgba(255,215,0,0.1);border:2px solid rgba(255,215,0,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-users" style="color:rgba(255,215,0,0.6);font-size:0.9rem;"></i></div>'
                            : '<div style="width:38px;height:38px;border-radius:50%;background:rgba(255,215,0,0.1);border:2px solid rgba(255,215,0,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-user" style="color:rgba(255,215,0,0.5);font-size:0.9rem;"></i></div>')) +
                '</div>' +
            '</div>' +
            '<div class="cal-entry-title-mob font-semibold text-white text-sm" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">' + _escMsg(n.title || '') + '</div>' +
            (n.note ? '<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:6px;white-space:pre-wrap;">' + _escMsg(n.note) + '</div>' : '') +
            (canEditNote
                ? '<div style="display:flex;gap:8px;margin-top:10px;">' +
                    '<button onclick="window.editCalendarNote(\'' + n.id + '\')" style="padding:5px 14px;font-size:11px;font-weight:600;border-radius:8px;border:1px solid rgba(96,165,250,0.3);background:rgba(96,165,250,0.08);color:#60a5fa;cursor:pointer;transition:background 0.2s;" ' +
                        'onmouseover="this.style.background=\'rgba(96,165,250,0.18)\'" onmouseout="this.style.background=\'rgba(96,165,250,0.08)\'">' +
                        '<i class="fas fa-pen mr-1" style="font-size:9px;"></i>Изменить</button>' +
                    '<button onclick="window.deleteCalendarNote(\'' + n.id + '\')" style="padding:5px 14px;font-size:11px;font-weight:600;border-radius:8px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#f87171;cursor:pointer;transition:background 0.2s;" ' +
                        'onmouseover="this.style.background=\'rgba(239,68,68,0.18)\'" onmouseout="this.style.background=\'rgba(239,68,68,0.08)\'">' +
                        '<i class="fas fa-trash mr-1" style="font-size:9px;"></i>Удалить</button>' +
                '</div>'
                : '') +
        '</div>';
    }).join('');
}

function _renderCalendarGrid() {
    var st = _calendarState();
    var grid = document.getElementById('admin-calendar-grid');
    var monthLabel = document.getElementById('calendar-month-label');
    if (!grid || !monthLabel) return;

    var firstDay = new Date(st.year, st.month, 1);
    var lastDay = new Date(st.year, st.month + 1, 0);
    var daysInMonth = lastDay.getDate();
    var startWeekday = (firstDay.getDay() + 6) % 7;

    monthLabel.textContent = firstDay.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

    var weekNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var notes = _getFilteredCalendarNotes();
    var notesMap = {};
    notes.forEach(function(n) {
        var key = String(n.date || '');
        if (!key) return;
        notesMap[key] = (notesMap[key] || 0) + 1;
    });

    var cells = weekNames.map(function(n) {
        return '<div class="text-center text-xs font-semibold py-2" style="color:rgba(255,215,0,0.5);letter-spacing:0.05em;">' + n + '</div>';
    });

    for (var i = 0; i < startWeekday; i++) {
        cells.push('<div class="cal-empty-cell rounded-xl min-h-[68px]" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);"></div>');
    }

    for (var day = 1; day <= daysInMonth; day++) {
        var iso = st.year + '-' + _pad2(st.month + 1) + '-' + _pad2(day);
        var isSelected = st.selectedDate === iso;
        var hasNotes = !!notesMap[iso];
        var count = notesMap[iso] || 0;
        var isToday = iso === new Date().toISOString().slice(0, 10);

        var cellBg = isSelected
            ? 'background:linear-gradient(135deg,rgba(255,215,0,0.18),rgba(255,215,0,0.08));border:1px solid rgba(255,215,0,0.6);'
            : isToday
                ? 'background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.25);'
                : 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);';

        var dayColor = isSelected ? '#ffd700' : isToday ? '#ffe066' : 'rgba(255,255,255,0.8)';
        cells.push(
            '<button type="button" data-calendar-date="' + iso + '" class="calendar-day-cell rounded-xl min-h-[68px] p-2 text-left transition-all duration-200 hover:scale-[1.03]" style="' + cellBg + '">' +
                '<div class="cal-desktop-row" style="display:flex;align-items:flex-start;justify-content:space-between;">' +
                    '<span style="font-size:0.875rem;font-weight:600;color:' + dayColor + ';">' + day + '</span>' +
                    (hasNotes ? '<span class="cal-cell-badge" style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 4px;border-radius:999px;background:#ffd700;color:#000;font-size:10px;font-weight:700;">' + count + '</span>' : '') +
                '</div>' +
                (hasNotes ? '<div class="cal-desktop-dots" style="margin-top:8px;display:flex;gap:4px;">' + Array(Math.min(count,3)).fill('<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#ffd700;opacity:0.8;"></span>').join('') + '</div>' : '') +
                '<div class="cal-mobile-layout" style="display:none;flex-direction:column;align-items:center;gap:2px;">' +
                    '<span style="width:4px;height:4px;border-radius:50%;background:#ffd700;' + (hasNotes ? '' : 'visibility:hidden;') + '"></span>' +
                    '<span style="font-size:0.875rem;font-weight:600;color:' + dayColor + ';">' + day + '</span>' +
                '</div>' +
            '</button>'
        );
    }

    grid.innerHTML = cells.join('');

    Array.from(grid.querySelectorAll('[data-calendar-date]')).forEach(function(btn) {
        btn.addEventListener('click', function() {
            st.selectedDate = btn.getAttribute('data-calendar-date') || st.selectedDate;
            _renderCalendarGrid();
            _renderCalendarDayEntries();
        });
    });
}

window.renderCalendarAdmin = function() {
    _renderCalendarRealtorSelects();
    _renderCalendarGrid();
    _renderCalendarDayEntries();
};

window.openCalendarNoteModal = function(dateIso, noteId) {
    var modal = document.getElementById('calendar-note-modal');
    if (!modal) return;

    _renderCalendarRealtorSelects();
    var idEl = document.getElementById('calendar-note-id');
    var dateEl = document.getElementById('calendar-note-date');
    var timeEl = document.getElementById('calendar-note-time');
    var realtorEl = document.getElementById('calendar-note-realtor');
    var typeEl = document.getElementById('calendar-note-type');
    var titleEl = document.getElementById('calendar-note-title');
    var textEl = document.getElementById('calendar-note-text');

    var note = null;
    if (noteId) {
        note = _getCalendarNotes().find(function(n) { return n.id === noteId; }) || null;
    }

    idEl.value = note ? note.id : '';
    dateEl.value = note ? (note.date || '') : (dateIso || _calendarState().selectedDate);
    timeEl.value = note ? (note.time || '') : '';
    realtorEl.value = note ? (note.realtorId || '') : '';
    typeEl.value = note ? (note.type || 'Встреча') : 'Встреча';
    titleEl.value = note ? (note.title || '') : '';
    textEl.value = note ? (note.note || '') : '';

    // В режиме риелтора — предзаполняем и блокируем поле выбора риелтора
    var realtorSessForCal = getRealtorSession();
    if (realtorSessForCal && realtorSessForCal.rieltor_id) {
        realtorEl.value = String(realtorSessForCal.rieltor_id);
        realtorEl.disabled = true;
    } else {
        realtorEl.disabled = false;
    }

    modal.classList.remove('hidden');
};

window.closeCalendarNoteModal = function() {
    var modal = document.getElementById('calendar-note-modal');
    if (modal) modal.classList.add('hidden');
};

window.editCalendarNote = function(id) {
    window.openCalendarNoteModal('', id);
};

window.deleteCalendarNote = function(id) {
    showConfirm('Удалить эту запись из календаря?', function() {
        var note = _getCalendarNotes().find(function(n) { return n.id === id; });
        var items = _getCalendarNotes().filter(function(n) { return n.id !== id; });
        _saveCalendarNotes(items);
        _logAction('Удаление события', 'Календарь встреч и показов', { noteId: id, title: note ? note.title : 'Неизвестно', date: note ? note.date : '' });
        window.renderCalendarAdmin();
        _refreshRealtorStatsIfVisible();
    });
};

window.initCalendarAdmin = function() {
    var wrap = document.getElementById('admin-calendar-view');
    if (!wrap || wrap.dataset.bound === '1') return;
    wrap.dataset.bound = '1';

    var st = _calendarState();
    var filterEl = document.getElementById('calendar-realtor-filter');
    var prevBtn = document.getElementById('calendar-prev-month');
    var nextBtn = document.getElementById('calendar-next-month');
    var addBtn = document.getElementById('calendar-add-note-btn');

    if (filterEl) {
        filterEl.addEventListener('change', function() {
            st.realtorFilter = filterEl.value || 'all';
            window.renderCalendarAdmin();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', function() {
            st.month -= 1;
            if (st.month < 0) { st.month = 11; st.year -= 1; }
            _renderCalendarGrid();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            st.month += 1;
            if (st.month > 11) { st.month = 0; st.year += 1; }
            _renderCalendarGrid();
        });
    }

    if (addBtn) {
        addBtn.addEventListener('click', function() {
            window.openCalendarNoteModal(st.selectedDate);
        });
    }

    var modal = document.getElementById('calendar-note-modal');
    var closeBtn = document.getElementById('calendar-note-close');
    var cancelBtn = document.getElementById('calendar-note-cancel');
    var form = document.getElementById('calendar-note-form');

    if (closeBtn) closeBtn.addEventListener('click', window.closeCalendarNoteModal);
    if (cancelBtn) cancelBtn.addEventListener('click', window.closeCalendarNoteModal);
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) window.closeCalendarNoteModal();
        });
    }

    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            var id = (document.getElementById('calendar-note-id') || {}).value || '';
            var date = (document.getElementById('calendar-note-date') || {}).value || '';
            var time = ((document.getElementById('calendar-note-time') || {}).value || '').trim();
            var realtorId = (document.getElementById('calendar-note-realtor') || {}).value || '';
            var realtorName = '';
            var realtorSel = document.getElementById('calendar-note-realtor');
            if (realtorSel && realtorSel.selectedIndex >= 0) {
                realtorName = realtorSel.options[realtorSel.selectedIndex].textContent || '';
                if (realtorId === '') realtorName = '';
            }
            if (realtorId === CALENDAR_TARGET_COMPANY) realtorName = 'Компания';
            if (realtorId === CALENDAR_TARGET_ALL_REALTORS) realtorName = 'Все риелторы';
            var type = (document.getElementById('calendar-note-type') || {}).value || 'Встреча';
            var title = ((document.getElementById('calendar-note-title') || {}).value || '').trim();
            var note = ((document.getElementById('calendar-note-text') || {}).value || '').trim();

            if (!date || !title) return;

            var items = _getCalendarNotes();
            if (id) {
                items = items.map(function(n) {
                    if (n.id !== id) return n;
                    return Object.assign({}, n, {
                        date: date,
                        time: time,
                        realtorId: realtorId,
                        realtorName: realtorName,
                        type: type,
                        title: title,
                        note: note
                    });
                });
            } else {
                items.push({
                    id: 'cal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                    date: date,
                    time: time,
                    realtorId: realtorId,
                    realtorName: realtorName,
                    type: type,
                    title: title,
                    note: note,
                    createdAt: Date.now()
                });
            }

            _saveCalendarNotes(items);
            if (!id) {
                _logAction('Добавление события', 'Календарь встреч и показов', { title: title, date: date, type: type, target: realtorName || realtorId });
            } else {
                _logAction('Редактирование события', 'Календарь встреч и показов', { noteId: id, title: title, date: date });
            }
            st.selectedDate = date;
            var dt = new Date(date + 'T00:00:00');
            st.year = dt.getFullYear();
            st.month = dt.getMonth();
            window.closeCalendarNoteModal();
            window.renderCalendarAdmin();
            _refreshRealtorStatsIfVisible();
        });
    }

    var historyToggleBtn = document.getElementById('history-calendar-toggle-btn');
    var historyPanel = document.getElementById('calendar-history-panel');
    var historyCloseBtn = document.getElementById('calendar-history-close-btn');
    
    if (historyToggleBtn && historyPanel) {
        historyToggleBtn.addEventListener('click', function() {
            var isHidden = historyPanel.classList.contains('hidden');
            if (isHidden) {
                historyPanel.classList.remove('hidden');
                _renderHistoryLogs('\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c \u0432\u0441\u0442\u0440\u0435\u0447 \u0438 \u043f\u043e\u043a\u0430\u0437\u043e\u0432');
            } else {
                historyPanel.classList.add('hidden');
            }
        });
    }
    
    if (historyCloseBtn) {
        historyCloseBtn.addEventListener('click', function() {
            historyPanel.classList.add('hidden');
        });
    }
};

document.addEventListener('DOMContentLoaded', function() {
    window.initCalendarAdmin && window.initCalendarAdmin();
});

window.addEventListener('storage', function(e) {
    if (e.key === CLIENTS_STORAGE_KEY) {
        var clientsView = document.getElementById('admin-clients-view');
        if (clientsView && !clientsView.classList.contains('hidden')) {
            window.renderClientsAdmin && window.renderClientsAdmin();
        }
        _refreshRealtorStatsIfVisible();
    }
    if (e.key === CALENDAR_STORAGE_KEY) {
        var calendarView = document.getElementById('admin-calendar-view');
        if (calendarView && !calendarView.classList.contains('hidden')) {
            window.renderCalendarAdmin && window.renderCalendarAdmin();
        }
        _refreshRealtorStatsIfVisible();
    }
});

