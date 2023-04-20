const crypto = require('crypto');
const Quark = require('./quark');
const Atom = require('./atom');

const HashID2NameList = {
	1: 'md4',
	2: 'md4WithRSAEncryption',
	3: 'md5',
	4: 'md5-sha1',
	5: 'md5WithRSAEncryption',
	6: 'mdc2',
	7: 'mdc2WithRSA',
	11: 'sm3',
	12: 'sm3WithRSAEncryption',
	13: 'ssl3-md5',
	14: 'ssl3-sha1',
	15: 'blake2b512',
	16: 'blake2s256',
	17: 'whirlpool',
	21: 'id-rsassa-pkcs1-v1_5-with-sha3-224',
	22: 'id-rsassa-pkcs1-v1_5-with-sha3-256',
	23: 'id-rsassa-pkcs1-v1_5-with-sha3-384',
	24: 'id-rsassa-pkcs1-v1_5-with-sha3-512',
	30: 'ripemd',
	31: 'ripemd160',
	32: 'ripemd160WithRSA',
	33: 'rmd160',
	51: 'sha1',
	52: 'sha1WithRSAEncryption',
	53: 'sha224',
	54: 'sha224WithRSAEncryption',
	55: 'sha256',
	56: 'sha256WithRSAEncryption',
	57: 'sha3-224',
	58: 'sha3-256',
	59: 'sha3-384',
	60: 'sha3-512',
	61: 'sha384',
	62: 'sha384WithRSAEncryption',
	63: 'sha512',
	64: 'sha512-224',
	65: 'sha512-224WithRSAEncryption',
	66: 'sha512-256',
	67: 'sha512-256WithRSAEncryption',
	68: 'sha512WithRSAEncryption',
	69: 'shake128',
	70: 'shake256',
	100: 'RSA-MD4',
	101: 'RSA-MD5',
	102: 'RSA-MDC2',
	103: 'RSA-RIPEMD160',
	104: 'RSA-SHA1',
	105: 'RSA-SHA1-2',
	106: 'RSA-SHA224',
	107: 'RSA-SHA256',
	108: 'RSA-SHA3-224',
	109: 'RSA-SHA3-256',
	110: 'RSA-SHA3-384',
	111: 'RSA-SHA3-512',
	112: 'RSA-SHA384',
	113: 'RSA-SHA512',
	114: 'RSA-SHA512/224',
	115: 'RSA-SHA512/256',
	116: 'RSA-SM3',
	255: "identity"
};
const HashName2IDList = {};
for (let key in HashID2NameList) {
	HashName2IDList[HashID2NameList[key].toLowerCase()] = key * 1;
}
const UnknownHashType = "UnknownHashType";

// 定义 Quark 数据协议的数据结构
const MultiHashQuark = new Quark(11, "multihash", {
	type: "uint|8",
	hash: "bytes"
});

// 定义 Atom 对象协议的操作类
class MultiHash extends Atom('multihash') {
	#string = "";
	constructor (type, hash) {
		super();
		if (String.is(type)) type = HashName2IDList[type.toLowerCase()];
		if (!Number.is(type)) return; // 允许使用Hash表之外的ID，但必须是数字

		if (String.is(hash)) {
			try {
				let buf = Buffer.from(hash, 'base64');
				this.hash = Uint8Array.fromBuffer(buf);
			} catch {
				return
			}
		} else if (hash instanceof Buffer) {
			this.hash = Uint8Array.fromBuffer(hash);
		} else if (hash instanceof Uint8Array) {
			this.hash = hash;
		} else {
			return;
		}
		this.type = type;
		this.#string = this.toData().toBase64();
	}
	get available () {
		return this.#string.length > 0;
	}
	get typeName () {
		return HashID2NameList[this.type] || UnknownHashType;
	}
	toString () {
		return this.#string;
	}
	check (buf) {
		var h = MultiHash.generate(this.type, buf);
		return this.equal(h);
	}
	equal (h) {
		if (!(h instanceof MultiHash)) return false;
		return h.toString() === this.#string;
	}
	static fromString (data) {
		var buf = Buffer.from(data, 'base64');
		var data = Uint8Array.fromBuffer(buf);
		return MultiHash.fromData(data)[0];
	}
	static fromJSON (json) {
		return new MultiHash(json.type, json.hash);
	}
	static generate (type, buf) {
		if (String.is(type)) {
			type = HashName2IDList[type];
		} else if (!Number.is(type)) {
			return null;
		}

		if (isNaN(type)) type = 255;
		var htype = HashID2NameList[type];
		if (!htype) {
			type = 255;
			htype = HashID2NameList[255];
		}
		if (type === 255) {
			return new MultiHash(255, buf);
		} else {
			var hash = crypto.createHash(htype);
			hash.update(buf);
			var result = hash.digest();
			hash = null;
			return new MultiHash(type, result);
		}
	}
	static getTypeName (id) {
		return HashID2NameList[id];
	}
	static getTypeID (name) {
		return HashName2IDList[name];
	}
}
Atom.register('multihash', MultiHash);

_("Quark.MultiHash", MultiHashQuark);
_("Atom.MultiHash", MultiHash);
module.exports = MultiHash;