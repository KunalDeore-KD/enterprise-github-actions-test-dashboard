import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixturesDir = path.resolve(__dirname, "..", "fixtures");

function fileUrl(relativePath: string): string {
  return pathToFileURL(path.join(fixturesDir, relativePath)).toString();
}

export const PRACTICE_PAGE_URL = process.env.PRACTICE_PAGE_URL ?? fileUrl("angularpractice.html");
export const TODO_URL = process.env.TODO_URL ?? fileUrl("todomvc-react.html");