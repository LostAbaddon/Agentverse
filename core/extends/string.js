/**
 * Name:	String Utils
 * Desc:    String 类拓展工具
 * Author:	LostAbaddon
 * Version:	0.0.2
 * Date:	2019.06.05
 */

const KeySet = [];
(() => {
	for (let i = 0; i < 10; i ++) KeySet.push('' + i);
	for (let i = 65; i <= 90; i ++) KeySet.push(String.fromCharCode(i));
	for (let i = 97; i <= 122; i ++) KeySet.push(String.fromCharCode(i));
}) ();
String.random = (len) => {
	var rnd = "";
	for (let i = 0; i < len; i ++) {
		rnd += KeySet[Math.floor(KeySet.length * Math.random())];
	}
	return rnd;
};
String.blank = (len, block = ' ') => {
	var line = '';
	for (let i = 0; i < len; i ++) line += block;
	return line;
};
String.is = (str) => {
	if (str instanceof String) return true;
	if (typeof str === 'string') return true;
	return false;
};
String.prototype.copy = String.prototype.duplicate = function () {
	return String(this).toString();
};
Object.defineProperty(String.prototype, 'copy', { enumerable: false });
Object.defineProperty(String.prototype, 'duplicate', { enumerable: false });

if (global._env === "node") {
	Object.defineProperty(String.prototype, 'byteLength', {
		get () {
			var buf = Buffer.from(this, 'utf8');
			return buf.byteLength;
		},
		enumerable: false,
		configurable: false
	});
}