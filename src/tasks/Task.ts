/**
 * Creep tasks setup instructions
 *
 * Javascript:
 * 1. In main.js:   require("tasks/prototypes.js");
 * 2. As needed:    var Tasks = require("<path to Tasks.js>");
 *
 * Typescript:
 * 1. In main.ts:   import "./tasks/prototypes";
 * 2. As needed:    import {Tasks} from "<path to Tasks.ts>"
 *
 * If you use Travler, change all occurrences of creep.moveTo() to creep.goTo()
 */

import { MoveOptions, ZergMoveReturnCode } from "movement/types";
import { log } from "../console/log";
import { profile } from "../profiler/decorator";
import type { AnyZerg } from "zerg/AnyZerg";
import { initializeTask } from "./initializer";
import { deref, derefRoomPosition } from "utilities/utils";
import { errorForCode, OvermindReturnCode } from "utilities/errors";
import type { ProtoTask, TaskData, TaskOptions, TaskSettings } from "./types";

interface AbstractTaskTarget {
	ref: string; // Target id or name
	_pos: ProtoPos; // Target position's coordinates in case vision is lost
}

export type ConcreteTaskTarget = HasRef | _HasRoomPosition | RoomPosition;

function isAbstractTarget(target: any): target is AbstractTaskTarget {
	return !!target && (<AbstractTaskTarget>target)._pos !== undefined;
}

function isRoomRefTarget(target: any): target is HasRef & _HasRoomPosition {
	return !!target && (<HasRef>target).ref !== undefined;
}

function isRoomObjectTarget(target: any): target is RoomObject {
	return !!target && (<RoomObject>target).pos !== undefined;
}

export type GenericTask = Task<AnyZerg, any>;
// export type GenericTask<Z extends AnyZerg = AnyZerg, T extends ConcreteTaskTarget = ConcreteTaskTarget> = Task<Z, T>

/**
 * An abstract class for encapsulating creep actions. This generalizes the concept of "do action X to thing Y until
 * condition Z is met" and saves a lot of convoluted and duplicated code in creep logic. A Task object contains
 * the necessary logic for traveling to a target, performing a task, and realizing when a task is no longer sensible
 * to continue.
 */
@profile
export abstract class Task<
	CreepClass extends AnyZerg,
	TargetType extends ConcreteTaskTarget | null,
> {
	static taskName: string;

	/** Name of the task type, e.g. 'upgrade' */
	name: string;
	/** Data for the creep the task is assigned to */
	_creep: {
		name: string;
	};
	/** Data for the target the task is directed to */
	_target: AbstractTaskTarget;
	/** The parent of this task, if any. Task is changed to parent upon completion. */
	_parent: ProtoTask | null;
	/** When the task was set */
	tick: number;
	/** Settings for a given type of task; shouldn't be modified on an instance-basis */
	settings: TaskSettings;
	/** Options for a specific instance of a task */
	options: TaskOptions;
	/** Data pertaining to a given instance of a task */
	data: TaskData;

	private _targetPos: RoomPosition;

	constructor(
		taskName: string,
		target: TargetType | AbstractTaskTarget,
		options: TaskOptions = {}
	) {
		// Parameters for the task
		this.name = taskName;
		this._creep = {
			name: "",
		};
		// Handles edge cases like when you're done building something and target disappears
		if (target instanceof RoomPosition) {
			this._target = {
				ref: "",
				_pos: { x: target.x, y: target.y, roomName: target.room!.name },
			};
		} else if (isAbstractTarget(target)) {
			this._target = {
				ref: target.ref,
				_pos: target._pos,
			};
		} else if (isRoomRefTarget(target)) {
			this._target = {
				ref: target.ref,
				_pos: target.pos,
			};
		} else if (isRoomObjectTarget(target)) {
			this._target = {
				ref: "",
				_pos: target.pos,
			};
		} else {
			this._target = {
				ref: "",
				_pos: {
					x: -1,
					y: -1,
					roomName: "",
				},
			};
		}
		// log.debug(`creating task ${this.constructor.name}, ${taskName}, target: ${target}, ${print(this._target)}`);
		this._parent = null;
		this.settings = {
			targetRange: 1,
			workOffRoad: false,
			oneShot: false,
			timeout: Infinity,
			blind: true,
		};
		this.tick = Game.time;
		this.options = options;
		this.data = {};
	}

	/**
	 * Get a serialized ProtoTask from the current task
	 */
	get proto(): ProtoTask {
		return {
			name: this.name,
			_creep: this._creep,
			_target: this._target,
			_parent: this._parent,
			tick: this.tick,
			options: this.options,
			data: this.data,
		};
	}

	/**
	 * Set the current task from a serialized ProtoTask
	 */
	set proto(protoTask: ProtoTask) {
		// Don't write to this.name; used in task switcher
		this._creep = protoTask._creep;
		this._target = protoTask._target;
		this._parent = protoTask._parent;
		this.tick = protoTask.tick;
		this.options = protoTask.options;
		this.data = protoTask.data;
	}

	/**
	 * Return the wrapped creep which is executing this task
	 */
	get creep(): CreepClass {
		// Get task's own creep by its name
		// Returns zerg wrapper instead of creep to use monkey-patched functions
		// @ts-expect-error type substitution galore
		return (
			Overmind.zerg[this._creep.name] ||
			Overmind.powerZerg[this._creep.name]
		);
	}

	/**
	 * Set the creep which is executing this task
	 */
	set creep(creep: CreepClass) {
		this._creep.name = creep.name;
		if (this._parent) {
			this.parent!.creep = creep;
		}
	}

	/**
	 * Dereferences the Task's target
	 */
	get target(): TargetType {
		return deref(this._target.ref) as TargetType;
	}

	/**
	 * Dereferences the saved target position; useful for situations where you might lose vision
	 */
	get targetPos(): RoomPosition {
		// refresh if you have visibility of the target
		if (!this._targetPos) {
			if (this.target) {
				this._target._pos = (this.target as _HasRoomPosition).pos;
			}
			this._targetPos = derefRoomPosition(this._target._pos);
		}
		return this._targetPos;
	}

	/**
	 * Get the Task's parent
	 */
	get parent(): GenericTask | null {
		return this._parent ? initializeTask(this._parent) : null;
	}

	/**
	 * Set the Task's parent
	 */
	set parent(parentTask: GenericTask | null) {
		this._parent = parentTask ? parentTask.proto : null;
		// If the task is already assigned to a creep, update their memory
		if (this.creep) {
			this.creep.task = this;
		}
	}

	/**
	 * Return a list of [this, this.parent, this.parent.parent, ...] as tasks
	 */
	get manifest(): GenericTask[] {
		const manifest: GenericTask[] = [this];
		let parent = this.parent;
		while (parent) {
			manifest.push(parent);
			parent = parent.parent;
		}
		return manifest;
	}

	/**
	 * Return a list of [this.target, this.parent.target, ...] without fully instantiating the list of tasks
	 */
	get targetManifest(): (RoomObject | null)[] {
		const targetRefs: string[] = [this._target.ref];
		let parent = this._parent;
		while (parent) {
			targetRefs.push(parent._target.ref);
			parent = parent._parent;
		}
		return _.map(targetRefs, (ref) => deref(ref));
	}

	/**
	 * Return a list of [this.targetPos, this.parent.targetPos, ...] without fully instantiating the list of tasks
	 */
	get targetPosManifest(): RoomPosition[] {
		const targetPositions: ProtoPos[] = [this._target._pos];
		let parent = this._parent;
		while (parent) {
			targetPositions.push(parent._target._pos);
			parent = parent._parent;
		}
		return _.map(targetPositions, (protoPos) =>
			derefRoomPosition(protoPos)
		);
	}

	/**
	 * Fork the task, assigning a new task to the creep with this task as its parent
	 */
	fork<T extends CreepClass>(newTask: Task<T, any>): Task<T, any> {
		newTask.parent = this;
		if (this.creep) {
			this.creep.task = newTask;
		}
		return newTask;
	}

	/**
	 * Test every tick to see if task is still valid
	 */
	abstract isValidTask(): boolean;

	/**
	 * Test every tick to see if target is still valid
	 */
	abstract isValidTarget(): boolean;

	/**
	 * Test if the task is valid; if it is not, automatically remove task and transition to parent
	 */
	isValid(): boolean {
		let validTask = false;
		if (this.creep) {
			validTask =
				this.isValidTask() &&
				Game.time - this.tick < this.settings.timeout;
		}
		let validTarget = false;
		if (this.target) {
			validTarget = this.isValidTarget();
		} else if (
			(this.settings.blind || this.options.blind) &&
			!Game.rooms[this.targetPos.roomName]
		) {
			// If you can't see the target's room but you have blind enabled, then that's okay
			validTarget = true;
		}
		// Return if the task is valid; if not, finalize/delete the task and return false
		if (validTask && validTarget) {
			return true;
		} else {
			// Switch to parent task if there is one
			this.finish();
			const isValid = this.parent ? this.parent.isValid() : false;
			return isValid;
		}
	}

	/**
	 * Move to within range of the target
	 */
	moveToTarget(range = this.settings.targetRange) {
		const moveOpts: MoveOptions = _.defaultsDeep(this.options.moveOptions, {
			range: range,
		});
		return this.creep.goTo(this.targetPos, moveOpts);
	}

	/**
	 * Moves to the next position on the agenda if specified - call this in some tasks after work() is completed
	 */
	moveToNextPos() {
		if (this.data.nextPos) {
			const nextPos = derefRoomPosition(this.data.nextPos);
			return this.creep.goTo(nextPos);
		}
		return ERR_NO_PATH;
	}

	/**
	 * Return expected number of ticks until creep arrives at its first destination
	 */
	get eta(): number | undefined {
		if (this.creep && this.creep.memory._go && this.creep.memory._go.path) {
			return this.creep.memory._go.path.length;
		}
	}

	/**
	 * Execute this task each tick. Returns nothing unless work is done.
	 */
	run(): OvermindReturnCode {
		if (this.isWorking) {
			delete this.creep.memory._go;
			// if (this.settings.workOffRoad) { // this is disabled as movement priorities makes it unnecessary
			// 	// Move to somewhere nearby that isn't on a road
			// 	this.creep.park(this.targetPos, true);
			// }
			const result = this.work();
			if (this.settings.oneShot && result === OK) {
				this.finish();
			}
			return result;
		} else {
			const result = this.moveToTarget();
			if (result !== OK && result !== ERR_TIRED) {
				log.debugCreep(
					this.creep,
					`failed to move to target: ${errorForCode(result)}`
				);
			}
			return result;
		}
	}

	/**
	 * Return whether the creep is currently performing its task action near the target
	 */
	get isWorking(): boolean {
		return (
			this.creep.pos.inRangeToPos(
				this.targetPos,
				this.settings.targetRange
			) && !this.creep.pos.isEdge
		);
	}

	/**
	 * Task to perform when at the target
	 */
	abstract work(): ZergMoveReturnCode | ScreepsReturnCode;

	/**
	 * Finalize the task and switch to parent task (or null if there is none)
	 */
	finish(): void {
		this.moveToNextPos();
		if (this.creep) {
			this.creep.task = this.parent;
		} else {
			log.debug(
				`No creep executing ${this.name}! Proto: ${JSON.stringify(
					this.proto
				)}`
			);
		}
	}
}
