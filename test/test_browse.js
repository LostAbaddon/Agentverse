require('../core');
const prepareSystem = require('../prepare');
const Browse = require('../commands/browse.js');

(async () => {
	await prepareSystem();
	console.log('Browsing web page...');
	var result = await Browse.execute('', '', {url: 'https://www.jianshu.com/p/d633bb9bd463'});
	// var result = await Browse.execute('', '', {url: 'https://www.zhihu.com/question/359948448/answer/1014333716'});
	// var result = await Browse.execute('', '', {url: 'https://zhuanlan.zhihu.com/p/463715925'});
	// var result = await Browse.execute('', '', {url: 'https://www.zhihu.com/collection/190519403'});
	console.log(result);
}) ();