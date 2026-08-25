const {spawnSync} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectDirectory = path.resolve(__dirname, "..");
const outputDirectory = process.env.FOLDERROCKET_RELEASE_DIR
    ? path.resolve(process.env.FOLDERROCKET_RELEASE_DIR)
    : path.join(process.env.LOCALAPPDATA || os.tmpdir(), "FolderRocket", "releases");
const builderCli = path.join(projectDirectory, "node_modules", "electron-builder", "cli.js");

fs.mkdirSync(outputDirectory, {recursive: true});

const result = spawnSync(
    process.execPath,
    [builderCli, "--win", "nsis", `--config.directories.output=${outputDirectory}`],
    {cwd: projectDirectory, stdio: "inherit", shell: false}
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`\nFolderRocket installer created in: ${outputDirectory}`);
