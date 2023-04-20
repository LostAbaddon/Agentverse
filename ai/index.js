const events = [
	"ask",
	"task"
];

const callFunction = async (event, data) => {
	console.log(event, data);
	await wait(Math.random() * 2000);
	return ["fuck you"];
};
const showResult = (event, data, err) => {
	console.log(event, data);
};

module.exports = {
	events,
	call: callFunction,
	show: showResult
};