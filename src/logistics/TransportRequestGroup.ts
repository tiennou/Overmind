// A stripped-down version of the logistics network intended for local deliveries

import { log } from "console/log";
import {
	blankPriorityQueue,
	Priority,
	priorityToString,
} from "../priorities/priorities";
import { profile } from "../profiler/decorator";

// export type TransportRequestTarget =
// 	StructureContainer
// 	| StructureExtension
// 	| StructureFactory
// 	| StructureLab
// 	| StructureLink
// 	| StructureNuker
// 	| StructurePowerSpawn
// 	| StructureSpawn
// 	| StructureStorage
// 	| StructureTerminal
// 	| StructureTower
// 	| Ruin
// 	| Tombstone;

export type TransportRequestTarget = TransferrableStoreStructure;

export interface TransportRequest {
	target: TransportRequestTarget;
	amount: number;
	resourceType: ResourceConstant;
	priority: Priority;
}

interface TransportRequestOptions {
	amount?: number;
	resourceType?: ResourceConstant;
}

/**
 * Transport request groups handle close-range prioritized resource requests, in contrast to the logistics network,
 * which handles longer-ranged requests
 */
@profile
export class TransportRequestGroup {
	static logRequest(request: TransportRequest | undefined) {
		if (!request) {
			return `not a request`;
		}
		return `${request.amount} of ${request.resourceType} in ${
			request.target.print
		} at ${priorityToString(request.priority)} priority`;
	}

	name: string;
	supply: { [priority: number]: TransportRequest[] };
	withdraw: { [priority: number]: TransportRequest[] };
	supplyByID: { [id: string]: TransportRequest[] };
	withdrawByID: { [id: string]: TransportRequest[] };

	constructor(name: string) {
		this.name = name;
		this.refresh();
	}

	refresh(): void {
		this.supply = blankPriorityQueue();
		this.withdraw = blankPriorityQueue();
		this.supplyByID = {};
		this.withdrawByID = {};
	}

	needsSupplying(priorityThreshold?: Priority): boolean {
		for (const priority in this.supply) {
			if (
				priorityThreshold != undefined &&
				<Priority>parseInt(priority, 10) > priorityThreshold
			) {
				continue; // lower numerical priority values are more important; if priority > threshold then ignore it
			}
			if (this.supply[priority].length > 0) {
				return true;
			}
		}
		return false;
	}

	needsWithdrawing(priorityThreshold?: Priority): boolean {
		for (const priority in this.withdraw) {
			if (
				priorityThreshold != undefined &&
				<Priority>parseInt(priority, 10) > priorityThreshold
			) {
				continue; // lower numerical priority values are more important; if priority > threshold then ignore it
			}
			if (this.withdraw[priority].length > 0) {
				return true;
			}
		}
		return false;
	}

	getPrioritizedClosestRequest(
		pos: RoomPosition,
		type: "supply" | "withdraw",
		filter?: (requst: TransportRequest) => boolean
	): TransportRequest | undefined {
		const requests = type == "withdraw" ? this.withdraw : this.supply;
		for (const priority in requests) {
			const targets = _.map(
				requests[priority],
				(request) => request.target
			);
			const target = pos.findClosestByRangeThenPath(targets);
			if (target) {
				const searchRequests =
					filter ?
						_.filter(requests[priority], (req) => filter(req))
					:	requests[priority];
				const request = _.find(
					searchRequests,
					(request) => request.target.ref == target.ref
				);
				// If this isn't a specific search, we don't fall through to lower priorities
				if (!filter || request) {
					return request;
				}
			}
		}
	}

	private isTargetValid(target: TransportRequestTarget) {
		if (target.pos.availableNeighbors(true).length === 0) {
			return false;
		}
		return true;
	}

	/**
	 * Request for resources to be deposited into this target
	 */
	requestInput(
		target: TransportRequestTarget,
		priority = Priority.Normal,
		opts: TransportRequestOptions = {}
	): void {
		_.defaults(opts, {
			resourceType: RESOURCE_ENERGY,
		});
		if (!this.isTargetValid(target)) {
			log.warning(
				`Transport request error: target input ${target.print} is invalid`
			);
			return;
		}
		opts.amount ??= this.getInputAmount(target, opts.resourceType!);
		// Register the request
		const req: TransportRequest = {
			target: target,
			resourceType: opts.resourceType!,
			amount: opts.amount,
			priority: priority,
		};
		if (opts.amount > 0) {
			this.supply[priority].push(req);
			this.supplyByID[target.id] ??= [];
			this.supplyByID[target.id].push(req);
		}
	}

	/**
	 * Request for resources to be withdrawn from this target
	 */
	requestOutput(
		target: TransportRequestTarget,
		priority = Priority.Normal,
		opts: TransportRequestOptions = {}
	): void {
		_.defaults(opts, {
			resourceType: RESOURCE_ENERGY,
		});
		if (!this.isTargetValid(target)) {
			log.warning(
				`Transport request error: target output ${target.print} is invalid`
			);
			return;
		}
		opts.amount ??= this.getOutputAmount(target, opts.resourceType!);
		// Register the request
		const req: TransportRequest = {
			target: target,
			resourceType: opts.resourceType!,
			amount: opts.amount,
			priority: priority,
		};
		if (opts.amount > 0) {
			this.withdraw[priority].push(req);
			this.withdrawByID[target.id] ??= [];
			this.withdrawByID[target.id].push(req);
		}
	}

	// /* Makes a provide for every resourceType in a requestor object */
	// requestOutputAll(target: StoreStructure,
	//	priority = Priority.Normal, opts = {} as TransportRequestOptions): void {
	// 	for (let resourceType in target.store) {
	// 		let amount = target.store[<ResourceConstant>resourceType] || 0;
	// 		if (amount > 0) {
	// 			opts.resourceType = <ResourceConstant>resourceType;
	// 			this.requestOutput(target, priority, opts);
	// 		}
	// 	}
	// }

	private getInputAmount(
		target: TransportRequestTarget,
		resourceType: ResourceConstant
	): number {
		return target.store.getFreeCapacity(resourceType) || 0;
	}

	private getOutputAmount(
		target: TransportRequestTarget,
		resourceType: ResourceConstant
	): number {
		return target.store.getUsedCapacity(resourceType) || 0;
	}

	/**
	 * Summarize the state of the transport request group to the console; useful for debugging.
	 */
	summarize(ignoreEnergy = false): void {
		console.log(`TransportRequestGroup #${this.name}`);
		console.log(`Supply requests ==========================`);
		for (const priority in this.supply) {
			if (this.supply[priority].length > 0) {
				console.log(
					`Priority: ${priorityToString(
						<Priority>(<unknown>priority)
					)}`
				);
			}
			for (const request of this.supply[priority]) {
				if (ignoreEnergy && request.resourceType == RESOURCE_ENERGY) {
					continue;
				}
				console.log(
					`    target: ${request.target.structureType}@${request.target.pos.print} ` +
						`(${request.target.ref})  ` +
						`amount: ${request.amount}  ` +
						`resourceType: ${request.resourceType}`
				);
			}
		}
		console.log(`Withdraw requests ========================`);
		for (const priority in this.withdraw) {
			if (this.withdraw[priority].length > 0) {
				console.log(
					`Priority: ${priorityToString(
						<Priority>(<unknown>priority)
					)}`
				);
			}
			for (const request of this.withdraw[priority]) {
				if (ignoreEnergy && request.resourceType == RESOURCE_ENERGY) {
					continue;
				}
				console.log(
					`    target: ${request.target.structureType}@${request.target.pos.print} ` +
						`(${request.target.ref})  ` +
						`amount: ${request.amount}  ` +
						`resourceType: ${request.resourceType}`
				);
			}
		}
	}
}
