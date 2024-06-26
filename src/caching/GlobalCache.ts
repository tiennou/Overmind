import { profile } from "../profiler/decorator";
import { getCacheExpiration } from "../utilities/utils";

const CACHE_TIMEOUT = 50;
const SHORT_CACHE_TIMEOUT = 10;
const COSTMATRIX_TIMEOUT = 20;
// const PATH_TIMEOUT = 1000;

const STRUCTURE_KEY = "s";
const NUMBER_KEY = "#";
const POSITION_KEY = "p";
const LIST_KEY = "l";
const OBJECT_KEY = "o";
const COSTMATRIX_KEY = "m";
const ID_KEY = "$";

/**
 * The GlobalCache ($) module saves frequently accessed deserialized objects in temporary, volatile global memory
 */
@profile
export class $ {
	// $ = cash = cache... get it? :D

	static structures<T extends Structure>(
		saver: { ref: string },
		key: string,
		callback: () => T[],
		timeout = CACHE_TIMEOUT
	): T[] {
		const cacheKey = saver.ref + STRUCTURE_KEY + key;
		if (
			!_cache.structures[cacheKey] ||
			Game.time > _cache.expiration[cacheKey]
		) {
			// Recache if new entry or entry is expired
			_cache.structures[cacheKey] = callback();
			_cache.expiration[cacheKey] = getCacheExpiration(
				timeout,
				Math.ceil(timeout / 10)
			);
		} else {
			// Refresh structure list by ID if not already done on current tick
			if ((_cache.accessed[cacheKey] || 0) < Game.time) {
				_cache.structures[cacheKey] = _.compact(
					_.map(_cache.structures[cacheKey] || [], (s) =>
						Game.getObjectById(s.id)
					)
				) as Structure[];
				_cache.accessed[cacheKey] = Game.time;
			}
		}
		return _cache.structures[cacheKey] as T[];
	}

	// eslint-disable-next-line id-denylist
	static number(
		saver: { ref: string },
		key: string,
		callback: () => number,
		timeout = SHORT_CACHE_TIMEOUT
	): number {
		const cacheKey = saver.ref + NUMBER_KEY + key;
		if (
			_cache.numbers[cacheKey] == undefined ||
			Game.time > _cache.expiration[cacheKey]
		) {
			// Recache if new entry or entry is expired
			_cache.numbers[cacheKey] = callback();
			_cache.expiration[cacheKey] = getCacheExpiration(
				timeout,
				Math.ceil(timeout / 10)
			);
		}
		return _cache.numbers[cacheKey];
	}

	static numberRecall(
		saver: { ref: string },
		key: string
	): number | undefined {
		const cacheKey = saver.ref + NUMBER_KEY + key;
		return _cache.numbers[cacheKey] as number | undefined;
	}

	// static pos(saver: { ref: string }, key: string, callback: () => RoomPosition, timeout ?: number): RoomPosition;
	static pos(
		saver: { ref: string },
		key: string,
		callback: () => RoomPosition | undefined,
		timeout?: number
	): RoomPosition | undefined {
		const cacheKey = saver.ref + POSITION_KEY + key;
		if (
			_cache.roomPositions[cacheKey] == undefined ||
			Game.time > _cache.expiration[cacheKey]
		) {
			// Recache if new entry or entry is expired
			_cache.roomPositions[cacheKey] = callback();
			timeout ??= CACHE_TIMEOUT;
			_cache.expiration[cacheKey] = getCacheExpiration(
				timeout,
				Math.ceil(timeout / 10)
			);
		}
		return _cache.roomPositions[cacheKey];
	}

	static list<T>(
		saver: { ref: string },
		key: string,
		callback: () => T[],
		timeout = CACHE_TIMEOUT
	): T[] {
		const cacheKey = saver.ref + LIST_KEY + key;
		if (
			_cache.lists[cacheKey] == undefined ||
			Game.time > _cache.expiration[cacheKey]
		) {
			// Recache if new entry or entry is expired
			_cache.lists[cacheKey] = callback();
			_cache.expiration[cacheKey] = getCacheExpiration(
				timeout,
				Math.ceil(timeout / 10)
			);
		}
		return _cache.lists[cacheKey] as T[];
	}

	static object<T extends Object>(
		saver: HasRef,
		key: string,
		callback: () => T,
		timeout = CACHE_TIMEOUT
	): T {
		const cacheKey = saver.ref + OBJECT_KEY + key;
		if (
			_cache.objects[cacheKey] == undefined ||
			Game.time > _cache.expiration[cacheKey]
		) {
			// Recache if new entry or entry is expired
			_cache.objects[cacheKey] = callback();
			_cache.expiration[cacheKey] = getCacheExpiration(
				timeout,
				Math.ceil(timeout / 10)
			);
		}
		return _cache.objects[cacheKey] as T;
	}

	/**
	 * Caches a CostMatrix computation. Times out quickly, but you can use $.costMatrixRecall() to pull the value for
	 * an invisible room without triggering a recalc
	 */
	static costMatrix(
		roomName: string,
		key: string,
		callback: () => CostMatrix,
		timeout = COSTMATRIX_TIMEOUT
	): CostMatrix {
		const cacheKey = roomName + COSTMATRIX_KEY + key;
		if (
			_cache.costMatrices[cacheKey] == undefined ||
			Game.time > _cache.expiration[cacheKey]
		) {
			// Recache if new entry or entry is expired
			_cache.costMatrices[cacheKey] = callback();
			_cache.expiration[cacheKey] = getCacheExpiration(
				timeout,
				Math.ceil(timeout / 10)
			);
		}
		return _cache.costMatrices[cacheKey];
	}

	/**
	 * Returns the value of a previously cached CostMatrix without triggering a cache expiration and recalc
	 */
	static costMatrixRecall(
		roomName: string,
		key: string
	): CostMatrix | undefined {
		const cacheKey = roomName + COSTMATRIX_KEY + key;
		return _cache.costMatrices[cacheKey];
	}

	// static path(fromPos: RoomPosition, toPos: RoomPosition, opts: any /*todo*/): RoomPosition[] {
	// 	// TODO
	// 	return [];
	// }

	static set<T extends HasRef, K extends keyof T>(
		thing: T,
		key: K,
		callback: () => T[K] & (undefined | _HasId | _HasId[]),
		timeout = CACHE_TIMEOUT
	): void {
		const cacheKey = thing.ref + ID_KEY + <string>key;
		if (
			!_cache.things[cacheKey] ||
			Game.time > _cache.expiration[cacheKey]
		) {
			// Recache if new entry or entry is expired
			_cache.things[cacheKey] = callback();
			_cache.expiration[cacheKey] = getCacheExpiration(
				timeout,
				Math.ceil(timeout / 10)
			);
		} else {
			// Refresh structure list by ID if not already done on current tick
			if ((_cache.accessed[cacheKey] || 0) < Game.time) {
				if (_.isArray(_cache.things[cacheKey])) {
					_cache.things[cacheKey] = _.compact(
						_.map(_cache.things[cacheKey] as _HasId[], (s) =>
							Game.getObjectById(s.id)
						)
					) as _HasId[];
				} else {
					_cache.things[cacheKey] = Game.getObjectById(
						(<_HasId>_cache.things[cacheKey]).id
					) as _HasId;
				}
				_cache.accessed[cacheKey] = Game.time;
			}
		}
		thing[key] = _cache.things[cacheKey] as T[K] &
			(undefined | _HasId | _HasId[]);
	}

	static refresh<
		T extends Record<K, undefined | _HasId | _HasId[]>,
		K extends keyof T,
	>(thing: T, ...keys: K[]): void {
		_.forEach(keys, function (key) {
			if (thing[key]) {
				if (_.isArray(thing[key])) {
					thing[key] = _.compact(
						_.map(thing[key] as _HasId[], (s) =>
							Game.getObjectById(s.id)
						)
					) as T[K];
				} else {
					thing[key] = Game.getObjectById(
						(<_HasId>thing[key]).id
					) as T[K];
				}
			}
		});
	}

	static refreshObject<
		T extends Record<K, { [prop: string]: undefined | _HasId | _HasId[] }>,
		K extends keyof T,
	>(thing: T, ...keys: K[]): void {
		_.forEach(keys, function (key) {
			if (_.isObject(thing[key])) {
				for (const prop in thing[key]) {
					if (_.isArray(thing[key][prop])) {
						// @ts-expect-error type mismatch
						thing[key][prop] = <_HasId[]>(
							_.compact(
								_.map(thing[key][prop] as _HasId[], (s) =>
									Game.getObjectById(s.id)
								)
							)
						);
					} else {
						// @ts-expect-error type mismatch somewhere
						thing[key][prop] = <_HasId>(
							Game.getObjectById((<_HasId>thing[key][prop]).id)
						);
					}
				}
			}
		});
	}

	static refreshRoom<T extends { room: Room }>(thing: T): void {
		thing.room = Game.rooms[thing.room.name];
	}
}
