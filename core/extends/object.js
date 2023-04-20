/**
 * Name:	Object Utils
 * Desc:    Object 类拓展工具
 * Author:	LostAbaddon
 * Version:	0.0.2
 * Date:	2019.06.04
 */

Boolean.is = obj => {
	if (typeof obj === "boolean") return true;
	if (obj instanceof Boolean) return true;
	return false;
};
BigInt.is = obj => {
	if (typeof obj === "bigint") return true;
	if (obj instanceof BigInt) return true;
	return false;
};
Number.is = obj => {
	if (typeof obj === "number") return true;
	if (obj instanceof Number) return true;
	return false;
};
Object.isBasicType = obj => {
	if (String.is(obj)) return true;
	if (Boolean.is(obj)) return true;
	if (BigInt.is(obj)) return true;
	if (Number.is(obj)) return true;
	if (Symbol.is(obj)) return true;
	return false;
};

const clearCopy = (obj, ext=false, forbids=['_'], used) => {
	if (!used) used = new Set();

	if (obj === undefined) return;
	if (obj === null) {
		if (ext) return null;
		return;
	}
	if (BigInt.is(obj)) {
		if (!ext) return;
		return obj * 1n;
	}
	if (Boolean.is(obj)) {
		if (obj instanceof Boolean) return obj.valueOf();
		return obj;
	}
	if (Number.is(obj)) {
		let copy = obj + 0;
		if (isNaN(copy)) {
			if (ext) return NaN;
			return;
		}
		return copy;
	}
	if (String.is(obj)) {
		if (obj instanceof String) return obj.valueOf();
		return obj;
	}
	if (obj instanceof Date) {
		if (ext) return obj.toString();
		return null;
	}

	if (Symbol.is(obj)) return;
	if (Function.is(obj)) return;

	if (used.has(obj)) return;
	used.add(obj);

	if (Array.is(obj)) {
		return obj.map(o => clearCopy(o, ext, used)).filter(v => v !== undefined);
	}

	var copy = {};
	var needCheck = !!forbids && !!forbids.some;
	for (let key in obj) {
		if (needCheck && forbids.some(prefix => key.indexOf(prefix) === 0)) continue;
		let c;
		try {
			c = obj[key];
			if (!ext && typeof c === undefined) continue;
		}
		catch {
			continue;
		}
		c = clearCopy(c, ext, forbids, new Set(used));
		if (c === undefined) continue;
		copy[key] = c;
	}
	return copy;
};
Object.prototype.copy = function () {
	return Object.assign({}, this);
};
Object.prototype.duplicate = function () {
	var copy = {};
	for (let key in this) {
		let value = this[key];
		if (Object.isBasicType(value)) {
			copy[key] = value.valueOf();
		} else if (value === null || value === undefined) {
			copy[key] = value;
		} else if (value instanceof Date) {
			copy[key] = new Date(value.getTime());
		} else if (typeof value === "object" && !(value instanceof Promise)) {
			copy[key] = value.duplicate();
		}
	}
	return Object.assign({}, this, copy);
};
Object.prototype.extent = function (...targets) {
	var copy = Object.assign({}, this);
	targets.reverse();
	Object.assign(this, ...targets, copy);
};
Object.prototype.clearCopy = function (ext=false, forbids) {
	return clearCopy(this, ext, forbids);
};
Object.defineProperty(Object.prototype, 'copy', { enumerable: false });
Object.defineProperty(Object.prototype, 'duplicate', { enumerable: false });
Object.defineProperty(Object.prototype, 'extent', { enumerable: false });
Object.defineProperty(Object.prototype, 'clearCopy', { enumerable: false });

Number.prototype.duplicate = function () {
	return this * 1;
};
Object.defineProperty(Number.prototype, 'duplicate', { enumerable: false });
BigInt.prototype.duplicate = function () {
	return this * 1n;
};
Object.defineProperty(BigInt.prototype, 'duplicate', { enumerable: false });
Boolean.prototype.duplicate = function () {
	if (this === false || this.valueOf() === false) return false;
	return true;
};
Object.defineProperty(Boolean.prototype, 'duplicate', { enumerable: false });