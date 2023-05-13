require('../core');
const Search = require('../commands/search.js');

(async () => {
	console.log('Google Searching...');
	var result = await Search.execute('', '', {q: 'Nanotechnological Armor'});
	console.log(result);
}) ();