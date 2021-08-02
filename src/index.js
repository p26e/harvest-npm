import fs from "fs";
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
	const tempDir = fs.mkdtempSync(`.tmp_${pkg}_`);
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

export function updateLockfile(filepath, newPackages) {
	const lockfile = JSON.parse(fs.readFileSync(filepath));

	for (const [pkg, versions] of Object.entries(newPackages)) {
		const existing = lockfile[pkg] || [];
		lockfile[pkg] = Array.from(new Set([...existing, ...versions]));
	}

	fs.writeFileSync(filepath, JSON.stringify(lockfile, null, 2));
}

export async function locateNewPackages(
	pinfilePath,
	lockfilePath,
	registry = "https://registry.npmjs.org",
	token
) {
	if (!fs.existsSync(lockfilePath)) {
		fs.writeFileSync(lockfilePath, "{}");
	}

	const pkgs = JSON.parse(fs.readFileSync(pinfilePath));
	const lockfile = JSON.parse(fs.readFileSync(lockfilePath));
	const newPackages = {};

	for (const [pkg, versionRange] of Object.entries(pkgs)) {
		const versions = await getVersions(pkg, versionRange, registry, token);
		if (!versions || versions.length === 0) return;
		const existingVersions = new Set(lockfile[pkg] || []);
		newPackages[pkg] = versions.filter((v) => !existingVersions.has(v));
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
