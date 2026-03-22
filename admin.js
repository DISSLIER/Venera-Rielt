/**
 * admin.js - простая админ-логика + общая синхронизация между пользователями.
 * Режимы работы:
 * 1) Firebase включен и настроен -> realtime синхронизация для всех.
 * 2) Firebase не настроен -> fallback на localStorage (как раньше).
 */

const CLOUD_SYNC_CONFIG = {
    enabled: false,
    firebase: {
        apiKey: "PASTE_API_KEY",
        authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
        databaseURL: "https://PASTE_PROJECT_ID-default-rtdb.firebaseio.com",
        projectId: "PASTE_PROJECT_ID",
        storageBucket: "PASTE_PROJECT_ID.appspot.com",
        messagingSenderId: "PASTE_SENDER_ID",
        appId: "PASTE_APP_ID"
    },
    dataPath: "venera/realtime"
};

let cloudDatabaseRef = null;
let isApplyingRemoteSnapshot = false;

function getCurrentAgentsArray() {
    try {
        if (Array.isArray(agents)) {
            return agents;
        }
    } catch (_) {
        // ignore
    }
    return [];
}

function collectPropertiesFromDom() {
    const cards = document.querySelectorAll('.property-card');
    const result = [];

    cards.forEach((card) => {
        const data = card.dataset;
        const titleNode = card.querySelector('h3');
        const addressNode = card.querySelector('.flex.items-center span');
        const imgNode = card.querySelector('img');
        const featureVals = card.querySelectorAll('.grid-cols-3 > div .font-semibold');

        result.push({
            id: String(data.id || '').trim(),
            title: titleNode ? titleNode.textContent.trim() : '',
            city: String(data.city || '').trim(),
            district: String(data.district || '').trim(),
            type: String(data.type || '').trim(),
            coords: String(data.coords || '').trim(),
            rieltorId: String(data.rieltorId || '').trim(),
            price: Number(data.price || 0),
            area: Number(data.area || (featureVals[0] ? String(featureVals[0].textContent).replace(/[^\d.]/g, '') : 0)),
            rooms: Number(data.rooms || (featureVals[1] ? String(featureVals[1].textContent).replace(/[^\d.]/g, '') : 0)),
            floors: Number(data.floors || (featureVals[2] ? String(featureVals[2].textContent).replace(/[^\d.]/g, '') : 0)),
            condition: String(data.condition || '').trim(),
            bathroom: String(data.bathroom || '').trim(),
            balcony: String(data.balcony || '').trim(),
            fullAddress: String(data.fullAddress || (addressNode ? addressNode.textContent : '')).trim(),
            description: String(data.description || '').trim(),
            mainPhoto: String(data.mainPhoto || (imgNode ? imgNode.src : '')).trim(),
            photos: normalizePhotosValue ? normalizePhotosValue(data.photos || []) : []
        });
    });

    return result;
}

function replacePropertiesInDom(propertiesPayload) {
    const grid = document.getElementById('properties-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const incoming = Array.isArray(propertiesPayload) ? propertiesPayload : [];
    const existingIds = new Set();
    let nextAutoId = 0;

    incoming.forEach((rawItem, index) => {
        const normalized = validateAndNormalizeConfiguredProperty
            ? validateAndNormalizeConfiguredProperty(rawItem, index)
            : null;

        if (!normalized || !appendPropertyCardToGrid) {
            return;
        }

        const appended = appendPropertyCardToGrid(normalized, grid, existingIds, nextAutoId);
        if (appended && appended.card) {
            appended.card.classList.add('visible');
        }
        if (appended && typeof appended.nextIdNumber === 'number') {
            nextAutoId = appended.nextIdNumber;
        }
    });

    if (typeof countAgentProperties === 'function') countAgentProperties();
    if (typeof renderAgents === 'function') renderAgents();
    if (typeof renderPropertiesList === 'function') renderPropertiesList();
    if (typeof updateAgentPhotos === 'function') updateAgentPhotos();

    if (typeof mainMap !== 'undefined' && mainMap && typeof initMainMap === 'function') {
        mainMap.remove();
        mainMap = null;
        if (typeof propertyMarkers !== 'undefined' && Array.isArray(propertyMarkers)) {
            propertyMarkers.length = 0;
        }
        initMainMap();
    }
}

function replaceAgentsInState(agentsPayload) {
    const incoming = Array.isArray(agentsPayload) ? agentsPayload : [];
    const normalized = incoming
        .map((item, index) => (typeof normalizeAgentConfig === 'function' ? normalizeAgentConfig(item, index) : item))
        .filter(Boolean);

    try {
        if (Array.isArray(agents)) {
            agents.splice(0, agents.length, ...normalized);
        }
    } catch (_) {
        // ignore
    }

    if (typeof populateRealtorDropdown === 'function') populateRealtorDropdown();
    if (typeof countAgentProperties === 'function') countAgentProperties();
    if (typeof renderAgents === 'function') renderAgents();
    if (typeof renderAgentsList === 'function') renderAgentsList();
    if (typeof updateAgentPhotos === 'function') updateAgentPhotos();
}

function saveToLocalStorage() {
    localStorage.setItem('venera_properties', JSON.stringify(collectPropertiesFromDom()));
    localStorage.setItem('venera_agents', JSON.stringify(getCurrentAgentsArray()));
}

function loadFromLocalStorage() {
    const savedProperties = localStorage.getItem('venera_properties');
    const savedAgents = localStorage.getItem('venera_agents');

    if (savedAgents) {
        try {
            replaceAgentsInState(JSON.parse(savedAgents));
        } catch (e) {
            console.log('Не удалось загрузить риелторов из localStorage:', e);
        }
    }

    if (savedProperties) {
        try {
            replacePropertiesInDom(JSON.parse(savedProperties));
        } catch (e) {
            console.log('Не удалось загрузить объекты из localStorage:', e);
        }
    }
}

function canInitCloudSync() {
    if (!CLOUD_SYNC_CONFIG.enabled) return false;
    if (typeof firebase === 'undefined') return false;

    const cfg = CLOUD_SYNC_CONFIG.firebase;
    const required = [cfg.apiKey, cfg.projectId, cfg.databaseURL, cfg.appId];
    return required.every((value) => typeof value === 'string' && value && !value.startsWith('PASTE_'));
}

function initCloudSync() {
    if (!canInitCloudSync()) {
        return false;
    }

    const appName = 'venera-realtime-app';
    let app = null;

    try {
        app = firebase.app(appName);
    } catch (_) {
        app = firebase.initializeApp(CLOUD_SYNC_CONFIG.firebase, appName);
    }

    const db = firebase.database(app);
    cloudDatabaseRef = db.ref(CLOUD_SYNC_CONFIG.dataPath);

    cloudDatabaseRef.on('value', (snapshot) => {
        const payload = snapshot.val();
        if (!payload || isApplyingRemoteSnapshot) return;

        isApplyingRemoteSnapshot = true;
        try {
            replaceAgentsInState(payload.agents || []);
            replacePropertiesInDom(payload.properties || []);
            saveToLocalStorage();
        } finally {
            isApplyingRemoteSnapshot = false;
        }
    });

    return true;
}

function pushSharedSnapshot() {
    saveToLocalStorage();

    if (!cloudDatabaseRef || isApplyingRemoteSnapshot) {
        return;
    }

    const payload = {
        updatedAt: Date.now(),
        agents: getCurrentAgentsArray(),
        properties: collectPropertiesFromDom()
    };

    cloudDatabaseRef.set(payload).catch((error) => {
        console.log('Ошибка cloud sync:', error);
    });
}

function updatePropertySaveHandler() {
    const form = document.getElementById('property-edit-form');
    if (!form) return;

    form.onsubmit = null;
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        const statusEl = document.getElementById('property-edit-status');
        const cardId = document.getElementById('property-id').value.trim();
        const isNew = cardId === '';

        const collected = collectPropertyFormData && collectPropertyFormData();
        if (!collected) return false;

        const { configTemplate, ...formProperty } = collected;
        if (!validatePropertyFormData || !validatePropertyFormData(formProperty, isNew ? 'добавлением' : 'сохранением')) {
            return false;
        }

        const normalized = validateAndNormalizeConfiguredProperty && validateAndNormalizeConfiguredProperty(formProperty, 0);
        if (!normalized) {
            if (statusEl) {
                statusEl.textContent = '❌ Ошибка данных объекта';
                statusEl.className = 'p-3 rounded-lg bg-red-600 text-white';
                statusEl.classList.remove('hidden');
            }
            return false;
        }

        const propertiesGrid = document.getElementById('properties-grid');

        if (isNew) {
            const existingIds = new Set(Array.from(document.querySelectorAll('.property-card')).map(c => c.dataset.id));
            const appendResult = appendPropertyCardToGrid && appendPropertyCardToGrid(
                normalized,
                propertiesGrid,
                existingIds,
                (getCurrentMaxPropertyIdNumber && getCurrentMaxPropertyIdNumber()) || 0
            );

            if (appendResult && appendResult.added && appendResult.card) {
                appendResult.card.classList.add('visible');
                const detailsBtn = appendResult.card.querySelector('.view-details-btn');
                if (detailsBtn) {
                    detailsBtn.addEventListener('click', function(ev) {
                        ev.preventDefault();
                        if (openPropertyOverlay) openPropertyOverlay(this);
                    });
                }
            }
        } else {
            const card = document.querySelector(`.property-card[data-id="${cardId}"]`);
            if (card) {
                const typeMeta = getPropertyTypeMeta && getPropertyTypeMeta(normalized.type);
                const priceValue = normalized.price;
                const image = normalized.mainPhoto || (card.querySelector('img') ? card.querySelector('img').src : '');

                card.dataset.city = normalized.city;
                card.dataset.district = normalized.district;
                card.dataset.type = typeMeta ? typeMeta.dataType : normalized.type;
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
                card.dataset.photos = serializePhotosForDataAttr && serializePhotosForDataAttr(normalized.photos);

                const cardImg = card.querySelector('img');
                if (cardImg) {
                    cardImg.src = image;
                    cardImg.alt = normalized.title;
                }

                const typeTag = card.querySelector('.type-tag');
                if (typeTag && typeMeta) {
                    typeTag.textContent = typeMeta.label;
                    typeTag.className = `type-tag ${typeMeta.tagClass}`;
                }

                const priceTag = card.querySelector('.price-tag');
                if (priceTag) priceTag.textContent = formatPriceValue && formatPriceValue(priceValue);

                const titleEl = card.querySelector('h3');
                if (titleEl) titleEl.textContent = normalized.title;

                const addressEl = card.querySelector('.flex.items-center span');
                if (addressEl) addressEl.textContent = normalized.fullAddress;

                const featureVals = card.querySelectorAll('.grid-cols-3 > div .font-semibold');
                if (featureVals[0]) featureVals[0].textContent = `${normalized.area} м²`;
                if (featureVals[1]) featureVals[1].textContent = normalized.rooms;
                if (featureVals[2]) featureVals[2].textContent = normalized.floors;

                const viewBtn = card.querySelector('.view-details-btn');
                if (viewBtn) viewBtn.dataset.price = priceValue;
            }
        }

        if (typeof updateAgentPhotos === 'function') updateAgentPhotos();
        if (typeof countAgentProperties === 'function') countAgentProperties();
        if (typeof renderAgents === 'function') renderAgents();
        if (typeof renderPropertiesList === 'function') renderPropertiesList();

        if (typeof mainMap !== 'undefined' && mainMap) {
            mainMap.remove();
            mainMap = null;
            if (typeof propertyMarkers !== 'undefined' && Array.isArray(propertyMarkers)) {
                propertyMarkers.length = 0;
            }
            if (typeof initMainMap === 'function') initMainMap();
        }

        pushSharedSnapshot();

        if (statusEl) {
            statusEl.textContent = isNew ? '✅ Объект добавлен!' : '✅ Объект обновлён!';
            statusEl.className = 'p-3 rounded-lg bg-green-600 text-white';
            statusEl.classList.remove('hidden');
            setTimeout(() => {
                if (closePropertyEditModal) closePropertyEditModal();
            }, 1200);
        } else if (closePropertyEditModal) {
            closePropertyEditModal();
        }

        return false;
    }, true);
}

function updateAgentSaveHandler() {
    const form = document.getElementById('agent-edit-form');
    if (!form) return;

    form.onsubmit = null;
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        const rieltorId = document.getElementById('agent-rieltor-id').value.trim();
        const name = document.getElementById('agent-name').value.trim();
        const position = document.getElementById('agent-position').value.trim();
        const statusEl = document.getElementById('agent-edit-status');

        if (!rieltorId || !name || !position) {
            if (statusEl) {
                statusEl.textContent = '❌ Заполните: ID, Имя, Должность';
                statusEl.className = 'p-3 rounded-lg bg-red-600 text-white';
                statusEl.classList.remove('hidden');
            }
            return false;
        }

        const formData = {
            id: document.getElementById('agent-id').value || `A${Date.now()}`,
            rieltor_id: rieltorId,
            name,
            position,
            phone: document.getElementById('agent-phone').value.trim(),
            email: document.getElementById('agent-email').value.trim(),
            whatsapp: document.getElementById('agent-whatsapp').value.trim(),
            telegram: document.getElementById('agent-telegram').value.trim(),
            viber: document.getElementById('agent-viber').value.trim(),
            photo: document.getElementById('agent-photo').value.trim(),
            properties_count: 0
        };

        let currentAgents = getCurrentAgentsArray();
        const existingIndex = currentAgents.findIndex(a => String(a.rieltor_id) === String(rieltorId));
        const isNew = existingIndex === -1;

        if (isNew) {
            currentAgents.push(formData);
        } else {
            currentAgents[existingIndex] = { ...currentAgents[existingIndex], ...formData };
        }

        if (typeof populateRealtorDropdown === 'function') populateRealtorDropdown();
        if (typeof countAgentProperties === 'function') countAgentProperties();
        if (typeof renderAgents === 'function') renderAgents();
        if (typeof renderAgentsList === 'function') renderAgentsList();
        if (typeof updateAgentPhotos === 'function') updateAgentPhotos();

        pushSharedSnapshot();

        if (statusEl) {
            statusEl.textContent = isNew ? '✅ Риелтор добавлен!' : '✅ Риелтор обновлён!';
            statusEl.className = 'p-3 rounded-lg bg-green-600 text-white';
            statusEl.classList.remove('hidden');
            setTimeout(() => {
                if (closeAgentEditModal) closeAgentEditModal();
            }, 1200);
        } else if (closeAgentEditModal) {
            closeAgentEditModal();
        }

        return false;
    }, true);
}

function hideLegacyAdminUi() {
    const hideElements = [
        'generate-config-snippet', 'copy-config-snippet', 'preview-config-property',
        'save-property-draft', 'load-property-draft', 'clear-property-draft',
        'property-config-snippet',
        'generate-agent-config-snippet', 'copy-agent-config-snippet',
        'agent-config-snippet', 'property-config-template'
    ];

    hideElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    hideLegacyAdminUi();
    loadFromLocalStorage();

    updatePropertySaveHandler();
    updateAgentSaveHandler();

    const cloudReady = initCloudSync();
    if (!cloudReady) {
        console.log('Cloud sync выключен: используется localStorage fallback.');
    }
});
