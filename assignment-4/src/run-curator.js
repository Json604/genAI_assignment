import "dotenv/config";
import { getSkillStore } from "./skills/store.js";
import { runCuratorIfDue } from "./skills/curator.js";

await getSkillStore();
const archived = await runCuratorIfDue();
console.log(archived?.length ? `Archived: ${archived.join(", ")}` : "Curator: nothing to archive (or not due yet)");