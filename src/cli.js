#!/usr/bin/env node

import path from "path";
import fs from "fs";
import meow from "meow";
import md5 from "md5";
import cron from "node-cron";
import { lock } from "proper-lockfile";
import {
	locateNewPackages,
	generateManifest,
	createPrebuildBinaryProperties,
	downloadPackages,
	logger,
} from "./index.js";

const cli = meow(
	`
  Usage
    $ harvest-npm [options]

  Options
    --pinfile     Location of the pinfile. Default: pinfile.json.
    --lockfile    Location of the lockfile. Default: lockfile.json.
    --outputDir   Direcotry to output packages in. Default: packages.
    --baseUrl     URL where the downloaded packages will be exposed, used when
                  generating metadata for packages. Only needed if you're going
									to serve the output directory as static files. Default:
									http://registry.npmjs.local/packages
    --abi         Node C++ ABI numbers used when downloading pre-built binaries.
                  Can be specified multiple times. See the  NODE_MODULE_VERSION
                  column at https://nodejs.org/en/download/releases/. Default:
                  93, 83 and 72.
    --arch        CPU architectures used when downloading pre-built binaries.
                  Can be specified multiple times. Valid options: arm, ia32 and
                  x64. Default: x64.
    --platform    OS platforms used when downloading pre-built binaries. Can be
                  specified multiple times. Valid options: linux, darwin, win32,
                  sunos, freebsd, openbsd, and aix. Default: linux, darwin and
                  win32.
    --registry    NPM Registry URL to download packages from. Default:
                  https://registry.npmjs.org
    --token       Optional Bearer token for the registry.
    --watch       Run every time the pinfile changes after the inital execution.
    --schedule    A cron style scheduled interval when the registry should sync.
                  Example: '0 2 * * *' (every night at 2 AM).
`,
	{
		importMeta: import.meta,
		flags: {
			pinfile: {
				type: "string",
				default: "pinfile.json",
			},
			lockfile: {
				type: "string",
				default: "lockfile.json",
			},
			outputDir: {
				type: "string",
				default: "packages",
			},
			baseUrl: {
				type: "string",
				default: "http://registry.npmjs.local/packages",
			},
			abi: {
				type: "number",
				isMultiple: true,
				default: [72, 83, 93],
			},
			arch: {
				type: "string",
				isMultiple: true,
				default: ["x64"],
			},
			platform: {
				type: "string",
				isMultiple: true,
				default: ["linux", "darwin", "win32"],
			},
			registry: {
				type: "string",
				default: "https://registry.npmjs.org",
			},
			token: {
				type: "string",
			},
			watch: {
				type: "boolean",
				default: false,
			},
			schedule: {
				type: "string",
			},
		},
	}
);

async function harvest() {
	logger.info("Looking for packages.");

	const newPackages = await locateNewPackages(
		cli.flags.pinfile,
		cli.flags.lockfile,
		cli.flags.registry,
		cli.flags.token
	);

	const pkgVersions = Object.entries(newPackages).flatMap(([pkg, versions]) =>
		versions.map((version) => `${pkg}@${version}`)
	);

	const numPackages = pkgVersions.length;

	logger.info(`Found ${numPackages} new packages.`);

	for (let i = 0; i < numPackages; i++) {
		logger.info(`Processing ${pkgVersions[i]} (${i + 1}/${numPackages}).`);
		let manifestDir = undefined;
		try {
			logger.info("Resolving dependencies.");
			manifestDir = await generateManifest(
				pkgVersions[i],
				cli.flags.registry,
				cli.flags.token
			);
			try {
				logger.info("Downloading packages.");
				await downloadPackages(cli.flags.lockfile, {
					manifest: path.join(manifestDir, "package-lock.json"),
					rootFolder: cli.flags.outputDir,
					localUrl: new URL(cli.flags.baseUrl),
					registryUrl: cli.flags.registry,
					registryToken: cli.flags.token,
					prebuiltBinaryProperties: createPrebuildBinaryProperties(
						cli.flags.abi,
						cli.flags.arch,
						cli.flags.platform
					),
				});
			} catch (e) {
				logger.warn(
					`Failed to download packages. Reason: ${e.message || "Unknown"}`
				);
				logger.info(`Raw error:\n${JSON.stringify(e)}`);
				logger.warn(`Skipping ${pkgVersions[i]}.`);
			}
		} catch (e) {
			logger.warn(
				`Failed to resolve dependencies. Reason: ${e.message || "Unknown"}`
			);
			logger.info(`Raw error:\n${JSON.stringify(e)}`);
			logger.warn(`Skipping ${pkgVersions[i]}.`);
		}
		if (manifestDir) {
			fs.rmSync(manifestDir, { recursive: true, force: true });
		}
	}

	logger.info("Done.");
}

async function run() {
	await lock(cli.flags.pinfile)
		.then(async (release) => {
			await harvest().finally(release);
		})
		.catch((e) => {
			switch (e.code) {
				case "ENOENT":
					logger.error(`No such file or directory: ${e.path}`);
					break;
				case "ELOCKED":
					logger.error(
						`Pinfile (${e.file}) seems to be locked. Already running?`
					);
					break;
				default:
					logger.error(e.message || "Unknown error");
					logger.info(`Raw error:\n${JSON.stringify(e)}`);
			}
		});
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

run().then(async () => {
	let inProgress = false;

	if (cli.flags.schedule) {
		if (!cron.validate(cli.flags.schedule)) {
			logger.error(
				`"${cli.flags.schedule}" is not recognized as valid cron syntax.`
			);
		} else {
			cron.schedule(cli.flags.schedule, async () => {
				if (inProgress) return;
				inProgress = true;
				logger.info(`Triggered by schedule (${cli.flags.schedule}).`);
				await run()
					.catch((e) => {
						logger.error(
							`Something went wrong. Error:\n${JSON.stringify(e, null, 2)}`
						);
					})
					.finally(() => {
						inProgress = false;
					});
			});
		}
	}

	if (cli.flags.watch) {
		logger.info(`Watching pinfile (${cli.flags.pinfile})`);
		let checksum = md5(fs.readFileSync(cli.flags.pinfile));
		while (true) {
			const currentChecksum = md5(fs.readFileSync(cli.flags.pinfile));
			if (checksum !== currentChecksum) {
				logger.info(`Triggered by watch (${cli.flags.pinfile})`);
				await run();
				checksum = currentChecksum;
			}
			await delay(1000 * 10); // sleep 10 seconds
		}
	}
});
