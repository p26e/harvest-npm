FROM node:16-alpine

# Define defaults
ENV PINFILE="/registry/pinfile.json"
ENV LOCKFILE="/registry/lockfile.json"
ENV CACHEFILE="/registry/cachefile.json"
ENV OUTPUT_DIR="/registry"
ENV ABI="93,83,72"
ENV ARCH="x64"
ENV PLATFORM="linux,darwin,win32"
ENV REGISTRY="https://registry.npmjs.org"
ENV TOKEN=""
ENV SCHEDULE=""

RUN npm i -g @p26e/harvest-npm

ENTRYPOINT harvest-npm \
	--pinfile $PINFILE \
	--lockfile $LOCKFILE \
	--cachefile $CACHEFILE \
	--baseUrl $BASE_URL \
	--outputDir $OUTPUT_DIR \
	--abi ${ABI//,/ --abi } \
	--platform ${PLATFORM//,/ --platform } \
	--arch ${ARCH//,/ --arch } \
	--registry $REGISTRY \
	--token $TOKEN \
	--schedule $SCHEDULE \
	--watch
