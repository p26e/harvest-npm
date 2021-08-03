import fs from "fs";
import os from "os";
import path from "path";
import pacote from "pacote";
import semver from "semver";
import Arborist from "@npmcli/arborist";
import { downloadAll } from "registry-sync/src/download.js";
import {
	dependenciesFromPackageLock,
	dependenciesNotInCache,
	updateDependenciesCache,
} from "registry-sync/src/resolve.js";

export const logger = {
	info(text) {
		console.info(`${new Date().toISOString()} [INFO]: ${text}`);
	},
	warn(text) {
		console.warn(`${new Date().toISOString()} [WARN]: ${text}`);
	},
	error(text) {
		console.error(`${new Date().toISOString()} [ERROR]: ${text}`);
	},
};

async function getVersions(packageName, versionRange, registry, token) {
	const packument = await pacote.packument(packageName, {
		registry,
		token,
	});

	return Object.keys(packument.versions).filter((v) =>
		semver.satisfies(v, versionRange)
	);
}

export async function generateManifest(
	pkg,
	registry = "https://registry.npmjs.org",
	token = undefined
) {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${pkg}_`));
	try {
		const arb = new Arborist({ path: tempDir, registry, token });
		await arb.buildIdealTree({ add: [pkg] });
		await arb.reify();
	} catch (e) {
		// Cleanup
		fs.rmSync(tempDir, { recursive: true, force: true });
		throw e;
	}
	return tempDir;
}

export async function locateNewPackages(
	pinfilePath,
	lockfilePath,
	registry = "https://registry.npmjs.org",
	token
) {
	let lockfile = { dependencies: [] };

	if (fs.existsSync(lockfilePath)) {
		lockfile = JSON.parse(fs.readFileSync(lockfilePath));
	}

	const pkgs = JSON.parse(fs.readFileSync(pinfilePath));
	const cache = new Set(lockfile.dependencies.map((dep) => dep.id));
	const newPackages = {};

	for (const [pkg, versionRange] of Object.entries(pkgs)) {
		const versions = await getVersions(pkg, versionRange, registry, token);
		if (!versions || versions.length === 0) {
			logger.warn(
				`Cannot find any versions for package '${pkg}' that satisfies '${versionRange}'.`
			);
			continue;
		}
		versions.forEach((version) => {
			if (!cache.has(`${pkg}@${version}`)) {
				newPackages[pkg] = [...(newPackages[pkg] || []), version];
			}
		});
	}

	return newPackages;
}

export async function downloadPackages(cacheFilePath, options) {
	// https://github.com/heikkipora/registry-sync/blob/23bd61b2b764bd8834c00560e212e3b5217eafd9/src/sync.ts

	const packages = await dependenciesFromPackageLock(
		options.manifest,
		options.includeDevDependencies
	);
	const newPackages = await dependenciesNotInCache(
		packages,
		cacheFilePath,
		options.prebuiltBinaryProperties
	);

	await downloadAll(newPackages, options);
	await updateDependenciesCache(
		newPackages,
		cacheFilePath,
		options.prebuiltBinaryProperties
	);

	return newPackages;
}

export function createPrebuildBinaryProperties(abis, archs, platforms) {
	return abis
		.map((abi) =>
			archs
				.map((arch) => platforms.map((platform) => ({ abi, arch, platform })))
				.flat()
		)
		.flat();
}
