require('../core');
const prepareSystem = require('../prepare');
const Search = require('../commands/search.js');

(async () => {
	await prepareSystem();
	console.log('Google Searching...');
	var result = await Search.execute('', '', {q: 'Nanotechnological Armor'});
	console.log(result);
}) ();