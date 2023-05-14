const { join } = require('node:path');
const preparePath = _("Utils").preparePath;

module.exports = async () => {
	await preparePath(join(process.cwd(), 'out'));
	await preparePath(join(process.cwd(), 'out', 'log'));
	await preparePath(join(process.cwd(), 'out', 'search'));
	await preparePath(join(process.cwd(), 'out', 'scholar'));
	await preparePath(join(process.cwd(), 'out', 'browse'));
	await preparePath(join(process.cwd(), 'out', 'summarize'));
};