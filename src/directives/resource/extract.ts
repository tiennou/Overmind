import { log } from "../../console/log";
import { ExtractorOverlord } from "../../overlords/mining/extractor";
import { OverlordPriority } from "../../priorities/priorities_overlords";
import { profile } from "../../profiler/decorator";
import { Directive } from "../Directive";

/**
 * Mineral extraction directive. Spawns extraction creeps to operate extractors in owned or source keeper rooms
 */
@profile
export class DirectiveExtract extends Directive {
	static directiveName = "extract";
	static color = COLOR_YELLOW;
	static secondaryColor = COLOR_CYAN;

	overlords: {
		extract: ExtractorOverlord;
	};

	constructor(flag: Flag) {
		super(flag);
		this.colony.markDestination(
			this.pos,
			this.memory[MEM.TICK] ?? Game.time
		);
	}

	spawnMoarOverlords() {
		let priority: number;
		if (this.room && this.room.my) {
			if (this.colony.level == 8) {
				priority = OverlordPriority.ownedRoom.mineralRCL8;
			} else {
				priority = OverlordPriority.ownedRoom.mineral;
			}
		} else {
			priority = OverlordPriority.remoteSKRoom.mineral;
		}
		this.overlords.extract = new ExtractorOverlord(this, priority);
	}

	init() {}

	run() {
		if (this.colony.level < 6) {
			log.notify(
				`Removing extraction directive in ${this.pos.roomName}: room RCL insufficient.`
			);
			this.remove();
		} else if (!this.colony.terminal) {
			log.notify(
				`Removing extraction directive in ${this.pos.roomName}: room is missing terminal.`
			);
			this.remove();
		}
	}

	visuals(): void {
		if (!(this.memory.debug && Memory.settings.enableVisuals)) {
			return;
		}

		const extract = this.overlords.extract;
		const data = [this.name];
		if (extract.container) {
			const store = extract.container.store;
			data.push(` S: ${store.getUsedCapacity()}/${store.getCapacity()}`);
		}
		if (extract.extractor) {
			data.push(
				` C: ${this.overlords.extract.extractor?.cooldown} ticks`
			);
		}
		if (extract.mineral?.mineralAmount) {
			data.push(
				` R: ${extract.mineral.mineralAmount} ${extract.mineral.mineralType}`
			);
		} else {
			data.push(` R: ${extract.mineral?.ticksToRegeneration} ticks`);
		}
		const { x, y, roomName } = this.pos;
		new RoomVisual(roomName).infoBox(data, x, y, { color: "#7acf9c" });
	}
}
