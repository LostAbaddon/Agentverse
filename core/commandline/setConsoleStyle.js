/**
 * Name:	Console Style Optimizer
 * Desc:    命令行样式优化
 * Author:	LostAbaddon
 * Version:	0.0.1
 * Date:	2017.10.14
 *
 * 基于ansi-style库和chalk库
 */

const styles = {
	modifier: {
		reset: [0, 0],
		// 21 isn't widely supported and 22 does the same thing
		bold: [1, 21],
		dim: [2, 22],
		italic: [3, 23],
		underline: [4, 24],
		inverse: [7, 27],
		hidden: [8, 28],
		strikethrough: [9, 29]
	},
	color: {
		black: [30, 39],
		red: [31, 39],
		green: [32, 39],
		yellow: [33, 39],
		blue: [34, 39],
		magenta: [35, 39],
		cyan: [36, 39],
		white: [37, 39],
		gray: [90, 39],

		// Bright color
		redBright: [91, 39],
		greenBright: [92, 39],
		yellowBright: [93, 39],
		blueBright: [94, 39],
		magentaBright: [95, 39],
		cyanBright: [96, 39],
		whiteBright: [97, 39]
	},
	bgColor: {
		bgBlack: [40, 49],
		bgRed: [41, 49],
		bgGreen: [42, 49],
		bgYellow: [43, 49],
		bgBlue: [44, 49],
		bgMagenta: [45, 49],
		bgCyan: [46, 49],
		bgWhite: [47, 49],

		// Bright color
		bgBlackBright: [100, 49],
		bgRedBright: [101, 49],
		bgGreenBright: [102, 49],
		bgYellowBright: [103, 49],
		bgBlueBright: [104, 49],
		bgMagentaBright: [105, 49],
		bgCyanBright: [106, 49],
		bgWhiteBright: [107, 49]
	}
};
styles.color.grey = styles.color.gray;
for (let groupName of Object.keys(styles)) {
	let group = styles[groupName];

	for (let styleName of Object.keys(group)) {
		let style = group[styleName];

		styles[styleName] = {
			open: `\u001B[${style[0]}m`,
			close: `\u001B[${style[1]}m`
		};

		group[styleName] = styles[styleName];
	}

	styles[groupName] = group;
}
styles.color.close = '\u001B[39m';
styles.bgColor.close = '\u001B[49m';

const setStyle = (msg, style) => {
	if (style instanceof String || typeof style === 'string') {
		style = style.trim();
		if (style.indexOf(' ') >= 0) {
			style = style.split(/ +/);
			return setStyle(msg, style);
		}
		else {
			style = styles[style];
			if (!style || !style.open || !style.close) return msg;
			return style.open + msg + style.close;
		}
	}
	else for (let s of style) {
		s = styles[s];
		if (!s || !s.open || !s.close) continue;
		msg = s.open + msg + s.close;
	}
	return msg;
};
module.exports = setStyle;
module.exports.styles = styles;
_('CL.SetStyle', setStyle);