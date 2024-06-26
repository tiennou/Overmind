import { PERMACACHE } from "caching/PermaCache";
import { profile } from "../profiler/decorator";
import { getCacheExpiration } from "./utils";

export const ROOMTYPE_SOURCEKEEPER = "SK";
export const ROOMTYPE_CORE = "CORE";
export const ROOMTYPE_CONTROLLER = "CTRL";
export const ROOMTYPE_ALLEY = "ALLEY";
export const ROOMTYPE_CROSSROAD = "CROSSROAD";

export type RoomType = "SK" | "CORE" | "CTRL" | "ALLEY" | "CROSSROAD";

PERMACACHE.cartographerRoomTypes = PERMACACHE.cartographerRoomTypes || {};
PERMACACHE.tunnelLocations = PERMACACHE.tunnelLocations || {};

/**
 * Cartographer: provides helper methods related to Game.map. A few of these methods have been modified from BonzAI
 * codebase, although I have introduced new methods of my own over time as well.
 */
@profile
export class Cartographer {
	/**
	 * Lists all rooms up to and including a given distance away, including roomName
	 */
	static findRoomsInRange(roomName: string, depth: number): string[] {
		return _.flatten(_.values(this.recursiveRoomSearch(roomName, depth)));
	}

	/**
	 * Lists all rooms at exactly a given distance away, including roomName
	 */
	static findRoomsAtRange(roomName: string, depth: number): string[] {
		return this.recursiveRoomSearch(roomName, depth)[depth];
	}

	/**
	 * Recursively enumerate all rooms from a root node using depth first search to a maximum depth
	 */
	static recursiveRoomSearch(
		roomName: string,
		maxDepth: number
	): { [depth: number]: string[] } {
		const visitedRooms = this._recursiveRoomSearch(
			roomName,
			0,
			maxDepth,
			{}
		);
		const roomDepths: { [depth: number]: string[] } = {};
		for (const room in visitedRooms) {
			const depth = visitedRooms[room];
			if (!roomDepths[depth]) {
				roomDepths[depth] = [];
			}
			roomDepths[depth].push(room);
		}
		return roomDepths;
	}

	/**
	 * The recursive part of recursiveRoomSearch. Yields inverted results mapping roomName to depth.
	 */
	private static _recursiveRoomSearch(
		roomName: string,
		depth: number,
		maxDepth: number,
		visited: { [roomName: string]: number }
	): { [roomName: string]: number } {
		if (visited[roomName] == undefined) {
			visited[roomName] = depth;
		} else {
			visited[roomName] = Math.min(depth, visited[roomName]);
		}
		const neighbors = _.values<string>(Game.map.describeExits(roomName));
		if (depth < maxDepth) {
			for (const neighbor of neighbors) {
				// Visit the neighbor if not already done or if this would be a more direct route
				if (
					visited[neighbor] == undefined ||
					depth + 1 < visited[neighbor]
				) {
					this._recursiveRoomSearch(
						neighbor,
						depth + 1,
						maxDepth,
						visited
					);
				}
			}
		}
		return visited;
	}

	/**
	 * Get the type of the room
	 */
	static roomType(roomName: string): RoomType {
		if (!PERMACACHE.cartographerRoomTypes[roomName]) {
			let roomType: RoomType;
			const coords = Cartographer.getRoomCoordinates(roomName);
			if (coords.x % 10 === 0 && coords.y % 10 === 0) {
				roomType = ROOMTYPE_CROSSROAD;
			} else if (coords.x % 10 === 0 || coords.y % 10 === 0) {
				roomType = ROOMTYPE_ALLEY;
			} else if (
				coords.x % 10 != 0 &&
				coords.x % 5 === 0 &&
				coords.y % 10 != 0 &&
				coords.y % 5 === 0
			) {
				roomType = ROOMTYPE_CORE;
			} else if (
				coords.x % 10 <= 6 &&
				coords.x % 10 >= 4 &&
				coords.y % 10 <= 6 &&
				coords.y % 10 >= 4
			) {
				roomType = ROOMTYPE_SOURCEKEEPER;
			} else {
				roomType = ROOMTYPE_CONTROLLER;
			}
			PERMACACHE.cartographerRoomTypes[roomName] = roomType;
		}
		return PERMACACHE.cartographerRoomTypes[roomName];
	}

	/**
	 * Get the name of a room offset from the anchor room
	 */
	static findRelativeRoomName(
		roomName: string,
		xDelta: number,
		yDelta: number
	): string {
		const coords = this.getRoomCoordinates(roomName);
		let xDir = coords.xDir;
		if (xDir === "W") {
			xDelta = -xDelta;
		}
		let yDir = coords.yDir;
		if (yDir === "N") {
			yDelta = -yDelta;
		}
		let x = coords.x + xDelta;
		let y = coords.y + yDelta;
		if (x < 0) {
			x = Math.abs(x) - 1;
			xDir = this.oppositeDir(xDir);
		}
		if (y < 0) {
			// noinspection JSSuspiciousNameCombination
			y = Math.abs(y) - 1;
			yDir = this.oppositeDir(yDir);
		}

		return xDir + x + yDir + y;
	}

	/**
	 * Find the relative x and y offsets of two rooms
	 */
	static findRoomCoordDeltas(
		origin: string,
		otherRoom: string
	): { x: number; y: number } {
		const originCoords = this.getRoomCoordinates(origin);
		const otherCoords = this.getRoomCoordinates(otherRoom);

		let xDelta = otherCoords.x - originCoords.x;
		if (originCoords.xDir !== otherCoords.xDir) {
			xDelta = otherCoords.x + originCoords.x + 1;
		}

		let yDelta = otherCoords.y - originCoords.y;
		if (originCoords.yDir !== otherCoords.yDir) {
			yDelta = otherCoords.y + originCoords.y + 1;
		}

		// normalize direction
		if (originCoords.xDir === "W") {
			xDelta = -xDelta;
		}
		if (originCoords.yDir === "N") {
			yDelta = -yDelta;
		}

		return { x: xDelta, y: yDelta };
	}

	/**
	 * Returns the direction (not magnitude) of a room from an origin room
	 */
	static findRelativeRoomDir(origin: string, otherRoom: string): number {
		const coordDeltas = this.findRoomCoordDeltas(origin, otherRoom);
		// noinspection JSSuspiciousNameCombination
		if (Math.abs(coordDeltas.x) == Math.abs(coordDeltas.y)) {
			if (coordDeltas.x > 0) {
				if (coordDeltas.y > 0) {
					return 2;
				} else {
					return 4;
				}
			} else if (coordDeltas.x < 0) {
				if (coordDeltas.y > 0) {
					return 8;
				} else {
					return 6;
				}
			} else {
				return 0;
			}
		} else {
			// noinspection JSSuspiciousNameCombination
			if (Math.abs(coordDeltas.x) > Math.abs(coordDeltas.y)) {
				if (coordDeltas.x > 0) {
					return 3;
				} else {
					return 7;
				}
			} else {
				if (coordDeltas.y > 0) {
					return 1;
				} else {
					return 5;
				}
			}
		}
	}

	/**
	 * Return the opposite direction, e.g. "W" => "E"
	 */
	static oppositeDir(dir: string): string {
		switch (dir) {
			case "W":
				return "E";
			case "E":
				return "W";
			case "N":
				return "S";
			case "S":
				return "N";
			default:
				return "error";
		}
	}

	/**
	 * Get the coordinates from a room name
	 */
	static getRoomCoordinates(roomName: string): RoomCoord {
		const coordinateRegex = /(E|W)(\d+)(N|S)(\d+)/g;
		const match = coordinateRegex.exec(roomName)!;

		const xDir = match[1];
		const x = match[2];
		const yDir = match[3];
		const y = match[4];

		return {
			x: Number(x),
			y: Number(y),
			xDir: xDir,
			yDir: yDir,
		};
	}

	// static isNoviceRoom(roomName: string): boolean {
	// 	if (Memory.zoneRooms) {
	// 		const roomInfo = Memory.zoneRooms[roomName];
	// 		return !!roomInfo && !!roomInfo.novice;
	// 	} else {
	// 		log.alert(`Checking novice room before segment is set in ${roomName}!`);
	// 		return false;
	// 	}
	// }
	//
	// static isRespawnRoom(roomName: string): boolean {
	// 	if (Memory.zoneRooms) {
	// 		const roomInfo = Memory.zoneRooms[roomName];
	// 		return !!roomInfo && !!roomInfo.respawnArea;
	// 	} else {
	// 		log.alert(`Checking respawn room before segment is set in ${roomName}!`);
	// 		return false;
	// 	}
	// }

	/**
	 * Returns a room's available exits
	 *
	 * Compared to {@link Game.map.describeExits}, this method won't return
	 * exits to rooms that are outside of the world's boundaries.
	 *
	 * @param roomName The room name to check
	 * @returns
	 */
	static describeExits(roomName: string) {
		const exits = Game.map.describeExits(roomName);
		if (!exits) {
			return {};
		}
		const radius = Math.ceil(Game.map.getWorldSize() / 2) - 1;
		const coord = this.getRoomCoordinates(roomName);
		if (coord.x >= radius) {
			const xDirToMoveDir = coord.xDir === "W" ? 7 : 3;
			delete exits[xDirToMoveDir];
		}
		if (coord.y >= radius) {
			const yDirToMoveDir = coord.xDir === "N" ? 1 : 5;
			delete exits[yDirToMoveDir];
		}
		return exits;
	}

	static tunnelLocations(roomName: string): RoomPosition[] {
		const room = Game.rooms[roomName];
		if (
			room &&
			(!PERMACACHE.tunnelLocations[roomName] ||
				PERMACACHE.tunnelLocations[roomName].expiration < Game.time)
		) {
			// eslint-disable-next-line
			const tunnels = [];
			for (const road of room.roads) {
				if (road.pos.lookFor(LOOK_TERRAIN).includes("wall")) {
					tunnels.push(road.pos);
				}
			}

			PERMACACHE.tunnelLocations[roomName] = {
				expiration: getCacheExpiration(100),
				tunnels,
			};
		}
		return PERMACACHE.tunnelLocations[roomName]?.tunnels ?? [];
	}
}

// Register on global for debugging
global.Cartographer = Cartographer;
