require('../core');
const Scholar = require('../commands/scholar.js');

(async () => {
	console.log('Google Schoar Searching...');
	var result = await Scholar.execute('', '', {query: 'Nanotechnological Armor'});
	console.log(result.reply);
}) ();