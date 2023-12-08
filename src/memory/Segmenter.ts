import { LogMessage, log } from "console/log";
import { profile } from "../profiler/decorator";

const MAX_ACTIVE_SEGMENTS = 10;

export interface SegmenterMemory {
	activeSegments: number[];
	activeForeignSegment:
		| {
				username: string;
				id?: number;
		  }
		| undefined;
	publicSegments: number[];
}

type Segment = { [prop: string]: any };

interface SegmenterCache {
	segments: { [id: number]: Segment };
	lastAccessed: { [id: number]: number | undefined };
	lastModified: { [id: number]: number | undefined };
}

const DefaultSegmenterMemory: SegmenterMemory = {
	activeSegments: [],
	activeForeignSegment: undefined,
	publicSegments: [],
};

export const SEGMENTS = {
	stats: 55,
	reinforcementLearning: 70,
	remoteDebugger: 97,
	assimilator: 98,
	version: 99,
};

Memory.segmenter = _.defaultsDeep(Memory.segmenter, DefaultSegmenterMemory);

/**
 * The segmenter module controls public and private segment memory access
 */
@profile
export class Segmenter {
	private static cache: SegmenterCache = {
		segments: {},
		lastAccessed: {},
		lastModified: {},
	};

	static get memory(): SegmenterMemory {
		return Memory.segmenter;
	}

	static debug(...args: LogMessage[]) {
		if (false) {
			log.alert("Segmenter", ...args);
		}
	}

	static requestSegments(...ids: number[]) {
		for (const id of ids) {
			if (!this.memory.activeSegments.includes(id)) {
				this.memory.activeSegments.push(id);
				if (this.memory.activeSegments.length > MAX_ACTIVE_SEGMENTS) {
					const removeSegment = this.memory.activeSegments.shift();
					console.log(
						`Maximum active segments reached. Discarding segment ${removeSegment}.`
					);
				}
			}
		}
	}

	static getSegment<T extends Segment>(id: number): T {
		this.debug(
			`getSegment: segment ${id}: atime: ${this.cache.lastAccessed[id]}, mtime: ${this.cache.lastAccessed[id]}`
		);
		if (
			(this.cache.lastAccessed[id] ?? 0) >=
				(this.cache.lastModified[id] ?? 0) &&
			this.cache.segments[id]
		) {
			this.debug(`getSegment: returning cached segment ${id}`);
			return <T>this.cache.segments[id];
		}

		const str = RawMemory.segments[id];
		this.debug(`getSegment: raw ${str}`);
		let segment: Segment;
		try {
			segment = <Segment>JSON.parse(str);
		} catch (e) {
			log.warning(`Creating new object for RawMemory.segments[${id}]`);
			this.debug(`error: ${e}, str: ${str}`);
			segment = {};
			this.cache.segments[id] = segment;
			this.cache.lastModified[id] = Game.time;
		}

		this.cache.segments[id] = segment;
		this.cache.lastAccessed[id] = Game.time;

		this.debug(`getSegment: returning parsed segment ${id}`);
		return <T>this.cache.segments[id];
	}

	static getSegmentProperty<T extends Segment>(
		id: number,
		key: keyof T
	): T[keyof T] | undefined {
		const segment = this.getSegment<T>(id);
		const obj = segment[key];
		// eslint-disable-next-line
		return obj;
	}

	static setSegment<T extends Segment>(id: number, value: T): void {
		this.cache.segments[id] = value;
		this.cache.lastModified[id] = Game.time;
		this.debug(
			`setSegment: segment ${id}: mtime: ${
				this.cache.lastModified[id]
			}, value: ${JSON.stringify(value)}`
		);
	}

	static setSegmentProperty<T extends Segment>(
		id: number,
		key: keyof T,
		value: T[keyof T]
	): void {
		const segment = this.getSegment<T>(id);
		segment[key] = value;
		this.cache.lastModified[id] = Game.time;
	}

	static requestForeignSegment(username: string | null, id?: number): void {
		if (username) {
			this.memory.activeForeignSegment = {
				username: username,
				id: id,
			};
		}
	}

	static markSegmentAsPublic(id: number): void {
		if (!this.memory.publicSegments.includes(id)) {
			this.memory.publicSegments.push(id);
		}
	}

	static getForeignSegment<T extends Segment>(
		expectedUsername: string,
		expectedId: number
	): T | undefined {
		if (!RawMemory.foreignSegment) {
			return undefined;
		}
		const { id, username, data } = RawMemory.foreignSegment;
		if (expectedUsername !== username || expectedId !== id) {
			log.warning(
				`Segmenter: loaded foreign segment doesn't match expected! (${id}/${expectedId}, ${username}/${expectedUsername})`
			);
			return undefined;
		}
		let segment: Segment;
		try {
			segment = <Segment>JSON.parse(data);
			return <T>segment;
		} catch (e) {
			log.warning(
				`Segmenter: Could not parse RawMemory.foreignSegment.data!`
			);
		}
	}

	static getForeignSegmentProperty<T extends Segment>(
		expectedUsername: string,
		expectedId: number,
		key: keyof T
	): T[typeof key] | undefined {
		const { id, username, data } = RawMemory.foreignSegment ?? {};
		if (expectedUsername !== username || expectedId !== id) {
			log.warning(
				`Segmenter: loaded foreign segment doesn't match expected! (${id}/${expectedId}, ${username}/${expectedUsername})`
			);
			return undefined;
		}
		let segment: T;
		try {
			segment = <T>JSON.parse(data);
			if (segment) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return segment[key];
			}
		} catch (e) {
			log.warning(
				`Segmenter: Could not parse RawMemory.foreignSegment.data!`
			);
		}
		return undefined;
	}

	static run() {
		// Set active, public, and foreign segments
		RawMemory.setActiveSegments(this.memory.activeSegments);
		RawMemory.setPublicSegments(this.memory.publicSegments);
		if (this.memory.activeForeignSegment) {
			RawMemory.setActiveForeignSegment(
				this.memory.activeForeignSegment.username,
				this.memory.activeForeignSegment.id
			);
		} else {
			RawMemory.setActiveForeignSegment(null);
		}
		// Write things that have been modified this tick to memory
		const start = Game.cpu.getUsed();
		let count = 0;
		for (const id in this.cache.lastModified) {
			this.debug(
				`checking segment ${id} for writing: ${this.cache.lastModified[id]}`
			);
			if (this.cache.lastModified[id] == Game.time) {
				this.debug(`writing segment ${id}`);
				count++;
				RawMemory.segments[id] = JSON.stringify(
					this.cache.segments[id]
				);
			}
		}
		this.debug(
			`spent ${Game.cpu.getUsed() - start} CPU writing ${count} segments`
		);
	}
}

global.Segmenter = Segmenter;
