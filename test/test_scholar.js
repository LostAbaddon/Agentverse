require('../core');
const {prepareFolders} = require('../prepare');
const Scholar = require('../commands/scholar.js');

(async () => {
	await prepareFolders();
	console.log('Google Schoar Searching...');
	var result = await Scholar.execute('', '', {query: 'Nanotechnological Armor'});
	console.log(result);
}) ();