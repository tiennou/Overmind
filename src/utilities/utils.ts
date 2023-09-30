// Random utilities that don't belong anywhere else

import { config } from 'config';
import {alignedNewline, bullet} from './stringConstants';

/** dereference any object from identifier */
export function deref(ref: string): RoomObject | null {
	return Game.getObjectById<any>(ref) as any as RoomObject
		|| Game.flags[ref] || Game.creeps[ref] || Game.spawns[ref] || null;
}

export function derefRoomPosition(protoPos: ProtoPos): RoomPosition {
	return new RoomPosition(protoPos.x, protoPos.y, protoPos.roomName);
}

/** JSON-serialize arguments for output */
export function dump(...args: any[]): string {
	let message = '';
	for (const arg of args) {
		let cache: any[] = [];
		const msg = JSON.stringify(arg, function(key, value: any): any {
			if (typeof value === 'object' && value !== null) {
				if (cache.indexOf(value) !== -1) {
					// Duplicate reference found
					try {
						// If this value does not reference a parent it can be deduped
						// eslint-disable-next-line
						return JSON.parse(JSON.stringify(value));
					} catch (error) {
						// discard key if value cannot be deduped
						return;
					}
				}
				// Store value in our collection
				cache.push(value);
			}
			// eslint-disable-next-line
			return value;
		}, '\t');
		// @ts-expect-error Clear out the cache
		cache = null;
		message += '\n' + msg;
	}
	return message;
}

export function getAllRooms(): Room[] {
	if (!Game._allRooms) {
		Game._allRooms = _.values(Game.rooms); // this is cleared every tick
	}
	return Game._allRooms;
}

export function getOwnedRooms(): Room[] {
	if (!Game._ownedRooms) {
		Game._ownedRooms = _.filter(getAllRooms(), room => room.my); // this is cleared every tick
	}
	return Game._ownedRooms;
}

export function canClaimAnotherRoom(): boolean {
	return getOwnedRooms().length < Game.gcl.level;
}

export function printRoomName(roomName: string, aligned = false): string {
	if (aligned) {
		const msg = '<a href="#!/room/' + Game.shard.name + '/' + roomName + '">' + roomName + '</a>';
		const extraSpaces = 'E12S34'.length - roomName.length;
		return msg + ' '.repeat(extraSpaces);
	} else {
		return '<a href="#!/room/' + Game.shard.name + '/' + roomName + '">' + roomName + '</a>';
	}
}

export function color(str: string, color: string): string {
	return `<font color='${color}'>${str}</font>`;
}

function componentToHex(n: number): string {
	const hex = n.toString(16);
	return hex.length == 1 ? '0' + hex : hex;
}

export function rgbToHex(r: number, g: number, b: number): string {
	return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

export function interpolateColor(c0: string, c1: string, f: number) {
	const s0 = c0.match(/#?([0-9A-F]{1,2})([0-9A-F]{1,2})([0-9A-F]{1,2})/);
	const s1 = c1.match(/#?([0-9A-F]{1,2})([0-9A-F]{1,2})([0-9A-F]{1,2})/);
	if (!s0) throw new TypeError(`invalid value for c0: ${c0}`);
	if (!s1) throw new TypeError(`invalid value for c1: ${c1}`);
	if (typeof f !== "number" || f < 0 || f > 1) throw new TypeError(`f must be a number between 0.0 and 1.0`);

	const n0 = s0.map((oct) => parseInt(oct, 16) * (1 - f));
	const n1 = s1.map((oct) => parseInt(oct, 16) * f);

	const ci = [1,2,3].map(i => Math.min(Math.round(n0[i] + n1[i]), 255));
	// eslint-disable-next-line no-bitwise
	return "#" + ci.reduce((a,v) => ((a << 8) + v), 0).toString(16).padStart(6, "0");
}

/**
 * Correct generalization of the modulo operator to negative numbers
 */
export function mod(n: number, m: number): number {
	return ((n % m) + m) % m;
}

export function minMax(value: number, min: number, max: number): number {
	return Math.max(Math.min(value, max), min);
}

export function hasMinerals(store: StoreDefinition): boolean {
	for (const resourceType in store) {
		if (resourceType != RESOURCE_ENERGY && (store[<ResourceConstant>resourceType] || 0) > 0) {
			return true;
		}
	}
	return false;
}

export function hasContents(store: { [resourceType: string]: number }): boolean {
	for (const resourceType in store) {
		if ((store[<ResourceConstant>resourceType] || 0) > 0) {
			return true;
		}
	}
	return false;
}

/**
 * Obtain the username of the player
 */
export function getMyUsername(): string {
	for (const i in Game.rooms) {
		const room = Game.rooms[i];
		if (room.controller && room.controller.owner && room.controller.my) {
			return room.controller.owner.username;
		}
	}
	for (const i in Game.creeps) {
		const creep = Game.creeps[i];
		if (creep.owner) {
			return creep.owner.username;
		}
	}
	console.log('ERROR: Could not determine username. You can set this manually in src/settings/settings_user');
	return 'ERROR: Could not determine username.';
}

export function isAlly(username: string): boolean {
	return username == config.MUON || username === config.MY_USERNAME || (Memory.settings.allies || []).includes(username);
}

export function hasJustSpawned(): boolean {
	return _.keys(Overmind.colonies).length == 1 && _.keys(Game.creeps).length == 0 && _.keys(Game.spawns).length == 1;
}

export function onPublicServer(): boolean {
	return Game.shard.name.includes('shard');
}

export function onBotArena(): boolean {
	return Game.shard.name.toLowerCase() == 'botarena';
}

export function onTrainingEnvironment(): boolean {
	return !!Memory.reinforcementLearning && !!Memory.reinforcementLearning.enabled;
}

export function getReinforcementLearningTrainingVerbosity(): number {
	if (Memory.reinforcementLearning) {
		if (Memory.reinforcementLearning.verbosity != undefined) {
			return Memory.reinforcementLearning.verbosity;
		}
	}
	return 0;
}

interface ToColumnOpts {
	padChar: string;
	justify: boolean;
}

export function bulleted(text: string[], aligned = true, startWithNewLine = true): string {
	if (text.length == 0) {
		return '';
	}
	const prefix = (startWithNewLine ? (aligned ? alignedNewline : '\n') : '') + bullet;
	if (aligned) {
		return prefix + text.join(alignedNewline + bullet);
	} else {
		return prefix + text.join('\n' + bullet);
	}
}

/**
 * Create column-aligned text array from object with string key/values
 */
export function toColumns(obj: { [key: string]: string }, opts = {} as ToColumnOpts): string[] {
	_.defaults(opts, {
		padChar: ' ',	// Character to pad with, e.g. "." would be key........val
		justify: false 	// Right align values column?
	});

	const ret = [];
	const keyPadding = _.max(_.map(_.keys(obj), str => str.length)) + 1;
	const valPadding = _.max(_.mapValues(obj, str => str.length));

	for (const key in obj) {
		if (opts.justify) {
			ret.push(key.padRight(keyPadding, opts.padChar) + obj[key].padLeft(valPadding, opts.padChar));
		} else {
			ret.push(key.padRight(keyPadding, opts.padChar) + obj[key]);
		}
	}

	return ret;
}

/**
 * Merges a list of store-like objects, summing overlapping keys. Useful for calculating assets from multiple sources
 */
export function mergeSum(...stores: StoreContents[]): StoreContents {
	const ret = <StoreContents>{};
	for (const store of stores) {
		for (const [key, amount] of <[ResourceConstant, number][]>Object.entries(store)) {
			if (!ret[key]) ret[key] = 0;
			ret[key] += amount;
		}
	}
	return ret;
}

// export function coordName(coord: Coord): string {
// 	return coord.x + ':' + coord.y;
// }

// const CHARCODE_A = 65;

/**
 * Returns a compact two-character encoding of the coordinate
 */
// export function compactCoordName(coord: Coord): string {
// 	return String.fromCharCode(CHARCODE_A + coord.x, CHARCODE_A + coord.y);
// }
//
// export function derefCoords(coordName: string, roomName: string): RoomPosition {
// 	const [x, y] = coordName.split(':');
// 	return new RoomPosition(parseInt(x, 10), parseInt(y, 10), roomName);
// }

export function posFromReadableName(str: string | undefined | null): RoomPosition | undefined {
	if (!str) return;
	const posName = _.first(str.match(/(E|W)\d+(N|S)\d+:\d+:\d+/g) || []);
	if (posName) {
		const [roomName, x, y] = posName.split(':');
		return new RoomPosition(parseInt(x, 10), parseInt(y, 10), roomName);
	}
}

export function equalXYR(pos1: ProtoPos, pos2: ProtoPos): boolean {
	return pos1.x == pos2.x && pos1.y == pos2.y && pos1.roomName == pos2.roomName;
}

/** Equivalent to Object.entries, but preserving the types */
export function entries<K extends string, V extends {}>(obj: Partial<Record<K, V>>): [K, V][] {
	return <[K, V][]>Object.entries(obj);
}

/**
 * Averages a list of objects by mapping object=>iteratee(object)
 */
export function averageBy<T>(objects: T[], iteratee: ((obj: T) => number)): number | undefined {
	if (objects.length == 0) {
		return undefined;
	} else {
		return _.sum(objects, obj => iteratee(obj)) / objects.length;
	}
}

/**
 * Equivalent to lodash.minBy() method
 */
export function minBy<T>(objects: T[], iteratee: ((obj: T) => number | false)): T | undefined {
	let minObj: T | undefined;
	let minVal = Infinity;
	let val: number | false;
	for (const obj of objects) {
		val = iteratee(obj);
		if (val !== false && val < minVal) {
			minVal = val;
			minObj = obj;
		}
	}
	return minObj;
}

/**
 * Equivalent to lodash.maxBy() method
 */
export function maxBy<T>(objects: T[], iteratee: ((obj: T) => number | false)): T | undefined {
	let maxObj: T | undefined;
	let maxVal = -Infinity;
	let val: number | false;
	for (const obj of objects) {
		val = iteratee(obj);
		if (val !== false && val > maxVal) {
			maxVal = val;
			maxObj = obj;
		}
	}
	return maxObj;
}

export function logHeapStats(): void {
	if (typeof Game.cpu.getHeapStatistics === 'function') {
		const heapStats = Game.cpu.getHeapStatistics();
		const heapPercent = Math.round(100 * (heapStats.total_heap_size + heapStats.externally_allocated_size)
									   / heapStats.heap_size_limit);
		const heapSize = Math.round((heapStats.total_heap_size) / 1048576);
		const externalHeapSize = Math.round((heapStats.externally_allocated_size) / 1048576);
		const heapLimit = Math.round(heapStats.heap_size_limit / 1048576);
		console.log(`Heap usage: ${heapSize} MB + ${externalHeapSize} MB of ${heapLimit} MB (${heapPercent}%).`);
	}
}

/**
 * Return whether the IVM is enabled
 */
export function isIVM(): boolean {
	return typeof Game.cpu.getHeapStatistics === 'function';
}

/**
 * Generate a randomly-offset cache expiration time
 */
export function getCacheExpiration(timeout: number, offset = 5): number {
	return Game.time + timeout + Math.round((Math.random() * offset * 2) - offset);
}

const hexChars = '0123456789abcdef';

/**
 * Generate a random hex string of specified length
 */
export function randomHex(length: number): string {
	let result = '';
	for (let i = 0; i < length; i++) {
		result += hexChars[Math.floor(Math.random() * hexChars.length)];
	}
	return result;
}

/**
 * Compute an exponential moving average
 */
export function ema(current: number, avg: number | undefined, window: number, zeroThreshold = 1e-9): number {
	let newAvg = (current + (avg || 0) * (window - 1)) / window;
	if (zeroThreshold && Math.abs(newAvg) < zeroThreshold) {
		newAvg = 0;
	}
	return newAvg;
}

/**
 * Compute an exponential moving average for unevenly spaced samples
 */
export function irregularEma(current: number, avg: number, dt: number, window: number): number {
	return (current * dt + avg * (window - dt)) / window;
}

/**
 * Create a shallow copy of a 2D array
 */
export function clone2DArray<T>(a: T[][]): T[][] {
	return _.map(a, e => e.slice());
}

/**
 * Rotate a square matrix in place clockwise by 90 degrees
 */
export function rotateMatrix<T>(matrix: T[][]): void {
	// reverse the rows
	matrix.reverse();
	// swap the symmetric elements
	for (let i = 0; i < matrix.length; i++) {
		for (let j = 0; j < i; j++) {
			const temp = matrix[i][j];
			matrix[i][j] = matrix[j][i];
			matrix[j][i] = temp;
		}
	}
}

/**
 * Return a copy of a 2D array rotated by specified number of clockwise 90 turns
 */
export function rotatedMatrix<T>(matrix: T[][], clockwiseTurns: 0 | 1 | 2 | 3): T[][] {
	const mat = clone2DArray(matrix);
	for (let i = 0; i < clockwiseTurns; i++) {
		rotateMatrix(mat);
	}
	return mat;
}

/**
 * Cyclically permute a list by n elements
 */
export function cyclicListPermutation<T>(list: T[], offset: number): T[] {
	return list.slice(offset).concat(list.slice(0, offset));
}
