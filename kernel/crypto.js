const crypto = require('crypto');

const PubKeyStart = "-----BEGIN PUBLIC KEY-----";
const PubKeyEnd = "-----END PUBLIC KEY-----";
const PrvKeyStart = "-----BEGIN PRIVATE KEY-----";
const PrvKeyEnd = "-----END PRIVATE KEY-----";
const ExportConfig = { type: 'pkcs1', format: 'pem' };
const CryptoID2NameList = {
	1: 'Oakley-EC2N-3',
	2: 'Oakley-EC2N-4',
	3: 'SM2',
	10: 'brainpoolP160r1',
	11: 'brainpoolP160t1',
	12: 'brainpoolP192r1',
	13: 'brainpoolP192t1',
	14: 'brainpoolP224r1',
	15: 'brainpoolP224t1',
	16: 'brainpoolP256r1',
	17: 'brainpoolP256t1',
	18: 'brainpoolP320r1',
	19: 'brainpoolP320t1',
	20: 'brainpoolP384r1',
	21: 'brainpoolP384t1',
	22: 'brainpoolP512r1',
	23: 'brainpoolP512t1',
	30: 'c2pnb163v1',
	31: 'c2pnb163v2',
	32: 'c2pnb163v3',
	33: 'c2pnb176v1',
	34: 'c2pnb208w1',
	35: 'c2pnb272w1',
	36: 'c2pnb304w1',
	37: 'c2pnb368w1',
	38: 'c2tnb191v1',
	39: 'c2tnb191v2',
	40: 'c2tnb191v3',
	41: 'c2tnb239v1',
	42: 'c2tnb239v2',
	43: 'c2tnb239v3',
	44: 'c2tnb359v1',
	45: 'c2tnb431r1',
	50: 'prime192v1',
	51: 'prime192v2',
	52: 'prime192v3',
	53: 'prime239v1',
	54: 'prime239v2',
	55: 'prime239v3',
	56: 'prime256v1',
	60: 'secp112r1',
	61: 'secp112r2',
	62: 'secp128r1',
	63: 'secp128r2',
	64: 'secp160k1',
	65: 'secp160r1',
	66: 'secp160r2',
	67: 'secp192k1',
	68: 'secp224k1',
	69: 'secp224r1',
	70: 'secp256k1',
	71: 'secp384r1',
	72: 'secp521r1',
	73: 'sect113r1',
	74: 'sect113r2',
	75: 'sect131r1',
	76: 'sect131r2',
	77: 'sect163k1',
	78: 'sect163r1',
	79: 'sect163r2',
	80: 'sect193r1',
	81: 'sect193r2',
	82: 'sect233k1',
	83: 'sect233r1',
	84: 'sect239k1',
	85: 'sect283k1',
	86: 'sect283r1',
	87: 'sect409k1',
	88: 'sect409r1',
	89: 'sect571k1',
	90: 'sect571r1',
	100: 'wap-wsg-idm-ecid-wtls1',
	101: 'wap-wsg-idm-ecid-wtls10',
	102: 'wap-wsg-idm-ecid-wtls11',
	103: 'wap-wsg-idm-ecid-wtls12',
	104: 'wap-wsg-idm-ecid-wtls3',
	105: 'wap-wsg-idm-ecid-wtls4',
	106: 'wap-wsg-idm-ecid-wtls5',
	107: 'wap-wsg-idm-ecid-wtls6',
	108: 'wap-wsg-idm-ecid-wtls7',
	109: 'wap-wsg-idm-ecid-wtls8',
	110: 'wap-wsg-idm-ecid-wtls9',
	127: 'rsa',
};
const CryptoName2IDList = {};
for (let key in CryptoID2NameList) {
	CryptoName2IDList[CryptoID2NameList[key]] = key * 1;
}

const Crypto = {};

Crypto.getCryptoID = name => {
	return CryptoName2IDList[name];
};
Crypto.getCryptoName = id => {
	return CryptoID2NameList[id];
};
Crypto.convertKey2Base64 = key => {
	var result = key.split('\n').filter(l => l.length > 0);
	result.shift();
	result.pop();
	result = result.join('');
	return result;
};
Crypto.convertBase642Key = (str, isPub = true) => {
	var len = Math.ceil(str.length / 64);
	var result = [];
	if (isPub) result.push(PubKeyStart);
	else result.push(PrvKeyStart);
	for (let i = 0; i < len; i ++) {
		let j = i * 64;
		result.push(str.substring(j, j + 64));
	}
	if (isPub) result.push(PubKeyEnd);
	else result.push(PrvKeyEnd);
	return result.join('\n');
};
Crypto.generateKeyPair = type => {
	var name;
	if (String.is(type)) {
		name = type;
		type = CryptoName2IDList[type];
		if (isNaN(type)) return { publicKey: null, privateKey: null };
	} else if (Number.is(type)) {
		name = CryptoID2NameList[type];
		if (!name) return { publicKey: null, privateKey: null };
	} else {
		return { publicKey: null, privateKey: null };
	}
	if (type === 127) {
		let { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
			modulusLength: 2048
		});
		let prvkey = privateKey.export(ExportConfig);
		let pubkey = publicKey.export(ExportConfig);
		return { publicKey: pubkey, privateKey: prvkey };
	} else {
		let { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
			namedCurve: name,
			privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
			publicKeyEncoding: { type: 'spki', format: 'pem' },
		});
		let prvkey = privateKey;
		let pubkey = publicKey;
		return { publicKey: pubkey, privateKey: prvkey };
	}
};
Crypto.crypto = crypto;

_("Utils.Crypto", Crypto);
module.exports = Crypto;