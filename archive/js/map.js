

$('#mapBody').css('visibility','visible');


// var map = L.map('map').setView([52.5070525, 13.378478999999999], 13);
var map = L.map('map').setView([35.48472475948621, 139.63230124809792], 13);
var sat = L.tileLayer('http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
	attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
}).addTo(map);

hyperMap = L.tileLayer('https://tiles.ats.ucla.edu/tiles/Tokyo_1945_1/{z}/{x}/{y}.png', {
	zIndex: 9999
}).addTo(map);
