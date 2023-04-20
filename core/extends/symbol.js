/**
 * Name:	Symbol Utils
 * Desc:    Symbol 类拓展工具
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.11.09
 */

Symbol.set = Symbol.setSymbols = function (host, symbols) {
	if (String.is(host)) {
		symbols = [].map.call(arguments, i => i);
		host = null;
	}
	else if (Array.is(host) && !symbols) {
		symbols = host;
		host = null;
	}
	host = host || {};
	var symb2name = {};
	var str2name = {};
	symbols.forEach(symbol => {
		symbol = symbol.split('|');
		if (symbol.length === 0) return;
		if (symbol.length < 2) symbol[1] = symbol[0];
		var name = symbol[1];
		symbol = symbol[0];
		var sym = Symbol(symbol);
		symb2name[sym] = name;
		str2name[symbol] = name;
		Object.defineProperty(host, symbol, {
			value: sym,
			configurable: false,
			enumerable: true
		});
	});
	host.toString = symbol => symb2name[symbol] || str2name[symbol] || 'No Such Symbol';
	Object.defineProperty(host, 'toString', { enumerable: false });
	return host;
};
Symbol.is = symbol => (Symbol.__proto__ === Symbol.prototype) || (typeof symbol === 'symbol');