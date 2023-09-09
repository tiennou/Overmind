import {MiningOverlord} from '../../overlords/mining/miner';
import {OverlordPriority} from '../../priorities/priorities_overlords';
import {profile} from '../../profiler/decorator';
import {Cartographer, ROOMTYPE_SOURCEKEEPER} from '../../utilities/Cartographer';
import {ema} from '../../utilities/utils';
import {Directive} from '../Directive';


// Because harvest directives are the most common, they have special shortened memory keys to minimize memory impact
export const enum HARVEST_MEM {
	USAGE    = 'u',
	DOWNTIME = 'd',
}

interface DirectiveHarvestMemory extends FlagMemory {
	[HARVEST_MEM.USAGE]: number;
	[HARVEST_MEM.DOWNTIME]: number;
}

const defaultDirectiveHarvestMemory: DirectiveHarvestMemory = {
	[HARVEST_MEM.USAGE]   : 1,
	[HARVEST_MEM.DOWNTIME]: 0,
};

/**
 * Standard mining directive. Mines from an owned, remote, or source keeper room
 */
@profile
export class DirectiveHarvest extends Directive {

	static directiveName = 'harvest';
	static color = COLOR_YELLOW;
	static secondaryColor = COLOR_YELLOW;

	memory: DirectiveHarvestMemory;
	overlords: {
		mine: MiningOverlord;
	};

	constructor(flag: Flag) {
		super(flag);
		if (this.colony) {
			this.colony.miningSites[this.name] = this;
		}
		_.defaultsDeep(this.memory, defaultDirectiveHarvestMemory);
	}

	spawnMoarOverlords() {
		// Create a mining overlord for this
		let priority = OverlordPriority.ownedRoom.mine;
		if (!(this.room && this.room.my)) {
			priority = Cartographer.roomType(this.pos.roomName) == ROOMTYPE_SOURCEKEEPER ?
					   OverlordPriority.remoteSKRoom.mine : OverlordPriority.remoteRoom.mine;
		}
		this.overlords.mine = new MiningOverlord(this, priority);
	}

	init() {
		const harvestPos = this.overlords.mine.harvestPos ?? this.pos;
		this.colony.destinations.push({pos: harvestPos, order: this.memory[MEM.TICK] || Game.time});
	}

	get energyAvailable() {
		let energy = 0;
		const mine = this.overlords.mine;
		if (!(mine.source instanceof Source)) return energy;
		if (mine.container) {
			energy += mine.container.store.getUsedCapacity(RESOURCE_ENERGY);
		}
		if (mine.link) {
			energy += mine.link.store.getUsedCapacity(RESOURCE_ENERGY);
		}
		const drops = mine.pos.findInRange(FIND_DROPPED_RESOURCES, 1, { filter: RESOURCE_ENERGY });
		energy += drops.reduce((sum, res) => sum += res.amount, 0);
		return energy;
	}

	run() {
		this.computeStats();
	}

	private computeStats() {
		const source = this.overlords.mine.source;
		if (source && source.ticksToRegeneration == 1) {
			this.memory[HARVEST_MEM.USAGE] = (source.energyCapacity - source.energy) / source.energyCapacity;
		}
		const container = this.overlords.mine.container;
		this.memory[HARVEST_MEM.DOWNTIME] = +(ema(container ? +container.isFull : 0,
												  this.memory[HARVEST_MEM.DOWNTIME],
												  CREEP_LIFE_TIME)).toFixed(5);
	}

	visuals(): void {
		if (!(this.memory.debug && Memory.settings.enableVisuals)) return;

		const data = [
			this.name,
			` U: ${this.memory[HARVEST_MEM.USAGE].toPercent()}`,
			` D: ${this.memory[HARVEST_MEM.DOWNTIME].toPercent()}`,
		];
		if (this.memory[MEM.DISTANCE]) {
			data.push(` P: ${this.memory[MEM.DISTANCE][MEM_DISTANCE.WEIGHTED]}`);
		}
		const { x, y, roomName } = this.pos;
		new RoomVisual(roomName).infoBox(data, x, y, { color: '#FFE87B'});
	}
}


