// -------------------------------------------- //
// Googleシートへのアクセス                      //
// -------------------------------------------- //

const sheetNames = ['maps'];
// const spreadsheetId = '1AZgfYRfWLtVXH7rx7BeEPmbmdy7EfnGDbAwi6bMSNsU';
const spreadsheetId = '1K8fg9B0mdXVgwlUJZ2ZMdTs9c1kryqFpE0X0CPeRKfs';
const apiKey = 'AIzaSyAj_tQf-bp0v3j6Pl8S7HQVO5I-D5WI0GQ';
let data = {};

async function fetchData(sheetName) {
	console.log('Fetching data from', sheetName);
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}?key=${apiKey}`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error('Failed to fetch data');
		}
		const data = await response.json();
		// 最初の行を削除
		// data.values.shift();
		return data;
	} catch (error) {
		console.error('Error fetching data:', error);
		return null;
	}
}

// -------------------------------------------- //
// データがすべてのシートから取得されたか確認する関数 //
// -------------------------------------------- //
let allMapsData = [];
async function checkAndInit() {
	const promises = sheetNames.map(sheetName => fetchData(sheetName));
	const results = await Promise.all(promises);

	if (results.every(result => result !== null)) {
		results.forEach((result, index) => {
			data[sheetNames[index]] = result;
		});
		// console.log('Data object:', data);
        allMapsData = data.maps.values;
        console.log('All Maps Data:', allMapsData);

        // Convert allMapsData to array of objects
        const headers = allMapsData[0];
        allMapsData = allMapsData.slice(1).map(row => {
            return row.reduce((obj, value, index) => {
            obj[headers[index]] = value;
            return obj;
            }, {});
        });
        console.log('Processed Maps Data:', allMapsData);

        // only include data where tileDomain is http://tiles.ats.ucla.edu
        // allMapsData = allMapsData.filter(item => item.tileDomain === 'http://tiles.ats.ucla.edu');

		// Wait for both DOM and data to be ready
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', init);
		} else {
			init();
		}
	} else {
		console.log('Failed to fetch data from some or all sheets.');
	}
}

// -------------------------------------------- //
// さあ始めましょう                              //
// -------------------------------------------- //
checkAndInit();