# harvest-npm

Harvest npm packages for offline use.

You can install `harvest-npm` using NPM: `npm i -g @p26e/harvest-npm`, or use the provided docker image (see below).

## Usage

Create a _pinfile_ (e.g. `pinfile.json`) containing the packages you want to download. Each package must have a corresponding semver string, specifying which versions of the package should be downloaded. All versions of a package matching the given semver will be downloaded.

See `harvest-npm --help` for a complete list of options.

## Example

```
alice@computer$ cd /var/www

alice@computer$ echo '{ "react": "^17 || 16.8.6", "better-sqlite3": ">= 7.4.3"  }' > pinfile.json

alice@computer$ harvest-npm
```

```JSON
// pinfile.json
{
	"react": "^17 || 16.8.6",
	"better-sqlite3": ">= 7.4.3"
}
```

## How it works

TL;DR: Every time `harvest-npm` is executed, it will find all versions satisfying the given semver for each package specified in the pinfile. It will only download package versions that hasn't been downloaded before (according to the lockfile). The outputed directory can be served as static files to function as a read-only NPM registry.

The key part of `harvest-npm` is to create a _pinfile_. The pinfile is a JSON file containing packages and corresponding [semver strings](https://semver.org/) (`harvest-npm` uses [this NPM package](https://github.com/npm/node-semver) to resolve matching packages). Let's see an example of a pinfile:

```JSON
{
	"react": "^17 || 16.8.6",
	"better-sqlite3": ">= 7.4.3"
}
```

This pinfile contains two packages that `harvest-npm` should keep track of. The semver string (the value of the key-value style) specifies which versions that should be downloaded. `react`, the first package, wants all version with major version 17, and version 16.8.6. Every time `harvest-npm` is executed, it will find all packages that satisfies that requirement. At the time of writing, this equates to four packages: `17.0.0`, `17.0.1`, `17.0.2` (latest) and `16.8.6`. The second package, `better-sqlite3`, wants all versions (including major versions) greater than or equal to `7.4.3`. At the time of writing `7.4.3` is the latest version, thus only that version would be downloaded.

When package versions are downloaded, all their dependencies (and all their dependencies etc) are also dowloaded. When a package is downloaded its name and version (and other metadata) are written to a lock file (default `lockfile.json`). Before new packages are downloaded, `harvest-npm` will consult this file to see if the spesific version has already been downloaded. If it has, the package will be skipped to save bandwith (and time).

The outputed directory (specified through the `--output-dir` option) can be served over http as static files, and function as a read-only NPM registry. Remember to set the `--base-url` to the URL you are going to serve the registry under (e.g. `https://mydomain.tld/path/to/registry`).

## Docker

We have created a docker image for ease of use. To use the docer image, mount a folder containing the pinfile at `/harvest-npm`. The files will be outputed to a `/harvest-npm/registry` and the script is automatically executed every time the pinfile changes.

Example:
```
alice@computer$ mkdir ~/harvest-npm

alice@computer$ echo '{ "react": ">= 17" }' > ~/harvest-npm/pinfile.json

alice@computer$ docker run -v /home/alice/harvest-npm:/harvest-npm ghcr.io/p26e/harvest-npm:latest
```

The following options are available through environment variables:

<dl>
<dt>PINFILE</dt>
<dd>
Default: <code>'/harvest-npm/pinfile.json'</code>
<br />
Location of the pinfile.
</dd>

<dt>LOCKFILE</dt>
<dd>
Default: <code>'/harvest-npm/lockfile.json'</code>
<br />
Location of the lockfile.
</dd>

<dt>OUTPUT_DIR</dt>
<dd>
Default: <code>'/harvest-npm/registry'</code>
<br />
Direcotry to output packages in.
</dd>

<dt>BASE_URL</dt>
<dd>
Default: <code>'http://registry.local/npm'</code>
<br />
URL where the downloaded packages will be exposed, used when generating metadata for packages. Only needed if you're going to serve the output directory as static files.
</dd>

<dt>ABI</dt>
<dd>
Default: <code>'93,83,72'</code>
<br />
Comma separated list of Node C++ ABI numbers used when downloading pre-built binaries. See the  NODE_MODULE_VERSION column at https://nodejs.org/en/download/releases/.
</dd>

<dt>ARCH</dt>
<dd>
Default: <code>'x64'</code>
<br />
Comma separated list of CPU architectures used when downloading pre-built binaries. Valid options: arm, ia32 and x64.
</dd>

<dt>PLATFORM</dt>
<dd>
Default: <code>'linux,darwin,win32'</code>
<br />
Comma separated list of OS platforms used when downloading pre-built binaries. Valid options: linux, darwin, win32,sunos, freebsd, openbsd, and aix.
</dd>

<dt>REGISTRY</dt>
<dd>
Default: <code>'https://registry.npmjs.org'</code>
<br />
NPM Registry URL to download packages from.
</dd>

<dt>TOKEN</dt>
<dd>
Default: <code>''</code>
<br />
Bearer token for the registry when downloading packages.
</dd>

<dt>SCHEDULE</dt>
<dd>
Default: <code>''</code>
<br />
A cron style scheduled interval when the registry should sync. Example: <code>'0 2 * * *'</code> (every night at 2 AM).
</dd>
</dt>
