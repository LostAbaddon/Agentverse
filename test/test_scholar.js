require('../core');
const prepareSystem = require('../prepare');
const Scholar = require('../commands/scholar.js');

(async () => {
	await prepareSystem();
	console.log('Google Schoar Searching...');
	var result = await Scholar.execute('', '', {query: 'Nanotechnological Armor'});
	console.log(result);
}) ();