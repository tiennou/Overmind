import {MoveOptions} from 'movement/Movement';
import {Colony} from '../../Colony';
import {Roles, Setups} from '../../creepSetups/setups';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Tasks} from '../../tasks/Tasks';
import {Zerg} from '../../zerg/Zerg';
import {Overlord} from '../Overlord';

const DEFAULT_NUM_SCOUTS = 3;

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
			},
		};

		// Check if room might be connected to newbie/respawn zone
		const indestructibleWalls = _.filter(scout.room.walls, wall => wall.hits == undefined);
		if (indestructibleWalls.length > 0) { // go back to origin colony if you find a room near newbie zone
			scout.task = Tasks.goToRoom(this.colony.room.name); // todo: make this more precise
			return;
		}

		const roomStatus = Game.map.getRoomStatus(scout.room.name);

		let neighboringRooms = <string[]>_.values(Game.map.describeExits(scout.pos.roomName));
		neighboringRooms = _.shuffle(neighboringRooms);

		// Pick a new random room from the neighboring rooms, making sure they have compatible room status
		let neighboringRoom;
		while ((neighboringRoom = neighboringRooms.shift())) {

			const neighborStatus = Game.map.getRoomStatus(scout.room.name);
			if (roomStatus.status !== neighborStatus.status) {
				continue;
			}

			scout.task = Tasks.goToRoom(neighboringRoom, { moveOptions });
			break;
		}

		// Just move back to the colony and start over
		if (!scout.task) {
			scout.task = Tasks.goToRoom(this.colony.room.name, { moveOptions });
		}
	}

	run() {
		this.autoRun(this.scouts, scout => this.handleScout(scout));
	}
}
