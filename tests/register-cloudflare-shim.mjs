import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./cloudflare-hooks.mjs", pathToFileURL("./tests/"));
