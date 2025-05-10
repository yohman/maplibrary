// Initialize Leaflet map
var map = L.map('map', {
	zoomControl: false // Disable zoom control
}).setView([0, 0], 2);

// Add a base tile layer (Google Satellite)
L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
	attribution: '&copy; <a href="https://maps.google.com/">Google Maps</a>'
}).addTo(map);

// Leaflet does not have a direct 'error' event like MapLibre for tile loading issues in the same way.
// Tile loading errors are typically handled by 'tileerror' event on the TileLayer itself.

const menuToggle = document.getElementById('menu-toggle');
const sidePanel = document.getElementById('side-panel');
const mapDiv = document.getElementById('map'); 
const mapCardsContainer = document.getElementById('map-cards-container');
const searchBox = document.getElementById('search-box');
const timelineCirclesContainer = document.getElementById('timeline-circles-container'); // New
const timelineTooltip = document.getElementById('timeline-tooltip'); // New
const timelinePanel = document.getElementById('timeline-panel'); // New
const timelineZoomIndicator = document.getElementById('timeline-zoom-indicator'); // New
const opacitySlider = document.getElementById('opacity-slider'); // New

let allMapsData = [];
let activeCustomLayer = null; // To keep track of the currently displayed custom map
let minYearGlobal = Infinity; // Renamed from minYear
let maxYearGlobal = -Infinity; // Renamed from maxYear

// Timeline Zoom State
let timelineZoomLevel = 1.0;
const MIN_TIMELINE_ZOOM = 1.0;
const MAX_TIMELINE_ZOOM = 20.0; // Max zoom factor (e.g., 10x)
const ZOOM_SENSITIVITY = 0.1;
let currentDisplayMinYear;
let currentDisplayMaxYear;

// Timeline Panning State
let isTimelinePanning = false; // Renamed from isPanning
let panStartX;
let panStartMinYear;
let panStartMaxYear;

// Map Opacity State
let currentMapOpacity = 0.85; // Default opacity

// Pinch Zoom State for Timeline
let initialPinchDistance = 0;
let isPinching = false;

menuToggle.addEventListener('click', () => {
	sidePanel.classList.toggle('open');
	menuToggle.classList.toggle('open');
	mapDiv.classList.toggle('panel-open'); 
	if (map) {
		// Delay invalidateSize to allow panel animation
		setTimeout(() => map.invalidateSize(), sidePanel.classList.contains('open') ? 150 : 300);
	}
});

// Helper function to calculate distance between two touches
function getDistance(touch1, touch2) {
    return Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
}

window.addEventListener('resize', () => {
	if (map) {
		map.invalidateSize();
	}
});

async function fetchMapsData() {
	try {
		const response = await fetch('data/maps.json'); // Assuming maps.json is in a 'data' folder
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		allMapsData = await response.json();

		// Calculate min and max years
		allMapsData.forEach(mapItem => {
			if (mapItem.mapping && mapItem.mapping.dateFrom && mapItem.mapping.dateFrom.date) {
				const year = parseInt(mapItem.mapping.dateFrom.date.split('-')[0], 10);
				if (!isNaN(year)) {
					if (year < minYearGlobal) minYearGlobal = year;
					if (year > maxYearGlobal) maxYearGlobal = year;
					mapItem.year = year; // Store parsed year for easier access
				}
			}
		});
		// Sort allMapsData by year for consistent vertical placement
		allMapsData.sort((a,b) => (a.year || 0) - (b.year || 0));
		
		// Initialize display years for timeline
		currentDisplayMinYear = minYearGlobal;
		currentDisplayMaxYear = maxYearGlobal;
		updateZoomIndicator();

		processAndDisplayAllMaps(); // Display all maps initially
		createTimeline(); // New: Create the timeline
	} catch (error) {
		console.error("Could not fetch maps data:", error);
		mapCardsContainer.innerHTML = "<p style='color:#F3361F;'>Error loading map data.</p>";
	}
}

function processAndDisplayAllMaps(searchTerm = "") {
	const lowerSearchTerm = searchTerm.toLowerCase();
	
	const filteredMaps = allMapsData.filter(mapItem => 
		mapItem.title.toLowerCase().includes(lowerSearchTerm)
		// You can extend search to other fields like city or description:
		// || (mapItem.city && mapItem.city.toLowerCase().includes(lowerSearchTerm))
		// || (mapItem.description && mapItem.description.toLowerCase().includes(lowerSearchTerm))
	);

	// Sort by title alphabetically
	const sortedMaps = filteredMaps.sort((a, b) => {
		const titleA = a.title.toLowerCase();
		const titleB = b.title.toLowerCase();
		if (titleA < titleB) return -1;
		if (titleA > titleB) return 1;
		return 0;
	});

	displayMapCards(sortedMaps);
}

function displayMapCards(mapsToDisplay) {
	mapCardsContainer.innerHTML = ''; // Clear previous cards

	if (mapsToDisplay.length === 0) {
		mapCardsContainer.innerHTML = "<p>No maps found.</p>";
		return;
	}

	mapsToDisplay.forEach(mapItem => {
		const card = document.createElement('div');
		card.className = 'map-card';
		card.dataset.mapId = String(mapItem.id); // Ensure mapId is a string for dataset
		
		let cardHTML = '';

		// Add thumbnail if available
		if (mapItem.thumbnailURL) {
			cardHTML += `<img src="${mapItem.thumbnailURL}" alt="Thumbnail for ${mapItem.title}" class="map-card-thumbnail">`;
		}
		
		cardHTML += `<div class="map-card-title">${mapItem.title}</div>`;
		if (mapItem.city) cardHTML += `<div class="map-card-info">City: ${mapItem.city}</div>`;
		if (mapItem.mapping && mapItem.mapping.dateFrom && mapItem.mapping.dateFrom.date) {
			const dateString = mapItem.mapping.dateFrom.date;
			const year = dateString.split('-')[0]; // Extract year from "yyyy-mm-dd hh:mm:ss"
			cardHTML += `<div class="map-card-info">Year: ${year}</div>`;
		}

		if (mapItem.description) cardHTML += `<div class="map-card-info">${mapItem.description.substring(0,100)}${mapItem.description.length > 100 ? '...' : ''}</div>`;

		card.innerHTML = cardHTML;
		
		card.addEventListener('click', () => {
			console.log('Map card clicked. Loading mapItem:', JSON.stringify(mapItem, null, 2));
			loadMapOnMainDisplay(mapItem); // This calls highlightTimelineCircle
			// highlightTimelineCircle(String(mapItem.id)); // This call is now primarily handled by loadMapOnMainDisplay and centerTimelineOnYear
			highlightMapCard(String(mapItem.id)); 
			if (mapItem.year) { 
				centerTimelineOnYear(mapItem.year, String(mapItem.id)); // Pass mapId for potential re-highlighting
			}
		});
		mapCardsContainer.appendChild(card);
	});
}

function loadMapOnMainDisplay(mapItem) {
	console.log("Loading map with Leaflet:", mapItem); 
	if (!map) {
		console.error("Leaflet map object is not initialized.");
		return;
	}

	console.log(`Attempting to load map: ${mapItem.title}`);
	
	let tileSourceUrl = mapItem.tileUrl ? mapItem.tileUrl : mapItem.tile_url_pattern;
	if (mapItem.tileUrl && !mapItem.tileUrl.endsWith("/")) {
		tileSourceUrl += "/";
	}
	tileSourceUrl = tileSourceUrl + '{z}/{x}/{y}.png';
	
	if (!tileSourceUrl) {
		console.error("Map item does not have a valid tileUrl or tile_url_pattern.", mapItem);
		return;
	}
	console.log(`Tile URL for Leaflet: ${tileSourceUrl}`);

	// Remove previous custom layer if it exists
	if (activeCustomLayer) {
		map.removeLayer(activeCustomLayer);
		activeCustomLayer = null;
	}

	// Construct bounds for Leaflet: [[southWestLat, southWestLng], [northEastLat, northEastLng]]
	let mapBoundsLeaflet = null;
	if (mapItem.mapping && mapItem.mapping.swLon != null && mapItem.mapping.swLat != null && mapItem.mapping.neLon != null && mapItem.mapping.neLat != null) {
		const swLat = parseFloat(mapItem.mapping.swLat);
		const swLon = parseFloat(mapItem.mapping.swLon);
		const neLat = parseFloat(mapItem.mapping.neLat);
		const neLon = parseFloat(mapItem.mapping.neLon);

		if (!isNaN(swLat) && !isNaN(swLon) && !isNaN(neLat) && !isNaN(neLon) &&
			swLon < neLon && swLat < neLat) { // Basic validation
			mapBoundsLeaflet = L.latLngBounds(L.latLng(swLat, swLon), L.latLng(neLat, neLon));
			console.log(`Calculated Leaflet Bounds for fit: ${mapBoundsLeaflet.toBBoxString()}`);
		} else {
			console.warn("Invalid corner coordinates for Leaflet bounds:", mapItem.mapping);
		}
	} else if (mapItem.bounds && Array.isArray(mapItem.bounds) && mapItem.bounds.length === 4) {
		// Fallback to existing bounds property if specific corners are not available
		// MapLibre bounds: [minLng, minLat, maxLng, maxLat] -> [swLon, swLat, neLon, neLat]
		const swLat = parseFloat(mapItem.bounds[1]);
		const swLon = parseFloat(mapItem.bounds[0]);
		const neLat = parseFloat(mapItem.bounds[3]);
		const neLon = parseFloat(mapItem.bounds[2]);
		if (!isNaN(swLat) && !isNaN(swLon) && !isNaN(neLat) && !isNaN(neLon) &&
			swLon < neLon && swLat < neLat) {
			mapBoundsLeaflet = L.latLngBounds(L.latLng(swLat, swLon), L.latLng(neLat, neLon));
			console.log(`Using existing Bounds property for Leaflet fit: ${mapBoundsLeaflet.toBBoxString()}`);
		} else {
				console.warn("Invalid existing bounds array for Leaflet:", mapItem.bounds);
		}
	}
	console.log("tileSourceUrl:", tileSourceUrl);
	activeCustomLayer = L.tileLayer(tileSourceUrl, {
		tileSize: mapItem.tileSize || 256,
		minZoom: mapItem.minZoom || 0,
		maxZoom: mapItem.maxZoom || 22, // Leaflet typically goes up to 18-19 by default for OSM, adjust if needed
		attribution: mapItem.attribution || 'Custom Map', // Add attribution if available
		bounds: mapBoundsLeaflet, // Leaflet can use bounds to restrict tile loading
		opacity: currentMapOpacity // Use currentMapOpacity
	});

	activeCustomLayer.on('tileerror', function(errorEvent) {
		console.error('Tile loading error for custom layer:', errorEvent.tile, errorEvent.error);
		// You could display a user-friendly message here
	});
	
	activeCustomLayer.addTo(map);

	// Fit map to bounds if mapBoundsLeaflet were successfully determined
	if (mapBoundsLeaflet && mapBoundsLeaflet.isValid()) {
		try {
			map.fitBounds(mapBoundsLeaflet, { padding: [20, 20] }); // Leaflet padding format
		} catch (err) {
			console.error("Error calling Leaflet fitBounds:", err, "with bounds:", mapBoundsLeaflet);
		}
	} else {
		console.warn("Map item bounds are invalid or not provided for Leaflet. Skipping fitBounds.", mapItem);
		// Optionally, set a default view if bounds are missing/invalid
		// map.setView([defaultLat, defaultLng], defaultZoom);
	}
	highlightTimelineCircle(String(mapItem.id)); // Ensure mapItem.id is passed as a string
	highlightMapCard(String(mapItem.id)); // Ensure mapItem.id is passed as a string
}

// --- New Timeline Functions ---

function updateZoomIndicator() {
    if (timelineZoomIndicator) {
        timelineZoomIndicator.textContent = `Zoom: ${timelineZoomLevel.toFixed(1)}x (${Math.round(currentDisplayMinYear)} - ${Math.round(currentDisplayMaxYear)})`;
        // Optional: visual cue during zoom action
        timelinePanel.style.borderColor = '#FFD700'; // Gold border during zoom
        setTimeout(() => {
            timelinePanel.style.borderColor = '#999999'; // Revert after a short time
        }, 200);
    }
}

function centerTimelineOnYear(targetYear, mapIdToHighlight) {
    if (!targetYear) { // No target year, nothing to do
        // If not zooming, but a mapId was provided, ensure it's highlighted (e.g. initial load or click when not zoomed)
        if (mapIdToHighlight && timelineZoomLevel <= MIN_TIMELINE_ZOOM) {
             highlightTimelineCircle(mapIdToHighlight);
        }
        return;
    }
    
    if (timelineZoomLevel <= MIN_TIMELINE_ZOOM) {
        // Not zoomed in, but ensure the target map is highlighted if it was clicked
        if (mapIdToHighlight) {
            highlightTimelineCircle(mapIdToHighlight);
        }
        return;
    }

    const oldDisplayMinYear = currentDisplayMinYear;
    const oldDisplayMaxYear = currentDisplayMaxYear;

    const currentVisibleSpan = currentDisplayMaxYear - currentDisplayMinYear;
    if (currentVisibleSpan <= 0 && timelineZoomLevel > MIN_TIMELINE_ZOOM) { // Avoid division by zero or issues if span is invalid
         // If span is invalid while zoomed, try to reset to a small view around targetYear or default zoom
        const totalGlobalYearSpan = maxYearGlobal - minYearGlobal <= 0 ? 1 : maxYearGlobal - minYearGlobal;
        let newVisibleYearSpan = totalGlobalYearSpan / timelineZoomLevel; // Recalculate based on current zoom
        currentDisplayMinYear = targetYear - newVisibleYearSpan / 2;
        currentDisplayMaxYear = targetYear + newVisibleYearSpan / 2;
        // Proceed with clamping and re-rendering
    } else if (currentVisibleSpan <= 0) { // Should not happen if not zoomed
        return;
    }


    let newMin = targetYear - (currentVisibleSpan / 2);
    let newMax = targetYear + (currentVisibleSpan / 2);

    // Clamp to global bounds, preserving the span
    if (newMin < minYearGlobal) {
        newMin = minYearGlobal;
        newMax = minYearGlobal + currentVisibleSpan;
        if (newMax > maxYearGlobal) newMax = maxYearGlobal; 
    } else if (newMax > maxYearGlobal) {
        newMax = maxYearGlobal;
        newMin = maxYearGlobal - currentVisibleSpan;
        if (newMin < minYearGlobal) newMin = minYearGlobal;
    }
    
    currentDisplayMinYear = Math.max(minYearGlobal, newMin);
    currentDisplayMaxYear = Math.min(maxYearGlobal, newMax);

    if (currentDisplayMinYear >= currentDisplayMaxYear && !(minYearGlobal === maxYearGlobal && currentDisplayMinYear === minYearGlobal) ) { 
         currentDisplayMinYear = minYearGlobal;
         currentDisplayMaxYear = maxYearGlobal;
         timelineZoomLevel = MIN_TIMELINE_ZOOM; 
    }

    // Only update and re-render if the display range actually changed
    // or if we are specifically asked to highlight (even if range is same)
    if (currentDisplayMinYear !== oldDisplayMinYear || currentDisplayMaxYear !== oldDisplayMaxYear || mapIdToHighlight) {
        updateZoomIndicator();
        createTimeline(); // This rebuilds the circles
        if (mapIdToHighlight) { 
            highlightTimelineCircle(mapIdToHighlight); // Re-apply highlight AFTER timeline is rebuilt
        }
    }
}

function createTimeline() {
	if (!timelineCirclesContainer || minYearGlobal === Infinity || maxYearGlobal === -Infinity ) {
		console.warn("Timeline cannot be created. Check container, or global min/max years.", minYearGlobal, maxYearGlobal);
		document.getElementById('timeline-panel').style.display = 'none'; 
		return;
	}
	document.getElementById('timeline-panel').style.display = 'flex'; 

    // Update cursor for panning
    if (timelineZoomLevel > MIN_TIMELINE_ZOOM) {
        timelineCirclesContainer.style.cursor = 'grab';
    } else {
        timelineCirclesContainer.style.cursor = 'default';
    }

	timelineCirclesContainer.innerHTML = ''; 
	const timelineWidth = timelineCirclesContainer.offsetWidth;
	
	// Use currentDisplayMinYear and currentDisplayMaxYear for rendering
    const displayYearRange = (currentDisplayMaxYear - currentDisplayMinYear === 0) ? 1 : (currentDisplayMaxYear - currentDisplayMinYear);

	const mapsByYear = {};
	allMapsData.forEach(mapItem => {
		// Only consider maps within the current display range for grouping by year for overlap calculation
        if (mapItem.year && mapItem.year >= currentDisplayMinYear && mapItem.year <= currentDisplayMaxYear) {
			if (!mapsByYear[mapItem.year]) {
				mapsByYear[mapItem.year] = [];
			}
			mapsByYear[mapItem.year].push(mapItem);
		}
	});
	
    const containerHeight = timelineCirclesContainer.offsetHeight; // e.g., 70px
    const baseLineY = containerHeight / 2; // Center line Y position
    const circleEffectiveRadius = 5; // Half of 8px circle + 1px border
    const verticalSlotSize = 12; // Min vertical space per circle (center to center)
    // Max displacement from the center line, leaving space for the circle itself
    const maxDisplacement = baseLineY - circleEffectiveRadius - (verticalSlotSize / 2);


	allMapsData.forEach((mapItem, globalIndex) => {
		if (!mapItem.year || mapItem.year < currentDisplayMinYear || mapItem.year > currentDisplayMaxYear) {
            return; // Don't render circles outside the current zoomed view
        }

		const yearPositionRatio = displayYearRange === 1 && currentDisplayMinYear === mapItem.year ? 0.5 : (mapItem.year - currentDisplayMinYear) / displayYearRange;
		let leftPosition = yearPositionRatio * timelineWidth;
		
        leftPosition = Math.max(circleEffectiveRadius, Math.min(leftPosition, timelineWidth - circleEffectiveRadius));

		const circle = document.createElement('div');
		circle.className = 'timeline-map-circle';
		circle.dataset.mapId = String(mapItem.id); // Ensure mapId is a string for dataset
		circle.style.left = `${leftPosition - circleEffectiveRadius}px`; // Adjust left for circle's own radius

        let yPositionCenter;
        const numInSameYear = mapsByYear[mapItem.year] ? mapsByYear[mapItem.year].length : 0;
        const itemIndexInYear = mapsByYear[mapItem.year] ? mapsByYear[mapItem.year].findIndex(m => m.id === mapItem.id) : 0;

        if (numInSameYear > 1) {
            // Stack items within the same year, try to use available space
            const direction = (itemIndexInYear % 2 === 0) ? -1 : 1; // Alternate above/below
            const level = Math.floor(itemIndexInYear / 2);
            // Calculate offset based on level, ensuring it doesn't exceed maxDisplacement too much
            let offsetAmount = (level + 1) * verticalSlotSize * 0.8;
            offsetAmount = Math.min(offsetAmount, maxDisplacement);
            yPositionCenter = baseLineY + (direction * offsetAmount);
        } else {
            // Single item in its year or for distinct years, spread more widely
            const direction = (globalIndex % 4); // Use 4 slots: directly above, far above, directly below, far below
            let randomFactor = (Math.random() * (verticalSlotSize / 3)) - (verticalSlotSize / 6); // Small jitter
            
            switch(direction) {
                case 0: // Directly above
                    yPositionCenter = baseLineY - (verticalSlotSize * 0.6) + randomFactor;
                    break;
                case 1: // Farther above
                    yPositionCenter = baseLineY - Math.min(verticalSlotSize * 1.5, maxDisplacement * 0.8) + randomFactor;
                    break;
                case 2: // Directly below
                    yPositionCenter = baseLineY + (verticalSlotSize * 0.6) + randomFactor;
                    break;
                case 3: // Farther below
                default:
                    yPositionCenter = baseLineY + Math.min(verticalSlotSize * 1.5, maxDisplacement * 0.8) + randomFactor;
                    break;
            }
        }

        // Clamp yPositionCenter to be within the timelineCirclesContainer bounds
        yPositionCenter = Math.max(circleEffectiveRadius, Math.min(yPositionCenter, containerHeight - circleEffectiveRadius));
        
		circle.style.top = `${yPositionCenter - circleEffectiveRadius}px`; // CSS top is for the top edge of the element


		circle.addEventListener('mouseover', (e) => {
			timelineTooltip.innerHTML = `${mapItem.year || 'N/A'}: ${mapItem.title}`; // Added year to tooltip
			timelineTooltip.style.display = 'block';
            // Position tooltip above the circle
            const rect = e.target.getBoundingClientRect();
            timelineTooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (timelineTooltip.offsetWidth / 2)}px`;
            timelineTooltip.style.bottom = `${window.innerHeight - rect.top - window.scrollY + 5}px`; // 5px above circle
		});
		circle.addEventListener('mousemove', (e) => { // Keep tooltip position updated if mouse moves slightly
            const rect = e.target.getBoundingClientRect();
            timelineTooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (timelineTooltip.offsetWidth / 2)}px`;
            timelineTooltip.style.bottom = `${window.innerHeight - rect.top - window.scrollY + 5}px`;
        });
		circle.addEventListener('mouseout', () => {
			timelineTooltip.style.display = 'none';
		});
		circle.addEventListener('click', () => {
			loadMapOnMainDisplay(mapItem);
			highlightTimelineCircle(String(mapItem.id)); // Ensure mapItem.id is passed as a string
			highlightMapCard(String(mapItem.id)); // Ensure mapItem.id is passed as a string
		});

		timelineCirclesContainer.appendChild(circle);
	});
}

function highlightTimelineCircle(mapId) {
    const mapIdStr = String(mapId); // Ensure comparison is string to string
	document.querySelectorAll('.timeline-map-circle').forEach(c => {
		c.classList.remove('highlighted');
		if (c.dataset.mapId === mapIdStr) {
			c.classList.add('highlighted');
		}
	});
}

function highlightMapCard(mapId) {
    const mapIdStr = String(mapId); // Ensure comparison is string to string
	document.querySelectorAll('.map-card').forEach(card => {
		card.classList.remove('highlighted');
		if (card.dataset.mapId === mapIdStr) {
			card.classList.add('highlighted');
		}
	});
}

// --- End New Timeline Functions ---

// --- Opacity Slider Event Listener ---
if (opacitySlider) {
    opacitySlider.value = currentMapOpacity; // Set initial slider value
    opacitySlider.addEventListener('input', function(event) {
        currentMapOpacity = parseFloat(event.target.value);
        if (activeCustomLayer) {
            activeCustomLayer.setOpacity(currentMapOpacity);
        }
    });
}


// --- Timeline Zoom Event Listener ---
if (timelinePanel) {
    timelinePanel.addEventListener('wheel', function(event) {
        if (event.target.closest('#opacity-slider-container')) return; // Ignore wheel events on opacity slider
        event.preventDefault();

        const timelineRect = timelineCirclesContainer.getBoundingClientRect();
        const mouseXRelative = event.clientX - timelineRect.left;
        const mouseXPercent = Math.max(0, Math.min(1, mouseXRelative / timelineRect.width));

        // Year at the mouse pointer before zoom
        const yearAtMouse = currentDisplayMinYear + mouseXPercent * (currentDisplayMaxYear - currentDisplayMinYear);

        const oldZoomLevel = timelineZoomLevel;

        if (event.deltaY < 0) { // Zooming in
            timelineZoomLevel *= (1 + ZOOM_SENSITIVITY);
        } else { // Zooming out
            timelineZoomLevel /= (1 + ZOOM_SENSITIVITY);
        }
        timelineZoomLevel = Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, timelineZoomLevel));

        if (oldZoomLevel === timelineZoomLevel) return; // No change in zoom level (e.g. at limits)


        const totalGlobalYearSpan = maxYearGlobal - minYearGlobal <= 0 ? 1 : maxYearGlobal - minYearGlobal;
        let newVisibleYearSpan = totalGlobalYearSpan / timelineZoomLevel;
        
        currentDisplayMinYear = yearAtMouse - (mouseXPercent * newVisibleYearSpan);
        currentDisplayMaxYear = yearAtMouse + ((1 - mouseXPercent) * newVisibleYearSpan);

        // Clamp to global bounds and adjust if clamping happens
        if (currentDisplayMinYear < minYearGlobal) {
            currentDisplayMinYear = minYearGlobal;
            currentDisplayMaxYear = minYearGlobal + newVisibleYearSpan; 
        }
        if (currentDisplayMaxYear > maxYearGlobal) {
            currentDisplayMaxYear = maxYearGlobal;
            currentDisplayMinYear = maxYearGlobal - newVisibleYearSpan;
        }
        // After clamping one end, the other might have made the span too small or pushed min > max if newVisibleYearSpan is too large
        if (currentDisplayMinYear < minYearGlobal) currentDisplayMinYear = minYearGlobal; // Re-clamp min
        if (currentDisplayMaxYear > maxYearGlobal) currentDisplayMaxYear = maxYearGlobal; // Re-clamp max
        if (currentDisplayMinYear > currentDisplayMaxYear) { // If span is too large for global bounds
            currentDisplayMinYear = minYearGlobal;
            currentDisplayMaxYear = maxYearGlobal;
        }


        updateZoomIndicator();
        createTimeline(); // This will also update cursor based on new zoom level
    }, { passive: false });

    // --- Timeline Pinch Zoom Event Listeners ---
    timelinePanel.addEventListener('touchstart', function(event) {
        if (event.touches.length === 2) {
            // Ignore pinch if it starts on the opacity slider
            if (event.target.closest('#opacity-slider-container')) return;
            if (isTimelinePanning) return; // Don't start pinch if pan is active
            
            isPinching = true;
            initialPinchDistance = getDistance(event.touches[0], event.touches[1]);
            event.preventDefault(); // Prevent page scroll/zoom
        }
    }, { passive: false });

    timelinePanel.addEventListener('touchmove', function(event) {
        if (!isPinching || event.touches.length !== 2) {
            if (isPinching && event.touches.length < 2) { // Handle case where one finger is lifted during move
                isPinching = false;
                initialPinchDistance = 0;
            }
            return;
        }
        // Ignore pinch if it moves over the opacity slider (though start is already ignored)
        if (event.target.closest('#opacity-slider-container')) return;

        event.preventDefault(); // Prevent page scroll/zoom

        const currentPinchDistance = getDistance(event.touches[0], event.touches[1]);

        if (initialPinchDistance <= 0) { // Safety check
            initialPinchDistance = currentPinchDistance;
            return;
        }

        const zoomFactor = currentPinchDistance / initialPinchDistance;
        const oldTimelineZoomLevel = timelineZoomLevel;
        
        let newProposedZoomLevel = timelineZoomLevel * zoomFactor;
        timelineZoomLevel = Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, newProposedZoomLevel));

        if (timelineZoomLevel === oldTimelineZoomLevel && initialPinchDistance === currentPinchDistance) {
             // No change in zoom or distance, no need to proceed (e.g. at limits and fingers didn't move)
            return;
        }
        if (timelineZoomLevel === oldTimelineZoomLevel && initialPinchDistance !== currentPinchDistance) {
            // Zoom level clamped, but fingers moved. Update initialPinchDistance for next event.
            initialPinchDistance = currentPinchDistance;
            return;
        }


        const timelineRect = timelineCirclesContainer.getBoundingClientRect();
        // Calculate midpoint of the pinch gesture relative to the timeline
        const midpointX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const pinchXRelative = midpointX - timelineRect.left;
        const pinchXPercent = Math.max(0, Math.min(1, pinchXRelative / timelineRect.width));

        // Year at the pinch center before this zoom adjustment
        const yearAtPinchCenter = currentDisplayMinYear + pinchXPercent * (currentDisplayMaxYear - currentDisplayMinYear);

        const totalGlobalYearSpan = maxYearGlobal - minYearGlobal <= 0 ? 1 : maxYearGlobal - minYearGlobal;
        let newVisibleYearSpan = totalGlobalYearSpan / timelineZoomLevel;

        currentDisplayMinYear = yearAtPinchCenter - (pinchXPercent * newVisibleYearSpan);
        currentDisplayMaxYear = yearAtPinchCenter + ((1 - pinchXPercent) * newVisibleYearSpan);

        // Clamp to global bounds
        if (currentDisplayMinYear < minYearGlobal) {
            currentDisplayMinYear = minYearGlobal;
            currentDisplayMaxYear = minYearGlobal + newVisibleYearSpan;
        }
        if (currentDisplayMaxYear > maxYearGlobal) {
            currentDisplayMaxYear = maxYearGlobal;
            currentDisplayMinYear = maxYearGlobal - newVisibleYearSpan;
        }
        // Final re-clamp to ensure min/max are within global and min < max
        if (currentDisplayMinYear < minYearGlobal) currentDisplayMinYear = minYearGlobal;
        if (currentDisplayMaxYear > maxYearGlobal) currentDisplayMaxYear = maxYearGlobal;
        
        if (currentDisplayMinYear >= currentDisplayMaxYear) {
             // This can happen if newVisibleYearSpan is larger than totalGlobalYearSpan after clamping
            currentDisplayMinYear = minYearGlobal;
            currentDisplayMaxYear = maxYearGlobal;
            // If we had to reset to full view due to invalid range, also reset zoom level to minimum
            if (newVisibleYearSpan > totalGlobalYearSpan) {
                 timelineZoomLevel = MIN_TIMELINE_ZOOM;
            }
        }

        updateZoomIndicator();
        createTimeline();

        // Update initialPinchDistance for the next move event to make zoom continuous
        initialPinchDistance = currentPinchDistance;

    }, { passive: false });

    timelinePanel.addEventListener('touchend', function(event) {
        // Reset pinch state if less than 2 fingers are touching
        if (isPinching && event.touches.length < 2) {
            isPinching = false;
            initialPinchDistance = 0;
        }
    });
}

// --- Timeline Panning Event Listeners ---
if (timelineCirclesContainer) { // Attach to the circles container for better UX
    timelineCirclesContainer.addEventListener('mousedown', handlePanStart);
    timelineCirclesContainer.addEventListener('touchstart', handlePanStart, { passive: false });
}

function handlePanStart(event) {
    if (event.type === 'touchstart' && event.touches.length !== 1) {
        // If more than one touch, it might be a pinch, so don't pan.
        // Pinch is handled by timelinePanel's listeners.
        return;
    }
    if (isPinching) return; // Don't start pan if pinch is active

    if (timelineZoomLevel > MIN_TIMELINE_ZOOM) {
        isTimelinePanning = true;
        if (event.type === 'touchstart') {
            panStartX = event.touches[0].clientX;
        } else { // mousedown
            panStartX = event.clientX;
        }
        panStartMinYear = currentDisplayMinYear;
        panStartMaxYear = currentDisplayMaxYear;
        timelineCirclesContainer.style.cursor = 'grabbing';
        // Prevent text selection during pan and default touch actions like scrolling
        event.preventDefault(); 
    }
}

document.addEventListener('mousemove', handlePanMove);
document.addEventListener('touchmove', handlePanMove, { passive: false });

function handlePanMove(event) {
    if (!isTimelinePanning) return;

    let currentX;
    if (event.type === 'touchmove') {
        if (event.touches.length !== 1) {
            // If number of touches changes, stop panning to avoid conflict (e.g. pinch starting)
            isTimelinePanning = false;
            timelineCirclesContainer.style.cursor = timelineZoomLevel > MIN_TIMELINE_ZOOM ? 'grab' : 'default';
            return;
        }
        currentX = event.touches[0].clientX;
        event.preventDefault(); // Prevent scrolling during touch pan
    } else { // mousemove
        currentX = event.clientX;
    }

    const deltaX = currentX - panStartX;
    const timelineWidth = timelineCirclesContainer.offsetWidth;
    // If timelineWidth is 0, avoid division by zero, though this shouldn't happen if visible.
    if (timelineWidth === 0) return; 
    const displayYearSpan = panStartMaxYear - panStartMinYear;
    
    // Calculate how many years the deltaX represents
    const yearDelta = (deltaX / timelineWidth) * displayYearSpan;

    let newMinYear = panStartMinYear - yearDelta;
    let newMaxYear = panStartMaxYear - yearDelta;

    // Clamp to global bounds
    if (newMinYear < minYearGlobal) {
        newMinYear = minYearGlobal;
        newMaxYear = newMinYear + displayYearSpan;
        // Ensure newMaxYear doesn't exceed global max after adjusting newMinYear
        if (newMaxYear > maxYearGlobal) newMaxYear = maxYearGlobal;
    }
    if (newMaxYear > maxYearGlobal) {
        newMaxYear = maxYearGlobal;
        newMinYear = newMaxYear - displayYearSpan;
        // Ensure newMinYear doesn't go below global min
        if (newMinYear < minYearGlobal) newMinYear = minYearGlobal;
    }
    
    // Final check to ensure minYear is still less than maxYear and within global bounds
    // This handles cases where displayYearSpan might be larger than global span after clamping.
    if (newMinYear < minYearGlobal) newMinYear = minYearGlobal;
    if (newMaxYear > maxYearGlobal) newMaxYear = maxYearGlobal;
    if (newMinYear >= newMaxYear && !(minYearGlobal === maxYearGlobal && newMinYear === minYearGlobal)) {
        // If range becomes invalid, try to keep the span but fit it.
        // Or, more simply, if the span is larger than global, reset to global.
        if (displayYearSpan > (maxYearGlobal - minYearGlobal)) {
            newMinYear = minYearGlobal;
            newMaxYear = maxYearGlobal;
        } else {
            // Attempt to correct, but this state should ideally be avoided by prior clamping.
            // For now, if it's still invalid, could reset or log error.
            // Fallback to a safe state if clamping logic is insufficient.
             newMinYear = Math.max(minYearGlobal, Math.min(newMinYear, maxYearGlobal - displayYearSpan));
             newMaxYear = newMinYear + displayYearSpan;
        }
    }


    currentDisplayMinYear = newMinYear;
    currentDisplayMaxYear = newMaxYear;

    updateZoomIndicator();
    createTimeline();
}

document.addEventListener('mouseup', handlePanEnd);
document.addEventListener('touchend', handlePanEnd);
document.addEventListener('touchcancel', handlePanEnd);

function handlePanEnd() {
    if (isTimelinePanning) {
        isTimelinePanning = false;
        if (timelineZoomLevel > MIN_TIMELINE_ZOOM) {
            timelineCirclesContainer.style.cursor = 'grab';
        } else {
            timelineCirclesContainer.style.cursor = 'default';
        }
    }
}

// Optional: If mouse leaves the window while panning (already exists, ensure it uses isTimelinePanning)
document.addEventListener('mouseleave', function() {
    if (isTimelinePanning && event.relatedTarget === null) { // Check if mouse left the window entirely
        isTimelinePanning = false;
         if (timelineZoomLevel > MIN_TIMELINE_ZOOM) {
            timelineCirclesContainer.style.cursor = 'grab';
        } else {
            timelineCirclesContainer.style.cursor = 'default';
        }
    }
});


searchBox.addEventListener('input', (e) => {
	processAndDisplayAllMaps(e.target.value);
});

// Initial load of map data
fetchMapsData();
