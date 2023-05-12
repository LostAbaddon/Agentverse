require('../core');
const Search = require('../commands/search.js');

(async () => {
	console.log('VVVVVVVVVVVVVVVVVVvv|vvVVVVVVVVVVVVVVVVVV');
	var result = await Search.execute('', '', {q: 'How to use GoogleAPI'});
	console.log(result);
}) ();