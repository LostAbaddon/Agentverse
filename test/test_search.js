require('../core');
const {prepareFolders} = require('../prepare');
const Search = require('../commands/search.js');

(async () => {
	await prepareFolders();
	console.log('Google Searching...');
	var result = await Search.execute('', '', {q: 'Nanotechnological Armor'});
	console.log(result);
}) ();