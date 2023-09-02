import {MoveOptions} from 'movement/Movement';
import {Colony} from '../../Colony';
import {Roles, Setups} from '../../creepSetups/setups';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';
import { Cartographer } from 'utilities/Cartographer';

const DEFAULT_NUM_SCOUTS = 2;

/**
 * Sends out scouts which randomly traverse rooms to uncover possible expansion locations and gather intel
 */
@profile
export class RandomWalkerScoutOverlord extends Overlord {

	scouts: Zerg[];

	constructor(colony: Colony, priority = OverlordPriority.scouting.randomWalker) {
		super(colony, 'scout', priority);
		this.scouts = this.zerg(Roles.scout, {notifyWhenAttacked: false});
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

		const roomStatus = RoomIntel.getRoomStatus(scout.room.name);

		// Check all the room's exits + portals
		let neighboringRooms = _.values<string>(Cartographer.describeExits(scout.pos.roomName));
		neighboringRooms = neighboringRooms.filter(room => RoomIntel.getRoomStatus(room).status === roomStatus.status);

		const intrashardPortals = scout.room.portals.filter(portal => portal.destination instanceof RoomPosition);
		neighboringRooms = neighboringRooms.concat(intrashardPortals.map(portal => (<RoomPosition>portal.destination).roomName));
		neighboringRooms = neighboringRooms.filter(room => !RoomIntel.isConsideredHostile(room));

		// Sort by last visible tick so we prioritize going to places that need to be refreshed
		neighboringRooms = neighboringRooms.sort((a, b) => RoomIntel.lastVisible(a) - RoomIntel.lastVisible(b));

		this.debug(`${scout.print}: available rooms: ${neighboringRooms}`);

		let neighboringRoom: string | undefined;
		while ((neighboringRoom = neighboringRooms.shift())) {
			// Filter out any rooms we might have sent another scout to
			if (this.scouts.some(scout => scout.task?.targetPos.roomName === neighboringRoom)) continue;

			this.debug(`${scout.print}: moving to ${neighboringRoom}`)
			scout.task = Tasks.goToRoom(neighboringRoom, { moveOptions });
			break;
		}

		// Just move back to the colony and start over
		if (!scout.task) {
			this.debug(`${scout.print}: no task, moving back to ${this.colony.print}`);
			scout.task = Tasks.goToRoom(this.colony.room.name, { moveOptions });
		}
	}

	run() {
		this.autoRun(this.scouts, scout => this.handleScout(scout));
	}
}
