import { errorForCode } from "utilities/errors";
import { $ } from "../caching/GlobalCache";
import { Colony, DEFCON, getAllColonies } from "../Colony";
import { log } from "../console/log";
import { Mem } from "../memory/Memory";
import { Pathing } from "movement/Pathing";
import { MatrixTypes } from "movement/types";
import { profile } from "../profiler/decorator";
import {
	packCoord,
	packCoordList,
	unpackCoordListAsPosList,
} from "../utilities/packrat";
import {
	derefRoomPosition,
	getCacheExpiration,
	onPublicServer,
	posFromReadableName,
} from "../utilities/utils";
import { Visualizer } from "../visuals/Visualizer";
import { RoomPlanner } from "./RoomPlanner";

export interface RoadPlannerMemory {
	roadCoordsPacked: { [roomName: string]: string };
	// roadLookup: { [roomName: string]: { [roadCoordName: string]: boolean } };
	roadCoverage: number;
	roadCoverages: {
		[destination: string]: {
			roadCount: number;
			length: number;
			exp: number;
		};
	};
}

const ROAD_PLANNER_PLAIN_COST = 3;
const ROAD_PLANNER_SWAMP_COST = 4;
const ROAD_PLANNER_TUNNEL_COST = 15 * ROAD_PLANNER_PLAIN_COST;
const EXISTING_PATH_COST = ROAD_PLANNER_PLAIN_COST - 1;

const getDefaultRoadPlannerMemory: () => RoadPlannerMemory = () => ({
	roadCoordsPacked: {},
	roadCoverage: 0.0,
	roadCoverages: {},
});

@profile
export class RoadPlanner {
	private roomPlanner: RoomPlanner;
	private colony: Colony;
	private memory: RoadPlannerMemory;
	private roadPositions: RoomPosition[];
	private costMatrices: { [roomName: string]: CostMatrix };
	private _roadLookup: ((pos: RoomPosition) => boolean) | undefined;

	static settings = {
		encourageRoadMerging: true,
		/** recalculate road networks this often */
		recalculateRoadNetworkInterval: onPublicServer() ? 1000 : 250,
		/** recompute coverage to each destination this often */
		recomputeCoverageInterval: onPublicServer() ? 1000 : 500,
		buildRoadsAtRCL: 4,
	};

	constructor(roomPlanner: RoomPlanner) {
		this.roomPlanner = roomPlanner;
		this.colony = roomPlanner.colony;
		this.memory = Mem.wrap(
			this.colony.memory,
			"roadPlanner",
			getDefaultRoadPlannerMemory
		);
		this.costMatrices = {};
		this.roadPositions = [];
	}

	refresh(): void {
		this.memory = Mem.wrap(
			this.colony.memory,
			"roadPlanner",
			getDefaultRoadPlannerMemory
		);
		this.costMatrices = {};
		this.roadPositions = [];
	}

	get roadCoverage(): number {
		return this.memory.roadCoverage;
	}

	private recomputeRoadCoverages(
		storagePos: RoomPosition,
		ignoreInactiveRooms = true
	) {
		// Compute coverage for each path
		for (const destination of this.colony.destinations.values()) {
			const destName = destination.pos.readableName;

			if (!!this.memory.roadCoordsPacked[destination.pos.roomName]) {
				if (
					!this.memory.roadCoverages[destName] ||
					Game.time > this.memory.roadCoverages[destName].exp
				) {
					const roadCoverage = this.computeRoadCoverage(
						storagePos,
						destination.pos
					);

					if (roadCoverage != undefined) {
						// Set expiration to be longer if road is nearly complete
						const expiration =
							(
								roadCoverage.roadCount / roadCoverage.length >=
								0.75
							) ?
								getCacheExpiration(
									RoadPlanner.settings
										.recomputeCoverageInterval
								)
							:	getCacheExpiration(
									3 *
										RoadPlanner.settings
											.recomputeCoverageInterval
								);
						this.memory.roadCoverages[destName] = {
							roadCount: roadCoverage.roadCount,
							length: roadCoverage.length,
							exp: expiration,
						};
					} else {
						if (this.memory.roadCoverages[destName]) {
							// if you already have some data, use it for a little while
							const waitTime = onPublicServer() ? 500 : 200;
							this.memory.roadCoverages[destName].exp += waitTime;
						} else {
							// otherwise put in a placeholder
							const waitTime = onPublicServer() ? 300 : 100;
							this.memory.roadCoverages[destName] = {
								roadCount: 0,
								length: 1,
								exp: Game.time + waitTime,
							};
						}
					}

					log.debug(
						`Recomputing road coverage from ${storagePos.print} to ${destination.pos.print}... ` +
							`Coverage: ${JSON.stringify(roadCoverage)}`
					);
				}
			}
		}
		// Store the aggregate roadCoverage score
		let totalRoadCount = 0;
		let totalPathLength = 0;
		for (const destName in this.memory.roadCoverages) {
			const destPos = posFromReadableName(destName)!;
			if (
				ignoreInactiveRooms &&
				!this.colony.isRoomActive(destPos.roomName)
			) {
				continue;
			}
			const { roadCount, length } = this.memory.roadCoverages[destName];
			totalRoadCount += roadCount;
			totalPathLength += length;
		}
		this.memory.roadCoverage = totalRoadCount / totalPathLength;
	}

	private computeRoadCoverage(
		storagePos: RoomPosition,
		destination: RoomPosition
	): { roadCount: number; length: number } | undefined {
		const ret = Pathing.findPath(storagePos, destination, {
			terrainCosts: { plainCost: 2, swampCost: 10 },
		});
		const path = ret.path;
		const roomNames = _.unique(_.map(path, (pos) => pos.roomName));
		// If you have vision or cached vision of the room
		if (
			_.all(
				roomNames,
				(roomName) =>
					Game.rooms[roomName] ||
					$.costMatrixRecall(roomName, MatrixTypes.default)
			)
		) {
			let roadCount = 0;
			for (const pos of path) {
				if (Game.rooms[pos.roomName]) {
					if (pos.lookForStructure(STRUCTURE_ROAD)) {
						roadCount++;
					}
				} else {
					const mat = $.costMatrixRecall(
						pos.roomName,
						MatrixTypes.default
					);
					if (mat) {
						if (mat.get(pos.x, pos.y) == 1) {
							roadCount++;
						}
					} else {
						// shouldn't happen
						log.warning(
							`No vision or recalled cost matrix in room ${pos.roomName}! (Why?)`
						);
					}
				}
			}
			return { roadCount: roadCount, length: path.length };
		}
	}

	private recalculateRoadNetwork(
		storagePos: RoomPosition,
		obstacles: RoomPosition[]
	): void {
		this.buildRoadNetwork(storagePos, obstacles);
		this.finalize();
	}

	// Connect commandCenter to hatchery, upgradeSites, and all miningSites, and place containers
	private buildRoadNetwork(
		storagePos: RoomPosition,
		obstacles: RoomPosition[]
	): void {
		this.costMatrices = {};
		this.roadPositions = [];
		const destinations = _.sortBy(
			[...this.colony.destinations.values()],
			(destination) => destination.order
		);
		// Connect commandCenter to each destination in colony
		for (const destination of destinations) {
			this.planRoad(storagePos, destination.pos, obstacles);
		}
		this.formatRoadPositions();
	}

	// Plan a road between two locations avoiding a list of planned obstacles; pos1 should be storage for best results
	private planRoad(
		pos1: RoomPosition,
		pos2: RoomPosition,
		obstacles: RoomPosition[]
	): void {
		// Find the shortest path, preferentially stepping on tiles with road routing flags on them
		const roadPath = this.generateRoadPath(pos1, pos2, obstacles);
		if (roadPath) {
			this.roadPositions = this.roadPositions.concat(roadPath);
		}
	}

	private generateRoadPlanningCostMatrix(
		roomName: string,
		obstacles: RoomPosition[]
	): CostMatrix {
		const matrix = new PathFinder.CostMatrix();
		const terrain = Game.map.getRoomTerrain(roomName);

		for (let y = 0; y < 50; ++y) {
			for (let x = 0; x < 50; ++x) {
				switch (terrain.get(x, y)) {
					case TERRAIN_MASK_SWAMP:
						matrix.set(x, y, ROAD_PLANNER_SWAMP_COST);
						break;
					case TERRAIN_MASK_WALL:
						if (x != 0 && y != 0 && x != 49 && y != 49) {
							// Can't tunnel through walls on edge tiles
							matrix.set(x, y, ROAD_PLANNER_TUNNEL_COST);
						}
						break;
					default: // plain
						matrix.set(x, y, ROAD_PLANNER_PLAIN_COST);
						break;
				}
			}
		}

		for (const pos of obstacles) {
			if (pos.roomName == roomName) {
				matrix.set(pos.x, pos.y, 0xff);
			}
		}

		const room = Game.rooms[roomName];
		if (room) {
			// Mark unpassable structures & construction sites
			for (const structure of [
				...room.structures,
				...room.constructionSites,
			]) {
				if (structure.isWalkable) {
					continue;
				}
				matrix.set(structure.pos.x, structure.pos.y, 0xff);
			}

			// If we generating a new path, ensure the current roads are reused
			if (RoadPlanner.settings.encourageRoadMerging) {
				const roads = room.find<StructureRoad>(FIND_STRUCTURES, {
					filter: { structureType: STRUCTURE_ROAD },
				});
				for (const road of roads) {
					// Only reuse roads that should already be there
					if (matrix.get(road.pos.x, road.pos.y) === 0xff) {
						continue;
					}
					matrix.set(road.pos.x, road.pos.y, EXISTING_PATH_COST);
				}
			}
		}

		return matrix;
	}

	/* Generates a road path and modifies cost matrices to encourage merging with future roads */
	private generateRoadPath(
		origin: RoomPosition,
		destination: RoomPosition,
		obstacles: RoomPosition[]
	): RoomPosition[] | undefined {
		const roomCallback = (roomName: string): CostMatrix | boolean => {
			if (!this.colony.roomNames.includes(roomName)) {
				// only route through colony rooms
				return false;
			}
			if (
				RoomIntel.isConsideredHostile(roomName) &&
				roomName != origin.roomName &&
				roomName != destination.roomName
			) {
				return false;
			}
			if (!this.costMatrices[roomName]) {
				this.costMatrices[roomName] =
					this.generateRoadPlanningCostMatrix(roomName, obstacles);
			}
			return this.costMatrices[roomName];
		};

		const maxOps = 40000;
		const ret = PathFinder.search(
			origin,
			{ pos: destination, range: 1 },
			{ roomCallback, maxOps }
		);

		if (ret.incomplete) {
			log.warning(
				`Roadplanner for ${this.colony.print}: could not plan road path!`
			);
			log.info(
				`Road: ${origin.print} -> ${destination.print}, ops: ${
					ret.ops
				}/${maxOps}, length: ${ret.path.length}, end: ${ret.path[
					ret.path.length - 1
				]?.print}`
			);
			return;
		}

		// Reduce the cost of planned paths to encourage road overlap for future pathing
		if (RoadPlanner.settings.encourageRoadMerging) {
			for (const i of _.range(ret.path.length)) {
				const pos = ret.path[i];
				if (
					i % 2 == 0 &&
					this.costMatrices[pos.roomName] &&
					!pos.isEdge
				) {
					this.costMatrices[pos.roomName].set(
						pos.x,
						pos.y,
						EXISTING_PATH_COST
					);
				}
			}
		}
		// Return the pathfinder results
		return ret.path;
	}

	/* Ensure that the roads doesn't overlap with roads from this.map and that the positions are unique */
	private formatRoadPositions(): void {
		// Make road position list unique
		this.roadPositions = _.unique(this.roadPositions);
		// Remove roads located on exit tiles
		_.remove(this.roadPositions, (pos) => pos.isEdge);
		// Remove any roads duplicated in this.map
		const roomPlannerRoads =
			this.roomPlanner.plannedStructurePositions(STRUCTURE_ROAD);
		if (roomPlannerRoads != undefined) {
			_.remove(this.roadPositions, (pos) =>
				roomPlannerRoads.includes(pos)
			);
		}
	}

	/* Write everything to memory after roomPlanner is closed */
	finalize(): void {
		// Collect all roads from this and from room planner
		let roomPlannerRoads: RoomPosition[];
		if (_.keys(this.roomPlanner.map).length > 0) {
			// use active map
			roomPlannerRoads = this.roomPlanner.map[STRUCTURE_ROAD];
		} else {
			// retrieve from memory
			if (
				this.roomPlanner.memory.bunkerData &&
				this.roomPlanner.memory.bunkerData.anchor
			) {
				const layout = this.roomPlanner.getStructureMapForBunkerAt(
					this.roomPlanner.memory.bunkerData.anchor
				);
				roomPlannerRoads = layout[STRUCTURE_ROAD];
			} else if (this.roomPlanner.memory.mapsByLevel) {
				roomPlannerRoads = _.map(
					this.roomPlanner.memory.mapsByLevel[8][STRUCTURE_ROAD],
					(protoPos) => derefRoomPosition(protoPos)
				);
			} else {
				log.error(
					`RoadPlanner@${this.colony.room.print}: could not get road positions from room planner!`
				);
				roomPlannerRoads = [];
			}
		}
		const allRoadPos: RoomPosition[] = _.compact(
			this.roadPositions.concat(roomPlannerRoads)
		);
		const allRoadPosByRoomName = _.groupBy(
			allRoadPos,
			(pos) => pos.roomName
		);
		this.memory.roadCoordsPacked = {};
		for (const roomName in allRoadPosByRoomName) {
			this.memory.roadCoordsPacked[roomName] = packCoordList(
				allRoadPosByRoomName[roomName]
			);
		}
	}

	init(): void {}

	static shouldBuild(
		structureType: BuildableStructureConstant,
		pos: RoomPosition
	): boolean {
		if (!pos.room) {
			return false;
		}
		const buildings = _.filter(
			pos.lookFor(LOOK_STRUCTURES),
			(s) => s && s.structureType == structureType
		);
		const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
		if (!buildings || buildings.length == 0) {
			if (!sites || sites.length == 0) {
				return true;
			}
		}
		return false;
	}

	/* Create construction sites for any buildings that need to be built */
	private buildMissing(): void {
		// Max buildings that can be placed each tick
		let count =
			RoomPlanner.settings.maxSitesPerColony -
			this.colony.constructionSites.length;
		// Build missing roads
		let roadPositions: RoomPosition[] = [];
		for (const roomName in this.memory.roadCoordsPacked) {
			roadPositions = roadPositions.concat(
				unpackCoordListAsPosList(
					this.memory.roadCoordsPacked[roomName],
					roomName
				)
			);
		}
		const origin = (
			this.colony.storage ||
			this.colony.hatchery ||
			this.colony
		).pos;
		roadPositions = _.sortBy(roadPositions, (pos) =>
			pos.getMultiRoomRangeTo(origin)
		);
		let needsRoad = false;
		const forbiddenRooms = new Set();
		for (const pos of roadPositions) {
			// Skip if we don't have visibility or we went through our quota
			if (!pos.room || forbiddenRooms.has(pos.roomName)) {
				continue;
			}
			if (count <= 0) {
				break;
			}
			const road =
				pos.lookForStructure(STRUCTURE_ROAD) ||
				pos
					.lookFor(LOOK_CONSTRUCTION_SITES)
					.some((s) => s.structureType === STRUCTURE_ROAD);
			if (!road) {
				needsRoad = true;
				const ret = pos.createConstructionSite(STRUCTURE_ROAD);
				if (ret === OK) {
					count--;
					continue;
				}
				log.warning(
					`${this.colony.print}: couldn't create road site at ${
						pos.print
					}: (${errorForCode(ret)})`
				);
				if (ret == ERR_NOT_OWNER) {
					forbiddenRooms.add(pos.roomName);
				} else if (ret == ERR_FULL) {
					break;
				}
			}
		}
		if (needsRoad) {
			this.roomPlanner.requestRecheck(100);
		}
	}

	/**
	 * Quick lookup for if a road should be in this position. Roads returning false won't be maintained.
	 */
	roadShouldBeHere(pos: RoomPosition): boolean {
		if (this._roadLookup == undefined) {
			this._roadLookup = _.memoize((p: RoomPosition) =>
				(this.memory.roadCoordsPacked[p.roomName] || "").includes(
					packCoord(p)
				)
			);
		}
		return this._roadLookup(pos);
	}

	/**
	 * Enumerate the positions in a room which should have roads on them
	 */
	getRoadPositions(roomName: string): RoomPosition[] {
		if (this.memory.roadCoordsPacked[roomName]) {
			return unpackCoordListAsPosList(
				this.memory.roadCoordsPacked[roomName],
				roomName
			);
		} else {
			return [];
		}
	}

	/* Clean up leftover road coverage locations from remotes that aren't mined or old structures */
	private cleanRoadCoverage() {
		const colonyDestinations = [...this.colony.destinations.values()].map(
			(dest) => dest.pos.readableName
		);
		log.debug(
			`Colony ${this.colony.print} has destinations of ${JSON.stringify(
				colonyDestinations
			)}`
		);

		for (const roadCoverageKey of Object.keys(this.memory.roadCoverages)) {
			// console.log(`Colony ${this.colony.name} Road coverage of ${roadCoverageKey}`);
			if (colonyDestinations.includes(roadCoverageKey)) {
				// console.log(`Colony has destination of ${roadCoverageKey}`);
			} else {
				log.warning(
					`Colony does not have destination of ${roadCoverageKey}, deleting.`
				);
				delete this.memory.roadCoverages[roadCoverageKey];
			}
		}
	}

	run(): void {
		if (this.roomPlanner.active || this.roomPlanner.visualize) {
			if (this.roomPlanner.storagePos) {
				this.buildRoadNetwork(
					this.roomPlanner.storagePos,
					this.roomPlanner.getObstacles()
				);
			}
			this.visuals();
		} else if (this.colony.defcon === DEFCON.safe) {
			// Once in a blue moon, recalculate the entire network and write to memory to keep it up to date
			if (
				Game.time %
					RoadPlanner.settings.recalculateRoadNetworkInterval ==
				this.colony.id
			) {
				if (this.roomPlanner.storagePos) {
					this.cleanRoadCoverage();
					this.recalculateRoadNetwork(
						this.roomPlanner.storagePos,
						this.roomPlanner.getObstacles()
					);
				}
			}
			// Recompute coverage to destinations
			if (
				Game.time % getAllColonies().length == this.colony.id &&
				this.roomPlanner.storagePos
			) {
				this.recomputeRoadCoverages(this.roomPlanner.storagePos);
			}
			// Build missing roads
			if (
				this.colony.level >= RoadPlanner.settings.buildRoadsAtRCL &&
				this.roomPlanner.shouldRecheck(3)
			) {
				this.buildMissing();
			}
		}
	}

	visuals(): void {
		// Draw the map
		Visualizer.drawRoads(this.roadPositions);
	}
}
