/**
 * Name:	Array Utils
 * Desc:    Array 类拓展工具
 * Author:	LostAbaddon
 * Version:	0.0.4
 * Date:	2019.06.04
 */

Array.prototype.copy = function () {
	return this.map(ele => ele);
};
Array.prototype.duplicate = function () {
	var copy = this.map(value => {
		if (Object.isBasicType(value)) {
			return value.valueOf();
		} else if (value === null || value === undefined) {
			return value;
		} else if (value instanceof Date) {
			return new Date(value.getTime());
		} else if (typeof value === "object" && !(value instanceof Promise)) {
			return value.duplicate();
		}
	});
	return Object.assign([], this, copy);
};
Array.prototype.randomize = function () {
	var l = this.length;
	var result = Array.random(l);
	var self = this;
	result = result.map(i => self[i]);
	return result;
};
Array.prototype.remove = function (obj) {
	var index = this.indexOf(obj);
	if (index < 0) return this;
	this.splice(index, 1);
	return this;
};
Array.prototype.clear = function (obj) {
	this.splice(0, this.length);
	return this;
};
Array.prototype.translate = function (offset) {
	var c = this.copy();
	if (isNaN(offset)) return c;
	var l = this.length;
	if (offset >= l || offset <= -l) return c;
	if (offset > 0) {
		for (let i = 0, j = offset; i < l - offset; i ++, j ++) {
			c[i] = this[j];
		}
		for (let i = l - offset, j = 0; i < l; i ++, j ++) {
			c[i] = this[j];
		}
	}
	else {
		offset = - offset;
		for (let i = 0, j = offset; i < l - offset; i ++, j ++) {
			c[j] = this[i];
		}
		for (let i = l - offset, j = 0; i < l; i ++, j ++) {
			c[j] = this[i];
		}
	}
	return c;
};
Array.prototype.query = function (fun) {
	var index = -1;
	this.some((d, i) => {
		const has = !!fun(d);
		if (has) index = i;
		return has;
	});
	return index;
};
Array.prototype.pick = function () {
	var l = this.length;
	var result = Math.floor(Math.random() * l);
	return this[result];
};
Array.prototype.equal = function (data) {
	if (!(data instanceof Array)) return false;
	var len = this.byteLength;
	if (len != data.byteLength) return false;
	for (let i = 0; i < len; i ++) {
		if (this[i] !== data[i]) return false;
	}
	return true;
};
Object.defineProperty(Array.prototype, 'first', {
	get () {
		return this[0];
	},
	enumerable: false,
	configurable: false
});
Object.defineProperty(Array.prototype, 'last', {
	get () {
		return this[this.length - 1];
	},
	enumerable: false,
	configurable: false
});
Object.defineProperty(Array.prototype, 'copy', { enumerable: false });
Object.defineProperty(Array.prototype, 'duplicate', { enumerable: false });
Object.defineProperty(Array.prototype, 'remove', { enumerable: false });
Object.defineProperty(Array.prototype, 'clear', { enumerable: false });
Object.defineProperty(Array.prototype, 'randomize', { enumerable: false });
Object.defineProperty(Array.prototype, 'translate', { enumerable: false });
Object.defineProperty(Array.prototype, 'query', { enumerable: false });
Object.defineProperty(Array.prototype, 'pick', { enumerable: false });
Object.defineProperty(Array.prototype, 'equal', { enumerable: false });
Array.is = obj => obj instanceof Array;
Array.generate = (total, generator = i => i) => {
	var result = [];
	if (Function.is(generator)) for (let i = 0; i < total; i ++) result.push(generator(i));
	else for (let i = 0; i < total; i ++) result.push(generator);
	return result;
};
Array.random = (total, generator = i => i) => {
	var origin = [], result = [];
	for (let i = 0; i < total; i ++) origin.push(i);
	for (let i = 0; i < total; i ++) {
		let j = Math.floor(Math.random() * origin.length);
		result.push(generator(origin[j]));
		origin.splice(j, 1);
	}
	return result;
};

Uint8Array.prototype.__proto__.copy = function () {
	return new Uint8Array(this);
};
Uint8Array.prototype.__proto__.duplicate = Uint8Array.prototype.__proto__.copy;
Object.defineProperty(Uint8Array.prototype.__proto__, 'copy', { enumerable: false });
Object.defineProperty(Uint8Array.prototype.__proto__, 'duplicate', { enumerable: false });
if (global._env === "node") {
	Uint8Array.prototype.__proto__.toBuffer = function () {
		var buffer = Buffer.alloc(this.length, this);
		return buffer;
	};
	Uint8Array.prototype.__proto__.toBase64 = function () {
		var buffer = Buffer.alloc(this.length, this);
		return buffer.toString('base64');
	};
	Object.defineProperty(Uint8Array.prototype.__proto__, 'toBuffer', { enumerable: false });
	Object.defineProperty(Uint8Array.prototype.__proto__, 'toBase64', { enumerable: false });

	Uint8Array.fromString = (str, type='utf8') => Uint8Array.fromBuffer(Buffer.from(str, type));
	Uint8Array.fromBase64 = base64 => {
		var buf = Buffer.from(base64, 'base64');
		return Uint8Array.fromBuffer(buf);
	}
	Uint8Array.fromBuffer = buffer => new Uint8Array(buffer);
	Uint16Array.fromBuffer = buffer => new Uint16Array(buffer);
	Uint32Array.fromBuffer = buffer => new Uint32Array(buffer);
	Int8Array.fromBuffer = buffer => new Int8Array(buffer);
	Int16Array.fromBuffer = buffer => new Int16Array(buffer);
	Int32Array.fromBuffer = buffer => new Int32Array(buffer);
	Float32Array.fromBuffer = buffer => new Float32Array(buffer);
	Float64Array.fromBuffer = buffer => new Float64Array(buffer);
	BigInt64Array.fromBuffer = buffer => new BigInt64Array(buffer);
	BigUint64Array.fromBuffer = buffer => new BigUint64Array(buffer);
}

Uint8Array.prototype.sub = function (from, length) {
	if (isNaN(from)) return this.copy();
	if (isNaN(length)) {
		length = from;
		from = 0;
	}
	return new Uint8Array(Buffer.from(this).subarray(from, from + length));
};
Uint8Array.prototype.concat = function (array) {
	if (!(array instanceof Uint8Array)) return this.copy();
	var result = Buffer.concat([this, array]);
	return Buffer.from(result);
};
Uint8Array.prototype.padEnd = function (len, pad = 0) {
	if (len <= this.length) return this.copy();
	if (!Number.is(pad) || pad < 0 || pad > 255) pad = 0;
	var result = new Uint8Array(len);
	for (let i = 0; i < this.length; i ++) result[i] = this[i];
	for (let i = this.length; i < len; i ++) result[i] = pad;
	return result;
};
Uint8Array.prototype.padStart = function (len, pad = 0) {
	if (len <= this.length) return this.copy();
	if (!Number.is(pad) || pad < 0 || pad > 255) pad = 0;
	var result = new Uint8Array(len);
	len = len - this.length;
	for (let i = 0; i < len; i ++) result[i] = pad;
	for (let i = 0; i < this.length; i ++) result[i + len] = this[i];
	return result;
};
Uint8Array.prototype.equal = function (data) {
	if (!(data instanceof Uint8Array)) return false;
	var len = this.byteLength;
	if (len != data.byteLength) return false;
	for (let i = 0; i < len; i ++) {
		if (this[i] !== data[i]) return false;
	}
	return true;
};
Object.defineProperty(Uint8Array.prototype, 'sub', { enumerable: false });
Object.defineProperty(Uint8Array.prototype, 'concat', { enumerable: false });
Object.defineProperty(Uint8Array.prototype, 'padEnd', { enumerable: false });
Object.defineProperty(Uint8Array.prototype, 'padStart', { enumerable: false });
Object.defineProperty(Uint8Array.prototype, 'equal', { enumerable: false });