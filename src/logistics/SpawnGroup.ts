import { Colony, getAllColonies } from "../Colony";
import { log } from "../console/log";
import { DEFAULT_MAX_PATH_LENGTH } from "../directives/Directive";
import { Hatchery, SpawnRequest } from "../hiveClusters/hatchery";
import { Mem } from "../memory/Memory";
import { Pathing } from "../movement/Pathing";
import { profile } from "../profiler/decorator";
import {
	getCacheExpiration,
	maxBy,
	minBy,
	onPublicServer,
} from "../utilities/utils";

interface SpawnGroupMemory {
	debug?: boolean;
	colonies: string[];
	distances: { [colonyName: string]: number };
	// routes: { [colonyName: string]: { [roomName: string]: boolean } };
	// paths: { [colonyName: string]: { startPos: RoomPosition, path: string[] } }
	// tick: number;
	expiration: number;
}

const getDefaultSpawnGroupMemory: () => SpawnGroupMemory = () => ({
	colonies: [],
	distances: {},
	// routes    : {},
	// paths    : {},
	expiration: 0,
});

const MAX_LINEAR_DISTANCE = 10; // maximum linear distance to search for ANY spawn group
const DEFAULT_RECACHE_TIME = onPublicServer() ? 2000 : 1000;

const defaultSettings: SpawnGroupSettings = {
	maxPathDistance: DEFAULT_MAX_PATH_LENGTH, // override default path distance
	requiredRCL: 7,
	maxLevelDifference: 8,
	// flexibleEnergy    : true,
};

export interface SpawnGroupSettings {
	/** maximum path distance colonies can spawn creeps to */
	maxPathDistance: number;
	/** required RCL of colonies to contribute */
	requiredRCL: number;
	/** max difference from the colony with highest RCL to be included in spawn group */
	maxLevelDifference: number;
	/** whether to enforce that only the largest possible creeps are spawned */
	// flexibleEnergy: boolean;
	/** maximum priority the spawn group will allow to spawn */
	spawnPriorityThreshold?: number;
	/** spawn priority boost applied to spawn requests */
	spawnPriorityBoost?: number;
}

export interface SpawnGroupInitializer {
	ref: string;
	room: Room | undefined;
	pos: RoomPosition;
}

/**
 * SpawnGroup provides a decentralized method of spawning creeps from multiple nearby colonies. Use cases include
 * incubation, spawning large combat groups, etc.
 */
@profile
export class SpawnGroup {
	memory: SpawnGroupMemory;
	requests: SpawnRequest[];
	roomName: string;
	energyCapacityAvailable: number;
	ref: string;
	settings: SpawnGroupSettings;
	stats: {
		avgDistance: number;
	};
	private _colonies: Colony[] | undefined;

	constructor(
		initializer: SpawnGroupInitializer,
		settings: Partial<SpawnGroupSettings> = {}
	) {
		this.roomName = initializer.pos.roomName;
		// this.room = initializer.room;
		if (!Memory.rooms[this.roomName]) {
			Memory.rooms[this.roomName] = {};
		}
		this.memory = Mem.wrap(
			Memory.rooms[this.roomName],
			"spawnGroup",
			getDefaultSpawnGroupMemory
		);
		this.ref = initializer.ref + ":SG";
		this.stats = {
			avgDistance:
				_.sum(this.memory.distances) /
					_.keys(this.memory.distances).length || 100,
		};
		this.requests = [];
		this.settings = _.defaults(settings, defaultSettings);
		if (Game.time >= this.memory.expiration) {
			this.recalculateColonies();
		}

		this.energyCapacityAvailable = _.max(
			_.map(
				this.memory.colonies,
				(roomName) => Game.rooms[roomName].energyCapacityAvailable
			)
		);
		this._colonies = undefined;
		Overmind.spawnGroups[this.ref] = this;
	}

	get print(): string {
		return (
			'<a href="#!/room/' +
			Game.shard.name +
			"/" +
			this.roomName +
			'">[' +
			this.ref +
			"]</a>"
		);
	}

	protected debug(...args: string[]) {
		if (this.memory.debug) {
			log.alert(this.print, ...args);
		}
	}

	get colonyNames() {
		return this.memory.colonies;
	}

	get colonies(): Colony[] {
		if (!this._colonies) {
			this._colonies = _.compact(
				_.map(
					this.memory.colonies,
					(roomName) => Overmind.colonies[roomName]
				)
			);
		}
		return this._colonies;
	}

	/**
	 * Refresh the state of the spawnGroup; called by the Overmind object.
	 */
	refresh() {
		this.memory = Mem.wrap(
			Memory.rooms[this.roomName],
			"spawnGroup",
			getDefaultSpawnGroupMemory
		);
		this.requests = [];
		this._colonies = undefined;
	}

	private recalculateColonies() {
		// Get all colonies in range that are of required level, then filter out ones that are too far from best
		let coloniesInRange = _.filter(
			getAllColonies(),
			(colony) =>
				Game.map.getRoomLinearDistance(
					colony.room.name,
					this.roomName
				) <= MAX_LINEAR_DISTANCE &&
				colony.spawns.length > 0 &&
				colony.level >= this.settings.requiredRCL
		);
		if (this.settings.maxLevelDifference !== 8) {
			const maxColonyLevel =
				maxBy(coloniesInRange, (colony) => colony.level)?.level ?? 8;
			coloniesInRange = _.filter(
				coloniesInRange,
				(colony) =>
					maxColonyLevel - colony.level <=
					this.settings.maxLevelDifference
			);
		}

		this.debug(
			`recalculateColonies: initial set: ${coloniesInRange.map(
				(c) => c.print
			)}`
		);
		const colonyNames: string[] = [];
		// const routes = {} as { [colonyName: string]: { [roomName: string]: boolean } };
		// let paths = {} as { [colonyName: string]: { startPos: RoomPosition, path: string[] } };
		const distances: { [colonyName: string]: number } = {};
		for (const colony of coloniesInRange) {
			const spawn = colony.room.spawns[0];
			const path = Pathing.findPathToRoom(spawn.pos, this.roomName, {
				useFindRoute: true,
			});
			if (
				!path.incomplete &&
				path.path.length <= this.settings.maxPathDistance
			) {
				colonyNames.push(colony.room.name);
				// routes[colony.room.name] = route;
				// paths[room.name] = path.path;
				distances[colony.room.name] = path.path.length;
			}
		}

		if (colonyNames.length == 0) {
			log.warning(
				`No colonies meet the requirements for SpawnGroup: ${this.ref}`
			);
			return;
		}

		this.debug(`recalculateColonies: valid colonies: ${colonyNames}`);
		this.memory.colonies = colonyNames;
		// this.memory.routes = routes;
		// this.memory.paths = TODO
		this.memory.distances = distances;
		this.memory.expiration = getCacheExpiration(DEFAULT_RECACHE_TIME, 25);
	}

	enqueue(request: SpawnRequest): void {
		const threshold = this.settings.spawnPriorityThreshold;
		if (threshold !== undefined && request.priority > threshold) {
			return;
		}
		const boost = this.settings.spawnPriorityBoost;
		if (boost !== undefined) {
			request.priority += boost;
		}
		this.requests.push(request);
	}

	init(): void {}

	run(): void {
		// This needs to happen in run, after colonies & hatcheries are initialized, and
		// getWaitTimeForPriority can construct boosted creeps
		const colonies = _.compact(
			_.map(this.memory.colonies, (name) => Overmind.colonies[name])
		);
		const hatcheries = _.compact(
			_.map(colonies, (colony) => colony.hatchery)
		) as Hatchery[];
		const distanceTo = (hatchery: Hatchery) =>
			this.memory.distances[hatchery.pos.roomName] + 25;

		this.debug(
			`enqueuing ${
				this.requests.length
			} requests to hatcheries: ${hatcheries.map((h) => h.print)}`
		);
		// Enqueue each requests to the hatchery with least expected wait time, which is updated after each enqueue
		for (const request of this.requests) {
			// const maxCost = bodyCost(request.setup.generateBody(this.energyCapacityAvailable));
			// const okHatcheries = _.filter(hatcheries,
			// 							  hatchery => hatchery.room.energyCapacityAvailable >= maxCost);
			const bestHatchery = minBy(
				hatcheries,
				(hatchery) =>
					hatchery.getWaitTimeForPriority(request.priority) +
					distanceTo(hatchery)
			);

			this.debug(
				`enqueuing request: ${request.setup.role}@${request.priority} to ${bestHatchery?.print}`
			);
			if (bestHatchery) {
				bestHatchery.enqueue(request);
			} else {
				log.error(
					`Could not enqueue creep with role ${request.setup.role} in ${this.roomName} ` +
						`for Overlord ${request.overlord.print}!`
				);
			}
		}
	}
}
