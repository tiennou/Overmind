import {log} from '../../console/log';
import {PowerDrillOverlord} from '../../overlords/powerMining/PowerDrill';
import {PowerHaulingOverlord} from '../../overlords/powerMining/PowerHauler';
import {profile} from '../../profiler/decorator';
import {calculateFormationStrength} from '../../utilities/creepUtils';
import {Directive} from '../Directive';


export const PowerMineState = {
	init: 0,
	miningStarted: 1,
	haulingStarted: 2,
	miningDone: 3,
	haulingComplete: 4,
} as const;
type PowerMineState = typeof PowerMineState[keyof typeof PowerMineState];

export function powerMineState(state: PowerMineState) {
	const states = ["init", "mining started", "hauling started", "mining done", "hauling complete"];
	return states[state] ?? `unknown (${state})`;
}

interface DirectivePowerMineMemory extends FlagMemory {
	totalResources?: number;
	state: PowerMineState;
	totalCollected: number;
	expirationTime: number;
}


/**
 * PowerMining directive: kills power banks and collects the resources.
 */
@profile
export class DirectivePowerMine extends Directive {

	static directiveName = 'powerMine';
	static color = COLOR_YELLOW;
	static secondaryColor = COLOR_RED;
	static requiredRCL = 7;
	static maxSpawnDistance = 500;

	private _powerBank: StructurePowerBank | undefined;
	private _drops: { [resourceType: string]: Resource[] };

	memory: DirectivePowerMineMemory;

	constructor(flag: Flag) {
		super(flag, colony => colony.level >= DirectivePowerMine.requiredRCL);
		this._powerBank = this.powerBank;
		this.memory.state = this.memory.state ?? PowerMineState.init;
		this.memory[MEM.EXPIRATION] = this.memory[MEM.EXPIRATION] ||
			Game.time + (this.powerBank ? this.powerBank.ticksToDecay + 1000 : 5500);
		this.memory.totalCollected = this.memory.totalCollected || 0;
	}

	spawnMoarOverlords() {
		if (this.memory.state < PowerMineState.miningDone) {
			this.overlords.powerMine = new PowerDrillOverlord(this);
		}
		if (this.memory.state > PowerMineState.miningStarted) {
			this.overlords.powerHaul = new PowerHaulingOverlord(this);
		}
	}

	get drops(): { [resourceType: string]: Resource[] } {
		if (!this.pos.isVisible) {
			return {};
		}
		if (!this._drops || _.keys(this._drops).length == 0) {
			const drops = this.pos.lookFor(LOOK_RESOURCES);
			this._drops = _.groupBy(drops, drop => drop.resourceType);
		}
		return this._drops;
	}

	get hasDrops(): boolean {
		return _.keys(this.drops).length > 0;
	}

	get powerBank(): StructurePowerBank | undefined {
		if (this.pos.isVisible) {
			this._powerBank = this._powerBank || !!this.flag.room
							  ? this.flag.pos.lookForStructure(STRUCTURE_POWER_BANK)
							  : undefined;
			return this._powerBank;
		}
	}

	/**
	 * Total amount of resources remaining to be transported; cached into memory in case room loses visibility
	 */
	get totalResources() {
		if (this.pos.isVisible) {
			// update total amount remaining
			this.memory.totalResources = this.powerBank ? this.powerBank.power : this.memory.totalResources;
		}
		if (this.memory.totalResources == undefined) {
			return 5000; // pick some non-zero number so that powerMiners will spawn
		}
		return this.memory.totalResources;
	}

	calculateRemainingLifespan() {
		if (!this.room) {
			return undefined;
		} else if (this.powerBank == undefined) {
			return 0;
		} else {
			const tally = calculateFormationStrength(this.powerBank.pos.findInRange(FIND_MY_CREEPS, 4));
			const healStrength: number = tally.heal * HEAL_POWER || 0;
			const attackStrength: number = tally.attack * ATTACK_POWER || 0;
			// PB have 50% hitback, avg damage is attack strength if its enough healing, otherwise healing
			const avgDamagePerTick = Math.min(attackStrength, healStrength * 2);
			return this.powerBank.hits / avgDamagePerTick;
		}
	}


	// TODO FIXME XXX
	manageState() {
		const currentState = this.memory.state;
		log.debug(`Managing state ${currentState} of directive ${this.print} with PB ${this.powerBank}`);
		if (currentState == PowerMineState.init && this.powerBank && this.powerBank.hits < this.powerBank.hitsMax) {
			if (this.powerBank.pos.findInRange(FIND_MY_CREEPS, 3).length == 0
				&& this.powerBank.pos.findInRange(FIND_HOSTILE_CREEPS, 3).length > 0) {
				// Power bank is damage but we didn't mine it
				log.alert(`Power bank mining ${this.print} competing with ${this.powerBank.room.hostiles[0].owner.username}.`);
				// this.remove();
			} else {
				// Set to mining started
				this.memory.state = PowerMineState.miningStarted;
			}
		} else if ((currentState == PowerMineState.init || currentState == PowerMineState.miningStarted) && this.room && (!this.powerBank
																			 || this.powerBank.hits < 500000)) {
			Game.notify('Activating spawning haulers for power mining in room ' + this.pos.roomName);
			log.info('Activating spawning haulers for power mining in room ' + this.pos.roomName);
			this.memory.state = PowerMineState.haulingStarted;
		} else if (currentState == PowerMineState.haulingStarted && this.room && !this.powerBank && (this.hasDrops || this.room.ruins.length == 0)) {
			Game.notify(`Mining is complete for ${this.print} in ${this.room.print} at time ${Game.time}`);
			log.alert(`Mining is complete for ${this.print} in ${this.room.print} at time ${Game.time}`);
			this.memory.state = PowerMineState.miningDone;
			// TODO reassign them to guard the bank
			delete this.overlords.powerMine;
			this._powerBank = undefined; // This might be fluff
		} else if ((currentState == PowerMineState.init || currentState == PowerMineState.miningStarted || currentState == PowerMineState.haulingStarted) && this.room
				   && this.pos.isVisible && !this.powerBank) {
			if (!this.hasDrops && this.room.ruins.length == 0) {
				// TODO this had an error where it triggered incorrectly
				Game.notify(`WE FAILED. SORRY CHIEF, COULDN'T FINISH POWER MINING IN ${this.print} ` +
							`DELETING Directive at time ${Game.time}`);
				log.error(`WE FAILED. SORRY CHIEF, COULDN'T FINISH POWER MINING IN ${this.room} ` +
						  `DELETING Directive at time: ${Game.time}`);
				this.remove();
			} else {
				// If somehow there is no bank but there is drops where bank was
				Game.notify(`Somehow the power bank died early in ${this.room} at state ${currentState}, ` +
							`setting state to 3 ${Game.time}`);
				this.memory.state = PowerMineState.miningDone;
			}
		} else if (currentState == PowerMineState.miningDone && this.room && this.pos.isVisible && !this.hasDrops
				   && this.room.ruins.filter(ruin => !!ruin.store[RESOURCE_POWER]
				   && ruin.store[RESOURCE_POWER]! > 0).length == 0) {
			Game.notify(`Hauler pickup is complete for ${this.print} in ${this.room.print} at time ${Game.time}`);
			// Hauler pickup is now complete
			log.alert(`Hauler pickup is complete for ${this.print} in ${this.room.print} at time ${Game.time}`);
			this.memory.state = PowerMineState.haulingComplete;
			// TODO  Stop spawning haulers
		} else if (currentState == PowerMineState.haulingComplete && this.overlords.powerHaul && (this.overlords.powerHaul as PowerHaulingOverlord)
			.checkIfStillCarryingPower() == undefined) {
			// TODO Doesn't give enough time to pick up power
			log.notify(`Hauling complete for ${this.print} at time ${Game.time}. Final power collected was `
				+ `${this.memory.totalCollected} out of ${this.memory.totalResources}`);
			this.remove();
		} else {
			log.debug(`Power mining ${this.print} is in state ${currentState}`);
			// Todo this isn't error but needs other stuff
		}
	}

	init(): void {
		let alert;
		if (this.pos.room && !!this.powerBank) {
			alert = `PM ${powerMineState(this.memory.state)} ${this.totalResources} P${Math.floor(
				100 * this.powerBank.hits / this.powerBank.hitsMax)}% @ ${this.powerBank.ticksToDecay}TTL`;

		} else {
			alert = `PowerMine ${powerMineState(this.memory.state)} ${this.totalResources}`;
		}
		this.alert(alert);
	}

	run(): void {
		// Check frequently when almost mined and occasionally otherwise
		const frequency = this.memory.state == PowerMineState.haulingStarted ? 1 : 21;
		if (Game.time % frequency == 0) {
			this.manageState();
		}
	}
}

