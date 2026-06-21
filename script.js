// ================================================================
// STATO GLOBALE
// ================================================================
let TYPOLOGIES = {};
let officialPlaces = [];
let activeMarkerElement = null;
let userLocationMarker = null;
let userCoords = null;
let currentCategory = 'ALL';
let currentProvince = 'ALL';
let markerClusterGroup;
let mapMarkersMap = new Map();
let currentPlaceId = null;
let mapViewState = JSON.parse(localStorage.getItem('mapViewState') || 'null');

// ================================================================
// TOAST
// ================================================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ================================================================
// SAFETY FALLBACK
// ================================================================
setTimeout(() => {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
        loadingScreen.classList.add('hidden');
        setTimeout(() => loadingScreen.style.display = 'none', 700);
    }
}, 5000);

// ================================================================
// 4. WELCOME POPUP (solo quando apre il sito)
// ================================================================

function showWelcomePopup() {
    const popup = document.getElementById('welcomePopup');
    if (!popup) return;

    // Controlla se il popup è già stato mostrato in questa sessione
    if (sessionStorage.getItem('welcomePopupShown') === 'true') {
        return;
    }

    popup.classList.remove('hidden');
    document.body.classList.add('popup-open');
    sessionStorage.setItem('welcomePopupShown', 'true');
}

function closeWelcomePopup() {
    const popup = document.getElementById('welcomePopup');
    if (popup) {
        popup.classList.add('hidden');
        document.body.classList.remove('popup-open');
    }
}

// ===== Mostra il popup dopo il caricamento della pagina =====
document.addEventListener('DOMContentLoaded', function() {
    // Aspetta 1.5 secondi per dare tempo al caricamento
    setTimeout(showWelcomePopup, 1500);
});

// ===== Chiudi con ESC =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const popup = document.getElementById('welcomePopup');
        if (popup && !popup.classList.contains('hidden')) {
            closeWelcomePopup();
        }
    }
});

// ================================================================
// MAP - INIT
// ================================================================
const map = L.map('map', {
    attributionControl: false,
    zoomControl: false,
    doubleClickZoom: false,
    tap: L.Browser.mobile,
    maxZoom: 19,
    minZoom: 3
});

if (mapViewState && mapViewState.lat && mapViewState.lng) {
    map.setView([mapViewState.lat, mapViewState.lng], mapViewState.zoom || 6);
} else {
    map.setView([42.5, 12.5], 6);
}

L.maplibreGL({
    style: 'https://tiles.openfreemap.org/styles/liberty',
}).addTo(map);

map.on('moveend', function() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    localStorage.setItem('mapViewState', JSON.stringify({
        lat: center.lat,
        lng: center.lng,
        zoom: zoom
    }));
});

// ================================================================
// CLUSTER GROUP
// ================================================================
markerClusterGroup = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 40,
    iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
            html: `<div style="background:#182033;color:white;border:2px solid #182033;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${count}</div>`,
            className: '',
            iconSize: [38, 38],
            iconAnchor: [19, 19]
        });
    }
});
markerClusterGroup.addTo(map);

// ================================================================
// MAP - HIDE LOADING SCREEN
// ================================================================
function hideLoadingScreen() {
    const el = document.getElementById('loading-screen');
    if (el) {
        el.classList.add('hidden');
        setTimeout(() => el.style.display = 'none', 700);
    }
}

// ================================================================
// MAP - LOAD DATABASE
// ================================================================
async function loadDatabase() {
    const progressBar = document.getElementById('loading-bar');
    
    try {
        // 1. Inizio caricamento (fissiamo la barra al 20%)
        if (progressBar) progressBar.style.width = '20%';
        
        const response = await fetch('database.json');
        if (!response.ok) throw new Error('JSON file not found');
        
        // 2. File scaricato, inizio parsing dei dati (portiamo al 60%)
        if (progressBar) progressBar.style.width = '60%';
        const data = await response.json();
        
        TYPOLOGIES = data.typologies;
        officialPlaces = data.officialPlaces.map(p => {
            if (!p.added) {
                const d = new Date();
                d.setDate(d.getDate() - 10);
                p.added = d.toISOString();
            }
            return p;
        });
        
        // 3. Elaborazione dell'interfaccia grafica (portiamo all'85%)
        if (progressBar) progressBar.style.width = '85%';
        setupDynamicUI();
        applyFilters(false);
        handleDirectLink();
        
        // 4. Completato! (100%)
        if (progressBar) progressBar.style.width = '100%';
        
        setTimeout(hideLoadingScreen, 400); // Leggero delay per mostrare il 100% completato
    } catch (error) {
        document.querySelector('.loading-text').textContent = 'Error loading data. Please refresh.';
        if (progressBar) {
            progressBar.style.backgroundColor = '#dc2626'; // Colora la barra di rosso errore
            progressBar.style.width = '100%';
        }
        setTimeout(hideLoadingScreen, 1500);
    }
}

// ================================================================
// MAP - SETUP DYNAMIC UI
// ================================================================
function setupDynamicUI() {
    const catContainer = document.getElementById('categoryChipsContainer');
    catContainer.innerHTML = `<button class="chip active" id="chip-cat-all" onclick="filterCategory('ALL')">All</button>`;
    Object.keys(TYPOLOGIES).forEach(key => {
        const cat = TYPOLOGIES[key];
        catContainer.innerHTML += `<button class="chip" id="chip-cat-${key}" onclick="filterCategory('${key}')"><span class="material-icons" style="font-size:16px;">${cat.icon}</span> ${cat.label}</button>`;
    });

    const provContainer = document.getElementById('provinceChipsContainer');
    const uniqueProvinces = [...new Set(officialPlaces.map(p => p.province))].sort();
    provContainer.innerHTML = `<button class="chip active" id="chip-prov-all" onclick="filterProvince('ALL')">All (${officialPlaces.length})</button>`;
    uniqueProvinces.forEach(prov => {
        provContainer.innerHTML += `<button class="chip" id="chip-prov-${prov.replace(/\s+/g,'-')}" onclick="filterProvince('${prov}')">${prov}</button>`;
    });
}

// ================================================================
// MAP - TOGGLE FILTERS
// ================================================================
function toggleFilterDrawer() {
    document.getElementById('filterDrawer').classList.toggle('active');
    document.getElementById('toggleFiltersBtn').classList.toggle('active');
}

// ================================================================
// MAP - APPLY FILTERS
// ================================================================
function applyFilters(isSearching = false) {
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    markerClusterGroup.clearLayers();
    mapMarkersMap.clear();

    let visiblePlaces = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    officialPlaces.forEach(place => {
        const matchesCategory = currentCategory === 'ALL' || place.typology === currentCategory;
        const matchesProvince = currentProvince === 'ALL' || place.province === currentProvince;
        const matchesSearch = place.name.toLowerCase().includes(searchQuery) ||
                              place.address.toLowerCase().includes(searchQuery) ||
                              (TYPOLOGIES[place.typology]?.label || '').toLowerCase().includes(searchQuery);

        if (matchesCategory && matchesProvince && matchesSearch) {
            visiblePlaces.push(place);
            const catInfo = TYPOLOGIES[place.typology] || { icon: 'wine_bar' };
            let statusClass = '';
            if (place.status === 'In pausa') statusClass = 'paused-status';
            if (place.status === 'Chiuso') statusClass = 'closed-status';

            const isNew = place.added && new Date(place.added) > sevenDaysAgo;
            const newClass = isNew ? 'new-marker' : '';

            const customIcon = L.divIcon({
                className: `paper-spot-marker ${statusClass} ${newClass}`,
                html: `<span class="material-icons">${catInfo.icon}</span>`,
                iconSize: [38, 38],
                iconAnchor: [19, 19]
            });
            const marker = L.marker([place.lat, place.lng], { icon: customIcon });
            marker.on('click', (e) => { focusOnMarker(e.target, place); });
            markerClusterGroup.addLayer(marker);
            mapMarkersMap.set(place.name, marker);
        }
    });

    if (visiblePlaces.length === 1) {
        const single = visiblePlaces[0];
        const marker = mapMarkersMap.get(single.name);
        if (marker) focusOnMarker(marker, single, 12);
    } else if (visiblePlaces.length > 1 && !isSearching) {
        const bounds = L.latLngBounds(visiblePlaces.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9, animate: true, duration: 0.4 });
    }
}

// ================================================================
// MAP - FOCUS ON MARKER
// ================================================================
function focusOnMarker(marker, place, targetZoom = null) {
    if (activeMarkerElement) activeMarkerElement.classList.remove('selected');
    activeMarkerElement = marker._icon;
    if (activeMarkerElement) activeMarkerElement.classList.add('selected');

    const currentZoom = map.getZoom();
    const finalZoom = targetZoom || (currentZoom < 12 ? 12 : currentZoom);
    const offsetLat = finalZoom >= 12 ? 0.024 : 0.065;
    map.setView([place.lat - offsetLat, place.lng], finalZoom, { animate: true, duration: 0.35 });
    openSheetDetails(place);
}

// ================================================================
// MAP - GEOLOCATION
// ================================================================
function locateUser() {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported.', 'error');
        return;
    }

    const locateBtn = document.getElementById('locateBtn');

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            userCoords = { lat, lng };

            if (userLocationMarker) map.removeLayer(userLocationMarker);
            const geoIcon = L.divIcon({ className: 'user-location-marker', iconSize: [18,18], iconAnchor: [9,9] });
            userLocationMarker = L.marker([lat, lng], { icon: geoIcon }).addTo(map);
            map.setView([lat, lng], 15, { animate: true, duration: 0.6 });

            locateBtn.classList.add('active-location');
            showToast('📍 Location found!', 'success');
        },
        () => {
            showToast('Unable to access location. Check GPS permissions.', 'error');
        },
        { enableHighAccuracy: true, timeout: 6000 }
    );
}

// ================================================================
// MAP - FILTERS
// ================================================================
function filterCategory(key) {
    currentCategory = key;
    document.querySelectorAll('#categoryChipsContainer .chip').forEach(c => c.classList.remove('active'));
    if (key === 'ALL') document.getElementById('chip-cat-all').classList.add('active');
    else document.getElementById(`chip-cat-${key}`).classList.add('active');
    applyFilters(false);
    closeSheet();
}

function filterProvince(key) {
    currentProvince = key;
    document.querySelectorAll('#provinceChipsContainer .chip').forEach(c => c.classList.remove('active'));
    if (key === 'ALL') document.getElementById('chip-prov-all').classList.add('active');
    else document.getElementById(`chip-prov-${key.replace(/\s+/g,'-')}`).classList.add('active');
    applyFilters(false);
    closeSheet();
}

// ================================================================
// MAP - BOTTOM SHEET DETAILS
// ================================================================
const sheet = document.getElementById('bottomSheet');

function openSheetDetails(place) {
    const catInfo = TYPOLOGIES[place.typology] || { label: 'Fermented', icon: 'wine_bar' };
    document.getElementById('placeTitle').textContent = place.name;
    document.getElementById('placeDesc').textContent = `Location: ${place.address} (${place.province})`;
    document.getElementById('placeTagText').textContent = catInfo.label;
    document.getElementById('placeTagIcon').textContent = catInfo.icon;
    const statusTag = document.getElementById('statusTagText');
    statusTag.textContent = place.status === 'Attivo' ? 'Active' : place.status === 'In pausa' ? 'Paused' : 'Closed';
    statusTag.className = `sheet-tag status-tag ${place.status.toLowerCase().replace(' ', '-')}`;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const isNew = place.added && new Date(place.added) > sevenDaysAgo;
    document.getElementById('newBadge').style.display = isNew ? 'inline-flex' : 'none';

    const webBtn = document.getElementById('linkWeb');
    webBtn.style.display = (place.web && place.web !== '') ? 'flex' : 'none';
    if (place.web) webBtn.href = place.web;
    document.getElementById('linkIg').href = place.ig || '#';
    document.getElementById('linkMaps').href = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
    sheet.classList.add('active');
    document.body.classList.add('sheet-open');
    currentPlaceId = place.name;
}

function closeSheet() {
    sheet.classList.remove('active');
    sheet.style.transform = '';
    document.body.classList.remove('sheet-open');
    if (activeMarkerElement) {
        activeMarkerElement.classList.remove('selected');
        activeMarkerElement = null;
    }
    currentPlaceId = null;
}

// ================================================================
// MAP - SWIPE TO CLOSE
// ================================================================
function setupSwipeToClose(sheetEl, handleEl, closeFn) {
    if (!sheetEl || !handleEl) { return; }
    let startY=0, currentY=0, isDragging=false;
    handleEl.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        sheetEl.style.transition = 'none';
    }, { passive: true });
    handleEl.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const delta = currentY - startY;
        if (delta > 0) sheetEl.style.transform = `translateY(${delta}px)`;
    }, { passive: true });
    handleEl.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        sheetEl.style.transition = 'transform 0.3s cubic-bezier(0.16,1,0.3,1)';
        const delta = currentY - startY;
        if (delta > 100) closeFn();
        else sheetEl.style.transform = 'translateY(0)';
        startY = 0; currentY = 0;
    });
}
setupSwipeToClose(sheet, document.getElementById('handleDetails'), closeSheet);

// ================================================================
// MAP - MENU
// ================================================================
function toggleMenu() {
    const drawer = document.getElementById('menuDrawer');
    const overlay = document.getElementById('menuOverlay');
    drawer.classList.toggle('open');
    overlay.classList.toggle('active');
    document.body.classList.toggle('menu-open');
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const drawer = document.getElementById('menuDrawer');
        if (drawer.classList.contains('open')) toggleMenu();
    }
});

// ================================================================
// MAP - DIRECT LINK
// ================================================================
function handleDirectLink() {
    const params = new URLSearchParams(window.location.search);
    const placeName = params.get('place');
    if (placeName) {
        const place = officialPlaces.find(p => p.name === placeName);
        if (place) {
            const marker = mapMarkersMap.get(placeName);
            if (marker) {
                setTimeout(() => {
                    focusOnMarker(marker, place, 12);
                    showToast(`📍 ${placeName}`, 'info');
                }, 500);
            } else {
                const checkMarker = setInterval(() => {
                    const m = mapMarkersMap.get(placeName);
                    if (m) {
                        focusOnMarker(m, place, 12);
                        showToast(`📍 ${placeName}`, 'info');
                        clearInterval(checkMarker);
                    }
                }, 200);
                setTimeout(() => clearInterval(checkMarker), 5000);
            }
        }
    }
}

// ================================================================
// MAP - AUTOCOMPLETE
// ================================================================
function onSearchInput() {
    const input = document.getElementById('searchInput');
    const query = input.value.toLowerCase();
    const list = document.getElementById('autocomplete-list');
    if (!query) { list.classList.remove('active'); return; }

    const matches = [];
    const seen = new Set();

    officialPlaces.forEach(p => {
        if (p.name.toLowerCase().includes(query) && !seen.has(p.name)) {
            matches.push({ type: 'place', name: p.name, icon: 'place' });
            seen.add(p.name);
        }
    });

    Object.keys(TYPOLOGIES).forEach(key => {
        const label = TYPOLOGIES[key].label;
        if (label.toLowerCase().includes(query) && !seen.has(label)) {
            matches.push({ type: 'typology', name: label, icon: TYPOLOGIES[key].icon || 'category' });
            seen.add(label);
        }
    });

    if (matches.length === 0) { list.classList.remove('active'); return; }

    const results = matches.slice(0, 8);
    let html = '';
    results.forEach(item => {
        const icon = item.type === 'place' ? 'place' : item.icon;
        html += `<div class="autocomplete-item" onclick="selectAutocomplete('${item.name}', '${item.type}')">
            <span class="material-icons">${icon}</span>
            ${item.name}
            <span style="color:var(--text-dim);font-weight:400;font-size:0.7rem;margin-left:auto;">
                ${item.type === 'place' ? '📌 Producer' : '🏷️ Type'}
            </span>
        </div>`;
    });
    list.innerHTML = html;
    list.classList.add('active');
}

function selectAutocomplete(name, type) {
    document.getElementById('searchInput').value = name;
    document.getElementById('autocomplete-list').classList.remove('active');

    if (type === 'typology') {
        const typologyKey = Object.keys(TYPOLOGIES).find(key => TYPOLOGIES[key].label === name);
        if (typologyKey) {
            filterCategory(typologyKey);
            showToast(`🔍 Filter by: ${name}`, 'info');
        }
    } else {
        const marker = mapMarkersMap.get(name);
        if (marker) {
            const place = officialPlaces.find(p => p.name === name);
            if (place) focusOnMarker(marker, place);
        }
    }
}

// ================================================================
// MAP - ERROR REPORT
// ================================================================
let currentReportPlace = null;

function openErrorReport() {
    const placeName = document.getElementById('placeTitle').textContent;
    const place = officialPlaces.find(p => p.name === placeName);
    if (!place) {
        showToast('Error: producer not found', 'error');
        return;
    }
    currentReportPlace = place;
    document.getElementById('errorPlaceName').textContent = place.name;
    document.getElementById('errorMessage').value = '';
    document.getElementById('errorOverlay').classList.remove('hidden');
    document.body.classList.add('sheet-open');
}

function closeErrorReport() {
    document.getElementById('errorOverlay').classList.add('hidden');
    document.body.classList.remove('sheet-open');
    currentReportPlace = null;
}

function closeErrorOverlayOutside(event) {
    if (event.target === event.currentTarget) {
        closeErrorReport();
    }
}

function submitErrorReport() {
    const message = document.getElementById('errorMessage').value.trim();
    if (!message) {
        showToast('Please describe what is wrong.', 'warning');
        return;
    }
    if (!currentReportPlace) {
        showToast('Error: producer not found.', 'error');
        return;
    }

    const btn = document.getElementById('errorSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span> Sending...`;
    btn.classList.add('btn-loading');

    const email = 'info@noloitaly.com';
    const subject = encodeURIComponent(`Error report: ${currentReportPlace.name}`);
    const body = encodeURIComponent(
        `Hello Riccardo,\n\n` +
        `⚠️ Quick error report\n\n` +
        `📌 Producer: ${currentReportPlace.name}\n` +
        `🏷️ Type: ${currentReportPlace.typology}\n` +
        `📍 Address: ${currentReportPlace.address}\n` +
        `🗺️ Province: ${currentReportPlace.province}\n` +
        `📊 Status: ${currentReportPlace.status}\n` +
        `🌐 Website: ${currentReportPlace.web || 'Not specified'}\n` +
        `📸 Instagram: ${currentReportPlace.ig || 'Not specified'}\n\n` +
        `❌ Error reported:\n${message}\n\n` +
        `--\nSent from No/Lo Italy App`
    );

    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');

    setTimeout(() => {
        closeErrorReport();
        btn.disabled = false;
        btn.innerHTML = `<span class="material-icons">send</span> Send report`;
        btn.classList.remove('btn-loading');
        showToast('🙏 Thank you for your report!', 'success');
    }, 500);
}

// ================================================================
// SUGGERISCI - LOGICA
// ================================================================
let produttoriList = [];

function toggleSuggestionType() {
    const select = document.getElementById('sugTypeSelect');
    const correctionField = document.getElementById('correzioneField');
    const nameLabel = document.getElementById('nameLabel');
    const introText = document.getElementById('introText');
    const introCard = document.getElementById('introCard');
    const sugName = document.getElementById('sugName');

    if (select.value === 'correzione') {
        correctionField.style.display = 'block';
        nameLabel.textContent = 'Corrected Name *';
        introText.textContent = '✏️ Report an error for a producer already on the map. Select it from the list below.';
        introCard.style.background = 'var(--accent-purple)';
        introCard.style.color = 'white';
        sugName.placeholder = 'E.g. Eko lab (corrected name)';
    } else {
        correctionField.style.display = 'none';
        nameLabel.textContent = 'Brand / Company Name *';
        introText.textContent = '🚀 Help us grow! Suggest a producer that deserves to be on the map.';
        introCard.style.background = 'var(--accent-yellow)';
        introCard.style.color = 'var(--text-ink)';
        sugName.placeholder = 'E.g. Eko lab';
    }
}

async function loadProduttori() {
    try {
        const response = await fetch('database.json');
        if (!response.ok) throw new Error('File not found');
        const data = await response.json();
        produttoriList = data.officialPlaces.map(p => p.name).sort();
        populateCorrezioneSelect();
    } catch (error) {
        produttoriList = [
            'Bibi Kombucha', 'Frui Kombucha', 'Kamen Kombucha',
            'Live Barrels', 'La Fermenteria', 'Cultura Viva Kombucha'
        ];
        populateCorrezioneSelect();
    }
}

function populateCorrezioneSelect() {
    const select = document.getElementById('sugCorrezione');
    if (!select) return;
    if (produttoriList.length === 0) {
        select.innerHTML = '<option value="">No producers available</option>';
        return;
    }
    let html = '<option value="">Select a producer...</option>';
    produttoriList.forEach(name => {
        html += `<option value="${name}">${name}</option>`;
    });
    select.innerHTML = html;
}

function submitSuggestion(e) {
    e.preventDefault();

    const tipo = document.getElementById('sugTypeSelect').value;
    const nomeCorretto = document.getElementById('sugName').value.trim();
    const tipologia = document.getElementById('sugType').value.trim();
    const indirizzo = document.getElementById('sugAddress').value.trim();
    const provincia = document.getElementById('sugProv').value.trim();
    const stato = document.getElementById('sugStatus').value;
    const web = document.getElementById('sugWeb').value.trim() || 'Not specified';
    const ig = document.getElementById('sugIg').value.trim() || 'Not specified';

    let nomeDaCorreggere = '';
    if (tipo === 'correzione') {
        const select = document.getElementById('sugCorrezione');
        nomeDaCorreggere = select.value;
        if (!nomeDaCorreggere) {
            alert('Please select a producer from the list to correct.');
            return;
        }
    }

    if (!nomeCorretto || !tipologia || !indirizzo || !provincia) {
        alert('Please fill in all required fields (*).');
        return;
    }

    const email = 'info@noloitaly.com';
    let subject, body;

    if (tipo === 'nuovo') {
        subject = encodeURIComponent(`New No/Lo suggestion: ${nomeCorretto}`);
        body = encodeURIComponent(
            `Hello Riccardo,\n\n` +
            `A NEW producer has been suggested for the database:\n\n` +
            `📌 Name: ${nomeCorretto}\n` +
            `🏷️ Type: ${tipologia}\n` +
            `📍 Address: ${indirizzo}\n` +
            `🗺️ Province: ${provincia}\n` +
            `📊 Status: ${stato}\n` +
            `🌐 Website: ${web}\n` +
            `📸 Instagram: ${ig}\n\n` +
            `--\nSent via No/Lo Italy App`
        );
    } else {
        subject = encodeURIComponent(`Correction for: ${nomeCorretto}`);
        body = encodeURIComponent(
            `Hello Riccardo,\n\n` +
            `A CORRECTION has been submitted for an existing producer:\n\n` +
            `✏️ Producer to correct: ${nomeDaCorreggere}\n\n` +
            `📌 Corrected Name: ${nomeCorretto}\n` +
            `🏷️ Type: ${tipologia}\n` +
            `📍 Address: ${indirizzo}\n` +
            `🗺️ Province: ${provincia}\n` +
            `📊 Status: ${stato}\n` +
            `🌐 Website: ${web}\n` +
            `📸 Instagram: ${ig}\n\n` +
            `--\nSent via No/Lo Italy App`
        );
    }

    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    e.target.reset();

    document.getElementById('sugTypeSelect').value = 'nuovo';
    document.getElementById('correzioneField').style.display = 'none';
    document.getElementById('sugName').placeholder = 'E.g. Eko lab';
    document.getElementById('introText').textContent = '🚀 Help us grow! Suggest a producer that deserves to be on the map.';
    document.getElementById('introCard').style.background = 'var(--accent-yellow)';
    document.getElementById('introCard').style.color = 'var(--text-ink)';

    alert(
        '🙏 Thank you for your suggestion!\n\n' +
        'We have received your request and will review it as soon as possible.\n\n' +
        'The No/Lo Italy Team'
    );
}

// ================================================================
// REPORT BUG - LOGICA
// ================================================================
function submitBugReport(e) {
    e.preventDefault();

    const type = document.getElementById('bugType').value;
    const producer = document.getElementById('bugProducer').value.trim() || 'Not specified';
    const description = document.getElementById('bugDescription').value.trim();
    const device = document.getElementById('bugDevice').value.trim() || 'Not specified';
    const email = document.getElementById('bugEmail').value.trim() || 'Not provided';

    if (!type || !description) {
        alert('Please fill in all required fields.');
        return;
    }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span> Sending...`;
    btn.classList.add('btn-loading');

    const subject = encodeURIComponent(`[No/Lo Italy] Bug Report: ${type}`);
    const body = encodeURIComponent(
        `Type: ${type}\n` +
        `Producer: ${producer}\n` +
        `Description:\n${description}\n\n` +
        `Device/Browser: ${device}\n` +
        `User Email: ${email}\n` +
        `--\nSent from No/Lo Italy App`
    );

    window.open(`mailto:info@noloitaly.com?subject=${subject}&body=${body}`, '_blank');

    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-icons">bug_report</span> Submit Report`;
        btn.classList.remove('btn-loading');
        alert('✅ Thank you! Your bug report has been sent.\n\nWe will review it as soon as possible.');
        e.target.reset();
    }, 500);
}

// ================================================================
// MAP - CLOSE SHEET ON MAP CLICK
// ================================================================
// Mettiamo un controllo: se 'map' non esiste in questa pagina, salta questa riga senza andare in errore!
if (typeof map !== 'undefined' && map) {
    map.on('click', () => { closeSheet(); });
}

// ================================================================
// INIT PAGINE STATICHE (SUGGERISCI / CORREZIONE)
// ================================================================
if (document.getElementById('sugTypeSelect')) {
    document.addEventListener('DOMContentLoaded', async function() {
        // Imposta il valore iniziale del selettore
        document.getElementById('sugTypeSelect').value = 'nuovo';
        
        const corrField = document.getElementById('correzioneField');
        if (corrField) corrField.style.display = 'none';
        
        // --- AGGANCIO DEL FORM DI SUGGERIMENTO ---
        // Trova il form o il pulsante di invio e gli assegna la funzione
        const formSuggerimento = document.getElementById('submitBtn')?.form || document.getElementById('submitBtn');
        if (formSuggerimento) {
            formSuggerimento.addEventListener('submit', submitSuggestion);
        }
        
        const selectProduttore = document.getElementById('sugProduttoreSelect');
        if (selectProduttore) {
            try {
                // Prende i dati DIRETTAMENTE dal database.json in modo pulito
                const response = await fetch('database.json');
                if (!response.ok) throw new Error('Database json non trovato');
                const data = await response.json();
                
                const listonaProduttori = data.officialPlaces || [];

                // Svuota la scritta temporanea "Loading producers..."
                selectProduttore.innerHTML = '<option value="" disabled selected>Select the producer to correct *</option>';

                // Ordina alfabeticamente i produttori per nome
                listonaProduttori.sort((a, b) => a.name.localeCompare(b.name));

                // Inserisce i produttori dentro la select della pagina
                listonaProduttori.forEach(place => {
                    const option = document.createElement('option');
                    option.value = place.name;
                    option.textContent = place.name;
                    selectProduttore.appendChild(option);
                });
            } catch (error) {
                selectProduttore.innerHTML = '<option value="" disabled>Error loading producers</option>';
            }
        }
    });
}

// ================================================================
// MAP - START (Solo se siamo nella pagina della mappa)
// ================================================================
// Questo controllo evita che il codice vada in crash nelle pagine secondarie
if (document.getElementById('map')) {
    loadDatabase();
}