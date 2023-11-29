import { MoveOptions } from "movement/Movement";
import { Colony } from "../../Colony";
import { Roles, Setups } from "../../creepSetups/setups";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { Tasks } from "../../tasks/Tasks";
import { Zerg } from "../../zerg/Zerg";
import { Overlord } from "../Overlord";
import { Cartographer } from "utilities/Cartographer";
import { PortalInfo, RoomExitData } from "intel/RoomIntel";
import columnify from "columnify";

const DEFAULT_NUM_SCOUTS = 3;

/**
 * Sends out scouts which randomly traverse rooms to uncover possible expansion locations and gather intel
 */
@profile
export class RandomWalkerScoutOverlord extends Overlord {
	scouts: Zerg[];
	scoutMap: { [roomName: string]: string[] };

	constructor(
		colony: Colony,
		priority = OverlordPriority.scouting.randomWalker
	) {
		super(colony, "scout", priority);
		this.scouts = this.zerg(Roles.scout, { notifyWhenAttacked: false });
		this.scoutMap = {};
		this.generateScoutMap();
	}

	private generateScoutMap() {
		// A list of rooms to visit, keyed by creep name
		const map: Record<string, string[]> = {};
		// A list of scouts, keyed by starting room name
		const rooms: Record<string, Zerg[]> = {};
		for (const scout of this.scouts) {
			const room = scout.room.name;
			if (rooms[scout.room.name]) {
				this.debug(
					`already built map for ${scout.print} in ${scout.room}`
				);
				// We've already generated this, skip
				rooms[scout.room.name].push(scout);
				continue;
			}
			this.debug(`rebuilding map for ${scout.print} in ${scout.room}`);

			const roomStatus = RoomIntel.getRoomStatus(room);

			const nearbyRooms = Cartographer.recursiveRoomSearch(room, 3);
			let neighboringRooms = _.flatten(_.values<string>(nearbyRooms));
			neighboringRooms = neighboringRooms.filter(
				(room) =>
					RoomIntel.getRoomStatus(room).status ===
						roomStatus.status &&
					!RoomIntel.isConsideredHostile(room)
			);

			this.debug(() => `rooms near ${room}: ${neighboringRooms}`);
			// Check all the room's exits + portals
			const exitData = RoomIntel.describeExits(
				scout.pos.roomName,
				"interOnly"
			);
			// This is a .compact/.filter in one swoop
			const exits = _.values<RoomExitData>(exitData).reduce((s, e) => {
				if (Array.isArray(e)) {
					for (const i of e) {
						s.add(i);
					}
				} else if (e) {
					s.add(e);
				}
				return s;
			}, new Set<string | PortalInfo>());

			this.debug(
				() =>
					`exits from ${room}:\ndata: ${JSON.stringify(
						exitData
					)}\nflat: ${[...exits]}`
			);

			// Sort by nearby exit, then by missing expansion data, then by last visible tick
			// so we prioritize going to places that need to be refreshed
			const sortedRooms = neighboringRooms.sort((a, b) => {
				if (exits.has(a) && exits.has(b)) {
					if (
						RoomIntel.getExpansionData(a) ===
						RoomIntel.getExpansionData(b)
					) {
						return (
							RoomIntel.lastVisible(a) - RoomIntel.lastVisible(b)
						);
					} else if (RoomIntel.getExpansionData(a) === undefined) {
						return -1;
					} else {
						return 1;
					}
				} else if (exits.has(a)) {
					return -1;
				} else {
					return 1;
				}
			});
			this.debug(() => {
				return (
					`map for ${scout.name} in ${room}:\n` +
					columnify(
						sortedRooms.map((name, idx) => {
							return {
								idx,
								name,
								exits: exits.has(name),
								intel:
									(
										RoomIntel.getControllerInfo(name) !==
										undefined
									) ?
										"known"
									:	"unknown",
								exp:
									RoomIntel.getExpansionData(name) ? "known"
									:	"unknown",
								visible: RoomIntel.lastVisible(name),
							};
						})
					)
				);
			});
			map[scout.name] = sortedRooms;
			rooms[scout.room.name] = [scout];
		}

		const competingRooms = Object.entries(rooms).filter(
			([_room, scouts]) => scouts.length > 1
		);
		if (competingRooms.length) {
			for (const [_room, scouts] of competingRooms) {
				// We've got a few scouts which shared a starting location, reset their list and split it out
				const roomList = map[scouts[0].name];
				scouts.forEach((s) => (map[s.name] = []));
				for (let idx = 0; idx < roomList.length; idx++) {
					const name = scouts[idx % scouts.length].name;
					map[name].push(roomList[idx]);
				}
				this.debug(
					() =>
						`scouts ${scouts.map(
							(s) => s.name
						)} were competing, split:\n${scouts.map(
							(s) => `\t${s.name}: ${map[s.name]}\n`
						)}`
				);
			}
		}

		this.scoutMap = map;
	}

	init() {
		this.wishlist(DEFAULT_NUM_SCOUTS, Setups.scout);
	}

	private handleScout(scout: Zerg) {
		// // Stomp on enemy construction sites
		// const enemyConstructionSites = scout.room.find(FIND_HOSTILE_CONSTRUCTION_SITES);
		// if (enemyConstructionSites.length > 0 && enemyConstructionSites[0].pos.isWalkable(true)) {
		// 	scout.goTo(enemyConstructionSites[0].pos);
		// 	return;
		// }

		const moveOptions: MoveOptions = {
			pathOpts: {
				allowHostile: true,
				allowPortals: true,
			},
		};

		// Check if room might be connected to newbie/respawn zone
		// const indestructibleWalls = _.filter(scout.room.walls, wall => wall.hits == undefined);
		// if (indestructibleWalls.length > 0) { // go back to origin colony if you find a room near newbie zone
		// 	this.debug(`${scout.print} detected indestructible walls, moving somewhere else`);
		// 	log.info(`${scout.print} moving back to ${this.colony.print}`)
		// 	scout.task = Tasks.goToRoom(this.colony.room.name, { moveOptions });
		// 	return;
		// }

		if (!this.scoutMap[scout.name]) {
			this.debug(`${scout.print}: scout map outdated, regenerate`);
			this.generateScoutMap();
		}

		this.debug(
			`${scout.print}: available rooms: ${this.scoutMap[scout.name]}`
		);

		let neighboringRoom: string | undefined;
		while ((neighboringRoom = this.scoutMap[scout.name].shift())) {
			// Filter out any rooms we might have sent another scout to
			if (
				this.scouts.some(
					(scout) =>
						scout.task?.targetPos.roomName === neighboringRoom
				)
			) {
				continue;
			}

			this.debug(`${scout.print}: moving to ${neighboringRoom}`);
			scout.task = Tasks.goToRoom(neighboringRoom, { moveOptions });
			break;
		}

		// Just move back to the colony and start over
		if (!scout.task) {
			this.debug(
				`${scout.print}: no task, moving back to ${this.colony.print}`
			);
			scout.task = Tasks.goToRoom(this.colony.room.name, { moveOptions });
		}
	}

	run() {
		this.autoRun(this.scouts, (scout) => this.handleScout(scout));
	}
}
