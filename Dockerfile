FROM node:16-alpine

WORKDIR /harvest-npm

# Define defaults
ENV PINFILE="/harvest-npm/pinfile.json"
ENV LOCKFILE="/harvest-npm/lockfile.json"
ENV OUTPUT_DIR="/harvest-npm/registry"
ENV BASE_URL="http://registry.local/npm"
ENV ABI="93,83,72"
ENV ARCH="x64"
ENV PLATFORM="linux,darwin,win32"
ENV REGISTRY="https://registry.npmjs.org"
ENV TOKEN=""
ENV SCHEDULE=""

RUN npm i -g @p26e/harvest-npm

ENTRYPOINT harvest-npm \
	--pinfile "$PINFILE" \
	--lockfile "$LOCKFILE" \
	--baseUrl "$BASE_URL" \
	--outputDir "$OUTPUT_DIR" \
	--abi ${ABI//,/ --abi } \
	--platform ${PLATFORM//,/ --platform } \
	--arch ${ARCH//,/ --arch } \
	--registry "$REGISTRY" \
	--token "$TOKEN" \
	--schedule "$SCHEDULE" \
	--watch
