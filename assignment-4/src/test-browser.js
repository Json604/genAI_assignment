import "dotenv/config";
import { BrowserSession } from "./browser/session.js";

async function main() {
  const session = new BrowserSession();
  try {
    const nav = await session.navigate("https://example.com");
    console.log("Navigate OK:", nav.url, nav.element_count, "elements");
    console.log(nav.snapshot.split("\n").slice(0, 15).join("\n"));
  } finally {
    await session.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});