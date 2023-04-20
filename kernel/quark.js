/**
 * Name:	自动解析工具
 * Desc:    根据文档结构完成文档数据到Uint8Array数组的相互转换，可用于数据传输
 *			Quark模块负责Bytes到JSON的互转
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2019.06.04
 */
require('./error');

const QuarkBlackHole = Errors.Quark;
const DefaultPackerName = "withid";
const DefaultQuarkName = "UnnamedQuark";
const ExtentionMap = {};
const ExtentionList = {};

// 将Uint32转为长度值
const encodeLength = len => {
	len = len || 0;
	return BasicTypes.varuint.pack(len);
};
// 接字段长度解析出来
const decodeLength = data => {
	var [len, left] = BasicTypes.varuint.unpack(data);
	return [len, left];
};
// 获取BigInt的字节长度
const getBigIntLength = big => {
	if (typeof big != 'bigint') {
		return 0;
	}
	var l = big.toString(2).length;
	return Math.ceil(l / 8);
};
// 用来分隔BigInt各部分的常数
const BigIntPartLength = 256n * 256n * 256n * 256n * 256n * 256n * 256n * 256n;

const BasicTypes = {
	"string": {
		pack: (obj, len = 0) => {
			var data = Buffer.from(obj || "", 'utf8');
			var length = data.byteLength;
			var result;
			// 如果是变长字段，则需加上长度前缀
			if (len === 0) {
				let prefix = encodeLength(length);
				let offset = prefix.length;
				len = length + offset;
				result = new Uint8Array(len);
				for (let i = 0; i < offset; i ++) result[i] = prefix[i];
				for (let i = 0; i < length; i ++) {
					result[i + offset] = data[i];
				}
			}
			// 如果长度小于0，则表示一直取值到末尾
			else if (len < 0) {
				result = new Uint8Array(data);
			}
			// 对于固定长度，只保留指定长度
			else {
				result = new Uint8Array(len);
				data.forEach((c, i) => result[i] = c);
			}
			return result;
		},
		unpack: (obj, len = 0) => {
			// 如果是变长，则需根绝写入的长度进行截取
			if (len === 0) {
				[len, obj] = decodeLength(obj);
			} else if (len < 0) { // 一直到字段结尾的变量
				len = obj.byteLength;
			}
			var length = obj.byteLength;
			if (len > length) {
				return ["", obj, false];
			}
			var data = new Uint8Array(len);
			for (let i = 0; i < len; i ++) data[i] = obj[i];
			var left = new Uint8Array(length - len);
			for (let i = len; i < length; i ++) left[i - len] = obj[i];
			// 截取尾部可能存在的多余的0
			length = len;
			for (let i = len - 1; i >= 0; i --) {
				if (data[i] === 0) length = i;
				else break
			}
			var obj = new Uint8Array(length);
			for (let i = 0; i < length; i ++) {
				obj[i] = data[i];
			}
			data = obj.toBuffer().toString('utf8');
			return [data, left, true];
		}
	},
	"bool": {
		pack: obj => {
			result = new Uint8Array(1);
			if (!!obj) {
				result[0] = 1;
			} else {
				result[0] = 0;
			}
			return result;
		},
		unpack: obj => {
			var len = obj.byteLength;
			if (len === 0) return [false, obj, false];
			var result = false;
			if (obj[0] > 0) result = true;
			len --;
			var left = new Uint8Array(len);
			for (let i = 0; i < len; i ++) {
				left[i] = obj[i + 1];
			}
			return [result, left, true];
		}
	},
	"int8": {
		pack: obj => {
			obj = obj || 0;
			var result = new Uint8Array(1);
			var view = new DataView(result.buffer);
			view.setInt8(0, obj);
			view = null;
			return result;
		},
		unpack: obj => {
			var len = obj.byteLength;
			if (len < 1) return [0, obj, false];
			var data = new Uint8Array(1);
			data[0] = obj[0];
			len --;
			var left = new Uint8Array(len);
			for (let i = 0; i < len; i ++) {
				left[i] = obj[i + 1];
			}
			var view = new DataView(data.buffer);
			var result = view.getInt8();
			view = null;
			return [result, left, true];
		}
	},
	"int16": {
		pack: obj => {
			obj = obj || 0;
			var result = new Uint8Array(2);
			var view = new DataView(result.buffer);
			view.setInt16(0, obj);
			view = null;
			return result;
		},
		unpack: obj => {
			var len = obj.byteLength;
			if (len < 2) return [0, obj, false];
			var data = new Uint8Array(2);
			data[0] = obj[0];
			data[1] = obj[1];
			len -= 2;
			var left = new Uint8Array(len);
			for (let i = 0; i < len; i ++) {
				left[i] = obj[i + 2];
			}
			var view = new DataView(data.buffer);
			var result = view.getInt16();
			view = null;
			return [result, left, true];
		}
	},
	"int32": {
		pack: obj => {
			obj = obj || 0;
			var result = new Uint8Array(4);
			var view = new DataView(result.buffer);
			view.setInt32(0, obj);
			view = null;
			return result;
		},
		unpack: obj => {
			var len = obj.byteLength;
			if (len < 4) return [0, obj, false];
			var data = new Uint8Array(4);
			data[0] = obj[0];
			data[1] = obj[1];
			data[2] = obj[2];
			data[3] = obj[3];
			len -= 4;
			var left = new Uint8Array(len);
			for (let i = 0; i < len; i ++) {
				left[i] = obj[i + 4];
			}
			var view = new DataView(data.buffer);
			var result = view.getInt32();
			view = null;
			return [result, left, true];
		}
	},
	"int64": {
		pack: obj => {
			if (Number.is(obj)) obj = BigInt(obj);
			// BigInt被解析为变长，因为BigInt的长度是不固定的
			var neg = false;
			if (obj < 0n) {
				obj *= -1n;
				neg = true;
			}
			var len = getBigIntLength(obj);
			if (len === 0) return new Uint8Array();
			var parts = Math.ceil(len / 8);
			var prefix = encodeLength(parts * 8);
			var offset = prefix.byteLength;
			var result = new Uint8Array(parts * 8 + offset);
			// 写入字段你长度
			for (let i = 0; i < offset; i ++) result[i] = prefix[0];
			// 首位记录符号，后面以BigUint64的格式写入
			for (let i = 0; i < parts - 1; i ++) {
				let p = new Uint8Array(8);
				let v = new DataView(p.buffer);
				v.setBigUint64(0, obj);
				let q = v.getBigUint64();
				k = (parts - 1 - i) * 8;
				for (let j = 0; j < 8; j ++) {
					result[k + j + offset] = p[j];
				}
				obj -= q;
				let ori = obj;
				obj /= BigIntPartLength;
				v = null;
			}
			// 写入首位，保留正负号
			var p = new Uint8Array(8);
			var v = new DataView(p.buffer);
			if (neg) obj *= -1n;
			v.setBigInt64(0, obj);
			for (let j = 0; j < 8; j ++) {
				result[j + offset] = p[j];
			}
			return result;
		},
		unpack: obj => {
			// 如果是变长，则需根绝写入的长度进行截取
			var len;
			[len, obj] = decodeLength(obj);
			var length = obj.byteLength;
			if (len > length) return [0n, obj, false];
			if (len === 0) return [0n, obj, true];
			var parts = len / 8;
			var neg = false;
			if (obj[0] >= 128) neg = true;
			// 读取头部数据
			var v = new DataView(obj.buffer);
			var result = v.getBigInt64();
			if (neg) result *= -1n;
			length -= 8;
			var left = new Uint8Array(length);
			for (let i = 0; i < length; i ++) {
				left[i] = obj[i + 8];
			}
			obj = left;
			parts --;
			for (let i = 0; i < parts; i ++) {
				result *= BigIntPartLength;
				v = new DataView(obj.buffer);
				let q = v.getBigUint64();
				result += q;
				length -= 8;
				left = new Uint8Array(length);
				for (let i = 0; i < length; i ++) {
					left[i] = obj[i + 8];
				}
				obj = left;
			}
			if (neg) {
				result *= -1n;
			}
			return [result, left, true];
		}
	},
	"uint8": {
		pack: obj => {
			obj = obj || 0;
			var result = new Uint8Array(1);
			var view = new DataView(result.buffer);
			view.setUint8(0, obj);
			view = null;
			return result;
		},
		unpack: obj => {
			var len = obj.byteLength;
			if (len < 1) return [0, obj, false];
			var data = new Uint8Array(1);
			data[0] = obj[0];
			len --;
			var left = new Uint8Array(len);
			for (let i = 0; i < len; i ++) {
				left[i] = obj[i + 1];
			}
			var view = new DataView(data.buffer);
			var result = view.getUint8();
			view = null;
			return [result, left, true];
		}
	},
	"uint16": {
		pack: obj => {
			obj = obj || 0;
			var result = new Uint8Array(2);
			var view = new DataView(result.buffer);
			view.setUint16(0, obj);
			view = null;
			return result;
		},
		unpack: obj => {
			var len = obj.byteLength;
			if (len < 2) return [0, obj, false];
			var data = new Uint8Array(2);
			data[0] = obj[0];
			data[1] = obj[1];
			len -= 2;
			var left = new Uint8Array(len);
			for (let i = 0; i < len; i ++) {
				left[i] = obj[i + 2];
			}
			var view = new DataView(data.buffer);
			var result = view.getUint16();
			view = null;
			return [result, left, true];
		}
	},
	"uint32": {
		pack: obj => {
			obj = obj || 0;
			var result = new Uint8Array(4);
			var view = new DataView(result.buffer);
			view.setUint32(0, obj);
			view = null;
			return result;
		},
		unpack: obj => {
			var len = obj.byteLength;
			if (len < 4) return [0, obj, false];
			var data = new Uint8Array(4);
			data[0] = obj[0];
			data[1] = obj[1];
			data[2] = obj[2];
			data[3] = obj[3];
			len -= 4;
			var left = new Uint8Array(len);
			for (let i = 0; i < len; i ++) {
				left[i] = obj[i + 4];
			}
			var view = new DataView(data.buffer);
			var result = view.getUint32();
			view = null;
			return [result, left, true];
		}
	},
	"uint64": {
		pack: obj => {
			if (Number.is(obj)) obj = BigInt(obj);
			if (obj < 0n) obj = 0n;
			// BigInt被解析为变长，因为BigInt的长度是不固定的
			var len = getBigIntLength(obj);
			if (len === 0) return new Uint8Array();
			var neg = false;
			var parts = Math.ceil(len / 8);
			var prefix = encodeLength(parts * 8);
			var offset = prefix.length;
			var result = new Uint8Array(parts * 8 + offset);
			// 写入字段你长度
			for (let i = 0; i < offset; i ++) result[i] = prefix[i];
			// 首位记录符号，后面以BigUint64的格式写入
			for (let i = 0; i < parts; i ++) {
				let p = new Uint8Array(8);
				let v = new DataView(p.buffer);
				v.setBigUint64(0, obj);
				let q = v.getBigUint64();
				k = (parts - 1 - i) * 8;
				for (let j = 0; j < 8; j ++) {
					result[k + j + offset] = p[j];
				}
				obj -= q;
				let ori = obj;
				obj /= BigIntPartLength;
				v = null;
			}
			return result;
		},
		unpack: obj => {
			// 如果是变长，则需根绝写入的长度进行截取
			var len;
			[len, obj] = decodeLength(obj);
			var length = obj.byteLength;
			if (len > length) return [0n, obj, false];
			var parts = len / 8;
			var result = 0n;
			for (let i = 0; i < parts; i ++) {
				result *= BigIntPartLength;
				let v = new DataView(obj.buffer);
				let q = v.getBigUint64();
				result += q;
				length -= 8;
				let left = new Uint8Array(length);
				for (let i = 0; i < length; i ++) {
					left[i] = obj[i + 8];
				}
				v = null
				obj = left;
			}
			return [result, obj, true];
		}
	},
	"float32": {
		pack: obj => {
			obj = obj || 0;
			var result = new Uint8Array(4);
			var view = new DataView(result.buffer);
			view.setFloat32(0, obj);
			view = null;
			return result;
		},
		unpack: obj => {
			var len = obj.byteLength;
			if (len < 4) return [0, obj, false];
			var data = new Uint8Array(4);
			data[0] = obj[0];
			data[1] = obj[1];
			data[2] = obj[2];
			data[3] = obj[3];
			len -= 4;
			var left = new Uint8Array(len);
			for (let i = 0; i < len; i ++) {
				left[i] = obj[i + 4];
			}
			var view = new DataView(data.buffer);
			var result = view.getFloat32();
			view = null;
			return [result, left, true];
		}
	},
	"float64": {
		pack: obj => {
			obj = obj || 0;
			var result = new Uint8Array(8);
			var view = new DataView(result.buffer);
			view.setFloat64(0, obj);
			view = null;
			return result;
		},
		unpack: obj => {
			var len = obj.byteLength;
			if (len < 8) return [0, obj, false];
			var data = new Uint8Array(8);
			data[0] = obj[0];
			data[1] = obj[1];
			data[2] = obj[2];
			data[3] = obj[3];
			data[4] = obj[4];
			data[5] = obj[5];
			data[6] = obj[6];
			data[7] = obj[7];
			len -= 8;
			var left = new Uint8Array(len);
			for (let i = 0; i < len; i ++) {
				left[i] = obj[i + 8];
			}
			var view = new DataView(data.buffer);
			var result = view.getFloat64();
			view = null;
			return [result, left, true];
		}
	},
	"bytes": {
		pack: (obj, len = 0) => {
			if (!obj) return new Uint8Array();
			var result;
			if (len === 0) {
				length = obj.byteLength;
				let prefix = encodeLength(length);
				let offset = prefix.byteLength;
				len = length + offset;
				result = new Uint8Array(len);
				for (let i = 0; i < offset; i ++) result[i] = prefix[i];
				for (let i = 0; i < length; i ++) {
					result[i + offset] = obj[i];
				}
			} else if (len < 0) {
				result = new Uint8Array(obj);
			} else {
				result = new Uint8Array(len);
				for (let i = 0; i < len; i ++) {
					result[i] = obj[i];
				}
			}
			return result;
		},
		unpack: (obj, len = 0) => {
			// 如果是变长，则需根绝写入的长度进行截取
			if (len === 0) {
				[len, obj] = decodeLength(obj);
			} else if (len < 0) {
				len = obj.byteLength;
			}
			var length = obj.byteLength;
			if (len > length) {
				return [new Uint8Array(), obj, false];
			}
			var data = new Uint8Array(len);
			for (let i = 0; i < len; i ++) data[i] = obj[i];
			var left = new Uint8Array(length - len);
			for (let i = len; i < length; i ++) left[i - len] = obj[i];
			return [data, left, true];
		}
	},
	"varuint": {
		pack: (num) => {
			var result = [];
			var l = Math.ceil(Math.log2(num)), c = l <= 0 ? 1 : Math.ceil(l / 7);
			for (let i = 0; i < c; i ++) {
				let j = num & 0x7f;
				if (i > 0) j += 0x80;
				result.unshift(j);
				if (num > 2147483647) num = Math.floor(num / 128);
				else num >>= 7;
			}
			return new Uint8Array(result);
		},
		unpack: (data) => {
			var result = [];
			var cont = true;
			var index = 0;
			while (cont) {
				let d = data[index];
				if (d === undefined) {
					break;
				}
				result.push(d & 0x7f);
				index ++;
				if (d < 0x80) {
					cont = false;
				}
			}
			var left = data.sub(index, data.byteLength - index);
			var num = 0;
			result.forEach(i => {
				num *= 0x80;
				num += i;
			});
			return [num, left, true];
		}
	},
	"varint": {
		pack: (num) => {
			var result = [];
			var neg = (num < 0);
			if (neg) num *= -1;
			var l = Math.ceil(Math.log2(num)) + 1, c = Math.ceil(l / 7);
			for (let i = 0; i < c; i ++) {
				let j = num & 0x7f;
				if (i > 0) j += 0x80;
				result.unshift(j);
				if (num > 2147483647) num = Math.floor(num / 128);
				else num >>= 7;
			}
			if (neg) result[0] = result[0] | 0x40;
			var bytes = new Uint8Array(result)
			return bytes;
		},
		unpack: (data) => {
			data = data.copy();
			var neg = data[0] >= 0xc0;
			if (neg) data[0] = data[0] - 0x40;
			var result = [];
			var cont = true;
			var index = 0;
			while (cont) {
				let d = data[index];
				result.push(d & 0x7f);
				index ++;
				if (d < 0x80) {
					cont = false;
				}
			}
			var left = data.sub(index, data.byteLength - index);
			var num = 0;
			result.forEach(i => {
				num *= 0x80;
				num += i;
			});
			if (neg) num *= -1;
			return [num, left, true];
		}
	},
};
const DefaultPacker = {
	pack: (obj, id) => {
		if (obj === undefined || obj === null) {
			return new Uint8Array([0]);
		}
		if (isNaN(id) || id === 0) id = obj.packerID;
		if (!id) return new Uint8Array();
		var packer = ExtentionList[id];
		if (!packer) return new Uint8Array();
		return packer.pack(obj, true);
	},
	unpack: (data, id) => {
		var d;
		if (isNaN(id) || id === 0) {
			let left, ok;
			[id, left, ok] = BasicTypes.varuint.unpack(data);
			if (!ok) {
				throw new QuarkBlackHole.ParseElementError(
					("键名：packerID").padEnd(16) +
					("类型：varuint").padEnd(16) +
					"指定长度：0"
				);
				return [null, data, false];
			}
			if (id === 0) {
				return [null, left, true]
			}
			d = left;
		} else {
			d = data;
		}
		var packer = ExtentionList[id];
		if (!packer) return [null, data, false];
		var result, left;
		try {
			[result, left] = packer.unpack(d, false);
		} catch (err) {
			throw err;
			return [null, data, false];
		}
		result.packerID = id;
		return [result, left, true];
	}
};

class Lepton {
	constructor (name, type, length, group) {
		this.name = name;
		this.type = type;
		this.isBasic = !!BasicTypes[type];
		this.length = length;
		this.isGroup = group >= 0;
		this.group = group || 0;
	}
}
class Quark {
	constructor (id, name, structure) {
		if (String.is(id)) {
			structure = name;
			name = id;
			id = -1;
		} else if (!Number.is(id)) {
			structure = id;
			name = DefaultQuarkName;
			id = -1;
		}
		this.id = id * 1 || 0;
		if (this.id > 0 && !!ExtentionList[this.id]) {
			throw new QuarkBlackHole.ConflictPackerError("相同ID的打包器：" + this.id);
			return;
		}
		this.name = name || "";
		if (this.name === DefaultPackerName) {
			throw new QuarkBlackHole.DefaultPackerNameError();
			return;
		} else if (!!ExtentionMap[this.name]) {
			throw new QuarkBlackHole.ConflictPackerError("相同名称的打包器：" + this.name);
			return;
		}
		this.structure = [];
		for (let name in structure) {
			let type = structure[name];
			let groupInfo = type.match(/\[(.*)\](\d+)?/);
			if (!!groupInfo) {
				type = groupInfo[1];
				groupInfo = groupInfo[2] * 1 || 0;
			} else {
				groupInfo = -1;
			}
			type = type.split("|");
			let length = type[1] * 1 || 0;
			type = type[0];
			if (["int", "uint"].indexOf(type) >= 0 && [8, 16, 32, 64].indexOf(length) >= 0) {
				type = type + length;
			} else if (type === "float" && [32, 64].indexOf(length) >= 0) {
				type = type + length;
			}
			this.structure.push(new Lepton(name, type, length, groupInfo))
		}

		if (this.id > 0) {
			ExtentionList[this.id] = this;
		}
		ExtentionMap[this.name] = this;
	}
	pack (target, withPrefix = true) {
		var result = [], total = 0;
		if (withPrefix) {
			let data = BasicTypes.varuint.pack(this.id);
			result.push(data);
			total = data.byteLength;
		}
		this.structure.forEach(st => {
			var packer;
			if (st.isBasic) {
				packer = BasicTypes[st.type];
			} else {
				packer = ExtentionMap[st.type];
			}
			if (!packer && st.type !== DefaultPackerName) {
				throw new QuarkBlackHole.PackerNotFoundError();
				return;
			}
			if (st.type === DefaultPackerName) {
				packer = DefaultPacker.pack;
			} else if (st.isBasic) {
				packer = packer.pack;
			} else {
				let util = packer;
				packer = function (obj) {
					if (!obj) {
						return new Uint8Array(1);
					}
					var data;
					try {
						data = util.pack(obj, false);
					} catch (err) {
						throw err;
						return new Uint8Array(1);
					}
					return data;
				};
			}
			if (!packer) {
				throw new QuarkBlackHole.PackerNotFoundError();
				return;
			}
			if (st.isGroup) { // 如果是数组
				if (st.group > 0) { // 如果是固定长度的数组
					let list = target[st.name] || [];
					for (let i = 0; i < st.group; i ++) {
						let data = packer(list[i], st.length);
						result.push(data);
						total += data.byteLength;
					}
				} else {
					let list = target[st.name] || [];
					let data = encodeLength(list.length);
					result.push(data);
					total += data.byteLength;
					for (let i = 0; i < list.length; i ++) {
						let data = packer(list[i], st.length);
						result.push(data);
						total += data.byteLength;
					}
				}
			} else { // 如果不是数组，则直接写入结果
				let data = packer(target[st.name], st.length);
				result.push(data);
				total += data.byteLength;
			}
		});
		var bytes = new Uint8Array(total), offset = 0;
		result.forEach(data => {
			data.forEach((b, i) => {
				bytes[offset + i] = b;
			});
			offset += data.byteLength;
		});
		return bytes;
	}
	unpack (data, hasPrefix = true) {
		var result = {};
		if (hasPrefix) {
			let [id, left, ok] = BasicTypes.varuint.unpack(data);
			if (!ok) {
				throw new QuarkBlackHole.ParseElementError(
					("键名：prefix").padEnd(16) +
					("类型：int32").padEnd(16) +
					"指定长度：32"
				);
				return [null, data];
			}
			data = left;
		}
		this.structure.forEach(st => {
			var unpacker;
			if (st.isBasic) {
				unpacker = BasicTypes[st.type];
			} else {
				unpacker = ExtentionMap[st.type];
			}
			if (!unpacker && st.type !== DefaultPackerName) {
				throw new QuarkBlackHole.PackerNotFoundError();
				return;
			}
			if (st.type === DefaultPackerName) {
				unpacker = DefaultPacker.unpack;
			} else if (st.isBasic) {
				unpacker = unpacker.unpack;
			} else {
				let util = unpacker;
				unpacker = function (data) {
					if (data[0] === 0) {
						data = data.sub(1, data.byteLength - 1);
						return [null, data , true];
					}
					var obj, left, origin = data.copy();
					try {
						[obj, left] = util.unpack(data, false);
					} catch (err) {
						return [null, origin, true];
					}
					return [obj, left, true];
				}
			}
			if (!unpacker) {
				throw new QuarkBlackHole.PackerNotFoundError();
				return;
			}
			var value, ok;
			if (st.isGroup) {
				value = [];
				let temp;
				if (st.group > 0) {
					for (let i = 0; i < st.group; i ++) {
						[temp, data, ok] = unpacker(data, st.length);
						if (!ok) {
							throw new QuarkBlackHole.ParseFixLengthArrayError(
								("数组键名：" + st.name).padEnd(16) +
								("数组类型：" + st.type).padEnd(16) +
								("元素指定长度：" + st.length).padEnd(16) +
								"数组指定长度：" + st.group
							);
							return;
						}
						value.push(temp);
					}
				} else {
					let len;
					[len, data] = decodeLength(data);
					for (let i = 0; i < len; i ++) {
						[temp, data, ok] = unpacker(data, st.length);
						if (!ok) {
							throw new QuarkBlackHole.ParseVarLengthArrayError(
								("数组键名：" + st.name).padEnd(16) +
								("数组类型：" + st.type).padEnd(16) +
								("元素指定长度：" + st.length).padEnd(16) +
								"数组指定长度：" + st.group
							);
							return;
						}
						value.push(temp);
					}
				}
			} else {
				[value, data, ok] = unpacker(data, st.length);
				if (!ok) {
					throw new QuarkBlackHole.ParseElementError(
						("键名：" + st.name).padEnd(16) +
						("类型：" + st.type).padEnd(16) +
						"指定长度：" + st.length
					);
					return;
				}
			}
			result[st.name] = value;
		});
		return [result, data];
	}
	static getStructure (obj) {
		var structure = {};
		for (let key in obj) {
			let value = obj[key];
			if (String.is(value)) {
				structure[key] = "string";
			} else if (Number.is(value)) {
				if (Math.floor(value) === value) {
					structure[key] = "int|32";
				} else {
					structure[key] = "float|64";
				}
			} else if (BigInt.is(value)) {
				structure[key] = "int|64";
			} else if (Boolean.is(value)) {
				structure[key] = "bool";
			} else if (value instanceof Uint8Array) {
				structure[key] = "bytes";
			} else if (value instanceof Array) {
				let ele = value[0];
				if (String.is(ele)) {
					structure[key] = "[string]";
				} else if (Number.is(ele)) {
					if (Math.floor(ele) === ele) {
						structure[key] = "[int|32]";
					} else {
						structure[key] = "[float|64]";
					}
				} else if (BigInt.is(ele)) {
					structure[key] = "[int|64]";
				} else if (Boolean.is(ele)) {
					structure[key] = "[bool]";
				} else if (ele instanceof Uint8Array) {
					structure[key] = "[bytes]";
				}
			}
		}
		return structure;
	}
	static autoPack (data) {
		return DefaultPacker.pack(data);
	}
	static autoUnpack (data) {
		return DefaultPacker.unpack(data);
	}
	static packBasicType (data, type, len = 0) {
		var packer = BasicTypes[type];
		if (!packer) return new Uint8Array(0);
		return packer.pack(data, len);
	}
	static unpackBasicType (data, type, len = 0) {
		var unpacker = BasicTypes[type];
		if (!unpacker) return null;
		return unpacker.unpack(data, len);
	}
	static getPacker (name) {
		return ExtentionMap[name];
	}
	static getPackerByID (id) {
		return ExtentionList[id];
	}
}

_("Quark", Quark);
module.exports = Quark