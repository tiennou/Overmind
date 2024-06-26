import { log } from "console/log";
import { Cartographer } from "../utilities/Cartographer";
import { minBy, mod } from "../utilities/utils";
import { PERMACACHE } from "caching/PermaCache";

Object.defineProperty(RoomPosition.prototype, "print", {
	get(this: RoomPosition) {
		return (
			'<a href="#!/room/' +
			Game.shard.name +
			"/" +
			this.roomName +
			'">[' +
			this.roomName +
			", " +
			this.x +
			", " +
			this.y +
			"]</a>"
		);
	},
	configurable: true,
});

Object.defineProperty(RoomPosition.prototype, "printPlain", {
	get(this: RoomPosition) {
		return `[${this.roomName}, ${this.x}, ${this.y}]`;
	},
	configurable: true,
});

Object.defineProperty(RoomPosition.prototype, "room", {
	get(this: RoomPosition) {
		return Game.rooms[this.roomName];
	},
	configurable: true,
});

RoomPosition.prototype.toCoord = function (this: RoomPosition): Coord {
	return { x: this.x, y: this.y };
};

Object.defineProperty(RoomPosition.prototype, "readableName", {
	// identifier for the pos, used in caching
	get: function (this: RoomPosition) {
		return this.roomName + ":" + this.x + ":" + this.y;
	},
	configurable: true,
});

// Object.defineProperty(RoomPosition.prototype, 'coordName', { // name, but without the roomName
// 	get         : function() {
// 		return this.x + ':' + this.y;
// 	},
// 	configurable: true,
// });

RoomPosition.prototype.lookForStructure = function <
	T extends StructureConstant,
>(this: RoomPosition, structureType: T): ConcreteStructure<T> | undefined {
	return <ConcreteStructure<T>>(
		_.find(
			this.lookFor(LOOK_STRUCTURES),
			(s) => s.structureType === structureType
		)
	);
};

RoomPosition.prototype.getOffsetPos = function (
	this: RoomPosition,
	dx: number,
	dy: number
): RoomPosition {
	let roomName = this.roomName;
	let x = this.x + dx;
	if (x < 0 || x > 49) {
		const dxRoom = Math.floor(x / 50);
		x = mod(x, 50);
		roomName = Cartographer.findRelativeRoomName(roomName, dxRoom, 0);
	}
	let y = this.y + dy;
	if (y < 0 || y > 49) {
		const dyRoom = Math.floor(y / 50);
		y = mod(y, 50);
		roomName = Cartographer.findRelativeRoomName(roomName, 0, dyRoom);
	}
	return new RoomPosition(x, y, roomName);
};

// RoomPosition.prototype.findInRange_fast = function<T extends HasPos>(objects: T[], range: number): T[] {
// 	return _.filter(objects, o => this.inRangeToXY(o.pos.x, o.pos.y, range));
// }

Object.defineProperty(RoomPosition.prototype, "isEdge", {
	// if the position is at the edge of a room
	get: function (this: RoomPosition) {
		return this.x === 0 || this.x === 49 || this.y === 0 || this.y === 49;
	},
	configurable: true,
});

Object.defineProperty(RoomPosition.prototype, "isVisible", {
	get: function (this: RoomPosition) {
		return Game.rooms[this.roomName] != undefined;
	},
	configurable: true,
});

Object.defineProperty(RoomPosition.prototype, "rangeToEdge", {
	get: function (this: RoomPosition) {
		return _.min([this.x, 49 - this.x, this.y, 49 - this.y]);
	},
	configurable: true,
});

Object.defineProperty(RoomPosition.prototype, "roomCoords", {
	get: function (this: RoomPosition) {
		const parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(this.roomName);
		let x = parseInt(parsed![1], 10);
		let y = parseInt(parsed![2], 10);
		if (this.roomName.includes("W")) {
			x = -x;
		}
		if (this.roomName.includes("N")) {
			y = -y;
		}
		return { x: x, y: y } as Coord;
	},
	configurable: true,
});

Object.defineProperty(RoomPosition.prototype, "neighbors", {
	get: function (this: RoomPosition) {
		const adjPos: RoomPosition[] = [];
		for (const dx of [-1, 0, 1]) {
			for (const dy of [-1, 0, 1]) {
				if (!(dx == 0 && dy == 0)) {
					const x = this.x + dx;
					const y = this.y + dy;
					if (0 < x && x < 49 && 0 < y && y < 49) {
						adjPos.push(new RoomPosition(x, y, this.roomName));
					}
				}
			}
		}
		return adjPos;
	},
	configurable: true,
});

let lastSitePlacedFullTick: number | undefined;
// eslint-disable-next-line @typescript-eslint/unbound-method
const _createConstructionSite = RoomPosition.prototype.createConstructionSite;
RoomPosition.prototype.createConstructionSite = function (
	this: RoomPosition,
	structureType: BuildableStructureConstant,
	name?: string
) {
	if (lastSitePlacedFullTick === Game.time) {
		return ERR_FULL;
	}
	// @ts-expect-error function wrapping
	const result = _createConstructionSite.call(this, structureType, name);
	if (result === ERR_FULL) {
		// For some reason, when you place a construction site, the last check they run to see if
		// you're already at max placed sites searches through EVERY SINGLE GAME OBJECT you have
		// access to, which is quite expensive! Don't try to make a bunch more of these or you'll
		// murder your CPU.
		if (lastSitePlacedFullTick !== Game.time) {
			log.warning(
				`RoomPosition.createConstructionSite: ERR_FULL triggered, disabling construction for tick ${Game.time}`
			);
		}
		lastSitePlacedFullTick = Game.time;
	}
	return result;
};

RoomPosition.prototype.inRangeToPos = function (
	this: RoomPosition,
	pos: RoomPosition,
	range: number
): boolean {
	return (
		this.roomName === pos.roomName &&
		(pos.x - this.x < 0 ? this.x - pos.x : pos.x - this.x) <= range &&
		(pos.y - this.y < 0 ? this.y - pos.y : pos.y - this.y) <= range
	);
};

RoomPosition.prototype.inRangeToXY = function (
	this: RoomPosition,
	x: number,
	y: number,
	range: number
) {
	return (
		(x - this.x < 0 ? this.x - x : x - this.x) <= range &&
		(y - this.y < 0 ? this.y - y : y - this.y) <= range
	);
};

RoomPosition.prototype.getRangeToXY = function (
	this: RoomPosition,
	x: number,
	y: number
) {
	return Math.max(
		x - this.x < 0 ? this.x - x : x - this.x,
		y - this.y < 0 ? this.y - y : y - this.y
	);
};

RoomPosition.prototype.getPositionsInRange = function (
	this: RoomPosition,
	range: number,
	includeWalls = false,
	includeEdges = false
): RoomPosition[] {
	const terrain = Game.map.getRoomTerrain(this.roomName);

	const adjPos: RoomPosition[] = [];
	const [xmin, xmax] = includeEdges ? [0, 49] : [1, 48];
	const [ymin, ymax] = includeEdges ? [0, 49] : [1, 48];
	for (let dx = -1 * range; dx <= range; dx++) {
		for (let dy = -1 * range; dy <= range; dy++) {
			const x = this.x + dx;
			const y = this.y + dy;
			if (xmin <= x && x <= xmax && ymin <= y && y <= ymax) {
				if (includeWalls || terrain.get(x, y) !== TERRAIN_MASK_WALL) {
					adjPos.push(new RoomPosition(x, y, this.roomName));
				}
			}
		}
	}
	return adjPos;
};

RoomPosition.prototype.getPositionsAtRange = function (
	this: RoomPosition,
	range: number,
	includeWalls = false,
	includeEdges = false
): RoomPosition[] {
	const terrain = Game.map.getRoomTerrain(this.roomName);
	const adjPos: RoomPosition[] = [];
	const [xmin, xmax] = includeEdges ? [0, 49] : [1, 48];
	const [ymin, ymax] = includeEdges ? [0, 49] : [1, 48];
	for (let dx = -1 * range; dx <= range; dx++) {
		for (let dy = -1 * range; dy <= range; dy++) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) < range) {
				continue;
			}
			const x = this.x + dx;
			const y = this.y + dy;
			if (xmin <= x && x <= xmax && ymin <= y && y <= ymax) {
				if (includeWalls || terrain.get(x, y) !== TERRAIN_MASK_WALL) {
					adjPos.push(new RoomPosition(x, y, this.roomName));
				}
			}
		}
	}
	return adjPos;
};

RoomPosition.prototype.isWalkable = function (
	this: RoomPosition,
	ignoreCreeps = false
): boolean {
	// Is terrain passable?
	if (
		Game.map.getRoomTerrain(this.roomName).get(this.x, this.y) ==
		TERRAIN_MASK_WALL
	) {
		return false;
	}
	if (this.isVisible) {
		// Are there creeps?
		if (ignoreCreeps == false && this.lookFor(LOOK_CREEPS).length > 0) {
			return false;
		}
		// Are there structures?
		if (
			_.filter(
				this.lookFor(LOOK_STRUCTURES),
				(s: Structure) => !s.isWalkable
			).length > 0
		) {
			return false;
		}
	}
	return true;
};

PERMACACHE.positionNeighbors = PERMACACHE.positionNeighbors ?? {};
RoomPosition.prototype.availableNeighbors = function (
	this: RoomPosition,
	ignoreCreeps = false
): RoomPosition[] {
	if (ignoreCreeps) {
		const key = `${this.readableName}`;
		if (!PERMACACHE.positionNeighbors[key]) {
			PERMACACHE.positionNeighbors[key] = this.neighbors.filter((pos) =>
				pos.isWalkable(ignoreCreeps)
			);
		}
		return PERMACACHE.positionNeighbors[key];
	} else {
		return this.neighbors.filter((pos) => pos.isWalkable(ignoreCreeps));
	}
};

RoomPosition.prototype.getPositionAtDirection = function (
	this: RoomPosition,
	direction: DirectionConstant,
	range = 1
): RoomPosition {
	let dx = 0;
	let dy = 0;
	switch (direction) {
		case 1:
			dy = -range;
			break;
		case 2:
			dy = -range;
			dx = range;
			break;
		case 3:
			dx = range;
			break;
		case 4:
			dx = range;
			dy = range;
			break;
		case 5:
			dy = range;
			break;
		case 6:
			dy = range;
			dx = -range;
			break;
		case 7:
			dx = -range;
			break;
		case 8:
			dx = -range;
			dy = -range;
			break;
	}
	return this.getOffsetPos(dx, dy);
};

// Object.defineProperty(RoomPosition.prototype, 'availableAdjacentSpots', {
// 	get: function () {
// 		if (this.isVisible) {
// 			let spots: RoomPosition[] = [];
// 			for (let spot of this.adjacentSpots) {
// 				let structures = this.look;
// 				if (Game.map.getTerrainAt(neighbor) != 'wall') {
// 					// Doesn't include constructed walls
// 					spots.push(neighbor);
// 				}
// 			}
// 			return spots;
// 		} else {
// 			return this.adjacentSpots; // Assume there's nothing there
// 		}
// 	}
// });

RoomPosition.prototype.getMultiRoomRangeTo = function (
	this: RoomPosition,
	pos: RoomPosition
): number {
	if (this.roomName == pos.roomName) {
		return this.getRangeTo(pos);
	} else {
		const from = this.roomCoords;
		const to = pos.roomCoords;
		const dx = Math.abs(50 * (to.x - from.x) + pos.x - this.x);
		const dy = Math.abs(50 * (to.y - from.y) + pos.y - this.y);
		return _.max([dx, dy]);
	}
};

RoomPosition.prototype.findClosestByLimitedRange = function <
	T extends _HasRoomPosition | RoomPosition,
>(
	this: RoomPosition,
	objects: T[],
	rangeLimit: number,
	opts?: FindOptions<T>
): T | undefined {
	const objectsInRange = this.findInRange<T>(objects, rangeLimit, opts);
	return this.findClosestByRange(objectsInRange, opts) ?? undefined;
};

RoomPosition.prototype.findClosestByMultiRoomRange = function <
	T extends _HasRoomPosition,
>(this: RoomPosition, objects: T[]): T | undefined {
	return minBy(objects, (obj: T) => this.getMultiRoomRangeTo(obj.pos));
};

// This should only be used within a single room
RoomPosition.prototype.findClosestByRangeThenPath = function <
	T extends _HasRoomPosition,
>(this: RoomPosition, objects: T[]): T | undefined {
	const distances = _.map(objects, (obj) => this.getRangeTo(obj));
	const minDistance = _.min(distances);
	if (minDistance > 4) {
		return this.findClosestByRange(objects) ?? undefined;
	} else {
		const closestObjects = _.filter(
			objects,
			(obj) => this.getRangeTo(obj) == minDistance
		);
		// don't clutter up pathing.distance cached values
		return this.findClosestByPath(closestObjects) ?? undefined;
	}
};
